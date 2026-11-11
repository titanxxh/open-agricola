import { readFileSync, watchFile, unwatchFile } from 'node:fs'
import { createServer, request, type IncomingHttpHeaders } from 'node:http'
import type { Duplex } from 'node:stream'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const OWNER_VERIFICATION_COOKIE = '__Host-oa-pre-verify'

/** The candidate has no write access to this owner-controlled file or gateway. */
export function createPrereleaseGateway(options: { stateFile: string; targetId: string; origin: string; upstream: string; verificationFile?: string }) {
  const host = new URL(options.origin).host
  const upstream = new URL(options.upstream)
  const connections = new Map<Duplex, () => boolean>()
  const state = () => {
    try {
      const state: unknown = JSON.parse(readFileSync(options.stateFile, 'utf8'))
      if (!!state && typeof state === 'object' && 'format' in state && state.format === 1
        && 'targetId' in state && state.targetId === options.targetId
        && 'channel' in state && state.channel === 'prerelease' && 'mode' in state && (state.mode === 'open' || state.mode === 'maintenance')
        && 'buildId' in state && typeof state.buildId === 'string' && /^[a-f0-9]{40}$/.test(state.buildId)
        && 'generation' in state && typeof state.generation === 'string' && /^[a-f0-9-]{36}$/.test(state.generation)) return { mode: state.mode, buildId: state.buildId, generation: state.generation }
      return null
    } catch { return null }
  }
  const verificationFile = options.verificationFile ?? resolve(options.stateFile, '../verification.json')
  const validToken = (token: string) => {
    const current = state()
    if (!current || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false
    try {
      const value: unknown = JSON.parse(readFileSync(verificationFile, 'utf8'))
      return !!value && typeof value === 'object' && 'targetId' in value && value.targetId === options.targetId
        && 'buildId' in value && value.buildId === current.buildId && 'generation' in value && value.generation === current.generation
        && 'expiresAt' in value && typeof value.expiresAt === 'number' && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + 600_000
        && 'tokenHash' in value && value.tokenHash === createHash('sha256').update(token).digest('hex')
    } catch { return false }
  }
  const allowed = (cookie = '') => {
    const current = state()
    if (current?.mode === 'open') return true
    const token = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${OWNER_VERIFICATION_COOKIE}=`))?.slice(OWNER_VERIFICATION_COOKIE.length + 1)
    return current?.mode === 'maintenance' && token !== undefined && validToken(token)
  }
  const track = (socket: Duplex, permission = () => allowed()) => {
    connections.set(socket, permission)
    socket.on('close', () => connections.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const headers = (input: IncomingHttpHeaders) => ({ ...input,
    cookie: (input.cookie ?? '').split(';').map(value => value.trim()).filter(value => value && !value.startsWith(`${OWNER_VERIFICATION_COOKIE}=`)).join('; '),
    host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' })
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  const maintenanceHtml = (language = ''): string | null => {
    try {
      const value: unknown = JSON.parse(readFileSync(resolve(options.stateFile, '../maintenance.json'), 'utf8'))
      if (!value || typeof value !== 'object' || !('formalOrigin' in value) || typeof value.formalOrigin !== 'string'
        || !value.formalOrigin.startsWith('https://') || new URL(value.formalOrigin).origin !== value.formalOrigin
        || !('locales' in value) || !value.locales || typeof value.locales !== 'object') return null
      const locale = language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      const messages: unknown = Reflect.get(value.locales, locale)
      if (!messages || typeof messages !== 'object' || !('title' in messages) || typeof messages.title !== 'string'
        || !('body' in messages) || typeof messages.body !== 'string' || !('back' in messages) || typeof messages.back !== 'string') return null
      return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(messages.title)}</title><main><h1>${escape(messages.title)}</h1><p>${escape(messages.body)}</p><a href="${escape(value.formalOrigin)}/">${escape(messages.back)}</a></main></html>`
    } catch { return null }
  }
  const originPath = (path = '/') => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
  const server = createServer((req, res) => {
    if (req.headers.host !== host) { res.writeHead(421); res.end(); return }
    if (!originPath(req.url)) { res.writeHead(400); res.end(); return }
    if (req.url === '/__prerelease_verify') {
      if (req.method !== 'POST' || req.headers.origin !== options.origin) { res.writeHead(403); res.end(); return }
      let input = ''
      req.on('data', chunk => { input += chunk.toString(); if (input.length > 1024) req.destroy() })
      req.on('end', () => {
        try {
          const value: unknown = JSON.parse(input)
          if (!value || typeof value !== 'object' || !('token' in value) || typeof value.token !== 'string' || !validToken(value.token)) { res.writeHead(403); res.end(); return }
          res.writeHead(204, { 'Set-Cookie': `${OWNER_VERIFICATION_COOKIE}=${value.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`, 'Cache-Control': 'no-store' }); res.end()
        } catch { res.writeHead(403); res.end() }
      })
      return
    }
    const permission = () => allowed(req.headers.cookie)
    track(req.socket, permission)
    if (!permission()) {
      const html = req.headers.accept?.includes('text/html') ? maintenanceHtml(req.headers['accept-language']) : null
      res.writeHead(503, { 'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '30',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' })
      res.end(html ?? JSON.stringify({ ok: false, code: 'prerelease_maintenance' })); return
    }
    const outgoing = request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, path: req.url ?? '/', method: req.method, headers: headers(req.headers) }, response => {
      if (!permission()) { response.destroy(); res.destroy(); return }
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.on('data', chunk => { if (permission()) res.write(chunk); else { response.destroy(); res.destroy() } })
      response.on('end', () => res.end())
    })
    outgoing.on('socket', socket => track(socket, permission))
    outgoing.on('error', () => { if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end() })
    req.on('data', chunk => { if (permission()) outgoing.write(chunk); else { outgoing.destroy(); req.destroy() } })
    req.on('end', () => outgoing.end())
    req.on('aborted', () => outgoing.destroy())
  })
  server.on('connection', socket => track(socket))
  server.on('upgrade', (req, socket, head) => {
    const permission = () => allowed(req.headers.cookie)
    track(socket, permission)
    if (req.headers.host !== host || !originPath(req.url) || !permission()) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n'); return
    }
    const outgoing = request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, path: req.url ?? '/', method: 'GET', headers: headers(req.headers) })
    outgoing.on('upgrade', (response, remote, upstreamHead) => {
      track(remote, permission)
      if (!permission()) { remote.destroy(); socket.destroy(); return }
      socket.write(`HTTP/1.1 ${response.statusCode ?? 101} Switching Protocols\r\n`)
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) socket.write(`${name}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`)
      }
      socket.write('\r\n')
      if (head.length) remote.write(head)
      if (upstreamHead.length) socket.write(upstreamHead)
      socket.on('data', chunk => { if (permission()) remote.write(chunk); else { remote.destroy(); socket.destroy() } })
      remote.on('data', chunk => { if (permission()) socket.write(chunk); else { remote.destroy(); socket.destroy() } })
      socket.on('close', () => remote.destroy())
      remote.on('close', () => socket.destroy())
    })
    outgoing.on('response', response => { response.resume(); socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n') })
    outgoing.on('error', () => socket.destroy())
    outgoing.end()
  })
  const closeInputs = () => { for (const [socket, permission] of connections) if (!permission()) socket.destroy() }
  watchFile(options.stateFile, { interval: 100, persistent: false }, closeInputs)
  watchFile(verificationFile, { interval: 100, persistent: false }, closeInputs)
  const timer = setInterval(closeInputs, 1000); timer.unref()
  return { server, close: async () => {
    unwatchFile(options.stateFile, closeInputs)
    unwatchFile(verificationFile, closeInputs); clearInterval(timer)
    for (const socket of connections.keys()) socket.destroy()
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targetId = process.env.PRERELEASE_TARGET_ID
  const origin = process.env.PRERELEASE_PUBLIC_ORIGIN
  if (!targetId || !/^prerelease-[a-z0-9-]+$/.test(targetId) || !origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Invalid prerelease gateway target')
  const gateway = createPrereleaseGateway({ targetId, origin, stateFile: '/control/gate.json', upstream: 'http://app:5175' })
  gateway.server.listen(5176, '0.0.0.0')
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void gateway.close() })
}
