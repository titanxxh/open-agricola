import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { authErrorMessage } from './auth-errors'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, oauthStartUrl } = useAuth()
  const { t } = useLocale()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('authError') ?? undefined
    return code ? authErrorMessage(code, undefined, t) : ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (!result.ok) {
        setError(authErrorMessage(result.code, result.error, t))
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

        {mode === 'login' ? (
          <form onSubmit={handleSubmit} className="login-form">
            <a className="btn-primary" href={oauthStartUrl('github', 'login')}>{t('platform.oauthLoginGithub')}</a>
            <a className="btn-primary" href={oauthStartUrl('google', 'login')}>{t('platform.oauthLoginGoogle')}</a>
            <div className="form-field">
              <label htmlFor="username">{t('platform.username')}</label>
              <span className="form-hint">{t('platform.usernamePlaceholder')}</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">{t('platform.password')}</label>
              <span className="form-hint">{t('platform.passwordPlaceholder')}</span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
              {loading ? t('platform.loading') : t('platform.loginBtn')}
            </button>
          </form>
        ) : (
          <div className="login-form">
            <p>{t('platform.oauthRegisterIntro')}</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <a className="btn-primary" href={oauthStartUrl('github', 'register')}>{t('platform.oauthRegisterGithub')}</a>
            <a className="btn-primary" href={oauthStartUrl('google', 'register')}>{t('platform.oauthRegisterGoogle')}</a>
          </div>
        )}
      </div>
    </div>
  )
}
