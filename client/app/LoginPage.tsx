import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, register } = useAuth()
  const { t } = useLocale()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await login(username, password)
        : await register(username, password, displayName || undefined)
      if (!result.ok) {
        setError(result.error || t('platform.unknownError'))
      }
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
          title={t('platform.loginTitle')}
          titleAs="h1"
          className="login-brand"
          titleClassName="login-title"
        />
        <p className="login-subtitle">{t('platform.subtitle')}</p>

        <div className="login-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`login-mode-tabs__tab${mode === 'login' ? ' is-active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            {t('platform.loginBtn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`login-mode-tabs__tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => { setMode('register'); setError('') }}
          >
            {t('platform.registerBtn')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="username">
              {t('platform.username')}
              <span className="form-hint">{t('platform.usernamePlaceholder')}</span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-field">
              <label htmlFor="displayName">{t('platform.displayName')}</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={t('platform.displayNamePlaceholder')}
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="password">
              {t('platform.password')}
              <span className="form-hint">{t('platform.passwordPlaceholder')}</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
            {loading ? t('platform.loading') : mode === 'login' ? t('platform.loginBtn') : t('platform.registerBtn')}
          </button>
        </form>
      </div>
    </div>
  )
}
