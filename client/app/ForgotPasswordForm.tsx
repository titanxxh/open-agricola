import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { authErrorMessage } from './auth-errors'

type ForgotPasswordFormProps = {
  initialIdentifier?: string
  submitLabel?: string
  onBack?: () => void
}

/** Requests a reset email without leaving the current page, so it also works while another account is signed in. */
export function ForgotPasswordForm({ initialIdentifier = '', submitLabel, onBack }: ForgotPasswordFormProps) {
  const { requestPasswordReset } = useAuth()
  const { t } = useLocale()
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSent(false)
    setLoading(true)
    try {
      const result = await requestPasswordReset(identifier.trim())
      if (!result.ok) {
        setError(authErrorMessage(result.code, result.error, t))
        return
      }
      setSent(true)
    } catch {
      setError(t('platform.networkError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form" aria-labelledby="forgot-password-heading">
      <h2 id="forgot-password-heading" className="auth-method-title">{t('platform.forgotPasswordTitle')}</h2>
      {sent
        ? <p role="status">{t('platform.forgotPasswordSent')}</p>
        : <p>{t('platform.forgotPasswordIntro')}</p>}
      <div className="form-field">
        <label htmlFor="forgot-identifier">{t('platform.forgotPasswordIdentifier')}</label>
        <input
          id="forgot-identifier"
          type="text"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          autoComplete="username"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? 'forgot-error' : undefined}
          required
        />
      </div>
      {error && <div id="forgot-error" className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn-primary" disabled={loading || !identifier.trim()} aria-busy={loading}>
        {loading ? t('platform.loading') : submitLabel ?? t('platform.forgotPasswordSubmit')}
      </button>
      <p className="form-hint">{t('platform.forgotPasswordOAuthNote')}</p>
      {onBack && (
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t('platform.backToLogin')}
        </button>
      )}
    </form>
  )
}
