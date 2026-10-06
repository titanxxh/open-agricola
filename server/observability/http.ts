import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PostgresDatabase } from '../database/postgres'
import { extractToken, isAdmin } from '../auth'
import { readCookies, SESSION_COOKIE } from '../auth-cookies'
import { corsHeaders, getRequestOrigin } from '../http-origin'
import { operationsMetrics } from './metrics'

const OPS_COOKIE = 'oa_ops_session'
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
export function metricsAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.OBSERVABILITY_METRICS_TOKEN ?? ''
  const actual = extractToken(req.headers.authorization)
  return !!expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

/** Every resource and datasource request is authenticated against the current site session. */
export function createOperationsHandler({ db, collect }: { db: PostgresDatabase; collect?: () => Promise<void> }) {
  const uploads = new Map<string, { since: number; count: number }>()
  const userFor = (token: string) => db.prepare(`SELECT u.username FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).get<{ username: string }>(token, Date.now())
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/ops/') && !path.startsWith('/api/admin/observability') && path !== '/internal/metrics' && path !== '/api/observability/telemetry') return false
    operationsMetrics.http(req, res)
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) { json(res, 400, { ok: false, code: 'invalid_request_target' }); return true }
    if (path === '/internal/metrics') {
      if (!metricsAuthorized(req)) { json(res, 401, { ok: false, code: 'metrics_token_required' }); return true }
      await collect?.()
      res.writeHead(200, { 'Content-Type': operationsMetrics.registry.contentType, 'Cache-Control': 'no-store' })
      res.end(await operationsMetrics.registry.metrics())
      return true
    }
    if (path === '/ops/start') {
      const ticket = url.searchParams.get('ticket') ?? ''
      const row = await db.prepare('DELETE FROM observability_tickets WHERE ticket_hash=? AND expires_at>? RETURNING session_token')
        .get<{ session_token: string }>(digest(ticket), Date.now())
      const user = row && await userFor(row.session_token)
      if (!user || !isAdmin(user.username)) { json(res, 401, { ok: false, code: 'invalid_handoff' }); return true }
      const secure = process.env.NODE_ENV === 'production' && (process.env.PUBLIC_API_BASE ?? getRequestOrigin(req)).startsWith('https:')
      res.writeHead(303, { Location: '/ops/d/open-agricola/operations', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'Set-Cookie': `${OPS_COOKIE}=${encodeURIComponent(row!.session_token)}; Path=/ops; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` })
      res.end(); return true
    }
    const tokens = [...readCookies(req.headers.cookie, path.startsWith('/ops/') ? OPS_COOKIE : SESSION_COOKIE), extractToken(req.headers.authorization)]
    let user: { username: string } | undefined
    let sessionToken = ''
    for (const token of tokens) {
      if (!token) continue
      user = await userFor(token)
      if (user) { sessionToken = token; break }
    }
    if (!user) { json(res, 401, { ok: false, code: 'login_required' }); return true }
    if (path === '/api/observability/telemetry') {
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return true }
      const now = Date.now()
      for (const [key, value] of uploads) if (now - value.since > 60_000) uploads.delete(key)
      const usage = uploads.get(user.username) ?? { since: now, count: 0 }
      if (uploads.size >= 2000 || ++usage.count > 60) { req.resume(); json(res, 429, { ok: false }); return true }
      uploads.set(user.username, usage)
      // A finite batch and finite values bound the cost of untrusted observations.
      let bytes = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 4096) { req.resume(); json(res, 413, { ok: false }); return true }
        chunks.push(Buffer.from(chunk))
      }
      try {
        const events: unknown = JSON.parse(Buffer.concat(chunks).toString())
        if (!Array.isArray(events) || events.length > 10) throw new Error('Invalid batch')
        for (const event of events) {
          if (!event || typeof event !== 'object') continue
          const { kind, seconds, round, outcome } = event
          if (!['command_rtt', 'snapshot_commit', 'connect_ready'].includes(kind) || !Number.isFinite(seconds) || seconds < 0 || seconds > 120) continue
          if (!/^(?:[1-9]|1[0-4]|pregame|postgame|none|unknown)$/.test(round) || !['ok', 'timeout', 'reconnect', 'rejected', 'stale', 'error'].includes(outcome)) continue
          operationsMetrics.clientDuration.observe({ kind, round, outcome }, seconds)
          operationsMetrics.clientEvents.inc({ kind: outcome })
        }
        json(res, 200, { ok: true })
      } catch { json(res, 400, { ok: false }) }
      return true
    }
    if (!isAdmin(user.username)) { json(res, 403, { ok: false, code: 'admin_required' }); return true }
    if (path === '/api/admin/observability/session' && req.method === 'POST') {
      const ticket = randomBytes(32).toString('base64url')
      await db.prepare('DELETE FROM observability_tickets WHERE expires_at<=?').run(Date.now())
      await db.prepare('INSERT INTO observability_tickets(ticket_hash,session_token,expires_at) VALUES(?,?,?)').run(digest(ticket), sessionToken, Date.now() + 30_000)
      json(res, 200, { path: `/ops/start?ticket=${ticket}` }); return true
    }
    if (path === '/api/admin/observability' && req.method === 'GET') {
      const { overview } = await import('./overview')
      json(res, 200, await overview()); return true
    }
    if (path.startsWith('/ops/')) {
      if (!['GET', 'HEAD'].includes(req.method ?? '') && !(path === '/ops/api/ds/query' && req.method === 'POST')) {
        json(res, 405, { ok: false, code: 'readonly_dashboard' }); return true
      }
      const target = process.env.GRAFANA_URL
      if (!target) { json(res, 503, { ok: false, code: 'observability_unavailable' }); return true }
      // Build an allowlist; neither credentials nor client-supplied auth/proxy headers reach Grafana.
      const headers = { 'x-webauth-user': encodeURIComponent(user.username), 'x-webauth-role': 'Viewer', 'content-type': req.headers['content-type'] ?? 'application/json', accept: req.headers.accept ?? '*/*' }
      const upstream = httpRequest(new URL(path + url.search, target), { method: req.method, headers, timeout: 10_000 }, response => {
        const responseHeaders = { ...response.headers, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
        delete responseHeaders['set-cookie']
        res.writeHead(response.statusCode ?? 502, responseHeaders)
        response.pipe(res)
      })
      upstream.on('timeout', () => upstream.destroy())
      upstream.on('error', () => { if (!res.headersSent) json(res, 503, { ok: false, code: 'grafana_unavailable' }); else res.destroy() })
      req.on('aborted', () => upstream.destroy())
      res.on('close', () => { if (!res.writableEnded) upstream.destroy() })
      req.pipe(upstream); return true
    }
    json(res, 405, { ok: false }); return true
  }
}
