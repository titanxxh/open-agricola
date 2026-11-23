import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { createGamePreferencesHandler } from '../game-preferences-routes'
import { GamePreferencesStore } from '../game/game-preferences-store'
import { createTestDatabase } from './_helpers/postgres'

// #2039: account defaults for seat settings, read and replaced by the signed-in user.
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  for (const id of ['alice', 'bob']) {
    await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES(?, ?, ?, '', 1)").run(id, id, id)
  }
  const store = new GamePreferencesStore(db)
  const handler = createGamePreferencesHandler({ store, authenticate: async req => {
    const user = req.headers['x-fixture-user']
    return typeof user === 'string' && user ? { id: user } : null
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
  const url = `http://127.0.0.1:${address.port}/api/account/game-preferences`
  const request = (user: string, init: RequestInit = {}) => fetch(url, {
    ...init, headers: { 'x-fixture-user': user, 'content-type': 'application/json', ...init.headers },
  })
  return { db, store, request }
}

describe('account game preference routes', () => {
  it('reads the default, replaces it for the signed-in user only, and deletes it with the account', async () => {
    const { db, store, request } = await setup()
    const initial = await request('alice')
    expect(initial.status).toBe(200)
    expect(initial.headers.get('cache-control')).toBe('no-store')
    expect(await initial.json()).toEqual({ ok: true, preferences: { autoResolveIndependentReactions: true } })
    const put = await request('alice', { method: 'PUT', body: JSON.stringify({ autoResolveIndependentReactions: false }) })
    expect(put.status).toBe(200)
    expect(await put.json()).toEqual({ ok: true, preferences: { autoResolveIndependentReactions: false } })
    expect(await (await request('alice')).json()).toEqual({ ok: true, preferences: { autoResolveIndependentReactions: false } })
    expect(await (await request('bob')).json()).toEqual({ ok: true, preferences: { autoResolveIndependentReactions: true } })
    expect([...(await store.readStored(['alice', 'bob'])).keys()]).toEqual(['alice'])
    await db.prepare('DELETE FROM users WHERE id = ?').run('alice')
    expect((await store.readStored(['alice'])).size).toBe(0)
  })

  it('requires a signed-in user and rejects malformed bodies without writing', async () => {
    const { store, request } = await setup()
    expect((await request('')).status).toBe(401)
    expect((await request('', { method: 'PUT', body: JSON.stringify({ autoResolveIndependentReactions: false }) })).status).toBe(401)
    for (const body of ['{', '{}', JSON.stringify({ autoResolveIndependentReactions: 'no' }), JSON.stringify({ autoResolveIndependentReactions: false, extra: 1 })]) {
      const response = await request('alice', { method: 'PUT', body })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ ok: false, code: 'invalid_game_preferences' })
    }
    expect((await request('alice', { method: 'POST', body: '{}' })).status).toBe(405)
    expect((await store.readStored(['alice'])).size).toBe(0)
  })
})
