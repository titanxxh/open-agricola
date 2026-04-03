import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'

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
        <h1 className="login-title">{t('platform.loginTitle')}</h1>
        <p className="login-subtitle">
          {mode === 'login' ? t('platform.loginSubtitle') : t('platform.registerSubtitle')}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="username">{t('platform.username')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('platform.usernamePlaceholder')}
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
            <label htmlFor="password">{t('platform.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('platform.passwordPlaceholder')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : mode === 'login' ? t('platform.loginBtn') : t('platform.registerBtn')}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <span>
              {t('platform.noAccount')}
              <button type="button" className="btn-link" onClick={() => { setMode('register'); setError('') }}>
                {t('platform.registerBtn')}
              </button>
            </span>
          ) : (
            <span>
              {t('platform.hasAccount')}
              <button type="button" className="btn-link" onClick={() => { setMode('login'); setError('') }}>
                {t('platform.loginBtn')}
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
