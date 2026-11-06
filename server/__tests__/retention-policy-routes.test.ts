import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { createRetentionPolicyHandler } from '../retention-policy-routes'
import { RoomRetentionStore } from '../game/room-retention-store'
import { createTestDatabase } from './_helpers/postgres'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES('admin', 'admin', 'Administrator', '', 1)").run()
  const store = new RoomRetentionStore(db)
  const handler = createRetentionPolicyHandler({ store, requireAdmin: async (req, res) => {
    const role = req.headers['x-fixture-role']
    if (role === 'admin') return { id: 'admin' }
    res.writeHead(role === 'player' ? 403 : 401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, code: role === 'player' ? 'admin_required' : 'not_authenticated' }))
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
  if (!address || typeof address === 'string') throw new Error('Expected a test HTTP address')
  const url = `http://127.0.0.1:${address.port}/api/admin/retention-policy`
  const request = (init: RequestInit = {}) => fetch(url, {
    ...init, headers: { 'x-fixture-role': 'admin', 'content-type': 'application/json', ...init.headers },
  })
  return { db, store, request, url }
}

describe('administrator room retention routes', () => {
  it('reads and updates the committed policy with no-store responses', async () => {
    const { db, request } = await setup()
    const get = await request()
    expect(get.status).toBe(200)
    expect(get.headers.get('cache-control')).toBe('no-store')
    expect(await get.json()).toEqual({ ok: true, policy: { revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null } })
    const patch = await request({ method: 'PATCH', body: JSON.stringify({ expectedRevision: 1, waitingDays: 5, playingDays: 10 }) })
    expect(patch.status).toBe(200)
    expect(patch.headers.get('cache-control')).toBe('no-store')
    expect(await patch.json()).toEqual({ ok: true, policy: { revision: 2, waitingDays: 5, playingDays: 10, updatedAt: expect.any(Number), updatedBy: 'Administrator' } })
    expect(await db.prepare('SELECT actor_user_id, waiting_days, playing_days FROM room_retention_policy_audit').all())
      .toEqual([{ actor_user_id: 'admin', waiting_days: 5, playing_days: 10 }])
  })

  it.each(['GET', 'PATCH'])('requires administrator authorization for %s', async method => {
    const { store, url } = await setup()
    for (const [role, status, code] of [['', 401, 'not_authenticated'], ['player', 403, 'admin_required']] satisfies Array<[string, number, string]>) {
      const response = await fetch(url, { method, headers: { 'x-fixture-role': role },
        ...(method === 'PATCH' ? { body: JSON.stringify({ expectedRevision: 1, waitingDays: 90, playingDays: 90 }) } : {}),
      })
      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ ok: false, code })
    }
    expect(await store.read()).toMatchObject({ revision: 1, waitingDays: 3, playingDays: 7 })
  })

  it.each(['{', '', 'null', '{"expectedRevision":1,"waitingDays":0,"playingDays":7}', '{"expectedRevision":1,"waitingDays":3.5,"playingDays":7}', '{"expectedRevision":1,"waitingDays":3,"playingDays":91}'])(
    'rejects malformed or invalid JSON %s without changing the policy', async body => {
      const { request, store } = await setup()
      const response = await request({ method: 'PATCH', body })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ ok: false, code: 'invalid_retention_policy' })
      expect(await store.read()).toMatchObject({ revision: 1, waitingDays: 3, playingDays: 7 })
    },
  )

  it('returns the current policy on a revision conflict', async () => {
    const { request, store } = await setup()
    await store.update({ expectedRevision: 1, waitingDays: 8, playingDays: 14 }, 'admin')
    const response = await request({ method: 'PATCH', body: JSON.stringify({ expectedRevision: 1, waitingDays: 2, playingDays: 4 }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ ok: false, code: 'retention_policy_conflict', policy: await store.read() })
  })

  it('bounds request bodies and rejects unsupported methods', async () => {
    const { request, store } = await setup()
    const oversized = await request({ method: 'PATCH', body: JSON.stringify({ extra: 'x'.repeat(1100) }) })
    expect(oversized.status).toBe(413)
    expect(await oversized.json()).toEqual({ ok: false, code: 'retention_policy_body_too_large' })
    const unsupported = await request({ method: 'DELETE' })
    expect(unsupported.status).toBe(405)
    expect(unsupported.headers.get('allow')).toBe('GET, PATCH')
    expect(await store.read()).toMatchObject({ revision: 1, waitingDays: 3, playingDays: 7 })
  })

  it('reports storage failure without exposing the database error', async () => {
    const { db, request } = await setup()
    await db.exec('ALTER TABLE room_retention_policy RENAME COLUMN revision TO unavailable_revision')
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'retention_policy_unavailable' })
  })
})
