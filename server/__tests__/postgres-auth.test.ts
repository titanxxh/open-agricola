import { getTestDatabaseUrl } from './_helpers/postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { migratePostgres } from '../database/migrations'
import { createLocalUserForTests, createSession, logout, validateSession } from '../auth'
import { createOAuthState, consumeOAuthState, createOnboardingTicket, consumeOnboardingTicket } from '../oauth/store'
import { PrereleaseAuthority } from '../prerelease-authority'

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


it('upgrades legacy logins once while preserving the account, retained room and revocation history', async () => {
  const user = await createLocalUserForTests('pgupgrade', 'test-password', 'Upgrade')
  const oldToken = await createSession(user.id)
  expect(oldToken).toBeTruthy()
  if (!oldToken) return
  const now = Date.now()
  const state = await createOAuthState({ provider: 'github', intent: 'link', userId: user.id })
  const onboarding = await createOnboardingTicket({ provider: 'github', providerUserId: 'upgrade-profile' })
  const retainedState = JSON.stringify({ roomId: 'retained-upgrade', round: 4, confirmedStep: 12 })
  await db.prepare('INSERT INTO rooms(id,created_by,state_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('retained-upgrade', user.id, retainedState, 12, now, now)
  await db.prepare('INSERT INTO observability_tickets(ticket_hash,session_token,expires_at) VALUES(?,?,?)')
    .run('pending-upgrade-ops', oldToken, now + 30_000)
  const generationId = randomUUID()
  const target = { sourceOrigin: 'https://app.example.com', targetOrigin: 'https://pre.example.com', serviceKey: 'test-service-key', entryEnabled: false }
  await db.prepare('INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at) VALUES(?,?,?,?)')
    .run(generationId, target.targetOrigin, 'pre', now)
  await db.prepare('INSERT INTO prerelease_identity_grants(id,user_id,source_token,target_origin,created_at,expires_at,generation_id) VALUES(?,?,?,?,?,?,?)')
    .run('upgrade-grant', user.id, oldToken, target.targetOrigin, now, now + 60_000, generationId)

  // Reconstruct the previous schema before running the public upgrade boundary.
  await db.exec('ALTER TABLE sessions DROP COLUMN auth_policy_version')
  await db.prepare('DELETE FROM postgres_schema_migrations WHERE version=?').run(46)
  await migratePostgres(db)

  expect(await validateSession(oldToken)).toBeNull()
  expect(await consumeOAuthState(state)).toBeNull()
  expect(await consumeOnboardingTicket(onboarding)).toBeNull()
  expect(await db.prepare('SELECT ticket_hash FROM observability_tickets WHERE ticket_hash=?').get('pending-upgrade-ops')).toBeUndefined()
  expect(await db.prepare('SELECT created_by,state_json,version FROM rooms WHERE id=?').get('retained-upgrade'))
    .toEqual({ created_by: user.id, state_json: retainedState, version: 12 })
  const authority = new PrereleaseAuthority(db)
  expect(await authority.status(target, 'upgrade-grant', generationId)).toMatchObject({ source: { kind: 'invalid' }, grant: { kind: 'revoked' } })
  expect(await authority.events(target, generationId)).toEqual([expect.objectContaining({ kind: 'source_revoked', grantId: 'upgrade-grant' })])
  const fresh = await createSession(user.id)
  expect(fresh).toBeTruthy()
  await migratePostgres(db)
  expect(await validateSession(fresh ?? '')).toMatchObject({ id: user.id, displayName: 'Upgrade' })
})
