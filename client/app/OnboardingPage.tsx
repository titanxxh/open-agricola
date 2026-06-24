import { useState, type FormEvent } from 'react'
import { API_BASE } from '../config'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { authErrorMessage } from './LoginPage'

export function OnboardingPage() {
  const { t } = useLocale()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        window.history.pushState(null, '', window.location.pathname)
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }
      setError(authErrorMessage(data.code, data.error, t))
    } catch {
      setError(t('platform.networkError'))
    } finally {
      setLoading(false)
    }
  }

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

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="onboarding-username">{t('platform.username')}</label>
            <span className="form-hint">{t('platform.usernamePlaceholder')}</span>
            <input
              id="onboarding-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="onboarding-display-name">{t('platform.displayName')}</label>
            <input
              id="onboarding-display-name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('platform.displayNamePlaceholder')}
            />
          </div>

          <div className="form-field">
            <label htmlFor="onboarding-password">{t('platform.password')}</label>
            <span className="form-hint">{t('platform.passwordPlaceholder')}</span>
            <input
              id="onboarding-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
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
              required
            />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
            {loading ? t('platform.loading') : t('platform.onboardingTitle')}
          </button>
        </form>
      </div>
    </div>
  )
}
