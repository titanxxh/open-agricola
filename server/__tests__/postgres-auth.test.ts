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
