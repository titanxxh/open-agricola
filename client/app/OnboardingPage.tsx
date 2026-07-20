import { useEffect, useState, type FormEvent } from 'react'
import { API_BASE } from '../config'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { authErrorMessage } from './auth-errors'
import { setPage } from './PageRouter'

function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  try {
    new URL(raw, 'http://open-agricola.local')
    return raw
  } catch {
    return null
  }
}

function appBasePath(): string {
  const configured = new URL(import.meta.env.BASE_URL || '/', window.location.origin).pathname.replace(/\/$/, '')
  if (configured) return configured
  const current = window.location.pathname
  return current !== '/' && current.endsWith('/') ? current.replace(/\/$/, '') : ''
}

function onboardingDestination(rawReturnTo: unknown): string {
  const returnTo = safeReturnTo(rawReturnTo)
  if (!returnTo) return window.location.pathname
  const basePath = appBasePath()
  if (!basePath || returnTo === basePath || returnTo.startsWith(`${basePath}/`) || returnTo.startsWith(`${basePath}?`)) {
    return returnTo
  }
  return `${basePath}${returnTo}`
}

type RegistrationPolicy = 'invite_only' | 'open' | 'disabled'

export function OnboardingPage() {
  const { refreshSession } = useAuth()
  const { t } = useLocale()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null)
  const [policyLoadFailed, setPolicyLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/auth/registration-policy`, { credentials: 'include' })
      .then(resp => {
        if (!resp.ok) throw new Error('registration policy request failed')
        return resp.json()
      })
      .then(data => {
        if (!cancelled && (data.policy === 'invite_only' || data.policy === 'open' || data.policy === 'disabled')) {
          setPolicy(data.policy)
          setPolicyLoadFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPolicyLoadFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!username.trim()) {
      setError(authErrorMessage('invalid_username', undefined, t))
      return
    }
    if (password.length < 8) {
      setError(authErrorMessage('invalid_password', undefined, t))
      return
    }
    if (password !== confirmPassword) {
      setError(authErrorMessage('password_mismatch', undefined, t))
      return
    }
    if (policy === 'disabled') {
      setError(authErrorMessage('registration_disabled', undefined, t))
      return
    }
    if (policyLoadFailed) {
      setError(t('platform.networkError'))
      return
    }
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/auth/onboarding/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          password,
          confirmPassword,
        }),
      })
      const data = await resp.json()
      if (data.ok) {
        await refreshSession()
        window.history.pushState(null, '', onboardingDestination(data.returnTo))
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }
      if (data.code === 'oauth_onboarding_expired') {
        setExpired(true)
        return
      }
      setError(authErrorMessage(data.code, data.error, t))
    } catch {
      setError(t('platform.networkError'))
    } finally {
      setLoading(false)
    }
  }

  const formError = error || (policyLoadFailed ? t('platform.networkError') : '')

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-top-bar">
          <LocaleSwitcher />
        </div>
        <BrandMark
          title={t('platform.onboardingTitle')}
          titleAs="h1"
          className="login-brand"
          titleClassName="login-title"
        />
        <p className="login-subtitle">{t('platform.onboardingSubtitle')}</p>

        {expired ? (
          <div className="login-form">
            <h2 className="auth-method-title">{t('platform.onboardingExpiredTitle')}</h2>
            <p role="alert">{authErrorMessage('oauth_onboarding_expired', undefined, t)}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setPage('login', { authMode: 'register' })}
            >
              {t('platform.restartRegistration')}
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="onboarding-username">{t('platform.username')}</label>
            <span id="onboarding-username-hint" className="form-hint">{t('platform.usernamePlaceholder')}</span>
            <input
              id="onboarding-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              aria-describedby="onboarding-username-hint"
              aria-invalid={formError ? true : undefined}
              aria-errormessage={formError ? 'onboarding-error' : undefined}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="onboarding-display-name">{t('platform.displayName')}</label>
            <span id="onboarding-display-name-hint" className="form-hint">{t('platform.displayNamePlaceholder')}</span>
            <input
              id="onboarding-display-name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              aria-describedby="onboarding-display-name-hint"
              aria-invalid={formError ? true : undefined}
              aria-errormessage={formError ? 'onboarding-error' : undefined}
            />
          </div>

          <div className="form-field">
            <label htmlFor="onboarding-password">{t('platform.password')}</label>
            <span id="onboarding-password-hint" className="form-hint">{t('platform.passwordPlaceholder')}</span>
            <input
              id="onboarding-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="onboarding-password-hint"
              aria-invalid={formError ? true : undefined}
              aria-errormessage={formError ? 'onboarding-error' : undefined}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="onboarding-confirm-password">{t('platform.confirmPassword')}</label>
            <input
              id="onboarding-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={formError ? true : undefined}
              aria-errormessage={formError ? 'onboarding-error' : undefined}
              required
            />
          </div>

          {formError && <div id="onboarding-error" className="form-error" role="alert">{formError}</div>}

          <button type="submit" className="btn-primary" disabled={loading || policyLoadFailed} aria-busy={loading}>
            {loading ? t('platform.loading') : t('platform.onboardingTitle')}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
