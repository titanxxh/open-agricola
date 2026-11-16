import { isPrereleaseClient } from '../services/prerelease-runtime'
import { useEffect, useState } from 'react'
import type { PrereleaseEntry as Entry } from '../../shared/contract/prerelease-identity'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { readPrereleaseEntry } from '../services/prerelease'
import './PrereleaseEntry.css'

type EntryState = { kind: 'hidden' } | Entry

/** Beta badge for the site icon row; pass it as a child of `SiteCommunityLinks`. */
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
  const badge = <span className="prerelease-entry__badge" aria-hidden="true">{t('beta.badge')}</span>
  // The title doubles as the accessible description, so the hint stays available without taking header space.
  return entry.kind === 'available'
    ? <a className="github-repo-link prerelease-entry" href={entry.startUrl} target="_blank" rel="noopener noreferrer"
      aria-label={t('prerelease.entry')} title={t('prerelease.entryHint')}>{badge}</a>
    : <button type="button" className="github-repo-link prerelease-entry" disabled
      aria-label={t('prerelease.entry')} title={t('prerelease.unavailable')}>{badge}</button>
}
