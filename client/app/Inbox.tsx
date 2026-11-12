import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InboxMessage, InboxPage } from '../../shared/contract/bug-report-feedback'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { feedbackKindKey, readInboxMessage, readInboxPage } from '../services/bug-report-feedback'
import '../styles/components/inbox.css'

const INBOX_CHANGED = 'open-agricola-inbox-changed'

type InboxButtonProps = { className?: string; menuItem?: boolean }

export function InboxButton(props: InboxButtonProps) {
  const { user } = useAuth()
  return user ? <AccountInboxButton key={user.id} {...props} /> : null
}

function AccountInboxButton({ className = '', menuItem = false }: InboxButtonProps) {
  const { user, apiFetch } = useAuth()
  const userId = user?.id
  const { locale, t } = useLocale()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const requestVersion = useRef(0)
  const reading = useRef(0)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<InboxPage | null>(null)
  const [selected, setSelected] = useState<InboxMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const refresh = useCallback(async (before?: number) => {
    if (!userId) return
    const version = ++requestVersion.current
    try {
      const value = await readInboxPage(await apiFetch(`/api/v1/inbox${before ? `?before=${before}` : ''}`))
      if (version !== requestVersion.current) return
      setPage(current => before && current ? { ...value, messages: [...current.messages, ...value.messages] } : value)
      setError(false)
    } catch { if (version === requestVersion.current) setError(true) }
  }, [apiFetch, userId])

  useEffect(() => {
    if (!userId) return
    const invalidate = () => { requestVersion.current++; reading.current++ }
    const load = () => { void refresh() }
    load()
    window.addEventListener('focus', load)
    window.addEventListener(INBOX_CHANGED, load)
    return () => { invalidate(); window.removeEventListener('focus', load); window.removeEventListener(INBOX_CHANGED, load) }
  }, [refresh, userId])
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [open])

  const close = () => { reading.current++; setOpen(false); setSelected(null) }
  const read = async (id: number) => {
    const version = ++reading.current
    setBusy(true); setError(false)
    try {
      const value = await readInboxMessage(await apiFetch(`/api/v1/inbox/${id}`))
      if (version !== reading.current) return
      setSelected(value)
      const marked = await readInboxMessage(await apiFetch(`/api/v1/inbox/${id}/read`, { method: 'POST' }))
      if (version !== reading.current) return
      setSelected(marked)
      window.dispatchEvent(new Event(INBOX_CHANGED))
    } catch { if (version === reading.current) setError(true) }
    finally { if (version === reading.current) setBusy(false) }
  }
  if (!user) return null
  const label = page?.unreadCount ? t('feedback.unreadLabel', { count: page.unreadCount }) : t('feedback.inbox')
  return <>
    <button type="button" className={`inbox-button ${className}`} role={menuItem ? 'menuitem' : undefined}
      aria-label={label} aria-haspopup="dialog" onClick={() => { setOpen(true); setBusy(false); void refresh() }}>
      <span>{t('feedback.inbox')}</span>{page?.unreadCount ? <span className="inbox-button__count" aria-hidden="true">{page.unreadCount}</span> : null}
    </button>
    {open && createPortal(<dialog ref={dialog} className="inbox-dialog" aria-labelledby={titleId}
      onClose={event => { if (!event.currentTarget.open) close() }}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <header><h2 id={titleId}>{t('feedback.inbox')}</h2><button type="button" className="btn-link" onClick={close} aria-label={t('ui.close')}>×</button></header>
      {error && <div role="alert"><p>{t('feedback.failed')}</p><button type="button" className="btn-secondary" disabled={busy}
        onClick={() => { if (selected) void read(selected.id); else void refresh() }}>{t('feedback.retry')}</button></div>}
      {selected ? <article className="inbox-message">
        <button type="button" className="btn-link" onClick={() => { reading.current++; setBusy(false); setSelected(null); setError(false) }}>{t('feedback.back')}</button>
        <h3>{selected.reportSummary}</h3><p className="inbox-message__kind">{t(feedbackKindKey[selected.kind])}</p>
        <time dateTime={new Date(selected.createdAt).toISOString()}>{new Date(selected.createdAt).toLocaleString(locale)}</time>
        <p className="inbox-message__explanation">{selected.kind === 'fix_released' ? t('feedback.releaseExplanation') : selected.explanation}</p>
        {selected.kind === 'fix_released' && <>
          {selected.explanation && <><h4>{t('feedback.fixSummary')}</h4><p className="inbox-message__explanation">{selected.explanation}</p></>}
          {selected.release.historicalFirstIncluded && <p>{t('feedback.historicalFirstIncluded', { version: selected.release.historicalFirstIncluded.version })}{' '}<a href={selected.release.historicalFirstIncluded.url} target="_blank" rel="noopener noreferrer">{t('feedback.releaseLink', { version: selected.release.historicalFirstIncluded.version })}</a></p>}
          <p>{t('feedback.firstVerifiedRelease', { version: selected.release.firstVerified.version })}</p>
          <time dateTime={new Date(selected.release.firstVerified.verifiedAt).toISOString()}>{new Date(selected.release.firstVerified.verifiedAt).toLocaleString(locale)}</time>
          <p><a href={selected.release.firstVerified.url} target="_blank" rel="noopener noreferrer">{t('feedback.releaseLink', { version: selected.release.firstVerified.version })}</a></p>
          {selected.currentProduction && selected.currentProduction.sha !== selected.release.firstVerified.sha && <p>
            {t('feedback.currentProductionRelease', { version: selected.currentProduction.version })}{' '}
            <a href={selected.currentProduction.url} target="_blank" rel="noopener noreferrer">{t('feedback.releaseLink', { version: selected.currentProduction.version })}</a>
            {' '}<time dateTime={new Date(selected.currentProduction.verifiedAt).toISOString()}>{new Date(selected.currentProduction.verifiedAt).toLocaleString(locale)}</time>
          </p>}
          <h4>{t('feedback.relatedReports')}</h4>
          <ul>{(selected.relatedReports ?? selected.release.reports).map(report => <li key={report.submissionId}>
            <a href={`https://github.com/titanxxh/open-agricola/issues/${report.issueNumber}`} target="_blank" rel="noopener noreferrer">{t('feedback.reportLink', { number: report.issueNumber })}</a>
          </li>)}</ul>
        </>}
        {selected.kind === 'needs_info' && <><h4>{t('feedback.missingItems')}</h4>
          <ul>{selected.missingItems.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <p>{t('feedback.githubAccountHint')}</p></>}
        <a href={selected.issueUrl} target="_blank" rel="noopener noreferrer">{t('feedback.reportLink', { number: selected.issueNumber })}</a>
      </article> : !page ? !error && <p role="status">{t('platform.loading')}</p> : <>
        {page.messages.length === 0 ? <p>{t('feedback.empty')}</p> : <ol className="inbox-list">{page.messages.map(entry => <li key={entry.id}>
          <button type="button" disabled={busy} onClick={() => { void read(entry.id) }}>
            <span>{entry.reportSummary}</span><small>{entry.readAt === null ? t('feedback.unread') : t('feedback.read')}</small>
            <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString(locale)}</time>
          </button>
        </li>)}</ol>}
        {page.nextCursor !== null && <button type="button" className="btn-secondary" onClick={() => { void refresh(page.nextCursor ?? undefined) }}>{t('feedback.more')}</button>}
      </>}
    </dialog>, document.body)}
  </>
}
