import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBetaAccessHandler } from '../beta-access-routes'
import { BetaAccessStore } from '../beta-access-store'
import { canUseExperimentalFeature, experimentalAccountState } from '../experimental-features'
import { createTestDatabase } from './_helpers/postgres'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllEnvs()
})

async function setup() {
  vi.stubEnv('ADMIN_USERS', 'admin,otheradmin')
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  for (const [id, name] of [['admin', 'Administrator'], ['otheradmin', 'Other admin'], ['player', 'Test Player']]) {
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id, id, name)
  }
  const store = new BetaAccessStore(db)
  const handler = createBetaAccessHandler({ store, requireAdmin: async (req, res) => {
    const role = req.headers['x-fixture-role']
    if (role === 'admin' || role === 'otheradmin') return { id: role }
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
  const url = `http://127.0.0.1:${address.port}/api/admin/beta-access`
  const request = (init: RequestInit = {}) => fetch(url, {
    ...init, headers: { 'x-fixture-role': 'admin', 'content-type': 'application/json', ...init.headers },
  })
  return { db, store, request, url }
}

describe('administrator Beta access', () => {
  it('grants access with the actor and time, then revokes it without a new login', async () => {
    const { db, request } = await setup()
    expect(await canUseExperimentalFeature('player', 'team-modes', db)).toBe(false)
    const granted = await request({ method: 'PUT', body: JSON.stringify({ userId: 'player' }) })
    expect(granted.status).toBe(200)
    expect(granted.headers.get('cache-control')).toBe('no-store')
    const body = await granted.json()
    expect(body).toEqual({ ok: true, grants: [{
      account: { id: 'player', username: 'player', displayName: 'Test Player' },
      grantedBy: { id: 'admin', username: 'admin', displayName: 'Administrator' },
      grantedAt: expect.any(Number),
    }] })
    expect(await canUseExperimentalFeature('player', 'team-modes', db)).toBe(true)
    const revoked = await request({ method: 'DELETE', body: JSON.stringify({ userId: 'player' }) })
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toEqual({ ok: true, grants: [] })
    expect(await canUseExperimentalFeature('player', 'team-modes', db)).toBe(false)
  })

  it('keeps the original grant when another administrator grants it again', async () => {
    const { request } = await setup()
    const first = await (await request({ method: 'PUT', body: JSON.stringify({ userId: 'player' }) })).json()
    const repeated = await request({ method: 'PUT', headers: { 'x-fixture-role': 'otheradmin' }, body: JSON.stringify({ userId: 'player' }) })
    expect(await repeated.json()).toEqual(first)
    const listed = await request()
    expect(listed.headers.get('cache-control')).toBe('no-store')
    expect(await listed.json()).toEqual(first)
  })

  it.each(['GET', 'PUT', 'DELETE'])('rejects anonymous and nonadministrator %s requests', async method => {
    const { request, store } = await setup()
    for (const [role, status, code] of [['', 401, 'not_authenticated'], ['player', 403, 'admin_required']] satisfies Array<[string, number, string]>) {
      const response = await request({ method, headers: { 'x-fixture-role': role },
        ...(method === 'GET' ? {} : { body: JSON.stringify({ userId: 'player' }) }),
      })
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ ok: false, code })
    }
    expect(await store.list()).toEqual([])
  })

  it('reports an absent account and rejects malformed bodies without granting access', async () => {
    const { request, store } = await setup()
    const missing = await request({ method: 'PUT', body: JSON.stringify({ userId: 'missing' }) })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ ok: false, code: 'beta_access_account_not_found' })
    for (const body of ['{', 'null', '{}', '{"userId":1}', '{"userId":""}', '{"userId":" player "}']) {
      const response = await request({ method: 'PUT', body })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ ok: false, code: 'invalid_beta_access_account' })
    }
    const oversized = await request({ method: 'PUT', body: JSON.stringify({ userId: 'x'.repeat(1100) }) })
    expect(oversized.status).toBe(413)
    expect(await store.list()).toEqual([])
  })

  it('derives administrator qualification without storing a grant and keeps ordinary qualification distinct from development availability', async () => {
    const { request, store, db } = await setup()
    expect((await experimentalAccountState('admin', db)).betaAccess).toBe(true)
    expect((await experimentalAccountState('player', db)).betaAccess).toBe(false)
    vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', '')
    expect(await canUseExperimentalFeature('player', 'team-modes', db)).toBe(true)
    expect((await experimentalAccountState('player', db)).betaAccess).toBe(false)
    expect((await request({ method: 'PUT', body: JSON.stringify({ userId: 'admin' }) })).status).toBe(200)
    expect(await store.list()).toEqual([])
    await request({ method: 'DELETE', body: JSON.stringify({ userId: 'admin' }) })
    expect((await experimentalAccountState('admin', db)).betaAccess).toBe(true)
  })

  it('keeps the recipient when the grantor account is deleted and shows no grantor', async () => {
    const { db, request, store } = await setup()
    await request({ method: 'PUT', body: JSON.stringify({ userId: 'player' }) })
    await db.prepare('DELETE FROM users WHERE id=?').run('admin')
    expect((await experimentalAccountState('player', db)).betaAccess).toBe(true)
    expect(await store.list()).toEqual([{ account: { id: 'player', username: 'player', displayName: 'Test Player' },
      grantedBy: null, grantedAt: expect.any(Number) }])
  })
})
