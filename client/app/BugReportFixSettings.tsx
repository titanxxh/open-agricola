import { useId, useRef, useState, type FormEvent } from 'react'
import type { ReportFeedbackView } from '../../shared/contract/bug-report-feedback'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { readReportFeedback } from '../services/bug-report-feedback'

export function BugReportFixSettings({ report, onChange }: { report: ReportFeedbackView; onChange: (report: ReportFeedbackView) => void }) {
  const { apiFetch } = useAuth()
  const { t } = useLocale()
  const id = useId()
  const [rows, setRows] = useState(() => report.fix?.pullRequests.length
    ? report.fix.pullRequests.map(pr => ({ id: crypto.randomUUID(), number: String(pr.number), commits: pr.requiredCommits.join('\n') }))
    : [{ id: crypto.randomUUID(), number: '', commits: '' }])
  const [rootIssue, setRootIssue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const isRoot = !report.fix || report.fix.rootId === report.submissionId
  const positive = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
  const submit = async (path: 'fix' | 'duplicate', input: object) => {
    if (busy) return
    const fingerprint = JSON.stringify({ path, input })
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() }
    setBusy(true); setError(''); setSaved('')
    try {
      const result = await readReportFeedback(await apiFetch(`/api/admin/bug-report-feedback/${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, requestId: pending.current.requestId }) }))
      onChange(result); pending.current = null
      setSaved(path === 'fix' ? 'feedback.fixSaved' : 'feedback.duplicateSaved')
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      setError(code === 'fix_version_conflict' || code === 'fix_request_conflict' ? 'feedback.fixConflict'
        : code.startsWith('fix_evidence_') ? 'feedback.fixEvidence'
          : code === 'reporter_unavailable' ? 'feedback.fixUnavailable'
            : code.startsWith('fix_') || code === 'invalid_fix_association' ? 'feedback.fixInvalid' : 'feedback.failed')
    } finally { setBusy(false) }
  }
  const saveFix = (event: FormEvent) => {
    event.preventDefault()
    if (!isRoot || !rows.every(row => positive(row.number) && row.commits.trim())) return
    void submit('fix', { issueNumber: report.issueNumber, expectedVersion: report.fix?.version ?? 0, purpose: 'fix',
      pullRequests: rows.map(row => ({ number: Number(row.number), requiredCommits: row.commits.trim().split(/[\s,]+/) })) })
  }
  const saveDuplicate = (event: FormEvent) => {
    event.preventDefault()
    if (!positive(rootIssue)) return
    void submit('duplicate', { issueNumber: report.issueNumber, rootIssueNumber: Number(rootIssue), expectedVersion: report.fix?.associationVersion ?? 0 })
  }
  return <div className="fix-association">
    <h3>{t('feedback.fixTitle')}</h3>
    <p className="settings-hint">{t('feedback.fixHint')}</p>
    {report.fix && <>
      <p>{t('feedback.fixRoot', { number: report.fix.rootIssueNumber })} · {t('feedback.fixVersion', { version: report.fix.version })}</p>
      <p>{t(report.fix.status === 'released' ? 'feedback.fixReleased' : report.fix.status === 'pending_release' ? 'feedback.fixPending' : 'feedback.fixUnlinked')}</p>
      {report.fix.firstVerifiedRelease && <p>{t('feedback.firstVerifiedRelease', { version: report.fix.firstVerifiedRelease.version })}{' '}
        <a href={report.fix.firstVerifiedRelease.url} target="_blank" rel="noopener noreferrer">{t('feedback.releaseLink', { version: report.fix.firstVerifiedRelease.version })}</a></p>}
      {report.fix.currentProductionRelease && report.fix.currentProductionRelease.sha !== report.fix.firstVerifiedRelease?.sha && <p>
        {t('feedback.currentProductionRelease', { version: report.fix.currentProductionRelease.version })}{' '}
        <a href={report.fix.currentProductionRelease.url} target="_blank" rel="noopener noreferrer">{t('feedback.releaseLink', { version: report.fix.currentProductionRelease.version })}</a></p>}
      <h4>{t('feedback.fixReports')}</h4>
      <ul>{report.fix.reports.map(item => <li key={item.submissionId}>
        <a href={`https://github.com/titanxxh/open-agricola/issues/${item.issueNumber}`} target="_blank" rel="noopener noreferrer">#{item.issueNumber}</a>
      </li>)}</ul>
      {report.fix.pullRequests.length > 0 && <ul>{report.fix.pullRequests.map(pr => <li key={pr.number}>
        <a href={pr.url} target="_blank" rel="noopener noreferrer">PR #{pr.number}</a>
        {' '}<a href={`https://github.com/titanxxh/open-agricola/commit/${pr.mergeCommit}`} target="_blank" rel="noopener noreferrer"><code>{pr.mergeCommit}</code></a>
        <ul>{pr.requiredCommits.map(commit => <li key={commit}><code>{commit}</code></li>)}</ul>
      </li>)}</ul>}
    </>}
    {!report.fix && <p>{t('feedback.fixUnlinked')}</p>}
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    {busy && <p role="status">{t('platform.loading')}</p>}
    {saved && <p role="status" className="settings-success">{t(saved)}</p>}
    {isRoot ? <form className="settings-form" onSubmit={saveFix}>
      <h4>{t('feedback.fixPullRequests')}</h4>
      <p id={`${id}-commits-hint`} className="settings-hint">{t('feedback.fixCommitHint')}</p>
      {rows.map(row => <fieldset key={row.id} disabled={busy}>
        <div className="form-field"><label htmlFor={`${id}-${row.id}-pr`}>{t('feedback.fixPR')}</label>
          <input id={`${id}-${row.id}-pr`} type="number" min="1" step="1" required value={row.number}
            onChange={event => { setRows(rows.map(item => item.id === row.id ? { ...item, number: event.target.value } : item)); setSaved('') }} /></div>
        <div className="form-field"><label htmlFor={`${id}-${row.id}-commits`}>{t('feedback.fixCommits')}</label>
          <textarea id={`${id}-${row.id}-commits`} required maxLength={1000} value={row.commits} aria-describedby={`${id}-commits-hint`}
            onChange={event => { setRows(rows.map(item => item.id === row.id ? { ...item, commits: event.target.value } : item)); setSaved('') }} /></div>
        {rows.length > 1 && <button type="button" className="btn-secondary" onClick={() => setRows(rows.filter(item => item.id !== row.id))}>{t('feedback.fixRemovePR')}</button>}
      </fieldset>)}
      {rows.length < 5 && <button type="button" className="btn-secondary" disabled={busy}
        onClick={() => setRows([...rows, { id: crypto.randomUUID(), number: '', commits: '' }])}>{t('feedback.fixAddPR')}</button>}
      <button type="submit" className="btn-primary" disabled={busy || !rows.length || !rows.every(row => positive(row.number) && row.commits.trim())}>{t('feedback.fixSave')}</button>
    </form> : <p className="settings-hint">{t('feedback.fixEditRoot')}</p>}
    <form className="settings-form" onSubmit={saveDuplicate}>
      <div className="form-field"><label htmlFor={`${id}-root`}>{t('feedback.duplicateRoot')}</label>
        <input id={`${id}-root`} type="number" min="1" step="1" required value={rootIssue} disabled={busy}
          onChange={event => { setRootIssue(event.target.value); setSaved('') }} /></div>
      <button type="submit" className="btn-secondary" disabled={busy || !positive(rootIssue) || Number(rootIssue) === report.issueNumber}>{t('feedback.duplicateSave')}</button>
    </form>
  </div>
}
