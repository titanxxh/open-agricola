import { normalizePrereleaseReturnPath } from '../../shared/contract/prerelease-runtime'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'
import { useLocale } from '../contexts/LocaleContext'
import { browserApiFetch } from '../services/browser-api'
import {
  acceptPrereleaseSession, getPrereleaseAccess, getPrereleaseRevision, getPrereleaseRuntime, isPrereleaseClient,
  loadPrereleaseRuntime, prereleaseStartUrl, rejectPrereleaseAccess, subscribePrereleaseAccess,
} from '../services/prerelease-runtime'
import './PrereleaseBoundary.css'

function handoffInput() {
  if (window.location.pathname !== `${HOSTED_APP_PATH}auth/handoff`) return undefined
  const params = new URLSearchParams(window.location.hash.slice(1))
  const opaque = (name: string) => { const value = params.get(name); return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined }
  const code = opaque('code'), state = opaque('state'), browserChallenge = opaque('browserChallenge')
  if (params.size !== 5 || params.get('protocolVersion') !== '1' || !code || !state || !browserChallenge) return null
  return { protocolVersion: 1, code, state, browserChallenge, returnTo: params.get('returnTo') }
}

function PrereleaseApplication({ children }: { children: ReactNode }) {
  const { t } = useLocale()
  const access = useSyncExternalStore(subscribePrereleaseAccess, getPrereleaseAccess)
  const [callback] = useState(handoffInput)
  const [ready, setReady] = useState(false)
  const operation = useRef<Promise<void> | undefined>(undefined)
  const handoffAttempted = useRef(false)
  const check = useCallback(async () => {
    try {
      const runtime = await loadPrereleaseRuntime()
      if (!runtime) return
      if (callback === null || callback && callback.returnTo !== `${runtime.formalAppOrigin}/`) {
        rejectPrereleaseAccess('invalid_prerelease_handoff'); return
      }
      const revision = getPrereleaseRevision()
      const firstHandoff = !!callback && !handoffAttempted.current
      handoffAttempted.current = true
      const requestStarted = performance.now()
      const response = await browserApiFetch(firstHandoff ? '/api/prerelease/session' : '/api/auth/me', firstHandoff ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(callback), signal: AbortSignal.timeout(10_000),
      } : { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) {
        if (![400, 401, 403, 426, 503].includes(response.status)) rejectPrereleaseAccess('prerelease_access_paused')
        return
      }
      const result: unknown = await response.json()
      let returnPath: string | undefined
      if (firstHandoff) {
        if (!result || typeof result !== 'object' || !('returnPath' in result) || typeof result.returnPath !== 'string'
          || !(returnPath = normalizePrereleaseReturnPath(result.returnPath))) {
          rejectPrereleaseAccess('invalid_prerelease_handoff'); return
        }
      }
      if (returnPath) window.history.replaceState(window.history.state, '', returnPath)
      acceptPrereleaseSession(result, revision, requestStarted)
    } catch {
      if (getPrereleaseAccess().kind !== 'blocked') rejectPrereleaseAccess('prerelease_access_paused')
    } finally { setReady(true) }
  }, [callback])
  useEffect(() => {
    if (window.location.pathname === `${HOSTED_APP_PATH}auth/handoff`) window.history.replaceState(window.history.state, '', window.location.pathname)
    operation.current ??= check()
    const timer = setInterval(() => { void check() }, 15_000)
    return () => clearInterval(timer)
  }, [callback, check])
  const runtime = getPrereleaseRuntime()
  const code = access.kind === 'blocked' ? access.code : undefined
  const message = code === 'prerelease_access_paused' ? 'prerelease.accessPaused'
    : code === 'prerelease_runtime_changed' ? 'prerelease.reset'
      : code === 'invalid_prerelease_handoff' ? 'prerelease.handoffInvalid'
        : access.kind === 'blocked' ? 'prerelease.accessExpired' : 'prerelease.connecting'
  return <>
    <aside className="prerelease-banner" aria-label={t('prerelease.environment')}>
      <strong>{t('prerelease.version', { version: (runtime?.buildId ?? import.meta.env.VITE_GAME_BUILD_ID ?? '').slice(0, 12) })}</strong>
      {runtime ? <a href={`${runtime.formalAppOrigin}/`}>{t('prerelease.returnToProduction')}</a>
        : <a href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>}
    </aside>
    {access.kind === 'active' ? children : <main className="prerelease-access-screen">
      <h1>{t('prerelease.environment')}</h1>
      <p role={access.kind === 'blocked' ? 'alert' : 'status'}>{t(message)}</p>
      {ready && <button type="button" className="btn-secondary" onClick={() => {
        if (callback || code === 'prerelease_runtime_changed') window.location.reload()
        else void check()
      }}>{t('platform.retry')}</button>}
      {runtime && <a className="btn-primary" href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>}
    </main>}
  </>
}

export function PrereleaseBoundary({ children }: { children: ReactNode }) {
  return isPrereleaseClient() ? <PrereleaseApplication>{children}</PrereleaseApplication> : children
}
