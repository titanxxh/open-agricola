import { parseAssociateDuplicate, parseAssociateFix, parseFeedbackDetails, parseRecordFeedback, type FeedbackRecord, type FixAssociation, type InboxMessage, type InboxPage, type ReportFeedbackView, type VerifiedFixPullRequest, type ReleaseFeedbackRecord, type VerifiedProductionRelease } from '../../shared/contract/bug-report-feedback'
import { parseDeploymentProof, planFixDeployment, type DeploymentProof } from './deployment-proof'
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
  report_summary: string; explanation: string; version: number; created_at: number; read_at: number | null; release: ReleaseFeedbackRecord['release'] | null }
export type FeedbackOperation = { operationId: string; kind: 'deployment' | 'reconcile'; status: 'pending' | 'completed';
  error: string | null; createdAt: number; completedAt: number | null; result?: FeedbackReconciliationResult }
export type FeedbackReconciliationResult = { sentMessages: number; pendingFixes: Array<{ rootId: string; rootIssueNumber: number;
  reason: 'no_verified_deployment' | 'missing_required_commits'; missingCommits: string[] }> }
type OperationRow = { operation_id: string; kind: FeedbackOperation['kind']; status: FeedbackOperation['status']; error: string | null;
  created_at: number; completed_at: number | null; proof: DeploymentProof | null; fingerprint: string; result: FeedbackReconciliationResult | null }
const operation = (row: OperationRow): FeedbackOperation => ({ operationId: row.operation_id, kind: row.kind, status: row.status,
  error: row.error, createdAt: row.created_at, completedAt: row.completed_at, ...(row.result ? { result: row.result } : {}) })
type FixRootRow = { root_id: string; version: number; pull_requests: VerifiedFixPullRequest[] }

const issueUrl = (number: number) => `https://github.com/${BUG_REPORT_GITHUB_REPOSITORY}/issues/${number}`
const record = (row: FeedbackRow): FeedbackRecord => ({ id: row.id, submissionId: row.submission_id,
  issueNumber: row.github_issue_number, issueUrl: issueUrl(row.github_issue_number),
  ...parseFeedbackDetails({ kind: row.kind, explanation: row.explanation, ...(row.kind === 'needs_info' ? { missingItems: row.missing_items } : {}) }),
  reportSummary: row.report_summary, version: row.version, createdAt: row.created_at })
const message = (row: FeedbackRow): InboxMessage => row.kind === 'fix_released' && row.release
  ? { id: row.id, submissionId: row.submission_id, issueNumber: row.github_issue_number, issueUrl: issueUrl(row.github_issue_number),
    reportSummary: row.report_summary, explanation: row.explanation, createdAt: row.created_at, kind: 'fix_released', version: null,
    release: row.release, readAt: row.read_at }
  : { ...record(row), readAt: row.read_at }
const feedbackRows = `SELECT f.*, r.github_issue_number FROM bug_report_feedback f JOIN bug_reports r USING(submission_id)`

export class BugReportFeedbackService {
  private readonly db: PostgresDatabase
  private readonly now: () => number
  private readonly fixVerifier: GitHubFixVerifier
  constructor(db: PostgresDatabase, now = Date.now, fixVerifier = new GitHubFixVerifier()) { this.db = db; this.now = now; this.fixVerifier = fixVerifier }

  async getReport(issueNumber: number): Promise<ReportFeedbackView> {
    const report = await this.findReport(issueNumber)
    const rows = await this.db.prepare(`${feedbackRows} WHERE f.submission_id=? AND f.kind<>'fix_released' ORDER BY f.version`).all<FeedbackRow>(report.submission_id)
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
    const result = await this.db.transaction(async () => {
      const reports = await this.lockFixGraph([input.issueNumber])
      const report = reports.find(row => row.github_issue_number === input.issueNumber)
      if (!report) throw new FeedbackError('feedback_report_not_found', 404)
      const link = await this.db.prepare('SELECT root_id FROM bug_report_fix_links WHERE submission_id=?').get<{ root_id: string }>(report.submission_id)
      if (link && link.root_id !== report.submission_id) throw new FeedbackError('fix_requires_root', 409)
      await this.requireConfirmedRecipient(reports)
      if (!link) await this.requireConfirmed(report.submission_id)
      if (await this.fixRequest(report.submission_id, input.requestId, fingerprint)) {
        await this.queueReconciliation(report.submission_id, input.requestId)
        return this.getReport(input.issueNumber)
      }
      const root = await this.db.prepare('SELECT * FROM bug_report_fix_roots WHERE root_id=?').get<FixRootRow>(report.submission_id)
      if ((root?.version ?? 0) !== input.expectedVersion) throw new FeedbackError('fix_version_conflict', 409)
      await this.ensureFixRoot(report.submission_id)
      await this.db.prepare('UPDATE bug_report_fix_roots SET version=?,pull_requests=?::jsonb,updated_at=? WHERE root_id=?')
        .run(input.expectedVersion + 1, JSON.stringify(pullRequests), this.now(), report.submission_id)
      await this.saveFixRequest(actorId, report.submission_id, input.requestId, fingerprint)
      return this.getReport(input.issueNumber)
    })()
    await this.retryFeedbackOperation(this.reconciliationId(result.submissionId, input.requestId))
    return this.getReport(input.issueNumber)
  }

  async associateDuplicate(actorId: string, value: unknown): Promise<ReportFeedbackView> {
    let input
    try { input = parseAssociateDuplicate(value) } catch { throw new FeedbackError('invalid_fix_association', 400) }
    const fingerprint = JSON.stringify(input)
    const result = await this.db.transaction(async () => {
      const reports = await this.lockFixGraph([input.issueNumber, input.rootIssueNumber])
      const report = reports.find(row => row.github_issue_number === input.issueNumber)
      const target = reports.find(row => row.github_issue_number === input.rootIssueNumber)
      if (!report || !target) throw new FeedbackError('feedback_report_not_found', 404)
      if (!report.reporter_user_id || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(report.reporter_user_id)) {
        throw new FeedbackError('reporter_unavailable', 410)
      }
      await this.requireConfirmed(report.submission_id)
      if (await this.fixRequest(report.submission_id, input.requestId, fingerprint)) {
        await this.queueReconciliation(report.submission_id, input.requestId)
        return this.getReport(input.issueNumber)
      }
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
    await this.retryFeedbackOperation(this.reconciliationId(result.submissionId, input.requestId))
    return this.getReport(input.issueNumber)
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
    const releases = await this.verifiedReleases(row.root_id, row.version)
    const plan = await this.previewFixDeployment(row.pull_requests)
    return { rootId: row.root_id, rootIssueNumber: row.root_issue_number, version: row.version,
      associationVersion: row.association_version, status: plan.currentProduction ? 'released' : row.pull_requests.length ? 'pending_release' : 'unlinked',
      ...(releases[0] ? { firstVerifiedRelease: releases[0] } : {}), ...(releases.at(-1) ? { currentProductionRelease: releases.at(-1) } : {}),
      reports: reports.map(report => ({ submissionId: report.submission_id, issueNumber: report.github_issue_number })),
      pullRequests: row.pull_requests, requiredCommits: [...new Set(row.pull_requests.flatMap(pr => pr.requiredCommits))].sort() }
  }

  private async ensureFixRoot(submissionId: string): Promise<void> {
    await this.db.prepare('INSERT INTO bug_report_fix_roots(root_id,updated_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(submissionId, this.now())
    await this.db.prepare('INSERT INTO bug_report_fix_links(submission_id,root_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(submissionId, submissionId)
  }

  private async requireConfirmed(submissionId: string): Promise<void> {
    const latest = await this.db.prepare("SELECT kind FROM bug_report_feedback WHERE submission_id=? AND kind<>'fix_released' ORDER BY version DESC LIMIT 1")
      .get<{ kind: string }>(submissionId)
    if (latest?.kind !== 'confirmed_bug') throw new FeedbackError('fix_requires_confirmed_bug', 409)
  }

  private async requireConfirmedRecipient(reports: ReportRow[]): Promise<void> {
    let liveRecipient = false
    for (const report of reports) {
      if (!report.reporter_user_id || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(report.reporter_user_id)) continue
      liveRecipient = true
      const latest = await this.db.prepare("SELECT kind FROM bug_report_feedback WHERE submission_id=? AND kind<>'fix_released' ORDER BY version DESC LIMIT 1")
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
      LEFT JOIN bug_report_fix_links l USING(submission_id) WHERE ${issueNumbers.length ? `r.github_issue_number IN (${placeholders}) OR l.root_id IN
      (SELECT root_id FROM bug_report_fix_links JOIN bug_reports USING(submission_id) WHERE github_issue_number IN (${placeholders}))` : 'l.root_id IS NOT NULL'}`)
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

  private reconciliationId(submissionId: string, requestId: string): string { return `reconcile:${submissionId}:${requestId}` }

  private async queueReconciliation(submissionId: string, requestId: string): Promise<void> {
    const id = this.reconciliationId(submissionId, requestId)
    await this.db.prepare(`INSERT INTO bug_report_feedback_operations(operation_id,kind,fingerprint,created_at)
      VALUES(?,'reconcile',?,?) ON CONFLICT DO NOTHING`).run(id, id, this.now())
  }

  private async saveFixRequest(actorId: string, submissionId: string, requestId: string, fingerprint: string): Promise<void> {
    await this.db.prepare('INSERT INTO bug_report_fix_requests(submission_id,request_id,fingerprint,actor_user_id,created_at) VALUES(?,?,?,?,?)')
      .run(submissionId, requestId, fingerprint, actorId, this.now())
    await this.queueReconciliation(submissionId, requestId)
  }

  async recordFeedback(actorId: string, value: unknown): Promise<FeedbackRecord> {
    let input
    try { input = parseRecordFeedback(value) } catch { throw new FeedbackError('invalid_feedback', 400) }
    const initial = await this.findReport(input.issueNumber)
    const recipient = initial.reporter_user_id
    if (!recipient) throw new FeedbackError('reporter_unavailable', 410)
    const result = await this.db.transaction(async () => {
      await this.lockFixGraph([input.issueNumber])
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
        await this.queueReconciliation(report.submission_id, input.requestId)
        return record(previous)
      }
      const latest = await this.db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM bug_report_feedback WHERE submission_id=? AND kind<>'fix_released'")
        .get<{ version: number }>(report.submission_id)
      if (latest?.version !== input.expectedVersion) throw new FeedbackError('feedback_version_conflict', 409)
      const inserted = await this.db.prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,actor_user_id,request_id,
        kind,report_summary,explanation,missing_items,version,created_at) VALUES(?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING *`)
        .get<Omit<FeedbackRow, 'github_issue_number'>>(report.submission_id, recipient, actorId, input.requestId, input.kind,
          input.reportSummary, input.explanation, input.kind === 'needs_info' ? JSON.stringify(input.missingItems) : null, input.expectedVersion + 1, this.now())
      if (!inserted) throw new Error('Feedback insert returned no record')
      await this.queueReconciliation(report.submission_id, input.requestId)
      return record({ ...inserted, github_issue_number: input.issueNumber })
    })()
    await this.retryFeedbackOperation(this.reconciliationId(initial.submission_id, input.requestId))
    return result
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
    const messages = await Promise.all(rows.slice(0, limit).map(row => this.projectMessage(row)))
    return { messages, unreadCount: unread?.count ?? 0, nextCursor: rows.length > limit ? messages.at(-1)?.id ?? null : null }
  }

  async getMessage(userId: string, id: number): Promise<InboxMessage> {
    const row = await this.db.prepare(`${feedbackRows} WHERE f.id=? AND f.recipient_user_id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?)`).get<FeedbackRow>(id, userId, userId)
    if (!row) throw new FeedbackError('feedback_not_found', 404)
    return this.projectMessage(row)
  }

  async markRead(userId: string, id: number): Promise<InboxMessage> {
    const result = await this.db.prepare(`UPDATE bug_report_feedback SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=?)`).run(this.now(), id, userId, userId)
    if (!result.changes) throw new FeedbackError('feedback_not_found', 404)
    return this.getMessage(userId, id)
  }

  async recordVerifiedDeployment(operationId: string, value: unknown): Promise<FeedbackOperation> {
    let proof
    try { proof = parseDeploymentProof(value); if (proof.observedAt > this.now()) throw new Error('future_proof') } catch { throw new FeedbackError('invalid_deployment_proof', 400) }
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) throw new FeedbackError('invalid_feedback_operation', 400)
    const fingerprint = JSON.stringify(proof)
    await this.db.transaction(async () => {
      await this.db.prepare(`INSERT INTO bug_report_feedback_operations(operation_id,kind,fingerprint,proof,created_at)
        VALUES(?,'deployment',?,?::jsonb,?) ON CONFLICT DO NOTHING`).run(operationId, fingerprint, fingerprint, this.now())
      const row = await this.db.prepare('SELECT * FROM bug_report_feedback_operations WHERE operation_id=? FOR UPDATE').get<OperationRow>(operationId)
      if (row?.fingerprint !== fingerprint || row.kind !== 'deployment') throw new FeedbackError('feedback_operation_conflict', 409)
    })()
    return this.retryFeedbackOperation(operationId)
  }

  async reconcileVerifiedFixes(operationId: string): Promise<FeedbackOperation> {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) throw new FeedbackError('invalid_feedback_operation', 400)
    await this.db.prepare(`INSERT INTO bug_report_feedback_operations(operation_id,kind,fingerprint,created_at)
      VALUES(?,'reconcile',?,?) ON CONFLICT DO NOTHING`).run(operationId, operationId, this.now())
    const row = await this.db.prepare('SELECT * FROM bug_report_feedback_operations WHERE operation_id=?').get<OperationRow>(operationId)
    if (!row || row.kind !== 'reconcile' || row.fingerprint !== operationId) throw new FeedbackError('feedback_operation_conflict', 409)
    return this.retryFeedbackOperation(operationId)
  }

  async listFeedbackOperations(): Promise<FeedbackOperation[]> {
    return (await this.db.prepare('SELECT * FROM bug_report_feedback_operations ORDER BY created_at,operation_id').all<OperationRow>()).map(operation)
  }

  async retryFeedbackOperation(operationId: string): Promise<FeedbackOperation> {
    try {
      return await this.db.transaction(async () => {
        const reports = await this.lockFixGraph([])
        const row = await this.db.prepare('SELECT * FROM bug_report_feedback_operations WHERE operation_id=? FOR UPDATE').get<OperationRow>(operationId)
        if (!row) throw new FeedbackError('feedback_operation_not_found', 404)
        if (row.status === 'completed') return operation(row)
        const result = await this.reconcileReleases(reports)
        const completedAt = this.now()
        await this.db.prepare(`UPDATE bug_report_feedback_operations SET status='completed',error=NULL,completed_at=?,result=?::jsonb WHERE operation_id=?`)
          .run(completedAt, JSON.stringify(result), operationId)
        return { ...operation(row), result, status: 'completed', error: null, completedAt } satisfies FeedbackOperation
      })()
    } catch (error) {
      if (error instanceof FeedbackError && error.code === 'feedback_operation_not_found') throw error
      // Keep the operation and its proof committed even if the atomic inbox transaction fails.
      await this.db.prepare(`UPDATE bug_report_feedback_operations SET error='notification_transaction_failed' WHERE operation_id=? AND status='pending'`).run(operationId)
      const pending = await this.db.prepare('SELECT * FROM bug_report_feedback_operations WHERE operation_id=?').get<OperationRow>(operationId)
      if (!pending) throw error
      return operation(pending)
    }
  }

  private async verifiedReleases(rootId: string, version: number): Promise<VerifiedProductionRelease[]> {
    const rows = await this.db.prepare(`SELECT o.proof FROM bug_report_fix_verifications v JOIN bug_report_feedback_operations o USING(operation_id)
      WHERE v.root_id=? AND v.fix_version=? ORDER BY (o.proof->>'observedAt')::bigint,o.operation_id`).all<{ proof: DeploymentProof }>(rootId, version)
    return rows.map(row => ({ version: row.proof.release.version, url: row.proof.release.url, sha: row.proof.release.sha,
      publishedAt: row.proof.release.publishedAt, verifiedAt: row.proof.observedAt }))
  }

  private async projectMessage(row: FeedbackRow): Promise<InboxMessage> {
    const value = message(row)
    if (value.kind !== 'fix_released') return value
    const related = await this.db.prepare(`SELECT r.submission_id,r.github_issue_number FROM bug_report_fix_links l JOIN bug_reports r USING(submission_id)
      WHERE l.root_id=? AND r.reporter_user_id=(SELECT recipient_user_id FROM bug_report_feedback WHERE id=?)
      AND (SELECT kind FROM bug_report_feedback WHERE submission_id=r.submission_id AND kind<>'fix_released' ORDER BY version DESC LIMIT 1)='confirmed_bug' ORDER BY r.github_issue_number`)
      .all<{ submission_id: string; github_issue_number: number }>(value.release.rootId, row.id)
    const fix = await this.db.prepare('SELECT version FROM bug_report_fix_roots WHERE root_id=?').get<{ version: number }>(value.release.rootId)
    const releases = fix ? await this.verifiedReleases(value.release.rootId, fix.version) : []
    return { ...value, relatedReports: related.map(report => ({ submissionId: report.submission_id, issueNumber: report.github_issue_number })),
      ...(releases.at(-1) ? { currentProduction: releases.at(-1) } : {}) }
  }

  async previewFixDeployment(pullRequests: VerifiedFixPullRequest[]) {
    const rows = await this.db.prepare("SELECT * FROM bug_report_feedback_operations WHERE kind='deployment'").all<OperationRow>()
    return planFixDeployment(pullRequests, rows.flatMap(row => row.proof ? [{ operationId: row.operation_id, proof: row.proof }] : []))
  }

  private async reconcileReleases(reports: ReportRow[]): Promise<FeedbackReconciliationResult> {
    const result: FeedbackReconciliationResult = { sentMessages: 0, pendingFixes: [] }
    const deployments = await this.db.prepare(`SELECT * FROM bug_report_feedback_operations WHERE kind='deployment'
      ORDER BY (proof->>'observedAt')::bigint,operation_id`).all<OperationRow>()
    const roots = await this.db.prepare('SELECT * FROM bug_report_fix_roots ORDER BY root_id').all<FixRootRow>()
    for (const root of roots) {
      const plan = planFixDeployment(root.pull_requests, deployments.flatMap(row => row.proof ? [{ operationId: row.operation_id, proof: row.proof }] : []))
      if (!plan.requiredCommits.length) continue
      for (const deployment of plan.included) {
        await this.db.prepare(`INSERT INTO bug_report_fix_verifications(root_id,fix_version,operation_id,verified_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`)
          .run(root.root_id, root.version, deployment.operationId, this.now())
      }
      if (!plan.currentProduction) {
        const report = reports.find(report => report.submission_id === root.root_id)
        if (report) result.pendingFixes.push({ rootId: root.root_id, rootIssueNumber: report.github_issue_number,
          reason: deployments.length ? 'missing_required_commits' : 'no_verified_deployment', missingCommits: plan.missingCommits })
        continue
      }
      const [first] = await this.verifiedReleases(root.root_id, root.version)
      if (!first) continue
      const links = await this.db.prepare('SELECT submission_id FROM bug_report_fix_links WHERE root_id=?').all<{ submission_id: string }>(root.root_id)
      const members = reports.filter(report => links.some(link => link.submission_id === report.submission_id))
      const eligible: Array<{ report: ReportRow; feedback: FeedbackRow; recipient: string }> = []
      for (const report of members) {
        const recipient = report.reporter_user_id
        if (!recipient || !await this.db.prepare('SELECT 1 FROM users WHERE id=?').get(recipient)
          || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(recipient)) continue
        const latest = await this.db.prepare(`${feedbackRows} WHERE f.submission_id=? AND f.kind<>'fix_released' ORDER BY f.version DESC LIMIT 1`)
          .get<FeedbackRow>(report.submission_id)
        if (latest?.kind === 'confirmed_bug') eligible.push({ report, feedback: latest, recipient })
      }
      for (const recipient of [...new Set(eligible.map(entry => entry.recipient))].sort()) {
        const recipientReports = eligible.filter(entry => entry.recipient === recipient)
        const [primary] = recipientReports
        if (!primary) continue
        const release = { rootId: root.root_id, firstVerified: first,
          reports: recipientReports.map(entry => ({ submissionId: entry.report.submission_id, issueNumber: entry.report.github_issue_number })) }
        const inserted = await this.db.prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,request_id,kind,report_summary,explanation,
          version,created_at,root_id,release) VALUES(?,?,?,'fix_released',?,'',NULL,?,?,?::jsonb) ON CONFLICT DO NOTHING`)
          .run(primary.report.submission_id, recipient, `release:${root.root_id}`, primary.feedback.report_summary, this.now(), root.root_id, JSON.stringify(release))
        result.sentMessages += inserted.changes
      }
    }
    return result
  }

  private async findReport(issueNumber: number, lock = false): Promise<ReportRow> {
    const report = await this.db.prepare(`SELECT submission_id,reporter_user_id,github_issue_number,status FROM bug_reports
      WHERE github_issue_number=? AND status='submitted' ${lock ? 'FOR UPDATE' : ''}`).get<ReportRow>(issueNumber)
    if (!report) throw new FeedbackError('feedback_report_not_found', 404)
    return report
  }
}
