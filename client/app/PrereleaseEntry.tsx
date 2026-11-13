import { isPrereleaseClient } from '../services/prerelease-runtime'
import { useEffect, useState } from 'react'
import type { PrereleaseEntry as Entry } from '../../shared/contract/prerelease-identity'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { readPrereleaseEntry } from '../services/prerelease'

type EntryState = { kind: 'hidden' } | Entry

export function PrereleaseEntry() {
  const { user, apiFetch } = useAuth()
  const { t } = useLocale()
  const eligible = !isPrereleaseClient() && (user?.betaAccess === true || user?.isAdmin === true)
  const [entry, setEntry] = useState<EntryState>({ kind: 'disabled' })
  useEffect(() => {
    if (!eligible) return
    let request = 0
    const refresh = async () => {
      const current = ++request
      setEntry(previous => previous.kind === 'hidden' ? previous : { kind: 'disabled' })
      try {
        const response = await apiFetch('/api/prerelease/entry')
        if (current !== request) return
        if (response.status === 401 || response.status === 403) { setEntry({ kind: 'hidden' }); return }
        if (!response.ok) throw new Error('Prerelease unavailable')
        const data: unknown = await response.json()
        if (current === request) setEntry(readPrereleaseEntry(data, window.location.origin))
      } catch { if (current === request) setEntry(previous => previous.kind === 'hidden' ? previous : { kind: 'disabled' }) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { request++; window.removeEventListener('focus', refresh) }
  }, [eligible, user?.id, apiFetch])
  if (!eligible || entry.kind === 'hidden') return null
  return <div className="prerelease-entry">
    {entry.kind === 'available'
      ? <a className="btn-secondary" href={entry.startUrl} target="_blank" rel="noopener noreferrer">{t('prerelease.entry')}</a>
      : <button type="button" className="btn-secondary" disabled>{t('prerelease.entry')}</button>}
    <p className="settings-hint" role="status">{t(entry.kind === 'available' ? 'prerelease.entryHint' : 'prerelease.unavailable')}</p>
  </div>
}
