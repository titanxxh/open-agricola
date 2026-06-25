import { useCallback, useEffect, useState } from 'react'
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

type AdminInvite = {
  id: string
  createdAt: number
  expiresAt: number | null
  usedAt: number | null
  usedBy: string | null
  revokedAt: number | null
  status: 'active' | 'used' | 'expired' | 'revoked'
}

export function SettingsPage() {
  const { user, apiFetch, logout, logoutAll, oauthStartUrl } = useAuth()
  const { t } = useLocale()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [identities, setIdentities] = useState<LinkedIdentity[]>([])
  const [invites, setInvites] = useState<AdminInvite[]>([])
  const [generatedInvite, setGeneratedInvite] = useState('')
  const [inviteDays, setInviteDays] = useState(7)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const authError = new URLSearchParams(window.location.search).get('authError') ?? undefined
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const loadInvites = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/admin/invites')
      const data = await resp.json()
      if (data.ok) setInvites(data.invites ?? [])
      else setInviteMsg({ ok: false, text: authErrorMessage(data.code, data.error, t) })
    } catch {
      setInviteMsg({ ok: false, text: t('platform.networkError') })
    }
  }, [apiFetch, t])

  useEffect(() => {
    if (!user?.isAdmin) return
    let cancelled = false
    apiFetch('/api/admin/invites')
      .then(resp => resp.json())
      .then(data => {
        if (cancelled) return
        if (data.ok) setInvites(data.invites ?? [])
        else setInviteMsg({ ok: false, text: authErrorMessage(data.code, data.error, t) })
      })
      .catch(() => {
        if (!cancelled) setInviteMsg({ ok: false, text: t('platform.networkError') })
      })
    return () => { cancelled = true }
  }, [apiFetch, t, user?.isAdmin])

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

  const handleGenerateInvite = async () => {
    setInviteMsg(null)
    setGeneratedInvite('')
    setInviteLoading(true)
    try {
      const resp = await apiFetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: inviteDays }),
      })
      const data = await resp.json()
      if (data.ok) {
        setGeneratedInvite(data.invite.code)
        await loadInvites()
      } else {
        setInviteMsg({ ok: false, text: authErrorMessage(data.code, data.error, t) })
      }
    } catch {
      setInviteMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setInviteMsg(null)
    setInviteLoading(true)
    try {
      const resp = await apiFetch(`/api/admin/invites/${encodeURIComponent(inviteId)}/revoke`, { method: 'POST' })
      const data = await resp.json()
      if (data.ok) await loadInvites()
      else setInviteMsg({ ok: false, text: authErrorMessage(data.code, data.error, t) })
    } catch {
      setInviteMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteMsg(null)
    setDeleting(true)
    try {
      const resp = await apiFetch('/api/auth/account', { method: 'DELETE' })
      const d = await resp.json()
      if (d.ok) {
        setDeleteMsg({ ok: true, text: t('platform.accountDeleted') })
        await logout()
        setPage('lobby')
      } else {
        setDeleteMsg({ ok: false, text: authErrorMessage(d.code, d.error, t) })
      }
    } catch {
      setDeleteMsg({ ok: false, text: t('platform.networkError') })
    } finally {
      setDeleting(false)
    }
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

      {user?.isAdmin && (
        <Section icon="🎟️" title={t('platform.adminInvites')} variant="parchment">
          <div className="settings-form">
            <div className="form-field">
              <label htmlFor="invite-days">{t('platform.inviteExpiresInDays')}</label>
              <input
                id="invite-days"
                type="number"
                min={1}
                max={365}
                value={inviteDays}
                onChange={e => setInviteDays(Number(e.target.value) || 1)}
              />
            </div>
            <div className="settings-actions">
              <button type="button" className="btn-primary" disabled={inviteLoading} onClick={handleGenerateInvite}>
                {t('platform.generateInvite')}
              </button>
            </div>
            {generatedInvite && (
              <div className="settings-success">
                <strong>{t('platform.generatedInvite')}</strong>
                <code>{generatedInvite}</code>
                <p className="settings-hint">{t('platform.inviteShownOnce')}</p>
              </div>
            )}
            {inviteMsg && (
              <div className={inviteMsg.ok ? 'settings-success' : 'form-error'}>{inviteMsg.text}</div>
            )}
            {invites.length === 0 ? (
              <p className="settings-hint">{t('platform.noInvites')}</p>
            ) : (
              <div className="settings-form">
                {invites.map(invite => (
                  <p className="settings-readonly" key={invite.id}>
                    <span className="settings-readonly-chip">{t(`platform.inviteStatus.${invite.status}`)}</span>
                    <span>{new Date(invite.createdAt).toLocaleString()}</span>
                    {invite.status === 'active' && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={inviteLoading}
                        onClick={() => { void handleRevokeInvite(invite.id) }}
                      >
                        {t('platform.revokeInvite')}
                      </button>
                    )}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

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
        <DangerButton
          confirmText={t('platform.confirmDeleteAccount')}
          onConfirm={handleDeleteAccount}
          disabled={deleting}
        >
          {t('platform.deleteAccount')}
        </DangerButton>
        {deleteMsg && (
          <div className={deleteMsg.ok ? 'settings-success' : 'form-error'}>{deleteMsg.text}</div>
        )}
        <p className="settings-hint">{t('platform.deleteAccountNote')}</p>
      </Section>
    </div>
  )
}
