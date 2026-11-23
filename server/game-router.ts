import { requestSessionToken } from './request-auth'
import { CLASSIC_EDITION_ENABLED } from '../shared/contract/card-edition'
import { classicAdmissionRejection, parseCardEditionChoice, type CardEditionChoice } from '../shared/session/card-edition-admission'
import { ClassicPoolInsufficientError } from '../shared/session/classic-deal-pool'
import { CLIENT_CAPABILITIES_HEADER } from '../shared/contract/client-capabilities'
import { parseCommitSelectionPayload, type CommitSelectionPayload } from '../shared/contract/protocol/commit-selection'
import { parseFenceSelectionPayload } from '../shared/contract/protocol/farm-selection'
import type { FenceSelectionQuote } from '../shared/contract/protocol/game'
import { randomUUID } from 'node:crypto'
import type { SandboxAuthority } from './game/sandbox-authority'
import { ExecutionRevokedError, type ExecutionStamp } from './game/execution-access'
import { RoomOwnershipError } from './game/room-directory'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildSessionSyncPayload, GameSession } from './game/authoritative-session.ts'
import type { FarmChoiceType, FarmChoiceValidation } from '../shared/session/farm-choice-validation.ts'
import type { MoorSpecialActionId } from '../shared/moor/types.ts'
import { validateSession } from './auth.ts'
import { allowAnonymousAccess } from './anonymous-access.ts'
import { defaultSandboxDeckIds, type InitialStateOptions } from '../shared/session/state-bootstrap.ts'
import { corsHeaders } from './http-origin.ts'
import { parseDraftOptions } from './connection/room-router.ts'
import {
  asSetupPayload,
  assertSupportedLoadedState,
  assertSupportedGameConfiguration,
  buildInitialStateOptions,
  clampPlayerCount,
  parseGameSetupRequest,
  resolveCustomCardDbIds,
} from './game/game-setup-options.ts'


/**
 * Per-user HTTP game sessions, keyed by user ID.
 * 'anonymous' is the default for unauthenticated requests (dev mode).
 * This prevents multiple logged-in users from sharing a single game state.
 */
let authority: SandboxAuthority | undefined
export const configureSandboxAuthority = (value: SandboxAuthority): void => { authority = value }
const sessionStamps = new Map<string, ExecutionStamp>()
const requests = new WeakMap<IncomingMessage, { stamp: ExecutionStamp; revision?: number }>()
const responses = new WeakMap<ServerResponse, IncomingMessage>()
export const disposeSandboxSessionsForUser = (userId: string): void => {
  userSessions.get(userId)?.dispose()
  userSessions.delete(userId); sessionStamps.delete(userId); sessionLastAccess.delete(userId)
  sessionReplacementGenerations.delete(userId)
}
export const shutdownSandboxSessions = (): void => {
  for (const key of [...userSessions.keys()]) disposeSandboxSessionsForUser(key)
}

// A seed may be reused; HTTP playtest identity follows the actual session.
const gameInstanceIds = new WeakMap<GameSession, string>()

type SandboxSetup = {
  options: InitialStateOptions
}
const sandboxSetups = new WeakMap<GameSession, SandboxSetup>()

const userSessions = new Map<string, GameSession>()
const sessionLastAccess = new Map<string, number>()
const sessionReplacementGenerations = new Map<string, symbol>()
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Periodically clean up idle sessions
setInterval(() => {
  const now = Date.now()
  for (const [key, lastAccess] of sessionLastAccess) {
    if (now - lastAccess > SESSION_TTL_MS) {
      userSessions.get(key)?.dispose()
      userSessions.delete(key)
      sessionLastAccess.delete(key)
      sessionReplacementGenerations.delete(key)
    }
  }
}, 60_000).unref()

const getSessionKey = async (req: IncomingMessage): Promise<Awaited<string>> => {
  const user = (await validateSession(requestSessionToken(req)))
  if (!user && requestSessionToken(req) && authority) throw new ExecutionRevokedError('Session authorization ended')
  return user?.id ?? 'anonymous'
}

const getSessionForRequest = async (req: IncomingMessage): Promise<Awaited<GameSession>> => {
  const key = (await getSessionKey(req))
  if (!userSessions.has(key)) {
    userSessions.set(key, new GameSession())
    if (authority) sessionStamps.set(key, await authority.access.capture([], key === 'anonymous' ? [] : [key]))
  }
  if (authority) {
    const stamp = sessionStamps.get(key) ?? []
    await authority.check(stamp)
    requests.set(req, { ...requests.get(req), stamp })
  }
  sessionLastAccess.set(key, Date.now())
  return userSessions.get(key)!
}

class SandboxReplacementError extends Error {
  readonly code: 'sandbox_replaced'

  constructor(code: SandboxReplacementError['code'], message: string) {
    super(message)
    this.code = code
  }
}

const beginReplacement = (key: string): symbol => {
  const generation = Symbol()
  sessionReplacementGenerations.set(key, generation)
  sessionLastAccess.set(key, Date.now())
  return generation
}

type SessionReplacement = {
  key: string
  generation: symbol
  previousSandbox?: { session: GameSession; instanceId: string }
}

const setSessionForRequest = async (
  req: IncomingMessage,
  session: GameSession,
  replacement: SessionReplacement,
): Promise<void> => {
  let stamp: ExecutionStamp | undefined
  const { key, generation, previousSandbox } = replacement
  if (key !== await getSessionKey(req)) throw new ExecutionRevokedError('Session authorization ended')
  if (authority) {
    const auth = authority
    stamp = await auth.directory.db.transaction(async () => {
      const scope = requests.get(req)
      if (scope?.revision !== undefined) await auth.access.assertRevision(scope.revision)
      if (previousSandbox && scope) await auth.access.assert(scope.stamp)
      const next = await auth.access.capture([], key === 'anonymous' ? [] : [key])
      await auth.check(next)
      return next
    })()
  }
  const replaced = previousSandbox && (userSessions.get(key) !== previousSandbox.session
    || gameInstanceIds.get(previousSandbox.session) !== previousSandbox.instanceId)
  if (sessionReplacementGenerations.get(key) !== generation || replaced) {
    throw new SandboxReplacementError('sandbox_replaced', 'Sandbox replaced by a newer request')
  }

  const old = userSessions.get(key)
  if (old && old !== session) old.dispose()
  userSessions.set(key, session)
  if (stamp) {
    sessionStamps.set(key, stamp)
    requests.set(req, { stamp })
  }
  sessionLastAccess.set(key, Date.now())
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

/** Call a session method and build the respondWith payload. */
const callAndRespond = async (
  req: IncomingMessage,
  fn: (session: GameSession) => import('./game/authoritative-session.ts').SessionResponse,
  options: { loadsState?: boolean } = {},
) => {
  const session = (await getSessionForRequest(req))
  const resp = session.withCtx(() => fn(session))
  if (options.loadsState && resp.ok) gameInstanceIds.delete(session)
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
const enforceSeatBinding = async (
  req: IncomingMessage,
  res: ServerResponse,
  playerIndex: number,
): Promise<Awaited<boolean>> => {
  const session = (await getSessionForRequest(req))
  const viewerId = resolveViewerPlayerId(req, session)
  if (!viewerId) return true
  const state = session.getStateForRead()
  const seatId = state.players[playerIndex]?.id
  if (seatId !== viewerId) {
    await sendJson(res, 403, { ok: false, error: 'seat mismatch' })
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
export const setSession = (s: GameSession) => {
  userSessions.set('anonymous', s)
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

const rawJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders({
      methods: 'GET,POST,OPTIONS',
      headers: `Content-Type, Authorization, X-Viewer-Player, ${CLIENT_CAPABILITIES_HEADER}`,
    }),
  })
  res.end(JSON.stringify(payload))
}

const sendJson = async (res: ServerResponse, status: number, payload: unknown): Promise<void> => {
  const request = responses.get(res)
  const scope = request && requests.get(request)
  if (authority && scope) {
    await authority.publish(scope.stamp, () => rawJson(res, status, payload))
  } else rawJson(res, status, payload)
}

const respondWith = (
  resp: import('./game/authoritative-session.ts').SessionResponse,
  session: GameSession,
  viewerPlayerId: string | null = null,
) => {
  let gameInstanceId = gameInstanceIds.get(session)
  if (!gameInstanceId) {
    gameInstanceId = randomUUID()
    gameInstanceIds.set(session, gameInstanceId)
  }
  return {
    ...buildSessionSyncPayload(session, resp, viewerPlayerId === null ? [] : [viewerPlayerId], viewerPlayerId === null ? 'debug' : 'viewer'),
    gameInstanceId,
  }
}


const startSandboxGame = async (
  req: IncomingMessage,
  res: ServerResponse,
  seed: number | undefined,
  setup: SandboxSetup,
  replacement: SessionReplacement,
): Promise<void> => {
  const session = new GameSession(seed, undefined, setup.options)
  let adopted = false
  try {
    const response = session.withCtx(() => session.getState())
    const payload = {
      ...respondWith(response, session, resolveViewerPlayerId(req, session)),
      cardWarnings: session.cardWarnings.length > 0 ? session.cardWarnings : undefined,
    }
    if (response.ok) {
      await setSessionForRequest(req, session, replacement)
      sandboxSetups.set(session, setup)
      adopted = true
    }
    await sendJson(res, 200, payload)
  } finally {
    if (!adopted) session.dispose()
  }
}

const handleAuthorizedGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  classicEditionEnabled: boolean,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    await sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const { result } = await callAndRespond(req, s => s.getState())
    await sendJson(res, 200, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/action') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.takeAction(body.playerIndex!, body.spaceId!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
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
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.takeSpecialAction(body.playerIndex!, body.cardId!, body.actionId!, body.payload),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string; payload?: Record<string, unknown> }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.resolveChoice(body.playerIndex!, body.value!, body.payload),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/anytime') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; actionId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.actionId !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.takeAnytimeAction(body.playerIndex!, body.actionId!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
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
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.resolveOrdinaryCardDrawChoice(body.playerIndex!, body.choiceId!, body.keepCardId!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    // Task 9: forwarded through the unified resolveChoice dispatcher.
    const { resp, result } = await callAndRespond(
      req,
      s => s.resolveChoice(body.playerIndex!, 'confirm', { selections: body.selections }),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/commit-selection') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      payload?: unknown
    }
    let payload: CommitSelectionPayload | undefined
    try { payload = parseCommitSelectionPayload(body.payload) } catch { payload = undefined }
    if (typeof body.playerIndex !== 'number' || !payload) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.commitSelectionChoice(
        body.playerIndex!,
        payload,
      ),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/solo-hand-submit') {
    const body: unknown = JSON.parse(await readBody(req))
    if (!body || typeof body !== 'object' || !('playerIndex' in body) ||
        typeof body.playerIndex !== 'number' || !('selection' in body)) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { playerIndex, selection } = body
    if (!(await enforceSeatBinding(req, res, playerIndex))) return true
    const { resp, result } = await callAndRespond(req, s => s.submitSoloHandSelection(playerIndex, selection))
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/parent-submit') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      selection?: unknown
    }
    if (typeof body.playerIndex !== 'number' || typeof body.selection !== 'object' || body.selection === null) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const selection = body.selection as Parameters<GameSession['submitParentSelection']>[1]
    const { resp, result } = await callAndRespond(
      req,
      s => s.submitParentSelection(body.playerIndex!, selection),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    // Task 9: forwarded through resolveChoice; the synthetic
    // confirm-next-player pending envelope supplies `nextPlayerIndex`.
    const { resp, result } = await callAndRespond(req, (s) => {
      const idx = s.getState().state.currentPlayerIndex
      return s.resolveChoice(idx, 'confirm')
    })
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    // Task 9: forwarded through resolveChoice.
    const { resp, result } = await callAndRespond(req, (s) => {
      const snapshot = s.getState()
      const idx = snapshot.interaction.stateId === 'wait' &&
        snapshot.interaction.request.kind === 'confirm-player-switch'
        ? snapshot.interaction.playerIndex
        : snapshot.state.currentPlayerIndex
      return s.resolveChoice(idx, 'confirm')
    })
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/round-end') {
    const { resp, result } = await callAndRespond(req, s => s.performRoundEnd())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/preferences') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: unknown; preferences?: unknown }
    if (typeof body.playerIndex !== 'number') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const playerIndex = body.playerIndex
    const { resp, result } = await callAndRespond(req, s => s.setPlayerPreferences(playerIndex, body.preferences))
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const { resp, result } = await callAndRespond(req, s => s.undoStep())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const { resp, result } = await callAndRespond(req, s => s.undoAction())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const session = (await getSessionForRequest(req))
    try {
      const actions = session.withCtx(() => session.getAvailableActions(playerIndex))
      await sendJson(res, 200, { ok: true, actions })
    } catch (error) {
      await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/load') {
    const body = JSON.parse(await readBody(req)) as { state?: unknown }
    if (!body.state) {
      await sendJson(res, 400, { ok: false, error: 'missing state' })
      return true
    }
    try { assertSupportedLoadedState(body.state) }
    catch (error) { await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Unsupported game configuration' }); return true }
    const { result } = await callAndRespond(req, s => s.loadState(body.state), { loadsState: true })
    await sendJson(res, 200, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/create-pasture') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.startDevFenceSelect(body.playerIndex!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/fence-quote') {
    const body: unknown = JSON.parse(await readBody(req))
    try {
      if (typeof body !== 'object' || body === null || !('playerIndex' in body) || typeof body.playerIndex !== 'number'
        || !('requestKey' in body) || typeof body.requestKey !== 'string' || !('payload' in body)) {
        throw new Error('Invalid fence quote request')
      }
      const payload = parseFenceSelectionPayload(body.payload)
      const session = await getSessionForRequest(req)
      if (!await enforceSeatBinding(req, res, body.playerIndex)) return true
      const quote: FenceSelectionQuote = session.quoteFenceSelection(body.playerIndex, body.requestKey, payload)
      await sendJson(res, 200, quote)
    } catch (error) {
      await sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: FarmChoiceType
      playerId: string
      payload: Record<string, unknown>
    }
    const session = (await getSessionForRequest(req))
    try {
      const validation: FarmChoiceValidation = session.validateFarmChoice(
        body.type,
        body.playerId,
        body.payload,
      )
      const { requestError, ...result } = validation
      // Preserve the pre-extraction contract: malformed requests (missing player /
      // unknown type) are 400; ordinary invalid placements are 200 valid:false.
      await sendJson(res, requestError ? 400 : 200, result)
    } catch (error) {
      await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/new') {
    const sessionKey = (await getSessionKey(req))
    let seed: number | undefined
    let raw: Record<string, unknown> = {}
    try {
      raw = asSetupPayload(JSON.parse(await readBody(req)))
      if (typeof raw.seed === 'number') seed = raw.seed
    } catch { /* no body or invalid JSON — use random seed and default setup */ }
    // Hotseat games are set up from the same lobby panel as multiplayer rooms,
    // so they go through the same option mapping (`game-setup-options.ts`).
    const draftOptions = parseDraftOptions(raw)
    if (!draftOptions.ok) {
      await sendJson(res, 400, { ok: false, error: draftOptions.error })
      return true
    }
    let setup: ReturnType<typeof parseGameSetupRequest>
    try { setup = parseGameSetupRequest(raw, draftOptions.value) }
    catch (error) { await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid game configuration' }); return true }
    const options = buildInitialStateOptions(setup)
    const rejection = classicAdmissionRejection(options, classicEditionEnabled)
    if (rejection) {
      await sendJson(res, 400, { ok: false, ...rejection })
      return true
    }
    const generation = beginReplacement(sessionKey)
    // Games use only deployed cards; Workshop cards play in the browser sandbox (ADR 0052).
    try { resolveCustomCardDbIds(raw) }
    catch (error) { await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid game configuration' }); return true }
    const session = new GameSession(seed, undefined, options)
    try {
      await setSessionForRequest(req, session, { key: sessionKey, generation })
    } catch (error) {
      session.dispose()
      throw error
    }
    const { result } = await callAndRespond(req, s => s.getState())
    await sendJson(res, 200, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/new-sandbox') {
    const sessionKey = (await getSessionKey(req))
    let body: Record<string, unknown> = {}
    try {
      body = asSetupPayload(JSON.parse(await readBody(req)))
    } catch { /* malformed or missing JSON uses the default sandbox setup */ }

    let cardEdition: CardEditionChoice
    try {
      assertSupportedGameConfiguration(body)
      cardEdition = parseCardEditionChoice(body)
    } catch (error) {
      await sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid game configuration' })
      return true
    }

    const requestedPlayerCount = clampPlayerCount(body.playerCount)
    const enableFarmersOfTheMoor = body.enableFarmersOfTheMoor === true
    const sandboxOptions = {
      ...cardEdition,
      playerCount: Math.max(2, requestedPlayerCount),
      enableThroughTheSeasons: body.enableThroughTheSeasons === true,
      enableFarmersOfTheMoor,
      allowIncompleteFarmersOfTheMoorMinorDeal: enableFarmersOfTheMoor && body.allowIncompleteFarmersOfTheMoorMinorDeal === true,
      enableSnakeOpening: body.enableSnakeOpening === true,
    }
    const rejection = classicAdmissionRejection({
      ...sandboxOptions,
      playerCount: requestedPlayerCount,
      enableCommunityDeck: body.enableCommunityDeck === true,
      enableParentCards: body.enableParentCards === true,
    }, classicEditionEnabled)
    if (rejection) {
      await sendJson(res, 400, { ok: false, ...rejection })
      return true
    }

    const seed = typeof body.seed === 'number' ? body.seed : undefined
    // Workshop cards play only in the browser sandbox (ADR 0052).
    if ((Array.isArray(body.customCardIds) && body.customCardIds.length > 0)
      || (Array.isArray(body.customCardVersions) && body.customCardVersions.length > 0)) {
      await sendJson(res, 400, { ok: false, error: 'Workshop cards are playtested only in the browser sandbox' })
      return true
    }
    const nextDecks = Array.isArray(body.deckIds) ? body.deckIds
      .filter((deck): deck is string => typeof deck === 'string')
      .map((deck) => deck.trim().toUpperCase())
      .filter((deck): deck is typeof defaultSandboxDeckIds[number] =>
        (defaultSandboxDeckIds as readonly string[]).includes(deck)) : []
    const deckIds = nextDecks.length > 0 ? [...new Set(nextDecks)] : [...defaultSandboxDeckIds]

    const generation = beginReplacement(sessionKey)

    await startSandboxGame(req, res, seed, {
      options: { ...sandboxOptions, deckIds },
    }, { key: sessionKey, generation })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/reset-sandbox') {
    let body: Record<string, unknown> = {}
    try { body = asSetupPayload(JSON.parse(await readBody(req))) } catch { /* reported below as invalid payload */ }
    if (typeof body.gameInstanceId !== 'string' ||
        (body.seed !== undefined && (typeof body.seed !== 'number' || !Number.isFinite(body.seed)))) {
      await sendJson(res, 400, { ok: false, error: 'Invalid sandbox reset request' })
      return true
    }
    const key = await getSessionKey(req)
    const previousSandbox = userSessions.get(key)
    const setup = previousSandbox && sandboxSetups.get(previousSandbox)
    if (!previousSandbox || !setup || gameInstanceIds.get(previousSandbox) !== body.gameInstanceId) {
      throw new SandboxReplacementError('sandbox_replaced', 'The active Workshop sandbox changed. Open it again to reset.')
    }
    const rejection = classicAdmissionRejection(setup.options, classicEditionEnabled)
    if (rejection) {
      await sendJson(res, 400, { ok: false, ...rejection })
      return true
    }
    await startSandboxGame(req, res, body.seed, setup, {
      key, generation: beginReplacement(key),
      previousSandbox: { session: previousSandbox, instanceId: body.gameInstanceId },
    })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/play-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devPlayCard(body.playerIndex!, body.cardId!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/draw-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      s => s.devDrawCard(body.playerIndex!, body.cardId!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-space-taken') {
    const body = JSON.parse(await readBody(req)) as { spaceId?: string; playerId?: string | null }
    if (typeof body.spaceId !== 'string') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devSetSpaceTaken(body.spaceId!, body.playerId ?? null),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-current-player') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devSetCurrentPlayer(body.playerIndex!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-resources') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; resources?: Record<string, number> }
    if (typeof body.playerIndex !== 'number' || !body.resources || typeof body.resources !== 'object') {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devSetResources(body.playerIndex!, body.resources!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/add-rooms') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; rooms?: Array<{ row: number; col: number }> }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.rooms)) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devAddRooms(body.playerIndex!, body.rooms!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-round') {
    const body = JSON.parse(await readBody(req)) as { round?: number }
    if (typeof body.round !== 'number') {
      await sendJson(res, 400, { ok: false, error: 'invalid round' })
      return true
    }
    const { resp, result } = await callAndRespond(
      req,
      s => s.devSetRound(body.round!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/draft-submit') {
    const body = JSON.parse(await readBody(req)) as {
      playerId?: string
      pick?: { opportunityKey?: unknown; occCardId?: unknown; minorCardId?: unknown }
    }
    const occCardId = typeof body.pick?.occCardId === 'string' ? body.pick.occCardId : undefined
    const minorCardId = typeof body.pick?.minorCardId === 'string' ? body.pick.minorCardId : undefined
    if (
      typeof body.playerId !== 'string' ||
      !body.pick ||
      typeof body.pick.opportunityKey !== 'string' ||
      (!occCardId && !minorCardId)
    ) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    {
      const session = (await getSessionForRequest(req))
      const viewerId = resolveViewerPlayerId(req, session)
      if (viewerId && body.playerId !== viewerId) {
        await sendJson(res, 403, { ok: false, error: 'seat mismatch' })
        return true
      }
    }
    const pick = { opportunityKey: body.pick.opportunityKey, occCardId, minorCardId }
    const { resp, result } = await callAndRespond(
      req,
      s => s.submitDraftPick(body.playerId!, pick),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

return false
}

export const handleGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  classicEditionEnabled: boolean = CLASSIC_EDITION_ENABLED,
): Promise<boolean> => {
  if (!req.url?.startsWith('/api/game/')) return false
  if (req.method === 'OPTIONS') { rawJson(res, 204, null); return true }
  // The debug sandbox is a development surface (#993): without anonymous
  // access every call needs a session, so unauthenticated callers cannot
  // drive server-side GameSessions.
  if (!allowAnonymousAccess() && !(await validateSession(requestSessionToken(req)))) {
    rawJson(res, 401, { ok: false, code: 'login_required', error: 'Login required' })
    return true
  }
  try {
    if (!authority) return await handleAuthorizedGameRoute(req, res, classicEditionEnabled)
    const key = await getSessionKey(req)
    const stamp = sessionStamps.get(key) ?? await authority.access.capture([], key === 'anonymous' ? [] : [key])
    await authority.check(stamp)
    requests.set(req, { stamp, revision: await authority.access.revision() })
    responses.set(res, req)
    return await handleAuthorizedGameRoute(req, res, classicEditionEnabled)
  } catch (error) {
    if (error instanceof ClassicPoolInsufficientError) {
      rawJson(res, 400, { ok: false, code: error.code, error: error.message, shortfall: error.shortfall })
      return true
    }
    if (!(error instanceof ExecutionRevokedError || error instanceof RoomOwnershipError || error instanceof SandboxReplacementError)) throw error
    rawJson(res, 409, { ok: false, code: error.code, error: error.message })
    return true
  }
}
