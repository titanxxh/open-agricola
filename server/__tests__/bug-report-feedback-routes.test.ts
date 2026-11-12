import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { createBugReportFeedbackHandler } from '../bug-report-feedback-routes'
import { handleBugReportRoute } from '../bug-report-routes'
import { BugReportStore, TokenCipher } from '../bug-report/bug-report-store'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
let url: string
let store: BugReportStore
beforeEach(async () => {
  const db = await createTestDatabase()
  store = new BugReportStore(db, new TokenCipher('test', new Map([['test', Buffer.alloc(32, 7)]])))
  vi.stubEnv('BUG_REPORT_GITHUB_WEBHOOK_SECRET', 'feedback-webhook-secret')
  cleanups.push(() => db.close())
  for (const id of ['reporter', 'other', 'admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES('report','reporter','room',0,'active',1,0,?,'submitted',1465,1,1)`).run('a'.repeat(64))
  const authenticate = async (req: import('node:http').IncomingMessage) => {
    const role = req.headers['x-fixture-role']
    return typeof role === 'string' && ['admin', 'reporter', 'other'].includes(role) ? { id: role, username: role, displayName: role } : null
  }
  const handler = createBugReportFeedbackHandler({ service: new BugReportFeedbackService(db), authenticate,
    requireAdmin: async (req, res) => {
      const user = await authenticate(req)
      if (user?.id === 'admin') return user
      res.writeHead(user ? 403 : 401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, code: user ? 'admin_required' : 'not_authenticated' }))
      return null
    } })
  const server = createServer((req, res) => {
    void (async () => {
      if (await handler(req, res)) return
      if (await handleBugReportRoute(req, res, { db, store, delivery: null, github: null }, await authenticate(req), false)) return
      res.writeHead(404).end()
    })().catch(() => res.writeHead(500).end())
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close(error => error ? reject(error) : resolve())
  }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected HTTP fixture port')
  url = `http://127.0.0.1:${address.port}`
})

const input = { issueNumber: 1465, requestId: 'confirm-request', expectedVersion: 0, kind: 'confirmed_bug',
  reportSummary: 'Cannot discard resources', explanation: 'Confirmed missing action.' }
const request = (path: string, role: string, init: RequestInit = {}) => fetch(`${url}${path}`, {
  ...init, headers: { 'Content-Type': 'application/json', 'x-fixture-role': role, ...init.headers },
})

describe('Bug Report feedback HTTP', () => {
  it('takes administrator confirmation through to the owner inbox and idempotent read state', async () => {
    const confirmed = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: JSON.stringify(input) })
    expect(confirmed.status).toBe(200)
    expect(confirmed.headers.get('cache-control')).toBe('no-store')
    const report = (await confirmed.json()).report
    expect(report).toMatchObject({ issueNumber: 1465, version: 1, feedback: [{ kind: 'confirmed_bug', explanation: 'Confirmed missing action.' }] })
    const id = report.feedback[0].id
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).unreadCount).toBe(1)
    expect((await (await request('/api/v1/inbox', 'other')).json()).messages).toEqual([])
    expect((await request(`/api/v1/inbox/${id}`, 'other')).status).toBe(404)
    expect((await request(`/api/v1/inbox/${id}/read`, 'other', { method: 'POST' })).status).toBe(404)
    const detail = await request(`/api/v1/inbox/${id}`, 'reporter')
    expect((await detail.json()).message.readAt).toBeNull()
    for (let attempt = 0; attempt < 2; attempt++) {
      const read = await request(`/api/v1/inbox/${id}/read`, 'reporter', { method: 'POST' })
      expect(read.status).toBe(200)
      expect((await read.json()).message.readAt).toEqual(expect.any(Number))
    }
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).unreadCount).toBe(0)
    expect((await (await request('/api/admin/bug-report-feedback?issue=1465', 'admin')).json()).report).toEqual(report)
  })

  it('requires concrete needs-info items and non-bug reasons before delivering an assessment', async () => {
    for (const body of [
      { ...input, kind: 'needs_info' },
      { ...input, kind: 'needs_info', missingItems: [] },
      { ...input, kind: 'needs_info', missingItems: ['   '] },
      { ...input, kind: 'needs_info', missingItems: ['信息不足'] },
      { ...input, kind: 'needs_info', missingItems: ['More information needed.'] },
      { ...input, kind: 'needs_info', missingItems: ['具体操作步骤'], explanation: '' },
      { ...input, kind: 'needs_info', missingItems: ['具体操作步骤'], issueUrl: 'https://attacker.example' },
      { ...input, kind: 'not_bug', explanation: 'Not a bug.' },
      { ...input, kind: 'not_bug', explanation: '非 bug' },
      { ...input, kind: 'not_bug', missingItems: ['具体操作步骤'] },
    ]) {
      const result = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: JSON.stringify(body) })
      expect(result.status, JSON.stringify(body)).toBe(400)
      expect(await result.json()).toEqual({ ok: false, code: 'invalid_feedback' })
    }
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).messages).toEqual([])
  })

  it('accepts the maximum Chinese needs-info content through HTTP without truncating the delivered message', async () => {
    const body = { ...input, kind: 'needs_info', reportSummary: '报告'.repeat(100), explanation: '请补充操作详情'.repeat(285) + '请补充操作',
      missingItems: Array.from({ length: 10 }, () => '请提供出现问题时的截图和操作步骤'.repeat(12) + '具体复现步骤材料') }
    expect(body.explanation).toHaveLength(2000)
    expect(body.missingItems[0]).toHaveLength(200)
    const result = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: JSON.stringify(body) })
    expect(result.status).toBe(200)
    const delivered = await (await request('/api/v1/inbox', 'reporter')).json()
    expect(delivered.messages).toMatchObject([{ kind: 'needs_info', reportSummary: body.reportSummary,
      explanation: body.explanation, missingItems: body.missingItems }])
  })

  it('keeps signed issue changes, unrelated comments, forged signatures and duplicate events separate from human assessments', async () => {
    const webhook = async (event: string, action: string, { repository = 'titanxxh/open-agricola', signature, reason = 'completed' }:
      { repository?: string; signature?: string; reason?: string } = {}) => {
      const body = JSON.stringify({ action, repository: { full_name: repository }, sender: { id: 99 },
        issue: { number: 1465, state_reason: reason, labels: [{ name: 'not_bug' }] }, comment: { body: 'Confirmed bug. Fixed.' } })
      return request('/api/v1/github-app/webhook', '', { method: 'POST', body,
        headers: { 'x-github-event': event, 'x-hub-signature-256': signature ??
          `sha256=${createHmac('sha256', 'feedback-webhook-secret').update(body).digest('hex')}` } })
    }
    expect((await webhook('issues', 'closed', { signature: 'sha256=00' })).status).toBe(401)
    for (const [event, action] of [['issues', 'closed'], ['issues', 'reopened'], ['issues', 'labeled'], ['issue_comment', 'created'],
      ['issues', 'closed'], ['issues', 'deleted'], ['issues', 'reopened']]) {
      expect((await webhook(event, action)).status).toBe(202)
      expect((await (await request('/api/v1/inbox', 'reporter')).json()).messages).toEqual([])
    }
    expect((await webhook('issues', 'closed', { repository: 'attacker/repository' })).status).toBe(202)
    expect((await webhook('issues', 'closed', { reason: 'not_planned' })).status).toBe(202)
    expect((await (await request('/api/admin/bug-report-feedback?issue=1465', 'admin')).json()).report.version).toBe(0)
    await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: JSON.stringify({ ...input, kind: 'needs_info',
      explanation: 'Please add the exact action on the original issue.', missingItems: ['The action immediately before the disconnect'] }) })
    expect((await webhook('issue_comment', 'created')).status).toBe(202)
    expect((await (await request('/api/admin/bug-report-feedback?issue=1465', 'admin')).json()).report)
      .toMatchObject({ version: 1, feedback: [{ kind: 'needs_info' }] })
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).unreadCount).toBe(1)
    await store.saveConnection('reporter', '99', { accessToken: 'test-token', accessTokenExpiresAt: Date.now() + 60000 })
    expect((await (await request('/api/v1/issue-submission-connection', 'reporter')).json()).connected).toBe(true)
    expect((await webhook('github_app_authorization', 'revoked')).status).toBe(202)
    expect((await (await request('/api/v1/issue-submission-connection', 'reporter')).json()).connected).toBe(false)
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).unreadCount).toBe(1)
  })

  it('rejects anonymous reads, ordinary-user decisions, forged recipients and invalid input without sending', async () => {
    expect((await request('/api/v1/inbox', '')).status).toBe(401)
    for (const role of ['', 'reporter', 'other']) {
      const result = await request('/api/admin/bug-report-feedback', role, { method: 'POST', body: JSON.stringify(input) })
      expect(result.status).toBe(role ? 403 : 401)
    }
    for (const body of [null, {}, { ...input, recipientUserId: 'other' }, { ...input, explanation: '  ' },
      { ...input, kind: 'fixed' }, { ...input, issueNumber: -1 }, { ...input, expectedVersion: 0.5 }]) {
      const result = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: JSON.stringify(body) })
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({ ok: false, code: 'invalid_feedback' })
    }
    const oversized = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: 'x'.repeat(40000) })
    expect(oversized.status).toBe(413)
    const missing = await request('/api/admin/bug-report-feedback?issue=9999', 'admin')
    expect(missing.status).toBe(404)
    for (const query of ['?limit=51', '?limit=0', '?before=NaN', '?before=1.5']) {
      expect((await request(`/api/v1/inbox${query}`, 'reporter')).status).toBe(400)
    }
    expect((await request('/api/v1/inbox', 'reporter', { method: 'POST' })).status).toBe(405)
    expect((await (await request('/api/v1/inbox', 'reporter')).json()).messages).toEqual([])
    expect((await (await request('/api/v1/inbox', 'other')).json()).messages).toEqual([])
  })
})
