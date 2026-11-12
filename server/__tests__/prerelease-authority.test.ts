import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPrereleaseIdentityAuthorized } from '../../shared/contract/prerelease-identity'
import { readCookie } from '../auth-cookies'
import { configuredPrereleaseTarget } from '../prerelease-authority'
import { createPrereleaseAuthorityHandler } from '../prerelease-authority-routes'
import { createTestDatabase } from './_helpers/postgres'

const sourceOrigin = 'https://play.example.test'
const targetOrigin = 'https://pre.beta.test'
const generationId = '00000000-0000-4000-8000-000000000001'
const serviceKey = 'target-service-key-with-at-least-32-bytes'
const sourceToken = 'formal-session-secret-never-shared'
const verifier = 'b'.repeat(43)
const challenge = createHash('sha256').update(verifier).digest('base64url')
const returnTo = `${sourceOrigin}/`
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllEnvs()
})

async function setup({ configured = true } = {}) {
  vi.stubEnv('ADMIN_USERS', 'admin')
  vi.stubEnv('PUBLIC_APP_ORIGIN', sourceOrigin)
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.test')
  vi.stubEnv('PRERELEASE_ENTRY_ENABLED', 'true')
  vi.stubEnv('PRERELEASE_APP_ORIGIN', configured ? targetOrigin : '')
  vi.stubEnv('PRERELEASE_IDENTITY_SERVICE_KEY', configured ? serviceKey : '')
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  await db.prepare(`INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at) VALUES(?,?,'fixture-pre',1)`).run(generationId, targetOrigin)
  const auditOperationId = '90000000-0000-4000-8000-000000000001'
  await db.prepare(`INSERT INTO prerelease_identity_owner_operations(operation_id,generation_id,action,request_hash,completed_at,identity_manifest_sha256,identity_count,verification_receipt_sha256)
    VALUES(?,?,'audit-complete','fixture',1,?,0,?)`).run(auditOperationId, generationId, 'a'.repeat(64), 'b'.repeat(64))
  await db.prepare('UPDATE prerelease_identity_generations SET admission_open=true,audit_operation_id=? WHERE id=?').run(auditOperationId, generationId)
  let now = 1_800_000_000_000
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('player','player','Test Player','private-password-hash',?)").run(now)
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(sourceToken, 'player', now + 9 * 86_400_000, now)
  await db.prepare("INSERT INTO beta_access(user_id,granted_at) VALUES('player',?)").run(now)
  const handler = createPrereleaseAuthorityHandler({ db, now: () => now, getSourceToken: async req => readCookie(req.headers.cookie, 'oa_session') })
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
  if (!address || typeof address === 'string') throw new Error('Expected test HTTP address')
  const base = `http://127.0.0.1:${address.port}/api/prerelease`
  const browser = (path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: `oa_session=${sourceToken}`, origin: sourceOrigin, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const internal = (path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ ...body, generationId }),
  })
  const issue = (overrides = {}) => browser('handoffs', { protocolVersion: 1, channel: 'prerelease', targetOrigin, browserChallenge: challenge, returnTo, ...overrides })
  const exchange = (code: string, overrides = {}) => internal('exchange', {
    protocolVersion: 1, channel: 'prerelease', targetOrigin, code, browserVerifier: verifier, returnTo, ...overrides,
  })
  const status = (grantId: string) => internal('status', { protocolVersion: 1, channel: 'prerelease', targetOrigin, grantId })
  return { db, base, browser, internal, issue, exchange, status, now: () => now, advance: (ms: number) => { now += ms } }
}

describe('formal prerelease identity authority', () => {
  it('exchanges a browser-bound handoff once and exposes only a minimal identity with fixed deadlines', async () => {
    const { browser, issue, exchange, status } = await setup()
    expect(await (await browser('entry')).json()).toEqual({ ok: true, protocolVersion: 1, entry: {
      kind: 'available', channel: 'prerelease', startUrl: `${targetOrigin}/open-agricola/auth/start`, returnTo,
    } })
    const issued = await issue()
    expect(issued.status).toBe(200)
    expect(issued.headers.get('cache-control')).toBe('no-store')
    const handoff = await issued.json()
    expect(handoff).toEqual({ ok: true, protocolVersion: 1, code: expect.any(String), expiresAt: 1_800_000_060_000,
      callbackUrl: `${targetOrigin}/open-agricola/auth/handoff`, returnTo })
    const exchanged = await exchange(handoff.code)
    expect(exchanged.status).toBe(200)
    const result = await exchanged.json()
    expect(result).toEqual({ ok: true, state: {
      protocolVersion: 1, channel: 'prerelease', targetOrigin, generationId, grantId: expect.any(String),
      account: { kind: 'active', subject: { id: 'player', username: 'player', displayName: 'Test Player' } },
      source: { kind: 'active', expiresAt: 1_800_777_600_000 }, betaAccess: true,
      grant: { kind: 'active', expiresAt: 1_800_604_800_000 }, confirmedAt: 1_800_000_000_000, validUntil: 1_800_000_030_000,
    } })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(sourceToken)
    expect(serialized).not.toContain('private-password-hash')
    expect(serialized).not.toContain('email')
    expect((await exchange(handoff.code)).status).toBe(409)
    expect(await (await status(result.state.grantId)).json()).toEqual(result)
  })
  it('retains a durable source revocation event until the target acknowledges completed revocation', async () => {
    const { db, issue, exchange, internal, status } = await setup()
    const handoff = await (await issue()).json()
    const result = await (await exchange(handoff.code)).json()
    await db.prepare('DELETE FROM sessions WHERE token=?').run(sourceToken)
    expect((await (await status(result.state.grantId)).json()).state.source).toEqual({ kind: 'invalid' })
    const input = { protocolVersion: 1, channel: 'prerelease', targetOrigin }
    const eventsResponse = await internal('events', input)
    expect(eventsResponse.status).toBe(200)
    const events = await eventsResponse.json()
    expect(events).toEqual({ ok: true, protocolVersion: 1, events: [{
      id: expect.any(String), kind: 'source_revoked', userId: 'player', grantId: result.state.grantId, createdAt: expect.any(Number),
    }] })
    const eventId = events.events[0].id
    expect(await (await internal('events', input)).json()).toEqual(events)
    expect((await internal('acknowledgements', { ...input, eventId, outcome: 'deleted' })).status).toBe(400)
    const acknowledged = await internal('acknowledgements', { ...input, eventId, outcome: 'revoked' })
    expect(acknowledged.status).toBe(200)
    const receipt = await acknowledged.json()
    expect(receipt).toEqual({ ok: true, receipt: { eventId, outcome: 'revoked', completedAt: 1_800_000_000_000 } })
    expect(await (await internal('acknowledgements', { ...input, eventId, outcome: 'revoked' })).json()).toEqual(receipt)
    expect(await (await internal('events', input)).json()).toEqual({ ok: true, protocolVersion: 1, events: [] })
  })


  it('accepts an authenticated read-only entry without Origin while rejecting explicit foreign origins', async () => {
    const { base } = await setup()
    const entry = await fetch(`${base}/entry`, { headers: { cookie: `oa_session=${sourceToken}` } })
    expect(entry.status).toBe(200)
    expect(await entry.json()).toEqual({ ok: true, protocolVersion: 1, entry: {
      kind: 'available', channel: 'prerelease', startUrl: `${targetOrigin}/open-agricola/auth/start`, returnTo,
    } })
    for (const origin of ['https://unrelated.example.test', 'null']) {
      const rejected = await fetch(`${base}/entry`, { headers: { cookie: `oa_session=${sourceToken}`, origin } })
      expect(rejected.status).toBe(403)
      expect(await rejected.json()).toMatchObject({ code: 'csrf_rejected' })
    }
    const anonymous = await fetch(`${base}/entry`)
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({ code: 'not_authenticated' })
  })

  it('requires the exact formal Origin for handoff writes after permitting an entry read without it', async () => {
    const { base, issue } = await setup()
    const body = JSON.stringify({ protocolVersion: 1, channel: 'prerelease', targetOrigin, browserChallenge: challenge, returnTo })
    for (const headers of [{}, { origin: 'https://unrelated.example.test' }, { origin: 'null' }]) {
      const rejected = await fetch(`${base}/handoffs`, { method: 'POST', headers: {
        cookie: `oa_session=${sourceToken}`, 'content-type': 'application/json', ...headers,
      }, body })
      expect(rejected.status).toBe(403)
      expect(await rejected.json()).toMatchObject({ code: 'csrf_rejected' })
    }
    expect((await issue()).status).toBe(200)
  })

  it('keeps entry reads closed when the formal source is not an HTTPS origin', async () => {
    const { base } = await setup()
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'http://play.example.test')
    const rejected = await fetch(`${base}/entry`, { headers: { cookie: `oa_session=${sourceToken}` } })
    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toMatchObject({ code: 'csrf_rejected' })
  })

  it('keeps a missing target disabled while allowing the formal browser to read its unavailable entry', async () => {
    const { browser, issue, exchange } = await setup({ configured: false })
    const entry = await browser('entry')
    expect(entry.status).toBe(200)
    expect(await entry.json()).toEqual({ ok: true, protocolVersion: 1, entry: { kind: 'disabled' } })
    expect(entry.headers.get('access-control-allow-origin')).toBe(sourceOrigin)
    expect((await issue()).status).toBe(503)
    expect((await exchange('x'.repeat(43))).status).toBe(503)
  })

  it('rejects wrong browser, target, protocol, return address and expired codes without consuming a valid handoff', async () => {
    const { issue, exchange, advance } = await setup()
    for (const overrides of [{ returnTo: 'https://evil.test/' }, { returnTo: `${sourceOrigin}/?redirect=https://evil.test` },
      { targetOrigin: 'https://evil.test' }, { channel: 'stable' }, { protocolVersion: 2 }, { browserChallenge: 'short' }]) {
      expect((await issue(overrides)).status).toBe(400)
    }
    const first = await (await issue()).json()
    expect((await exchange(first.code, { browserVerifier: 'z'.repeat(43) })).status).toBe(409)
    expect((await exchange(first.code, { targetOrigin: 'https://evil.test' })).status).toBe(400)
    expect((await exchange(first.code, { returnTo: 'https://evil.test/' })).status).toBe(400)
    expect((await exchange(first.code)).status).toBe(200)
    const second = await (await issue()).json()
    advance(60_000)
    expect((await exchange(second.code)).status).toBe(409)
  })

  it('requires current formal Beta eligibility even in development and rejects browser use of the service credential', async () => {
    const { db, browser, issue, exchange, internal } = await setup()
    expect((await browser('entry', undefined, { cookie: '' })).status).toBe(401)
    expect((await browser('handoffs', {}, { origin: 'https://evil.test' })).status).toBe(403)
    expect((await browser('entry', undefined, { origin: '' })).status).toBe(403)
    const handoff = await (await issue()).json()
    expect((await internal('exchange', { protocolVersion: 1, channel: 'prerelease', targetOrigin, code: handoff.code, browserVerifier: verifier, returnTo }, { origin: targetOrigin })).status).toBe(401)
    expect((await internal('status', { protocolVersion: 1, channel: 'prerelease', targetOrigin, grantId: 'x'.repeat(43) }, { authorization: `Bearer ${sourceToken}` })).status).toBe(401)
    await db.prepare("DELETE FROM beta_access WHERE user_id='player'").run()
    expect((await issue()).status).toBe(403)
    expect((await exchange(handoff.code)).status).toBe(403)
    await db.prepare("UPDATE users SET username='admin' WHERE id='player'").run()
    expect((await issue()).status).toBe(200)
  })

  it('consumes one code atomically across concurrent target requests and rolls failures back for retry', async () => {
    const { db, issue, exchange } = await setup()
    const first = await (await issue()).json()
    const concurrent = await Promise.all([exchange(first.code), exchange(first.code)])
    expect(concurrent.map(response => response.status).sort()).toEqual([200, 409])
    const second = await (await issue()).json()
    await db.exec(`CREATE FUNCTION fail_test_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture storage outage'; END $$;
      CREATE TRIGGER fail_test_grant BEFORE INSERT ON prerelease_identity_grants FOR EACH ROW EXECUTE FUNCTION fail_test_grant()`)
    expect((await exchange(second.code)).status).toBe(500)
    await db.exec('DROP TRIGGER fail_test_grant ON prerelease_identity_grants')
    expect((await exchange(second.code)).status).toBe(200)
  })

  it('uses the authority confirmation deadline without extending old state after a failed refresh', async () => {
    const { issue, exchange, internal, status, now, advance } = await setup()
    const handoff = await (await issue()).json()
    const initial = (await (await exchange(handoff.code)).json()).state
    expect(isPrereleaseIdentityAuthorized(initial, now(), generationId)).toBe(true)
    advance(29_999)
    expect(isPrereleaseIdentityAuthorized(initial, now(), generationId)).toBe(true)
    expect((await internal('status', { protocolVersion: 1, channel: 'prerelease', targetOrigin, grantId: initial.grantId }, { authorization: 'Bearer unavailable' })).status).toBe(401)
    advance(1)
    expect(isPrereleaseIdentityAuthorized(initial, now(), generationId)).toBe(false)
    const refreshed = (await (await status(initial.grantId)).json()).state
    expect(refreshed).toMatchObject({ confirmedAt: 1_800_000_030_000, validUntil: 1_800_000_060_000,
      source: { expiresAt: 1_800_777_600_000 }, grant: { expiresAt: 1_800_604_800_000 } })
    expect(isPrereleaseIdentityAuthorized(refreshed, now(), generationId)).toBe(true)
    advance(7 * 86_400_000)
    expect(isPrereleaseIdentityAuthorized(refreshed, now(), generationId)).toBe(false)
    expect((await (await status(initial.grantId)).json()).state.grant.kind).toBe('revoked')
  })

  it('caps the local grant and every cached confirmation at the original source-session deadline', async () => {
    const { db, issue, exchange, status, now, advance } = await setup()
    await db.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(now() + 20_000, sourceToken)
    const handoff = await (await issue()).json()
    const initial = (await (await exchange(handoff.code)).json()).state
    expect(initial).toMatchObject({ source: { expiresAt: 1_800_000_020_000 }, grant: { expiresAt: 1_800_000_020_000 }, validUntil: 1_800_000_020_000 })
    advance(19_999)
    expect(isPrereleaseIdentityAuthorized(initial, now(), generationId)).toBe(true)
    advance(1)
    expect(isPrereleaseIdentityAuthorized(initial, now(), generationId)).toBe(false)
    const expired = (await (await status(initial.grantId)).json()).state
    expect(expired.source).toEqual({ kind: 'invalid' })
    expect(expired.grant).toEqual({ kind: 'revoked', expiresAt: 1_800_000_020_000 })
  })


  it('reports Beta withdrawal immediately, preserves the source identity, and emits an explicit recheck event', async () => {
    const { db, issue, exchange, status, internal, now } = await setup()
    const handoff = await (await issue()).json()
    const initial = (await (await exchange(handoff.code)).json()).state
    await db.prepare("DELETE FROM beta_access WHERE user_id='player'").run()
    const withdrawn = (await (await status(initial.grantId)).json()).state
    expect(withdrawn).toMatchObject({ account: { kind: 'active' }, source: { kind: 'active' }, betaAccess: false })
    expect(isPrereleaseIdentityAuthorized(withdrawn, now(), generationId)).toBe(false)
    const input = { protocolVersion: 1, channel: 'prerelease', targetOrigin }
    const events = await (await internal('events', input)).json()
    expect(events.events).toEqual([expect.objectContaining({ kind: 'beta_changed', userId: 'player', grantId: null })])
    expect((await internal('acknowledgements', { ...input, eventId: events.events[0].id, outcome: 'rechecked' })).status).toBe(200)
    await db.prepare("UPDATE users SET display_name='Renamed player' WHERE id='player'").run()
    await db.prepare("INSERT INTO beta_access(user_id,granted_at) VALUES('player',?)").run(now())
    const restored = (await (await status(initial.grantId)).json()).state
    expect(restored.account).toEqual({ kind: 'active', subject: { id: 'player', username: 'player', displayName: 'Renamed player' } })
    expect(isPrereleaseIdentityAuthorized(restored, now(), generationId)).toBe(true)
    expect((await (await internal('events', input)).json()).events).toEqual([expect.objectContaining({ kind: 'beta_changed' })])
  })


  it('normalizes configured root origins and refuses paths, userinfo and insecure target origins', async () => {
    const { browser, issue } = await setup()
    vi.stubEnv('PUBLIC_APP_ORIGIN', `${sourceOrigin}/`)
    vi.stubEnv('PRERELEASE_APP_ORIGIN', `${targetOrigin}/`)
    expect(await (await browser('entry')).json()).toMatchObject({ entry: { kind: 'available', returnTo } })
    for (const origin of ['http://pre.beta.test', 'https://pre.beta.test/nested', 'https://user@pre.beta.test', sourceOrigin]) {
      vi.stubEnv('PRERELEASE_APP_ORIGIN', origin)
      expect(await (await browser('entry')).json()).toMatchObject({ entry: { kind: 'disabled' } })
      expect((await issue()).status).toBe(503)
    }
  })


  it('bounds authenticated handoff issuance without sliding the retry window', async () => {
    const { issue, advance } = await setup()
    for (let count = 0; count < 10; count++) expect((await issue()).status).toBe(200)
    expect((await issue()).status).toBe(429)
    advance(59_999)
    expect((await issue()).status).toBe(429)
    advance(1)
    expect((await issue()).status).toBe(200)
  })


  it('requires explicit activation for new handoffs while keeping revocation and deletion cleanup available', async () => {
    const { db, browser, issue, exchange, status, internal } = await setup()
    const handoff = await (await issue()).json()
    const active = (await (await exchange(handoff.code)).json()).state
    const pending = await (await issue()).json()
    vi.stubEnv('PRERELEASE_ENTRY_ENABLED', '')
    expect(await (await browser('entry')).json()).toEqual({ ok: true, protocolVersion: 1, entry: { kind: 'disabled' } })
    expect((await issue()).status).toBe(503)
    expect((await exchange(pending.code)).status).toBe(503)
    expect((await status(active.grantId)).status).toBe(200)
    await db.prepare('DELETE FROM sessions WHERE token=?').run(sourceToken)
    const input = { protocolVersion: 1, channel: 'prerelease', targetOrigin }
    const events = (await (await internal('events', input)).json()).events
    expect(events).toEqual([expect.objectContaining({ kind: 'source_revoked', grantId: active.grantId })])
    expect((await internal('acknowledgements', { ...input, eventId: events[0].id, outcome: 'revoked' })).status).toBe(200)
  })


  it('bounds target-key reads across requests and restores the same fixed window after expiry', async () => {
    const { internal, advance } = await setup()
    const input = { protocolVersion: 1, channel: 'prerelease', targetOrigin, grantId: 'x'.repeat(43) }
    for (let batch = 0; batch < 6; batch++) {
      const responses = await Promise.all(Array.from({ length: 100 }, () => internal('status', input)))
      expect(responses.map(response => response.status)).toEqual(Array(100).fill(404))
    }
    const blocked = await internal('status', input)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('60')
    advance(59_999)
    expect((await internal('status', input)).status).toBe(429)
    advance(1)
    expect((await internal('status', input)).status).toBe(404)
  }, 15_000)

  it('rejects malformed and oversized bodies without preventing a subsequent valid exchange', async () => {
    const { browser, issue, exchange } = await setup()
    for (const input of [null, [], 'invalid JSON value', {}, { browserChallenge: 3 }]) {
      expect((await browser('handoffs', input)).status).toBe(400)
    }
    expect((await issue({ padding: 'x'.repeat(5000) })).status).toBe(413)
    const handoff = await (await issue()).json()
    expect((await exchange(handoff.code)).status).toBe(200)
  })


  it('refuses targets sharing the formal frontend or API cookie hostname even on another port', async () => {
    const { browser, issue } = await setup()
    for (const origin of ['https://api.example.test', 'https://api.example.test:444', `${sourceOrigin}:444`]) {
      vi.stubEnv('PRERELEASE_APP_ORIGIN', origin)
      expect(await (await browser('entry')).json()).toMatchObject({ entry: { kind: 'disabled' } })
      expect((await issue()).status).toBe(503)
    }
    vi.stubEnv('PRERELEASE_APP_ORIGIN', targetOrigin)
    vi.stubEnv('PUBLIC_API_BASE', '')
    expect(await (await browser('entry')).json()).toMatchObject({ entry: { kind: 'disabled' } })
  })

})

it('rejects a configured same-site target and respects private PSL boundaries', () => {
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.formal-fixture.github.io')
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.formal-fixture.github.io')
  vi.stubEnv('PRERELEASE_IDENTITY_SERVICE_KEY', 'inert-service-key-with-at-least-32-bytes')
  vi.stubEnv('PRERELEASE_APP_ORIGIN', 'https://pre.formal-fixture.github.io')
  expect(configuredPrereleaseTarget()).toBeUndefined()
  vi.stubEnv('PRERELEASE_APP_ORIGIN', 'https://pre-fixture.github.io')
  expect(configuredPrereleaseTarget()?.targetOrigin).toBe('https://pre-fixture.github.io')
})
