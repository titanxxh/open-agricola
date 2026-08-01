import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { handleGameRoute } from './game-router.ts'
import { handleWorkshopRoute } from './workshop.ts'
import { createWsServer } from './connection/ws-server.ts'
import { isDevRoom, type Room } from './game/room.ts'
import { getDb, cleanExpiredSessions } from './db.ts'
import { SqliteRoomPersistence } from './game/persistence/sqlite-adapter.ts'
import { JsonRoomPersistence } from './game/persistence/json-adapter.ts'
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
  deleteAccount,
  deferAccountDeletion,
  getAccountDeletionRoomIds,
  nextPendingAccountDeletion,
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
import { viewerBuildExists } from './game/replay-viewer-build.ts'
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
import { adminTakedownCard } from './workshop-drafts.ts'

const CARD_ART_DIR = process.env.CARD_ART_DIR ?? join(process.cwd(), 'data', 'card-art')
const REPLAY_VIEWER_ROOT = process.env.REPLAY_VIEWER_ROOT ?? join(process.cwd(), 'data', 'replay-viewers')
const REPLAY_ASSET_ROOT = process.env.REPLAY_ASSET_ROOT ?? join(process.cwd(), 'data', 'replay-assets')
const REPLAY_REMOVAL_LEDGER_PATH = process.env.REPLAY_REMOVAL_LEDGER_PATH
  ?? join(process.cwd(), 'data', 'replay-removals.jsonl')
const BGA_CDN_BASE = process.env.BGA_CDN_BASE_URL || 'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'
const BGA_CDN_ORIGIN = new URL(BGA_CDN_BASE).origin
const BGA_LOCAL_DIR = process.env.BGA_IMAGE_DIR ? join(process.cwd(), process.env.BGA_IMAGE_DIR) : null

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

// Rate limiting for login attempts (simple in-memory)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 10
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_INVITE_AGE_MS = 365 * DAY_MS

function checkRateLimit(ip: string): boolean {
  if (process.env.DISABLE_RATE_LIMIT === '1') return true
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? 'unknown'
}

function getAuthToken(req: IncomingMessage): string {
  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  const validCookie = cookieTokens.find(token => validateSession(token))
  const bearer = extractToken(req.headers.authorization)
  return validCookie || bearer || cookieTokens[0] || ''
}

function requireAdmin(req: IncomingMessage, res: ServerResponse): AuthUser | null {
  const token = getAuthToken(req)
  const user = validateSession(token)
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

function forwardCookieSessionAsBearer(req: IncomingMessage): void {
  if (req.headers.authorization) return
  const cookieTokens = readCookies(req.headers.cookie, SESSION_COOKIE)
  const token = cookieTokens.find(candidate => validateSession(candidate)) ?? cookieTokens[0] ?? ''
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

// Initialize database on import
getDb()
const replayRemovalState = process.env.NODE_ENV !== 'test'
  ? applyReplayRemovalLedger(getDb(), {
    assetRoot: REPLAY_ASSET_ROOT,
    ledgerPath: REPLAY_REMOVAL_LEDGER_PATH,
  })
  : { assetTakedownHashes: [] }

// Wire up room persistence adapter before creating the WS server
const PERSIST_ROOMS = (process.env.PERSIST_ROOMS ?? 'sqlite') as 'json' | 'sqlite'
const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const persistence =
  PERSIST_ROOMS === 'sqlite'
    ? new SqliteRoomPersistence(getDb())
    : new JsonRoomPersistence(PERSISTED_ROOMS_DIR)
const shouldPersist: (room: Room) => boolean =
  PERSIST_ROOMS === 'sqlite' ? () => true : (room) => isDevRoom(room.id)
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

const createCompletedReplayFixture = () => {
  const viewerBuildId = process.env.REPLAY_VIEWER_BUILD_ID ?? ''
  if (!viewerBuildExists(REPLAY_VIEWER_ROOT, viewerBuildId)) {
    throw new Error('Replay viewer build is unavailable')
  }
  const roomId = `replay-${randomUUID()}`
  const session = new GameSession(42, undefined, {
    playerCount: 2,
    playerNames: ['Alice', 'Bob'],
  })
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
  db.transaction(() => {
    db.prepare(`
      INSERT INTO game_contexts (
        room_id, lifecycle, phase, replay_status, expires_at,
        removal_reason, created_at, updated_at
      ) VALUES (?, 'completed', NULL, 'available', NULL, NULL, ?, ?)
    `).run(roomId, now, now)
    db.prepare(`
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
    )
    const insertStep = db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const commandTypes = ['initial', 'takeAction', 'resolveChoice']
    encoded.forEach((step, stepNo) => insertStep.run(
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
    ))
    db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards, enable_through_the_seasons,
        enable_farmers_of_the_moor
      ) VALUES (?, ?, ?, 1, 2, 0, 0, 0, 0)
    `).run(roomId, now - 1000, now)
    const scores = session.getState().scores ?? []
    const insertPlayer = db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      ) VALUES (?, ?, ?, NULL, ?, ?)
    `)
    session.state.players.forEach((player, playerIndex) => insertPlayer.run(
      roomId,
      playerIndex,
      player.id,
      player.name,
      scores.find((score) => score.playerId === player.id)?.total ?? 0,
    ))
  })()
  return {
    ok: true,
    roomId,
    firstStepHash: encoded[0]!.frameHash,
  }
}

let wssCtx: ReturnType<typeof createWsServer> | null = null

const retireAccountRooms = (userId: string): void => {
  wssCtx?.lobby.endRoomsForUser(userId, getAccountDeletionRoomIds(userId))
  wssCtx?.closeUserConnections(userId)
}

const retryPendingAccountDeletion = async (): Promise<void> => {
  const userId = nextPendingAccountDeletion()
  if (!userId || !bugReportDelivery) return
  retireAccountRooms(userId)
  try {
    await bugReportDelivery.deleteReporter(userId)
    deleteAccount(userId)
  } catch (error) {
    if (error instanceof BugReportError && error.code === 'bug_report_delivery_busy') {
      return
    }
    const failure = error instanceof BugReportError
      ? error
      : new BugReportError('bug_report_deletion_failed', 503)
    deferAccountDeletion(userId, failure.code, failure.retryAt)
  }
}

// Periodically clean expired sessions and replay evidence (every hour)
const sessionCleanupTimer = setInterval(() => {
  cleanExpiredSessions()
  wssCtx?.committer?.cleanupReplayAssets()
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

const server = createServer(async (req, res) => {
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

  // ── Health ─────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/health') {
    if (bugReportsEnabled() && !isBugReportRuntimeReady(bugReportRuntime)) {
      sendJson(res, 503, { ok: false, error: 'bug report delivery is unavailable' })
      return
    }
    const readiness = wssCtx?.committer?.canCreateRoom()
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
    if (handleReplayRoute(req, res, replayStore, {
      viewerRoot: REPLAY_VIEWER_ROOT,
      assetRoot: REPLAY_ASSET_ROOT,
      limiter: replayReadLimiter,
      bgaCdnOrigin: BGA_CDN_ORIGIN,
    })) return
  }

  const requestUser = validateSession(getAuthToken(req))

  if (req.url.startsWith('/api/v1/game-contexts/')) {
    if (handleGameContextRoute(req, res, gameContextStore, requestUser)) return
  }

  // ── Auth routes ────────────────────────────────────────
  if (req.url?.startsWith('/api/auth/oauth/')) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    if (req.method === 'GET' && url.pathname.endsWith('/start')) {
      handleOAuthStart(req, res, url)
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
    handleLinkedIdentities(req, res)
    return
  }

  if (req.url === '/api/auth/register' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
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
      cleanupPendingPasswordUser(result.userId, result.consumedInviteCodeHash)
      sendJson(res, 500, authError('email_delivery_failed', 'Failed to send verification email'))
      return
    }
    sendJson(res, 200, { ok: true, status: 'verification_required' })
    return
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
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
    const token = getAuthToken(req)
    if (token) logout(token)
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/logout-all' && req.method === 'POST') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (user) {
      logoutAll(user.id)
      wssCtx?.closeUserConnections(user.id)
    }
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/account' && req.method === 'DELETE') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    const database = getDb()
    const bugReportTables = new Set((database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('bug_reports', 'issue_submission_connections')
    `).all() as Array<{ name: string }>).map(({ name }) => name))
    const hasExternalBugReportData = (
      bugReportTables.has('bug_reports')
      && Boolean(database.prepare(`
        SELECT 1
        FROM bug_reports
        WHERE reporter_user_id = ?
          AND (
            submitted_at IS NOT NULL
            OR github_issue_number IS NOT NULL
          )
        LIMIT 1
      `).get(user.id))
    ) || (
      bugReportTables.has('issue_submission_connections')
      && Boolean(database.prepare(`
        SELECT 1
        FROM issue_submission_connections
        WHERE user_id = ?
        LIMIT 1
      `).get(user.id))
    )
    if (hasExternalBugReportData) {
      requestAccountDeletion(user.id)
      retireAccountRooms(user.id)
      if (!bugReportDelivery) {
        sendJson(res, 202, { ok: true, pending: true }, {
          'Set-Cookie': clearSessionCookie({
            backendOrigin: getRequestOrigin(req),
            requestOrigin: req.headers.origin,
          }),
        })
        return
      }
      try {
        await bugReportDelivery.deleteReporter(user.id)
      } catch (error) {
        const failure = error instanceof BugReportError
          ? error
          : new BugReportError('bug_report_deletion_failed', 503)
        if (failure.code !== 'bug_report_delivery_busy') {
          deferAccountDeletion(user.id, failure.code, failure.retryAt)
        }
        sendJson(res, 202, { ok: true, pending: true }, {
          'Set-Cookie': clearSessionCookie({
            backendOrigin: getRequestOrigin(req),
            requestOrigin: req.headers.origin,
          }),
        })
        return
      }
      const result = deleteAccount(user.id)
      sendJson(res, 200, result, {
        'Set-Cookie': clearSessionCookie({
          backendOrigin: getRequestOrigin(req),
          requestOrigin: req.headers.origin,
        }),
      })
      return
    }
    if (bugReportTables.has('bug_reports')) {
      database.prepare(`
        DELETE FROM bug_reports
        WHERE reporter_user_id = ?
          AND submitted_at IS NULL
          AND github_issue_number IS NULL
      `).run(user.id)
    }
    retireAccountRooms(user.id)
    const result = deleteAccount(user.id)
    sendJson(res, 200, result, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
    return
  }

  if (req.url === '/api/auth/profile' && req.method === 'PATCH') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    const body = await parseBody<{ displayName?: string }>(req)
    const err = updateDisplayName(user.id, body?.displayName ?? '')
    if (err) { sendJson(res, 400, authError('invalid_display_name', err)); return }
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/auth/change-password' && req.method === 'POST') {
    const token = getAuthToken(req)
    const user = validateSession(token)
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
    const result = verifyEmailToken(token)
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
    if (!checkRateLimit(ip)) {
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
    const token = getAuthToken(req)
    const user = validateSession(token)
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
    const existing = findIdentity(provider, body.providerUserId)
    if (existing) {
      const token = createSession(existing.userId)
      if (!token) {
        sendJson(res, 401, authError('not_authenticated', 'Not authenticated'))
        return
      }
      sendJson(res, 200, { ok: true, provider, mode: 'login' }, { 'Set-Cookie': serializeSessionCookie(token, { backendOrigin: getRequestOrigin(req), requestOrigin: req.headers.origin }) })
      return
    }

    const ticket = createOnboardingTicket(profile)
    sendJson(res, 200, { ok: true, provider, mode: 'onboarding' }, { 'Set-Cookie': serializeOnboardingCookie(ticket, { backendOrigin: getRequestOrigin(req) }) })
    return
  }

  if (req.url === '/api/test/replays/completed' && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH_TEST_HELPERS !== '1') {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    try {
      sendJson(res, 201, createCompletedReplayFixture())
    } catch (error) {
      sendJson(res, 503, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to create replay fixture',
      })
    }
    return
  }

  // Admin kill switch (#641): force a card offline, void its approval and
  // terminate every running game that embeds it. Games end without scores,
  // game_results or a completed replay (their recording rows are removed).
  if (req.method === 'POST' && req.url?.startsWith('/api/admin/cards/') && req.url.endsWith('/takedown')) {
    const adminUser = requireAdmin(req, res)
    if (!adminUser) return
    const cardDbId = decodeURIComponent(
      req.url.slice('/api/admin/cards/'.length, req.url.length - '/takedown'.length),
    )
    try {
      const db = getDb()
      const { endedRoomIds } = wssCtx?.lobby.endRoomsUsingCard(cardDbId) ?? { endedRoomIds: [] }
      // Durable cleanup: delete every persisted room row that embeds the
      // card — this backs up the in-memory kill (whose checkpoint discard
      // only logs deletion failures) AND covers snapshots not currently
      // loaded, so a restart can never resurrect the embedded card code.
      const persistedRows = db.prepare(
        "SELECT id FROM rooms WHERE custom_card_ids LIKE '%' || ? || '%'",
      ).all(JSON.stringify(cardDbId)) as Array<{ id: string }>
      const affectedRoomIds = [...new Set([
        ...endedRoomIds,
        ...persistedRows.map((row) => row.id),
      ])]
      for (const roomId of affectedRoomIds) {
        db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId)
        // Drop half-recorded replays so no 'recording' orphans survive —
        // but keep rooms referenced by a bug report: their retained
        // evidence segment (ADR-0011) must stay reconstructible.
        const hasReport = db.prepare(
          'SELECT 1 FROM bug_reports WHERE room_id = ? LIMIT 1',
        ).get(roomId)
        if (hasReport) continue
        db.prepare('DELETE FROM game_replay_steps WHERE room_id = ?').run(roomId)
        db.prepare('DELETE FROM game_replays WHERE room_id = ?').run(roomId)
      }
      const card = adminTakedownCard(db, cardDbId)
      sendJson(res, 200, { ok: true, card, endedRoomIds: affectedRoomIds })
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
    const adminUser = requireAdmin(req, res)
    if (!adminUser) return

    if (req.method === 'GET' && url.pathname === '/api/admin/invites') {
      sendJson(res, 200, { ok: true, invites: listInvites() })
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
        const invite = createInvite(adminUser.id, { code, expiresAt, maxUses })
        sendJson(res, 200, { ok: true, invite })
      } catch (error) {
        if (error instanceof Error && error.message.includes('account_invites.code_hash')) {
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
      const ok = revokeInvite(decodeURIComponent(revokeMatch[1]!))
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
    sendJson(res, 200, { ok: true, rooms: wssCtx!.lobby.getRooms(limit) })
    return
  }

  // Dissolve a room (HTTP, for lobby use)
  if (req.method === 'POST' && req.url?.startsWith('/api/rooms/') && req.url.endsWith('/dissolve')) {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const roomId = req.url.slice('/api/rooms/'.length, req.url.length - '/dissolve'.length)
    const result = wssCtx!.lobby.dissolveRoomById(roomId, user.id)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  // Rooms the current user has participated in (SQLite mode only)
  if (req.method === 'GET' && req.url === '/api/lobby/my-rooms') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    try {
      const rows = getDb().prepare(`
        SELECT r.id, r.status, r.max_players, r.updated_at, rp.player_index
        FROM room_players rp
        JOIN rooms r ON rp.room_id = r.id
        WHERE rp.user_id = ? AND r.status != 'finished'
        ORDER BY r.updated_at DESC
        LIMIT 20
      `).all(user.id) as Array<{ id: string; status: string; max_players: number; updated_at: number; player_index: number }>
      sendJson(res, 200, { ok: true, rooms: rows })
    } catch {
      sendJson(res, 200, { ok: true, rooms: [] })
    }
    return
  }

  // ── BGA images proxy ───────────────────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/bga-img/')) {
    const imgPath = req.url.slice('/bga-img'.length)
    // Local first (if BGA_IMAGE_DIR is set)
    if (BGA_LOCAL_DIR) {
      const filePath = join(BGA_LOCAL_DIR, imgPath)
      if (existsSync(filePath)) {
        const ext = extname(filePath).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : ext === '.ttf' ? 'font/ttf' : 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', ...serverCorsHeaders() })
        res.end(readFileSync(filePath))
        return
      }
    }
    // CDN fallback
    try {
      const cdnRes = await fetch(`${BGA_CDN_BASE}${imgPath}`)
      if (cdnRes.ok) {
        const contentType = cdnRes.headers.get('content-type') || 'application/octet-stream'
        const buf = await cdnRes.arrayBuffer()
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', ...serverCorsHeaders() })
        res.end(Buffer.from(buf))
        return
      }
    } catch { /* CDN unreachable */ }
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  // ── Card art static files ──────────────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/card-art/')) {
    const filename = req.url.slice('/card-art/'.length).replace(/[^a-zA-Z0-9._-]/g, '')
    const filePath = join(CARD_ART_DIR, filename)
    if (filename && existsSync(filePath)) {
      const ext = extname(filename).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', ...serverCorsHeaders() })
      res.end(readFileSync(filePath))
    } else {
      sendJson(res, 404, { error: 'Not found' })
    }
    return
  }

  // ── Art upload ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/workshop/art') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10)
    if (contentLength > 5 * 1024 * 1024) { sendJson(res, 413, { ok: false, error: 'Image too large (max 5MB)' }); return }
    const body = await parseBody<{ dataUrl?: string }>(req)
    const dataUrl = body?.dataUrl ?? ''
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)
    if (!match) { sendJson(res, 400, { ok: false, error: 'Invalid data URL' }); return }
    const [, mime, b64] = match
    const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png'
    try {
      mkdirSync(CARD_ART_DIR, { recursive: true })
      const filename = `${randomUUID()}${ext}`
      writeFileSync(join(CARD_ART_DIR, filename), Buffer.from(b64!, 'base64'))
      sendJson(res, 200, { ok: true, url: `/card-art/${filename}` })
    } catch (err) {
      console.error('[art-upload] failed:', err)
      sendJson(res, 500, { ok: false, error: 'Upload failed' })
    }
    return
  }

  // ── Workshop routes ────────────────────────────────────
  if (
    req.url === '/api/github/webhook'
    || req.url?.startsWith('/api/workshop/')
    || req.url?.startsWith('/api/admin/')
  ) {
    forwardCookieSessionAsBearer(req)
    const handled = await handleWorkshopRoute(req, res)
    if (handled) return
  }

  // ── Game routes (existing) ─────────────────────────────
  if (req.url?.startsWith('/api/game/')) {
    forwardCookieSessionAsBearer(req)
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
})

wssCtx = createWsServer(server, {
  persistence,
  shouldPersist,
  gameContextStore: PERSIST_ROOMS === 'sqlite' ? gameContextStore : undefined,
  removedReplayAssetHashes: new Set(replayRemovalState.assetTakedownHashes),
})

const PORT = Number(process.env.BACKEND_PORT) || 5175
const HOST = process.env.BACKEND_HOST || undefined
server.listen(PORT, HOST, () => {
  const addr = HOST ? `http://${HOST}:${PORT}` : `http://localhost:${PORT}`
  console.log(`Server listening on ${addr}`)
  console.log(`WebSocket available at ws://${HOST || 'localhost'}:${PORT}/ws`)
})

installShutdownHandlers(() => {
  server.close()
  clearInterval(sessionCleanupTimer)
  clearInterval(bugReportDeliveryTimer)
  wssCtx?.shutdown()
})
