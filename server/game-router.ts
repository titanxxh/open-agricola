import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game/authoritative-session.ts'
import { serializeState } from '../shared/game/serialization.ts'
import { normalizePlayerFarm } from '../shared/logic/farm/fence-validation.ts'
import { applyFarmChoice } from '../shared/logic/farm/farm-choice.ts'
import { getDb } from './db.ts'
import { validateSession, extractToken } from './auth.ts'
import type { CustomCardData } from '../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../shared/custom-code/types.ts'
import { defaultSandboxDeckIds, defaultSandboxPlayerNames } from '../shared/logic/state.ts'

/**
 * Per-user HTTP game sessions, keyed by user ID.
 * 'anonymous' is the fallback for unauthenticated requests (dev mode).
 * This prevents multiple logged-in users from sharing a single game state.
 */
const userSessions = new Map<string, GameSession>()
const sessionLastAccess = new Map<string, number>()
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Periodically clean up idle sessions
setInterval(() => {
  const now = Date.now()
  for (const [key, lastAccess] of sessionLastAccess) {
    if (now - lastAccess > SESSION_TTL_MS) {
      const session = userSessions.get(key)
      session?.dispose()
      userSessions.delete(key)
      sessionLastAccess.delete(key)
    }
  }
}, 60_000)

const getSessionKey = (req: IncomingMessage): string => {
  const user = validateSession(extractToken(req.headers.authorization))
  return user?.id ?? 'anonymous'
}

const getSessionForRequest = (req: IncomingMessage): GameSession => {
  const key = getSessionKey(req)
  if (!userSessions.has(key)) {
    userSessions.set(key, new GameSession())
  }
  sessionLastAccess.set(key, Date.now())
  return userSessions.get(key)!
}

const setSessionForRequest = (req: IncomingMessage, s: GameSession): void => {
  const key = getSessionKey(req)
  const old = userSessions.get(key)
  if (old && old !== s) old.dispose()
  userSessions.set(key, s)
}

/** Call a session method with its card context active. */
const callSession = <T>(req: IncomingMessage, fn: (session: GameSession) => T): T => {
  const session = getSessionForRequest(req)
  return session.withCtx(() => fn(session))
}

/** Call a session method and build the respondWith payload (including custom card defs). */
const callAndRespond = (req: IncomingMessage, fn: (session: GameSession) => import('./game/authoritative-session.ts').SessionResponse) => {
  const session = getSessionForRequest(req)
  const resp = session.withCtx(() => fn(session))
  return { resp, result: respondWith(resp, session) }
}

/** @deprecated Use getSessionForRequest instead. Kept for test compatibility. */
export const setSession = (s: GameSession) => { userSessions.set('anonymous', s) }

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(payload))
}

const respondWith = (resp: import('./game/authoritative-session.ts').SessionResponse, session?: GameSession) => {
  const result: Record<string, unknown> = {
    ...resp,
    state: serializeState(resp.state),
  }
  // Include custom card definitions so the frontend can register them
  // in its card registry — custom cards render identically to built-in cards.
  if (session) {
    const defs = session.getCustomCardDefs()
    if (defs.length > 0) result.customCardDefs = defs
  }
  return result
}

export const handleGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const { result } = callAndRespond(req, s => s.getState())
    sendJson(res, 200, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/action') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.takeAction(body.playerIndex!, body.spaceId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.resolveChoice(body.playerIndex!, body.value!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/anytime') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; actionId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.actionId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.takeAnytimeAction(body.playerIndex!, body.actionId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/reorg') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; zones?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.zones)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.confirmAnimalReorg(body.playerIndex!, body.zones as Parameters<GameSession['confirmAnimalReorg']>[1]))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.confirmHarvestFeed(body.playerIndex!, body.selections as Parameters<GameSession['confirmHarvestFeed']>[1]))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/commit-selection') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      payload?: { positions?: unknown[]; cardIds?: unknown[] }
    }
    if (
      typeof body.playerIndex !== 'number' ||
      !body.payload ||
      (!Array.isArray(body.payload.positions) && !Array.isArray(body.payload.cardIds))
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, (s) =>
      s.commitSelectionChoice(
        body.playerIndex!,
        body.payload as Parameters<GameSession['commitSelectionChoice']>[1],
      ))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    const { resp, result } = callAndRespond(req, s => s.confirmNextPlayer())
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    const { resp, result } = callAndRespond(req, s => s.confirmPlayerSwitch())
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/round-end') {
    const { resp, result } = callAndRespond(req, s => s.performRoundEnd())
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const { resp, result } = callAndRespond(req, s => s.undoStep())
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const { resp, result } = callAndRespond(req, s => s.undoAction())
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const actions = callSession(req, s => s.getAvailableActions(playerIndex))
    sendJson(res, 200, { ok: true, actions })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/load') {
    const body = JSON.parse(await readBody(req)) as { state?: unknown }
    if (!body.state) {
      sendJson(res, 400, { ok: false, error: 'missing state' })
      return true
    }
    const { result } = callAndRespond(req, s => s.loadState(body.state))
    sendJson(res, 200, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/create-pasture') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.startDevFenceSelect(body.playerIndex!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/commit-farm') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      farmType?: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      payload?: Record<string, unknown>
    }
    if (typeof body.playerIndex !== 'number' || !body.farmType || !body.payload) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.commitFarmChoice(body.playerIndex!, body.farmType!, body.payload!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      playerId: string
      payload: Record<string, unknown>
    }
    const state = callSession(req, s => s.getStateForRead())
    const playerIndex = state.players.findIndex((p) => p.id === body.playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { valid: false, error: 'Player not found' })
      return true
    }
    const player = normalizePlayerFarm(state.players[playerIndex]!)

    if (body.type === 'fence') {
      const result = applyFarmChoice(player, 'fence', body.payload as any, { state })
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'room') {
      const result = applyFarmChoice(player, 'room', body.payload as any)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'stable') {
      const result = applyFarmChoice(player, 'stable', body.payload as any)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'plow') {
      const result = applyFarmChoice(player, 'plow', body.payload as any)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'sow') {
      const result = applyFarmChoice(player, 'sow', body.payload as any)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    sendJson(res, 400, { valid: false, error: 'Unknown validation type' })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/new') {
    let seed: number | undefined
    try {
      const body = JSON.parse(await readBody(req)) as { seed?: number }
      if (typeof body.seed === 'number') seed = body.seed
    } catch { /* no body or invalid JSON — use random seed */ }
    setSessionForRequest(req, new GameSession(seed))
    const { result } = callAndRespond(req, s => s.getState())
    sendJson(res, 200, result)
    return true
  }

  // Sandbox game: start a new single-player game with custom workshop cards loaded
  if (req.method === 'POST' && req.url === '/api/game/new-sandbox') {
    let seed: number | undefined
    let customCardDbIds: string[] = []
    let playerCount = 2
    let deckIds = [...defaultSandboxDeckIds]
    try {
      const body = JSON.parse(await readBody(req)) as {
        seed?: number
        customCardIds?: string[]
        playerCount?: number
        deckIds?: string[]
      }
      if (typeof body.seed === 'number') seed = body.seed
      if (Array.isArray(body.customCardIds)) {
        customCardDbIds = body.customCardIds.filter((id): id is string => typeof id === 'string')
      }
      if (typeof body.playerCount === 'number') {
        playerCount = Math.max(2, Math.min(4, Math.floor(body.playerCount)))
      }
      if (Array.isArray(body.deckIds)) {
        const nextDecks = body.deckIds
          .filter((deck): deck is string => typeof deck === 'string')
          .map((deck) => deck.trim().toUpperCase())
          .filter((deck) => (defaultSandboxDeckIds as readonly string[]).includes(deck))
        if (nextDecks.length > 0) {
          deckIds = Array.from(new Set(nextDecks)) as typeof deckIds
        }
      }
    } catch { /* ignore */ }

    // Identify the requesting user (optional — allows loading own draft cards)
    const requestUser = validateSession(extractToken(req.headers.authorization))

    // Load custom card data from the database.
    // Allow: published cards (anyone) OR draft cards owned by the requesting user.
    const customCards: CustomCardData[] = []
    if (customCardDbIds.length > 0) {
      const db = getDb()
      for (const dbId of customCardDbIds) {
        const row = db.prepare(
          `SELECT card_type, card_json, effect_code, compiled_code, code_manifest, art_url, status, author_id
           FROM workshop_cards WHERE id = ?`,
        ).get(dbId) as {
          card_type: string
          card_json: string
          effect_code: string | null
          compiled_code: string | null
          code_manifest: string | null
          art_url: string | null
          status: string; author_id: string
        } | undefined
        if (!row) continue
        // Allow published cards, or draft cards if requester is the author
        const allowed =
          row.status === 'published' ||
          (row.status === 'draft' && requestUser?.id === row.author_id)
        if (!allowed) continue
        try {
          customCards.push({
            cardType: row.card_type as 'minor' | 'occupation',
            cardJson: JSON.parse(row.card_json),
            effectCode: row.effect_code ?? null,
            compiledCode: row.compiled_code ?? null,
            codeManifest: row.code_manifest ? JSON.parse(row.code_manifest) as CustomCodeManifest : null,
            artUrl: row.art_url ?? null,
          })
        } catch (err) {
          console.warn(`[game-router] failed to parse custom card ${dbId}:`, err)
        }
      }
    }

    const sandboxSession = new GameSession(
      seed,
      customCards.length > 0 ? customCards : undefined,
      {
        playerCount,
        deckIds,
        playerNames: [...defaultSandboxPlayerNames].slice(0, playerCount),
      },
    )
    setSessionForRequest(req, sandboxSession)
    const { result } = callAndRespond(req, s => s.getState())
    sendJson(res, 200, {
      ...result,
      customCardsLoaded: customCards.length,
      cardWarnings: sandboxSession.cardWarnings.length > 0 ? sandboxSession.cardWarnings : undefined,
    })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/play-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devPlayCard(body.playerIndex!, body.cardId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/draw-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devDrawCard(body.playerIndex!, body.cardId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-space-taken') {
    const body = JSON.parse(await readBody(req)) as { spaceId?: string; playerId?: string | null }
    if (typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devSetSpaceTaken(body.spaceId!, body.playerId ?? null))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-current-player') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devSetCurrentPlayer(body.playerIndex!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-resources') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; resources?: Record<string, number> }
    if (typeof body.playerIndex !== 'number' || !body.resources || typeof body.resources !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devSetResources(body.playerIndex!, body.resources!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/add-rooms') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; rooms?: Array<{ row: number; col: number }> }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.rooms)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devAddRooms(body.playerIndex!, body.rooms!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-round') {
    const body = JSON.parse(await readBody(req)) as { round?: number }
    if (typeof body.round !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid round' })
      return true
    }
    const { resp, result } = callAndRespond(req, s => s.devSetRound(body.round!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

return false
}
