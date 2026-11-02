import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../../contexts/LocaleContext'
import { whatsNewText, type WhatsNewRelease } from '../../../shared/contract/whats-new'
import { markWhatsNewSeen, unseenWhatsNewVersions, useWhatsNew } from '../../services/whats-new'
import './WhatsNew.css'

function formatDate(date: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  } catch { return date }
}

function WhatsNewDialog({ releases, fresh, onClose }: {
  releases: readonly WhatsNewRelease[]
  fresh: ReadonlySet<string>
  onClose: () => void
}) {
  const { locale, t } = useLocale()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return createPortal(
    <dialog ref={dialog} className="community-group-dialog whats-new-dialog" aria-labelledby={titleId}
      onClose={event => { if (!event.currentTarget.open) onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="community-group-dialog__content">
        <header>
          <h2 id={titleId}>{t('ui.whatsNew.label')}</h2>
          <button type="button" className="community-group-dialog__close" onClick={onClose} aria-label={t('ui.close')}>×</button>
        </header>
        <ol className="whats-new-dialog__releases">
          {releases.map(release => <li key={release.version}>
            <h3>
              <span>{release.version}</span>
              <time dateTime={release.date}>{formatDate(release.date, locale)}</time>
              {fresh.has(release.version) && <span className="whats-new-dialog__badge">{t('ui.whatsNew.new')}</span>}
            </h3>
            <ul>{release.items.map((item, index) => <li key={index}>{whatsNewText(item, locale)}</li>)}</ul>
          </li>)}
        </ol>
      </div>
    </dialog>, document.body,
  )
}

/** Header entry for host-maintained release notes; hidden until the notes load. */
export function WhatsNewButton() {
  const { t } = useLocale()
  const { releases, seenVersion } = useWhatsNew()
  const [fresh, setFresh] = useState<ReadonlySet<string> | null>(null)
  if (releases.length === 0) return null
  const unread = unseenWhatsNewVersions(releases, seenVersion).size > 0
  const label = unread ? t('ui.whatsNew.unreadLabel') : t('ui.whatsNew.label')
  return <>
    <button type="button" className="github-repo-link community-group-button whats-new-button"
      aria-label={label} title={label} aria-haspopup="dialog"
      onClick={() => { setFresh(unseenWhatsNewVersions(releases, seenVersion)); markWhatsNewSeen() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 2.5 11.8 7.7 17 9.5l-5.2 1.8L10 16.5l-1.8-5.2L3 9.5l5.2-1.8L10 2.5Zm8 10 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6ZM5.5 16l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" />
      </svg>
      {unread && <span className="whats-new-button__dot" aria-hidden="true" />}
    </button>
    {fresh && <WhatsNewDialog releases={releases} fresh={fresh} onClose={() => setFresh(null)} />}
  </>
}
