import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as database from '../db'
import { requestAccountDeletion } from '../auth'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { GitHubFixVerifier } from '../bug-report/github-fix-verifier'

let db: PostgresDatabase
let service: BugReportFeedbackService
const firstCommit = 'a'.repeat(40), secondCommit = 'b'.repeat(40)
const repository = 'titanxxh/open-agricola'
const mergedPull = { number: 1500, merged: true, merged_at: '2026-11-01T00:00:00Z', merge_commit_sha: secondCommit,
  html_url: `https://github.com/${repository}/pull/1500`, base: { ref: 'main', repo: { full_name: repository } } }
const github: typeof fetch = async resource => {
  const path = new URL(String(resource)).pathname
  if (path.endsWith('/pulls/1500')) return Response.json(mergedPull)
  if (path.endsWith('/pulls')) return Response.json([mergedPull])
  if (path.includes('/compare/')) return Response.json({ status: 'ahead', merge_base_commit: { sha: firstCommit } })
  return Response.json({ sha: path.split('/').at(-1) })
}
const fixInput = { issueNumber: 1465, requestId: 'fix-request-01', expectedVersion: 0, purpose: 'fix',
  pullRequests: [{ number: 1500, requiredCommits: [firstCommit, secondCommit] }] }

beforeEach(async () => {
  db = await createTestDatabase()
  service = new BugReportFeedbackService(db, () => 1000, new GitHubFixVerifier(github))
  for (const id of ['reporter', 'other', 'admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES('report','reporter','room',0,'active',1,0,?,'submitted',1465,1,1)`).run('a'.repeat(64))
  await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'confirmation-01', expectedVersion: 0, kind: 'confirmed_bug',
    reportSummary: 'Cannot discard resources', explanation: 'Confirmed missing discard action.' })
})
afterEach(async () => { vi.restoreAllMocks(); await db?.close() })

async function addReport(issue: number, recipient = 'other') {
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES(?,?,'room',0,'active',1,0,?,'submitted',?,1,1)`)
    .run(`report-${issue}`, recipient, 'a'.repeat(64), issue)
  await service.recordFeedback('admin', { issueNumber: issue, requestId: `confirm-${issue}`, expectedVersion: 0, kind: 'confirmed_bug',
    reportSummary: `Report ${issue}`, explanation: 'Confirmed independently.' })
}


describe('Bug Report fix links', () => {
  it('persists a stable root and the complete verified merged commit set without announcing a release', async () => {
    const associated = await service.associateFix('admin', fixInput)
    expect(associated.fix).toEqual({ rootId: 'report', rootIssueNumber: 1465, version: 1, associationVersion: 0,
      status: 'pending_release', reports: [{ issueNumber: 1465, submissionId: 'report' }],
      pullRequests: [{ number: 1500, url: `https://github.com/${repository}/pull/1500`, mergeCommit: secondCommit,
        requiredCommits: [firstCommit, secondCommit] }], requiredCommits: [firstCommit, secondCommit] })
    expect((await new BugReportFeedbackService(db).getReport(1465)).fix).toEqual(associated.fix)
    expect((await service.listInbox('reporter')).messages).toHaveLength(1)
    expect((await service.getReport(1465)).version).toBe(1)
  })
  it('groups only explicit duplicates and keeps other reports and conclusions separate', async () => {
    await addReport(1466)
    await addReport(1467, 'reporter')
    await addReport(1468, 'reporter')
    const linked = await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465,
      requestId: 'duplicate-1466', expectedVersion: 0 })
    await service.associateDuplicate('admin', { issueNumber: 1467, rootIssueNumber: 1465,
      requestId: 'duplicate-1467', expectedVersion: 0 })
    expect(linked.fix).toMatchObject({ rootId: 'report', rootIssueNumber: 1465, version: 0, associationVersion: 1, status: 'unlinked' })
    await service.associateFix('admin', fixInput)
    expect((await service.getReport(1466)).fix).toMatchObject({ rootId: 'report', requiredCommits: [firstCommit, secondCommit],
      reports: [{ issueNumber: 1465 }, { issueNumber: 1466 }, { issueNumber: 1467 }] })
    expect((await service.getReport(1468)).fix).toBeUndefined()
    expect((await service.getReport(1466)).feedback).toMatchObject([{ reportSummary: 'Report 1466', explanation: 'Confirmed independently.' }])
    expect((await service.listInbox('reporter')).messages).toHaveLength(3)
    expect((await service.listInbox('other')).messages).toHaveLength(1)
  })

  it('fences concurrent edits and retries without repeating external evidence reads', async () => {
    const other = new BugReportFeedbackService(db, () => 1001, new GitHubFixVerifier(github))
    const outcomes = await Promise.all([service.associateFix('admin', fixInput), other.associateFix('admin', fixInput)])
    expect(outcomes[0].fix).toEqual(outcomes[1].fix)
    const offline: typeof fetch = async () => { throw new Error('offline') }
    expect((await new BugReportFeedbackService(db, Date.now, new GitHubFixVerifier(offline)).associateFix('admin', fixInput)).fix?.version).toBe(1)
    await expect(other.associateFix('admin', { ...fixInput, requestId: 'changed-content', pullRequests: [{ number: 1500, requiredCommits: [secondCommit] }] }))
      .rejects.toMatchObject({ code: 'fix_version_conflict' })
    await expect(other.associateFix('admin', { ...fixInput, pullRequests: [{ number: 1500, requiredCommits: [secondCommit] }] }))
      .rejects.toMatchObject({ code: 'fix_request_conflict' })
    expect((await service.getReport(1465)).fix?.version).toBe(1)
  })

  it('rejects unmerged, foreign, missing and divergent original-head evidence without changing the fix', async () => {
    const cases: Array<typeof fetch> = [
      async () => Response.json({ ...mergedPull, merged: false }),
      async () => Response.json({ ...mergedPull, base: { ref: 'main', repo: { full_name: 'foreign/project' } } }),
      async () => new Response('rate limited', { status: 429 }),
      async resource => new URL(String(resource)).pathname.includes('/compare/')
        ? Response.json({ status: 'diverged', merge_base_commit: { sha: 'c'.repeat(40) } }) : github(resource),
      async resource => new URL(String(resource)).pathname.endsWith('/pulls') ? Response.json([]) : github(resource),
    ]
    for (const external of cases) {
      await expect(new BugReportFeedbackService(db, Date.now, new GitHubFixVerifier(external)).associateFix('admin', fixInput))
        .rejects.toMatchObject({ status: 503 })
      expect((await service.getReport(1465)).fix).toBeUndefined()
    }
    for (const input of [{ ...fixInput, purpose: 'related' }, { ...fixInput, purpose: 'diagnostics' }, { ...fixInput, merged: true },
      { ...fixInput, pullRequests: [{ number: 1500, requiredCommits: ['main'] }] }]) {
      await expect(service.associateFix('admin', input)).rejects.toMatchObject({ code: 'invalid_fix_association' })
    }
    expect((await service.listInbox('reporter')).messages).toHaveLength(1)
  })

  it('rejects cycles and moving a root with dependent reports, and versions duplicate edits', async () => {
    await addReport(1466)
    await addReport(1467)
    const duplicate = { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'duplicate-cycle', expectedVersion: 0 }
    const [first, retry] = await Promise.all([service.associateDuplicate('admin', duplicate), service.associateDuplicate('admin', duplicate)])
    expect(first.fix).toEqual(retry.fix)
    await expect(service.associateDuplicate('admin', { issueNumber: 1465, rootIssueNumber: 1466, requestId: 'cycle-request', expectedVersion: 0 }))
      .rejects.toMatchObject({ code: 'fix_requires_root' })
    await expect(service.associateDuplicate('admin', { issueNumber: 1465, rootIssueNumber: 1467, requestId: 'move-root-request', expectedVersion: 0 }))
      .rejects.toMatchObject({ code: 'fix_root_in_use' })
    await expect(service.associateDuplicate('admin', { ...duplicate, requestId: 'stale-duplicate', rootIssueNumber: 1467 }))
      .rejects.toMatchObject({ code: 'fix_version_conflict' })
    await expect(service.associateDuplicate('admin', { ...duplicate, rootIssueNumber: 1466 })).rejects.toMatchObject({ code: 'invalid_fix_association' })
    await expect(service.associateDuplicate('admin', { ...duplicate, requestId: 'missing-duplicate', rootIssueNumber: 9999 }))
      .rejects.toMatchObject({ code: 'feedback_report_not_found' })
  })

  it('keeps a deleted root identity usable for live duplicates without restoring its recipient', async () => {
    await addReport(1466)
    await service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465, requestId: 'deletion-root', expectedVersion: 0 })
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    await requestAccountDeletion('reporter')
    expect((await service.getReport(1465)).feedback).toEqual([])
    expect((await service.associateFix('admin', fixInput)).fix).toMatchObject({ rootId: 'report', version: 1, status: 'pending_release' })
    expect((await service.getReport(1466)).fix?.requiredCommits).toEqual([firstCommit, secondCommit])
    expect((await service.listInbox('reporter')).messages).toEqual([])
    expect((await service.listInbox('other')).messages).toHaveLength(1)
    await requestAccountDeletion('other')
    await expect(service.associateFix('admin', fixInput)).rejects.toMatchObject({ code: 'reporter_unavailable' })
  })

  it('waits for account deletion and refuses associations for its deleted recipient', async () => {
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
    const association = service.associateFix('admin', fixInput).then(() => 'saved', error => error instanceof Error && 'code' in error ? error.code : 'unexpected')
    release(); await deletion
    expect(await association).toBe('reporter_unavailable')
    expect((await service.getReport(1465)).fix).toBeUndefined()
    expect((await service.listInbox('reporter')).messages).toEqual([])
  })

  it('retains every required commit across multiple PRs and allows only one competing revision', async () => {
    const thirdCommit = 'c'.repeat(40)
    const anotherPull = { ...mergedPull, number: 1501, merge_commit_sha: thirdCommit, html_url: `https://github.com/${repository}/pull/1501` }
    const multiple: typeof fetch = async resource => {
      const path = new URL(String(resource)).pathname
      if (path.endsWith('/pulls/1501')) return Response.json(anotherPull)
      if (path === `/repos/${repository}/commits/${thirdCommit}/pulls`) return Response.json([anotherPull])
      return github(resource)
    }
    const authority = new BugReportFeedbackService(db, Date.now, new GitHubFixVerifier(multiple))
    const result = await authority.associateFix('admin', { ...fixInput, pullRequests: [...fixInput.pullRequests, { number: 1501, requiredCommits: [thirdCommit] }] })
    expect(result.fix?.requiredCommits).toEqual([firstCommit, secondCommit, thirdCommit])
    expect(result.fix?.pullRequests.map(pr => pr.number)).toEqual([1500, 1501])
    const updates = await Promise.allSettled([
      authority.associateFix('admin', { ...fixInput, requestId: 'competing-first', expectedVersion: 1 }),
      authority.associateFix('admin', { ...fixInput, requestId: 'competing-second', expectedVersion: 1 }),
    ])
    expect(updates.filter(update => update.status === 'fulfilled')).toHaveLength(1)
    expect(updates.filter(update => update.status === 'rejected').map(update => update.status === 'rejected' ? update.reason.code : '')).toEqual(['fix_version_conflict'])
    expect((await service.getReport(1465)).fix?.version).toBe(2)
  })

  it('uses the current conclusion when a report was reassessed before fix association', async () => {
    await addReport(1466)
    await service.recordFeedback('admin', { issueNumber: 1465, requestId: 'reassess-not-bug', expectedVersion: 1, kind: 'not_bug',
      reportSummary: 'Discard action', explanation: 'Discarding is optional and this report describes the normal rule.' })
    await expect(service.associateFix('admin', fixInput)).rejects.toMatchObject({ code: 'fix_requires_confirmed_bug' })
    await expect(service.associateDuplicate('admin', { issueNumber: 1466, rootIssueNumber: 1465,
      requestId: 'duplicate-reassessed', expectedVersion: 0 })).rejects.toMatchObject({ code: 'fix_requires_confirmed_bug' })
    expect((await service.getReport(1465)).fix).toBeUndefined()
    expect((await service.getReport(1465)).feedback.map(entry => entry.kind)).toEqual(['confirmed_bug', 'not_bug'])
    expect((await service.getReport(1466)).feedback.map(entry => entry.kind)).toEqual(['confirmed_bug'])
  })

})
