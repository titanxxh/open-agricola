import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../shared/contract/browser-auth'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_HEADER, PRERELEASE_GENERATION_PROTOCOL_PREFIX,
  type PrereleaseAccessErrorCode, type PrereleaseRuntime } from '../shared/contract/prerelease-runtime'
import { PRERELEASE_SESSION_COOKIE, readCookie } from './auth-cookies'
import { getPrereleaseSessions, readPrereleaseRuntime } from './prerelease-sessions'

export type PrereleaseBinding = Pick<PrereleaseRuntime, 'buildId' | 'generationId'>
export type PrereleaseAdmission = { ok: true } | { ok: false; status: 400 | 401 | 403 | 426 | 503; code: PrereleaseAccessErrorCode }
const admitted: PrereleaseAdmission = { ok: true }
const paused: PrereleaseAdmission = { ok: false, status: 503, code: 'prerelease_access_paused' }
const changed: PrereleaseAdmission = { ok: false, status: 426, code: 'prerelease_runtime_changed' }
export const isPrerelease = (): boolean => process.env.RELEASE_CHANNEL === 'prerelease'
export const prereleaseSessionToken = (req: IncomingMessage): string => req.headers.authorization === undefined
  ? readCookie(req.headers.cookie, PRERELEASE_SESSION_COOKIE) : ''

function browserOrigin(req: IncomingMessage, runtime: PrereleaseRuntime): boolean {
  if (req.headers.host !== new URL(runtime.appOrigin).host || req.headers.authorization !== undefined) return false
  return req.headers.origin === runtime.appOrigin || req.headers.origin === undefined && req.headers['sec-fetch-site'] === 'same-origin'
}

export function prereleaseRequestBinding(req: IncomingMessage, websocket = false): PrereleaseBinding | undefined {
  if (!websocket) {
    const buildId = req.headers[PRERELEASE_BUILD_HEADER], generationId = req.headers[PRERELEASE_GENERATION_HEADER]
    return typeof buildId === 'string' && typeof generationId === 'string' ? { buildId, generationId } : undefined
  }
  const protocols = req.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()) ?? []
  const builds = protocols.filter(value => value.startsWith(PRERELEASE_BUILD_PROTOCOL_PREFIX))
  const generations = protocols.filter(value => value.startsWith(PRERELEASE_GENERATION_PROTOCOL_PREFIX))
  return builds.length === 1 && generations.length === 1 ? {
    buildId: builds[0]!.slice(PRERELEASE_BUILD_PROTOCOL_PREFIX.length),
    generationId: generations[0]!.slice(PRERELEASE_GENERATION_PROTOCOL_PREFIX.length),
  } : undefined
}

export function prereleaseBindingAdmission(req: IncomingMessage, websocket = false): PrereleaseAdmission {
  if (!isPrerelease()) return admitted
  try {
    const runtime = readPrereleaseRuntime()
    if (!runtime) return paused
    if (!browserOrigin(req, runtime)) return { ok: false, status: 401, code: 'prerelease_auth_required' }
    const binding = prereleaseRequestBinding(req, websocket)
    if (!binding || binding.buildId !== runtime.buildId || binding.generationId !== runtime.generationId) return changed
    if (!websocket && req.headers[BROWSER_AUTH_HEADER] !== String(BROWSER_AUTH_VERSION)) return changed
    return admitted
  } catch { return paused }
}

export async function prereleaseRequestAdmission(req: IncomingMessage, websocket = false): Promise<PrereleaseAdmission> {
  const binding = prereleaseBindingAdmission(req, websocket)
  if (!binding.ok || !isPrerelease()) return binding
  const token = prereleaseSessionToken(req)
  if (!token) return { ok: false, status: 401, code: 'prerelease_auth_required' }
  try {
    const service = getPrereleaseSessions()
    if (!service) return paused
    const session = await service.resolve(token)
    if (session) return admitted
    return service.status(token) === 'expired' ? { ok: false, status: 403, code: 'prerelease_access_expired' } : paused
  } catch { return paused }
}

type SocketAdmission = { token: string; binding: PrereleaseBinding }
const sockets = new Map<WebSocket, SocketAdmission>()
let timer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined

export function prereleaseSocketAllowed(ws: WebSocket): boolean {
  if (!isPrerelease()) return true
  try {
    const row = sockets.get(ws)
    return !!row && getPrereleaseSessions()?.cachedAuthorized(row.token, row.binding) === true
  } catch { return false }
}

type PrereleaseSocketCloseReason = Extract<PrereleaseAccessErrorCode,
  'prerelease_runtime_changed' | 'prerelease_access_expired' | 'prerelease_access_paused'>

/** The browser uses this reason to stop local execution as soon as access ends. */
export function closePrereleaseSocket(ws: WebSocket): void {
  if (!isPrerelease()) return
  const row = sockets.get(ws)
  let reason: PrereleaseSocketCloseReason = 'prerelease_access_paused'
  if (!row) reason = 'prerelease_runtime_changed'
  else {
    try {
      const service = getPrereleaseSessions()
      if (service && (row.binding.buildId !== service.runtime.buildId || row.binding.generationId !== service.runtime.generationId)) reason = 'prerelease_runtime_changed'
      else if (service?.status(row.token) === 'expired') reason = 'prerelease_access_expired'
    } catch { /* Unknown identity state pauses execution without asserting revocation. */ }
  }
  ws.close(1008, reason)
}

export function trackPrereleaseSocket(ws: WebSocket, req: IncomingMessage): void {
  if (!isPrerelease()) return
  const binding = prereleaseRequestBinding(req, true)
  if (!binding) { closePrereleaseSocket(ws); return }
  sockets.set(ws, { token: prereleaseSessionToken(req), binding })
  ws.once('close', () => {
    sockets.delete(ws)
    if (!sockets.size) { clearInterval(timer); timer = undefined; unsubscribe?.(); unsubscribe = undefined }
  })
  const sweep = () => {
    for (const socket of sockets.keys()) if (!prereleaseSocketAllowed(socket)) closePrereleaseSocket(socket)
  }
  if (!timer) { timer = setInterval(sweep, 1000); timer.unref() }
  if (!unsubscribe) unsubscribe = getPrereleaseSessions()?.subscribeInvalidation(sweep)
}

export async function prereleaseCommandAllowed(ws: WebSocket): Promise<boolean> {
  if (!isPrerelease()) return true
  const row = sockets.get(ws)
  if (!row) return false
  try {
    await getPrereleaseSessions()?.resolve(row.token)
    return prereleaseSocketAllowed(ws)
  } catch { return false }
}
