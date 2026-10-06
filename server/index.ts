import { createObservationDatabase } from './observability/database'
import { createCollector } from './observability/collector'
import { operationsMetrics } from './observability/metrics'
import { clientIp as getClientIp } from './client-ip'
import { createOperationsHandler } from './observability/http'
import { InvalidationStore } from './invalidation'
import { SandboxAuthority } from './game/sandbox-authority'
import { RoomDirectory } from './game/room-directory'
import { CommandStore } from './game/command-store'
import { discoverRoom } from './game/room-discovery'
import type { RoomDiscoveryRequest } from '../shared/contract/protocol/routing'
import { isUniqueViolation } from './database/errors'
import { consumeRateLimit } from './database/rate-limit'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { handleGameRoute, disposeSandboxSessionsUsingCard, configureSandboxAuthority, disposeSandboxSessionsForUser, shutdownSandboxSessions } from './game-router.ts'
import { handleWorkshopRoute } from './workshop.ts'
import { createWsServer } from './connection/ws-server.ts'
import { initializeDatabase, getDb, cleanExpiredSessions } from './db.ts'
import { PostgresRoomPersistence } from './game/persistence/postgres-adapter.ts'
import {
  login,
  logout,
  logoutAll,
  validateSession,
  extractToken,
  updateDisplayName,
  changePassword,
  cleanupPendingPasswordUser,
  isAdmin,
  createSession,
  deferAccountDeletion,
  claimPendingAccountDeletion,
  renewAccountDeletion,
  finishAccountDeletion,
  registerPasswordUser,
  requestAccountDeletion,
  resendVerificationEmail,
  sendVerificationEmail,
  verifyEmailToken,
  type AuthErrorCode,
  type AuthUser,
} from './auth.ts'
import { clearSessionCookie, readCookies, serializeOnboardingCookie, serializeSessionCookie, SESSION_COOKIE } from './auth-cookies.ts'
import { corsHeaders, getRequestOrigin, isTrustedOrigin } from './http-origin.ts'
import { createInvite, listInvites, revokeInvite } from './invites.ts'
import {
  handleLinkedIdentities,
  handleOAuthCallback,
  handleOAuthStart,
  handleOnboardingComplete,
  handleRegistrationPolicy,
} from './oauth/handler.ts'
import { assertOAuthProvider } from './oauth/providers.ts'
import { createOnboardingTicket, findIdentity } from './oauth/store.ts'
import { installShutdownHandlers } from './shutdown.ts'
import { GameContextStore } from './game/game-context-store.ts'
import { handleGameContextRoute } from './game-context-routes.ts'
import { ReplayStore } from './game/replay-store.ts'
import { handleReplayRoute, ReplayReadLimiter } from './replay-routes.ts'
import { GameSession } from './game/authoritative-session.ts'
import { encodeReplayFrame, type JsonValue } from './game/replay-codec.ts'
import { getResources, closeResources } from './storage/runtime'
import { ReplayResources } from './storage/replay-resources'
import { objectHash } from './storage/s3-store'
import { REPLAY_SCHEMA_VERSION } from './game/room-committer.ts'
import {
  bugReportsEnabled,
  handleBugReportRoute,
  isBugReportRuntimeReady,
} from './bug-report-routes.ts'
import {
  BugReportDelivery,
  BugReportError,
  BugReportStore,
  TokenCipher,
} from './bug-report/bug-report-store.ts'
import { GitHubIssueClient } from './bug-report/github-issue-client.ts'
import { applyReplayRemovalLedger } from './game/replay-removal.ts'
import { adminTakedownCard, markBuiltInMergedCards, reconcilePendingMerges } from './workshop-drafts.ts'
import { ALL_CARD_IMPLS } from '../shared/cards/register-all.ts'


const serverCorsHeaders = () => corsHeaders({
  methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  headers: 'Content-Type, Authorization',
})

const sendJson = (res: ServerResponse, status: number, payload: unknown, headers: Record<string, string | string[]> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...serverCorsHeaders(), ...headers })
  res.end(JSON.stringify(payload))
}

const authError = (code: AuthErrorCode, error: string) => ({ ok: false, code, error })

const changePasswordErrorCode = (error: string): AuthErrorCode =>
  error === 'User not found' ? 'not_authenticated' : 'invalid_password'

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

/** Parse JSON body, return null on failure. */
const parseBody = async <T = Record<string, unknown>>(req: IncomingMessage): Promise<T | null> => {
  try {
    const raw = await readBody(req)
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 10
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_INVITE_AGE_MS = 365 * DAY_MS

async function checkRateLimit(ip: string): Promise<boolean> {
  if (process.env.DISABLE_RATE_LIMIT === '1') return true
  return (await consumeRateLimit(getDb(), 'authentication', ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)).allowed
}


async function getAuthToken(req: IncomingMessage): Promise<string> {
  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  let validCookie: string | undefined
  for (const candidate of cookieTokens) {
    if (await validateSession(candidate)) { validCookie = candidate; break }
  }
  const bearer = extractToken(req.headers.authorization)
  return validCookie || bearer || cookieTokens[0] || ''
}

async function requireAdmin(req: IncomingMessage, res: ServerResponse): Promise<Awaited<AuthUser | null>> {
  const token = (await getAuthToken(req))
  const user = (await validateSession(token))
  if (!user) {
    sendJson(res, 401, authError('not_authenticated', 'Not authenticated'))
    return null
  }
  if (!isAdmin(user.username)) {
    sendJson(res, 403, authError('admin_required', 'Admin only'))
    return null
  }
  return user
}

async function forwardCookieSessionAsBearer(req: IncomingMessage): Promise<void> {
  if (req.headers.authorization) return
  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  let token = cookieTokens[0] ?? ''
  for (const candidate of cookieTokens) {
    if (await validateSession(candidate)) { token = candidate; break }
  }
  if (token) req.headers.authorization = `Bearer ${token}`
}

function isMutatingRequest(req: IncomingMessage): boolean {
  return req.method === 'POST'
    || req.method === 'PUT'
    || req.method === 'PATCH'
    || req.method === 'DELETE'
}

function rejectUntrustedOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isMutatingRequest(req) || isTrustedOrigin(req)) return false
  sendJson(res, 403, authError('csrf_rejected', 'Untrusted origin'))
  return true
}

// Initialize shared schema before accepting requests.
await initializeDatabase()
// Release-window takeover (#642): merged workshop cards now present in the
// built-in registry switch to the built-in definition.
{
  const graduated = (await reconcilePendingMerges(getDb()))
  if (graduated > 0) console.log(`[workshop] ${graduated} pending merge(s) graduated`)
  const { flagged, unflagged } = (await markBuiltInMergedCards(getDb(), Object.keys(ALL_CARD_IMPLS)))
  if (flagged > 0) console.log(`[workshop] ${flagged} merged card(s) now served by the built-in registry`)
  if (unflagged > 0) console.log(`[workshop] ${unflagged} merged card(s) fell back to their workshop snapshot (registry rollback)`)
}
if (process.env.NODE_ENV !== 'test') {
  await applyReplayRemovalLedger(getDb(), { resources: getResources() })
}

// Wire up room persistence adapter before creating the WS server
const directory = new RoomDirectory(getDb())
const invalidations = new InvalidationStore(getDb())
const persistence = new PostgresRoomPersistence(getDb(), directory)
const gameContextStore = new GameContextStore(getDb())
const replayStore = new ReplayStore(getDb())
const replayReadLimiter = new ReplayReadLimiter()
const bugReportCipher = TokenCipher.fromEnv()
const bugReportGithub = GitHubIssueClient.fromEnv()
const bugReportStore = bugReportCipher
  ? new BugReportStore(getDb(), bugReportCipher)
  : null
const bugReportDelivery = bugReportStore && bugReportGithub
  ? new BugReportDelivery(
      bugReportStore,
      bugReportGithub,
      process.env.PUBLIC_APP_ORIGIN ?? '',
    )
  : null
const bugReportRuntime = bugReportStore
  ? {
      db: getDb(),
      store: bugReportStore,
      delivery: bugReportDelivery,
      github: bugReportGithub,
    }
  : null

const createCompletedReplayFixture = async (defaultNames = false, recordReplay = true, initialState?: unknown) => {
  const viewerBuildId = process.env.REPLAY_VIEWER_BUILD_ID ?? ''
  if (recordReplay && !await new ReplayResources(getResources()).viewer(viewerBuildId)) {
    throw new Error('Replay viewer build is unavailable')
  }
  const roomId = `replay-${randomUUID()}`
  const session = new GameSession(42, undefined, {
    playerCount: 2,
    playerNames: defaultNames ? ['Player 2'] : ['Alice', 'Bob'],
  })
  if (initialState !== undefined && !session.loadState(initialState).ok) {
    throw new Error('Invalid initial Replay fixture state')
  }
  const capture = (): JsonValue => {
    const payload = session.buildSyncPayload(session.getState(), null, 'debug')
    return JSON.parse(JSON.stringify({
      ...payload.state,
      ...(payload.state.gameOver ? { scores: payload.scores ?? [] } : {}),
    })) as JsonValue
  }
  const frames = [capture()]
  session.state.players[0]!.resources.wood += 3
  frames.push(capture())
  session.state.currentPlayerIndex = 1
  session.state.players[1]!.resources.food += 2
  session.state.gameOver = true
  frames.push(capture())

  let checkpointStepNo = 0
  const encoded = frames.map((frame, stepNo) => {
    const step = encodeReplayFrame({
      frame,
      previousFrame: frames[stepNo - 1] ?? null,
      stepNo,
      previousCheckpointStepNo: checkpointStepNo,
    })
    checkpointStepNo = step.checkpointStepNo
    return step
  })
  const now = Date.now()
  const db = getDb()
  ;(await db.transaction(async () => {
    ;(await db.prepare(`
      INSERT INTO game_contexts (
        room_id, lifecycle, phase, replay_status, expires_at,
        removal_reason, created_at, updated_at
      ) VALUES (?, 'completed', NULL, ?, NULL, NULL, ?, ?)
    `).run(roomId, recordReplay ? 'available' : 'legacy_no_replay', now, now))
    if (recordReplay) {
      ;(await db.prepare(`
        INSERT INTO game_replays (
          room_id, schema_version, viewer_build_id, game_build_id, status,
          latest_step_no, missing_prefix, custom_cards_json, created_at, completed_at
        ) VALUES (?, ?, ?, ?, 'completed', ?, 0, '[]', ?, ?)
      `).run(
        roomId,
        REPLAY_SCHEMA_VERSION,
        viewerBuildId,
        process.env.GAME_BUILD_ID ?? 'test-build',
        frames.length - 1,
        now,
        now,
      ))
      const insertStep = db.prepare(`
        INSERT INTO game_replay_steps (
          room_id, step_no, room_version, checkpoint_step_no, player_index,
          command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const commandTypes = ['initial', 'takeAction', 'resolveChoice']
      for (const [stepNo, step] of encoded.entries()) {
      await insertStep.run(
        roomId,
        stepNo,
        stepNo,
        step.checkpointStepNo,
        stepNo === 0 ? null : stepNo - 1,
        commandTypes[stepNo],
        JSON.stringify(stepNo === 0 ? {} : { value: stepNo }),
        step.payloadKind,
        step.payloadGzip,
        step.frameHash,
        now + stepNo,
      )
      }
    }
    ;(await db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards, enable_through_the_seasons,
        enable_farmers_of_the_moor, enable_snake_opening
      ) VALUES (?, ?, ?, 1, 2, 0, 0, 0, 0, 0)
    `).run(roomId, now - 1000, now))
    const scores = session.getState().scores ?? []
    const insertPlayer = db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score, name_is_default
      ) VALUES (?, ?, ?, NULL, ?, ?, ?)
    `)
    for (const [playerIndex, player] of session.state.players.entries()) {
    await insertPlayer.run(
      roomId,
      playerIndex,
      player.id,
      player.name,
      scores.find((score) => score.playerId === player.id)?.total ?? 0,
      player.nameIsDefault === true ? 1 : 0,
    )
    }
  })())
  return {
    ok: true,
    roomId,
    firstStepHash: encoded[0]!.frameHash,
  }
}

let wssCtx: Awaited<ReturnType<typeof createWsServer>> | null = null

let invalidationRunning = false
const processInvalidations = async (): Promise<void> => {
  const instanceId = wssCtx?.authority?.instanceId
  if (!instanceId || invalidationRunning) return
  invalidationRunning = true
  try {
    await invalidations.drain(instanceId, async operation => {
      for (const cardId of operation.cardIds) disposeSandboxSessionsUsingCard(cardId)
      if (operation.kind === 'user') disposeSandboxSessionsForUser(operation.subjectId)
      await wssCtx!.applyInvalidation(operation)
    })
  } finally { invalidationRunning = false }
}

const retryPendingAccountDeletion = async (userId?: string): Promise<void> => {
  const claim = await claimPendingAccountDeletion(userId)
  if (!claim) return
  let lostClaim = false
  const renew = setInterval(() => {
    void renewAccountDeletion(claim).then(ok => { if (!ok) lostClaim = true }, () => { lostClaim = true })
  }, 10000)
  try {
    const operation = await invalidations.latest('user', claim.userId)
    if (operation?.pending) { await deferAccountDeletion(claim, 'instances_retiring', Date.now() + 1000); return }
    const external = await getDb().prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM bug_reports WHERE reporter_user_id=? AND (submitted_at IS NOT NULL OR github_issue_number IS NOT NULL))
      OR EXISTS(SELECT 1 FROM issue_submission_connections WHERE user_id=?)`).get(claim.userId, claim.userId)
    if (external) {
      if (!bugReportDelivery) throw new BugReportError('bug_report_deletion_failed', 503)
      await bugReportDelivery.deleteReporter(claim.userId)
    }
    if (!lostClaim) await finishAccountDeletion(claim)
  } catch (error) {
    const failure = error instanceof BugReportError ? error : new BugReportError('bug_report_deletion_failed', 503)
    if (!lostClaim) await deferAccountDeletion(claim, failure.code, failure.retryAt)
  } finally { clearInterval(renew) }
}

const invalidationTimer = setInterval(() => {
  void processInvalidations().catch(error => console.error('[invalidation] cleanup pending', error))
}, 1000)

// Periodically clean expired sessions and replay evidence (every hour)
const sessionCleanupTimer = setInterval(async () => {
  try {
    await cleanExpiredSessions()
    await directory.cleanup()
    await new CommandStore(getDb()).cleanup()
    await wssCtx?.committer?.cleanupReplayAssets()
  } catch (error) { console.error('[storage] periodic cleanup pending', error) }
}, 60 * 60 * 1000)
const bugReportDeliveryTimer = setInterval(() => {
  void retryPendingAccountDeletion().then(
    () => bugReportDelivery?.retryGrantRevocation(),
  ).then(
    () => isBugReportRuntimeReady(bugReportRuntime)
      ? bugReportDelivery?.deliverDue()
      : undefined,
  ).catch(() => {
    console.error('[bug-report-delivery] delivery loop failed')
  })
}, 5_000)

const observationDb = createObservationDatabase()
const handleOperations = createOperationsHandler({ db: getDb(), collect: createCollector(getDb(), 'app', () => wssCtx?.observation(), () => wssCtx?.authority?.instanceId, async () => (await wssCtx?.committer?.canCreateRoom())?.ok === true, observationDb) })
const server = createServer((req, res) => {
  operationsMetrics.http(req, res)
  return handleRequest(req, res).catch(error => {
    console.error('[http] request failed', error)
    if (!res.headersSent) sendJson(res, 503, { error: 'Service temporarily unavailable' })
    else res.destroy()
  })
})

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, serverCorsHeaders())
    res.end()
    return
  }

  if (rejectUntrustedOrigin(req, res)) return

  if (await handleOperations(req, res)) return

  // ── Health ─────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/health') {
    if (bugReportsEnabled() && !isBugReportRuntimeReady(bugReportRuntime)) {
      sendJson(res, 503, { ok: false, error: 'bug report delivery is unavailable' })
      return
    }
    const readiness = await wssCtx?.committer?.canCreateRoom()
    if (readiness && !readiness.ok) {
      sendJson(res, 503, { ok: false, error: readiness.error })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  if (
    req.url.startsWith('/api/v1/replays/')
    || req.url.startsWith('/replay-viewers/')
    || req.url.startsWith('/replay-assets/')
  ) {
    if ((await handleReplayRoute(req, res, replayStore, {
      resources: new ReplayResources(getResources()),
      limiter: replayReadLimiter,
    }))) return
  }

  const requestUser = (await validateSession((await getAuthToken(req))))

  if (req.method === 'POST' && req.url === '/api/rooms/locate') {
    const anonymous = process.env.NODE_ENV !== 'production' && process.env.ALLOW_ANONYMOUS_WS !== 'false'
    if (!requestUser && !anonymous) { sendJson(res, 401, { error: 'Login required', code: 'login_required' }); return }
    try {
      const input = JSON.parse(await readBody(req)) as RoomDiscoveryRequest
      const route = await discoverRoom(directory, requestUser ? `user:${requestUser.id}` : 'development-anonymous', input)
      sendJson(res, 200, route)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : 'room_unavailable'
      sendJson(res, 409, { code, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.url.startsWith('/api/v1/game-contexts/')) {
    if ((await handleGameContextRoute(req, res, gameContextStore, requestUser))) return
  }

  // ── Auth routes ────────────────────────────────────────
  if (req.url?.startsWith('/api/auth/oauth/')) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    if (req.method === 'GET' && url.pathname.endsWith('/start')) {
      ;(await handleOAuthStart(req, res, url))
      return
    }
    if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
      await handleOAuthCallback(req, res, url)
      return
    }
  }

  if (req.url === '/api/auth/registration-policy' && req.method === 'GET') {
    handleRegistrationPolicy(req, res)
    return
  }

  if (req.url === '/api/auth/onboarding/complete' && req.method === 'POST') {
    await handleOnboardingComplete(req, res)
    return
  }

  if (req.url === '/api/auth/identities' && req.method === 'GET') {
    ;(await handleLinkedIdentities(req, res))
    return
  }

  if (req.url === '/api/auth/register' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!(await checkRateLimit(ip))) {
      sendJson(res, 429, authError('rate_limited', 'Too many requests'))
      return
    }
    const body = await parseBody<{
      username?: string
      email?: string
      password?: string
      confirmPassword?: string
      displayName?: string
      inviteCode?: string
    }>(req)
    if (!body?.username || !body.email || !body.password || !body.confirmPassword) {
      sendJson(res, 400, authError('missing_fields', 'Missing registration fields'))
      return
    }
    const result = await registerPasswordUser({
      username: body.username,
      email: body.email,
      password: body.password,
      confirmPassword: body.confirmPassword,
      displayName: body.displayName,
      inviteCode: body.inviteCode,
    })
    if (!result.ok) {
      sendJson(res, 400, result)
      return
    }
    try {
      await sendVerificationEmail(result.userId, body.email)
    } catch {
      ;(await cleanupPendingPasswordUser(result.userId, result.consumedInviteCodeHash))
      sendJson(res, 500, authError('email_delivery_failed', 'Failed to send verification email'))
      return
    }
    sendJson(res, 200, { ok: true, status: 'verification_required' })
    return
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!(await checkRateLimit(ip))) {
      sendJson(res, 429, authError('rate_limited', 'Too many requests'))
      return
    }
    const body = await parseBody<{ username?: string; password?: string }>(req)
    if (!body?.username || !body.password) {
      sendJson(res, 400, authError('missing_fields', 'Missing username or password'))
      return
    }
    const result = await login(body.username, body.password)
    if (!result.ok) {
      sendJson(res, 400, result)
      return
    }
    sendJson(res, 200, { ok: true, user: result.user }, { 'Set-Cookie': serializeSessionCookie(result.token, { backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const token = (await getAuthToken(req))
    if (token) (await logout(token))
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/logout-all' && req.method === 'POST') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (user) {
      ;(await logoutAll(user.id))
      wssCtx?.closeUserConnections(user.id)
    }
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/account' && req.method === 'DELETE') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    const operation = await invalidations.begin('user', user.id, () => requestAccountDeletion(user.id))
    await processInvalidations()
    await retryPendingAccountDeletion(user.id)
    const pending = !!await getDb().prepare('SELECT 1 FROM users WHERE id=?').get(user.id)
    sendJson(res, pending ? 202 : 200, { ok: true, pending, operationId: operation.id }, {
      'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }),
    })
    return
  }

  if (req.url === '/api/auth/profile' && req.method === 'PATCH') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    const body = await parseBody<{ displayName?: string }>(req)
    const err = (await updateDisplayName(user.id, body?.displayName ?? ''))
    if (err) { sendJson(res, 400, authError('invalid_display_name', err)); return }
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/auth/change-password' && req.method === 'POST') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    const body = await parseBody<{ oldPassword?: string; newPassword?: string }>(req)
    if (!body?.oldPassword || !body.newPassword) {
      sendJson(res, 400, authError('missing_fields', 'Missing oldPassword or newPassword')); return
    }
    const err = await changePassword(user.id, body.oldPassword, body.newPassword)
    if (err) { sendJson(res, 400, authError(changePasswordErrorCode(err), err)); return }
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url?.startsWith('/api/auth/verify-email') && req.method === 'GET') {
    const parsed = new URL(req.url, getRequestOrigin(req) || 'http://localhost')
    const token = parsed.searchParams.get('token') ?? ''
    const result = (await verifyEmailToken(token))
    const appOrigin = process.env.PUBLIC_APP_ORIGIN || '/'
    if (!result.ok) {
      res.statusCode = 302
      res.setHeader('Location', `${appOrigin.replace(/\/?$/, '/')}?page=login&authError=invalid_or_expired_token`)
      res.end()
      return
    }
    res.statusCode = 302
    res.setHeader('Location', appOrigin)
    res.setHeader('Set-Cookie', serializeSessionCookie(result.token, { backendOrigin: getRequestOrigin(req) }))
    res.end()
    return
  }

  if (req.url === '/api/auth/resend-verification' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!(await checkRateLimit(ip))) {
      sendJson(res, 429, authError('rate_limited', 'Too many requests'))
      return
    }
    const body = await parseBody<{ email?: string }>(req)
    if (!body?.email) {
      sendJson(res, 400, authError('missing_fields', 'Missing email'))
      return
    }
    const result = await resendVerificationEmail(body.email)
    sendJson(res, result.ok ? 200 : 500, result)
    return
  }

  if (req.url === '/api/auth/me' && req.method === 'GET') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) {
      sendJson(res, 401, authError('not_authenticated', 'Not authenticated'))
      return
    }
    sendJson(res, 200, { ok: true, user: { ...user, isAdmin: isAdmin(user.username) } })
    return
  }

  if (req.url?.startsWith('/api/test/oauth/') && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH_TEST_HELPERS !== '1') {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const parts = url.pathname.split('/')
    const provider = parts[4] ?? ''
    if (parts.length !== 6 || parts[5] !== 'callback') {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    try {
      assertOAuthProvider(provider)
    } catch {
      sendJson(res, 400, { ok: false, code: 'unsupported_oauth_provider', error: 'Unsupported OAuth provider' })
      return
    }

    const body = await parseBody<{
      provider?: string
      providerUserId?: string
      providerLogin?: string
      email?: string
      displayName?: string
      avatarUrl?: string
    }>(req)
    if (!body?.providerUserId || (body.provider && body.provider !== provider)) {
      sendJson(res, 400, { ok: false, error: 'Invalid OAuth test profile' })
      return
    }

    const profile = {
      provider,
      providerUserId: body.providerUserId,
      emailVerified: true,
      ...(body.providerLogin ? { providerLogin: body.providerLogin } : {}),
      ...(body.email ? { email: body.email } : {}),
      ...(body.displayName ? { displayName: body.displayName } : {}),
      ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
    }
    const existing = (await findIdentity(provider, body.providerUserId))
    if (existing) {
      const token = (await createSession(existing.userId))
      if (!token) {
        sendJson(res, 401, authError('not_authenticated', 'Not authenticated'))
        return
      }
      sendJson(res, 200, { ok: true, provider, mode: 'login' }, { 'Set-Cookie': serializeSessionCookie(token, { backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
      return
    }

    const ticket = (await createOnboardingTicket(profile))
    sendJson(res, 200, { ok: true, provider, mode: 'onboarding' }, { 'Set-Cookie': serializeOnboardingCookie(ticket, { backendOrigin: getRequestOrigin(req) }) })
    return
  }

  if (req.url?.split('?')[0] === '/api/test/replays/completed' && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH_TEST_HELPERS !== '1') {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    try {
      const params = new URLSearchParams(req.url.split('?')[1])
      const raw = await readBody(req)
      const body = raw ? JSON.parse(raw) as { state?: unknown } : {}
      sendJson(res, 201, (await createCompletedReplayFixture(params.get('defaultNames') === '1', params.get('recordReplay') !== '0', body.state)))
    } catch (error) {
      sendJson(res, 503, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to create replay fixture',
      })
    }
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/admin/operations/')) {
    if (!await requireAdmin(req, res)) return
    const operation = await invalidations.status(req.url.slice('/api/admin/operations/'.length))
    sendJson(res, operation ? 200 : 404, operation ? { ok: true, operationId: operation.id, pending: operation.pending } : { ok: false, error: 'Operation not found' })
    return
  }

  // Admin kill switch (#641): force a card offline, void its approval and
  // terminate every running game that embeds it. Games end without scores,
  // game_results or a completed replay (their recording rows are removed).
  if (req.method === 'POST' && req.url?.startsWith('/api/admin/cards/') && req.url.endsWith('/takedown')) {
    const adminUser = (await requireAdmin(req, res))
    if (!adminUser) return
    try {
      let cardDbId: string
      try {
        cardDbId = decodeURIComponent(
          req.url.slice('/api/admin/cards/'.length, req.url.length - '/takedown'.length),
        )
      } catch {
        sendJson(res, 400, { ok: false, error: 'Malformed card id' })
        return
      }
      let card: Awaited<ReturnType<typeof adminTakedownCard>> | undefined
      const operation = await invalidations.begin('card', cardDbId, async () => { card = await adminTakedownCard(getDb(), cardDbId) })
      await processInvalidations()
      const status = (await invalidations.status(operation.id))!
      sendJson(res, status.pending ? 202 : 200, { ok: true, card, endedRoomIds: operation.roomIds, operationId: operation.id, pending: status.pending })
    } catch (error) {
      const notFound = error instanceof Error && error.message === 'Card not found'
      sendJson(res, notFound ? 404 : 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (req.url?.startsWith('/api/admin/invites')) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const adminUser = (await requireAdmin(req, res))
    if (!adminUser) return

    if (req.method === 'GET' && url.pathname === '/api/admin/invites') {
      sendJson(res, 200, { ok: true, invites: (await listInvites()) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/invites') {
      const body = await parseBody<{
        code?: unknown
        expiresAt?: unknown
        expiresInDays?: unknown
        maxUses?: unknown
      }>(req)
      const now = Date.now()
      const rawCode = body?.code
      if (rawCode !== undefined && typeof rawCode !== 'string') {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_code', error: 'Invalid invite code' })
        return
      }
      const code = rawCode?.trim() || undefined
      if (code && code.length > 128) {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_code', error: 'Invalid invite code' })
        return
      }

      const rawExpiresAt = body?.expiresAt
      const rawExpiresInDays = body?.expiresInDays
      const hasExpiresAt = rawExpiresAt !== undefined
      const hasExpiresInDays = rawExpiresInDays !== undefined
      if (hasExpiresAt && hasExpiresInDays) {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_expiry', error: 'Invalid invite expiration' })
        return
      }

      const expiresInDays = hasExpiresInDays ? rawExpiresInDays : 7
      if (!hasExpiresAt && (
        typeof expiresInDays !== 'number'
        || !Number.isInteger(expiresInDays)
        || expiresInDays < 1
        || expiresInDays > 365
      )) {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_expiry', error: 'Invalid invite expiration' })
        return
      }

      const expiresAt = hasExpiresAt
        ? rawExpiresAt
        : now + (expiresInDays as number) * DAY_MS
      if (typeof expiresAt !== 'number'
        || !Number.isSafeInteger(expiresAt)
        || expiresAt <= now
        || expiresAt > now + MAX_INVITE_AGE_MS
      ) {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_expiry', error: 'Invalid invite expiration' })
        return
      }

      const maxUses = body?.maxUses ?? 1
      if (typeof maxUses !== 'number' || !Number.isSafeInteger(maxUses) || maxUses < 1) {
        sendJson(res, 400, { ok: false, code: 'invalid_invite_max_uses', error: 'Invalid invite maximum uses' })
        return
      }

      try {
        const invite = (await createInvite(adminUser.id, { code, expiresAt, maxUses }))
        sendJson(res, 200, { ok: true, invite })
      } catch (error) {
        if (isUniqueViolation(error, 'account_invites_code_hash_key')) {
          sendJson(res, 400, {
            ok: false,
            code: 'invite_code_taken',
            error: 'Invite code already exists',
          })
          return
        }
        throw error
      }
      return
    }

    const revokeMatch = /^\/api\/admin\/invites\/([^/]+)\/revoke$/.exec(url.pathname)
    if (req.method === 'POST' && revokeMatch) {
      const ok = (await revokeInvite(decodeURIComponent(revokeMatch[1]!)))
      sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: 'Invite not found' })
      return
    }
  }

  // ── Lobby routes ───────────────────────────────────────
  if (req.method === 'GET' && req.url && (req.url === '/api/rooms' || req.url.startsWith('/api/rooms?'))) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const rawLimit = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50
    sendJson(res, 200, { ok: true, rooms: await directory.lobby(limit) })
    return
  }

  // Dissolve a room (HTTP, for lobby use)
  if (req.method === 'POST' && req.url?.startsWith('/api/rooms/') && req.url.endsWith('/dissolve')) {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const roomId = req.url.slice('/api/rooms/'.length, req.url.length - '/dissolve'.length)
    await wssCtx!.authority?.load(roomId)
    const result = (await wssCtx!.lobby.dissolveRoomById(roomId, user.id))
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // Rooms the current user has participated in (shared PostgreSQL)
  if (req.method === 'GET' && req.url === '/api/lobby/my-rooms') {
    const token = (await getAuthToken(req))
    const user = (await validateSession(token))
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    try {
      const rows = (await getDb().prepare(`
        SELECT r.id, r.status, r.max_players, r.updated_at, rp.player_index,
               CASE WHEN r.status = 'playing' AND r.state_json IS JSON THEN
                 CASE WHEN r.state_json::jsonb #>> '{state,phase}' = 'playing'
                        AND (r.state_json::jsonb #>> '{state,gameOver}') IS DISTINCT FROM 'true'
                        AND COALESCE(
                              (r.state_json::jsonb #>> '{sessionCursor,engineStackCursor,frames,-1,ownerPlayerIndex}')::integer,
                              (r.state_json::jsonb #>> '{state,currentPlayerIndex}')::integer
                            ) = rp.player_index
                      THEN 1 ELSE 0 END
               ELSE 0 END AS my_turn
        FROM room_players rp
        JOIN rooms r ON rp.room_id = r.id
        WHERE rp.user_id = ? AND r.status != 'finished'
        ORDER BY my_turn DESC, r.updated_at DESC
        LIMIT 20
      `).all(user.id)) as Array<{ id: string; status: string; max_players: number; updated_at: number; player_index: number; my_turn: number }>
      sendJson(res, 200, { ok: true, rooms: rows })
    } catch {
      sendJson(res, 200, { ok: true, rooms: [] })
    }
    return
  }

  // Private object storage remains behind product routes and shared barriers.
  if (req.method === 'GET' && req.url?.startsWith('/card-art/')) {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (!/^\/card-art\/[A-Za-z0-9._-]+$/.test(pathname)) { sendJson(res, 404, { error: 'Not found' }); return }
    const object = await getResources().read(pathname.slice(1))
    if (!object) { sendJson(res, 404, { error: 'Not found' }); return }
    const etag = `"${objectHash(object.body)}"`
    res.writeHead(req.headers['if-none-match'] === etag ? 304 : 200, {
      'Content-Type': object.contentType, 'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff', ETag: etag, ...serverCorsHeaders(),
    })
    res.end(req.headers['if-none-match'] === etag ? undefined : object.body)
    return
  }

  if (req.method === 'POST' && req.url === '/api/workshop/art') {
    const user = await validateSession(await getAuthToken(req))
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      bytes += chunk.length
      if (bytes > 7 * 1024 * 1024) { req.resume(); sendJson(res, 413, { ok: false, error: 'Image too large (max 5MB)' }); return }
      chunks.push(Buffer.from(chunk))
    }
    let dataUrl = ''
    try { dataUrl = JSON.parse(Buffer.concat(chunks).toString('utf8')).dataUrl ?? '' } catch { /* invalid input */ }
    const match = typeof dataUrl === 'string' && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
    if (!match) { sendJson(res, 400, { ok: false, error: 'Invalid data URL' }); return }
    const [, mime, b64] = match
    const body = Buffer.from(b64!, 'base64')
    if (body.length > 5 * 1024 * 1024) { sendJson(res, 413, { ok: false, error: 'Image too large (max 5MB)' }); return }
    const actual = body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : body[0] === 0xff && body[1] === 0xd8 ? 'image/jpeg'
        : body.subarray(0, 4).toString() === 'RIFF' && body.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null
    if (actual !== mime) { sendJson(res, 400, { ok: false, error: 'Image content does not match its type' }); return }
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
    const key = `card-art/${randomUUID()}.${ext}`
    await getResources().stage(key, body, mime!)
    sendJson(res, 200, { ok: true, url: `/${key}` })
    return
  }

  // ── Workshop routes ────────────────────────────────────
  if (
    req.url === '/api/github/webhook'
    || req.url?.startsWith('/api/workshop/')
    || req.url?.startsWith('/api/admin/')
  ) {
    ;(await forwardCookieSessionAsBearer(req))
    const handled = await handleWorkshopRoute(req, res)
    if (handled) return
  }

  // ── Game routes (existing) ─────────────────────────────
  if (req.url?.startsWith('/api/game/')) {
    ;(await forwardCookieSessionAsBearer(req))
    const handled = await handleGameRoute(req, res)
    if (handled) return
  }

  if (await handleBugReportRoute(
    req,
    res,
    bugReportRuntime,
    requestUser,
    requestUser ? isAdmin(requestUser.username) : false,
  )) return

  sendJson(res, 404, { error: 'Not found' })
}

wssCtx = (await createWsServer(server, {
  persistence,
  gameContextStore,
  directory,
  internalUrl: process.env.INSTANCE_INTERNAL_URL,
}))

configureSandboxAuthority(new SandboxAuthority(directory, wssCtx.authority!.instanceId))
await processInvalidations()

const PORT = Number(process.env.BACKEND_PORT) || 5175
const HOST = process.env.BACKEND_HOST || undefined
server.listen(PORT, HOST, () => {
  const addr = HOST ? `http://${HOST}:${PORT}` : `http://localhost:${PORT}`
  console.log(`Server listening on ${addr}`)
  console.log(`WebSocket available at ws://${HOST || 'localhost'}:${PORT}/ws`)
})

installShutdownHandlers(async () => {
  const closed = new Promise<void>(resolve => server.close(() => resolve()))
  clearInterval(sessionCleanupTimer)
  clearInterval(invalidationTimer)
  shutdownSandboxSessions()
  clearInterval(bugReportDeliveryTimer)
  await wssCtx?.shutdown()
  await observationDb.close()
  await closed
  closeResources()
  await getDb().close()
})
