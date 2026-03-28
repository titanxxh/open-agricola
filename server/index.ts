import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleGameRoute } from './game-router.ts'
import { createWsServer, getRooms } from './room-manager.ts'
import { getDb, cleanExpiredSessions } from './db.ts'
import { register, login, logout, validateSession, extractToken } from './auth.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
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

  if (req.url === '/api/auth/me' && req.method === 'GET') {
    const token = extractToken(req.headers.authorization)
    const user = validateSession(token)
    if (!user) {
      sendJson(res, 401, { ok: false, error: 'Not authenticated' })
      return
    }
    sendJson(res, 200, { ok: true, user })
    return
  }

  // ── Lobby routes ───────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/rooms') {
    sendJson(res, 200, { ok: true, rooms: getRooms() })
    return
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
