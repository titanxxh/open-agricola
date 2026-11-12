import { readFileSync, watchFile, unwatchFile } from 'node:fs'
import { createServer, request, type IncomingHttpHeaders } from 'node:http'
import type { Duplex } from 'node:stream'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readBrowserAuthPolicy, type FormalOrigins, type FormalTlsOptions } from './browser-policy.ts'

export const OWNER_VERIFICATION_COOKIE = '__Host-oa-pre-verify'
export const candidateAlias = (targetId: string) => `${targetId}-app`
const candidateCookies = new Set(['__Host-oa-pre-session', '__Host-oa-pre-handoff'])
const websocketTarget = /^\/(?:ws|nodes\/[A-Za-z0-9-]+\/ws)(?:\?[^#]*)?$/
const forwardedHeaders = new Set(['accept', 'accept-language', 'cache-control', 'content-type', 'content-length', 'origin', 'referer', 'user-agent',
  'range', 'if-range', 'if-none-match', 'if-modified-since', 'connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version',
  'sec-websocket-extensions', 'sec-websocket-protocol', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user', 'x-oa-browser-protocol'])

function candidateResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers }
  delete result['clear-site-data']
  if (result['set-cookie']) {
    const cookies = result['set-cookie'].filter(cookie => {
      const [pair, ...attributes] = cookie.split(';')
      const normalized = attributes.map(attribute => attribute.trim().toLowerCase())
      return candidateCookies.has(pair.slice(0, pair.indexOf('=')).trim())
        && !normalized.some(attribute => /^domain\s*=/.test(attribute))
        && normalized.filter(attribute => attribute.startsWith('path=')).length === 1
        && normalized.includes('path=/') && normalized.includes('secure') && normalized.includes('httponly')
        && normalized.filter(attribute => attribute.startsWith('samesite=')).length === 1 && normalized.includes('samesite=lax')
    })
    if (cookies.length) result['set-cookie'] = cookies
    else delete result['set-cookie']
  }
  return result
}

/** The candidate has no write access to this owner-controlled file or gateway. */
export function createPrereleaseGateway(options: { stateFile: string; targetId: string; origin: string; upstream: string; formal: FormalOrigins; verificationFile?: string } & FormalTlsOptions) {
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
        && 'generation' in state && typeof state.generation === 'string' && /^[a-f0-9-]{36}$/.test(state.generation)) {
        const acceptance = 'acceptance' in state ? state.acceptance : null
        const formalBuildId = acceptance && typeof acceptance === 'object' && 'formalBuildId' in acceptance && typeof acceptance.formalBuildId === 'string'
          && /^[a-f0-9]{40}$/.test(acceptance.formalBuildId) ? acceptance.formalBuildId : null
        return { mode: state.mode, buildId: state.buildId, generation: state.generation, formalBuildId }
      }
      return null
    } catch { return null }
  }
  let capability: { buildId: string; validUntil: number } | null = null
  let capabilityExpiry: ReturnType<typeof setTimeout> | undefined
  let refresh: Promise<void> | undefined
  let stopped = false
  const refreshBrowserPolicy = (): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (refresh) return refresh
    const startedAt = Date.now()
    refresh = readBrowserAuthPolicy(options.formal, options).then(policy => {
      if (!stopped) {
        capability = { buildId: policy.buildId, validUntil: startedAt + 30_000 }
        clearTimeout(capabilityExpiry)
        capabilityExpiry = setTimeout(closeInputs, Math.max(0, capability.validUntil - Date.now()))
        capabilityExpiry.unref()
      }
    }).catch(() => { capability = null; clearTimeout(capabilityExpiry) }).finally(() => { refresh = undefined; closeInputs() })
    return refresh
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
    if (!capability || capability.validUntil <= Date.now()) return false
    if (current?.mode === 'open') return current.formalBuildId === capability.buildId
    const tokens = cookie.split(';').map(value => value.trim()).filter(value => value.startsWith(`${OWNER_VERIFICATION_COOKIE}=`))
    const token = tokens.length === 1 ? tokens[0].slice(OWNER_VERIFICATION_COOKIE.length + 1) : undefined
    return current?.mode === 'maintenance' && token !== undefined && validToken(token)
  }
  const track = (socket: Duplex, permission = () => allowed()) => {
    connections.set(socket, permission)
    socket.on('close', () => connections.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const headers = (input: IncomingHttpHeaders): IncomingHttpHeaders | null => {
    const seen = new Set<string>(), cookies: string[] = []
    for (const pair of (input.cookie ?? '').split(';').map(value => value.trim())) {
      const name = pair.slice(0, pair.indexOf('='))
      if (!candidateCookies.has(name)) continue
      if (seen.has(name)) return null
      seen.add(name); cookies.push(pair)
    }
    return { ...Object.fromEntries(Object.entries(input).filter(([name]) => forwardedHeaders.has(name))),
      ...(cookies.length ? { cookie: cookies.join('; ') } : {}), host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' }
  }
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
    if (req.headers.origin !== undefined && req.headers.origin !== options.origin
      || !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '') && req.headers.origin !== options.origin) { res.writeHead(403); res.end(); return }
    const permission = () => allowed(req.headers.cookie)
    track(req.socket, permission)
    if (!permission()) {
      const html = req.headers.accept?.includes('text/html') ? maintenanceHtml(req.headers['accept-language']) : null
      res.writeHead(503, { 'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '30',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' })
      res.end(html ?? JSON.stringify({ ok: false, code: 'prerelease_maintenance' })); return
    }
    const forwarded = headers(req.headers)
    if (!forwarded) { res.writeHead(400); res.end(); return }
    const outgoing = request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, path: req.url ?? '/', method: req.method, headers: forwarded }, response => {
      if (!permission()) { response.destroy(); res.destroy(); return }
      res.writeHead(response.statusCode ?? 502, candidateResponseHeaders(response.headers))
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
    if (req.headers.host !== host || !originPath(req.url) || req.headers.origin !== options.origin
      || !websocketTarget.test(req.url ?? '') || !permission()) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n'); return
    }
    const forwarded = headers(req.headers)
    if (!forwarded) { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return }
    const outgoing = request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, path: req.url ?? '/', method: 'GET', headers: forwarded })
    outgoing.on('upgrade', (response, remote, upstreamHead) => {
      track(remote, permission)
      if (!permission()) { remote.destroy(); socket.destroy(); return }
      socket.write(`HTTP/1.1 ${response.statusCode ?? 101} Switching Protocols\r\n`)
      for (const [name, value] of Object.entries(candidateResponseHeaders(response.headers))) {
        if (value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) socket.write(`${name}: ${entry}\r\n`)
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
  function closeInputs() { for (const [socket, permission] of connections) if (!permission()) socket.destroy() }
  watchFile(options.stateFile, { interval: 100, persistent: false }, closeInputs)
  watchFile(verificationFile, { interval: 100, persistent: false }, closeInputs)
  const timer = setInterval(closeInputs, 1000); timer.unref()
  const policyTimer = setInterval(() => { void refreshBrowserPolicy() }, 10_000); policyTimer.unref()
  void refreshBrowserPolicy()
  return { server, refreshBrowserPolicy, close: async () => {
    stopped = true
    clearTimeout(capabilityExpiry)
    unwatchFile(options.stateFile, closeInputs)
    unwatchFile(verificationFile, closeInputs); clearInterval(timer); clearInterval(policyTimer)
    for (const socket of connections.keys()) socket.destroy()
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
    await refresh
  } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targetId = process.env.PRERELEASE_TARGET_ID
  const origin = process.env.PRERELEASE_PUBLIC_ORIGIN
  const appOrigin = process.env.FORMAL_APP_ORIGIN, apiOrigin = process.env.FORMAL_API_BASE
  if (!targetId || !/^prerelease-[a-z0-9-]+$/.test(targetId) || !origin || new URL(origin).origin !== origin || !origin.startsWith('https://')
    || !appOrigin || !apiOrigin) throw new Error('Invalid prerelease gateway target')
  const gateway = createPrereleaseGateway({ targetId, origin, formal: { appOrigin, apiOrigin }, stateFile: '/control/gate.json', upstream: `http://${candidateAlias(targetId)}:5175` })
  gateway.server.listen(5176, '0.0.0.0')
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void gateway.close() })
}
