import { randomUUID } from 'node:crypto'
import type { SandboxAuthority } from './game/sandbox-authority'
import { ExecutionRevokedError, type ExecutionStamp } from './game/execution-access'
import { RoomOwnershipError } from './game/room-directory'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game/authoritative-session.ts'
import type { SowSelection } from '../shared/domain/index.ts'
import { validateFarmChoice, type FarmChoiceType } from '../shared/session/farm-choice-validation.ts'
import type { FarmTilePosition } from '../shared/contract/types.ts'
import type { MoorSpecialActionId } from '../shared/moor/types.ts'
import { getDb } from './db.ts'
import { validateSession, extractToken } from './auth.ts'
import { allowAnonymousAccess } from './anonymous-access.ts'
import type { CustomCardData } from '../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../shared/custom-code/types.ts'
import { defaultSandboxDeckIds } from '../shared/session/state-bootstrap.ts'
import { corsHeaders } from './http-origin.ts'
import {
  loadLiveDraft,
  loadSandboxVersion,
  type WorkshopDraft,
} from './workshop-drafts.ts'
import { isLoadableLive } from './workshop-status.ts'
import { parseDraftOptions, loadLiveCustomCards } from './connection/room-router.ts'
import {
  asSetupPayload,
  buildInitialStateOptions,
  parseGameSetupRequest,
  resolveCustomCardDbIds,
} from './game/game-setup-options.ts'
import {
  buildSessionSyncPayload,
  createIsolatedGameSession,
  type CustomSessionExecutor,
  type CustomSessionMethod,
} from './game/custom-session-executor.ts'

const workshopDraftToCustomCard = (draft: WorkshopDraft): CustomCardData => ({
  cardType: draft.cardType,
  cardJson: draft.cardJson as unknown as CustomCardData['cardJson'],
  effectCode: draft.effectCode,
  compiledCode: draft.compiledCode,
  codeManifest: draft.codeManifest as CustomCodeManifest | null,
  artUrl: draft.artUrl,
})

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
  sessionExecutors.get(userId)?.dispose()
  userSessions.get(userId)?.dispose()
  sessionExecutors.delete(userId); userSessions.delete(userId); sessionStamps.delete(userId)
  sessionCardDbIds.delete(userId); sessionLastAccess.delete(userId)
  sessionReplacementGenerations.set(userId, (sessionReplacementGenerations.get(userId) ?? 0) + 1)
}
export const shutdownSandboxSessions = (): void => {
  for (const key of [...userSessions.keys()]) disposeSandboxSessionsForUser(key)
}

// A seed may be reused; HTTP playtest identity follows the actual session.
const gameInstanceIds = new WeakMap<GameSession, string>()
const userSessions = new Map<string, GameSession>()
const sessionExecutors = new Map<string, CustomSessionExecutor>()
const sessionLastAccess = new Map<string, number>()
const sessionReplacementGenerations = new Map<string, number>()
const cardTakedownGenerations = new Map<string, number>()
// Workshop card db ids embedded in each sandbox session, so the admin kill
// switch (#641) can dispose sessions still executing a taken-down card.
const sessionCardDbIds = new Map<string, string[]>()
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Periodically clean up idle sessions
setInterval(() => {
  const now = Date.now()
  for (const [key, lastAccess] of sessionLastAccess) {
    if (now - lastAccess > SESSION_TTL_MS) {
      const session = userSessions.get(key)
      sessionExecutors.get(key)?.dispose()
      session?.dispose()
      userSessions.delete(key)
      sessionExecutors.delete(key)
      sessionLastAccess.delete(key)
      sessionReplacementGenerations.delete(key)
      sessionCardDbIds.delete(key)
    }
  }
}, 60_000).unref()

const getSessionKey = async (req: IncomingMessage): Promise<Awaited<string>> => {
  const user = (await validateSession(extractToken(req.headers.authorization)))
  if (!user && extractToken(req.headers.authorization) && authority) throw new ExecutionRevokedError('Session authorization ended')
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

const setSessionForRequest = async (
  req: IncomingMessage,
  s: GameSession,
  cardDbIds: string[] = [],
  executor?: CustomSessionExecutor,
): Promise<Awaited<void>> => {
  let key: string
  try {
    key = await getSessionKey(req)
    if (authority) {
      await authority.directory.db.transaction(async () => {
        const revision = requests.get(req)?.revision
        if (revision !== undefined) await authority!.access.assertRevision(revision)
        const stamp = await authority!.access.capture(cardDbIds, key === 'anonymous' ? [] : [key])
        await authority!.check(stamp)
        sessionStamps.set(key, stamp)
        requests.set(req, { stamp })
      })()
    }
  } catch (error) { executor?.dispose(); s.dispose(); throw error }
  const old = userSessions.get(key)
  if (old && old !== s) old.dispose()
  sessionExecutors.get(key)?.dispose()
  userSessions.set(key, s)
  if (executor) sessionExecutors.set(key, executor)
  else sessionExecutors.delete(key)
  sessionLastAccess.set(key, Date.now())
  if (cardDbIds.length > 0) sessionCardDbIds.set(key, cardDbIds)
  else sessionCardDbIds.delete(key)
}

/**
 * Admin kill switch (#641): dispose every HTTP sandbox session that embeds
 * the card, so its executable snapshot stops running (the TTL refresh would
 * otherwise keep it alive indefinitely).
 */
export const disposeSandboxSessionsUsingCard = (cardDbId: string): number => {
  cardTakedownGenerations.set(cardDbId, (cardTakedownGenerations.get(cardDbId) ?? 0) + 1)
  let disposed = 0
  for (const [key, ids] of [...sessionCardDbIds]) {
    if (!ids.includes(cardDbId)) continue
    sessionExecutors.get(key)?.dispose()
    userSessions.get(key)?.dispose()
    userSessions.delete(key)
    sessionExecutors.delete(key)
    sessionLastAccess.delete(key)
    sessionReplacementGenerations.delete(key)
    sessionCardDbIds.delete(key)
    sessionStamps.delete(key)
    disposed += 1
  }
  return disposed
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
const callAndRespond = async (
  req: IncomingMessage,
  method: CustomSessionMethod,
  args: unknown[],
  fn: (session: GameSession) => import('./game/authoritative-session.ts').SessionResponse,
) => {
  const session = (await getSessionForRequest(req))
  const executor = sessionExecutors.get((await getSessionKey(req)))
  const resp = executor
    ? await executor.execute(method, args)
    : session.withCtx(() => fn(session))
  if (method === 'loadState' && resp.ok) gameInstanceIds.delete(session)
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
  sessionExecutors.get('anonymous')?.dispose()
  sessionExecutors.delete('anonymous')
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
      headers: 'Content-Type, Authorization, X-Viewer-Player',
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
  let gameInstanceId = gameInstanceIds.get(session)
  if (!gameInstanceId) {
    gameInstanceId = randomUUID()
    gameInstanceIds.set(session, gameInstanceId)
  }
  return {
    ...buildSessionSyncPayload(session, resp, viewerPlayerId, viewerPlayerId === null ? 'debug' : 'viewer'),
    gameInstanceId,
  }
}

const handleAuthorizedGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    await sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const { result } = await callAndRespond(req, 'getState', [], s => s.getState())
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
      'takeAction',
      [body.playerIndex, body.spaceId],
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
      'takeSpecialAction',
      [body.playerIndex, body.cardId, body.actionId, body.payload],
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
      'resolveChoice',
      [body.playerIndex, body.value, body.payload],
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
      'takeAnytimeAction',
      [body.playerIndex, body.actionId],
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
      'resolveOrdinaryCardDrawChoice',
      [body.playerIndex, body.choiceId, body.keepCardId],
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
      'resolveChoice',
      [body.playerIndex, 'confirm', { selections: body.selections }],
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
    const payload = body.payload
    if (
      typeof body.playerIndex !== 'number' ||
      !isValidCommitSelectionPayload(payload)
    ) {
      await sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    if (!(await enforceSeatBinding(req, res, body.playerIndex))) return true
    const { resp, result } = await callAndRespond(
      req,
      'commitSelectionChoice',
      [body.playerIndex, payload],
      s => s.commitSelectionChoice(
        body.playerIndex!,
        payload,
      ),
    )
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
      'submitParentSelection',
      [body.playerIndex, selection],
      s => s.submitParentSelection(body.playerIndex!, selection),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    // Task 9: forwarded through resolveChoice; the synthetic
    // confirm-next-player pending envelope supplies `nextPlayerIndex`.
    const { resp, result } = await callAndRespond(req, 'confirmCurrentPlayer', [], (s) => {
      const idx = s.getState().state.currentPlayerIndex
      return s.resolveChoice(idx, 'confirm')
    })
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    // Task 9: forwarded through resolveChoice.
    const { resp, result } = await callAndRespond(req, 'confirmCurrentPlayer', [], (s) => {
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
    const { resp, result } = await callAndRespond(req, 'performRoundEnd', [], s => s.performRoundEnd())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const { resp, result } = await callAndRespond(req, 'undoStep', [], s => s.undoStep())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const { resp, result } = await callAndRespond(req, 'undoAction', [], s => s.undoAction())
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const session = (await getSessionForRequest(req))
    const executor = sessionExecutors.get((await getSessionKey(req)))
    try {
      const actions = executor
        ? await executor.query<{ spaceId: string; nameKey: string }[]>('getAvailableActions', [playerIndex])
        : session.withCtx(() => session.getAvailableActions(playerIndex))
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
    const { result } = await callAndRespond(req, 'loadState', [body.state], s => s.loadState(body.state))
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
      'startDevFenceSelect',
      [body.playerIndex],
      s => s.startDevFenceSelect(body.playerIndex!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: FarmChoiceType
      playerId: string
      payload: Record<string, unknown>
    }
    const session = (await getSessionForRequest(req))
    const executor = sessionExecutors.get((await getSessionKey(req)))
    try {
      const validation = executor
        ? await executor.query<ReturnType<typeof validateFarmChoice>>(
          'validateFarmChoice',
          [body.type, body.playerId, body.payload],
        )
        : validateFarmChoice(
          session.withCtx(() => session.getStateForRead()),
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
    const replacementGeneration = (sessionReplacementGenerations.get(sessionKey) ?? 0) + 1
    sessionReplacementGenerations.set(sessionKey, replacementGeneration)
    sessionLastAccess.set(sessionKey, Date.now())
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
    const setup = parseGameSetupRequest(raw, draftOptions.value)
    const customCardDbIds = resolveCustomCardDbIds(raw, setup.enableCommunityDeck)
    const requestUserId = (await validateSession(extractToken(req.headers.authorization)))?.id
    const loadedCustomCards = customCardDbIds.length > 0
      ? (await loadLiveCustomCards(customCardDbIds, requestUserId))
      : null
    if (loadedCustomCards?.hasNotLive) {
      await sendJson(res, 400, {
        ok: false,
        error: 'cards must pass review approval and be published live before they can be used in a game; unreviewed cards are only playable in the workshop sandbox',
      })
      return true
    }
    const customCards = loadedCustomCards?.cards ?? []
    const loadedCardDbIds = loadedCustomCards?.loadedDbIds ?? []
    const takedownGenerations = loadedCardDbIds.map((cardDbId) => [
      cardDbId,
      cardTakedownGenerations.get(cardDbId) ?? 0,
    ] as const)
    // Community cards are executable, so they must run in an isolated session
    // like the sandbox and Room paths do — never on the main event loop.
    const created = createIsolatedGameSession(
      seed,
      customCards.length > 0 ? customCards : undefined,
      buildInitialStateOptions(setup),
    )
    const session = created.session
    if (created.executor && !created.executor.reserveWorkerSlot()) {
      created.executor.dispose()
      session.dispose()
      await sendJson(res, 503, { ok: false, error: 'executable session worker capacity reached' })
      return true
    }
    if (takedownGenerations.some(([cardDbId, generation]) =>
      (cardTakedownGenerations.get(cardDbId) ?? 0) !== generation
    )) {
      created.executor?.dispose()
      session.dispose()
      await sendJson(res, 409, { ok: false, error: 'card taken down during initialization' })
      return true
    }
    if (sessionReplacementGenerations.get(sessionKey) !== replacementGeneration) {
      created.executor?.dispose()
      session.dispose()
      await sendJson(res, 409, { ok: false, error: 'session replaced by newer request' })
      return true
    }
    // Registering the card ids lets an administrator takedown dispose this game.
    ;(await setSessionForRequest(req, session, loadedCardDbIds, created.executor))
    const { result } = await callAndRespond(req, 'getState', [], s => s.getState())
    await sendJson(res, 200, result)
    return true
  }

  // Sandbox game: start a new single-player game with custom workshop cards loaded
  if (req.method === 'POST' && req.url === '/api/game/new-sandbox') {
    const sessionKey = (await getSessionKey(req))
    const replacementGeneration = (sessionReplacementGenerations.get(sessionKey) ?? 0) + 1
    sessionReplacementGenerations.set(sessionKey, replacementGeneration)
    sessionLastAccess.set(sessionKey, Date.now())
    let seed: number | undefined
    let customCardDbIds: string[] = []
    let playerCount = 2
    let deckIds = [...defaultSandboxDeckIds]
    let enableThroughTheSeasons = false
    let enableFarmersOfTheMoor = false
    let allowIncompleteFarmersOfTheMoorMinorDeal = false
    let enableSnakeOpening = false
    const customCardVersions = new Map<string, string>()
    try {
      const body = JSON.parse(await readBody(req)) as {
        seed?: number
        customCardIds?: string[]
        customCardVersions?: Array<{ cardId?: unknown; versionId?: unknown }>
        playerCount?: number
        deckIds?: string[]
        enableThroughTheSeasons?: boolean
        enableFarmersOfTheMoor?: boolean
        allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
        enableSnakeOpening?: boolean
      }
      if (typeof body.seed === 'number') seed = body.seed
      if (Array.isArray(body.customCardIds)) {
        customCardDbIds = body.customCardIds.filter((id): id is string => typeof id === 'string')
      }
      if (Array.isArray(body.customCardVersions)) {
        for (const binding of body.customCardVersions) {
          if (typeof binding.cardId !== 'string' || typeof binding.versionId !== 'string') continue
          customCardVersions.set(binding.cardId, binding.versionId)
          if (!customCardDbIds.includes(binding.cardId)) customCardDbIds.push(binding.cardId)
        }
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
      enableThroughTheSeasons = body.enableThroughTheSeasons === true
      enableFarmersOfTheMoor = body.enableFarmersOfTheMoor === true
      allowIncompleteFarmersOfTheMoorMinorDeal = enableFarmersOfTheMoor && body.allowIncompleteFarmersOfTheMoorMinorDeal === true
      enableSnakeOpening = body.enableSnakeOpening === true
    } catch { /* ignore */ }

    // Identify the requesting user (optional — allows loading own draft cards)
    const requestUser = (await validateSession(extractToken(req.headers.authorization)))

    // Load custom card data from the database.
    // Allow: published cards (anyone) OR draft cards owned by the requesting user.
    const customCards: CustomCardData[] = []
    const loadedCardDbIds: string[] = []
    const customCardVersionsLoaded: Array<{ cardId: string; versionId: string }> = []
    if (customCardDbIds.length > 0) {
      const db = getDb()
      for (const dbId of customCardDbIds) {
        const versionId = customCardVersions.get(dbId)
        if (versionId) {
          if (!requestUser) {
            await sendJson(res, 401, { ok: false, error: 'Authentication required for a draft version' })
            return true
          }
          try {
            const draft = (await loadSandboxVersion(db, {
              cardId: dbId,
              authorId: requestUser.id,
              versionId,
            }))
            customCards.push(workshopDraftToCustomCard(draft))
            loadedCardDbIds.push(dbId)
            customCardVersionsLoaded.push({ cardId: dbId, versionId })
          } catch (error) {
            await sendJson(res, 400, {
              ok: false,
              error: error instanceof Error ? error.message : 'Unable to load sandbox version',
            })
            return true
          }
          continue
        }
        const row = (await db.prepare(
          `SELECT card_type, card_json, code_manifest, art_url, review_status, live, built_in, author_id
           FROM workshop_cards WHERE id = ?`,
        ).get(dbId)) as {
          card_type: string
          card_json: string
          code_manifest: string | null
          art_url: string | null
          review_status: string; live: number; built_in: number; author_id: string
        } | undefined
        if (!row) continue
        // Graduated + built-in (#642): served by the built-in registry, not
        // injected per-session.
        if (row.review_status === 'merged' && row.built_in === 1) continue
        if (isLoadableLive(row)) {
          try {
            customCards.push(workshopDraftToCustomCard((await loadLiveDraft(db, dbId))))
            loadedCardDbIds.push(dbId)
          } catch (err) {
            console.warn(`[game-router] failed to load live custom card ${dbId}:`, err)
          }
          continue
        }
        const allowed = requestUser?.id === row.author_id
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
          loadedCardDbIds.push(dbId)
        } catch (err) {
          console.warn(`[game-router] failed to parse custom card ${dbId}:`, err)
        }
      }
    }

    const takedownGenerations = loadedCardDbIds.map((cardDbId) => [
      cardDbId,
      cardTakedownGenerations.get(cardDbId) ?? 0,
    ] as const)

    const created = createIsolatedGameSession(
      seed,
      customCards.length > 0 ? customCards : undefined,
      {
        playerCount,
        deckIds,
        enableThroughTheSeasons,
        enableFarmersOfTheMoor,
        allowIncompleteFarmersOfTheMoorMinorDeal,
        enableSnakeOpening,
      },
    )
    const sandboxSession = created.session
    if (created.executor && !created.executor.reserveWorkerSlot()) {
      created.executor.dispose()
      sandboxSession.dispose()
      await sendJson(res, 503, { ok: false, error: 'executable session worker capacity reached' })
      return true
    }
    const resp = created.executor
      ? await created.executor.execute('getState', [])
      : sandboxSession.withCtx(() => sandboxSession.getState())
    if (takedownGenerations.some(([cardDbId, generation]) =>
      (cardTakedownGenerations.get(cardDbId) ?? 0) !== generation
    )) {
      created.executor?.dispose()
      sandboxSession.dispose()
      await sendJson(res, 409, { ok: false, error: 'sandbox card taken down during initialization' })
      return true
    }
    if (sessionReplacementGenerations.get(sessionKey) !== replacementGeneration) {
      created.executor?.dispose()
      sandboxSession.dispose()
      await sendJson(res, 409, { ok: false, error: 'sandbox replaced by newer request' })
      return true
    }
    const result = respondWith(
      resp,
      sandboxSession,
      resolveViewerPlayerId(req, sandboxSession),
    )
    const payload = {
      ...result,
      customCardsLoaded: customCards.length,
      customCardVersionsLoaded,
      cardWarnings: sandboxSession.cardWarnings.length > 0 ? sandboxSession.cardWarnings : undefined,
    }
    if (!resp.ok) {
      created.executor?.dispose()
      sandboxSession.dispose()
      sessionLastAccess.set(sessionKey, Date.now())
      await sendJson(res, 200, payload)
      return true
    }
    ;(await setSessionForRequest(req, sandboxSession, loadedCardDbIds, created.executor))
    await sendJson(res, 200, payload)
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
      'devPlayCard',
      [body.playerIndex, body.cardId],
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
      'devDrawCard',
      [body.playerIndex, body.cardId],
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
      'devSetSpaceTaken',
      [body.spaceId, body.playerId ?? null],
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
      'devSetCurrentPlayer',
      [body.playerIndex],
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
      'devSetResources',
      [body.playerIndex, body.resources],
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
      'devAddRooms',
      [body.playerIndex, body.rooms],
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
      'devSetRound',
      [body.round],
      s => s.devSetRound(body.round!),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
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
    const pick = { occCardId, minorCardId }
    const { resp, result } = await callAndRespond(
      req,
      'submitDraftPick',
      [body.playerId, pick],
      s => s.submitDraftPick(body.playerId!, pick),
    )
    await sendJson(res, resp.ok ? 200 : 400, result)
    return true
  }

return false
}

export const handleGameRoute = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  if (!req.url?.startsWith('/api/game/')) return false
  // The debug sandbox is a development surface (#993): without anonymous
  // access every call needs a session, so unauthenticated callers cannot
  // drive server-side GameSessions or custom-code executors.
  if (!allowAnonymousAccess() && !(await validateSession(extractToken(req.headers.authorization)))) {
    rawJson(res, 401, { ok: false, code: 'login_required', error: 'Login required' })
    return true
  }
  if (!authority) return handleAuthorizedGameRoute(req, res)
  try {
    const key = await getSessionKey(req)
    const stamp = sessionStamps.get(key) ?? await authority.access.capture([], key === 'anonymous' ? [] : [key])
    await authority.check(stamp)
    requests.set(req, { stamp, revision: await authority.access.revision() })
    responses.set(res, req)
    return await handleAuthorizedGameRoute(req, res)
  } catch (error) {
    if (!(error instanceof ExecutionRevokedError || error instanceof RoomOwnershipError)) throw error
    rawJson(res, 409, { ok: false, code: error.code, error: error.message })
    return true
  }
}
