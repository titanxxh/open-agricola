import { parseAssociateDuplicate, parseAssociateFix, parseFeedbackDetails, parseRecordFeedback, type FeedbackRecord, type FixAssociation, type InboxMessage, type InboxPage, type ReportFeedbackView, type VerifiedFixPullRequest } from '../../shared/contract/bug-report-feedback'
import type { PostgresDatabase } from '../database/postgres'
import { BUG_REPORT_GITHUB_REPOSITORY } from './github-issue-client'
import { GitHubFixVerifier } from './github-fix-verifier'

export class FeedbackError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}

type ReportRow = { submission_id: string; reporter_user_id: string | null; github_issue_number: number; status: string }
type FeedbackRow = { id: number; submission_id: string; github_issue_number: number; kind: unknown; missing_items: unknown;
  report_summary: string; explanation: string; version: number; created_at: number; read_at: number | null }
type FixRootRow = { root_id: string; version: number; pull_requests: VerifiedFixPullRequest[] }

const issueUrl = (number: number) => `https://github.com/${BUG_REPORT_GITHUB_REPOSITORY}/issues/${number}`
const record = (row: FeedbackRow): FeedbackRecord => ({ id: row.id, submissionId: row.submission_id,
  issueNumber: row.github_issue_number, issueUrl: issueUrl(row.github_issue_number),
  ...parseFeedbackDetails({ kind: row.kind, explanation: row.explanation, ...(row.kind === 'needs_info' ? { missingItems: row.missing_items } : {}) }),
  reportSummary: row.report_summary, version: row.version, createdAt: row.created_at })
const message = (row: FeedbackRow): InboxMessage => ({ ...record(row), readAt: row.read_at })
const feedbackRows = `SELECT f.*, r.github_issue_number FROM bug_report_feedback f JOIN bug_reports r USING(submission_id)`

export class BugReportFeedbackService {
  private readonly db: PostgresDatabase
  private readonly now: () => number
  private readonly fixVerifier: GitHubFixVerifier
  constructor(db: PostgresDatabase, now = Date.now, fixVerifier = new GitHubFixVerifier()) { this.db = db; this.now = now; this.fixVerifier = fixVerifier }

  async getReport(issueNumber: number): Promise<ReportFeedbackView> {
    const report = await this.findReport(issueNumber)
    const rows = await this.db.prepare(`${feedbackRows} WHERE f.submission_id=? ORDER BY f.version`).all<FeedbackRow>(report.submission_id)
    const fix = await this.readFix(report.submission_id)
    return { submissionId: report.submission_id, issueNumber, issueUrl: issueUrl(issueNumber),
      version: rows.at(-1)?.version ?? 0, feedback: rows.map(record), ...(fix ? { fix } : {}) }
  }

  async associateFix(actorId: string, value: unknown): Promise<ReportFeedbackView> {
    let input
    try { input = parseAssociateFix(value) } catch { throw new FeedbackError('invalid_fix_association', 400) }
    const fingerprint = JSON.stringify(input)
    const initial = await this.findReport(input.issueNumber)
    const previous = await this.fixRequest(initial.submission_id, input.requestId, fingerprint)
    let pullRequests: VerifiedFixPullRequest[] = []
    if (!previous) {
      try { pullRequests = await this.fixVerifier.verify(input.pullRequests) }
      catch (error) { throw new FeedbackError(error instanceof Error && error.message === 'fix_evidence_conflict'
        ? 'fix_evidence_conflict' : 'fix_evidence_unavailable', 503) }
    }
    return this.db.transaction(async () => {
      const reports = await this.lockFixGraph([input.issueNumber])
      const report = reports.find(row => row.github_issue_number === input.issueNumber)
      if (!report) throw new FeedbackError('feedback_report_not_found', 404)
      const link = await this.db.prepare('SELECT root_id FROM bug_report_fix_links WHERE submission_id=?').get<{ root_id: string }>(report.submission_id)
      if (link && link.root_id !== report.submission_id) throw new FeedbackError('fix_requires_root', 409)
      await this.requireConfirmedRecipient(reports)
      if (!link) await this.requireConfirmed(report.submission_id)
      if (await this.fixRequest(report.submission_id, input.requestId, fingerprint)) return this.getReport(input.issueNumber)
      const root = await this.db.prepare('SELECT * FROM bug_report_fix_roots WHERE root_id=?').get<FixRootRow>(report.submission_id)
      if ((root?.version ?? 0) !== input.expectedVersion) throw new FeedbackError('fix_version_conflict', 409)
      await this.ensureFixRoot(report.submission_id)
      await this.db.prepare('UPDATE bug_report_fix_roots SET version=?,pull_requests=?::jsonb,updated_at=? WHERE root_id=?')
        .run(input.expectedVersion + 1, JSON.stringify(pullRequests), this.now(), report.submission_id)
      await this.saveFixRequest(actorId, report.submission_id, input.requestId, fingerprint)
      return this.getReport(input.issueNumber)
    })()
  }

  async associateDuplicate(actorId: string, value: unknown): Promise<ReportFeedbackView> {
    let input
    try { input = parseAssociateDuplicate(value) } catch { throw new FeedbackError('invalid_fix_association', 400) }
    const fingerprint = JSON.stringify(input)
    return this.db.transaction(async () => {
      const reports = await this.lockFixGraph([input.issueNumber, input.rootIssueNumber])
      const report = reports.find(row => row.github_issue_number === input.issueNumber)
      const target = reports.find(row => row.github_issue_number === input.rootIssueNumber)
      if (!report || !target) throw new FeedbackError('feedback_report_not_found', 404)
      if (!report.reporter_user_id || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(report.reporter_user_id)) {
        throw new FeedbackError('reporter_unavailable', 410)
      }
      await this.requireConfirmed(report.submission_id)
      if (await this.fixRequest(report.submission_id, input.requestId, fingerprint)) return this.getReport(input.issueNumber)
      const link = await this.db.prepare('SELECT root_id,version FROM bug_report_fix_links WHERE submission_id=?')
        .get<{ root_id: string; version: number }>(report.submission_id)
      if ((link?.version ?? 0) !== input.expectedVersion) throw new FeedbackError('fix_version_conflict', 409)
      const targetLink = await this.db.prepare('SELECT root_id FROM bug_report_fix_links WHERE submission_id=?')
        .get<{ root_id: string }>(target.submission_id)
      if (targetLink && targetLink.root_id !== target.submission_id) throw new FeedbackError('fix_requires_root', 409)
      const dependents = await this.db.prepare('SELECT 1 FROM bug_report_fix_links WHERE root_id=? AND submission_id<>? LIMIT 1')
        .get(report.submission_id, report.submission_id)
      const ownFix = await this.db.prepare('SELECT version FROM bug_report_fix_roots WHERE root_id=?').get<{ version: number }>(report.submission_id)
      if (dependents || ownFix?.version) throw new FeedbackError('fix_root_in_use', 409)
      if (!targetLink) {
        if (!target.reporter_user_id || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(target.reporter_user_id)) {
          throw new FeedbackError('reporter_unavailable', 410)
        }
        await this.requireConfirmed(target.submission_id)
      }
      await this.ensureFixRoot(target.submission_id)
      if (link?.root_id !== target.submission_id) {
        await this.db.prepare(`INSERT INTO bug_report_fix_links(submission_id,root_id,version) VALUES(?,?,?)
          ON CONFLICT(submission_id) DO UPDATE SET root_id=EXCLUDED.root_id,version=EXCLUDED.version`)
          .run(report.submission_id, target.submission_id, input.expectedVersion + 1)
      }
      await this.saveFixRequest(actorId, report.submission_id, input.requestId, fingerprint)
      return this.getReport(input.issueNumber)
    })()
  }

  private async readFix(submissionId: string): Promise<FixAssociation | undefined> {
    const row = await this.db.prepare(`SELECT roots.*, links.version AS association_version, report.github_issue_number AS root_issue_number
      FROM bug_report_fix_links links JOIN bug_report_fix_roots roots USING(root_id)
      JOIN bug_reports report ON report.submission_id=roots.root_id WHERE links.submission_id=?`)
      .get<FixRootRow & { association_version: number; root_issue_number: number }>(submissionId)
    if (!row) return undefined
    const reports = await this.db.prepare(`SELECT r.submission_id,r.github_issue_number FROM bug_report_fix_links l
      JOIN bug_reports r USING(submission_id) WHERE l.root_id=? ORDER BY r.github_issue_number`)
      .all<{ submission_id: string; github_issue_number: number }>(row.root_id)
    return { rootId: row.root_id, rootIssueNumber: row.root_issue_number, version: row.version,
      associationVersion: row.association_version, status: row.pull_requests.length ? 'pending_release' : 'unlinked',
      reports: reports.map(report => ({ submissionId: report.submission_id, issueNumber: report.github_issue_number })),
      pullRequests: row.pull_requests, requiredCommits: [...new Set(row.pull_requests.flatMap(pr => pr.requiredCommits))].sort() }
  }

  private async ensureFixRoot(submissionId: string): Promise<void> {
    await this.db.prepare('INSERT INTO bug_report_fix_roots(root_id,updated_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(submissionId, this.now())
    await this.db.prepare('INSERT INTO bug_report_fix_links(submission_id,root_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(submissionId, submissionId)
  }

  private async requireConfirmed(submissionId: string): Promise<void> {
    const latest = await this.db.prepare('SELECT kind FROM bug_report_feedback WHERE submission_id=? ORDER BY version DESC LIMIT 1')
      .get<{ kind: string }>(submissionId)
    if (latest?.kind !== 'confirmed_bug') throw new FeedbackError('fix_requires_confirmed_bug', 409)
  }

  private async requireConfirmedRecipient(reports: ReportRow[]): Promise<void> {
    let liveRecipient = false
    for (const report of reports) {
      if (!report.reporter_user_id || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(report.reporter_user_id)) continue
      liveRecipient = true
      const latest = await this.db.prepare('SELECT kind FROM bug_report_feedback WHERE submission_id=? ORDER BY version DESC LIMIT 1')
        .get<{ kind: string }>(report.submission_id)
      if (latest?.kind === 'confirmed_bug') return
    }
    throw new FeedbackError(liveRecipient ? 'fix_requires_confirmed_bug' : 'reporter_unavailable', liveRecipient ? 409 : 410)
  }

  private async lockFixGraph(issueNumbers: number[]): Promise<ReportRow[]> {
    // Serialize graph edits; lock every recipient before any report, matching account deletion.
    await this.db.query('SELECT pg_advisory_xact_lock(1673001)')
    const placeholders = issueNumbers.map(() => '?').join(',')
    const reports = await this.db.prepare(`SELECT DISTINCT r.submission_id,r.reporter_user_id,r.github_issue_number,r.status FROM bug_reports r
      LEFT JOIN bug_report_fix_links l USING(submission_id) WHERE r.github_issue_number IN (${placeholders}) OR l.root_id IN
      (SELECT root_id FROM bug_report_fix_links JOIN bug_reports USING(submission_id) WHERE github_issue_number IN (${placeholders}))`)
      .all<ReportRow>(...issueNumbers, ...issueNumbers)
    for (const user of [...new Set(reports.flatMap(row => row.reporter_user_id ? [row.reporter_user_id] : []))].sort()) {
      await this.db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(user)
    }
    const locked: ReportRow[] = []
    for (const report of reports.sort((a, b) => a.submission_id.localeCompare(b.submission_id))) {
      locked.push(await this.findReport(report.github_issue_number, true))
    }
    return locked
  }

  private async fixRequest(submissionId: string, requestId: string, fingerprint: string): Promise<boolean> {
    const prior = await this.db.prepare('SELECT fingerprint FROM bug_report_fix_requests WHERE submission_id=? AND request_id=?')
      .get<{ fingerprint: string }>(submissionId, requestId)
    if (prior && prior.fingerprint !== fingerprint) throw new FeedbackError('fix_request_conflict', 409)
    return !!prior
  }

  private async saveFixRequest(actorId: string, submissionId: string, requestId: string, fingerprint: string): Promise<void> {
    await this.db.prepare('INSERT INTO bug_report_fix_requests(submission_id,request_id,fingerprint,actor_user_id,created_at) VALUES(?,?,?,?,?)')
      .run(submissionId, requestId, fingerprint, actorId, this.now())
  }

  async recordFeedback(actorId: string, value: unknown): Promise<FeedbackRecord> {
    let input
    try { input = parseRecordFeedback(value) } catch { throw new FeedbackError('invalid_feedback', 400) }
    const initial = await this.findReport(input.issueNumber)
    const recipient = initial.reporter_user_id
    if (!recipient) throw new FeedbackError('reporter_unavailable', 410)
    return this.db.transaction(async () => {
      const user = await this.db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get<{ id: string }>(recipient)
      if (!user || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(recipient)) {
        throw new FeedbackError('reporter_unavailable', 410)
      }
      const report = await this.findReport(input.issueNumber, true)
      if (report.reporter_user_id !== recipient) throw new FeedbackError('reporter_unavailable', 410)
      const previous = await this.db.prepare(`${feedbackRows} WHERE f.submission_id=? AND f.request_id=?`)
        .get<FeedbackRow>(report.submission_id, input.requestId)
      if (previous) {
        if (previous.kind !== input.kind || previous.report_summary !== input.reportSummary || previous.explanation !== input.explanation
          || JSON.stringify(previous.missing_items) !== JSON.stringify(input.kind === 'needs_info' ? input.missingItems : null)
          || previous.version !== input.expectedVersion + 1) {
          throw new FeedbackError('feedback_request_conflict', 409)
        }
        return record(previous)
      }
      const latest = await this.db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM bug_report_feedback WHERE submission_id=?')
        .get<{ version: number }>(report.submission_id)
      if (latest?.version !== input.expectedVersion) throw new FeedbackError('feedback_version_conflict', 409)
      const inserted = await this.db.prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,actor_user_id,request_id,
        kind,report_summary,explanation,missing_items,version,created_at) VALUES(?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING *`)
        .get<Omit<FeedbackRow, 'github_issue_number'>>(report.submission_id, recipient, actorId, input.requestId, input.kind,
          input.reportSummary, input.explanation, input.kind === 'needs_info' ? JSON.stringify(input.missingItems) : null, input.expectedVersion + 1, this.now())
      if (!inserted) throw new Error('Feedback insert returned no record')
      return record({ ...inserted, github_issue_number: input.issueNumber })
    })()
  }

  async listInbox(userId: string, { before, limit = 20 }: { before?: number; limit?: number } = {}): Promise<InboxPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) {
      throw new FeedbackError('invalid_inbox_query', 400)
    }
    const rows = await this.db.prepare(`${feedbackRows} WHERE f.recipient_user_id=? ${before === undefined ? '' : 'AND f.id < ?'}
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?) ORDER BY f.id DESC LIMIT ?`)
      .all<FeedbackRow>(...before === undefined ? [userId, userId, limit + 1] : [userId, before, userId, limit + 1])
    const unread = await this.db.prepare(`SELECT COUNT(*) AS count FROM bug_report_feedback WHERE recipient_user_id=? AND read_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?)`).get<{ count: number }>(userId, userId)
    const messages = rows.slice(0, limit).map(message)
    return { messages, unreadCount: unread?.count ?? 0, nextCursor: rows.length > limit ? messages.at(-1)?.id ?? null : null }
  }

  async getMessage(userId: string, id: number): Promise<InboxMessage> {
    const row = await this.db.prepare(`${feedbackRows} WHERE f.id=? AND f.recipient_user_id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?)`).get<FeedbackRow>(id, userId, userId)
    if (!row) throw new FeedbackError('feedback_not_found', 404)
    return message(row)
  }

  async markRead(userId: string, id: number): Promise<InboxMessage> {
    const result = await this.db.prepare(`UPDATE bug_report_feedback SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?)`).run(this.now(), id, userId, userId)
    if (!result.changes) throw new FeedbackError('feedback_not_found', 404)
    return this.getMessage(userId, id)
  }

  private async findReport(issueNumber: number, lock = false): Promise<ReportRow> {
    const report = await this.db.prepare(`SELECT submission_id,reporter_user_id,github_issue_number,status FROM bug_reports
      WHERE github_issue_number=? AND status='submitted' ${lock ? 'FOR UPDATE' : ''}`).get<ReportRow>(issueNumber)
    if (!report) throw new FeedbackError('feedback_report_not_found', 404)
    return report
  }
}
