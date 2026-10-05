import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenCache } from '../token-cache.ts'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
import { TokenCipher } from '../../bug-report/bug-report-store'
let db: PostgresDatabase
const cipher = new TokenCipher('test', new Map([['test', Buffer.alloc(32, 3)]]))

describe('TokenCache', () => {
  beforeEach(async () => {
    db = await createTestDatabase()
    await db.exec("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ('u1', 'u1', 'User', 'hash', 1)")
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(async () => { vi.useRealTimers(); await db.close() })

  it('allocateHandshakeId returns a non-empty string', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const id = (await c.allocateHandshakeId('u1'))
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)
  })

  it('bind + get yields the token for an allocated handshakeId', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    ;(await c.bind(hs, 'ghp_abc'))
    const got = (await c.get(hs))
    expect(got).toEqual({ token: 'ghp_abc', userId: 'u1' })
  })

  it('hasPending returns true for allocated but not-yet-bound ids, false after bind', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    expect((await c.hasPending(hs))).toBe(true)
    ;(await c.bind(hs, 'ghp_abc'))
    expect((await c.hasPending(hs))).toBe(false)
  })

  it('get returns undefined after TTL expires (bound)', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    ;(await c.bind(hs, 'ghp_abc'))
    vi.advanceTimersByTime(61_000)
    expect((await c.get(hs))).toBeUndefined()
  })

  it('hasPending returns false after TTL expires', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    vi.advanceTimersByTime(61_000)
    expect((await c.hasPending(hs))).toBe(false)
  })

  it('delete clears both pending and bound state', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    ;(await c.bind(hs, 'ghp_x'))
    ;(await c.delete(hs))
    expect((await c.get(hs))).toBeUndefined()
    expect((await c.hasPending(hs))).toBe(false)
  })

  it('bind on unknown handshakeId is a no-op (silent)', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    ;(await c.bind('not-a-real-hs', 'ghp_x'))
    expect((await c.get('not-a-real-hs'))).toBeUndefined()
  })

  it('bind on expired pending is a no-op', async () => {
    const c = new TokenCache(60_000, () => db, () => cipher)
    const hs = (await c.allocateHandshakeId('u1'))
    vi.advanceTimersByTime(61_000)
    ;(await c.bind(hs, 'ghp_x'))
    expect((await c.get(hs))).toBeUndefined()
  })
})
