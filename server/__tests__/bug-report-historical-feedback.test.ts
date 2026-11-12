import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as database from '../db'
import { requestAccountDeletion } from '../auth'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { GitHubFixVerifier } from '../bug-report/github-fix-verifier'
import type { DeploymentProof } from '../bug-report/deployment-proof'

let db: PostgresDatabase
let service: BugReportFeedbackService
const issues = [1464, 1465, 1479, 1490, 1504, 1564, 1574, 1586, 1591, 1595, 1622, 1637]
const fixes = [
  { number: 1534, sha: 'a94787d1e61004fc863aaf3dbf2171bda834a716' },
  { number: 1484, sha: 'db196efe21951429230301454cee7eef35a8d249' },
  { number: 1515, sha: 'd1570f66cd2dac96c0f66d008684cfff12f168f5' },
  { number: 1592, sha: 'f9edb37342f4f9deeb2ccd344d5c0b9ab9a3cebf' },
]
const github: typeof fetch = async resource => {
  const path = new URL(String(resource)).pathname
  const entry = fixes.find(fix => path.endsWith(`/pulls/${fix.number}`) || path.includes(`/commits/${fix.sha}`))
  if (!entry) throw new Error(`Unexpected external read ${path}`)
  const pull = { number: entry.number, merged: true, merged_at: '2026-11-01T00:00:00Z', merge_commit_sha: entry.sha,
    html_url: `https://github.com/titanxxh/open-agricola/pull/${entry.number}`, base: { ref: 'main', repo: { full_name: 'titanxxh/open-agricola' } } }
  return Response.json(path.endsWith('/pulls') ? [pull] : path.includes('/commits/') ? { sha: entry.sha } : pull)
}
const deployed = 'c'.repeat(40)
const proof: DeploymentProof = { repository: 'titanxxh/open-agricola', observedAt: 2000,
  release: { version: 'v0.30.0', url: 'https://github.com/titanxxh/open-agricola/releases/tag/v0.30.0', sha: deployed, tagSha: deployed, draft: false, prerelease: false, publishedAt: 1000 },
  candidate: { status: 'passed', repository: 'titanxxh/open-agricola', sha: deployed, configuration: 'd'.repeat(64), requiredTaskIds: ['quality'],
    tasks: [{ id: 'quality', status: 'passed', reason: null, runId: 1, jobId: 2, url: 'https://github.com/titanxxh/open-agricola/actions/runs/1/job/2' }] },
  frontend: { format: 1, gameBuildId: deployed, basePath: '/', url: 'https://example.test/frontend-build.json' },
  backend: { gameBuildId: deployed, running: true, ready: true, containerId: 'synthetic' },
  ancestry: { format: 'git-raw-closure-v1', commits: [...fixes.map(fix => fix.sha), deployed] } }
const reviewed = { explanation1595: '最后一张牌仍需确认是当前交互流程的体验建议，不属于规则或结算错误；建议已保留供后续体验改进。' }
beforeEach(async () => {
  db = await createTestDatabase()
  service = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(github))
  for (const id of ['reporter', 'admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  for (const issue of issues) await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES(?,'reporter','room',0,'active',1,0,?,'submitted',?,1,1)`)
    .run(`report-${issue}`, 'a'.repeat(64), issue)
  await service.recordVerifiedDeployment('historical-production', proof)
})
afterEach(async () => { vi.restoreAllMocks(); await db?.close() })
it('previews twelve reviewed reports without writes, then delivers sixteen stable messages and zero on restart', async () => {
  const operations = await service.listFeedbackOperations()
  const preview = await service.previewHistoricalFeedback(reviewed)
  expect(preview.projectedMessages).toBe(16)
  expect(preview.rows.map(row => row.issueNumber)).toEqual(issues)
  expect((await service.listInbox('reporter')).messages).toEqual([])
  expect(await service.listFeedbackOperations()).toEqual(operations)
  const result = await service.executeHistoricalFeedback('admin', reviewed)
  expect(result.errors).toEqual([])
  expect(result.newMessages).toBe(16)
  const inbox = await service.listInbox('reporter')
  expect(inbox.unreadCount).toBe(16)
  expect(inbox.messages.filter(message => message.kind === 'confirmed_bug')).toHaveLength(4)
  expect(inbox.messages.filter(message => message.kind === 'not_bug')).toHaveLength(6)
  expect(inbox.messages.filter(message => message.kind === 'needs_info')).toHaveLength(2)
  expect(inbox.messages.filter(message => message.kind === 'fix_released')).toHaveLength(4)
  const release = inbox.messages.find(message => message.issueNumber === 1465 && message.kind === 'fix_released')
  expect(release).toMatchObject({ release: { firstVerified: { version: 'v0.30.0' }, historicalFirstIncluded: { version: 'v0.11.8', url: 'https://github.com/titanxxh/open-agricola/releases/tag/v0.11.8' } } })
  const first = inbox.messages.at(-1)
  if (!first) throw new Error('Missing first message')
  await service.markRead('reporter', first.id)
  service = new BugReportFeedbackService(db, () => 4000, new GitHubFixVerifier(github))
  expect((await service.executeHistoricalFeedback('admin', reviewed)).newMessages).toBe(0)
  expect((await service.listInbox('reporter')).unreadCount).toBe(15)
})

it('defaults to skipping the unexplained suggestion and preserves daily assessments and excluded reports', async () => {
  await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'daily-confirmation', expectedVersion: 0, kind: 'confirmed_bug', reportSummary: 'Daily review', explanation: 'Confirmed by an ordinary administrator.' })
  const preview = await service.previewHistoricalFeedback()
  expect(preview.projectedMessages).toBe(14)
  expect(preview.rows.find(row => row.issueNumber === 1595)).toMatchObject({ skipReason: 'missing_explanation', triage: 'skip' })
  expect(preview.rows.find(row => row.issueNumber === 1465)).toMatchObject({ triage: 'already_assessed' })
  expect(preview.rows.find(row => row.issueNumber === 1464)?.details).toMatchObject({ kind: 'needs_info', missingItems: expect.arrayContaining(['同局其他玩家是否同时断连。']) })
  expect(preview.rows.find(row => row.issueNumber === 1490)?.triageText).toContain('#1499 不是该问题的已确认修复')
  await service.executeHistoricalFeedback('admin')
  expect((await service.getReport(1465)).feedback).toHaveLength(1)
  expect((await service.getReport(1595)).feedback).toEqual([])
  for (const explanation1595 of ['无效', '体验建议', ' 体验，建议！ ', 'Improvement suggestion', 'improvement-suggestion.']) {
    await expect(service.previewHistoricalFeedback({ explanation1595 })).rejects.toThrow()
  }
  await expect(service.previewHistoricalFeedback({ imports: [{ issueNumber: 9999 }] })).rejects.toThrow()
})

it('constrains source and final reconciliation to reviewed eligible allowlisted reports', async () => {
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,github_issue_number,created_at,updated_at)
    VALUES('unrelated','reporter','room',0,'active',1,0,?,'submitted',9999,1,1)`).run('a'.repeat(64))
  await service.recordFeedback('admin', { issueNumber: 9999, requestId: 'unrelated-confirmation', expectedVersion: 0, kind: 'confirmed_bug', reportSummary: 'Unrelated report', explanation: 'Confirmed independently.' })
  await db.exec(`CREATE FUNCTION fail_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.kind='fix_released' THEN RAISE EXCEPTION 'test notification failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_release BEFORE INSERT ON bug_report_feedback FOR EACH ROW EXECUTE FUNCTION fail_release()`)
  await service.associateFix('admin', { issueNumber: 9999, requestId: 'unrelated-fix', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.', pullRequests: [{ number: 1534, requiredCommits: [fixes[0].sha] }] })
  await db.exec('DROP TRIGGER fail_release ON bug_report_feedback')
  const before = await service.previewHistoricalFeedback(reviewed)
  expect(before.projectedMessages).toBe(16)
  expect((await service.executeHistoricalFeedback('admin', reviewed)).newMessages).toBe(16)
  expect((await service.listInbox('reporter')).messages.filter(message => message.issueNumber === 9999).map(message => message.kind)).toEqual(['confirmed_bug'])
  const pending = (await service.listFeedbackOperations()).find(operation => operation.operationId === 'reconcile:unrelated:unrelated-fix')
  expect(pending?.status).toBe('pending')
  if (!pending) throw new Error('Missing unrelated pending operation')
  await service.retryFeedbackOperation(pending.operationId)
  expect((await service.listInbox('reporter')).messages.filter(message => message.issueNumber === 9999).map(message => message.kind)).toEqual(['fix_released', 'confirmed_bug'])
})

it('isolates ambiguous mappings while processing other eligible reports', async () => {
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,github_issue_number,created_at,updated_at)
    VALUES('ambiguous','reporter','room',0,'active',1,0,?,'submitted',1465,1,1)`).run('a'.repeat(64))
  expect((await service.previewHistoricalFeedback(reviewed)).rows.find(row => row.issueNumber === 1465)?.skipReason).toBe('mapping_conflict')
  const executed = await service.executeHistoricalFeedback('admin', reviewed)
  expect(executed.newMessages).toBe(14)
  expect(executed.reconciliation.status).toBe('completed')
  expect((await service.listInbox('reporter')).messages.filter(message => message.issueNumber === 1465)).toEqual([])
})

it('restarts after real PostgreSQL partial write failures without duplicating successful rows', async () => {
  await db.exec(`CREATE FUNCTION fail_one_triage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.submission_id='report-1574' THEN RAISE EXCEPTION 'test row failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_one_triage BEFORE INSERT ON bug_report_feedback FOR EACH ROW EXECUTE FUNCTION fail_one_triage()`)
  const first = await service.executeHistoricalFeedback('admin', reviewed)
  expect(first.errors).toEqual([{ issueNumber: 1574, reason: 'historical_write_failed' }])
  expect(first.newMessages).toBe(15)
  await db.exec('DROP TRIGGER fail_one_triage ON bug_report_feedback')
  const restored = new BugReportFeedbackService(db, () => 4000, new GitHubFixVerifier(github))
  expect((await restored.executeHistoricalFeedback('admin', reviewed)).newMessages).toBe(1)
  expect((await restored.executeHistoricalFeedback('admin', reviewed)).newMessages).toBe(0)
  expect((await restored.listInbox('reporter')).unreadCount).toBe(16)
})

const importedMarker = '11111111-1111-4111-8111-111111111111'
function importFixture() {
  const body = `- Reporter site ID: \`reporter\`
- Room ID: \`room\`
- Reporter seat: \`p99\`
- Step: \`999999\`
- Frame hash: \`${'f'.repeat(64)}\`
<!-- open-agricola-report:${importedMarker} -->`
  const input = { ...reviewed, imports: [{ issueNumber: 1465, submissionId: importedMarker, reporterSiteId: 'reporter', roomId: 'room', bodySha256: createHash('sha256').update(body).digest('hex'), auditReference: 'synthetic-reviewed-audit' }] }
  const reader = async () => ({ number: 1465, html_url: 'https://github.com/titanxxh/open-agricola/issues/1465', body })
  return { input, reader }
}
async function removeMapping() {
  await db.prepare("DELETE FROM bug_report_feedback_subjects WHERE submission_id='report-1465'").run()
  await db.prepare("DELETE FROM bug_reports WHERE submission_id='report-1465'").run()
}
it('imports only a notification subject and ignores public locator edits as game authority', async () => {
  await removeMapping()
  const { input, reader } = importFixture()
  service = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(github), reader)
  const nativeBefore = await db.prepare('SELECT COUNT(*) AS count FROM bug_reports').get()
  const preview = await service.previewHistoricalFeedback(input)
  expect(preview.rows.find(row => row.issueNumber === 1465)).toMatchObject({ mapping: { source: 'import' }, triage: 'send' })
  expect(await db.prepare('SELECT 1 FROM bug_report_feedback_subjects WHERE submission_id=?').get(importedMarker)).toBeUndefined()
  expect((await service.executeHistoricalFeedback('admin', input)).newMessages).toBe(16)
  expect(await db.prepare('SELECT COUNT(*) AS count FROM bug_reports').get()).toEqual(nativeBefore)
  expect(await db.prepare('SELECT 1 FROM bug_reports WHERE submission_id=?').get(importedMarker)).toBeUndefined()
  expect(await db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get()).toEqual({ count: 0 })
  expect((await service.getReport(1465)).fix?.status).toBe('released')
  expect((await service.executeHistoricalFeedback('admin', input)).newMessages).toBe(0)
})
it('skips missing, conflicting and anonymized mappings and deletion-pending import recipients', async () => {
  await removeMapping()
  const { input, reader } = importFixture()
  expect((await service.previewHistoricalFeedback(reviewed)).rows.find(row => row.issueNumber === 1465)?.skipReason).toBe('missing_mapping')
  const conflicting = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(github), async () => ({ ...await reader(), body: 'edited and conflicting' }))
  expect((await conflicting.previewHistoricalFeedback(input)).rows.find(row => row.issueNumber === 1465)?.skipReason).toBe('issue_evidence_conflict')
  await db.prepare("UPDATE bug_reports SET reporter_user_id=NULL WHERE github_issue_number=1479").run()
  expect((await service.previewHistoricalFeedback(input)).rows.find(row => row.issueNumber === 1479)?.skipReason).toBe('reporter_unavailable')
  await db.prepare("INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES('reporter',1,1)").run()
  service = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(github), reader)
  expect((await service.previewHistoricalFeedback(input)).rows.find(row => row.issueNumber === 1465)?.skipReason).toBe('reporter_unavailable')
  expect((await service.executeHistoricalFeedback('admin', input)).newMessages).toBe(0)
  expect(await db.prepare('SELECT 1 FROM bug_report_feedback_subjects WHERE submission_id=?').get(importedMarker)).toBeUndefined()
})
it('survives concurrent execution and account deletion without rebuilding recipients', async () => {
  const concurrent = await Promise.all([service.executeHistoricalFeedback('admin', reviewed), service.executeHistoricalFeedback('admin', reviewed)])
  expect(concurrent.reduce((sum, result) => sum + result.newMessages, 0)).toBe(16)
  expect((await service.listInbox('reporter')).unreadCount).toBe(16)
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  await Promise.all([requestAccountDeletion('reporter'), service.executeHistoricalFeedback('admin', reviewed)])
  expect((await service.listInbox('reporter')).messages).toEqual([])
  expect((await service.executeHistoricalFeedback('admin', reviewed)).newMessages).toBe(0)
})
it('binds an operation to its persisted recipient scope', async () => {
  await service.reconcileVerifiedFixes('scoped-historical-operation', [1465])
  await expect(service.reconcileVerifiedFixes('scoped-historical-operation', [1479])).rejects.toMatchObject({ code: 'feedback_operation_conflict' })
})

it('lets a concurrent daily reassessment win without claiming its message or sending an audited fix', async () => {
  let reached = () => {}, release = () => {}
  const atGate = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  let stopped = false
  const paused: typeof fetch = async resource => {
    if (new URL(String(resource)).pathname.endsWith('/pulls/1534') && !stopped) { stopped = true; reached(); await gate }
    return github(resource)
  }
  const backfill = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(paused)).executeHistoricalFeedback('admin', reviewed)
  await atGate
  await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'concurrent-daily-not-bug', expectedVersion: 0, kind: 'not_bug', reportSummary: 'Daily reassessment', explanation: 'The observed action was correctly refused by the rules.' })
  release()
  const result = await backfill
  expect(result.newMessages).toBe(14)
  expect(result.errors).toContainEqual({ issueNumber: 1465, reason: 'feedback_version_conflict' })
  expect((await service.getReport(1465)).feedback.map(message => message.kind)).toEqual(['not_bug'])
  expect((await service.listInbox('reporter')).messages.filter(message => message.issueNumber === 1465).map(message => message.kind)).toEqual(['not_bug'])
})
it('fences a concurrent fix edit and never applies historical metadata to a different fix', async () => {
  let reached = () => {}, release = () => {}
  const atGate = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  let reads = 0
  const paused: typeof fetch = async resource => {
    if (new URL(String(resource)).pathname.endsWith('/pulls/1534') && ++reads === 2) { reached(); await gate }
    return github(resource)
  }
  const backfill = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(paused)).executeHistoricalFeedback('admin', reviewed)
  await atGate
  await service.associateFix('admin', { issueNumber: 1465, requestId: 'concurrent-daily-fix', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.', pullRequests: [{ number: 1484, requiredCommits: [fixes[1].sha] }] })
  release()
  const result = await backfill
  expect(result.newMessages).toBe(15)
  expect(result.errors).toContainEqual({ issueNumber: 1465, reason: 'fix_version_conflict' })
  const inbox = await service.listInbox('reporter')
  const released = inbox.messages.find(message => message.issueNumber === 1465 && message.kind === 'fix_released')
  expect(released?.kind === 'fix_released' ? released.release.historicalFirstIncluded : 'missing release').toBeUndefined()
  expect(inbox.unreadCount).toBe(16)
})

it('enforces a real read-only snapshot before external proof lookups', async () => {
  const observed = new Set<string>()
  const checking: typeof fetch = async resource => {
    observed.add((await db.query<{ transaction_read_only: string }>('SHOW transaction_read_only')).rows[0].transaction_read_only)
    return github(resource)
  }
  const result = await new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(checking)).previewHistoricalFeedback(reviewed)
  expect(result.projectedMessages).toBe(16)
  expect([...observed]).toEqual(['on'])
  expect((await service.listInbox('reporter')).messages).toEqual([])
})
it('keeps identity-free root metadata after native row deletion for a live duplicate', async () => {
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('other','other','Other','',1)").run()
  await db.prepare("UPDATE bug_reports SET reporter_user_id='other' WHERE github_issue_number=1479").run()
  for (const issueNumber of [1465, 1479]) await service.recordFeedback('admin', { issueNumber, requestId: `native-confirm-${issueNumber}`, expectedVersion: 0, kind: 'confirmed_bug', reportSummary: 'Native report', explanation: 'The missing action is confirmed.' })
  await service.associateDuplicate('admin', { issueNumber: 1479, rootIssueNumber: 1465, requestId: 'native-duplicate', expectedVersion: 0 })
  await service.recordFeedback('admin', { issueNumber: 1479, requestId: 'native-needs-info', expectedVersion: 1, kind: 'needs_info', reportSummary: 'Native report', explanation: 'Please identify the affected action.', missingItems: ['Which action space was occupied?'] })
  await service.associateFix('admin', { issueNumber: 1465, requestId: 'native-root-fix', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.', pullRequests: [{ number: 1534, requiredCommits: [fixes[0].sha] }] })
  await db.prepare("DELETE FROM bug_reports WHERE submission_id='report-1465'").run()
  expect((await service.getReport(1479)).fix?.rootId).toBe('report-1465')
  await service.recordFeedback('admin', { issueNumber: 1479, requestId: 'native-reconfirmed', expectedVersion: 2, kind: 'confirmed_bug', reportSummary: 'Native report', explanation: 'The new report confirms the missing action.' })
  expect((await service.listInbox('other')).messages.map(message => message.kind)).toEqual(['fix_released','confirmed_bug','needs_info','confirmed_bug'])
  expect(await db.prepare("SELECT reporter_user_id,native_submission_id FROM bug_report_feedback_subjects WHERE submission_id='report-1465'").get()).toEqual({ reporter_user_id: null, native_submission_id: null })
})

it('supplies an audited summary for an old root without reusing its pre-summary request fingerprint', async () => {
  await service.recordFeedback('admin',{ issueNumber:1465,requestId:'old-historical-triage',expectedVersion:0,kind:'confirmed_bug',reportSummary:'Cannot discard goods',explanation:'The missing discard action is confirmed.' })
  await db.prepare(`INSERT INTO bug_report_fix_roots(root_id,version,pull_requests,updated_at) VALUES('report-1465',1,?::jsonb,1)`)
    .run(JSON.stringify([{ number:1534,url:'https://github.com/titanxxh/open-agricola/pull/1534',mergeCommit:fixes[0].sha,requiredCommits:[fixes[0].sha] }]))
  await db.prepare("INSERT INTO bug_report_fix_links(submission_id,root_id) VALUES('report-1465','report-1465')").run()
  await db.prepare("INSERT INTO bug_report_fix_requests(submission_id,request_id,fingerprint,created_at) VALUES('report-1465','backfill1675_fix_1465','pre-summary-request',1)").run()
  const preview = await service.previewHistoricalFeedback(reviewed)
  expect(preview.rows.find(row => row.issueNumber === 1465)?.fix?.text).toContain('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。')
  const result = await service.executeHistoricalFeedback('admin',reviewed)
  expect(result.errors).toEqual([])
  expect(result.newMessages).toBe(15)
  expect((await service.getReport(1465)).fix).toMatchObject({ version:2,fixSummary:'新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。' })
  expect((await service.listInbox('reporter')).messages.find(message => message.issueNumber === 1465 && message.kind === 'fix_released'))
    .toMatchObject({ explanation:'新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。' })
  expect((await service.executeHistoricalFeedback('admin',reviewed)).newMessages).toBe(0)
})
it('previews and preserves an existing reviewed root summary instead of replacing it with historical defaults', async () => {
  const fixSummary = 'Adds a supply-goods discard selector with explicit quantities while preserving the current turn.'
  await service.recordFeedback('admin',{ issueNumber:1465,requestId:'reviewed-daily-triage',expectedVersion:0,kind:'confirmed_bug',reportSummary:'Cannot discard goods',explanation:'The missing discard action is confirmed.' })
  await service.associateFix('admin',{ issueNumber:1465,requestId:'reviewed-daily-fix',expectedVersion:0,purpose:'fix',fixSummary,pullRequests:[{ number:1534,requiredCommits:[fixes[0].sha] }] })
  const preview = await service.previewHistoricalFeedback(reviewed)
  expect(preview.rows.find(row => row.issueNumber === 1465)?.fix?.text).toContain(fixSummary)
  await service.executeHistoricalFeedback('admin',reviewed)
  expect((await service.getReport(1465)).fix).toMatchObject({ version:1,fixSummary })
  expect((await service.listInbox('reporter')).messages.find(message => message.issueNumber === 1465 && message.kind === 'fix_released')).toMatchObject({ explanation:fixSummary })
})
