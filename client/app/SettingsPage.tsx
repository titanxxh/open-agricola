import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { setPage } from './PageRouter'

export function SettingsPage() {
  const { user, apiFetch, logout } = useAuth()
  const { t } = useLocale()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

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
      setNameMsg(d.ok ? { ok: true, text: t('platform.saved') } : { ok: false, text: d.error ?? t('platform.saveFailed') })
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
        setPwMsg({ ok: false, text: d.error ?? t('platform.changeFailed') })
      }
    } catch {
      setPwMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button type="button" className="btn-link" onClick={() => setPage('lobby')}>{t('platform.backToLobby')}</button>
        <h1>{t('platform.settingsTitle')}</h1>
        <LocaleSwitcher />
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2>{t('platform.basicInfo')}</h2>
          <p className="settings-username">{t('platform.usernameLabel', { name: user?.username ?? '' })}</p>
          <form onSubmit={handleSaveName} className="settings-form">
            <div className="form-field">
              <label>{t('platform.displayNameLabel')}</label>
              <input
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
            <button type="submit" className="btn-primary" disabled={saving}>{t('platform.save')}</button>
          </form>
        </div>

        <div className="settings-section">
          <h2>{t('platform.changePassword')}</h2>
          <form onSubmit={handleChangePassword} className="settings-form">
            <div className="form-field">
              <label>{t('platform.currentPassword')}</label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-field">
              <label>{t('platform.newPassword')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('platform.passwordPlaceholder')}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('platform.confirmNewPassword')}</label>
              <input
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
            <button type="submit" className="btn-primary" disabled={saving}>{t('platform.changePasswordBtn')}</button>
          </form>
        </div>

        <div className="settings-section settings-danger">
          <h2>{t('platform.other')}</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { logout(); setPage('lobby') }}
          >
            {t('platform.logoutAll')}
          </button>
          <p className="settings-note">
            {t('platform.logoutNote')}
          </p>
        </div>
      </div>
    </div>
  )
}
