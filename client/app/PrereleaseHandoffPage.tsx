import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { BrandMark } from '../components/common/BrandMark'
import { preparePrereleaseHandoff, PrereleaseHandoffFailure, readPrereleaseHandoff } from '../services/prerelease'

export function PrereleaseHandoffPage() {
  const { user, apiFetch } = useAuth()
  const { t } = useLocale()
  const [input] = useState(() => readPrereleaseHandoff(window.location.hash, window.location.origin))
  const [sourceUserId] = useState(user?.id)
  const [failure, setFailure] = useState<PrereleaseHandoffFailure['kind']>()
  const operation = useRef<Promise<string> | null>(null)
  const eligible = user?.id === sourceUserId && (user?.betaAccess === true || user?.isAdmin === true)
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?page=prerelease-handoff`)
    if (!input || !eligible) return
    // StrictMode remounts effects; both subscriptions share one issuance operation.
    operation.current ??= preparePrereleaseHandoff(apiFetch, input, window.location.origin)
    let active = true
    void operation.current.then(destination => { if (active) window.location.replace(destination) }).catch(error => {
      if (active) setFailure(error instanceof PrereleaseHandoffFailure ? error.kind : 'unavailable')
    })
    return () => { active = false }
  }, [input, eligible, apiFetch])
  const error = !input ? 'invalid' : !eligible ? 'access' : failure
  const key = error === 'invalid' ? 'prerelease.handoffInvalid' : error === 'access' ? 'prerelease.accessExpired' : 'prerelease.unavailable'
  return <main className="login-page">
    <section className="login-card">
      <BrandMark title="Open Agricola" className="login-brand" homeLinkLabel={t('prerelease.returnToProduction')} />
      <h1>{t('prerelease.handoffTitle')}</h1>
      {error ? <p role="alert">{t(key)}</p> : <p role="status">{t('prerelease.connecting')}</p>}
      <a className="btn-secondary" href={`${window.location.origin}/`}>{t('prerelease.returnToProduction')}</a>
    </section>
  </main>
}
