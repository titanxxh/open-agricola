import { useEffect, useState } from 'react'
import { API_BASE } from '../config'
import { useLocale } from '../contexts/LocaleContext'
import '../styles/pages/bug-report.css'

type ReportStatus =
  | 'draft'
  | 'queued'
  | 'submitting'
  | 'reconcile'
  | 'retry'
  | 'needs_reconnect'
  | 'failed'
  | 'submitted'

type BugReport = {
  submissionId: string
  roomId: string
  reporterUserId: string | null
  playerIndex: number
  lifecycle: 'active' | 'completed'
  roomVersion: number
  stepNo: number
  frameHash: string
  phenomenon: string | null
  authorIdentity: 'github_user' | 'hosted' | null
  status: ReportStatus
  issueNumber: number | null
  issueUrl: string | null
  lastErrorCode: string | null
}

type Connection = {
  enabled: boolean
  connected: boolean
  githubUserId?: string
}

type ExistingIssue = {
  number: number
  url: string
}

type ReportResponse = {
  report: BugReport
  existingIssues?: ExistingIssue[]
}

type ApiResponse<T extends object> = { ok: true } & T

const inFlightStatuses = new Set<ReportStatus>([
  'queued',
  'submitting',
  'reconcile',
  'retry',
])

const errorKeys: Record<string, string> = {
  phenomenon_required: 'platform.bugReport.errors.phenomenon_required',
  phenomenon_too_long: 'platform.bugReport.errors.phenomenon_too_long',
  not_participant: 'platform.bugReport.errors.not_participant',
  bug_report_forbidden: 'platform.bugReport.errors.not_participant',
  anchor_mismatch: 'platform.bugReport.errors.anchor_mismatch',
  bug_report_rate_limited: 'platform.bugReport.errors.rate_limited',
  bug_report_room_limit: 'platform.bugReport.errors.rate_limited',
  github_connection_required: 'platform.bugReport.errors.github_connection_required',
  existing_issue_confirmation_required: 'platform.bugReport.errors.existing_issue_confirmation_required',
}

const requestJson = async <T extends object>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> => {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  const body = await response.json().catch(() => ({})) as {
    ok?: boolean
    code?: string
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(body.code ?? 'request_failed')
  }
  return body as ApiResponse<T>
}

const resumeId = (): string =>
  new URLSearchParams(window.location.search).get('bugReport') ?? ''

const setResumeId = (submissionId: string): void => {
  const url = new URL(window.location.href)
  url.searchParams.set('bugReport', submissionId)
  window.history.replaceState(null, '', url)
}

const clearResumeId = (): void => {
  const url = new URL(window.location.href)
  url.searchParams.delete('bugReport')
  url.searchParams.delete('bugReportConnection')
  window.history.replaceState(null, '', url)
}

export function BugReportBar({
  roomId,
  stepNo,
  frameHash,
}: {
  roomId: string
  stepNo?: number
  frameHash?: string
}) {
  const { t } = useLocale()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [report, setReport] = useState<BugReport | null>(null)
  const [existingIssues, setExistingIssues] = useState<ExistingIssue[]>([])
  const [phenomenon, setPhenomenon] = useState('')
  const [identity, setIdentity] = useState<'github_user' | 'hosted' | null>(null)
  const [confirmHosted, setConfirmHosted] = useState(false)
  const [stage, setStage] = useState<1 | 2 | 3>(1)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connectionResult = new URLSearchParams(window.location.search)
    .get('bugReportConnection')

  const showError = (reason: unknown): void => {
    const code = reason instanceof Error ? reason.message : 'request_failed'
    const knownKey = errorKeys[code]
    setError(knownKey
      ? t(knownKey)
      : t('platform.bugReport.errors.request_failed', { code }))
  }

  useEffect(() => {
    let cancelled = false
    void requestJson<Connection>('/api/v1/issue-submission-connection')
      .then((result) => {
        if (!cancelled) setConnection(result)
      })
      .catch(() => {
        if (!cancelled) setConnection({ enabled: false, connected: false })
      })
    const submissionId = resumeId()
    if (submissionId) {
      void requestJson<ReportResponse>(
        `/api/v1/bug-reports/${encodeURIComponent(submissionId)}`,
      )
        .then(({ report: saved, existingIssues: existing }) => {
          if (cancelled || saved.roomId !== roomId) return
          setReport(saved)
          setExistingIssues(existing ?? [])
          setPhenomenon(saved.phenomenon ?? '')
          setIdentity(saved.authorIdentity)
          setConfirmHosted(saved.authorIdentity === 'hosted')
          setStage(
            connectionResult || saved.authorIdentity || saved.status !== 'draft'
              ? 3
              : 1,
          )
          setOpen(true)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [connectionResult, roomId])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const inFlightSubmissionId = report && inFlightStatuses.has(report.status)
    ? report.submissionId
    : null

  useEffect(() => {
    if (!inFlightSubmissionId) return
    const timer = window.setInterval(() => {
      void requestJson<ReportResponse>(
        `/api/v1/bug-reports/${encodeURIComponent(inFlightSubmissionId)}`,
      )
        .then(({ report: current, existingIssues: existing }) => {
          setReport(current)
          setExistingIssues(existing ?? [])
          if (current.status === 'needs_reconnect') {
            setConnection((value) => ({
              enabled: value?.enabled ?? true,
              connected: false,
            }))
          }
        })
        .catch(() => {})
    }, 3000)
    return () => window.clearInterval(timer)
  }, [inFlightSubmissionId])

  if (!roomId || (!connection?.enabled && !report)) return null

  const phenomenonLength = Array.from(phenomenon.trim()).length
  const editable = !report || report.status === 'draft'
  const close = () => {
    setOpen(false)
    setError(null)
    if (report?.status === 'submitted') {
      clearResumeId()
      setReport(null)
      setExistingIssues([])
      setPhenomenon('')
      setIdentity(null)
      setConfirmHosted(false)
      setStage(1)
    }
  }
  const savePhenomenon = async () => {
    if (phenomenonLength === 0) {
      setError(t('platform.bugReport.errors.phenomenon_required'))
      return
    }
    if (phenomenonLength > 2000) {
      setError(t('platform.bugReport.errors.phenomenon_too_long'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = report
        ? await requestJson<ReportResponse>(
            `/api/v1/bug-reports/${encodeURIComponent(report.submissionId)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ phenomenon }),
            },
          )
        : await requestJson<ReportResponse>(
            `/api/v1/game-contexts/${encodeURIComponent(roomId)}/bug-reports`,
            {
              method: 'POST',
              body: JSON.stringify({
                phenomenon,
                ...(stepNo === undefined ? {} : { stepNo }),
                ...(frameHash === undefined ? {} : { frameHash }),
              }),
            },
          )
      setReport(result.report)
      setExistingIssues(result.existingIssues ?? [])
      setPhenomenon(result.report.phenomenon ?? phenomenon)
      setResumeId(result.report.submissionId)
      setStage(2)
    } catch (reason) {
      showError(reason)
    } finally {
      setBusy(false)
    }
  }
  const continueFromContext = async () => {
    if (!report) return
    if (existingIssues.length === 0 || report.status !== 'draft') {
      setStage(3)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const confirmed = await requestJson<ReportResponse>(
        `/api/v1/bug-reports/${encodeURIComponent(report.submissionId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ confirmExisting: true }),
        },
      )
      setReport(confirmed.report)
      setExistingIssues(confirmed.existingIssues ?? existingIssues)
      setStage(3)
    } catch (reason) {
      showError(reason)
    } finally {
      setBusy(false)
    }
  }
  const submit = async () => {
    if (!report || !identity) return
    setBusy(true)
    setError(null)
    try {
      if (report.status === 'draft') {
        const selected = await requestJson<ReportResponse>(
          `/api/v1/bug-reports/${encodeURIComponent(report.submissionId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              authorIdentity: identity,
              ...(identity === 'hosted' ? { confirmHosted } : {}),
            }),
          },
        )
        setReport(selected.report)
      }
      const submitted = await requestJson<{ report: BugReport }>(
        `/api/v1/bug-reports/${encodeURIComponent(report.submissionId)}/submit`,
        { method: 'POST', body: '{}' },
      )
      setReport(submitted.report)
      if (submitted.report.status === 'needs_reconnect') {
        setConnection((current) => ({
          enabled: current?.enabled ?? true,
          connected: false,
        }))
      }
    } catch (reason) {
      showError(reason)
      if (
        reason instanceof Error
        && reason.message === 'github_connection_required'
      ) {
        setConnection((current) => ({
          enabled: current?.enabled ?? true,
          connected: false,
        }))
      }
    } finally {
      setBusy(false)
    }
  }
  const discard = async () => {
    if (!report || !['draft', 'needs_reconnect', 'failed'].includes(report.status)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestJson<Record<string, never>>(
        `/api/v1/bug-reports/${encodeURIComponent(report.submissionId)}`,
        { method: 'DELETE' },
      )
      clearResumeId()
      setReport(null)
      setExistingIssues([])
      setPhenomenon('')
      setIdentity(null)
      setConfirmHosted(false)
      setStage(1)
      setOpen(false)
    } catch (reason) {
      showError(reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="bug-report-trigger"
          onClick={() => setOpen(true)}
        >
          {report
            ? t('platform.bugReport.continueReport')
            : t('platform.bugReport.trigger')}
        </button>
      ) : null}
      {open ? (
        <div
          className="bug-report-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <section
            className="bug-report-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
          >
            <header className="bug-report-header">
              <div>
                <p>{report?.status === 'submitted' ? '' : `${stage} / 3`}</p>
                <h2 id="bug-report-title">{t('platform.bugReport.title')}</h2>
              </div>
              <button
                type="button"
                className="bug-report-close"
                aria-label={t('platform.bugReport.close')}
                onClick={close}
              >
                ×
              </button>
            </header>

            {connectionResult === 'cancelled' ? (
              <p className="bug-report-notice" role="status">
                {t('platform.bugReport.connectionCancelled')}
              </p>
            ) : null}
            {connectionResult === 'error' ? (
              <p className="bug-report-error" role="alert">
                {t('platform.bugReport.connectionError')}
              </p>
            ) : null}
            {error ? <p className="bug-report-error" role="alert">{error}</p> : null}

            {report?.status === 'submitted' ? (
              <div className="bug-report-success">
                <h3>{t('platform.bugReport.submittedTitle')}</h3>
                <p>{t('platform.bugReport.submittedBody')}</p>
                {report.issueUrl ? (
                  <a href={report.issueUrl} target="_blank" rel="noreferrer">
                    {t('platform.bugReport.openIssue', {
                      number: report.issueNumber ?? '',
                    })}
                  </a>
                ) : null}
                <button type="button" className="btn-primary" onClick={close}>
                  {t('platform.bugReport.close')}
                </button>
              </div>
            ) : stage === 1 ? (
              <div className="bug-report-step">
                <label htmlFor="bug-report-phenomenon">
                  {t('platform.bugReport.phenomenonLabel')}
                </label>
                <textarea
                  id="bug-report-phenomenon"
                  rows={5}
                  value={phenomenon}
                  disabled={!editable || busy}
                  autoFocus
                  required
                  onChange={(event) => setPhenomenon(event.target.value)}
                  placeholder={t('platform.bugReport.phenomenonPlaceholder')}
                />
                <div className="bug-report-counter">
                  <span>{t('platform.bugReport.phenomenonHint')}</span>
                  <output className={phenomenonLength > 2000 ? 'is-error' : ''}>
                    {phenomenonLength} / 2000
                  </output>
                </div>
                <div className="bug-report-actions">
                  {report && editable ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => { void discard() }}
                    >
                      {t('platform.bugReport.discard')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!editable || busy || phenomenonLength === 0 || phenomenonLength > 2000}
                    onClick={() => { void savePhenomenon() }}
                  >
                    {t('platform.bugReport.continue')}
                  </button>
                </div>
              </div>
            ) : stage === 2 && report ? (
              <div className="bug-report-step">
                <h3>{t('platform.bugReport.contextTitle')}</h3>
                <p>{t('platform.bugReport.contextPrivacy')}</p>
                <dl className="bug-report-context">
                  <div><dt>Room ID</dt><dd><code>{report.roomId}</code></dd></div>
                  <div>
                    <dt>{t('platform.bugReport.lifecycle')}</dt>
                    <dd>{t(`platform.bugReport.lifecycle_${report.lifecycle}`)}</dd>
                  </div>
                  <div>
                    <dt>{t('platform.bugReport.playerId')}</dt>
                    <dd><code>{report.reporterUserId ?? '—'}</code></dd>
                  </div>
                  <div><dt>{t('platform.bugReport.seat')}</dt><dd>p{report.playerIndex + 1}</dd></div>
                  <div><dt>{t('platform.bugReport.roomVersion')}</dt><dd>{report.roomVersion}</dd></div>
                  <div><dt>{t('platform.bugReport.step')}</dt><dd>{report.stepNo}</dd></div>
                  <div><dt>{t('platform.bugReport.frameHash')}</dt><dd><code>{report.frameHash}</code></dd></div>
                </dl>
                {existingIssues.length > 0 ? (
                  <div className="bug-report-notice" role="status">
                    <strong>{t('platform.bugReport.existingIssuesTitle')}</strong>
                    <p>{t('platform.bugReport.existingIssuesBody')}</p>
                    <ul>
                      {existingIssues.map((issue) => (
                        <li key={issue.number}>
                          <a
                            href={issue.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('platform.bugReport.openIssue', {
                              number: issue.number,
                            })}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="bug-report-actions">
                  {editable ? (
                    <button type="button" className="btn-secondary" onClick={() => setStage(1)}>
                      {t('platform.back')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => { void continueFromContext() }}
                  >
                    {t(existingIssues.length > 0
                      ? 'platform.bugReport.continueNewIssue'
                      : 'platform.bugReport.continue')}
                  </button>
                </div>
              </div>
            ) : report ? (
              <div className="bug-report-step">
                <h3>{t('platform.bugReport.identityTitle')}</h3>
                <p>{t('platform.bugReport.identityIntro')}</p>
                <label className={`bug-report-identity${identity === 'github_user' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name={`bug-report-identity-${report.submissionId}`}
                    checked={identity === 'github_user'}
                    disabled={!editable || !connection?.connected || busy}
                    onChange={() => {
                      setIdentity('github_user')
                      setConfirmHosted(false)
                    }}
                  />
                  <span>
                    <strong>{t('platform.bugReport.githubUser')}</strong>
                    <small>
                      {connection?.connected
                        ? t('platform.bugReport.connectedAs', {
                            id: connection.githubUserId ?? '',
                          })
                        : t('platform.bugReport.githubUserBody')}
                    </small>
                  </span>
                </label>
                {!connection?.connected ? (
                  <a
                    className="bug-report-connect"
                    href={`${API_BASE}/api/v1/issue-submission-connection/github/start?submissionId=${encodeURIComponent(report.submissionId)}`}
                  >
                    {t('platform.bugReport.connectGithub')}
                  </a>
                ) : null}
                <label className={`bug-report-identity${identity === 'hosted' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name={`bug-report-identity-${report.submissionId}`}
                    checked={identity === 'hosted'}
                    disabled={!editable || busy}
                    onChange={() => setIdentity('hosted')}
                  />
                  <span>
                    <strong>{t('platform.bugReport.hosted')}</strong>
                    <small>{t('platform.bugReport.hostedBody')}</small>
                  </span>
                </label>
                {identity === 'hosted' ? (
                  <label className="bug-report-confirm">
                    <input
                      type="checkbox"
                      checked={confirmHosted}
                      disabled={!editable || busy}
                      onChange={(event) => setConfirmHosted(event.target.checked)}
                    />
                    <span>{t('platform.bugReport.hostedConfirm')}</span>
                  </label>
                ) : null}
                {inFlightStatuses.has(report.status) ? (
                  <p className="bug-report-notice" role="status">
                    {t('platform.bugReport.submitting')}
                  </p>
                ) : report.status === 'needs_reconnect' ? (
                  <p className="bug-report-error" role="alert">
                    {t('platform.bugReport.errors.github_connection_required')}
                  </p>
                ) : report.status === 'failed' ? (
                  <p className="bug-report-error" role="alert">
                    {t('platform.bugReport.deliveryFailed', {
                      code: report.lastErrorCode ?? 'unknown',
                    })}
                  </p>
                ) : null}
                <div className="bug-report-actions">
                  {['needs_reconnect', 'failed'].includes(report.status) ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => { void discard() }}
                    >
                      {t('platform.bugReport.discard')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || inFlightStatuses.has(report.status)}
                    onClick={() => setStage(2)}
                  >
                    {t('platform.back')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      busy
                      || inFlightStatuses.has(report.status)
                      || !identity
                      || (identity === 'github_user' && !connection?.connected)
                      || (identity === 'hosted' && !confirmHosted)
                    }
                    onClick={() => { void submit() }}
                  >
                    {busy
                      ? t('platform.bugReport.submitting')
                      : t('platform.bugReport.submit')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
