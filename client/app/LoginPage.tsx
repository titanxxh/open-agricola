import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { authErrorMessage } from './auth-errors'
import { API_BASE } from '../config'

type Mode = 'login' | 'register'
type OAuthProvider = 'github' | 'google'
type RegistrationPolicy = 'invite_only' | 'open' | 'disabled'

function OAuthProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === 'github') {
    return (
      <svg className="oauth-provider-icon oauth-provider-icon--github" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.15 10.15 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
      </svg>
    )
  }

  return (
    <svg className="oauth-provider-icon oauth-provider-icon--google" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.25-.19-1.8h-9.18v3.56h5.39c-.11.88-.69 2.2-1.99 3.09l-.02.12 2.89 2.18.2.02c1.84-1.66 2.9-4.1 2.9-7.17Z" />
      <path fill="#34A853" d="M12.23 21.55c2.63 0 4.84-.85 6.45-2.31l-3.07-2.37c-.82.56-1.93.95-3.38.95-2.58 0-4.76-1.66-5.54-3.96l-.11.01-3 2.27-.04.11c1.6 3.1 4.87 5.3 8.69 5.3Z" />
      <path fill="#FBBC05" d="M6.69 13.86a5.78 5.78 0 0 1-.31-1.86c0-.65.11-1.28.3-1.86l-.01-.13-3.04-2.3-.1.05A9.31 9.31 0 0 0 2.5 12c0 1.52.38 2.96 1.04 4.24l3.15-2.38Z" />
      <path fill="#EA4335" d="M12.23 6.18c1.83 0 3.06.77 3.76 1.42l2.75-2.63c-1.69-1.52-3.88-2.46-6.51-2.46-3.82 0-7.09 2.19-8.69 5.29l3.14 2.38c.79-2.3 2.97-4 5.55-4Z" />
    </svg>
  )
}

function OAuthLink({
  provider,
  href,
  disabled,
  onDisabledClick,
  children,
}: {
  provider: OAuthProvider
  href?: string
  disabled?: boolean
  onDisabledClick?: () => void
  children: ReactNode
}) {
  if (disabled) {
    return (
      <button
        type="button"
        className="btn-primary oauth-provider-link is-disabled"
        aria-disabled="true"
        onClick={() => { onDisabledClick?.() }}
      >
        <OAuthProviderIcon provider={provider} />
        <span>{children}</span>
      </button>
    )
  }

  return (
    <a className="btn-primary oauth-provider-link" href={href}>
      <OAuthProviderIcon provider={provider} />
      <span>{children}</span>
    </a>
  )
}

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
  const [registrationPolicy, setRegistrationPolicy] = useState<RegistrationPolicy>('invite_only')
  const [policyLoadFailed, setPolicyLoadFailed] = useState(false)
  const [inviteCode, setInviteCode] = useState('')

  useEffect(() => {
    if (mode !== 'register') return
    let cancelled = false
    fetch(`${API_BASE}/api/auth/registration-policy`, { credentials: 'include' })
      .then(async resp => {
        if (!resp.ok) throw new Error('registration policy request failed')
        return await resp.json()
      })
      .then(data => {
        if (!cancelled && (data.policy === 'invite_only' || data.policy === 'open' || data.policy === 'disabled')) {
          setRegistrationPolicy(data.policy)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPolicyLoadFailed(true)
          setError(t('platform.networkError'))
        }
      })
    return () => { cancelled = true }
  }, [mode, t])

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

  const trimmedInviteCode = inviteCode.trim()
  const inviteRequired = mode === 'register' && registrationPolicy === 'invite_only'
  const registerDisabled = policyLoadFailed || registrationPolicy === 'disabled' || (inviteRequired && !trimmedInviteCode)
  const registerOAuthUrl = (provider: OAuthProvider) => oauthStartUrl(
    provider,
    'register',
    inviteRequired ? { inviteCode: trimmedInviteCode } : undefined,
  )
  const handleDisabledRegisterClick = () => {
    if (registrationPolicy === 'disabled') {
      setError(authErrorMessage('registration_disabled', undefined, t))
      return
    }
    if (policyLoadFailed) {
      setError(t('platform.networkError'))
      return
    }
    if (inviteRequired && !trimmedInviteCode) {
      setError(authErrorMessage('invalid_invite', undefined, t))
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
            onClick={() => { setMode('login'); setError(''); setPolicyLoadFailed(false) }}
          >
            {t('platform.loginBtn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`login-mode-tabs__tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => { setMode('register'); setError(''); setPolicyLoadFailed(false) }}
          >
            {t('platform.registerBtn')}
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleSubmit} className="login-form">
            <OAuthLink provider="github" href={oauthStartUrl('github', 'login')}>{t('platform.oauthLoginGithub')}</OAuthLink>
            <OAuthLink provider="google" href={oauthStartUrl('google', 'login')}>{t('platform.oauthLoginGoogle')}</OAuthLink>
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
            {registrationPolicy === 'invite_only' && (
              <div className="form-field">
                <label htmlFor="register-invite-code">{t('platform.inviteCode')}</label>
                <span className="form-hint">{t('platform.inviteOnlyNote')}</span>
                <input
                  id="register-invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder={t('platform.inviteCodePlaceholder')}
                  autoComplete="off"
                />
              </div>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            <OAuthLink
              provider="github"
              href={registerOAuthUrl('github')}
              disabled={registerDisabled}
              onDisabledClick={handleDisabledRegisterClick}
            >
              {t('platform.oauthRegisterGithub')}
            </OAuthLink>
            <OAuthLink
              provider="google"
              href={registerOAuthUrl('google')}
              disabled={registerDisabled}
              onDisabledClick={handleDisabledRegisterClick}
            >
              {t('platform.oauthRegisterGoogle')}
            </OAuthLink>
          </div>
        )}
      </div>
    </div>
  )
}
