import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import {
  PRERELEASE_BUILD_HEADER, PRERELEASE_GENERATION_HEADER, PRERELEASE_BUILD_PROTOCOL_PREFIX,
  PRERELEASE_GENERATION_PROTOCOL_PREFIX, normalizePrereleaseReturnPath, type PrereleaseRuntime, type PrereleaseSessionResponse,
} from '../../shared/contract/prerelease-runtime'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'
const API_BASE = import.meta.env.VITE_API_BASE || ''

export type PrereleaseFailure = 'prerelease_auth_required' | 'prerelease_access_paused' | 'prerelease_access_expired' | 'prerelease_runtime_changed' | 'invalid_prerelease_handoff'
export type PrereleaseAccess = { kind: 'checking' } | { kind: 'active'; session: PrereleaseSessionResponse } | { kind: 'blocked'; code: PrereleaseFailure }
const listeners = new Set<() => void>()
let runtime: PrereleaseRuntime | undefined
let access: PrereleaseAccess = { kind: 'checking' }
let revision = 0
let subjectId: string | undefined
let pending: Promise<PrereleaseRuntime | undefined> | undefined
let leaseTimer: ReturnType<typeof setTimeout> | undefined
let leaseDeadline = 0
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const isPrereleaseClient = () => import.meta.env.VITE_RELEASE_CHANNEL === 'prerelease'
export const getPrereleaseRuntime = () => runtime
export const getPrereleaseAccess = () => access
export const getPrereleaseRevision = () => revision
export function subscribePrereleaseAccess(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener) }
}
function publish(next: PrereleaseAccess) { access = next; for (const listener of listeners) listener() }
export function rejectPrereleaseAccess(code: PrereleaseFailure): void {
  if (!isPrereleaseClient() || access.kind === 'blocked' && access.code === 'prerelease_runtime_changed') return
  clearTimeout(leaseTimer)
  revision++
  publish({ kind: 'blocked', code })
}
const origin = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value } catch { return false }
}
export async function loadPrereleaseRuntime(): Promise<PrereleaseRuntime | undefined> {
  if (!isPrereleaseClient()) return undefined
  pending ??= (async () => {
    const response = await fetch(`${API_BASE}/api/prerelease/runtime`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION) } })
    if (!response.ok) throw new Error('prerelease_access_paused')
    const value: unknown = await response.json()
    const compiled = import.meta.env.VITE_GAME_BUILD_ID
    if (!object(value) || value.ok !== true || value.channel !== 'prerelease'
      || typeof compiled !== 'string' || !/^[a-f0-9]{40}$/.test(compiled) || value.buildId !== compiled
      || typeof value.generationId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.generationId)
      || !origin(value.appOrigin) || value.appOrigin !== window.location.origin || !origin(value.formalAppOrigin)
      || !origin(value.formalApiBase) || new URL(value.formalAppOrigin).hostname === window.location.hostname
      || typeof value.targetId !== 'string' || !value.targetId) throw new Error('prerelease_runtime_changed')
    const next: PrereleaseRuntime = { buildId: compiled, generationId: value.generationId, appOrigin: value.appOrigin,
      formalAppOrigin: value.formalAppOrigin, formalApiBase: value.formalApiBase, targetId: value.targetId }
    if (runtime && (runtime.buildId !== next.buildId || runtime.generationId !== next.generationId)) throw new Error('prerelease_runtime_changed')
    runtime = next
    return runtime
  })().catch(error => { pending = undefined; rejectPrereleaseAccess(error instanceof Error && error.message === 'prerelease_runtime_changed' ? 'prerelease_runtime_changed' : 'prerelease_access_paused'); throw error })
  return pending
}
export function acceptPrereleaseSession(value: unknown, expectedRevision = revision, requestStarted = performance.now()): PrereleaseSessionResponse {
  if (!runtime || !object(value) || value.ok !== true || !object(value.user) || !object(value.prerelease)
    || value.prerelease.buildId !== runtime.buildId || value.prerelease.generationId !== runtime.generationId) {
    rejectPrereleaseAccess('prerelease_runtime_changed'); throw new Error('prerelease_runtime_changed')
  }
  if (expectedRevision !== revision || access.kind === 'blocked' && access.code === 'prerelease_runtime_changed') throw new Error('prerelease_runtime_changed')
  const user = value.user, pre = value.prerelease
  if (typeof user.id !== 'string' || !user.id || typeof user.username !== 'string' || typeof user.displayName !== 'string'
    || user.isAdmin !== false || user.betaAccess !== true || typeof pre.expiresAt !== 'number' || !Number.isSafeInteger(pre.expiresAt)
    || typeof pre.validUntil !== 'number' || !Number.isSafeInteger(pre.validUntil) || pre.validUntil > pre.expiresAt
    || typeof pre.serverTime !== 'number' || !Number.isSafeInteger(pre.serverTime) || pre.validUntil <= pre.serverTime
    || subjectId !== undefined && user.id !== subjectId) {
    rejectPrereleaseAccess('prerelease_access_expired'); throw new Error('prerelease_access_expired')
  }
  const session: PrereleaseSessionResponse = { ok: true, user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin: false, betaAccess: true },
    prerelease: { buildId: runtime.buildId, generationId: runtime.generationId, expiresAt: pre.expiresAt, validUntil: pre.validUntil, serverTime: pre.serverTime } }
  subjectId ??= user.id
  leaseDeadline = requestStarted + Math.min(30_000, pre.validUntil - pre.serverTime)
  const remaining = leaseDeadline - performance.now()
  if (remaining <= 0) { rejectPrereleaseAccess('prerelease_access_paused'); throw new Error('prerelease_access_paused') }
  clearTimeout(leaseTimer)
  leaseTimer = setTimeout(() => rejectPrereleaseAccess('prerelease_access_paused'), remaining)
  publish({ kind: 'active', session })
  return session
}
export function assertPrereleaseAccess(): void {
  if (isPrereleaseClient() && access.kind === 'active' && leaseDeadline <= performance.now()) rejectPrereleaseAccess('prerelease_access_paused')
  if (isPrereleaseClient() && access.kind !== 'active') throw new Error(access.kind === 'blocked' ? access.code : 'prerelease_auth_required')
}
const sessionRoute = (path: string) => ['/api/auth/me', '/api/auth/logout', '/api/auth/logout-all', '/api/prerelease/session'].includes(path)
export function assertPrereleaseResponseAllowed(input: string | URL): void {
  if (isPrereleaseClient() && !sessionRoute(new URL(input, window.location.origin).pathname)) assertPrereleaseAccess()
}
export function bindPrereleaseRequest(input: string | URL, headers: Headers): void {
  if (!isPrereleaseClient()) return
  if (!runtime) throw new Error('prerelease_auth_required')
  const url = new URL(input, window.location.origin)
  if (url.origin !== runtime.appOrigin) throw new Error('prerelease_runtime_changed')
  if (!sessionRoute(url.pathname)) assertPrereleaseAccess()
  if (access.kind === 'blocked' && access.code === 'prerelease_runtime_changed') throw new Error(access.code)
  headers.set(PRERELEASE_BUILD_HEADER, runtime.buildId)
  headers.set(PRERELEASE_GENERATION_HEADER, runtime.generationId)
}
export function prereleaseWebSocketProtocols(): string | string[] {
  if (!isPrereleaseClient()) return BROWSER_WS_PROTOCOL
  assertPrereleaseAccess()
  if (!runtime) throw new Error('prerelease_auth_required')
  return [BROWSER_WS_PROTOCOL, `${PRERELEASE_BUILD_PROTOCOL_PREFIX}${runtime.buildId}`, `${PRERELEASE_GENERATION_PROTOCOL_PREFIX}${runtime.generationId}`]
}
export function observePrereleaseFailure(code: unknown): void {
  if (code === 'prerelease_auth_required' || code === 'prerelease_access_paused' || code === 'prerelease_access_expired'
    || code === 'prerelease_runtime_changed' || code === 'invalid_prerelease_handoff') rejectPrereleaseAccess(code)
}


export function prereleaseStartUrl(search = window.location.search): string {
  const current = new URLSearchParams(search), target = new URLSearchParams()
  for (const key of ['room', 'context', 'step', 'frame', 'perspective', 'page', 'bg', 'lang']) {
    const value = current.get(key)
    if (value !== null) target.set(key, value)
  }
  const query = target.toString()
  const returnPath = normalizePrereleaseReturnPath(`${HOSTED_APP_PATH}${query ? `?${query}` : ''}`) ?? HOSTED_APP_PATH
  return `${HOSTED_APP_PATH}auth/start?${new URLSearchParams({ returnPath })}`
}


export function prereleaseStorageKey(key: string): string {
  if (!isPrereleaseClient()) return key
  if (!runtime) throw new Error('prerelease_auth_required')
  return `${key}:prerelease:${runtime.buildId}:${runtime.generationId}`
}
