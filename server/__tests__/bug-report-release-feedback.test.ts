import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as database from '../db'
import { requestAccountDeletion } from '../auth'
import { BugReportStore, TokenCipher } from '../bug-report/bug-report-store'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'
import { PostgresDatabase } from '../database/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { GitHubFixVerifier } from '../bug-report/github-fix-verifier'
import type { DeploymentProof } from '../bug-report/deployment-proof'

let db: PostgresDatabase
let service: BugReportFeedbackService
const commit = 'a'.repeat(40), merge = 'b'.repeat(40), deployed = 'c'.repeat(40)
const repository = 'titanxxh/open-agricola'
const pull = { number: 1500, merged: true, merged_at: '2026-11-01T00:00:00Z', merge_commit_sha: merge,
  html_url: `https://github.com/${repository}/pull/1500`, base: { ref: 'main', repo: { full_name: repository } } }
const github: typeof fetch = async resource => {
  const path = new URL(String(resource)).pathname
  if (path.endsWith('/pulls/1500')) return Response.json(pull)
  if (path.endsWith('/pulls')) return Response.json([pull])
  if (path.includes('/compare/')) return Response.json({ status: 'ahead', merge_base_commit: { sha: commit } })
  return Response.json({ sha: path.split('/').at(-1) })
}
const proof: DeploymentProof = { repository, observedAt: 2000,
  release: { version: 'v0.20.0', url: `https://github.com/${repository}/releases/tag/v0.20.0`, sha: deployed,
    publishedAt: 1500, draft: false, prerelease: false, tagSha: deployed },
  candidate: { status: 'passed', repository, sha: deployed, configuration: 'd'.repeat(64), requiredTaskIds: ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'], tasks: ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'].map(id => ({ id, status: 'passed', reason: null, runId: 1234, jobId: 4321, url: `https://github.com/${repository}/actions/runs/1234/job/4321` })) },
  frontend: { format: 1, gameBuildId: deployed, basePath: '/open-agricola/', url: 'https://example.test/open-agricola/frontend-build.json' },
  backend: { gameBuildId: deployed, running: true, ready: true, containerId: 'container-1' },
  ancestry: { format: 'git-raw-closure-v1', commits: [commit, merge, deployed] } }
function ownerLocalProof() {
  const url = `https://github.com/${repository}/releases/download/v0.20.0/owner-local-verification.json`
  return { ...proof, candidate: { ...proof.candidate,
    ownerLocal: { kind: 'owner-local' as const, configuration: proof.candidate.configuration,
      producerConfiguration: 'e'.repeat(64), receiptSha256: 'f'.repeat(64), statusId: 10, releaseId: 11, assetId: 12, ownerId: 7, url },
    tasks: proof.candidate.requiredTaskIds.map(id => ({ id, status: 'passed' as const,
      reason: 'Owner-authorized local candidate verification', runId: null, jobId: null, url })),
  } }
}
const fix = { issueNumber: 1465, requestId: 'fix-request-01', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.',
  pullRequests: [{ number: 1500, requiredCommits: [commit] }] }
async function report(issue = 1465, recipient = 'reporter') {
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES(?,?,'room',0,'active',1,0,?,'submitted',?,1,1)`)
    .run(`report-${issue}`, recipient, 'a'.repeat(64), issue)
  await service.recordFeedback('admin', { issueNumber: issue, requestId: `confirmation-${issue}`, expectedVersion: 0, kind: 'confirmed_bug',
    reportSummary: `Discard report ${issue}`, explanation: 'The missing discard action is confirmed.' })
}
beforeEach(async () => {
  db = await createTestDatabase()
  service = new BugReportFeedbackService(db, () => 3000, new GitHubFixVerifier(github))
  for (const id of ['reporter', 'other', 'admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  await report()
})
afterEach(async () => { vi.restoreAllMocks(); await db?.close() })

describe('verified production fix feedback', () => {
  it('persists owner-local authority across service reconstruction without inventing Actions jobs or redelivering read messages', async () => {
    await service.associateFix('admin', fix)
    const local = ownerLocalProof()
    const result = await service.recordVerifiedDeployment('owner-local-production', local)
    expect(result).toMatchObject({ status: 'completed', result: { sentMessages: 1, pendingFixes: [] } })
    const stored = await db.prepare('SELECT proof FROM bug_report_feedback_operations WHERE operation_id=?')
      .get<{ proof: unknown }>('owner-local-production')
    expect(stored?.proof).toEqual(local)
    const reconstructed = new BugReportFeedbackService(db, () => 4000)
    const original = (await reconstructed.listInbox('reporter')).messages[0]
    expect(original).toMatchObject({ kind: 'fix_released', release: { firstVerified: { version: 'v0.20.0', verifiedAt: 2000 } } })
    const read = await reconstructed.markRead('reporter', original.id)
    await reconstructed.retryFeedbackOperation('owner-local-production')
    await reconstructed.recordVerifiedDeployment('owner-local-production', local)
    await reconstructed.recordVerifiedDeployment('later-native-proof', { ...proof, observedAt: 2500 })
    expect((await reconstructed.listInbox('reporter')).messages.filter(message => message.kind === 'fix_released')).toEqual([
      { ...read, currentProduction: { ...read.currentProduction, verifiedAt: 2500 } },
    ])
    await expect(reconstructed.recordVerifiedDeployment('owner-local-production', { ...local,
      candidate: { ...local.candidate, ownerLocal: { ...local.candidate.ownerLocal, receiptSha256: '0'.repeat(64) } } }))
      .rejects.toMatchObject({ code: 'feedback_operation_conflict' })
  })

  it('rejects malformed owner-local or mixed proof rather than silently treating it as native evidence', async () => {
    await service.associateFix('admin', fix)
    const local = ownerLocalProof()
    const authorization = local.candidate.ownerLocal
    const invalid = [
      { ...proof, candidate: { ...proof.candidate, ownerLocal: null } },
      { ...proof, candidate: { ...proof.candidate, ownerLocal: undefined } },
      { ...proof, candidate: { ...proof.candidate, ownerLocal: [] } },
      { ...proof, candidate: { ...proof.candidate, ownerLocal: authorization } },
      { ...local, candidate: { ...local.candidate, ownerLocal: { ...authorization, extra: 'ignored authority' } } },
      { ...local, candidate: { ...local.candidate, ownerLocal: { ...authorization, kind: 'github-actions' } } },
      ...[
        { configuration: '0'.repeat(64) }, { producerConfiguration: 'bad' }, { receiptSha256: 'bad' },
        { statusId: 0 }, { releaseId: -1 }, { assetId: '12' }, { ownerId: 0 },
        { url: 'https://github.com/foreign/project/releases/download/v0.20.0/owner-local-verification.json' },
        { url: `https://github.com/${repository}/releases/download/v0.19.0/owner-local-verification.json` },
      ].map(change => ({ ...local, candidate: { ...local.candidate, ownerLocal: { ...authorization, ...change } } })),
      { ...local, candidate: { ...local.candidate, tasks: local.candidate.tasks.slice(1) } },
      { ...local, candidate: { ...local.candidate, tasks: local.candidate.tasks.map((task, index) =>
        index === 1 ? { ...task, id: local.candidate.tasks[0].id } : task) } },
      { ...local, candidate: { ...local.candidate, tasks: local.candidate.tasks.map(task => ({ ...task, runId: 1234, jobId: 4321 })) } },
      { ...local, candidate: { ...local.candidate, tasks: local.candidate.tasks.map(task => ({ ...task, reason: null })) } },
      { ...local, candidate: { ...local.candidate, tasks: local.candidate.tasks.map(task => ({ ...task, url: proof.candidate.tasks[0].url })) } },
      { ...proof, candidate: { ...proof.candidate, tasks: local.candidate.tasks } },
    ]
    for (const [index, value] of invalid.entries()) {
      await expect(service.recordVerifiedDeployment(`invalid-owner-proof-${index}`, value)).rejects.toMatchObject({ code: 'invalid_deployment_proof' })
    }
    expect((await service.listInbox('reporter')).messages.map(message => message.kind)).toEqual(['confirmed_bug'])
    expect((await service.getReport(1465)).fix?.status).toBe('pending_release')
    expect((await service.listFeedbackOperations()).filter(operation => operation.kind === 'deployment')).toEqual([])
  })

  it('persists a verified deployment and one release message independently of triage versions', async () => {
    await service.associateFix('admin', fix)
    const result = await service.recordVerifiedDeployment('deployment-01', proof)
    expect(result).toMatchObject({ operationId: 'deployment-01', kind: 'deployment', status: 'completed', error: null })
    const inbox = await new BugReportFeedbackService(db).listInbox('reporter')
    expect(inbox.messages.map(entry => entry.kind)).toEqual(['fix_released', 'confirmed_bug'])
    expect(inbox.messages[0]).toMatchObject({ reportSummary: 'Discard report 1465', release: {
      rootId: 'report-1465', firstVerified: { version: 'v0.20.0', sha: deployed }, reports: [{ issueNumber: 1465 }] } })
    expect(await service.getReport(1465)).toMatchObject({ version: 1, feedback: [{ kind: 'confirmed_bug' }],
      fix: { status: 'released', firstVerifiedRelease: { version: 'v0.20.0' } } })
    await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'triage-after-release', expectedVersion: 1,
      kind: 'confirmed_bug', reportSummary: 'Discard clarified', explanation: 'The root cause remains confirmed.' })
    expect((await service.getReport(1465)).version).toBe(2)
    expect((await service.listInbox('reporter')).messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
  })
  it('reconciles late fixes and duplicate links against saved production proof', async () => {
    await service.recordVerifiedDeployment('deployment-before-fix', proof)
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['confirmed_bug'])
    await service.associateFix('admin', fix)
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['fix_released', 'confirmed_bug'])
    await report(1466, 'other')
    await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'late-duplicate', expectedVersion: 0 })
    expect((await service.listInbox('other')).messages.map(entry => entry.kind)).toEqual(['fix_released', 'confirmed_bug'])
    await report(1467, 'other')
    await service.associateDuplicate('admin', { issueNumber: 1467, rootIssueNumber: 1465, requestId: 'late-second-duplicate', expectedVersion: 0 })
    const other = await service.listInbox('other')
    expect(other.messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
    expect(other.messages.find(entry => entry.kind === 'fix_released')?.relatedReports).toEqual([
      { submissionId: 'report-1466', issueNumber: 1466 }, { submissionId: 'report-1467', issueNumber: 1467 },
    ])
    expect((await service.getReport(1465)).feedback.map(entry => entry.kind)).toEqual(['confirmed_bug'])
  })

  it('rejects incomplete or mismatched proof without changing any report or inbox', async () => {
    await service.associateFix('admin', fix)
    const invalid = [
      { ...proof, release: { ...proof.release, draft: true } },
      { ...proof, release: { ...proof.release, prerelease: true } },
      { ...proof, release: { ...proof.release, tagSha: merge } },
      { ...proof, candidate: { ...proof.candidate, sha: merge } },
      { ...proof, candidate: { ...proof.candidate, status: 'blocked' } },
      { ...proof, candidate: { ...proof.candidate, tasks: proof.candidate.tasks.slice(0, 1) } },
      { ...proof, frontend: { ...proof.frontend, gameBuildId: merge } },
      { ...proof, backend: { ...proof.backend, running: false } },
      { ...proof, backend: { ...proof.backend, ready: false } },
      { ...proof, backend: { ...proof.backend, gameBuildId: merge } },
      { ...proof, ancestry: { ...proof.ancestry, commits: [commit] } },
    ]
    for (const [index, value] of invalid.entries()) {
      await expect(service.recordVerifiedDeployment(`invalid-proof-${index}`, value)).rejects.toMatchObject({ code: 'invalid_deployment_proof' })
    }
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['confirmed_bug'])
    expect((await service.getReport(1465)).fix?.status).toBe('pending_release')
    expect((await service.listFeedbackOperations()).filter(entry => entry.kind === 'deployment')).toEqual([])
  })

  it('reports missing actual merge commits as awaiting a later deployment rather than a failed notification', async () => {
    await service.associateFix('admin', fix)
    const partial = { ...proof, ancestry: { ...proof.ancestry, commits: [commit, deployed] } }
    const pending = await service.recordVerifiedDeployment('deployment-missing-tip', partial)
    expect(pending).toMatchObject({ status: 'completed', error: null, result: { sentMessages: 0,
      pendingFixes: [{ rootId: 'report-1465', rootIssueNumber: 1465, missingCommits: [merge] }] } })
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['confirmed_bug'])
    expect((await service.getReport(1465)).fix?.status).toBe('pending_release')
  })
  it('waits for current confirmed conclusions even when production evidence already exists', async () => {
    await service.associateFix('admin', fix)
    await report(1466, 'other')
    await service.associateFix('admin', { ...fix, issueNumber: 1466, requestId: 'other-root-fix' })
    await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'needs-info-before-deploy', expectedVersion: 1, kind: 'needs_info',
      reportSummary: 'Discard report', explanation: 'The replay does not identify the occupied action space.', missingItems: ['Name the occupied action space.'] })
    await service.recordFeedback('admin', { issueNumber: 1466, requestId: 'not-bug-before-deploy', expectedVersion: 1, kind: 'not_bug',
      reportSummary: 'Other discard report', explanation: 'The available replay shows an optional discard was declined.' })
    await service.recordVerifiedDeployment('reassessed-deployment', proof)
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['needs_info', 'confirmed_bug'])
    expect((await service.listInbox('other')).messages.map(entry => entry.kind)).toEqual(['not_bug', 'confirmed_bug'])
    await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'confirmed-after-deploy', expectedVersion: 2, kind: 'confirmed_bug',
      reportSummary: 'Confirmed discard', explanation: 'The new replay confirms the missing discard action.' })
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['fix_released', 'confirmed_bug', 'needs_info', 'confirmed_bug'])
    expect((await service.listInbox('other')).messages.filter(entry => entry.kind === 'fix_released')).toEqual([])
    expect((await service.getReport(1465)).version).toBe(3)
  })

  it.each(['native', 'owner-local'] as const)('recovers the original %s operation after an actual PostgreSQL inbox transaction rollback', async kind => {
    const deploymentProof = kind === 'owner-local' ? ownerLocalProof() : proof
    await service.associateFix('admin', fix)
    await db.exec(`CREATE FUNCTION fail_release_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.kind='fix_released' THEN RAISE EXCEPTION 'isolated release failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_release BEFORE INSERT ON bug_report_feedback FOR EACH ROW EXECUTE FUNCTION fail_release_insert()`)
    const failed = await service.recordVerifiedDeployment('recoverable-deployment', deploymentProof)
    expect(failed).toMatchObject({ operationId: 'recoverable-deployment', status: 'pending', error: 'notification_transaction_failed', completedAt: null })
    expect((await service.listInbox('reporter')).messages.map(entry => entry.kind)).toEqual(['confirmed_bug'])
    expect((await service.listFeedbackOperations()).find(entry => entry.operationId === 'recoverable-deployment')).toEqual(failed)
    await db.exec('DROP TRIGGER fail_release ON bug_report_feedback')
    const reconstructed = new BugReportFeedbackService(db, () => 4000)
    expect(await reconstructed.retryFeedbackOperation('recoverable-deployment')).toMatchObject({ status: 'completed', result: { sentMessages: 1, pendingFixes: [] } })
    const message = (await reconstructed.listInbox('reporter')).messages[0]
    expect(message.kind).toBe('fix_released')
    const read = await reconstructed.markRead('reporter', message.id)
    await reconstructed.retryFeedbackOperation('recoverable-deployment')
    await reconstructed.recordVerifiedDeployment('recoverable-deployment', deploymentProof)
    expect((await reconstructed.listInbox('reporter')).messages.filter(entry => entry.kind === 'fix_released')).toEqual([read])
    await expect(reconstructed.recordVerifiedDeployment('recoverable-deployment', { ...deploymentProof, observedAt: 2001 }))
      .rejects.toMatchObject({ code: 'feedback_operation_conflict' })
  })

  it('uses one delivery per account and independent root across two database-backed service instances', async () => {
    await report(1466, 'reporter')
    await report(1467, 'other')
    await report(1468, 'reporter')
    await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'parallel-duplicate-one', expectedVersion: 0 })
    await service.associateDuplicate('admin', { issueNumber: 1467, rootIssueNumber: 1465, requestId: 'parallel-duplicate-two', expectedVersion: 0 })
    await service.associateFix('admin', fix)
    await service.associateFix('admin', { ...fix, issueNumber: 1468, requestId: 'parallel-independent' })
    const schema = (await db.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0].schema
    const second = new PostgresDatabase({ connectionString: getTestDatabaseUrl(), schema, max: 2 })
    try {
      const other = new BugReportFeedbackService(second, () => 3100)
      const results = await Promise.all([
        service.recordVerifiedDeployment('parallel-production', proof), other.recordVerifiedDeployment('parallel-production', proof),
        other.recordVerifiedDeployment('parallel-same-release', proof),
      ])
      expect(results.every(result => result.status === 'completed')).toBe(true)
      const inbox = await other.listInbox('reporter')
      expect(inbox.messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(2)
      expect((await other.listInbox('other')).messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
      expect(inbox.messages.filter(entry => entry.kind === 'fix_released').map(entry => entry.relatedReports?.map(report => report.issueNumber)))
        .toEqual([[1468], [1465, 1466]])
      const firstPage = await other.listInbox('reporter', { limit: 2 })
      const nextPage = await other.listInbox('reporter', { before: firstPage.nextCursor ?? undefined, limit: 2 })
      expect(new Set([...firstPage.messages, ...nextPage.messages].map(entry => entry.id)).size).toBe(4)
      expect(firstPage.messages.every(entry => !nextPage.messages.some(next => next.id === entry.id))).toBe(true)
    } finally { await second.close() }
  })

  it('preserves the first message while exposing later verified production versions', async () => {
    await service.associateFix('admin', fix)
    await service.recordVerifiedDeployment('first-production', proof)
    const first = (await service.listInbox('reporter')).messages[0]
    const read = await service.markRead('reporter', first.id)
    const newerSha = 'e'.repeat(40)
    const newer = { ...proof, observedAt: 2500,
      release: { ...proof.release, version: 'v0.21.0', url: `https://github.com/${repository}/releases/tag/v0.21.0`, sha: newerSha, tagSha: newerSha, publishedAt: 2400 },
      candidate: { ...proof.candidate, sha: newerSha }, frontend: { ...proof.frontend, gameBuildId: newerSha },
      backend: { ...proof.backend, gameBuildId: newerSha }, ancestry: { ...proof.ancestry, commits: [...proof.ancestry.commits, newerSha] } }
    await service.recordVerifiedDeployment('later-production', newer)
    const inbox = await service.listInbox('reporter')
    expect(inbox.messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
    expect(inbox.messages[0]).toMatchObject({ id: first.id, readAt: read.readAt, createdAt: first.createdAt,
      release: { firstVerified: { version: 'v0.20.0', sha: deployed } }, currentProduction: { version: 'v0.21.0', sha: newerSha } })
    expect((await service.getReport(1465)).fix).toMatchObject({ firstVerifiedRelease: { version: 'v0.20.0' }, currentProductionRelease: { version: 'v0.21.0' } })
  })

  it('clears current production after a verified rollback without rewriting the first release or read state', async () => {
    await service.associateFix('admin', fix)
    await service.recordVerifiedDeployment('before-rollback', proof)
    const original = (await service.listInbox('reporter')).messages[0]
    const read = await service.markRead('reporter', original.id)
    const rollbackSha = 'f'.repeat(40)
    await service.recordVerifiedDeployment('verified-rollback', { ...proof, observedAt: 2500,
      release: { ...proof.release, version: 'v0.19.0', url: `https://github.com/${repository}/releases/tag/v0.19.0`,
        sha: rollbackSha, tagSha: rollbackSha, publishedAt: 1000 },
      candidate: { ...proof.candidate, sha: rollbackSha }, frontend: { ...proof.frontend, gameBuildId: rollbackSha },
      backend: { ...proof.backend, gameBuildId: rollbackSha }, ancestry: { ...proof.ancestry, commits: [rollbackSha] } })
    const rolledBack = await service.getMessage('reporter', original.id)
    expect(rolledBack).toMatchObject({ id: read.id, readAt: read.readAt, createdAt: read.createdAt,
      release: { firstVerified: { version: 'v0.20.0', sha: deployed } } })
    expect(rolledBack.currentProduction).toBeUndefined()
    expect((await service.listInbox('reporter')).messages[0].currentProduction).toBeUndefined()
    const report = await service.getReport(1465)
    expect(report.fix).toMatchObject({ status: 'pending_release', firstVerifiedRelease: { version: 'v0.20.0' } })
    expect(report.fix?.currentProductionRelease).toBeUndefined()
    await service.recordVerifiedDeployment('restored-production', { ...proof, observedAt: 2800 })
    const restored = (await service.listInbox('reporter')).messages.filter(entry => entry.kind === 'fix_released')
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ id: read.id, readAt: read.readAt, currentProduction: { version: 'v0.20.0' } })
    expect((await service.getReport(1465)).fix?.status).toBe('released')
  })

  it.each(['native', 'owner-local'] as const)('never reconstructs a deleting or anonymized root reporter with %s proof while confirmed duplicates remain deliverable', async kind => {
    const deploymentProof = kind === 'owner-local' ? ownerLocalProof() : proof
    await report(1466, 'other')
    await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'root-deletion-duplicate', expectedVersion: 0 })
    await service.associateFix('admin', fix)
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    await requestAccountDeletion('reporter')
    expect((await service.recordVerifiedDeployment('deletion-production', deploymentProof)).status).toBe('completed')
    expect((await service.listInbox('reporter')).messages).toEqual([])
    expect((await service.listInbox('other')).messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
    await new BugReportStore(db, new TokenCipher('test', new Map([['test', Buffer.alloc(32, 1)]]))).anonymizeReporter('reporter')
    await service.recordVerifiedDeployment('deletion-replay-production', deploymentProof)
    await service.retryFeedbackOperation('deletion-production')
    expect((await service.listInbox('reporter')).messages).toEqual([])
    expect((await service.getReport(1465)).feedback).toEqual([])
    expect((await service.getReport(1466)).fix?.status).toBe('released')
    await requestAccountDeletion('other')
    await service.recordVerifiedDeployment('all-deleted-replay', deploymentProof)
    expect((await service.listInbox('other')).messages).toEqual([])
  })

  it('retains a failed late-association intent independently from its completed deployment', async () => {
    await service.recordVerifiedDeployment('already-complete-deployment', proof)
    await db.exec(`CREATE FUNCTION fail_late_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.kind='fix_released' THEN RAISE EXCEPTION 'isolated late failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_late_release BEFORE INSERT ON bug_report_feedback FOR EACH ROW EXECUTE FUNCTION fail_late_release()`)
    await service.associateFix('admin', fix)
    const operations = await service.listFeedbackOperations()
    expect(operations.find(entry => entry.operationId === 'already-complete-deployment')?.status).toBe('completed')
    const pending = operations.find(entry => entry.kind === 'reconcile' && entry.status === 'pending')
    expect(pending).toMatchObject({ error: 'notification_transaction_failed' })
    if (!pending) throw new Error('Missing durable late-association intent')
    await db.exec('DROP TRIGGER fail_late_release ON bug_report_feedback')
    expect((await new BugReportFeedbackService(db).retryFeedbackOperation(pending.operationId)).status).toBe('completed')
    expect((await service.listInbox('reporter')).messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
    await service.associateFix('admin', fix)
    expect((await service.listFeedbackOperations()).map(entry => entry.operationId)).toEqual(operations.map(entry => entry.operationId))
  })

  it('previews saved proof membership without writes and exposes one explicit idempotent reconcile entry', async () => {
    await service.recordVerifiedDeployment('preview-deployment', proof)
    const before = await service.listFeedbackOperations()
    const plan = await service.previewFixDeployment([{ number: 1500, url: pull.html_url, mergeCommit: merge, requiredCommits: [commit] }])
    expect(plan.requiredCommits).toEqual([commit, merge])
    expect(plan.firstVerified?.operationId).toBe('preview-deployment')
    expect(plan.currentProduction?.operationId).toBe('preview-deployment')
    expect(plan.missingCommits).toEqual([])
    expect(await service.listFeedbackOperations()).toEqual(before)
    const first = await service.reconcileVerifiedFixes('explicit-reconcile')
    expect(first).toMatchObject({ kind: 'reconcile', status: 'completed', result: { sentMessages: 0, pendingFixes: [] } })
    expect(await new BugReportFeedbackService(db).reconcileVerifiedFixes('explicit-reconcile')).toEqual(first)
  })

  it('waits for account deletion before resolving concurrent release delivery', async () => {
    await report(1466, 'other')
    await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'concurrent-delete-duplicate', expectedVersion: 0 })
    await service.associateFix('admin', fix)
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    let release = () => {}, locked = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const acquired = new Promise<void>(resolve => { locked = resolve })
    const deletion = db.transaction(async () => {
      await db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get('reporter')
      locked(); await gate
      await requestAccountDeletion('reporter')
    })()
    await acquired
    const notification = service.recordVerifiedDeployment('deletion-race-production', proof)
    release(); await deletion
    expect((await notification).status).toBe('completed')
    expect((await service.listInbox('reporter')).messages).toEqual([])
    expect((await service.listInbox('other')).messages.filter(entry => entry.kind === 'fix_released')).toHaveLength(1)
  })

})

it('snapshots the concrete root fix summary for every reporter and preserves sent text on revision', async () => {
  const summary = 'Adds an explicit discard action for supply goods without advancing the current turn.'
  await report(1466, 'other')
  await service.associateDuplicate('admin', { issueNumber:1466,rootIssueNumber:1465,requestId:'summary-duplicate',expectedVersion:0 })
  await service.associateFix('admin', { ...fix,fixSummary:summary })
  await service.recordVerifiedDeployment('summary-production',proof)
  const rootMessage = (await service.listInbox('reporter')).messages.find(message => message.kind === 'fix_released')
  const duplicateMessage = (await service.listInbox('other')).messages.find(message => message.kind === 'fix_released')
  expect(rootMessage).toMatchObject({ explanation:summary,reportSummary:'Discard report 1465' })
  expect(duplicateMessage).toMatchObject({ explanation:summary,reportSummary:'Discard report 1466' })
  if (!rootMessage) throw new Error('Missing release message')
  const read = await service.markRead('reporter',rootMessage.id)
  await service.associateFix('admin', { ...fix,requestId:'summary-revision',expectedVersion:1,fixSummary:'Adds supply-goods discarding with explicit quantities and preserves action availability.' })
  expect((await service.getReport(1465)).fix).toMatchObject({ version:2,fixSummary:'Adds supply-goods discarding with explicit quantities and preserves action availability.' })
  expect(await service.getMessage('reporter',rootMessage.id)).toEqual(read)
  expect((await service.listInbox('other')).messages.filter(message => message.kind === 'fix_released')).toHaveLength(1)
})

it('requires a specific reviewed fix summary and leaves old roots pending until supplied', async () => {
  for (const fixSummary of [undefined,'','  ','fixed',' Fixed! ','已 修复！','修复摘要']) {
    await expect(service.associateFix('admin',{ ...fix,fixSummary })).rejects.toMatchObject({ code:'invalid_fix_association' })
  }
  await service.associateFix('admin',fix)
  await db.prepare("UPDATE bug_report_fix_roots SET fix_summary=NULL WHERE root_id='report-1465'").run()
  const pending = await service.recordVerifiedDeployment('legacy-root-production',proof)
  expect(pending).toMatchObject({ status:'completed',result:{ sentMessages:0,pendingFixes:[{ rootId:'report-1465',reason:'missing_fix_summary' }] } })
  expect((await service.listInbox('reporter')).messages.map(message => message.kind)).toEqual(['confirmed_bug'])
  await service.associateFix('admin',{ ...fix,requestId:'reviewed-legacy-summary',expectedVersion:1,fixSummary:'Adds a supply-goods discard action while preserving the current turn.' })
  expect((await service.listInbox('reporter')).messages[0]).toMatchObject({ kind:'fix_released',explanation:'Adds a supply-goods discard action while preserving the current turn.' })
})
it('does not rewrite a legacy release without a summary when the root gains reviewed text', async () => {
  await service.associateFix('admin',fix)
  await service.recordVerifiedDeployment('legacy-message-production',proof)
  await db.prepare("UPDATE bug_report_feedback SET explanation='' WHERE kind='fix_released'").run()
  const original = (await service.listInbox('reporter')).messages[0]
  const read = await service.markRead('reporter',original.id)
  await service.associateFix('admin',{ ...fix,requestId:'legacy-message-summary-revision',expectedVersion:1,fixSummary:'Adds resource discarding with explicit quantities and retains the active turn.' })
  expect(await service.getMessage('reporter',original.id)).toEqual(read)
  expect((await service.listInbox('reporter')).messages.filter(message => message.kind === 'fix_released')).toHaveLength(1)
})
