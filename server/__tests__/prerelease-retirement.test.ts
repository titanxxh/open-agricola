import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { migratePostgres } from '../database/migrations'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { isPrereleaseIdentityAuthorized } from '../../shared/contract/prerelease-identity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCookie } from '../auth-cookies'
import { createPrereleaseAuthorityHandler } from '../prerelease-authority-routes'
import { createPrereleaseLifecycleHandler } from '../prerelease-lifecycle-routes'
import { createTestDatabase } from './_helpers/postgres'

const sourceOrigin = 'https://formal.example.test'
const targetOrigin = 'https://pre.beta.test'
const serviceKey = 'fixture-only-target-service-key-32-bytes'
const firstGeneration = '00000000-0000-4000-8000-000000000001'
const secondGeneration = '00000000-0000-4000-8000-000000000002'
const operation = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const purgeReceiptSha256 = 'a'.repeat(64)
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllEnvs()
})

async function setup() {
  vi.stubEnv('PUBLIC_APP_ORIGIN', sourceOrigin)
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.test')
  vi.stubEnv('PRERELEASE_APP_ORIGIN', targetOrigin)
  vi.stubEnv('PRERELEASE_IDENTITY_SERVICE_KEY', serviceKey)
  vi.stubEnv('PRERELEASE_ENTRY_ENABLED', 'true')
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  let now = 1_800_000_000_000
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('player','player','Player','',?)").run(now)
  await db.prepare("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES('source','player',?,?)").run(now + 604_800_000, now)
  await db.prepare("INSERT INTO beta_access(user_id,granted_at) VALUES('player',?)").run(now)
  const handler = createPrereleaseAuthorityHandler({ db, now: () => now, getSourceToken: async req => readCookie(req.headers.cookie, 'oa_session') })
  const lifecycle = createPrereleaseLifecycleHandler({ db, now: () => now, requireAdmin: async (req, res) => {
    if (req.headers['x-fixture-role'] === 'owner') return { id: 'owner' }
    res.writeHead(req.headers['x-fixture-role'] === 'player' ? 403 : 401).end()
    return null
  } })
  const server = createServer((req, res) => {
    void (async () => {
      if (!await lifecycle(req, res) && !await handler(req, res)) res.writeHead(404).end()
    })().catch(() => res.writeHead(500).end())
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close(error => error ? reject(error) : resolve())
  }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture HTTP address')
  const base = `http://127.0.0.1:${address.port}`
  const binding = { protocolVersion: 1, channel: 'prerelease', targetOrigin }
  const owner = (input: unknown, headers: Record<string, string> = {}) => fetch(`${base}/api/admin/prerelease-identity/lifecycle`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: sourceOrigin, 'x-fixture-role': 'owner', ...headers }, body: JSON.stringify(input),
  })
  const action = (actionName: string, id: number, generationId = firstGeneration, extra = {}) => owner({
    ...binding, action: actionName, operationId: operation(id), generationId, ...extra,
  })
  const read = (generationId?: string) => fetch(`${base}/api/admin/prerelease-identity/lifecycle?targetOrigin=${encodeURIComponent(targetOrigin)}${generationId ? `&generationId=${generationId}` : ''}`, { headers: { 'x-fixture-role': 'owner' } })
  const internal = (path: string, generationId = firstGeneration, input = {}) => fetch(`${base}/api/prerelease/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...binding, generationId, ...input }),
  })
  const entry = () => fetch(`${base}/api/prerelease/entry`, { headers: { cookie: 'oa_session=source', origin: sourceOrigin } })
  const issue = () => fetch(`${base}/api/prerelease/handoffs`, {
    method: 'POST', headers: { cookie: 'oa_session=source', origin: sourceOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ ...binding, browserChallenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'), returnTo: `${sourceOrigin}/` }),
  })
  const enter = async (generationId = firstGeneration) => {
    const handoff = await (await issue()).json()
    const response = await internal('exchange', generationId, { code: handoff.code, browserVerifier: 'v'.repeat(43), returnTo: `${sourceOrigin}/` })
    expect(response.status).toBe(200)
    return (await response.json()).state
  }
  const open = async (generationId = firstGeneration, previous: string | null = null, start = 1) => {
    expect((await action('prepare', start, generationId, { targetId: 'fixture-pre', expectedPreviousGenerationId: previous })).status).toBe(200)
    expect((await action('audit-complete', start + 1, generationId, { identityManifestSha256: createHash('sha256').update('[]').digest('hex'), identityCount: 0, verificationReceiptSha256: 'b'.repeat(64) })).status).toBe(200)
    expect((await action('activate', start + 2, generationId, { auditOperationId: operation(start + 1) })).status).toBe(200)
  }
  return { open, db, action, owner, read, internal, entry, issue, enter, advance: (ms: number) => { now += ms } }
}

describe('trusted prerelease generation retirement', () => {
  it('keeps a new generation closed until owner activation and records an idempotent verified-erasure receipt', async () => {
    const { action, read, entry, enter, internal, advance } = await setup()
    expect(await (await entry()).json()).toMatchObject({ entry: { kind: 'disabled' } })
    expect((await action('prepare', 1, firstGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: null })).status).toBe(200)
    expect(await (await read()).json()).toMatchObject({ generation: { generationId: firstGeneration, state: 'closed', retirement: null } })
    expect((await action('audit-complete', 6, firstGeneration, { identityManifestSha256: createHash('sha256').update('[]').digest('hex'), identityCount: 0, verificationReceiptSha256: 'b'.repeat(64) })).status).toBe(200)
    expect((await action('activate', 2, firstGeneration, { auditOperationId: operation(6) })).status).toBe(200)
    const state = await enter()
    expect(state.generationId).toBe(firstGeneration)
    expect((await action('retire', 3, firstGeneration, { purgeReceiptSha256 })).status).toBe(409)
    expect((await action('close', 4)).status).toBe(200)
    expect(await (await entry()).json()).toMatchObject({ entry: { kind: 'disabled' } })
    const retired = await action('retire', 5, firstGeneration, { purgeReceiptSha256 })
    expect(retired.status).toBe(200)
    const receipt = await retired.json()
    expect(receipt).toEqual({ ok: true, protocolVersion: 1, receipt: {
      action: 'retire', operationId: operation(5), generationId: firstGeneration, targetId: 'fixture-pre', targetOrigin,
      purgeReceiptSha256, completedAt: 1_800_000_000_000,
    } })
    advance(20_000)
    expect(await (await action('retire', 5, firstGeneration, { purgeReceiptSha256 })).json()).toEqual(receipt)
    expect(await (await read()).json()).toMatchObject({ generation: { state: 'retired', retirement: receipt.receipt } })
    expect((await internal('status', firstGeneration, { grantId: state.grantId })).status).toBe(404)
    expect(await (await internal('events')).json()).toMatchObject({ events: [] })
  })

  it('refuses activation until a fresh source-checked audit proves the retained identity manifest', async () => {
    const { action } = await setup()
    expect((await action('prepare', 1, firstGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: null })).status).toBe(200)
    expect((await action('activate', 2, firstGeneration, { auditOperationId: operation(99) })).status).toBe(409)
  })


  it('rebinds restored principals without login rights and rejects a stale deletion audit before opening', async () => {
    const fixture = await setup()
    const { action, enter, internal, db } = fixture
    const empty = createHash('sha256').update('[]').digest('hex')
    expect((await action('prepare', 1, firstGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: null })).status).toBe(200)
    expect((await action('audit-complete', 2, firstGeneration, { identityManifestSha256: empty, identityCount: 0, verificationReceiptSha256: 'b'.repeat(64) })).status).toBe(200)
    expect((await action('activate', 3, firstGeneration, { auditOperationId: operation(2) })).status).toBe(200)
    const original = await enter()
    expect((await action('close', 4)).status).toBe(200)
    expect((await action('retire', 5, firstGeneration, { purgeReceiptSha256 })).status).toBe(200)
    expect((await action('prepare', 6, secondGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: firstGeneration })).status).toBe(200)
    const refs = [{ userId: 'player', sourceGrantId: original.grantId }]
    const associated = await action('associate', 7, secondGeneration, { refs })
    expect(associated.status).toBe(200)
    const batch = await associated.json()
    expect(batch.associations).toEqual([{ ...refs[0], associationId: expect.any(String), account: { kind: 'active', subject: { id: 'player', username: 'player', displayName: 'Player' } } }])
    const associationId = batch.associations[0].associationId
    const bound = (await (await internal('status', secondGeneration, { grantId: associationId })).json()).state
    expect(bound.source).toEqual({ kind: 'invalid' })
    expect(bound.grant.kind).toBe('revoked')
    expect(isPrereleaseIdentityAuthorized(bound, 1_800_000_000_000, secondGeneration)).toBe(false)
    const manifest = createHash('sha256').update(canonicalJson([{ userId: 'player', sourceGrantId: associationId }])).digest('hex')
    expect((await action('audit-complete', 8, secondGeneration, { identityManifestSha256: manifest, identityCount: 1, verificationReceiptSha256: 'c'.repeat(64) })).status).toBe(200)
    await db.prepare("INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES('player',1,1)").run()
    expect((await action('activate', 9, secondGeneration, { auditOperationId: operation(8) })).status).toBe(409)
    const changed = await (await action('associate', 10, secondGeneration, { refs })).json()
    expect(changed.associations).toEqual([{ ...refs[0], associationId, account: { kind: 'deleted' } }])
    const complete = await action('audit-complete', 11, secondGeneration, { identityManifestSha256: empty, identityCount: 0, verificationReceiptSha256: 'd'.repeat(64) })
    expect(complete.status).toBe(200)
    expect((await action('activate', 12, secondGeneration, { auditOperationId: operation(11) })).status).toBe(200)
    expect(await (await internal('events', secondGeneration)).json()).toMatchObject({ events: [] })
  })


  it('cannot apply stale retirement or handoffs to a newly opened generation', async () => {
    const { open, action, enter, issue, internal, read } = await setup()
    await open()
    const oldState = await enter()
    const pending = await (await issue()).json()
    expect((await action('close', 4)).status).toBe(200)
    const oldRetirement = await (await action('retire', 5, firstGeneration, { purgeReceiptSha256 })).json()
    expect((await action('prepare', 6, firstGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: firstGeneration })).status).toBe(409)
    expect((await action('prepare', 7, secondGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: null })).status).toBe(409)
    await open(secondGeneration, firstGeneration, 10)
    expect(await (await action('retire', 5, firstGeneration, { purgeReceiptSha256 })).json()).toEqual(oldRetirement)
    expect(await (await action('retire', 99, firstGeneration, { purgeReceiptSha256 })).json()).toEqual(oldRetirement)
    expect((await action('retire', 5, firstGeneration, { purgeReceiptSha256: 'f'.repeat(64) })).status).toBe(409)
    expect((await action('close', 100, firstGeneration)).status).toBe(409)
    expect((await action('activate', 101, firstGeneration, { auditOperationId: operation(2) })).status).toBe(409)
    expect(await (await read()).json()).toMatchObject({ generation: { generationId: secondGeneration, state: 'open' } })
    expect((await internal('exchange', secondGeneration, { code: pending.code, browserVerifier: 'v'.repeat(43), returnTo: `${sourceOrigin}/` })).status).toBe(409)
    const nextState = await enter(secondGeneration)
    expect(nextState.grantId).not.toBe(oldState.grantId)
    expect(isPrereleaseIdentityAuthorized(oldState, 1_800_000_000_000, secondGeneration)).toBe(false)
    expect(isPrereleaseIdentityAuthorized(nextState, 1_800_000_000_000, secondGeneration)).toBe(true)
  })

  it('serializes source deletion against verified erasure and creates no future obligations for purged identities', async () => {
    const { open, action, enter, internal, db } = await setup()
    await open()
    await enter()
    expect((await action('close', 4)).status).toBe(200)
    const [retired] = await Promise.all([
      action('retire', 5, firstGeneration, { purgeReceiptSha256 }),
      db.prepare("INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES('player',1,1)").run(),
    ])
    expect(retired.status).toBe(200)
    expect(await (await internal('events')).json()).toMatchObject({ events: [] })
    await db.transaction(async () => {
      await db.prepare("DELETE FROM sessions WHERE user_id='player'").run()
      await db.prepare("DELETE FROM users WHERE id='player'").run()
    })()
    expect(await (await internal('events')).json()).toMatchObject({ events: [] })
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('replacement','player','Replacement','',1)").run()
  })

  it('does not refresh an expired audit by replay and requires a new audit after closing admission', async () => {
    const { action, advance } = await setup()
    const proof = { identityManifestSha256: createHash('sha256').update('[]').digest('hex'), identityCount: 0, verificationReceiptSha256: 'b'.repeat(64) }
    expect((await action('prepare', 1, firstGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: null })).status).toBe(200)
    const completed = await (await action('audit-complete', 2, firstGeneration, proof)).json()
    advance(30_000)
    expect(await (await action('audit-complete', 2, firstGeneration, proof)).json()).toEqual(completed)
    expect((await action('activate', 3, firstGeneration, { auditOperationId: operation(2) })).status).toBe(409)
    expect((await action('audit-complete', 4, firstGeneration, proof)).status).toBe(200)
    const activated = await action('activate', 5, firstGeneration, { auditOperationId: operation(4) })
    expect(activated.status).toBe(200)
    expect(await activated.json()).toMatchObject({ receipt: { auditOperationId: operation(4) } })
    expect((await action('close', 6)).status).toBe(200)
    expect((await action('activate', 7, firstGeneration, { auditOperationId: operation(4) })).status).toBe(409)
  })

  it('rejects unknown or misattributed restored references atomically and accepts already-remapped retries', async () => {
    const { open, action, enter, internal } = await setup()
    await open()
    const previous = await enter()
    expect((await action('close', 4)).status).toBe(200)
    expect((await action('retire', 5, firstGeneration, { purgeReceiptSha256 })).status).toBe(200)
    expect((await action('prepare', 6, secondGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: firstGeneration })).status).toBe(200)
    expect((await action('associate', 7, secondGeneration, { refs: [{ userId: 'someone-else', sourceGrantId: previous.grantId }] })).status).toBe(400)
    expect((await action('associate', 8, secondGeneration, { refs: [{ userId: 'player', sourceGrantId: previous.grantId }, { userId: 'player', sourceGrantId: 'z'.repeat(43) }] })).status).toBe(400)
    expect((await action('audit-complete', 80, secondGeneration, { identityCount: 0, identityManifestSha256: createHash('sha256').update('[]').digest('hex'), verificationReceiptSha256: 'b'.repeat(64) })).status).toBe(200)
    const completed = await (await action('associate', 9, secondGeneration, { refs: [{ userId: 'player', sourceGrantId: previous.grantId }] })).json()
    const current = completed.associations[0].associationId
    const replay = await (await action('associate', 10, secondGeneration, { refs: [{ userId: 'player', sourceGrantId: current }] })).json()
    expect(replay.associations[0].associationId).toBe(current)
    expect((await internal('status', secondGeneration, { grantId: current })).status).toBe(200)
    expect((await action('audit-complete', 11, secondGeneration, { identityCount: 0, identityManifestSha256: createHash('sha256').update('[]').digest('hex'), verificationReceiptSha256: 'b'.repeat(64) })).status).toBe(409)
  })

  it('upgrades real037/038 associations into closed revoked generations without pretending they were purged', async () => {
    const { db, entry, read, internal, action } = await setup()
    const row = await db.prepare('SELECT current_schema() AS name').get<{ name: string }>()
    if (!row || !/^test_[a-f0-9]+$/.test(row.name)) throw new Error('Expected isolated test schema')
    await db.exec(`DROP SCHEMA "${row.name}" CASCADE; CREATE SCHEMA "${row.name}"`)
    await db.exec('CREATE TABLE postgres_schema_migrations(version integer PRIMARY KEY)')
    const directory = new URL('../database/', import.meta.url)
    const migrations = ['schema.sql', ...readdirSync(directory).filter(name => /^\d{3}-.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 38).sort()]
    for (const [index, filename] of migrations.entries()) {
      await db.exec(readFileSync(new URL(filename, directory), 'utf8'))
      await db.prepare('INSERT INTO postgres_schema_migrations(version) VALUES(?)').run(index + 1)
    }
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('player','player','Legacy','',1)").run()
    await db.prepare("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES('source','player',1800604800000,1)").run()
    await db.prepare("INSERT INTO beta_access(user_id,granted_at) VALUES('player',1)").run()
    const grantId = 'a'.repeat(43)
    await db.prepare("INSERT INTO prerelease_identity_grants(id,user_id,source_token,target_origin,created_at,expires_at) VALUES(?,'player','source',?,1,1800604800000)").run(grantId, targetOrigin)
    await db.prepare("INSERT INTO prerelease_identity_handoffs(code_hash,user_id,source_token,target_origin,browser_challenge,return_to,expires_at,created_at) VALUES('hash','player','source',?,'challenge',?,1800000060000,1)").run(targetOrigin, `${sourceOrigin}/`)
    await migratePostgres(db)
    expect(await (await entry()).json()).toMatchObject({ entry: { kind: 'disabled' } })
    const legacy = (await (await read()).json()).generation
    expect(legacy).toMatchObject({ state: 'closed', targetId: 'legacy', retirement: null, audit: null })
    const state = (await (await internal('status', legacy.generationId, { grantId })).json()).state
    expect(state.grant.kind).toBe('revoked')
    expect((await action('prepare', 1, secondGeneration, { targetId: 'fixture-pre', expectedPreviousGenerationId: legacy.generationId })).status).toBe(409)
    await db.prepare("INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES('player',1,1)").run()
    expect((await (await internal('events', legacy.generationId)).json()).events).toEqual([expect.objectContaining({ kind: 'account_deleted' })])
    expect((await action('retire', 2, legacy.generationId, { purgeReceiptSha256 })).status).toBe(200)
    expect((await (await internal('events', legacy.generationId)).json()).events).toEqual([])
  })

})
