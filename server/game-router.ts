import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game-session.ts'
import { serializeState } from '../shared/game/serialization.ts'
import { normalizePlayerFarm } from './fence-validation.ts'
import { applyFarmChoice } from './farm-choice.ts'
import { getDb } from './db.ts'
import { validateSession, extractToken } from './auth.ts'
import type { CustomCardData } from '../shared/cards/custom-registry.ts'

let session: GameSession | null = null

const getSingletonSession = (): GameSession => {
  if (!session) session = new GameSession()
  return session
}

export const setSession = (s: GameSession) => { session = s }

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
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const respondWith = (resp: import('./game-session.ts').SessionResponse) => ({
  ...resp,
  state: serializeState(resp.state),
})

export const handleGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const resp = getSingletonSession().getState()
    sendJson(res, 200, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/action') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().takeAction(body.playerIndex, body.spaceId)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().resolveChoice(body.playerIndex, body.value)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/anytime') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; actionId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.actionId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().takeAnytimeAction(body.playerIndex, body.actionId)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/reorg') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; zones?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.zones)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().confirmAnimalReorg(body.playerIndex, body.zones as Parameters<GameSession['confirmAnimalReorg']>[1])
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().confirmHarvestFeed(body.playerIndex, body.selections as Parameters<GameSession['confirmHarvestFeed']>[1])
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    const resp = getSingletonSession().confirmNextPlayer()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    const resp = getSingletonSession().confirmPlayerSwitch()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/round-end') {
    const resp = getSingletonSession().performRoundEnd()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const resp = getSingletonSession().undoStep()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const resp = getSingletonSession().undoAction()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const actions = getSingletonSession().getAvailableActions(playerIndex)
    sendJson(res, 200, { ok: true, actions })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/load') {
    const body = JSON.parse(await readBody(req)) as { state?: unknown }
    if (!body.state) {
      sendJson(res, 400, { ok: false, error: 'missing state' })
      return true
    }
    const resp = getSingletonSession().loadState(body.state)
    sendJson(res, 200, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/create-pasture') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().startDevFenceSelect(body.playerIndex)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
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
    const resp = getSingletonSession().commitFarmChoice(body.playerIndex, body.farmType, body.payload)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      playerId: string
      payload: Record<string, unknown>
    }
    const state = getSingletonSession().getStateForRead()
    const playerIndex = state.players.findIndex((p) => p.id === body.playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { valid: false, error: 'Player not found' })
      return true
    }
    const player = normalizePlayerFarm(state.players[playerIndex]!)

    if (body.type === 'fence') {
      const result = applyFarmChoice(player, 'fence', body.payload as any)
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
    session = new GameSession(seed)
    const resp = getSingletonSession().getState()
    sendJson(res, 200, respondWith(resp))
    return true
  }

  // Sandbox game: start a new single-player game with custom workshop cards loaded
  if (req.method === 'POST' && req.url === '/api/game/new-sandbox') {
    let seed: number | undefined
    let customCardDbIds: string[] = []
    try {
      const body = JSON.parse(await readBody(req)) as { seed?: number; customCardIds?: string[] }
      if (typeof body.seed === 'number') seed = body.seed
      if (Array.isArray(body.customCardIds)) {
        customCardDbIds = body.customCardIds.filter((id): id is string => typeof id === 'string')
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
          `SELECT card_type, card_json, effect_dsl, status, author_id
           FROM workshop_cards WHERE id = ?`,
        ).get(dbId) as {
          card_type: string; card_json: string; effect_dsl: string | null
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
            effectDsl: row.effect_dsl ? JSON.parse(row.effect_dsl) : null,
          })
        } catch (err) {
          console.warn(`[game-router] failed to parse custom card ${dbId}:`, err)
        }
      }
    }

    session = new GameSession(seed, customCards.length > 0 ? customCards : undefined)
    const resp = getSingletonSession().getState()
    sendJson(res, 200, { ...respondWith(resp), customCardsLoaded: customCards.length })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/play-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devPlayCard(body.playerIndex, body.cardId)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-space-taken') {
    const body = JSON.parse(await readBody(req)) as { spaceId?: string; playerId?: string | null }
    if (typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetSpaceTaken(body.spaceId, body.playerId ?? null)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-current-player') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetCurrentPlayer(body.playerIndex)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-resources') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; resources?: Record<string, number> }
    if (typeof body.playerIndex !== 'number' || !body.resources || typeof body.resources !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetResources(body.playerIndex, body.resources)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/add-rooms') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; rooms?: Array<{ row: number; col: number }> }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.rooms)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devAddRooms(body.playerIndex, body.rooms)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-round') {
    const body = JSON.parse(await readBody(req)) as { round?: number }
    if (typeof body.round !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid round' })
      return true
    }
    const resp = getSingletonSession().devSetRound(body.round)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

return false
}
