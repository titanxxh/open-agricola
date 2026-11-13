import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders, OutgoingHttpHeader } from 'node:http'
import { HOSTED_APP_PATH } from '../shared/contract/protocol/app-location'
import { normalizePrereleaseReturnPath, type PrereleaseHandoffSessionResponse, type PrereleaseRuntimeResponse, type PrereleaseSessionResponse } from '../shared/contract/prerelease-runtime'
import { PRERELEASE_HANDOFF_COOKIE, readCookie, serializePrereleaseCookie } from './auth-cookies'
import { isPrerelease, prereleaseBindingAdmission, prereleaseRequestAdmission, prereleaseRequestBinding, prereleaseSessionToken, type PrereleaseAdmission } from './prerelease-access'
import { getPrereleaseSessions, readPrereleaseRuntime } from './prerelease-sessions'
import { PrereleaseIdentityError } from './prerelease-identity-client'

function send(res: ServerResponse, status: number, body: unknown, cookies?: string[]): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    ...(cookies ? { 'Set-Cookie': cookies } : {}) })
  res.end(JSON.stringify(body))
}

export function prereleaseBootstrapRequest(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  return ['/api/health', '/api/prerelease/runtime', '/api/auth/browser-policy', '/api/app-location', HOSTED_APP_PATH,
    HOSTED_APP_PATH.slice(0, -1), `${HOSTED_APP_PATH}index.html`, `${HOSTED_APP_PATH}auth/handoff`].includes(path)
    || /^\/open-agricola\/(?:assets|i18n|card-encyclopedia)\//.test(path)
    || /^\/replay-viewers\/[a-f0-9]{64}\//.test(path)
}

export async function handlePrereleaseRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path === '/api/prerelease/runtime' && req.method === 'GET') {
    try {
      const runtime = readPrereleaseRuntime()
      const body: PrereleaseRuntimeResponse = runtime ? { ok: true, channel: 'prerelease', ...runtime } : { ok: true, channel: 'stable' }
      send(res, 200, body)
    } catch { send(res, 503, { ok: false, code: 'prerelease_access_paused' }) }
    return true
  }
  if (!isPrerelease()) return false
  let service
  try { service = getPrereleaseSessions() } catch { send(res, 503, { ok: false, code: 'prerelease_access_paused' }); return true }
  if (!service) { send(res, 503, { ok: false, code: 'prerelease_access_paused' }); return true }
  if (path === `${HOSTED_APP_PATH}auth/start` && req.method === 'GET') {
    try {
      if (req.headers.host !== new URL(service.runtime.appOrigin).host) { send(res, 403, { ok: false, code: 'invalid_prerelease_handoff' }); return true }
      const returnPath = normalizePrereleaseReturnPath(new URL(req.url ?? '/', service.runtime.appOrigin).searchParams.get('returnPath') ?? HOSTED_APP_PATH)
      if (!returnPath) { send(res, 400, { ok: false, code: 'invalid_prerelease_handoff' }); return true }
      const start = await service.beginHandoff(returnPath)
      res.writeHead(302, { Location: start.formalUrl, 'Set-Cookie': serializePrereleaseCookie('handoff', start.cookie, start.expiresAt),
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end()
    } catch { send(res, 503, { ok: false, code: 'prerelease_access_paused' }) }
    return true
  }
  if (path === '/api/prerelease/session' && req.method === 'POST') {
    const admission = prereleaseBindingAdmission(req)
    if (!admission.ok) { send(res, admission.status, { ok: false, code: admission.code }); return true }
    try {
      let raw = ''
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        raw += String(chunk)
        if (Buffer.byteLength(raw) > 4096) { req.resume(); throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff') }
      }
      let input: unknown
      try { input = JSON.parse(raw) } catch { throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff') }
      if (!input || typeof input !== 'object' || !('protocolVersion' in input) || input.protocolVersion !== 1
        || !('code' in input) || typeof input.code !== 'string' || !('state' in input) || typeof input.state !== 'string'
        || !('browserChallenge' in input) || typeof input.browserChallenge !== 'string' || !('returnTo' in input) || typeof input.returnTo !== 'string') {
        throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff')
      }
      const result = await service.exchangeHandoff(readCookie(req.headers.cookie, PRERELEASE_HANDOFF_COOKIE), {
        protocolVersion: 1, code: input.code, state: input.state, browserChallenge: input.browserChallenge, returnTo: input.returnTo,
      }, prereleaseSessionToken(req))
      const runtime = service.runtime
      const body: PrereleaseHandoffSessionResponse = { ok: true, returnPath: result.returnPath, user: { ...result.user, isAdmin: false, betaAccess: true },
        prerelease: { buildId: runtime.buildId, generationId: runtime.generationId, expiresAt: result.expiresAt, validUntil: result.validUntil, serverTime: Date.now() } }
      guardResponse(req, res, result.token, true)
      send(res, 200, body, [serializePrereleaseCookie('session', result.token, result.expiresAt), serializePrereleaseCookie('handoff', '', 0)])
    } catch (error) {
      const kind = error instanceof PrereleaseIdentityError ? error.kind : 'paused'
      if (kind === 'invalid') send(res, 400, { ok: false, code: 'invalid_prerelease_handoff' }, [serializePrereleaseCookie('handoff', '', 0)])
      else if (kind === 'expired') send(res, 403, { ok: false, code: 'prerelease_access_expired' }, [serializePrereleaseCookie('handoff', '', 0)])
      else send(res, 503, { ok: false, code: 'prerelease_access_paused' })
    }
    return true
  }
  if (path === '/api/auth/me' && req.method === 'GET') {
    const admission = await prereleaseRequestAdmission(req)
    if (!admission.ok) { send(res, admission.status, { ok: false, code: admission.code }); return true }
    const session = await service.resolve(prereleaseSessionToken(req))
    if (!session) {
      const expired = service.status(prereleaseSessionToken(req)) === 'expired'
      send(res, expired ? 403 : 503, { ok: false, code: expired ? 'prerelease_access_expired' : 'prerelease_access_paused' }); return true
    }
    const body: PrereleaseSessionResponse = { ok: true, user: { ...session.user, isAdmin: false, betaAccess: true },
      prerelease: { buildId: service.runtime.buildId, generationId: service.runtime.generationId, expiresAt: session.expiresAt, validUntil: session.validUntil, serverTime: Date.now() } }
    guardResponse(req, res, prereleaseSessionToken(req), true)
    send(res, 200, body)
    return true
  }
  if (['/api/auth/logout', '/api/auth/logout-all'].includes(path) && req.method === 'POST') {
    const admission = prereleaseBindingAdmission(req)
    if (!admission.ok) { send(res, admission.status, { ok: false, code: admission.code }); return true }
    await service.revoke(prereleaseSessionToken(req), path.endsWith('logout-all'))
    send(res, 200, { ok: true }, [serializePrereleaseCookie('session', '', 0), serializePrereleaseCookie('handoff', '', 0)])
    return true
  }
  return false
}

export async function requirePrereleaseRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!isPrerelease() || prereleaseBootstrapRequest(req)) return true
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const imagePath = path.startsWith('/card-art/') || path === '/api/community/wechat-qr' || path === '/api/community/feishu-qr'
  const resourceImage = imagePath && req.method === 'GET' && req.headers['sec-fetch-site'] === 'same-origin'
    && req.headers['sec-fetch-dest'] === 'image' && !prereleaseRequestBinding(req)
  const service = getPrereleaseSessions()
  const token = prereleaseSessionToken(req)
  if (resourceImage && !token) { send(res, 401, { ok: false, code: 'prerelease_auth_required' }); return false }
  const imageAllowed = resourceImage && service && req.headers.host === new URL(service.runtime.appOrigin).host
    && req.headers.authorization === undefined && (req.headers.origin === undefined || req.headers.origin === service.runtime.appOrigin)
    && !!token && !!await service.resolve(token)
  const admission: PrereleaseAdmission = imageAllowed ? { ok: true } : await prereleaseRequestAdmission(req)
  if (!admission.ok) { send(res, admission.status, { ok: false, code: admission.code }); return false }
  guardResponse(req, res)
  const blockedPath = new URL(req.url ?? '/', 'http://localhost').pathname
  if (blockedPath.startsWith('/api/auth/') || blockedPath.startsWith('/api/admin/') || blockedPath.startsWith('/api/prerelease/')
    || blockedPath.startsWith('/ops/') || blockedPath.startsWith('/api/v1/issue-submission-connection') || blockedPath.includes('/oauth/')
    || blockedPath.startsWith('/api/v1/replays/') || blockedPath.startsWith('/replay-assets/')) {
    send(res, 403, { ok: false, code: 'prerelease_readonly' }); return false
  }
  return true
}

/** Async owners may outlive a lease; check again before any headers or bytes leave. */
function guardResponse(req: IncomingMessage, res: ServerResponse, token = prereleaseSessionToken(req), requireBinding = false): void {
  const service = getPrereleaseSessions(), binding = prereleaseRequestBinding(req)
  type Rejection = Extract<PrereleaseAdmission, { ok: false }>
  const rejection = (): Rejection | undefined => {
    if (requireBinding) {
      const admission = prereleaseBindingAdmission(req)
      if (!admission.ok) return admission
    }
    if (!service?.cachedAuthorized(token, binding)) return service?.status(token) === 'expired'
      ? { ok: false, status: 403, code: 'prerelease_access_expired' }
      : { ok: false, status: 503, code: 'prerelease_access_paused' }
    return undefined
  }
  const writeHead = res.writeHead.bind(res), end = res.end.bind(res), write = res.write.bind(res)
  let denied: Rejection | undefined
  res.writeHead = (status: number, messageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => {
    const failure = rejection()
    if (failure) { denied = failure; return writeHead(failure.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }) }
    return typeof messageOrHeaders === 'string' ? writeHead(status, messageOrHeaders, headers) : writeHead(status, messageOrHeaders)
  }
  res.write = (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void): boolean => {
    const failure = rejection()
    if (failure) { denied = failure; if (res.headersSent) res.destroy(); return false }
    return typeof encodingOrCallback === 'string' ? write(chunk, encodingOrCallback, callback) : write(chunk, encodingOrCallback)
  }
  res.end = (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) => {
    const failure = denied ?? rejection()
    if (failure) {
      if (!res.headersSent) writeHead(failure.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      else if (!denied) { res.destroy(); return res }
      return end(JSON.stringify({ ok: false, code: failure.code }))
    }
    return typeof encodingOrCallback === 'string' ? end(chunk, encodingOrCallback, callback) : end(chunk, encodingOrCallback)
  }
}
