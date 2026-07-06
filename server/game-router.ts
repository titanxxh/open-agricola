import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game/authoritative-session.ts'
import {
  filterPublicEventCancellationsForPlayer,
  serializeState,
  serializeStateForPlayer,
} from '../shared/session/serialization.ts'
import {
  playerBoard,
  type SowSelection,
  normalizePlayerFarm,
} from '../shared/domain/index.ts'
import { playerCanBuildPalisades } from '../shared/cards/helpers/card-type.ts'
import { collectLockedFarmTileKeys } from '../shared/cards/card-effects.ts'
import type { FarmTilePosition } from '../shared/contract/types.ts'
import type { MoorSpecialActionId } from '../shared/moor/types.ts'
import { getDb } from './db.ts'
import { validateSession, extractToken } from './auth.ts'
import type { CustomCardData } from '../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../shared/custom-code/types.ts'
import { defaultSandboxDeckIds, defaultSandboxPlayerNames } from '../shared/session/state-bootstrap.ts'
import { privateEventsForViewer } from '../shared/session/interaction-privacy.ts'
import { redactInteractionForViewer } from '../shared/session/interaction-state-adapter.ts'
import { corsHeaders } from './http-origin.ts'

/**
 * Per-user HTTP game sessions, keyed by user ID.
 * 'anonymous' is the default for unauthenticated requests (dev mode).
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

/**
 * Resolve the caller's chosen viewer (seat) for privacy filtering + seat binding.
 *
 * HTTP is per-user sandbox by design (one authenticated user gets a private
 * `GameSession` and plays every seat). There is no persistent userId → seat
 * mapping, so we can't default to a viewer. Instead callers **opt in** via the
 * `X-Viewer-Player: <playerId>` header.
 *
 * When set and it matches a live `state.players[*].id`, responses are filtered
 * with {@link serializeStateForPlayer} (opponent hands masked to '?') and
 * every endpoint that accepts `body.playerIndex` (or `body.playerId`) is
 * seat-bound to that viewer.
 *
 * When absent (the default), HTTP behaves exactly as before — no filtering
 * and no seat guard — preserving the multi-seat sandbox / dev flow where one
 * caller legitimately plays every seat. Production multi-player traffic is
 * WS-only; WS enforces seat binding independently (see Task 4).
 */
const resolveViewerPlayerId = (req: IncomingMessage, session: GameSession): string | null => {
  const headerVal = req.headers['x-viewer-player']
  const fromHeader = Array.isArray(headerVal) ? headerVal[0] : headerVal
  const candidate = (fromHeader ?? '').trim()
  if (!candidate) return null
  const state = session.getStateForRead()
  return state.players.some((p) => p.id === candidate) ? candidate : null
}

/** Call a session method and build the respondWith payload (including custom card defs). */
const callAndRespond = (req: IncomingMessage, fn: (session: GameSession) => import('./game/authoritative-session.ts').SessionResponse) => {
  const session = getSessionForRequest(req)
  const resp = session.withCtx(() => fn(session))
  const viewerId = resolveViewerPlayerId(req, session)
  return { resp, result: respondWith(resp, session, viewerId), viewerId }
}

/**
 * Seat-binding guard for endpoints that accept `body.playerIndex`.
 * If the caller opted into a viewer (via header/query) and that viewer doesn't
 * match the seat at `playerIndex`, return a 403. Anonymous / unclaimed callers
 * skip the guard so sandbox / dev flows keep working.
 * Returns `true` when the caller is allowed to proceed, `false` when a 403 has
 * already been sent.
 */
const enforceSeatBinding = (
  req: IncomingMessage,
  res: ServerResponse,
  playerIndex: number,
): boolean => {
  const session = getSessionForRequest(req)
  const viewerId = resolveViewerPlayerId(req, session)
  if (!viewerId) return true
  const state = session.getStateForRead()
  const seatId = state.players[playerIndex]?.id
  if (seatId !== viewerId) {
    sendJson(res, 403, { ok: false, error: 'seat mismatch' })
    return false
  }
  return true
}

/**
 * Test-only: inject a pre-built (typically seeded) session into the
 * 'anonymous' slot so subsequent requests route to it. HTTP routes auto-create
 * sessions when missing, so this is the only way to seed for deterministic
 * tests. Production code paths use `getSessionForRequest` directly.
 */
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
    ...corsHeaders({
      methods: 'GET,POST,OPTIONS',
      headers: 'Content-Type, Authorization, X-Viewer-Player',
    }),
  })
  res.end(JSON.stringify(payload))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFarmTilePositionPayload = (value: unknown): value is FarmTilePosition =>
  isRecord(value) &&
  typeof value.row === 'number' &&
  typeof value.col === 'number'

const isFarmTilePositionArray = (value: unknown): value is FarmTilePosition[] =>
  Array.isArray(value) && value.every(isFarmTilePositionPayload)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const isSowSelectionPayload = (value: unknown): value is SowSelection => {
  if (!isFarmTilePositionPayload(value)) return false
  const crop = (value as { crop?: unknown }).crop
  return crop === 'grain' || crop === 'vegetable' || crop === 'wood' || crop === 'stone'
}

const commitSelectionPayloadValidators: Record<string, (value: unknown) => boolean> = {
  cancel: (value) => value === true,
  positions: isFarmTilePositionArray,
  cardIds: isStringArray,
  resourceCounts: isRecord,
  resourceBatchExchange: isRecord,
  edges: isStringArray,
  palisadeEdges: isStringArray,
  extraWood: (value) => typeof value === 'number',
  fenceSources: (value) =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string'),
  rooms: isFarmTilePositionArray,
  stables: isFarmTilePositionArray,
  tile: isFarmTilePositionPayload,
  crops: (value) => Array.isArray(value) && value.every(isSowSelectionPayload),
}

const isValidCommitSelectionPayload = (
  payload: unknown,
): payload is Parameters<GameSession['commitSelectionChoice']>[1] => {
  if (!isRecord(payload)) return false
  const keys = Object.keys(payload)
  if (keys.length === 0) return false
  return keys.every((key) => {
    const validate = commitSelectionPayloadValidators[key]
    return validate ? validate(payload[key]) : false
  })
}

const respondWith = (
  resp: import('./game/authoritative-session.ts').SessionResponse,
  session: GameSession,
  viewerPlayerId: string | null = null,
) => {
  const ctx = { engineStack: session.getEngineStack() }
  const playerIds = resp.state.players.map((player) => player.id)
  const currentPlayerId = resp.state.players[resp.state.currentPlayerIndex]?.id ?? null
  const privateEvents = viewerPlayerId === null
    ? []
    : privateEventsForViewer(resp.interaction, playerIds, viewerPlayerId, resp.privateEvents ?? [])
  const publicEventCancellations = viewerPlayerId === null
    ? resp.publicEventCancellations
    : filterPublicEventCancellationsForPlayer(resp.state, viewerPlayerId, ctx, resp.publicEventCancellations)
  const { privateEvents: _privateEvents, publicEventCancellations: _publicEventCancellations, ...publicResp } = resp
  const result: Record<string, unknown> = {
    ...publicResp,
    state:
      viewerPlayerId != null
        ? serializeStateForPlayer(resp.state, viewerPlayerId, ctx)
        : serializeState(resp.state, ctx),
    interaction:
      viewerPlayerId != null
        ? redactInteractionForViewer(resp.interaction, playerIds, viewerPlayerId)
        : resp.interaction,
    cardAvailability:
      viewerPlayerId === null || viewerPlayerId === currentPlayerId
        ? resp.cardAvailability
        : undefined,
  }
  if (privateEvents.length > 0) result.privateEvents = privateEvents
  if (publicEventCancellations?.length) result.publicEventCancellations = publicEventCancellations
  // Include custom card definitions so the frontend can register them
  // in its card registry — custom cards render identically to built-in cards.
  const defs = session.getCustomCardDefs()
  if (defs.length > 0) result.customCardDefs = defs
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
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s => s.takeAction(body.playerIndex!, body.spaceId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/special-action') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      cardId?: string
      actionId?: MoorSpecialActionId
      payload?: { tile?: { row: number; col: number } }
    }
    if (
      typeof body.playerIndex !== 'number' ||
      typeof body.cardId !== 'string' ||
      typeof body.actionId !== 'string'
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s =>
      s.takeSpecialAction(body.playerIndex!, body.cardId!, body.actionId!, body.payload),
    )
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string; payload?: Record<string, unknown> }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s => s.resolveChoice(body.playerIndex!, body.value!, body.payload))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/anytime') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; actionId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.actionId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s => s.takeAnytimeAction(body.playerIndex!, body.actionId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/ordinary-draw/keep') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      choiceId?: string
      keepCardId?: string
    }
    if (
      typeof body.playerIndex !== 'number' ||
      typeof body.choiceId !== 'string' ||
      typeof body.keepCardId !== 'string'
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s =>
      s.resolveOrdinaryCardDrawChoice(body.playerIndex!, body.choiceId!, body.keepCardId!))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    // Task 9: forwarded through the unified resolveChoice dispatcher.
    const { resp, result } = callAndRespond(req, (s) =>
      s.resolveChoice(body.playerIndex!, 'confirm', { selections: body.selections }),
    )
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/commit-selection') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      payload?: unknown
    }
    const payload = body.payload
    if (
      typeof body.playerIndex !== 'number' ||
      !isValidCommitSelectionPayload(payload)
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, (s) =>
      s.commitSelectionChoice(
        body.playerIndex!,
        payload,
      ))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/parent-submit') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      selection?: unknown
    }
    if (typeof body.playerIndex !== 'number' || typeof body.selection !== 'object' || body.selection === null) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
    const { resp, result } = callAndRespond(req, s => s.submitParentSelection(
      body.playerIndex!,
      body.selection as Parameters<GameSession['submitParentSelection']>[1],
    ))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    // Task 9: forwarded through resolveChoice; the synthetic
    // confirm-next-player pending envelope supplies `nextPlayerIndex`.
    const { resp, result } = callAndRespond(req, (s) => {
      const idx = s.getState().state.currentPlayerIndex
      return s.resolveChoice(idx, 'confirm')
    })
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    // Task 9: forwarded through resolveChoice.
    const { resp, result } = callAndRespond(req, (s) => {
      const idx = s.getState().state.currentPlayerIndex
      return s.resolveChoice(idx, 'confirm')
    })
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
    // Validate against the normalized player by swapping it into a
    // shallow state clone — preserves the current router behavior of
    // running validators on the normalized view, not the raw state.
    const normalizedPlayers = state.players.slice()
    normalizedPlayers[playerIndex] = player
    const normalizedState = { ...state, players: normalizedPlayers }
    const board = playerBoard(normalizedState, playerIndex)

    if (body.type === 'fence') {
      const fp = body.payload as {
        edges?: string[]
        palisadeEdges?: string[]
        extraWood?: number
        fenceSources?: Record<string, string>
      }
      const edges = Array.isArray(fp.edges) ? fp.edges : []
      const palisadeEdges = Array.isArray(fp.palisadeEdges) ? fp.palisadeEdges : []
      const extraWood = fp.extraWood ?? 0
      const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
      const result = board.farmyard.canBuildFence({
        edges,
        palisadeEdges,
        extraWood,
        fenceSources: fp.fenceSources,
        freeFences: 0,
        options: { skipPayment: true, allowPalisades: playerCanBuildPalisades(player) },
        lockedKeys,
      })
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' })
      return true
    }
    if (body.type === 'room') {
      const rooms = (body.payload as { rooms?: FarmTilePosition[] }).rooms
      const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
      const result = board.farmyard.canBuildRoom(Array.isArray(rooms) ? rooms : [], lockedKeys)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.code })
      return true
    }
    if (body.type === 'stable') {
      const stables = (body.payload as { stables?: FarmTilePosition[] }).stables ?? []
      const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
      const result = board.farmyard.canBuildStable(stables, lockedKeys)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.code ?? 'validation failed' })
      return true
    }
    if (body.type === 'plow') {
      const tile = (body.payload as { tile?: FarmTilePosition }).tile
      const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
      const result = board.farmyard.canPlow(tile, lockedKeys)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' })
      return true
    }
    if (body.type === 'sow') {
      const crops = (body.payload as { crops?: unknown }).crops
      if (!Array.isArray(crops)) {
        sendJson(res, 200, { valid: false, error: 'NO_SELECTION' })
        return true
      }
      const result = board.farmyard.canSow({ fields: crops as SowSelection[] })
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' })
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
        playerCount = Number.isFinite(body.playerCount)
          ? Math.max(2, Math.min(6, Math.floor(body.playerCount)))
          : 2
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
          `SELECT card_type, card_json, code_manifest, art_url, status, author_id
           FROM workshop_cards WHERE id = ?`,
        ).get(dbId) as {
          card_type: string
          card_json: string
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
          const parsed = JSON.parse(row.card_json) as Record<string, unknown>
          const effectCode = typeof parsed._code === 'string' ? parsed._code : null
          const compiledCode = typeof parsed._compiled === 'string' ? parsed._compiled : null
          customCards.push({
            cardType: row.card_type as 'minor' | 'occupation',
            cardJson: parsed as unknown as CustomCardData['cardJson'],
            effectCode,
            compiledCode,
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
    if (!enforceSeatBinding(req, res, body.playerIndex)) return true
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

  if (req.method === 'POST' && req.url === '/api/game/draft-submit') {
    const body = JSON.parse(await readBody(req)) as {
      playerId?: string
      pick?: { occCardId?: unknown; minorCardId?: unknown }
    }
    const occCardId = typeof body.pick?.occCardId === 'string' ? body.pick.occCardId : undefined
    const minorCardId = typeof body.pick?.minorCardId === 'string' ? body.pick.minorCardId : undefined
    if (
      typeof body.playerId !== 'string' ||
      !body.pick ||
      (!occCardId && !minorCardId)
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    {
      const session = getSessionForRequest(req)
      const viewerId = resolveViewerPlayerId(req, session)
      if (viewerId && body.playerId !== viewerId) {
        sendJson(res, 403, { ok: false, error: 'seat mismatch' })
        return true
      }
    }
    const pick = { occCardId, minorCardId }
    const { resp, result } = callAndRespond(req, s => s.submitDraftPick(body.playerId!, pick))
    sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

return false
}
