import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { SiteCommunityLinks } from '../components/common/SiteCommunityLinks'
import { BrandMark } from '../components/common/BrandMark'
import { authErrorMessage } from './auth-errors'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { setPage } from '../utils/platform-page-url'

const TOKEN_KEY = 'open-agricola-password-reset-token'
const FRAGMENT_KEY = 'passwordResetToken'

function readStorage(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

function writeStorage(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch { /* the in-memory token still works for this page view */ }
}

/** Moves the emailed token out of the address bar so it stays out of history; a reload keeps it per tab. */
function readResetToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const token = fragment.get(FRAGMENT_KEY)
  if (token !== null) {
    fragment.delete(FRAGMENT_KEY)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${fragment.size ? `#${fragment}` : ''}`)
    writeStorage(token || null)
    return token || null
  }
  return readStorage()
}

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const { t } = useLocale()
  const [token] = useState(readResetToken)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [linkInvalid, setLinkInvalid] = useState(() => !token)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
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
      const result = await resetPassword({ token: token ?? '', password, confirmPassword })
      if (result.ok) {
        writeStorage(null)
        setPage('lobby')
        return
      }
      if (result.code === 'password_reset_token_invalid') {
        writeStorage(null)
        setLinkInvalid(true)
        return
      }
      setError(authErrorMessage(result.code, result.error, t))
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
          <SiteCommunityLinks />
          <LocaleSwitcher />
        </div>
        <BrandMark
          title={t('platform.loginTitle')}
          className="login-brand"
          titleClassName="login-title"
          homeLinkLabel={t('platform.backToLobbyPlain')}
        />
        <h1 className="login-context-title">{t('platform.resetPasswordTitle')}</h1>

        {linkInvalid ? (
          <>
            <p role="alert" className="form-error">{authErrorMessage('password_reset_token_invalid', undefined, t)}</p>
            {/* Requested in place: the login page redirects a signed-in viewer to the lobby. */}
            <ForgotPasswordForm submitLabel={t('platform.requestNewResetLink')} />
          </>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="reset-password">{t('platform.newPassword')}</label>
              <span id="reset-password-hint" className="form-hint">{t('platform.passwordPlaceholder')}</span>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-describedby="reset-password-hint"
                aria-invalid={error ? true : undefined}
                aria-errormessage={error ? 'reset-password-error' : undefined}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="reset-confirm-password">{t('platform.confirmNewPassword')}</label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={error ? true : undefined}
                aria-errormessage={error ? 'reset-password-error' : undefined}
                required
              />
            </div>

            {error && <div id="reset-password-error" className="form-error" role="alert">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
              {loading ? t('platform.loading') : t('platform.resetPasswordSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
