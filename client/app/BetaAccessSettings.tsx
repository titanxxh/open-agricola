import { useEffect, useState } from 'react'
import { isBetaAccessGrant, type BetaAccessGrant } from '../../shared/contract/beta-access'
import type { InvitablePlayer } from '../../shared/contract/room-access'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { DangerButton } from '../components/common/DangerButton'
import { Section } from '../components/common/Section'
import { RoomInvitePicker } from './RoomInvitePicker'
import '../styles/components/beta-access.css'

async function readGrants(response: Response): Promise<BetaAccessGrant[]> {
  const body: unknown = await response.json()
  if (body && typeof body === 'object') {
    if (!response.ok && 'code' in body && body.code === 'beta_access_account_not_found') throw new Error('account_not_found')
    if (response.ok && 'ok' in body && body.ok === true && 'grants' in body && Array.isArray(body.grants)
      && body.grants.every(isBetaAccessGrant)) return body.grants
  }
  throw new Error('request_failed')
}

export function BetaAccessSettings() {
  const { user, apiFetch } = useAuth()
  const { t } = useLocale()
  const [grants, setGrants] = useState<BetaAccessGrant[]>([])
  const [selected, setSelected] = useState<InvitablePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user?.isAdmin) return
    const controller = new AbortController()
    void apiFetch('/api/admin/beta-access', { signal: controller.signal }).then(readGrants).then(value => {
      if (!controller.signal.aborted) { setGrants(value); setLoading(false) }
    }).catch(() => {
      if (!controller.signal.aborted) { setError('request_failed'); setLoading(false) }
    })
    return () => controller.abort()
  }, [apiFetch, user?.isAdmin])
  if (!user?.isAdmin) return null

  const update = async (method: 'PUT' | 'DELETE', userId: string) => {
    setError('')
    setSaving(true)
    try {
      const response = await apiFetch('/api/admin/beta-access', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
      })
      setGrants(await readGrants(response))
      if (method === 'PUT') setSelected([])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'request_failed') }
    finally { setSaving(false) }
  }

  return <Section title={t('beta.adminTitle')} variant="parchment" className="beta-access-settings">
    <p className="settings-hint">{t('beta.adminAutomatic')}</p>
    <form className="settings-form" onSubmit={event => {
      event.preventDefault()
      if (selected[0] && !saving) void update('PUT', selected[0].id)
    }}>
      <div className="form-field">
        <label htmlFor="beta-account">{t('beta.account')}</label>
        <RoomInvitePicker inputId="beta-account" describedBy="beta-account-hint" value={selected} onChange={setSelected}
          placeholder={t('beta.accountPlaceholder')} single searchScope="beta-access" />
        <p id="beta-account-hint" className="settings-hint">{t('beta.accountPlaceholder')}</p>
      </div>
      <div className="settings-actions"><button type="submit" className="btn-primary" disabled={!selected.length || saving || loading}>{t('beta.grant')}</button></div>
    </form>
    {error ? <p role="alert" className="form-error">{t(error === 'account_not_found' ? 'beta.accountNotFound' : 'platform.networkError')}</p> : null}
    {loading ? <p role="status">{t('platform.loading')}</p> : grants.length === 0 ? <p className="settings-hint">{t('beta.noGrants')}</p> :
      <table className="beta-access-table">
        <thead><tr><th>{t('beta.account')}</th><th>{t('beta.grantedBy')}</th><th>{t('beta.grantedAt')}</th><th>{t('beta.revoke')}</th></tr></thead>
        <tbody>{grants.map(grant => <tr key={grant.account.id}>
          <td data-label={t('beta.account')}>{grant.account.displayName} <small>@{grant.account.username}</small></td>
          <td data-label={t('beta.grantedBy')}>{grant.grantedBy ? <>{grant.grantedBy.displayName} <small>@{grant.grantedBy.username}</small></> : '—'}</td>
          <td data-label={t('beta.grantedAt')}><time dateTime={new Date(grant.grantedAt).toISOString()}>{new Date(grant.grantedAt).toLocaleString()}</time></td>
          <td><DangerButton size="sm" disabled={saving} confirmText={t('beta.revokeConfirmImmediate', { username: grant.account.username })}
            onConfirm={() => update('DELETE', grant.account.id)}>{t('beta.revoke')}</DangerButton></td>
        </tr>)}</tbody>
      </table>}
  </Section>
}
