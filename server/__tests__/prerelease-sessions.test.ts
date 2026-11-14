import { afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'
import { PostgresDatabase } from '../database/postgres'
import { applyPrereleaseIdentityAudit } from '../../scripts/prerelease/identity-audit'
import { PrereleaseSessions } from '../prerelease-sessions'
import type { PrereleaseIdentityState } from '../../shared/contract/prerelease-identity'

const runtime = { buildId: 'a'.repeat(40), generationId: '00000000-0000-4000-8000-000000000001', appOrigin: 'https://pre.example.test', formalAppOrigin: 'https://play.example.test', formalApiBase: 'https://api.example.test', targetId: 'prerelease-main' }
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

it('opens a minimal external principal and persists the same bounded session across a new consumer', async () => {
  const db = await createTestDatabase(); cleanup.push(() => db.close())
  let now = 1_800_000_000_000
  const state: PrereleaseIdentityState = { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId, grantId: 'g'.repeat(43), account: { kind: 'active', subject: { id: 'formal-user', username: 'player', displayName: 'Test Player' } }, source: { kind: 'active', expiresAt: now + 9 * 86_400_000 }, grant: { kind: 'active', expiresAt: now + 7 * 86_400_000 }, betaAccess: true, confirmedAt: now, validUntil: now + 30_000 }
  const authority = { exchange: async () => state, status: async () => ({ ...state, confirmedAt: now, validUntil: now + 30_000 }), events: async () => [], acknowledge: async () => undefined }
  const service = new PrereleaseSessions({ db, runtime, authority, now: () => now })
  const begin = await service.beginHandoff('/open-agricola/')
  const input = new URL(begin.formalUrl).hash.slice(1), params = new URLSearchParams(input)
  const session = await service.exchangeHandoff(begin.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state: params.get('state')!, browserChallenge: params.get('browserChallenge')!, returnTo: `${runtime.formalAppOrigin}/` })
  expect(session.user).toEqual({ id: 'formal-user', username: 'player', displayName: 'Test Player', isAdmin: false })
  expect(session.expiresAt).toBe(1_800_604_800_000)
  expect(service.cachedAuthorized(session.token)).toBe(true)
  const reopened = new PrereleaseSessions({ db, runtime, authority, now: () => now })
  expect(await reopened.resolve(session.token)).toEqual({ user: session.user, expiresAt: session.expiresAt, validUntil: 1_800_000_030_000 })
  const user = await db.prepare('SELECT identity_origin,password_hash,email FROM users WHERE id=?').get(session.user.id)
  expect(user).toEqual({ identity_origin: 'external', password_hash: null, email: null })
  expect(await db.prepare('SELECT token_hash FROM prerelease_sessions').get()).toEqual({ token_hash: expect.not.stringContaining(session.token) })
  now += 30_000
  expect(service.cachedAuthorized(session.token)).toBe(false)
})

async function setupConsumer({ sourceRemaining = 9 * 86_400_000 } = {}) {
  const db = await createTestDatabase(); cleanup.push(() => db.close())
  let now = 1_800_000_000_000, betaAccess = true, unavailable = false, serial = 0
  const sourceExpiry = now + sourceRemaining, grantExpiry = Math.min(now + 7 * 86_400_000, sourceExpiry)
  const events: import('../../shared/contract/prerelease-identity').PrereleaseIdentityEvent[] = []
  const acknowledgements: string[] = []
  const revoked = new Set<string>()
  const state = (grantId: string): PrereleaseIdentityState => ({ protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId, grantId,
    account: { kind: 'active', subject: { id: 'formal-user', username: 'player', displayName: 'Test Player' } }, source: revoked.has(grantId) ? { kind: 'invalid' } : { kind: 'active', expiresAt: sourceExpiry },
    grant: { kind: 'active', expiresAt: grantExpiry }, betaAccess, confirmedAt: now, validUntil: Math.min(now + 30_000, sourceExpiry, grantExpiry) })
  let status = async (grantId: string) => { if (unavailable) throw new Error('source offline'); return state(grantId) }
  const authority = { exchange: async () => state(String(++serial).padStart(43, 'g')), status: (grantId: string) => status(grantId), events: async () => [...events], acknowledge: async (id: string) => { acknowledgements.push(id); events.splice(events.findIndex(event => event.id === id), 1) } }
  const service = new PrereleaseSessions({ db, runtime, authority, now: () => now, eraseAccount: async id => { await db.prepare('DELETE FROM users WHERE id=?').run(id) } })
  async function enter(consumer = service) {
    const begin = await consumer.beginHandoff('/open-agricola/?room=existing'), params = new URLSearchParams(new URL(begin.formalUrl).hash.slice(1))
    const browserState = params.get('state'), browserChallenge = params.get('browserChallenge')
    if (!browserState || !browserChallenge) throw new Error('Missing browser challenge')
    return consumer.exchangeHandoff(begin.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state: browserState, browserChallenge, returnTo: `${runtime.formalAppOrigin}/` })
  }
  return { db, service, enter, runtime, state, events, acknowledgements, revoked, authority, now: () => now,
    advance: (ms: number) => { now += ms }, setBeta: (value: boolean) => { betaAccess = value }, offline: (value: boolean) => { unavailable = value }, setStatus: (fn: typeof status) => { status = fn } }
}

it('rejects account-wide logout from a revoked token without revoking a newer session', async () => {
  const context = await setupConsumer(), old = await context.enter()
  await context.service.revoke(old.token)
  const current = await context.enter()
  let denial: unknown
  try { await context.service.revoke(old.token, true) } catch (error) { denial = error }
  expect(await context.service.resolve(current.token)).toMatchObject({ user: current.user })
  expect(denial).toMatchObject({ kind: 'expired' })
})

it.each(['expired', 'build', 'generation', 'source-invalid', 'source-unknown'])('rejects account-wide logout from a %s caller while preserving a currently authorized session', async reason => {
  const context = await setupConsumer({ sourceRemaining: reason === 'expired' ? 20_000 : 9 * 86_400_000 }), old = await context.enter()
  let consumer = context.service
  const nextGrant = 'g'.repeat(42) + '2'
  if (reason === 'expired') {
    context.advance(20_000)
    const currentState = { ...context.state(nextGrant), source: { kind: 'active', expiresAt: context.now() + 86_400_000 }, grant: { kind: 'active', expiresAt: context.now() + 86_400_000 }, validUntil: context.now() + 30_000 } satisfies PrereleaseIdentityState
    context.authority.exchange = async () => currentState
    context.setStatus(async grantId => grantId === nextGrant ? currentState : context.state(grantId))
  } else if (reason === 'build' || reason === 'generation') {
    const nextRuntime = { ...runtime, ...(reason === 'build' ? { buildId: 'b'.repeat(40) } : { generationId: '00000000-0000-4000-8000-000000000002' }) }
    if (reason === 'generation') context.authority.exchange = async () => ({ ...context.state(nextGrant), generationId: nextRuntime.generationId })
    consumer = new PrereleaseSessions({ db: context.db, runtime: nextRuntime, authority: context.authority, now: context.now })
    cleanup.push(async () => { consumer.close() })
  } else {
    context.advance(30_000)
    if (reason === 'source-invalid') context.revoked.add('g'.repeat(42) + '1')
  }
  const current = await context.enter(consumer)
  if (reason === 'source-unknown') context.offline(true)
  let denial: unknown
  try { await consumer.revoke(old.token, true) } catch (error) { denial = error }
  expect(await consumer.resolve(current.token)).toMatchObject({ user: current.user })
  expect(denial).toMatchObject({ kind: reason === 'source-unknown' ? 'paused' : 'expired' })
})

it.each(['revoked', 'lease-expired'])('rechecks account-wide logout after waiting for a %s caller row', async reason => {
  const context = await setupConsumer(), old = await context.enter()
  context.advance(15_000)
  const current = await context.enter()
  const schema = (await context.db.prepare('SELECT current_schema() AS name').get<{ name: string }>())!.name
  const other = new PostgresDatabase({ connectionString: getTestDatabaseUrl(), schema, max: 3 })
  const revoker = new PrereleaseSessions({ db: other, runtime, authority: context.authority, now: context.now })
  cleanup.push(async () => { revoker.close(); await other.close() })
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let pid = 0, logout: Promise<void> | undefined
  const blocker = other.transaction(async () => {
    pid = (await other.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())!.pid
    if (reason === 'revoked') await revoker.revoke(old.token)
    else await other.prepare('SELECT token_hash FROM prerelease_sessions WHERE grant_id=? FOR UPDATE').get('g'.repeat(42) + '1')
    entered.resolve(); await release.promise
  })()
  try {
    await entered.promise
    logout = context.service.revoke(old.token, true)
    const result = logout.catch((error: unknown) => error)
    await vi.waitFor(async () => {
      const blocked = await context.db.prepare('SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) LIMIT 1').get(pid)
      expect(blocked).toBeDefined()
    })
    if (reason === 'lease-expired') { context.advance(15_000); context.offline(true) }
    release.resolve(); await blocker
    const denial = await result
    expect(await context.service.resolve(current.token)).toMatchObject({ user: current.user })
    expect(denial).toMatchObject({ kind: reason === 'revoked' ? 'expired' : 'paused' })
  } finally { release.resolve(); await Promise.allSettled([blocker, logout]) }
})

it('applies known Beta withdrawal to every local source immediately and restores it only after fresh confirmation', async () => {
  const context = await setupConsumer(), first = await context.enter()
  context.advance(10_000)
  const second = await context.enter()
  context.advance(5_000); context.setBeta(false)
  await context.service.refreshActive()
  expect(context.service.cachedAuthorized(first.token)).toBe(false)
  expect(context.service.cachedAuthorized(second.token)).toBe(false)
  expect(await context.service.resolve(second.token)).toBeNull()
  context.setBeta(true)
  expect(await context.service.resolve(second.token)).toEqual({ user: second.user, expiresAt: second.expiresAt, validUntil: 1_800_000_045_000 })
})


it('keeps the original absolute lease during an outage and reopens only after a fresh source confirmation', async () => {
  const context = await setupConsumer(), session = await context.enter()
  context.advance(15_000); context.offline(true)
  await expect(context.service.refreshActive()).rejects.toThrow('source offline')
  expect(context.service.cachedAuthorized(session.token)).toBe(true)
  context.advance(15_000)
  expect(context.service.cachedAuthorized(session.token)).toBe(false)
  expect(await context.service.resolve(session.token)).toBeNull()
  expect(context.service.status(session.token)).toBe('paused')
  context.offline(false)
  expect(await context.service.resolve(session.token)).toMatchObject({ user: session.user, validUntil: 1_800_000_060_000 })
  context.advance(7 * 86_400_000)
  expect(await context.service.resolve(session.token)).toBeNull()
  expect(context.service.status(session.token)).toBe('expired')
})

it('pauses a previous qualification denial before notifying listeners of a new qualification change', async () => {
  const context = await setupConsumer(), first = await context.enter(), second = await context.enter()
  context.advance(15_000); context.setBeta(false)
  await context.service.refreshActive()
  expect([context.service.status(first.token), context.service.status(second.token)]).toEqual(['expired', 'expired'])
  let observed: string[] = []
  context.service.subscribeInvalidation(() => { observed = [context.service.status(first.token), context.service.status(second.token)] })
  context.setBeta(true); context.offline(true)
  context.events.push({ id: '00000000-0000-4000-8000-000000000010', kind: 'beta_changed', userId: first.user.id, grantId: null, createdAt: context.now() })
  await expect(context.service.processEvents()).rejects.toThrow('source offline')
  expect(observed).toEqual(['paused', 'paused'])
  expect([context.service.status(first.token), context.service.status(second.token)]).toEqual(['paused', 'paused'])
  context.offline(false)
  expect(await context.service.resolve(second.token)).toMatchObject({ user: second.user, expiresAt: second.expiresAt })
  expect(context.service.status(second.token)).toBe('authorized')
})

it('classifies a background qualification denial for issued sessions without a loaded lease', async () => {
  const context = await setupConsumer(), first = await context.enter(), second = await context.enter()
  const reopened = new PrereleaseSessions({ db: context.db, runtime, authority: context.authority, now: context.now })
  cleanup.push(async () => { reopened.close() })
  expect(await reopened.resolve(first.token)).not.toBeNull()
  context.advance(15_000); context.setBeta(false)
  await reopened.refreshActive()
  expect([reopened.status(first.token), reopened.status(second.token)]).toEqual(['expired', 'expired'])
  expect(await context.db.prepare('SELECT grant_id FROM prerelease_revoked_grants').all()).toEqual([])
})

it.each(['logout', 'source_revoked', 'source_invalid', 'account_deleted', 'absolute_expiry'])('keeps confirmed %s expired after a qualification notification', async reason => {
  const context = await setupConsumer({ sourceRemaining: 20_000 }), session = await context.enter()
  if (reason === 'logout') await context.service.revoke(session.token)
  else if (reason === 'absolute_expiry') { context.advance(20_000); await context.service.refreshActive() }
  else if (reason === 'source_invalid') {
    context.revoked.add('g'.repeat(42) + '1'); context.setBeta(false); context.advance(15_000)
    await context.service.refreshActive()
  }
  else {
    context.events.push(reason === 'source_revoked'
      ? { id: '00000000-0000-4000-8000-000000000011', kind: 'source_revoked', userId: session.user.id, grantId: 'g'.repeat(42) + '1', createdAt: context.now() }
      : { id: '00000000-0000-4000-8000-000000000011', kind: 'account_deleted', userId: session.user.id, grantId: null, createdAt: context.now() })
    await context.service.processEvents()
  }
  expect(context.service.status(session.token)).toBe('expired')
  context.offline(true)
  context.events.push({ id: '00000000-0000-4000-8000-000000000012', kind: 'beta_changed', userId: session.user.id, grantId: null, createdAt: context.now() })
  await context.service.processEvents().catch(error => { expect(error).toMatchObject({ message: 'source offline' }) })
  expect(context.service.status(session.token)).toBe('expired')
  expect(context.service.cachedAuthorized(session.token)).toBe(false)
})

it.each([
  { freshness: 'elapsed', path: 'background' }, { freshness: 'future', path: 'background' },
  { freshness: 'elapsed', path: 'event' }, { freshness: 'future', path: 'event' },
])('pauses a $freshness $path confirmation without inventing source revocation', async ({ freshness, path }) => {
  const context = await setupConsumer(), session = await context.enter()
  context.advance(15_000)
  context.setStatus(async grantId => {
    const state = context.state(grantId)
    state.confirmedAt += freshness === 'elapsed' ? -30_001 : 1
    state.validUntil = state.confirmedAt + 30_000
    return state
  })
  if (path === 'background') await context.service.refreshActive()
  else {
    context.events.push({ id: '00000000-0000-4000-8000-000000000014', kind: 'beta_changed', userId: session.user.id, grantId: null, createdAt: context.now() })
    await context.service.processEvents()
  }
  expect(context.service.status(session.token)).toBe('paused')
  expect(context.service.cachedAuthorized(session.token)).toBe(false)
  expect(await context.db.prepare('SELECT grant_id FROM prerelease_revoked_grants').all()).toEqual([])
  expect(await context.db.prepare('SELECT revoked_at FROM prerelease_sessions').all()).toEqual([{ revoked_at: null }])
  context.advance(2)
  context.setStatus(async () => { throw new Error('source offline') })
  expect(await context.service.resolve(session.token)).toBeNull()
  const reopened = new PrereleaseSessions({ db: context.db, runtime, authority: context.authority, now: context.now })
  cleanup.push(async () => { reopened.close() })
  expect(await reopened.resolve(session.token)).toBeNull()
  expect(context.service.status(session.token)).toBe('paused')
  context.setStatus(async grantId => context.state(grantId))
  expect(await context.service.resolve(session.token)).toMatchObject({ user: session.user, expiresAt: session.expiresAt })
})

it('does not let an older negative confirmation override a newer qualification notification', async () => {
  const context = await setupConsumer(), session = await context.enter()
  const started = Promise.withResolvers<void>(), response = Promise.withResolvers<PrereleaseIdentityState>()
  let calls = 0
  context.setStatus(async () => { if (++calls > 1) throw new Error('source offline'); started.resolve(); return response.promise })
  context.advance(30_000)
  const resolving = context.service.resolve(session.token)
  await started.promise
  context.events.push({ id: '00000000-0000-4000-8000-000000000013', kind: 'beta_changed', userId: session.user.id, grantId: null, createdAt: context.now() })
  try {
    await expect(context.service.processEvents()).rejects.toThrow('source offline')
    response.resolve({ ...context.state('g'.repeat(42) + '1'), betaAccess: false })
    expect(await resolving).toBeNull()
    expect(context.service.status(session.token)).toBe('paused')
    expect(await context.db.prepare('SELECT grant_id FROM prerelease_revoked_grants').all()).toEqual([])
  } finally { response.resolve(context.state('g'.repeat(42) + '1')); await resolving }
})

it('revokes only the matching source grant and fences a stale in-flight refresh without deleting seats', async () => {
  const context = await setupConsumer(), first = await context.enter(), second = await context.enter()
  await context.db.prepare("INSERT INTO rooms(id,created_by,created_at,updated_at) VALUES('retained',?,1,1)").run(first.user.id)
  context.advance(30_000)
  let release: ((state: PrereleaseIdentityState) => void) | undefined, started: (() => void) | undefined
  const ready = new Promise<void>(done => { started = done })
  context.setStatus(async () => new Promise<PrereleaseIdentityState>(done => { release = done; started?.() }))
  const resolving = context.service.resolve(first.token)
  await ready
  context.events.push({ id: '00000000-0000-4000-8000-000000000002', kind: 'source_revoked', userId: first.user.id, grantId: 'g'.repeat(42) + '1', createdAt: context.now() })
  await context.service.processEvents()
  if (!release) throw new Error('Missing deferred refresh')
  release(context.state('g'.repeat(42) + '1'))
  expect(await resolving).toBeNull()
  context.setStatus(async grantId => context.state(grantId))
  expect(await context.service.resolve(first.token)).toBeNull()
  expect(await context.service.resolve(second.token)).toMatchObject({ user: second.user })
  expect(await context.db.prepare("SELECT id FROM rooms WHERE id='retained'").get()).toEqual({ id: 'retained' })
  expect(context.acknowledgements).toEqual(['00000000-0000-4000-8000-000000000002'])
})

it('rebinds every retained principal through the owner adapter while erasing old browser login rights', async () => {
  const context = await setupConsumer(), session = await context.enter()
  const generationId = '00000000-0000-4000-8000-000000000009'
  const packet = { generationId, targetId: runtime.targetId, targetOrigin: runtime.appOrigin, targetFingerprint: 'f'.repeat(64), receipts: [], associations: [{ userId: session.user.id, sourceGrantId: 'g'.repeat(42) + '1', associationId: 'a'.repeat(43), account: { kind: 'active', subject: { id: session.user.id, username: 'renamed', displayName: 'Renamed' } } }] }
  await expect(applyPrereleaseIdentityAudit(context.db, { ...packet, associations: [] })).rejects.toThrow('Unbound retained identity')
  expect(await context.service.resolve(session.token)).not.toBeNull()
  expect(await applyPrereleaseIdentityAudit(context.db, packet, context.now())).toEqual({ identities: 1, erased: 0 })
  expect(await context.service.resolve(session.token)).toBeNull()
  expect(await context.db.prepare('SELECT user_id,source_grant_id FROM prerelease_retained_identity_refs').all()).toEqual([{ user_id: 'formal-user', source_grant_id: 'a'.repeat(43) }])
  expect(await applyPrereleaseIdentityAudit(context.db, packet, context.now())).toEqual({ identities: 1, erased: 0 })
  const deleted = { ...packet, associations: [{ ...packet.associations[0], account: { kind: 'deleted' } }] }
  expect(await applyPrereleaseIdentityAudit(context.db, deleted, context.now())).toEqual({ identities: 0, erased: 1 })
  expect(await context.db.prepare('SELECT user_id FROM prerelease_retained_identity_refs').all()).toEqual([])
  expect(await context.db.prepare('SELECT id FROM users').all()).toEqual([])
  expect(await applyPrereleaseIdentityAudit(context.db, deleted, context.now())).toEqual({ identities: 0, erased: 1 })
})


it('caps a reopened session at the original source deadline rather than the seven-day maximum', async () => {
  const context = await setupConsumer({ sourceRemaining: 20_000 }), session = await context.enter()
  expect(session.expiresAt).toBe(1_800_000_020_000)
  expect(session.validUntil).toBe(1_800_000_020_000)
  context.advance(19_999)
  expect(context.service.cachedAuthorized(session.token)).toBe(true)
  context.advance(1)
  expect(await context.service.resolve(session.token)).toBeNull()
})

it('durably completes account erasure before acknowledgement and retries a lost acknowledgement without re-erasing', async () => {
  const context = await setupConsumer(), session = await context.enter()
  let erasures = 0, failErasure = true, failAck = true
  context.service.setAccountErasure(async id => {
    if (failErasure) throw new Error('cleanup offline')
    erasures++
    await context.db.prepare('DELETE FROM users WHERE id=?').run(id)
  })
  const acknowledge = context.authority.acknowledge
  context.authority.acknowledge = async id => { if (failAck) throw new Error('ack offline'); await acknowledge(id) }
  context.events.push({ id: '00000000-0000-4000-8000-000000000003', kind: 'account_deleted', userId: session.user.id, grantId: null, createdAt: context.now() })
  await expect(context.service.processEvents()).rejects.toThrow('cleanup offline')
  expect(context.acknowledgements).toEqual([])
  expect(context.service.cachedAuthorized(session.token)).toBe(false)
  failErasure = false
  await expect(context.service.processEvents()).rejects.toThrow('ack offline')
  expect(await context.db.prepare('SELECT id FROM users').all()).toEqual([])
  expect(erasures).toBe(1)
  failAck = false
  await context.service.processEvents()
  expect(erasures).toBe(1)
  expect(context.acknowledgements).toEqual(['00000000-0000-4000-8000-000000000003'])
  await expect(context.enter()).rejects.toThrow('Revoked prerelease identity')
})


it('cannot attach a local password, email, session or OAuth credential to an external principal', async () => {
  const context = await setupConsumer(), session = await context.enter()
  await expect(context.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('local-password', session.user.id)).rejects.toThrow('users_identity_credentials')
  await expect(context.db.prepare('UPDATE users SET email=? WHERE id=?').run('private@example.test', session.user.id)).rejects.toThrow('users_identity_credentials')
  await expect(context.db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)').run('forged-local-session', session.user.id, context.now() + 30_000, context.now())).rejects.toThrow('External prerelease principals')
  await expect(context.db.prepare('INSERT INTO auth_identities(id,user_id,provider,provider_user_id,linked_at) VALUES(?,?,?,?,?)').run('forged-oauth', session.user.id, 'github', 'external-oauth-id', context.now())).rejects.toThrow('External prerelease principals')
  expect(await context.service.resolve(session.token)).toMatchObject({ user: session.user })
})

it('does not publish an old positive handoff after a known Beta change arrives during exchange', async () => {
  const context = await setupConsumer(), oldState = context.state('g'.repeat(43))
  let release: ((state: PrereleaseIdentityState) => void) | undefined, notify: (() => void) | undefined
  const ready = new Promise<void>(done => { notify = done })
  context.authority.exchange = async () => new Promise<PrereleaseIdentityState>(done => { release = done; notify?.() })
  const opening = context.enter()
  await ready
  context.setBeta(false)
  context.events.push({ id: '00000000-0000-4000-8000-000000000004', kind: 'beta_changed', userId: 'formal-user', grantId: null, createdAt: context.now() })
  await context.service.processEvents()
  if (!release) throw new Error('Missing deferred exchange')
  release(oldState)
  await expect(opening).rejects.toThrow('Identity changed during handoff')
  expect(await context.db.prepare('SELECT id FROM users').all()).toEqual([])
})

it('keeps a newer Beta pause fenced while an older resolve finishes and its durable pause is still blocked', async () => {
  const context = await setupConsumer(), session = await context.enter()
  const latch = () => { let release = () => {}; const promise = new Promise<void>(done => { release = done }); return { promise, release } }
  const userLocked = latch(), identityLocked = latch(), releaseUser = latch(), releaseIdentity = latch(), betaSeen = latch()
  let lockingPid: number | undefined
  const holdingUser = context.db.transaction(async () => {
    await context.db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(session.user.id)
    lockingPid = (await context.db.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())?.pid
    userLocked.release(); await releaseUser.promise
  })()
  await userLocked.promise
  const holdingIdentity = context.db.transaction(async () => {
    await context.db.prepare('SELECT user_id FROM prerelease_external_identities WHERE user_id=? FOR UPDATE').get(session.user.id)
    identityLocked.release(); await releaseIdentity.promise
  })()
  await identityLocked.promise
  let resolving: Promise<unknown> | undefined, processing: Promise<unknown> | undefined
  let statusCalls = 0
  context.setStatus(async grantId => { if (++statusCalls > 1) throw new Error('source offline after invalidation'); return context.state(grantId) })
  try {
    context.advance(30_000)
    resolving = context.service.resolve(session.token)
    const deadline = Date.now() + 2000
    for (;;) {
      const waiting = await context.db.prepare('SELECT query FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid))').all<{ query: string }>(lockingPid)
      if (waiting.some(row => row.query.startsWith('UPDATE users SET username='))) break
      if (Date.now() > deadline) throw new Error('Refresh did not reach the profile lock')
      await new Promise(done => setTimeout(done, 1))
    }
    context.service.subscribeInvalidation(event => { if (event.reason === 'beta_changed') betaSeen.release() })
    context.events.push({ id: '00000000-0000-4000-8000-000000000005', kind: 'beta_changed', userId: session.user.id, grantId: null, createdAt: context.now() })
    processing = context.service.processEvents().catch(error => error)
    await betaSeen.promise
    releaseUser.release()
    expect(await resolving).toBeNull()
    expect(await context.service.resolve(session.token)).toBeNull()
    expect(statusCalls).toBe(2)
  } finally {
    releaseUser.release(); releaseIdentity.release()
    await Promise.allSettled([holdingUser, holdingIdentity, resolving, processing])
  }
})

it('does not persist a refresh response whose subject differs from the bound local session', async () => {
  const context = await setupConsumer(), session = await context.enter()
  context.advance(15_000)
  context.setStatus(async grantId => ({ ...context.state(grantId), account: { kind: 'active', subject: { id: 'other-user', username: 'other', displayName: 'Other User' } } }))
  await expect(context.service.refreshActive()).rejects.toThrow('Identity subject changed')
  const stored = await context.db.prepare('SELECT identity_state FROM prerelease_sessions WHERE user_id=?').get<{ identity_state: string }>(session.user.id)
  expect(stored && JSON.parse(stored.identity_state)).toMatchObject({ account: { subject: { id: 'formal-user' } }, confirmedAt: 1_800_000_000_000, validUntil: 1_800_000_030_000 })
})

it('does not retain unknown browser-token misses as issued-session invalidations', async () => {
  const context = await setupConsumer()
  for (let index = 0; index < 32; index++) {
    const token = String(index).padStart(43, 'u')
    expect(await context.service.resolve(token)).toBeNull()
    expect(context.service.status(token)).toBe('paused')
    await context.service.revoke(token)
    expect(context.service.status(token)).toBe('paused')
  }
})

it('requires an installed erasure adapter before acknowledging account deletion', async () => {
  const context = await setupConsumer(), session = await context.enter()
  const reopened = new PrereleaseSessions({ db: context.db, runtime, authority: context.authority, now: context.now })
  context.events.push({ id: '00000000-0000-4000-8000-000000000006', kind: 'account_deleted', userId: session.user.id, grantId: null, createdAt: context.now() })
  await expect(reopened.processEvents()).rejects.toThrow('Prerelease account erasure adapter is not configured')
  expect(context.acknowledgements).toEqual([])
  expect(await context.db.prepare('SELECT id FROM users WHERE id=?').get(session.user.id)).toEqual({ id: session.user.id })
  expect(await reopened.resolve(session.token)).toBeNull()
})

it.each(['deleted account', 'revoked source'])('honors a durable %s fence when reopening an older persisted session', async kind => {
  const context = await setupConsumer(), session = await context.enter()
  if (kind === 'deleted account') {
    await context.db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?)').run(session.user.id, context.now())
  } else {
    await context.db.prepare('INSERT INTO prerelease_revoked_grants(grant_id,user_id,generation_id,revoked_at) VALUES(?,?,?,?)')
      .run('g'.repeat(42) + '1', session.user.id, runtime.generationId, context.now())
  }
  const reopened = new PrereleaseSessions({ db: context.db, runtime, authority: context.authority, now: context.now })
  expect(await reopened.resolve(session.token)).toBeNull()
  expect(reopened.cachedAuthorized(session.token)).toBe(false)
})

it('does not acknowledge deletion or publish a handoff while its identity transaction is waiting at COMMIT', async () => {
  const context = await setupConsumer(), locked = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let exchangePid: number | undefined
  const changed = Promise.withResolvers<void>()
  context.service.subscribeInvalidation(event => { if (event.reason === 'account_deleted') changed.resolve() })
  context.authority.exchange = async () => {
    exchangePid = (await context.db.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())?.pid
    return context.state('g'.repeat(43))
  }
  await context.db.exec(`CREATE FUNCTION test_delay_identity_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(166300014); RETURN NEW; END $$;
    CREATE CONSTRAINT TRIGGER test_delay_identity_commit AFTER INSERT ON prerelease_sessions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_delay_identity_commit();`)
  const holding = context.db.transaction(async () => {
    await context.db.prepare('SELECT pg_advisory_xact_lock(166300014)').get()
    locked.resolve(); await release.promise
  })()
  const waitFor = async (predicate: () => Promise<boolean>) => {
    const deadline = Date.now() + 3000
    while (!await predicate()) {
      if (Date.now() >= deadline) throw new Error('Identity transaction did not reach its controlled boundary')
      await new Promise(done => setTimeout(done, 2))
    }
  }
  let opening: Promise<unknown> | undefined, processing: Promise<unknown> | undefined
  try {
    await locked.promise
    opening = context.enter().then(value => ({ opened: true, value }), error => ({ opened: false, error }))
    await waitFor(async () => {
      if (!exchangePid) return false
      const row = await context.db.prepare('SELECT query,wait_event FROM pg_stat_activity WHERE pid=?').get<{ query: string; wait_event: string }>(exchangePid)
      return row?.query === 'COMMIT' && row.wait_event === 'advisory'
    })
    context.events.push({ id: '00000000-0000-4000-8000-000000000007', kind: 'account_deleted', userId: 'formal-user', grantId: null, createdAt: context.now() })
    processing = context.service.processEvents()
    await changed.promise
    await waitFor(async () => context.acknowledgements.length > 0 || !!await context.db.prepare(`SELECT 1 FROM pg_stat_activity
      WHERE wait_event='advisory' AND query LIKE '%open-agricola:pre-subject:%' LIMIT 1`).get())
    expect(context.acknowledgements).toEqual([])
    release.resolve()
    await holding
    expect(await opening).toMatchObject({ opened: false, error: expect.objectContaining({ message: 'Identity changed during handoff' }) })
    await processing
    expect(context.acknowledgements).toEqual(['00000000-0000-4000-8000-000000000007'])
    expect(await context.db.prepare('SELECT id FROM users').all()).toEqual([])
    expect(await context.db.prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
    const reopened = new PrereleaseSessions({ db: context.db, runtime, authority: context.authority, now: context.now })
    const begin = await reopened.beginHandoff(), params = new URLSearchParams(new URL(begin.formalUrl).hash.slice(1))
    await expect(reopened.exchangeHandoff(begin.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state: params.get('state')!,
      browserChallenge: params.get('browserChallenge')!, returnTo: `${runtime.formalAppOrigin}/` })).rejects.toThrow('Revoked prerelease identity')
  } finally {
    release.resolve()
    await Promise.allSettled([holding, opening, processing])
  }
})
