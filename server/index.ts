import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { handleGameRoute } from './game-router.ts'
import { handleWorkshopRoute } from './workshop.ts'
import { createWsServer, getRooms } from './room-manager.ts'
import { getDb, cleanExpiredSessions } from './db.ts'
import { register, login, logout, validateSession, extractToken, updateDisplayName, changePassword, isAdmin } from './auth.ts'

const CARD_ART_DIR = process.env.CARD_ART_DIR ?? join(process.cwd(), 'data', 'card-art')

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(JSON.stringify(payload))
}

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

// Initialize database on import
getDb()

// Periodically clean expired sessions (every hour)
setInterval(cleanExpiredSessions, 60 * 60 * 1000)

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  // ── Health ─────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  // ── Auth routes ────────────────────────────────────────
  if (req.url === '/api/auth/register' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
      sendJson(res, 429, { ok: false, error: 'Too many requests' })
      return
    }
    const body = await parseBody<{ username?: string; password?: string; displayName?: string }>(req)
    if (!body?.username || !body.password) {
      sendJson(res, 400, { ok: false, error: 'Missing username or password' })
      return
    }
    const result = await register(body.username, body.password, body.displayName)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
      sendJson(res, 429, { ok: false, error: 'Too many requests' })
      return
    }
    const body = await parseBody<{ username?: string; password?: string }>(req)
    if (!body?.username || !body.password) {
      sendJson(res, 400, { ok: false, error: 'Missing username or password' })
      return
    }
    const result = await login(body.username, body.password)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const token = extractToken(req.headers.authorization)
    if (token) logout(token)
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/auth/profile' && req.method === 'PATCH') {
    const token = extractToken(req.headers.authorization)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const body = await parseBody<{ displayName?: string }>(req)
    const err = updateDisplayName(user.id, body?.displayName ?? '')
    if (err) { sendJson(res, 400, { ok: false, error: err }); return }
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/auth/change-password' && req.method === 'POST') {
    const token = extractToken(req.headers.authorization)
    const user = validateSession(token)
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return }
    const body = await parseBody<{ oldPassword?: string; newPassword?: string }>(req)
    if (!body?.oldPassword || !body.newPassword) {
      sendJson(res, 400, { ok: false, error: 'Missing oldPassword or newPassword' }); return
    }
    const err = await changePassword(user.id, body.oldPassword, body.newPassword)
    if (err) { sendJson(res, 400, { ok: false, error: err }); return }
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/auth/me' && req.method === 'GET') {
    const token = extractToken(req.headers.authorization)
    const user = validateSession(token)
    if (!user) {
      sendJson(res, 401, { ok: false, error: 'Not authenticated' })
      return
    }
    sendJson(res, 200, { ok: true, user: { ...user, isAdmin: isAdmin(user.username) } })
    return
  }

  // ── Lobby routes ───────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/rooms') {
    sendJson(res, 200, { ok: true, rooms: getRooms() })
    return
  }

  // Rooms the current user has participated in (SQLite mode only)
  if (req.method === 'GET' && req.url === '/api/lobby/my-rooms') {
    const token = extractToken(req.headers.authorization)
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

  // ── Card art static files ──────────────────────────────
  if (req.method === 'GET' && req.url?.startsWith('/card-art/')) {
    const filename = req.url.slice('/card-art/'.length).replace(/[^a-zA-Z0-9._-]/g, '')
    const filePath = join(CARD_ART_DIR, filename)
    if (filename && existsSync(filePath)) {
      const ext = extname(filename).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS })
      res.end(readFileSync(filePath))
    } else {
      sendJson(res, 404, { error: 'Not found' })
    }
    return
  }

  // ── Art upload ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/workshop/art') {
    const token = extractToken(req.headers.authorization)
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
  if (req.url?.startsWith('/api/workshop/')) {
    const handled = await handleWorkshopRoute(req, res)
    if (handled) return
  }

  // ── Game routes (existing) ─────────────────────────────
  if (req.url?.startsWith('/api/game/')) {
    const handled = await handleGameRoute(req, res)
    if (handled) return
  }

  sendJson(res, 404, { error: 'Not found' })
})

createWsServer(server)

const PORT = Number(process.env.BACKEND_PORT) || 5175
const HOST = process.env.BACKEND_HOST || undefined
server.listen(PORT, HOST, () => {
  const addr = HOST ? `http://${HOST}:${PORT}` : `http://localhost:${PORT}`
  console.log(`Server listening on ${addr}`)
  console.log(`WebSocket available at ws://${HOST || 'localhost'}:${PORT}/ws`)
})
