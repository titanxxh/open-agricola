import { normalizePrereleaseReturnPath } from '../../shared/contract/prerelease-runtime'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'
import { useLocale } from '../contexts/LocaleContext'
import { browserApiFetch } from '../services/browser-api'
import {
  acceptPrereleaseSession, getPrereleaseAccess, getPrereleaseLeaseRemainingMs, getPrereleaseRevision, getPrereleaseRuntime, isPrereleaseClient,
  loadPrereleaseRuntime, prereleaseStartUrl, rejectPrereleaseAccess, subscribePrereleaseAccess,
} from '../services/prerelease-runtime'
import './PrereleaseBoundary.css'

type HandoffState =
  | { kind: 'session' }
  | { kind: 'invalid' }
  | { kind: 'terminal' }
  | { kind: 'pending'; input: { protocolVersion: 1; code: string; state: string; browserChallenge: string; returnTo: string } }

function handoffInput(): HandoffState {
  if (window.location.pathname !== `${HOSTED_APP_PATH}auth/handoff`) return { kind: 'session' }
  const params = new URLSearchParams(window.location.hash.slice(1))
  const opaque = (name: string) => { const value = params.get(name); return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined }
  const code = opaque('code'), state = opaque('state'), browserChallenge = opaque('browserChallenge'), returnTo = params.get('returnTo')
  if (params.size !== 5 || params.get('protocolVersion') !== '1' || !code || !state || !browserChallenge || !returnTo) return { kind: 'invalid' }
  return { kind: 'pending', input: { protocolVersion: 1, code, state, browserChallenge, returnTo } }
}

function canRecheckPrerelease() {
  const access = getPrereleaseAccess()
  return access.kind === 'checking' || access.kind === 'active' || access.kind === 'blocked' && access.code === 'prerelease_access_paused'
}

function PrereleaseApplication({ children }: { children: ReactNode }) {
  const { t } = useLocale()
  const access = useSyncExternalStore(subscribePrereleaseAccess, getPrereleaseAccess)
  const handoff = useRef(handoffInput())
  const [ready, setReady] = useState(false)
  const operation = useRef<Promise<void> | undefined>(undefined)
  const retry = useRef<() => void>(() => {})
  const check = useCallback(async () => {
    if (!canRecheckPrerelease()) return
    try {
      const runtime = await loadPrereleaseRuntime()
      if (!runtime) return
      const current = handoff.current
      if (current.kind === 'terminal') return
      if (current.kind === 'invalid' || current.kind === 'pending' && current.input.returnTo !== `${runtime.formalAppOrigin}/`) {
        handoff.current = { kind: 'terminal' }
        rejectPrereleaseAccess('invalid_prerelease_handoff'); return
      }
      const revision = getPrereleaseRevision()
      const firstHandoff = current.kind === 'pending'
      const requestStarted = performance.now()
      const response = await browserApiFetch(firstHandoff ? '/api/prerelease/session' : '/api/auth/me', firstHandoff ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current.kind === 'pending' ? current.input : undefined), signal: AbortSignal.timeout(10_000),
      } : { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) {
        if (firstHandoff && [400, 401, 403, 426].includes(response.status)) handoff.current = { kind: 'terminal' }
        const failed = getPrereleaseAccess()
        if (failed.kind !== 'blocked' && failed.kind !== 'ended') rejectPrereleaseAccess('prerelease_access_paused')
        return
      }
      const result: unknown = await response.json()
      let returnPath: string | undefined
      if (firstHandoff) {
        if (!result || typeof result !== 'object' || !('returnPath' in result) || typeof result.returnPath !== 'string'
          || !(returnPath = normalizePrereleaseReturnPath(result.returnPath))) {
          handoff.current = { kind: 'terminal' }
          rejectPrereleaseAccess('invalid_prerelease_handoff'); return
        }
      }
      if (returnPath) window.history.replaceState(window.history.state, '', returnPath)
      acceptPrereleaseSession(result, revision, requestStarted)
      handoff.current = { kind: 'session' }
    } catch {
      const failed = getPrereleaseAccess()
      if (failed.kind !== 'blocked' && failed.kind !== 'ended') rejectPrereleaseAccess('prerelease_access_paused')
    } finally { setReady(true) }
  }, [])
  useEffect(() => {
    if (window.location.pathname === `${HOSTED_APP_PATH}auth/handoff`) window.history.replaceState(window.history.state, '', window.location.pathname)
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    const poll = async () => {
      if (disposed || !canRecheckPrerelease()) return
      clearTimeout(timer)
      operation.current ??= check().finally(() => { operation.current = undefined })
      await operation.current
      if (disposed || !canRecheckPrerelease()) return
      clearTimeout(timer)
      const remaining = getPrereleaseLeaseRemainingMs()
      timer = setTimeout(() => { void poll() }, remaining > 0 ? Math.min(15_000, Math.max(1, remaining / 2)) : 15_000)
    }
    retry.current = () => { void poll() }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [check])
  const runtime = getPrereleaseRuntime()
  const code = access.kind === 'blocked' || access.kind === 'ended' ? access.code : undefined
  const message = code === 'prerelease_access_paused' ? 'prerelease.accessPaused'
    : code === 'prerelease_runtime_changed' ? 'prerelease.reset'
      : code === 'invalid_prerelease_handoff' ? 'prerelease.handoffInvalid'
        : code ? 'prerelease.accessExpired' : 'prerelease.connecting'
  return <>
    <aside className="prerelease-banner" aria-label={t('prerelease.environment')}>
      <strong>{t('prerelease.version', { version: (runtime?.buildId ?? import.meta.env.VITE_GAME_BUILD_ID ?? '').slice(0, 12) })}</strong>
      {runtime ? <a href={`${runtime.formalAppOrigin}/`}>{t('prerelease.returnToProduction')}</a>
        : <a href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>}
    </aside>
    {access.kind === 'active' ? children : <main className="prerelease-access-screen">
      <h1>{t('prerelease.environment')}</h1>
      <p role={code ? 'alert' : 'status'}>{t(message)}</p>
      {ready && code === 'prerelease_access_paused' && <button type="button" className="btn-secondary" onClick={() => retry.current()}>{t('platform.retry')}</button>}
      {runtime && <a className="btn-primary" href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>}
    </main>}
  </>
}

export function PrereleaseBoundary({ children }: { children: ReactNode }) {
  return isPrereleaseClient() ? <PrereleaseApplication>{children}</PrereleaseApplication> : children
}
