import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { handleGameRoute } from './game-router.ts'
import { handleWorkshopRoute } from './workshop.ts'
import { createWsServer } from './connection/ws-server.ts'
import { isFixedDevRoom, type Room } from './game/room.ts'
import { getDb, cleanExpiredSessions } from './db.ts'
import { SqliteRoomPersistence } from './game/persistence/sqlite-adapter.ts'
import { JsonRoomPersistence } from './game/persistence/json-adapter.ts'
import { register, login, logout, logoutAll, validateSession, extractToken, updateDisplayName, changePassword, isAdmin, createSession, deleteAccount, type AuthErrorCode } from './auth.ts'
import { clearSessionCookie, readCookie, serializeOnboardingCookie, serializeSessionCookie, SESSION_COOKIE } from './auth-cookies.ts'
import { corsHeaders, getRequestOrigin, isTrustedOrigin } from './http-origin.ts'
import {
  handleLinkedIdentities,
  handleOAuthCallback,
  handleOAuthStart,
  handleOnboardingComplete,
  handleRegistrationPolicy,
} from './oauth/handler.ts'
import { assertOAuthProvider } from './oauth/providers.ts'
import { createOnboardingTicket, findIdentity } from './oauth/store.ts'

const CARD_ART_DIR = process.env.CARD_ART_DIR ?? join(process.cwd(), 'data', 'card-art')
const BGA_CDN_BASE = process.env.BGA_CDN_BASE_URL || 'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'
const BGA_LOCAL_DIR = process.env.BGA_IMAGE_DIR ? join(process.cwd(), process.env.BGA_IMAGE_DIR) : null

const serverCorsHeaders = () => corsHeaders({
  methods: 'GET,POST,PATCH,DELETE,OPTIONS',
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
  return readCookie(req.headers.cookie, SESSION_COOKIE) || extractToken(req.headers.authorization)
}

function forwardCookieSessionAsBearer(req: IncomingMessage): void {
  if (req.headers.authorization) return
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (token) req.headers.authorization = `Bearer ${token}`
}

function isMutatingRequest(req: IncomingMessage): boolean {
  return req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE'
}

function rejectUntrustedOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isMutatingRequest(req) || isTrustedOrigin(req)) return false
  sendJson(res, 403, authError('csrf_rejected', 'Untrusted origin'))
  return true
}

// Initialize database on import
getDb()

// Wire up room persistence adapter before creating the WS server
const PERSIST_ROOMS = (process.env.PERSIST_ROOMS ?? 'sqlite') as 'json' | 'sqlite'
const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const persistence =
  PERSIST_ROOMS === 'sqlite'
    ? new SqliteRoomPersistence(getDb())
    : new JsonRoomPersistence(PERSISTED_ROOMS_DIR)
const shouldPersist: (room: Room) => boolean =
  PERSIST_ROOMS === 'sqlite' ? () => true : (room) => isFixedDevRoom(room.id)

// Periodically clean expired sessions (every hour)
setInterval(cleanExpiredSessions, 60 * 60 * 1000)

let wssCtx: ReturnType<typeof createWsServer> | null = null

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
    sendJson(res, 200, { ok: true })
    return
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
    const body = await parseBody<{ username?: string; password?: string; displayName?: string }>(req)
    if (!body?.username || !body.password) {
      sendJson(res, 400, authError('missing_fields', 'Missing username or password'))
      return
    }
    const result = await register(body.username, body.password, body.displayName)
    sendJson(res, result.ok ? 200 : 400, result)
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
    sendJson(res, 200, { ok: true, user: result.user }, { 'Set-Cookie': serializeSessionCookie(result.token, { backendOrigin: getRequestOrigin(req) }) })
    return
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const token = getAuthToken(req)
    if (token) logout(token)
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req) }) })
    return
  }

  if (req.url === '/api/auth/logout-all' && req.method === 'POST') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (user) {
      logoutAll(user.id)
      wssCtx?.closeUserConnections(user.id)
    }
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req) }) })
    return
  }

  if (req.url === '/api/auth/account' && req.method === 'DELETE') {
    const token = getAuthToken(req)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, authError('not_authenticated', 'Not authenticated')); return }
    wssCtx?.lobby.endRoomsForUser(user.id)
    const result = deleteAccount(user.id)
    wssCtx?.closeUserConnections(user.id)
    sendJson(res, 200, result, { 'Set-Cookie': clearSessionCookie({ backendOrigin: getRequestOrigin(req) }) })
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
      sendJson(res, 200, { ok: true, provider, mode: 'login' }, { 'Set-Cookie': serializeSessionCookie(token, { backendOrigin: getRequestOrigin(req) }) })
      return
    }

    const ticket = createOnboardingTicket(profile)
    sendJson(res, 200, { ok: true, provider, mode: 'onboarding' }, { 'Set-Cookie': serializeOnboardingCookie(ticket, { backendOrigin: getRequestOrigin(req) }) })
    return
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
  if (req.url?.startsWith('/api/workshop/') || req.url?.startsWith('/api/admin/')) {
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

  sendJson(res, 404, { error: 'Not found' })
})

wssCtx = createWsServer(server, { persistence, shouldPersist })

const PORT = Number(process.env.BACKEND_PORT) || 5175
const HOST = process.env.BACKEND_HOST || undefined
server.listen(PORT, HOST, () => {
  const addr = HOST ? `http://${HOST}:${PORT}` : `http://localhost:${PORT}`
  console.log(`Server listening on ${addr}`)
  console.log(`WebSocket available at ws://${HOST || 'localhost'}:${PORT}/ws`)
})
