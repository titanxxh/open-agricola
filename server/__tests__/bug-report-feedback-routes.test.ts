import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { createBugReportFeedbackHandler } from '../bug-report-feedback-routes'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
let url: string
beforeEach(async () => {
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  for (const id of ['reporter', 'other', 'admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('room','expired',1,1)").run()
  await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    status,github_issue_number,created_at,updated_at) VALUES('report','reporter','room',0,'active',1,0,?,'submitted',1465,1,1)`).run('a'.repeat(64))
  const authenticate = async (req: import('node:http').IncomingMessage) => {
    const role = req.headers['x-fixture-role']
    return typeof role === 'string' && ['admin', 'reporter', 'other'].includes(role) ? { id: role } : null
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
    void handler(req, res).then(handled => { if (!handled) res.writeHead(404).end() }).catch(() => res.writeHead(500).end())
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
    const oversized = await request('/api/admin/bug-report-feedback', 'admin', { method: 'POST', body: 'x'.repeat(9000) })
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
