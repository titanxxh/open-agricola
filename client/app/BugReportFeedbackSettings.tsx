import { useId, useRef, useState, type FormEvent } from 'react'
import { parseRecordFeedback, type FeedbackDetails, type ReportFeedbackView } from '../../shared/contract/bug-report-feedback'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { Section } from '../components/common/Section'
import { feedbackKindKey, readReportFeedback } from '../services/bug-report-feedback'
import '../styles/components/inbox.css'

export function BugReportFeedbackSettings() {
  const { user, apiFetch } = useAuth()
  const { locale, t } = useLocale()
  const id = useId()
  const [issue, setIssue] = useState('')
  const [report, setReport] = useState<ReportFeedbackView | null>(null)
  const [summary, setSummary] = useState('')
  const [explanation, setExplanation] = useState('')
  const [kind, setKind] = useState<FeedbackDetails['kind']>('confirmed_bug')
  const [missingItems, setMissingItems] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null)
  if (!user?.isAdmin) return null
  const failure = (cause: unknown) => {
    const code = cause instanceof Error ? cause.message : ''
    setError(code === 'feedback_report_not_found' ? 'feedback.reportNotFound'
      : code === 'feedback_version_conflict' || code === 'feedback_request_conflict' ? 'feedback.conflict' : 'feedback.failed')
  }
  const loadReport = async () => {
    if (busy || !/^[1-9]\d*$/.test(issue)) return
    setBusy(true); setError(''); setSaved(false); setReport(null)
    try {
      const value = await readReportFeedback(await apiFetch(`/api/admin/bug-report-feedback?issue=${encodeURIComponent(issue)}`))
      setReport(value); setSummary(value.feedback.at(-1)?.reportSummary ?? ''); setKind(value.feedback.at(-1)?.kind ?? 'confirmed_bug');
      setExplanation(''); setMissingItems(''); pending.current = null
    } catch (cause) { failure(cause) }
    finally { setBusy(false) }
  }
  const draft = report ? { issueNumber: report.issueNumber, expectedVersion: report.version, kind,
    reportSummary: summary.trim(), explanation: explanation.trim(),
    ...(kind === 'needs_info' ? { missingItems: missingItems.split('\n').map(item => item.trim()).filter(Boolean) } : {}) } : null
  let valid = false
  try { parseRecordFeedback({ ...draft, requestId: 'form-validation' }); valid = true } catch { /* Incomplete form. */ }
  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || busy || !valid) return
    const fingerprint = JSON.stringify(draft)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() }
    setBusy(true); setError(''); setSaved(false)
    try {
      const value = await readReportFeedback(await apiFetch('/api/admin/bug-report-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, requestId: pending.current.requestId }),
      }))
      setReport(value); setExplanation(''); setMissingItems(''); setSaved(true); pending.current = null
    } catch (cause) { failure(cause) }
    finally { setBusy(false) }
  }
  return <Section title={t('feedback.adminTitle')} variant="parchment" className="bug-report-feedback-settings">
    <p className="settings-hint">{t('feedback.adminHint')}</p>
    <form className="settings-form" onSubmit={event => { event.preventDefault(); void loadReport() }}>
      <div className="form-field"><label htmlFor={`${id}-issue`}>{t('feedback.issueNumber')}</label>
        <input id={`${id}-issue`} type="number" min="1" step="1" required value={issue} disabled={busy}
          onChange={event => { setIssue(event.target.value); setReport(null); setSaved(false); setError('') }} /></div>
      <button type="submit" className="btn-secondary" disabled={busy || !/^[1-9]\d*$/.test(issue)}>{t('feedback.findReport')}</button>
    </form>
    {error && <div role="alert" className="form-error"><p>{t(error)}</p>
      {error === 'feedback.conflict' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => { void loadReport() }}>{t('feedback.reloadReport')}</button>}
    </div>}
    {busy && <p role="status">{t('platform.loading')}</p>}
    {saved && <p role="status" className="settings-success">{t('feedback.saved')}</p>}
    {report && <>
      <p><a href={report.issueUrl} target="_blank" rel="noopener noreferrer">{t('feedback.reportLink', { number: report.issueNumber })}</a></p>
      {report.feedback.length ? <ol className="feedback-history">{report.feedback.map(entry => <li key={entry.id}>
        <strong>{t(feedbackKindKey[entry.kind])}: {entry.reportSummary}</strong>{' '}
        <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString(locale)}</time>
        <p>{entry.explanation}</p>
        {entry.kind === 'needs_info' && <ul>{entry.missingItems.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      </li>)}</ol> : <p className="settings-hint">{t('feedback.noFeedback')}</p>}
      <form className="settings-form" onSubmit={event => { void confirm(event) }}>
        <div className="form-field"><label htmlFor={`${id}-kind`}>{t('feedback.kindLabel')}</label>
          <select id={`${id}-kind`} value={kind} disabled={busy} onChange={event => {
            const next = event.target.value
            if (next === 'confirmed_bug' || next === 'not_bug' || next === 'needs_info') { setKind(next); setSaved(false) }
          }}>
            <option value="confirmed_bug">{t('feedback.confirmedBug')}</option>
            <option value="not_bug">{t('feedback.notBug')}</option>
            <option value="needs_info">{t('feedback.needsInfo')}</option>
          </select></div>
        {kind === 'not_bug' && <p className="settings-hint">{t('feedback.notBugHint')}</p>}
        {kind === 'needs_info' && <><p className="settings-hint">{t('feedback.needsInfoHint')}</p>
          <div className="form-field"><label htmlFor={`${id}-missing`}>{t('feedback.missingItemsInput')}</label>
            <textarea id={`${id}-missing`} required maxLength={2010} value={missingItems} disabled={busy}
              onChange={event => { setMissingItems(event.target.value); setSaved(false) }} /></div></>}
        <div className="form-field"><label htmlFor={`${id}-summary`}>{t('feedback.summary')}</label>
          <input id={`${id}-summary`} required maxLength={200} value={summary} disabled={busy} onChange={event => { setSummary(event.target.value); setSaved(false) }} /></div>
        <div className="form-field"><label htmlFor={`${id}-explanation`}>{t('feedback.explanation')}</label>
          <textarea id={`${id}-explanation`} required maxLength={2000} value={explanation} disabled={busy} onChange={event => { setExplanation(event.target.value); setSaved(false) }} /></div>
        <button type="submit" className="btn-primary" disabled={busy || !valid}>{t(kind === 'confirmed_bug' ? 'feedback.confirmBug' : 'feedback.sendAssessment')}</button>
      </form>
    </>}
  </Section>
}
