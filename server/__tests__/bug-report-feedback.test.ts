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
})
