import { useEffect, useState } from 'react'
import { OFFLINE_ENCYCLOPEDIA_PATH, type OfflineEncyclopediaManifest } from '../../../shared/contract/offline-encyclopedia'
import { useLocale } from '../../contexts/LocaleContext'
import { getLanguageManifest } from '../../services/language-pack'
import { downloadOfflineEncyclopedia, loadOfflineEncyclopediaManifest } from '../../services/offline-encyclopedia'
import { deleteOfflineEncyclopedia, readSavedOfflineEncyclopedia, type SavedOfflineEncyclopedia } from '../../services/offline-encyclopedia-storage'
import './offline-encyclopedia.css'

const prefix = 'ui.encyclopedia.offline.'
type Operation = 'idle' | 'saving' | 'deleting'
type Failure = 'saveFailed' | 'removeFailed'

export function OfflineEncyclopediaControls() {
  const { locale, t } = useLocale()
  const [manifest, setManifest] = useState<OfflineEncyclopediaManifest>()
  const [saved, setSaved] = useState<SavedOfflineEncyclopedia | null>(null)
  const [active, setActive] = useState(false)
  const [operation, setOperation] = useState<Operation>('idle')
  const [failure, setFailure] = useState<Failure>()

  useEffect(() => {
    let mounted = true
    function refresh() {
      void readSavedOfflineEncyclopedia().then((value) => {
        if (mounted) setSaved(value)
      }).catch(() => { if (mounted) setSaved(null) })
      void loadOfflineEncyclopediaManifest().then((value) => {
        if (mounted) setManifest(value)
      }).catch(() => { if (mounted) setManifest(undefined) })
    }
    refresh()
    void navigator.serviceWorker.ready.then(() => { if (mounted) setActive(true) }).catch(() => undefined)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      mounted = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [])

  async function handleSave() {
    setOperation('saving')
    setFailure(undefined)
    try {
      await downloadOfflineEncyclopedia(locale)
    } catch {
      setFailure('saveFailed')
    } finally {
      const [archive, nextManifest] = await Promise.allSettled([
        readSavedOfflineEncyclopedia(), loadOfflineEncyclopediaManifest(),
      ])
      if (archive.status === 'fulfilled') setSaved(archive.value)
      if (nextManifest.status === 'fulfilled') setManifest(nextManifest.value)
      setOperation('idle')
    }
  }

  async function handleDelete() {
    setOperation('deleting')
    setFailure(undefined)
    try {
      await deleteOfflineEncyclopedia()
      setSaved(null)
    } catch {
      setFailure('removeFailed')
    } finally {
      setOperation('idle')
    }
  }

  const candidate = manifest?.packs.find(pack => pack.locale === locale)
  const savedVersion = saved && manifest?.packs.find(pack => pack.locale === saved.pack.locale)
  const updateAvailable = saved && savedVersion && saved.pack.sha256 !== savedVersion.sha256
  const sameLanguage = saved?.pack.locale === locale
  const action = saved ? sameLanguage ? 'update' : 'switchLanguage' : 'save'
  const busy = operation !== 'idle'

  const details = saved && t(prefix + 'details', {
    language: getLanguageManifest()?.languages.find(language => language.id === saved.pack.locale)?.name ?? saved.pack.locale,
    version: saved.pack.contentVersion.slice(0, 12),
    savedAt: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(saved.savedAt),
    size: new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 0 }).format(saved.pack.size / 1000),
  })
  return (
    <section className="encyclopedia-offline" aria-labelledby="encyclopedia-offline-title">
      <h2 id="encyclopedia-offline-title">{t(prefix + 'title')}</h2>
      {details && <p>{details}</p>}
      {updateAvailable && <p>{t(prefix + 'updateAvailable')}</p>}
      <div className="encyclopedia-offline__actions">
        <a href={OFFLINE_ENCYCLOPEDIA_PATH}>{t(prefix + 'open')}</a>
        {candidate && (!saved || !sameLanguage || updateAvailable) && (
          <button type="button" disabled={!active || busy} onClick={() => void handleSave()}>{t(prefix + action)}</button>
        )}
        {saved && <button type="button" disabled={busy} onClick={() => void handleDelete()}>{t(prefix + 'remove')}</button>}
      </div>
      {operation === 'saving' && <p role="status">{t(prefix + 'saving')}</p>}
      {failure && <p role="alert">{t(prefix + failure)}</p>}
    </section>
  )
}
