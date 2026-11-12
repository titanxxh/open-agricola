import { parseRecordFeedback, type FeedbackRecord, type InboxMessage, type InboxPage, type ReportFeedbackView } from '../../shared/contract/bug-report-feedback'
import type { PostgresDatabase } from '../database/postgres'
import { BUG_REPORT_GITHUB_REPOSITORY } from './github-issue-client'

export class FeedbackError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}

type ReportRow = { submission_id: string; reporter_user_id: string | null; github_issue_number: number; status: string }
type FeedbackRow = { id: number; submission_id: string; github_issue_number: number; kind: 'confirmed_bug';
  report_summary: string; explanation: string; version: number; created_at: number; read_at: number | null }

const issueUrl = (number: number) => `https://github.com/${BUG_REPORT_GITHUB_REPOSITORY}/issues/${number}`
const record = (row: FeedbackRow): FeedbackRecord => ({ id: row.id, submissionId: row.submission_id,
  issueNumber: row.github_issue_number, issueUrl: issueUrl(row.github_issue_number), kind: row.kind,
  reportSummary: row.report_summary, explanation: row.explanation, version: row.version, createdAt: row.created_at })
const message = (row: FeedbackRow): InboxMessage => ({ ...record(row), readAt: row.read_at })
const feedbackRows = `SELECT f.*, r.github_issue_number FROM bug_report_feedback f JOIN bug_reports r USING(submission_id)`

export class BugReportFeedbackService {
  private readonly db: PostgresDatabase
  private readonly now: () => number
  constructor(db: PostgresDatabase, now = Date.now) { this.db = db; this.now = now }

  async getReport(issueNumber: number): Promise<ReportFeedbackView> {
    const report = await this.findReport(issueNumber)
    const rows = await this.db.prepare(`${feedbackRows} WHERE f.submission_id=? ORDER BY f.version`).all<FeedbackRow>(report.submission_id)
    return { submissionId: report.submission_id, issueNumber, issueUrl: issueUrl(issueNumber),
      version: rows.at(-1)?.version ?? 0, feedback: rows.map(record) }
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
          || previous.version !== input.expectedVersion + 1) {
          throw new FeedbackError('feedback_request_conflict', 409)
        }
        return record(previous)
      }
      const latest = await this.db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM bug_report_feedback WHERE submission_id=?')
        .get<{ version: number }>(report.submission_id)
      if (latest?.version !== input.expectedVersion) throw new FeedbackError('feedback_version_conflict', 409)
      const inserted = await this.db.prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,actor_user_id,request_id,
        kind,report_summary,explanation,version,created_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *`)
        .get<Omit<FeedbackRow, 'github_issue_number'>>(report.submission_id, recipient, actorId, input.requestId, input.kind,
          input.reportSummary, input.explanation, input.expectedVersion + 1, this.now())
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
