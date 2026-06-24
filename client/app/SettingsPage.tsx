import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { Section } from '../components/common/Section'
import { DangerButton } from '../components/common/DangerButton'
import { authErrorMessage } from './auth-errors'
import { setPage } from './PageRouter'

type LinkedIdentity = {
  provider: 'github' | 'google'
  providerLogin?: string
  providerEmail?: string
  linkedAt: number
}

export function SettingsPage() {
  const { user, apiFetch, logout, logoutAll, oauthStartUrl } = useAuth()
  const { t } = useLocale()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [identities, setIdentities] = useState<LinkedIdentity[]>([])
  const authError = new URLSearchParams(window.location.search).get('authError') ?? undefined
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/auth/identities')
      .then(resp => resp.json())
      .then(data => {
        if (!cancelled && data.ok) setIdentities(data.identities ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [apiFetch])

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameMsg(null)
    setSaving(true)
    try {
      const resp = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const d = await resp.json()
      setNameMsg(d.ok ? { ok: true, text: t('platform.saved') } : { ok: false, text: authErrorMessage(d.code, d.error, t) })
    } catch {
      setNameMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: t('platform.passwordMismatch') })
      return
    }
    setSaving(true)
    try {
      const resp = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const d = await resp.json()
      if (d.ok) {
        setPwMsg({ ok: true, text: t('platform.passwordChanged') })
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => { logout() }, 1500)
      } else {
        setPwMsg({ ok: false, text: authErrorMessage(d.code, d.error, t) })
      }
    } catch {
      setPwMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setSaving(false)
    }
  }

  const handleLogoutAll = async () => {
    await logoutAll()
    setPage('lobby')
  }

  const githubIdentity = identities.find(identity => identity.provider === 'github')
  const googleIdentity = identities.find(identity => identity.provider === 'google')

  return (
    <div className="settings-page">
      <header>
        <button type="button" className="ws-back-home" onClick={() => setPage('lobby')}>
          <span aria-hidden="true">‹</span>
          {t('platform.backToLobby')}
        </button>
        <h1>{t('platform.settingsTitle')}</h1>
        <LocaleSwitcher />
      </header>

      <Section icon="👤" title={t('platform.basicInfo')} variant="parchment">
        <p className="settings-readonly">
          🔒 <span className="settings-readonly-chip">{user?.username ?? ''}</span>（{t('platform.notEditable')}）
        </p>
        <form onSubmit={handleSaveName} className="settings-form">
          <div className="form-field">
            <label htmlFor="displayName">{t('platform.displayNameLabel')}</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('platform.displayNameGamePlaceholder')}
              maxLength={60}
            />
          </div>
          {nameMsg && (
            <div className={nameMsg.ok ? 'settings-success' : 'form-error'}>{nameMsg.text}</div>
          )}
          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>{t('platform.save')}</button>
          </div>
        </form>
      </Section>

      <Section icon="🔑" title={t('platform.changePassword')} variant="parchment">
        <form onSubmit={handleChangePassword} className="settings-form">
          <div className="form-field">
            <label htmlFor="currentPassword">{t('platform.currentPassword')}</label>
            <input
              id="currentPassword"
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="newPassword">{t('platform.newPassword')}</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={t('platform.passwordPlaceholder')}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="confirmPassword">{t('platform.confirmNewPassword')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {pwMsg && (
            <div className={pwMsg.ok ? 'settings-success' : 'form-error'}>{pwMsg.text}</div>
          )}
          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>{t('platform.changePasswordBtn')}</button>
          </div>
        </form>
      </Section>

      <Section icon="🔗" title={t('platform.linkedAccounts')} variant="parchment">
        <div className="settings-form">
          {authError && <div className="form-error" role="alert">{authErrorMessage(authError, undefined, t)}</div>}
          <p className="settings-readonly">
            GitHub
            <span className="settings-readonly-chip">{githubIdentity?.providerLogin ?? githubIdentity?.providerEmail ?? t('platform.notLinked')}</span>
          </p>
          <p className="settings-readonly">
            Google
            <span className="settings-readonly-chip">{googleIdentity?.providerEmail ?? googleIdentity?.providerLogin ?? t('platform.notLinked')}</span>
          </p>
          <div className="settings-actions">
            <a className="btn-primary" href={oauthStartUrl('github', 'link')}>{t('platform.linkGithub')}</a>
            <a className="btn-primary" href={oauthStartUrl('google', 'link')}>{t('platform.linkGoogle')}</a>
          </div>
        </div>
      </Section>

      <Section
        icon="⚠️"
        title={t('platform.dangerZone')}
        variant="danger"
        className="settings-danger"
      >
        <DangerButton
          confirmText={t('platform.confirmLogoutAll')}
          onConfirm={handleLogoutAll}
        >
          {t('platform.logoutAllDevices')}
        </DangerButton>
        <p className="settings-hint">{t('platform.logoutNote')}</p>
      </Section>
    </div>
  )
}
