import { createHash, randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { PrereleaseIdentityState } from '../../shared/contract/prerelease-identity'
import { PrereleaseAuthority } from '../prerelease-authority'
import { PrereleaseIdentityLifecycle } from '../prerelease-identity-lifecycle'
import { PrereleaseSessions } from '../prerelease-sessions'
import { createTestDatabase } from './_helpers/postgres'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.unstubAllEnvs()
})

async function setup() {
  vi.stubEnv('RELEASE_CHANNEL', 'stable')
  vi.stubEnv('ADMIN_USERS', '')
  const source = await createTestDatabase(), pre = await createTestDatabase()
  cleanup.push(() => source.close(), () => pre.close())
  let now = 1_800_000_000_000
  const target = { sourceOrigin: 'https://formal.example.test', targetOrigin: 'https://pre.example.test', serviceKey: 'fixture-service-key-with-at-least-32-bytes', entryEnabled: true }
  const generationId = randomUUID(), lifecycle = new PrereleaseIdentityLifecycle(source), formal = new PrereleaseAuthority(source, () => now)
  const targetId = 'prerelease-scoped', auditOperationId = randomUUID()
  await lifecycle.apply({ action: 'prepare', targetOrigin: target.targetOrigin, generationId, operationId: randomUUID(), targetId, expectedPreviousGenerationId: null }, target.targetOrigin)
  await lifecycle.apply({ action: 'audit-complete', targetOrigin: target.targetOrigin, generationId, operationId: auditOperationId,
    identityManifestSha256: createHash('sha256').update('[]').digest('hex'), identityCount: 0, verificationReceiptSha256: 'f'.repeat(64) }, target.targetOrigin)
  await lifecycle.apply({ action: 'activate', targetOrigin: target.targetOrigin, generationId, operationId: randomUUID(), auditOperationId }, target.targetOrigin)
  for (const id of ['alice', 'bob']) {
    await source.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id, id, id, 'private-password-hash', now)
    await source.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,auth_policy_version) VALUES(?,?,?,?,2)').run(`${id}-formal-token`, id, now + 9 * 86_400_000, now)
    await source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(id, now)
  }
  let onExchange = async (_state: PrereleaseIdentityState) => {}, onStatus = async (_state: PrereleaseIdentityState) => {}
  let exchanges = 0
  const options: ConstructorParameters<typeof PrereleaseSessions>[0] = { db: pre, now: () => now, eraseAccount: async userId => { await pre.prepare('DELETE FROM users WHERE id=?').run(userId) },
    runtime: { buildId: 'a'.repeat(40), generationId, appOrigin: target.targetOrigin, formalAppOrigin: target.sourceOrigin, formalApiBase: target.sourceOrigin, targetId },
    authority: {
      exchange: async input => {
        exchanges++
        const state = await formal.exchange(target, { ...input, generationId })
        await onExchange(state)
        return state
      },
      status: async grantId => { const state = await formal.status(target, grantId, generationId); await onStatus(state); return state },
      events: () => formal.events(target, generationId),
      acknowledge: async (id, outcome) => { await formal.acknowledge(target, generationId, id, outcome) },
    },
  }
  const service = new PrereleaseSessions(options)
  cleanup.push(async () => { service.close() })
  const peer = () => {
    const consumer = new PrereleaseSessions({ ...options, runtime: { ...options.runtime } })
    cleanup.push(async () => { consumer.close() })
    return consumer
  }
  async function packet(userId: string) {
    const begin = await service.beginHandoff(), params = new URLSearchParams(new URL(begin.formalUrl).hash.slice(1))
    const state = params.get('state'), browserChallenge = params.get('browserChallenge')
    if (!state || !browserChallenge) throw new Error('Missing browser binding')
    const issued = await formal.issue(`${userId}-formal-token`, target, { browserChallenge, returnTo: `${target.sourceOrigin}/` })
    return { cookie: begin.cookie, input: { protocolVersion: 1, code: issued.code, state, browserChallenge, returnTo: `${target.sourceOrigin}/` } }
  }
  async function enter(userId: string) { const value = await packet(userId); return service.exchangeHandoff(value.cookie, value.input) }
  return { source, pre, service, peer, packet, enter, advance: (ms: number) => { now += ms }, exchanges: () => exchanges,
    onExchange: (callback: typeof onExchange) => { onExchange = callback }, onStatus: (callback: typeof onStatus) => { onStatus = callback } }
}

it.each(['logout', 'beta', 'lease-expiry'])('preserves Alice\'s consumed handoff and retry when Bob changes %s', async reason => {
  const context = await setup(), bob = await context.enter('bob')
  context.advance(15_000)
  const packet = await context.packet('alice'), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onExchange(async state => { if (state.account.kind === 'active' && state.account.subject.id === 'alice') { entered.resolve(); await release.promise } })
  const pending = context.service.exchangeHandoff(packet.cookie, packet.input)
  const firstResult = pending.then(value => ({ value }), error => ({ error }))
  try {
    await Promise.race([entered.promise, firstResult.then(result => { if ('error' in result) throw result.error; throw new Error('Exchange completed before its barrier') })])
    expect(await context.source.prepare('SELECT 1 FROM prerelease_identity_handoffs WHERE user_id=?').get('alice')).toBeUndefined()
    expect(await context.source.prepare('SELECT count(*)::integer AS count FROM prerelease_identity_grants WHERE user_id=?').get('alice')).toEqual({ count: 1 })
    if (reason === 'logout') await context.service.revoke(bob.token)
    else if (reason === 'beta') {
      await context.source.prepare('DELETE FROM beta_access WHERE user_id=?').run('bob')
      await context.service.processEvents()
    } else { context.advance(15_000); await context.service.refreshActive() }
    release.resolve()
    const first = await firstResult
    const retry = await context.service.exchangeHandoff(packet.cookie, packet.input, 'value' in first ? first.value.token : '')
      .then(value => ({ value }), error => ({ error }))
    expect(first).toMatchObject({ value: { user: { id: 'alice' } } })
    expect(retry).toMatchObject({ value: { user: { id: 'alice' } } })
    expect(context.exchanges()).toBe(2)
  } finally { release.resolve(); await firstResult }
})

it('publishes Alice\'s fresh status when Bob logs out during the source response', async () => {
  const context = await setup(), alice = await context.enter('alice')
  context.advance(15_000)
  const bob = await context.enter('bob')
  context.advance(15_000)
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onStatus(async state => { if (state.account.kind === 'active' && state.account.subject.id === 'alice') { entered.resolve(); await release.promise } })
  const pending = context.service.resolve(alice.token)
  try {
    await entered.promise
    await context.service.revoke(bob.token)
    release.resolve()
    expect(await pending).toMatchObject({ user: { id: 'alice' }, validUntil: 1_800_000_060_000 })
    expect(context.service.cachedAuthorized(alice.token)).toBe(true)
  } finally { release.resolve(); await pending }
})

it('retries a consumed callback after a transient same-user recheck without needing a session Cookie', async () => {
  const context = await setup(), packet = await context.packet('alice')
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onExchange(async () => { entered.resolve(); await release.promise })
  const pending = context.service.exchangeHandoff(packet.cookie, packet.input)
  const outcome = pending.then(value => ({ value }), error => ({ error }))
  try {
    await Promise.race([entered.promise, outcome.then(result => { if ('error' in result) throw result.error; throw new Error('Exchange completed before its barrier') })])
    await context.source.prepare('DELETE FROM beta_access WHERE user_id=?').run('alice')
    await context.source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run('alice', 1_800_000_000_001)
    await context.service.processEvents()
    release.resolve()
    expect(await outcome).toMatchObject({ error: { kind: 'paused' } })
  } finally { release.resolve(); await outcome }
  expect(await context.source.prepare('SELECT count(*)::int AS count FROM prerelease_identity_handoffs WHERE user_id=?').get('alice')).toEqual({ count: 0 })
  expect(await context.pre.prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
  const retried = await context.service.exchangeHandoff(packet.cookie, packet.input)
  expect(retried.user.id).toBe('alice')
  expect(context.exchanges()).toBe(1)
})

it('recovers a consumed callback after its session commits but its response lease expires', async () => {
  const context = await setup(), packet = await context.packet('alice')
  const transaction = context.pre.transaction.bind(context.pre)
  let expired = false
  function expireAfterSessionCommit<Args extends unknown[], Result>(work: (...args: Args) => Result) {
    const run = transaction(work)
    return async (...args: Args): Promise<Awaited<Result>> => {
      const result = await run(...args)
      if (!expired && await context.pre.prepare('SELECT 1 FROM prerelease_sessions').get()) {
        expired = true
        context.advance(31_000)
      }
      return result
    }
  }
  const spy = vi.spyOn(context.pre, 'transaction').mockImplementation(expireAfterSessionCommit)
  try {
    await expect(context.service.exchangeHandoff(packet.cookie, packet.input)).rejects.toMatchObject({ kind: 'paused' })
    expect(expired).toBe(true)
    const committed = await context.pre.prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()
    expect(committed).toHaveLength(1)
    expect(await context.source.prepare('SELECT 1 FROM prerelease_identity_handoffs WHERE user_id=?').get('alice')).toBeUndefined()
    const recovered = await context.service.exchangeHandoff(packet.cookie, packet.input)
    expect(recovered.user.id).toBe('alice')
    expect(createHash('sha256').update(recovered.token).digest('base64url')).toBe(committed[0]?.token_hash)
    expect(await context.pre.prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()).toEqual(committed)
    expect(context.exchanges()).toBe(1)
  } finally { spy.mockRestore() }
})

it.each(['same', 'peer'] as const)('never republishes a receipt session logged out by the %s consumer after recovery commits', async consumer => {
  const context = await setup(), packet = await context.packet('alice')
  const original = await context.service.exchangeHandoff(packet.cookie, packet.input)
  const revoker = consumer === 'peer' ? context.peer() : context.service
  const transaction = context.pre.transaction.bind(context.pre)
  let commits = 0, loggedOut = false
  function logoutAfterRecoveryCommit<Args extends unknown[], Result>(work: (...args: Args) => Result) {
    const run = transaction(work)
    return async (...args: Args): Promise<Awaited<Result>> => {
      const result = await run(...args)
      if (++commits === 2) {
        await revoker.revoke(original.token)
        loggedOut = true
      }
      return result
    }
  }
  const spy = vi.spyOn(context.pre, 'transaction').mockImplementation(logoutAfterRecoveryCommit)
  try {
    await expect(context.service.exchangeHandoff(packet.cookie, packet.input)).rejects.toMatchObject({ kind: 'paused' })
    expect(loggedOut).toBe(true)
    expect(context.service.cachedAuthorized(original.token)).toBe(false)
    expect(await context.service.resolve(original.token)).toBeNull()
    expect(context.service.status(original.token)).toBe('expired')
    expect(context.exchanges()).toBe(1)
  } finally { spy.mockRestore() }
})

it.each(['beta', 'source', 'deletion', 'expiry', 'buildId', 'generationId'] as const)(
  'never recovers a receipt after %s invalidates its original authority', async reason => {
    const context = await setup(), packet = await context.packet('alice')
    await context.service.exchangeHandoff(packet.cookie, packet.input)
    if (reason === 'expiry') context.advance(60_000)
    else if (reason === 'buildId') context.service.runtime.buildId = 'b'.repeat(40)
    else if (reason === 'generationId') context.service.runtime.generationId = randomUUID()
    else {
      if (reason === 'deletion') await context.source.prepare('INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES(?,0,0)').run('alice')
      else await context.source.prepare(reason === 'beta' ? 'DELETE FROM beta_access WHERE user_id=?' : 'DELETE FROM sessions WHERE user_id=?').run('alice')
      await context.service.processEvents()
    }
    await expect(context.service.exchangeHandoff(packet.cookie, packet.input)).rejects.toMatchObject({
      kind: ['expiry', 'buildId', 'generationId', 'deletion'].includes(reason) ? 'invalid' : 'expired',
    })
    expect(context.exchanges()).toBe(1)
  },
)

it.each(['beta', 'source', 'deletion', 'close'])('still fences an unknown Alice handoff during her own %s invalidation', async reason => {
  const context = await setup(), packet = await context.packet('alice')
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onExchange(async () => { entered.resolve(); await release.promise })
  const pending = context.service.exchangeHandoff(packet.cookie, packet.input).catch((error: unknown) => error)
  try {
    await entered.promise
    expect(await context.pre.prepare('SELECT 1 FROM users WHERE id=?').get('alice')).toBeUndefined()
    if (reason === 'close') context.service.close()
    else {
      if (reason === 'deletion') await context.source.prepare('INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES(?,0,0)').run('alice')
      else await context.source.prepare(reason === 'beta' ? 'DELETE FROM beta_access WHERE user_id=?' : 'DELETE FROM sessions WHERE user_id=?').run('alice')
      await context.service.processEvents()
    }
    release.resolve()
    expect(await pending).toMatchObject({ kind: reason === 'source' || reason === 'deletion' ? 'expired' : 'paused' })
    expect(await context.pre.prepare('SELECT 1 FROM prerelease_sessions').get()).toBeUndefined()
  } finally { release.resolve(); await pending }
})

it.each(['handoff', 'status'])('keeps Alice\'s independent %s after her other local token logs out', async path => {
  const context = await setup(), old = await context.enter('alice')
  context.advance(15_000)
  const packet = await context.packet('alice')
  const current = path === 'status' ? await context.service.exchangeHandoff(packet.cookie, packet.input) : undefined
  if (current) context.advance(30_000)
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const barrier = async () => { entered.resolve(); await release.promise }
  if (current) context.onStatus(barrier)
  else context.onExchange(barrier)
  const pending = current ? context.service.resolve(current.token) : context.service.exchangeHandoff(packet.cookie, packet.input)
  const result = pending.then(value => ({ value }), error => ({ error }))
  try {
    await entered.promise
    await context.service.revoke(old.token)
    release.resolve()
    expect(await result).toMatchObject({ value: { user: { id: 'alice' } } })
    expect(await context.service.resolve(old.token)).toBeNull()
    if (current) expect(context.service.cachedAuthorized(current.token)).toBe(true)
  } finally { release.resolve(); await result }
})

it('fences a new grant when Alice logs out all of her local sessions during exchange', async () => {
  const context = await setup(), old = await context.enter('alice'), packet = await context.packet('alice')
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onExchange(async () => { entered.resolve(); await release.promise })
  const pending = context.service.exchangeHandoff(packet.cookie, packet.input).catch((error: unknown) => error)
  try {
    await entered.promise
    await context.service.revoke(old.token, true)
    release.resolve()
    expect(await pending).toMatchObject({ kind: 'expired' })
    expect(await context.pre.prepare('SELECT 1 FROM prerelease_sessions WHERE revoked_at IS NULL').get()).toBeUndefined()
    await expect(context.service.exchangeHandoff(packet.cookie, packet.input)).rejects.toMatchObject({ kind: 'expired' })
    const fresh = await context.enter('alice')
    expect(fresh.user.id).toBe('alice')
    expect(await context.service.resolve(old.token)).toBeNull()
  } finally { release.resolve(); await pending }
})

it.each(['buildId', 'generationId'])('fences an unknown Alice handoff when the runtime %s changes', async field => {
  const context = await setup(), packet = await context.packet('alice')
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onExchange(async () => { entered.resolve(); await release.promise })
  const pending = context.service.exchangeHandoff(packet.cookie, packet.input).catch((error: unknown) => error)
  try {
    await entered.promise
    if (field === 'buildId') context.service.runtime.buildId = 'b'.repeat(40)
    else context.service.runtime.generationId = randomUUID()
    release.resolve()
    expect(await pending).toMatchObject(field === 'buildId' ? { kind: 'paused' } : { message: 'Identity authority binding mismatch' })
    expect(await context.pre.prepare('SELECT 1 FROM prerelease_sessions').get()).toBeUndefined()
  } finally { release.resolve(); await pending }
})

it('keeps Alice\'s proactive lease refresh when Bob logs out during its source response', async () => {
  const context = await setup(), alice = await context.enter('alice')
  context.advance(5_000)
  const bob = await context.enter('bob')
  context.advance(10_000)
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  context.onStatus(async state => { if (state.account.kind === 'active' && state.account.subject.id === 'alice') { entered.resolve(); await release.promise } })
  const pending = context.service.refreshActive()
  try {
    await entered.promise
    await context.service.revoke(bob.token)
    release.resolve()
    await pending
    expect(await context.service.resolve(alice.token)).toMatchObject({ user: { id: 'alice' }, validUntil: 1_800_000_045_000 })
    expect(context.service.cachedAuthorized(alice.token)).toBe(true)
  } finally { release.resolve(); await pending }
})
