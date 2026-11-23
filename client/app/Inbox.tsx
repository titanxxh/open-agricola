import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { InboxMessage, InboxPage } from '../../shared/contract/bug-report-feedback'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { useModalDialog } from '../hooks/useModalDialog'
import { feedbackKindKey, readInboxMessage, readInboxPage } from '../services/bug-report-feedback'
import { inboxNotificationTarget, WEB_PUSH_INBOX_EVENT } from '../services/inbox-notification'
import '../styles/components/inbox.css'

const INBOX_CHANGED = 'open-agricola-inbox-changed'
const OPEN_INBOX = 'open-agricola:open-inbox'
const InboxUnreadContext = createContext(0)
type InboxUnread = { userId: string; count: number }

type InboxButtonProps = { className?: string; menuItem?: boolean }

export function InboxButton({ className = '', menuItem = false }: InboxButtonProps) {
  const { user } = useAuth()
  const unreadCount = useContext(InboxUnreadContext)
  const { t } = useLocale()
  if (!user) return null
  const label = unreadCount ? t('feedback.unreadLabel', { count: unreadCount }) : t('feedback.inbox')
  return <button type="button" className={`inbox-button ${className}`} role={menuItem ? 'menuitem' : undefined}
    aria-label={label} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(OPEN_INBOX))}>
    <span>{t('feedback.inbox')}</span>{unreadCount ? <span className="inbox-button__count" aria-hidden="true">{unreadCount}</span> : null}
  </button>
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unread, setUnread] = useState<InboxUnread | null>(null)
  return <InboxUnreadContext.Provider value={unread && unread.userId === user?.id ? unread.count : 0}>
    {children}
    {user && <AccountInbox key={user.id} userId={user.id} setUnread={setUnread} />}
  </InboxUnreadContext.Provider>
}

function AccountInbox({ userId, setUnread }: { userId: string; setUnread: (value: InboxUnread) => void }) {
  const { apiFetch } = useAuth()
  const { locale, t } = useLocale()
  const titleId = useId()
  const requestVersion = useRef(0)
  const loadedThrough = useRef<number | null>(null)
  const reading = useRef(0)
  const body = useRef<HTMLDivElement>(null)
  const listScrollTop = useRef(0)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<InboxPage | null>(null)
  const [selected, setSelected] = useState<InboxMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [unavailableNotification, setUnavailableNotification] = useState(false)
  const refresh = useCallback(async (before?: number) => {
    const version = ++requestVersion.current
    try {
      const oldest = loadedThrough.current
      let value = await readInboxPage(await apiFetch(`/api/v1/inbox${before ? `?before=${before}` : ''}`))
      while (!before && oldest !== null && value.nextCursor !== null && value.nextCursor > oldest) {
        if (version !== requestVersion.current) return
        const next = await readInboxPage(await apiFetch(`/api/v1/inbox?before=${value.nextCursor}`))
        value = { ...next, messages: [...value.messages, ...next.messages] }
      }
      if (version !== requestVersion.current) return
      loadedThrough.current = value.messages.at(-1)?.id ?? (before ? oldest : null)
      setPage(current => before && current ? { ...value, messages: [...current.messages, ...value.messages] } : value)
      setUnread({ userId, count: value.unreadCount })
      setError(false)
    } catch { if (version === requestVersion.current) setError(true) }
  }, [apiFetch, setUnread, userId])

  const read = useCallback(async (id: number, fromNotification = false) => {
    const version = ++reading.current
    setBusy(true); setError(false); setUnavailableNotification(false)
    try {
      const value = await readInboxMessage(await apiFetch(`/api/v1/inbox/${id}`))
      if (value.id !== id) throw new Error('Unexpected inbox message')
      if (version === reading.current) setSelected(value)
    } catch {
      if (version !== reading.current) return
      if (fromNotification) setUnavailableNotification(true)
      else setError(true)
    } finally { if (version === reading.current) setBusy(false) }
  }, [apiFetch])

  useEffect(() => {
    const invalidate = () => { requestVersion.current++; reading.current++ }
    const load = () => { void refresh() }
    const openInbox = () => {
      reading.current++
      listScrollTop.current = 0
      setOpen(true); setSelected(null); setBusy(false); setUnavailableNotification(false)
      load()
    }
    const openNotification = (event: Event) => {
      const target = inboxNotificationTarget(event)
      if (target?.userId !== userId) return
      openInbox()
      if (target.messageId === null) setUnavailableNotification(true)
      else void read(target.messageId, true)
    }
    load()
    window.addEventListener('focus', load)
    window.addEventListener(INBOX_CHANGED, load)
    window.addEventListener(OPEN_INBOX, openInbox)
    window.addEventListener(WEB_PUSH_INBOX_EVENT, openNotification)
    return () => {
      invalidate()
      window.removeEventListener('focus', load)
      window.removeEventListener(INBOX_CHANGED, load)
      window.removeEventListener(OPEN_INBOX, openInbox)
      window.removeEventListener(WEB_PUSH_INBOX_EVENT, openNotification)
    }
  }, [read, refresh, userId])
  useEffect(() => {
    if (!open || !selected || selected.readAt !== null) return
    const version = reading.current
    const markDisplayed = async () => {
      try {
        const marked = await readInboxMessage(await apiFetch(`/api/v1/inbox/${selected.id}/read`, { method: 'POST' }))
        if (marked.id !== selected.id || marked.readAt === null) throw new Error('Inbox message was not marked read')
        if (version === reading.current) {
          setSelected(marked)
          window.dispatchEvent(new Event(INBOX_CHANGED))
        }
      } catch { if (version === reading.current) setError(true) }
    }
    void markDisplayed()
  }, [apiFetch, open, selected])

  const selectedId = selected?.id
  useLayoutEffect(() => {
    if (open && selectedId === undefined && body.current) body.current.scrollTop = listScrollTop.current
  }, [open, selectedId])

  const close = () => { reading.current++; setOpen(false); setSelected(null) }
  const back = () => { reading.current++; setBusy(false); setSelected(null); setError(false) }
  const readFromList = (id: number) => {
    listScrollTop.current = body.current?.scrollTop ?? 0
    void read(id)
  }
  const relatedReports = selected?.kind === 'fix_released'
    ? (selected.relatedReports ?? selected.release.reports).filter(report => report.issueNumber !== selected.issueNumber)
    : []
  return open ? <InboxDialog titleId={titleId} onClose={close}>
    <header className="inbox-dialog__header">
      {selected && <button type="button" className="inbox-dialog__back" onClick={back} aria-label={t('feedback.back')} />}
      <h2 id={titleId}>{t('feedback.inbox')}</h2>
      <button type="button" className="inbox-dialog__close" onClick={close} aria-label={t('ui.close')}>×</button>
    </header>
    <div className="inbox-dialog__body" ref={body} key={selectedId ?? 'list'}>
      {unavailableNotification && <p role="status">{t('webPush.notificationUnavailable')}</p>}
      {error && <div role="alert"><p>{t('feedback.failed')}</p><button type="button" className="btn-secondary" disabled={busy}
        onClick={() => { if (selected) void read(selected.id); else void refresh() }}>{t('feedback.retry')}</button></div>}
      {selected ? <article className="inbox-message">
        <h3>{selected.reportSummary}</h3>
        <div className="inbox-message__meta">
          <span>{t(feedbackKindKey[selected.kind])}</span>
          <time dateTime={new Date(selected.createdAt).toISOString()}>{new Date(selected.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </div>
        {selected.explanation && <p className="inbox-message__explanation">{selected.explanation}</p>}
        {selected.kind === 'fix_released' && <div className="inbox-message__releases">
          {selected.release.historicalFirstIncluded && <p>
            <a href={selected.release.historicalFirstIncluded.url} target="_blank" rel="noopener noreferrer">{t('feedback.historicalFirstIncluded', { version: selected.release.historicalFirstIncluded.version })}</a>
          </p>}
          <p>
            <a href={selected.release.firstVerified.url} target="_blank" rel="noopener noreferrer">{t('feedback.firstVerifiedRelease', { version: selected.release.firstVerified.version })}</a>
            {' '}<time dateTime={new Date(selected.release.firstVerified.verifiedAt).toISOString()}>{new Date(selected.release.firstVerified.verifiedAt).toLocaleString(locale)}</time>
          </p>
          {selected.currentProduction && selected.currentProduction.sha !== selected.release.firstVerified.sha && <p>
            <a href={selected.currentProduction.url} target="_blank" rel="noopener noreferrer">{t('feedback.currentProductionRelease', { version: selected.currentProduction.version })}</a>
            {' '}<time dateTime={new Date(selected.currentProduction.verifiedAt).toISOString()}>{new Date(selected.currentProduction.verifiedAt).toLocaleString(locale)}</time>
          </p>}
        </div>}
        {selected.kind === 'needs_info' && <><h4>{t('feedback.missingItems')}</h4>
          <ul>{selected.missingItems.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <p>{t('feedback.githubAccountHint')}</p></>}
        <a href={selected.issueUrl} target="_blank" rel="noopener noreferrer">{t('feedback.reportLink', { number: selected.issueNumber })}</a>
        {relatedReports.length > 0 && <>
          <h4>{t('feedback.relatedReports')}</h4>
          <ul>{relatedReports.map(report => <li key={report.submissionId}>
            <a href={`https://github.com/titanxxh/open-agricola/issues/${report.issueNumber}`} target="_blank" rel="noopener noreferrer">{t('feedback.reportLink', { number: report.issueNumber })}</a>
          </li>)}</ul>
        </>}
      </article> : !page ? !error && <p role="status">{t('platform.loading')}</p> : <>
        {page.messages.length === 0 ? <p className="inbox-dialog__empty">{t('feedback.empty')}</p> : <InboxList messages={page.messages} busy={busy} onRead={readFromList} />}
        {page.nextCursor !== null && <button type="button" className="inbox-dialog__more" onClick={() => { void refresh(page.nextCursor ?? undefined) }}>{t('feedback.more')}</button>}
      </>}
    </div>
  </InboxDialog> : null
}

function InboxList({ messages, busy, onRead }: { messages: InboxMessage[]; busy: boolean; onRead: (id: number) => void }) {
  const { locale, t } = useLocale()
  const id = useId()
  const unreadId = `${id}-unread`
  const readId = `${id}-read`
  const formatTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

  return <>
    <span id={unreadId} hidden>{t('feedback.unread')}</span>
    <span id={readId} hidden>{t('feedback.read')}</span>
    <ol className="inbox-list" role="list">{messages.map(entry => {
      const unread = entry.readAt === null
      const subjectId = `${id}-${entry.id}-subject`
      const timeId = `${id}-${entry.id}-time`
      const createdAt = new Date(entry.createdAt)
      return <li key={entry.id}>
        <button type="button" className="inbox-list__row" disabled={busy} onClick={() => onRead(entry.id)}
          aria-labelledby={subjectId} aria-describedby={`${unread ? unreadId : readId} ${timeId}`}>
          {unread && <span className="inbox-list__unread" aria-hidden="true" />}
          <span className="inbox-list__summary">
            <span id={subjectId} className="inbox-list__subject">{entry.reportSummary}</span>
            <time id={timeId} dateTime={createdAt.toISOString()}>{formatTime.format(createdAt)}</time>
          </span>
        </button>
      </li>
    })}</ol>
  </>
}

function InboxDialog({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: ReactNode }) {
  const dialog = useModalDialog()
  return createPortal(<dialog ref={dialog} className="inbox-dialog" aria-labelledby={titleId}
    onClose={event => { if (!event.currentTarget.open) onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    {children}
  </dialog>, document.body)
}
