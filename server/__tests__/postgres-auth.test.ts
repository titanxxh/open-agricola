import { getTestDatabaseUrl } from './_helpers/postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { migratePostgres } from '../database/migrations'
import { createLocalUserForTests, createSession, logout, validateSession } from '../auth'
import { createOAuthState, consumeOAuthState } from '../oauth/store'

vi.mock('../db.ts', () => ({ getDb: () => db }))
const connectionString = getTestDatabaseUrl()
const schema = `test_${randomUUID().replaceAll('-', '')}`
const admin = new PostgresDatabase({ connectionString })
const db = new PostgresDatabase({ connectionString, schema })
beforeAll(async () => {
  await admin.exec(`CREATE SCHEMA "${schema}"`)
  await migratePostgres(db)
})
afterAll(async () => {
  await db.close()
  await admin.exec(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.close()
})

it('creates a usable session and consumes an OAuth state exactly once under concurrent callbacks', async () => {
  const user = await createLocalUserForTests('pgalice', 'test-password', 'Alice')
  const token = await createSession(user.id)
  expect(token).toBeTruthy()
  expect(await validateSession(token!)).toMatchObject({ id: user.id, displayName: 'Alice' })
  const state = await createOAuthState({ provider: 'github', intent: 'link', userId: user.id, returnTo: '/workshop' })
  const outcomes = await Promise.all([consumeOAuthState(state), consumeOAuthState(state)])
  expect(outcomes.filter(Boolean)).toEqual([{ provider: 'github', intent: 'link', userId: user.id, returnTo: '/workshop' }])
  await logout(token!)
  expect(await validateSession(token!)).toBeNull()
})

it('enforces one shared authentication limit across concurrent requests and resets after expiry', async () => {
  const { consumeRateLimit } = await import('../database/rate-limit')
  const results = await Promise.all(Array.from({ length: 15 }, () => consumeRateLimit(db, 'login', 'test-ip', 10, 60_000, 1000)))
  expect(results.filter(result => result.allowed)).toHaveLength(10)
  expect(await consumeRateLimit(db, 'login', 'test-ip', 10, 60_000, 61_000)).toEqual({ allowed: true, resetAt: 121_000 })
})

it('shares encrypted Workshop grants between instances and consumes them only for the bound user', async () => {
  const { TokenCache } = await import('../workshop-pr/token-cache')
  const { TokenCipher } = await import('../bug-report/bug-report-store')
  const cipher = new TokenCipher('test', new Map([['test', Buffer.alloc(32, 7)]]))
  const first = new TokenCache(60_000, () => db, () => cipher)
  const second = new TokenCache(60_000, () => db, () => cipher)
  const user = await createLocalUserForTests('grantuser', 'test-password')
  const hs = await first.allocateHandshakeId(user.id)
  expect(await second.hasPending(hs)).toBe(true)
  const callbacks = await Promise.all([first.claimCallback(hs), second.claimCallback(hs)])
  expect(callbacks.filter(Boolean)).toHaveLength(1)
  expect(await second.bind(hs, 'controlled-provider-token')).toBe(true)
  const stored = await db.prepare('SELECT token_ciphertext FROM workshop_oauth_handshakes WHERE id = ?').get(hs)
  expect(stored?.token_ciphertext.toString()).not.toContain('controlled-provider-token')
  expect(await second.consume(hs, 'another-user')).toBeUndefined()
  const grants = await Promise.all([first.consume(hs, user.id), second.consume(hs, user.id)])
  expect(grants.filter(Boolean)).toEqual([{ userId: user.id, token: 'controlled-provider-token' }])
})
