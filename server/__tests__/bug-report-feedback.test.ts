import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as database from '../db'
import { requestAccountDeletion } from '../auth'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'

let db: PostgresDatabase
let service: BugReportFeedbackService
beforeEach(async () => {
  db = await createTestDatabase()
  service = new BugReportFeedbackService(db, () => 1000)
  for (const id of ['reporter', 'other', 'admin']) {
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  }
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,github_issue_url,author_identity,created_at,updated_at)
    VALUES('report','reporter','room',0,'active',1,0,?,'submitted',1465,?,'hosted',1,1)`)
    .run('a'.repeat(64), 'https://github.com/titanxxh/open-agricola/issues/1465')
})
afterEach(async () => { vi.restoreAllMocks(); await db?.close() })

const confirmation = {
  issueNumber: 1465,
  requestId: 'confirm-request',
  expectedVersion: 0,
  kind: 'confirmed_bug',
  reportSummary: 'Cannot discard resources',
  explanation: 'We confirmed the missing discard action.',
}

describe('Bug Report feedback', () => {
  it('delivers a confirmed bug to the site reporter and preserves read state across service instances', async () => {
    const recorded = await service.recordFeedback('admin', confirmation)
    const page = await service.listInbox('reporter')
    expect(page).toEqual({ messages: [{ ...recorded, readAt: null }], unreadCount: 1, nextCursor: null })
    expect(recorded).toMatchObject({ issueNumber: 1465, reportSummary: 'Cannot discard resources',
      explanation: 'We confirmed the missing discard action.', kind: 'confirmed_bug', version: 1, createdAt: 1000 })
    expect(await service.listInbox('other')).toEqual({ messages: [], unreadCount: 0, nextCursor: null })
    await expect(service.getMessage('other', recorded.id)).rejects.toMatchObject({ code: 'feedback_not_found' })
    await service.markRead('reporter', recorded.id)
    await service.markRead('reporter', recorded.id)
    const restored = new BugReportFeedbackService(db)
    expect(await restored.getMessage('reporter', recorded.id)).toEqual({ ...recorded, readAt: 1000 })
    expect((await restored.listInbox('reporter')).unreadCount).toBe(0)
    expect(await restored.getReport(1465)).toEqual({ submissionId: 'report', issueNumber: 1465,
      issueUrl: 'https://github.com/titanxxh/open-agricola/issues/1465', version: 1, feedback: [recorded] })
  })

  it('delivers concrete missing information as a pending assessment, then preserves it when a maintainer confirms a bug', async () => {
    const needsInfo = await service.recordFeedback('admin', { ...confirmation, requestId: 'needs-info-request', kind: 'needs_info',
      explanation: 'Please add these details on the original issue so we can assess the disconnection.',
      missingItems: ['The action immediately before the disconnect', 'Browser, device and whether the whole page reloaded'] })
    expect(await service.getMessage('reporter', needsInfo.id)).toEqual({ ...needsInfo, readAt: null })
    expect(needsInfo).toMatchObject({ kind: 'needs_info', version: 1,
      missingItems: ['The action immediately before the disconnect', 'Browser, device and whether the whole page reloaded'],
      issueUrl: 'https://github.com/titanxxh/open-agricola/issues/1465' })
    await service.markRead('reporter', needsInfo.id)
    const confirmed = await service.recordFeedback('admin', { ...confirmation, requestId: 'reassess-request', expectedVersion: 1 })
    expect((await service.getReport(1465)).feedback).toEqual([needsInfo, confirmed])
    expect(await service.listInbox('reporter')).toEqual({ messages: [{ ...confirmed, readAt: null }, { ...needsInfo, readAt: 1000 }],
      unreadCount: 1, nextCursor: null })
  })

  it('supports needs-info to non-bug and later correction without replacing prior explanations or read state', async () => {
    const first = await service.recordFeedback('admin', { ...confirmation, requestId: 'need-screenshot', kind: 'needs_info',
      explanation: 'Please add a screenshot of the feeding calculation.', missingItems: ['The feeding calculation screenshot'] })
    await service.markRead('reporter', first.id)
    const normal = await service.recordFeedback('admin', { ...confirmation, requestId: 'normal-feeding', expectedVersion: 1, kind: 'not_bug',
      explanation: 'In a solo game, each adult requires three food during feeding.' })
    expect(normal).toMatchObject({ kind: 'not_bug', version: 2,
      explanation: 'In a solo game, each adult requires three food during feeding.' })
    const corrected = await service.recordFeedback('admin', { ...confirmation, requestId: 'correct-feeding', expectedVersion: 2,
      explanation: 'Reassessment confirmed that the displayed calculation omitted the paid food.' })
    expect((await service.getReport(1465)).feedback).toEqual([first, normal, corrected])
    expect((await service.listInbox('reporter')).messages).toEqual([
      { ...corrected, readAt: null }, { ...normal, readAt: null }, { ...first, readAt: 1000 }])
  })

  it('fences concurrent needs-info retries and keeps independent reports from the same account and Anchor separate', async () => {
    await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
      status,github_issue_number,author_identity,created_at,updated_at)
      SELECT 'independent',reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
      status,1466,'github_user',created_at,updated_at FROM bug_reports WHERE submission_id='report'`).run()
    const input = { ...confirmation, kind: 'needs_info', explanation: 'Please add the action and a screenshot on the original issue.',
      missingItems: ['The action immediately before the disconnect', 'A screenshot of the error'] }
    const [first, retry] = await Promise.all([service.recordFeedback('admin', input), new BugReportFeedbackService(db).recordFeedback('admin', input)])
    expect(retry).toEqual(first)
    await expect(service.recordFeedback('admin', { ...input, missingItems: ['Different missing details'] }))
      .rejects.toMatchObject({ code: 'feedback_request_conflict', status: 409 })
    const separate = await service.recordFeedback('admin', { ...input, issueNumber: 1466 })
    expect(separate).toMatchObject({ submissionId: 'independent', issueNumber: 1466, version: 1 })
    await expect(service.recordFeedback('admin', { ...confirmation, requestId: 'outdated-reassessment' }))
      .rejects.toMatchObject({ code: 'feedback_version_conflict', status: 409 })
    const confirmed = await service.recordFeedback('admin', { ...confirmation, requestId: 'new-assessment', expectedVersion: 1 })
    expect(await service.recordFeedback('admin', input)).toEqual(first)
    expect((await service.getReport(1466)).feedback).toEqual([separate])
    expect((await service.listInbox('reporter')).messages).toEqual([
      { ...confirmed, readAt: null }, { ...separate, readAt: null }, { ...first, readAt: null }])
  })

  it('removes inbox content when account deletion starts and refuses later delivery', async () => {
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    const recorded = await service.recordFeedback('admin', confirmation)
    await requestAccountDeletion('reporter')
    expect(await service.listInbox('reporter')).toEqual({ messages: [], unreadCount: 0, nextCursor: null })
    await expect(service.getMessage('reporter', recorded.id)).rejects.toMatchObject({ code: 'feedback_not_found' })
    await expect(service.recordFeedback('admin', confirmation)).rejects.toMatchObject({ code: 'reporter_unavailable' })
    expect((await service.getReport(1465)).feedback).toEqual([])
  })

  it('deduplicates concurrent retries before checking the current version but rejects changed requests', async () => {
    const other = new BugReportFeedbackService(db, () => 1001)
    const [first, same] = await Promise.all([service.recordFeedback('admin', confirmation), other.recordFeedback('admin', confirmation)])
    expect(same).toEqual(first)
    await other.recordFeedback('admin', { ...confirmation, requestId: 'revised-request', expectedVersion: 1, explanation: 'The missing action is accepted for repair.' })
    expect(await service.recordFeedback('admin', confirmation)).toEqual(first)
    await expect(service.recordFeedback('admin', { ...confirmation, explanation: 'Different content' }))
      .rejects.toMatchObject({ code: 'feedback_request_conflict' })
    await expect(service.recordFeedback('admin', { ...confirmation, expectedVersion: 2 }))
      .rejects.toMatchObject({ code: 'feedback_request_conflict' })
    expect((await service.listInbox('reporter')).unreadCount).toBe(2)
  })

  it('rolls back feedback and its inbox entry together, then permits the same request to recover', async () => {
    await expect(db.transaction(async () => {
      await service.recordFeedback('admin', confirmation)
      throw new Error('caller transaction failed')
    })()).rejects.toThrow('caller transaction failed')
    expect((await service.getReport(1465)).feedback).toEqual([])
    expect(await service.listInbox('reporter')).toEqual({ messages: [], unreadCount: 0, nextCursor: null })
    expect(await service.recordFeedback('admin', confirmation)).toMatchObject({ version: 1 })
    expect((await service.listInbox('reporter')).unreadCount).toBe(1)
  })

  it('paginates equal-time messages in stable event order without consuming unread messages', async () => {
    const first = await service.recordFeedback('admin', confirmation)
    const second = await service.recordFeedback('admin', { ...confirmation, requestId: 'second-request', expectedVersion: 1, explanation: 'Second assessment.' })
    const third = await service.recordFeedback('admin', { ...confirmation, requestId: 'third-request', expectedVersion: 2, explanation: 'Third assessment.' })
    const page = await service.listInbox('reporter', { limit: 1 })
    expect(page).toEqual({ messages: [{ ...third, readAt: null }], unreadCount: 3, nextCursor: third.id })
    expect(await service.listInbox('reporter', { before: third.id, limit: 1 }))
      .toEqual({ messages: [{ ...second, readAt: null }], unreadCount: 3, nextCursor: second.id })
    expect(await service.listInbox('reporter', { before: second.id, limit: 1 }))
      .toEqual({ messages: [{ ...first, readAt: null }], unreadCount: 3, nextCursor: null })
  })

  it('coordinates delivery with the user lock held by account deletion', async () => {
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    let release = () => {}
    let locked = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const acquired = new Promise<void>(resolve => { locked = resolve })
    const deletion = db.transaction(async () => {
      await db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get('reporter')
      locked()
      await gate
      await requestAccountDeletion('reporter')
    })()
    await acquired
    const delivery = new BugReportFeedbackService(db).recordFeedback('admin', confirmation)
    const outcome = delivery.then(() => 'delivered', error => error instanceof Error && 'code' in error ? error.code : 'unexpected')
    release()
    await deletion
    expect(await outcome).toBe('reporter_unavailable')
    expect((await service.getReport(1465)).feedback).toEqual([])
    expect((await service.listInbox('reporter')).unreadCount).toBe(0)
  })
})
