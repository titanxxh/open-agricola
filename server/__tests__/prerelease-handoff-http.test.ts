import { createServer, request, type IncomingMessage, type IncomingHttpHeaders, type Server } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_GENERATION_HEADER } from '../../shared/contract/prerelease-runtime'
import type { PrereleaseIdentityState, PrereleaseIdentityEvent } from '../../shared/contract/prerelease-identity'
import { getDb } from '../db'
import { getPrereleaseSessions, PrereleaseSessions } from '../prerelease-sessions'
import { FormalPrereleaseIdentityClient } from '../prerelease-identity-client'
import { PostgresDatabase } from '../database/postgres'
import { getTestDatabaseUrl } from './_helpers/postgres'
import { handlePrereleaseRoute } from '../prerelease-routes'
import { createPrereleaseGateway } from '../../scripts/prerelease/gateway'
import { formalBrowserPolicyFixture } from '../../scripts/__tests__/prerelease-browser-policy-fixture'

vi.mock('../db', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})

const browserFetch = globalThis.fetch
const buildId = 'a'.repeat(40)
let server: Server | undefined
let origin = ''
let appOrigin = ''
let generationId = ''
let exchangeCalls = 0
let authorityReply: () => Response | Promise<Response>
let statusReply: () => Response | Promise<Response>
let events: PrereleaseIdentityEvent[] = []
let acknowledgements: string[] = []

function identity(): PrereleaseIdentityState {
  const now = Date.now()
  return { protocolVersion: 1, channel: 'prerelease', targetOrigin: appOrigin, generationId,
    grantId: 'g'.repeat(43), account: { kind: 'active', subject: { id: 'handoff-user', username: 'handoff_user', displayName: 'Handoff Farmer' } },
    source: { kind: 'active', expiresAt: now + 86_400_000 }, grant: { kind: 'active', expiresAt: now + 86_400_000 },
    betaAccess: true, confirmedAt: now, validUntil: now + 30_000 }
}

beforeEach(async () => {
  server = createServer((req, res) => { void handlePrereleaseRoute(req, res).then(handled => {
    if (!handled) { res.writeHead(404); res.end() }
  }).catch(() => { res.writeHead(500); res.end() }) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Handoff HTTP fixture did not start')
  origin = `http://127.0.0.1:${address.port}`; appOrigin = `https://127.0.0.1:${address.port}`
  generationId = randomUUID(); exchangeCalls = 0; events = []; acknowledgements = []
  for (const [key, value] of Object.entries({ RELEASE_CHANNEL: 'prerelease', NODE_ENV: 'production', PUBLIC_APP_ORIGIN: appOrigin,
    PUBLIC_API_BASE: appOrigin, FORMAL_APP_ORIGIN: 'https://formal.example.test', FORMAL_API_BASE: 'https://formal-api.example.test',
    PRERELEASE_DATA_GENERATION: generationId, PRERELEASE_TARGET_ID: 'prerelease-main', GAME_BUILD_ID: buildId,
    PRERELEASE_IDENTITY_SERVICE_KEY: 'restricted-handoff-fixture-service-key' })) vi.stubEnv(key, value)
  authorityReply = () => Response.json({ ok: true, state: identity() })
  statusReply = () => Response.json({ ok: true, state: identity() })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' })
    expect(new Headers(init?.headers).has('cookie')).toBe(false)
    expect(new Headers(init?.headers).has('origin')).toBe(false)
    const path = String(input)
    if (path === 'https://formal-api.example.test/api/prerelease/exchange') { exchangeCalls++; return authorityReply() }
    if (path === 'https://formal-api.example.test/api/prerelease/status') return statusReply()
    if (path === 'https://formal-api.example.test/api/prerelease/events') return Response.json({ ok: true, protocolVersion: 1, events })
    if (path === 'https://formal-api.example.test/api/prerelease/acknowledgements') {
      const event = events[0]
      if (!event) throw new Error('No identity event awaits acknowledgement')
      const outcome = event.kind === 'source_revoked' ? 'revoked' : event.kind === 'account_deleted' ? 'deleted' : 'rechecked'
      expect(JSON.parse(String(init?.body))).toMatchObject({ eventId: event.id, outcome })
      acknowledgements.push(event.id)
      return Response.json({ ok: true, receipt: { eventId: event.id, outcome, completedAt: Date.now() } })
    }
    throw new Error('Unexpected identity fixture request')
  }))
})

afterEach(async () => {
  getPrereleaseSessions()?.close()
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
  server = undefined
  await getDb().prepare('DELETE FROM users').run()
  await getDb().prepare('DELETE FROM prerelease_browser_handoffs').run()
  await getDb().exec('DELETE FROM prerelease_revoked_grants; DELETE FROM prerelease_deleted_subjects; DELETE FROM prerelease_processed_identity_events')
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
afterAll(async () => { await getDb().close() })

async function begin() {
  const response = await browserFetch(`${origin}/open-agricola/auth/start?returnPath=` + encodeURIComponent('/open-agricola/?room=retained'), { redirect: 'manual' })
  expect(response.status).toBe(302)
  const location = response.headers.get('location'), cookie = response.headers.getSetCookie()[0]?.split(';')[0]
  if (!location || !cookie) throw new Error('Handoff fixture did not issue a browser binding')
  const params = new URLSearchParams(new URL(location).hash.slice(1))
  const state = params.get('state'), browserChallenge = params.get('browserChallenge')
  if (!state || !browserChallenge) throw new Error('Missing browser handoff fields')
  return { cookie, body: { protocolVersion: 1, code: 'c'.repeat(43), state, browserChallenge, returnTo: 'https://formal.example.test/' } }
}

function boundHeaders(cookie: string) {
  return { Cookie: cookie, Origin: appOrigin,
    [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), [PRERELEASE_BUILD_HEADER]: buildId,
    [PRERELEASE_GENERATION_HEADER]: generationId, 'Content-Type': 'application/json' }
}
function exchange(input: Awaited<ReturnType<typeof begin>>, cookie = input.cookie) {
  return browserFetch(`${origin}/api/prerelease/session`, { method: 'POST', headers: boundHeaders(cookie), body: JSON.stringify(input.body) })
}

it('preserves session bindings through the actual gateway without forwarding formal credentials', async () => {
  const formal = await formalBrowserPolicyFixture(), root = await mkdtemp(join(tmpdir(), 'pre-handoff-gateway-'))
  let gateway: ReturnType<typeof createPrereleaseGateway> | undefined
  const seen: IncomingHttpHeaders[] = []
  const observe = (req: IncomingMessage) => { seen.push(req.headers) }
  server!.on('request', observe)
  try {
    const healthyCycle = randomUUID(), observedAt = Date.now(), targetId = 'prerelease-main'
    const stateFile = join(root, 'gate.json')
    await writeFile(join(root, 'storage-guard.json'), JSON.stringify({ format: 1, targetId, fingerprint: 'f'.repeat(64), status: 'healthy',
      healthyCycle, observedAt, validUntil: observedAt + 120_000, operationsAllowed: true }))
    await writeFile(stateFile, JSON.stringify({ format: 1, targetId, channel: 'prerelease', mode: 'open', buildId,
      generation: generationId, acceptance: { healthyCycle, formalBuildId: formal.state.buildId } }))
    gateway = createPrereleaseGateway({ stateFile, targetId, origin: appOrigin, upstream: origin, formal: formal.formal, ca: formal.ca })
    await new Promise<void>(resolve => gateway!.server.listen(0, '127.0.0.1', resolve))
    await gateway.refreshBrowserPolicy()
    const address = gateway.server.address()
    if (!address || typeof address === 'string') throw new Error('Gateway HTTP fixture did not start')
    const base = `http://127.0.0.1:${address.port}`, Host = new URL(appOrigin).host
    const forward = (path: string, headers: Record<string, string> = {}, body?: string) => new Promise<Response>((resolve, reject) => {
      const outgoing = request(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Host, ...headers } }, response => {
        const chunks: Buffer[] = []
        response.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
        response.on('error', reject)
        response.on('end', () => {
          const received = new Headers()
          for (let index = 0; index < response.rawHeaders.length; index += 2) received.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!)
          resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: received }))
        })
      })
      outgoing.on('error', reject); outgoing.end(body)
    })
    const start = await forward('/open-agricola/auth/start?returnPath=' + encodeURIComponent('/open-agricola/?room=retained'))
    expect(start.status).toBe(302)
    const handoffCookie = start.headers.getSetCookie()[0]?.split(';')[0], location = start.headers.get('location')
    if (!handoffCookie || !location) throw new Error('Gateway did not deliver the browser handoff')
    const params = new URLSearchParams(new URL(location).hash.slice(1))
    const body = { protocolVersion: 1, code: 'c'.repeat(43), state: params.get('state'), browserChallenge: params.get('browserChallenge'), returnTo: 'https://formal.example.test/' }
    const response = await forward('/api/prerelease/session', boundHeaders(handoffCookie), JSON.stringify(body))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
    if (!cookie) throw new Error('Gateway did not deliver the restricted session cookie')
    const current = await forward('/api/auth/me', { ...boundHeaders(`${cookie}; __Host-oa-session=formal-source`),
      Authorization: 'Bearer formal-service-key-must-not-cross', 'X-OA-Principal': 'forged' })
    expect(current.status).toBe(200)
    expect(await current.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
    expect(seen.at(-1)).toMatchObject({ cookie, [PRERELEASE_BUILD_HEADER]: buildId, [PRERELEASE_GENERATION_HEADER]: generationId })
    expect(seen.at(-1)?.authorization).toBeUndefined()
    expect(seen.at(-1)?.['x-oa-principal']).toBeUndefined()
    for (const stale of [{ [PRERELEASE_BUILD_HEADER]: 'b'.repeat(40) }, { [PRERELEASE_GENERATION_HEADER]: randomUUID() }]) {
      const rejected = await forward('/api/auth/me', { ...boundHeaders(cookie), ...stale })
      expect(rejected.status).toBe(426)
    }
    const anonymous = await forward('/api/auth/me', boundHeaders('__Host-oa-session=formal-source'))
    expect(anonymous.status).toBe(401)
  } finally {
    server!.off('request', observe)
    await gateway?.close(); await formal.close(); await rm(root, { recursive: true, force: true })
  }
})

it.each(['revoked', 'unknown'])('classifies a %s second current-session resolution without publishing identity', async failure => {
  const pending = await begin(), accepted = await exchange(pending)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Missing issued session cookie')
  const service = getPrereleaseSessions()
  if (!service) throw new Error('Missing prerelease consumer')
  const original = service.resolve.bind(service)
  let calls = 0
  const spy = vi.spyOn(service, 'resolve').mockImplementation(async token => {
    if (++calls === 2) {
      if (failure === 'revoked') await service.revoke(token)
      else {
        const stale = identity(); stale.validUntil = 0
        await getDb().prepare('UPDATE prerelease_sessions SET identity_state=?').run(JSON.stringify(stale))
        statusReply = () => { throw new Error('Authority temporarily unavailable') }
      }
    }
    return original(token)
  })
  try {
    const response = await browserFetch(`${origin}/api/auth/me`, { headers: boundHeaders(cookie) })
    expect({ status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() }).toEqual({
      status: failure === 'revoked' ? 403 : 503,
      body: { ok: false, code: failure === 'revoked' ? 'prerelease_access_expired' : 'prerelease_access_paused' }, cookies: [],
    })
  } finally { spy.mockRestore() }
})

it('requires a current caller for account-wide logout while keeping single logout idempotent', async () => {
  const enter = async () => {
    const accepted = await exchange(await begin())
    expect(accepted.status).toBe(200)
    const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
    if (!cookie) throw new Error('Missing issued session cookie')
    return cookie
  }
  const post = (path: string, cookie: string) => browserFetch(origin + path, { method: 'POST', headers: boundHeaders(cookie) })
  const me = (cookie: string) => browserFetch(origin + '/api/auth/me', { headers: boundHeaders(cookie) })
  const old = await enter()
  expect((await post('/api/auth/logout', old)).status).toBe(200)
  const current = await enter()
  const denied = await post('/api/auth/logout-all', old)
  expect((await me(current)).status).toBe(200)
  expect(denied.status).toBe(403)
  expect(await denied.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
  expect((await post('/api/auth/logout', old)).status).toBe(200)
  expect((await me(current)).status).toBe(200)
  const other = await enter()
  expect((await post('/api/auth/logout-all', current)).status).toBe(200)
  expect((await me(current)).status).toBe(403)
  expect((await me(other)).status).toBe(403)
})

it.each(['expired', 'unknown'])('rejects account-wide logout from an %s source without clearing or revoking a current session', async reason => {
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const enter = async () => {
    const accepted = await exchange(await begin())
    expect(accepted.status).toBe(200)
    const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
    if (!cookie) throw new Error('Missing issued session cookie')
    return cookie
  }
  const old = await enter()
  now += reason === 'expired' ? 86_400_000 : 30_000
  authorityReply = () => Response.json({ ok: true, state: { ...identity(), grantId: 'h'.repeat(43) } })
  const current = await enter()
  if (reason === 'unknown') statusReply = () => { throw new Error('Authority temporarily unavailable') }
  const denied = await browserFetch(origin + '/api/auth/logout-all', { method: 'POST', headers: boundHeaders(old) })
  expect(denied.status).toBe(reason === 'expired' ? 403 : 503)
  expect(await denied.json()).toEqual({ ok: false, code: reason === 'expired' ? 'prerelease_access_expired' : 'prerelease_access_paused' })
  expect(denied.headers.getSetCookie()).toEqual([])
  const currentResponse = await browserFetch(origin + '/api/auth/me', { headers: boundHeaders(current) })
  expect(currentResponse.status).toBe(200)
})

it('pauses an unavailable exchange without consuming its browser binding, then permits the same valid handoff', async () => {
  const pending = await begin()
  authorityReply = () => { throw new Error('Formal service offline') }
  const paused = await exchange(pending)
  expect({ status: paused.status, body: await paused.json(), cookies: paused.headers.getSetCookie() }).toEqual({
    status: 503, body: { ok: false, code: 'prerelease_access_paused' }, cookies: [],
  })
  expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions').all()).toEqual([])
  expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
  expect(await getDb().prepare('SELECT count(*)::int AS count FROM prerelease_browser_handoffs').get()).toEqual({ count: 1 })
  authorityReply = () => Response.json({ ok: true, state: identity() })
  const accepted = await exchange(pending)
  expect(accepted.status).toBe(200)
  expect(await accepted.json()).toMatchObject({ ok: true, returnPath: '/open-agricola/?room=retained', user: { id: 'handoff-user' } })
  expect(accepted.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-oa-pre-session='))).toBe(true)
  expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions').all()).toEqual([{ user_id: 'handoff-user' }])
  expect(await getDb().prepare('SELECT source_user_id,source_grant_id FROM prerelease_browser_handoffs').all()).toEqual([{ source_user_id: 'handoff-user', source_grant_id: 'g'.repeat(43) }])
  expect(exchangeCalls).toBe(2)
})

it('recovers only the matching committed handoff cookie without another exchange or a sliding session deadline', async () => {
  const pending = await begin()
  const accepted = await exchange(pending)
  expect(accepted.status).toBe(200)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Handoff response did not issue a session cookie')
  await accepted.body?.cancel()
  const before = await getDb().prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()
  const original = await getDb().prepare('SELECT expires_at FROM prerelease_sessions').get<{ expires_at: number }>()
  if (!original) throw new Error('Missing committed handoff session')
  expect(before).toHaveLength(1)
  expect(await getDb().prepare('SELECT source_user_id,source_grant_id FROM prerelease_browser_handoffs').all()).toEqual([{ source_user_id: 'handoff-user', source_grant_id: 'g'.repeat(43) }])
  const missingReceipt = await exchange(pending, '')
  expect(missingReceipt.status).toBe(400)
  expect(await missingReceipt.json()).toEqual({ ok: false, code: 'invalid_prerelease_handoff' })
  expect(exchangeCalls).toBe(1)
  const recovered = await exchange(pending, cookie)
  expect(recovered.status).toBe(200)
  const body: unknown = await recovered.json()
  expect(body).toMatchObject({ ok: true, returnPath: '/open-agricola/?room=retained', user: { id: 'handoff-user' }, prerelease: { expiresAt: original.expires_at } })
  expect(body).not.toHaveProperty('token')
  expect(recovered.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]).toBe(cookie)
  expect(await getDb().prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()).toEqual(before)
  expect(exchangeCalls).toBe(1)
  const loggedOut = await browserFetch(`${origin}/api/auth/logout`, { method: 'POST', headers: boundHeaders(cookie) })
  expect(loggedOut.status).toBe(200)
  const stale = await exchange(pending, cookie)
  expect(stale.status).toBe(403)
  expect(await stale.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
  expect(stale.headers.getSetCookie().some(value => value.startsWith('__Host-oa-pre-session='))).toBe(false)
  expect(exchangeCalls).toBe(1)
})

it('does not use an older principal cookie as proof of a different callback', async () => {
  const first = await begin()
  const accepted = await exchange(first)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Handoff response did not issue a session cookie')
  const next = await begin()
  const invalid = await exchange({ ...next, body: { ...next.body, state: 'x'.repeat(43) } }, cookie)
  expect(invalid.status).toBe(400)
  expect(await invalid.json()).toEqual({ ok: false, code: 'invalid_prerelease_handoff' })
  expect(exchangeCalls).toBe(1)
  const nextIdentity = identity()
  nextIdentity.grantId = 'b'.repeat(43)
  nextIdentity.account = { kind: 'active', subject: { id: 'next-user', username: 'next_user', displayName: 'Next Farmer' } }
  authorityReply = () => Response.json({ ok: true, state: nextIdentity })
  const admitted = await exchange(next, `${next.cookie}; ${cookie}`)
  expect(admitted.status).toBe(200)
  expect(await admitted.json()).toMatchObject({ ok: true, user: { id: 'next-user' } })
  expect(exchangeCalls).toBe(2)
  expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions ORDER BY user_id').all())
    .toEqual([{ user_id: 'handoff-user' }, { user_id: 'next-user' }])
})

it('recovers a lost session Cookie only from the original browser receipt and never extends its session', async () => {
  const pending = await begin(), accepted = await exchange(pending)
  expect(accepted.status).toBe(200)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Missing original session Cookie')
  await accepted.body?.cancel()
  const before = await getDb().prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()
  const recovered = await exchange(pending)
  expect(recovered.status).toBe(200)
  expect(recovered.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]).toBe(cookie)
  expect(await recovered.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
  expect(await getDb().prepare('SELECT token_hash,user_id,grant_id,created_at,expires_at FROM prerelease_sessions').all()).toEqual(before)
  expect(exchangeCalls).toBe(1)
  const denied = await exchange({ ...pending, body: { ...pending.body, code: 'x'.repeat(43) } })
  expect(denied.status).toBe(400)
  expect(exchangeCalls).toBe(1)
})

it.each(['handoff', 'me'] as const)('rejects %s publication after another consumer logs out the resolved session', async path => {
  const pending = await begin(), service = getPrereleaseSessions()
  if (!service) throw new Error('Missing prerelease service')
  const schema = await getDb().prepare('SELECT current_schema() AS name').get<{ name: string }>()
  if (!schema) throw new Error('Missing test schema')
  const other = new PostgresDatabase({ connectionString: getTestDatabaseUrl(), schema: schema.name })
  const peer = new PrereleaseSessions({ db: other, runtime: { ...service.runtime },
    authority: new FormalPrereleaseIdentityClient(service.runtime, 'restricted-handoff-fixture-service-key') })
  try {
    const accepted = await exchange(pending)
    const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
    expect(accepted.status).toBe(200)
    if (!cookie) throw new Error('Missing original session Cookie')
    await accepted.body?.cancel()
    if (path === 'handoff') {
      const exchangeHandoff = service.exchangeHandoff.bind(service)
      vi.spyOn(service, 'exchangeHandoff').mockImplementation(async (...args) => {
        const session = await exchangeHandoff(...args)
        await peer.revoke(session.token)
        return session
      })
    } else {
      const resolve = service.resolve.bind(service)
      let resolved = 0
      vi.spyOn(service, 'resolve').mockImplementation(async token => {
        const session = await resolve(token)
        if (++resolved === 2) await peer.revoke(token)
        return session
      })
    }
    const response = path === 'handoff' ? await exchange(pending)
      : await browserFetch(`${origin}/api/auth/me`, { headers: boundHeaders(cookie) })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
    expect(response.headers.getSetCookie().some(value => value.startsWith('__Host-oa-pre-session='))).toBe(false)
  } finally { peer.close(); await other.close() }
})

it('serializes simultaneous callback retries into one source exchange and one local session', async () => {
  const pending = await begin(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  authorityReply = async () => { entered.resolve(); await release.promise; return Response.json({ ok: true, state: identity() }) }
  const first = exchange(pending), second = exchange(pending)
  try {
    await entered.promise
    release.resolve()
    const responses = await Promise.all([first, second])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const cookies = responses.map(response => response.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0])
    expect(cookies[0]).toBeTruthy()
    expect(cookies[1]).toBe(cookies[0])
    expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions').all()).toEqual([{ user_id: 'handoff-user' }])
    expect(exchangeCalls).toBe(1)
    for (const response of responses) await response.body?.cancel()
  } finally { release.resolve(); await Promise.allSettled([first, second]) }
})

it.each(['code', 'browserChallenge'] as const)('does not recover an old principal when the same callback state has a different %s', async field => {
  const first = await begin()
  const accepted = await exchange(first)
  expect(accepted.status).toBe(200)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Handoff response did not issue a session cookie')
  const nextIdentity = identity()
  nextIdentity.grantId = 'b'.repeat(43)
  nextIdentity.account = { kind: 'active', subject: { id: 'next-user', username: 'next_user', displayName: 'Next Farmer' } }
  authorityReply = () => Response.json({ ok: true, state: nextIdentity })
  const response = await exchange({ ...first, body: { ...first.body, [field]: 'd'.repeat(43) } }, cookie)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ ok: false, code: 'invalid_prerelease_handoff' })
  expect(response.headers.getSetCookie().some(value => value.startsWith('__Host-oa-pre-session='))).toBe(false)
  expect(exchangeCalls).toBe(1)
  expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions').all()).toEqual([{ user_id: 'handoff-user' }])
})

it.each([
  { status: 409, code: 'prerelease_handoff_invalid', expected: 400, result: 'invalid_prerelease_handoff' },
  { status: 401, code: 'not_authenticated', expected: 403, result: 'prerelease_access_expired' },
  { status: 403, code: 'beta_access_required', expected: 403, result: 'prerelease_access_expired' },
  { status: 409, code: 'prerelease_generation_unavailable', expected: 503, result: 'prerelease_access_paused' },
  { status: 503, code: 'prerelease_entry_disabled', expected: 503, result: 'prerelease_access_paused' },
])('reports the formal $code failure without issuing a local identity', async scenario => {
  const pending = await begin()
  authorityReply = () => Response.json({ ok: false, code: scenario.code }, { status: scenario.status })
  const result = await exchange(pending)
  expect(result.status).toBe(scenario.expected)
  expect(await result.json()).toEqual({ ok: false, code: scenario.result })
  expect(result.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-oa-pre-session='))).toBe(false)
  expect(result.headers.getSetCookie().length).toBe(scenario.expected === 503 ? 0 : 1)
  expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
  expect(await getDb().prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
})

it.each(['beta_withdrawn', 'account_deleted', 'source_invalid', 'source_expired', 'grant_revoked', 'grant_expired'])(
  'returns expired access for confirmed %s without publishing a positive cookie or principal', async reason => {
    const pending = await begin(), state = identity()
    if (reason === 'beta_withdrawn') state.betaAccess = false
    if (reason === 'account_deleted') state.account = { kind: 'deleted' }
    if (reason === 'source_invalid') state.source = { kind: 'invalid' }
    if (reason === 'source_expired') state.source = { kind: 'active', expiresAt: Date.now() - 1 }
    if (reason === 'grant_revoked') state.grant.kind = 'revoked'
    if (reason === 'grant_expired') state.grant.expiresAt = Date.now() - 1
    authorityReply = () => Response.json({ ok: true, state })
    const response = await exchange(pending)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
    expect(response.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-oa-pre-session='))).toBe(false)
    expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
    expect(await getDb().prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
  })

it.each(['freshness_elapsed', 'invalid_protocol', 'database_failure'])('pauses %s rather than declaring a malformed callback', async reason => {
  const pending = await begin(), state = identity()
  if (reason === 'freshness_elapsed') { state.confirmedAt -= 30_001; state.validUntil = state.confirmedAt + 30_000 }
  if (reason === 'invalid_protocol') state.targetOrigin = 'https://wrong-target.example.test'
  if (reason === 'database_failure') await getDb().exec(`CREATE FUNCTION reject_handoff_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Controlled handoff storage failure'; END $$;
    CREATE TRIGGER reject_handoff_write BEFORE INSERT ON prerelease_sessions FOR EACH ROW EXECUTE FUNCTION reject_handoff_write();`)
  try {
    authorityReply = () => Response.json({ ok: true, state })
    const response = await exchange(pending)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
    expect(await getDb().prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
    expect(await getDb().prepare('SELECT count(*)::int AS count FROM prerelease_browser_handoffs').get()).toEqual({ count: 1 })
  } finally {
    if (reason === 'database_failure') await getDb().exec('DROP TRIGGER reject_handoff_write ON prerelease_sessions; DROP FUNCTION reject_handoff_write()')
  }
})

it('treats a contradictory formal error envelope as unavailable authority', async () => {
  const pending = await begin()
  authorityReply = () => Response.json({ ok: true, code: 'prerelease_handoff_invalid' }, { status: 409 })
  const response = await exchange(pending)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
  expect(response.headers.getSetCookie()).toEqual([])
  expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
  expect(await getDb().prepare('SELECT count(*)::int AS count FROM prerelease_browser_handoffs').get()).toEqual({ count: 1 })
})

it.each(['unrelated_source_revoked', 'beta_qualification_changed'])(
  'applies only matching %s invalidation to an in-flight callback', async reason => {
  const pending = await begin(), service = getPrereleaseSessions()
  if (!service) throw new Error('Missing prerelease consumer')
  const before = await getDb().prepare('SELECT cookie_hash,browser_verifier,state,return_path,expires_at FROM prerelease_browser_handoffs').all()
  authorityReply = async () => {
    events.push(reason === 'unrelated_source_revoked'
      ? { id: randomUUID(), kind: 'source_revoked', userId: 'another-user', grantId: 'b'.repeat(43), createdAt: Date.now() }
      : { id: randomUUID(), kind: 'beta_changed', userId: 'handoff-user', grantId: null, createdAt: Date.now() })
    await service.processEvents()
    return Response.json({ ok: true, state: identity() })
  }
  const response = await exchange(pending)
  if (reason === 'unrelated_source_revoked') {
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
    expect(response.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-oa-pre-session='))).toBe(true)
    expect(await getDb().prepare('SELECT user_id FROM prerelease_sessions').all()).toEqual([{ user_id: 'handoff-user' }])
    expect(await getDb().prepare('SELECT source_user_id,source_grant_id FROM prerelease_browser_handoffs').all()).toEqual([{ source_user_id: 'handoff-user', source_grant_id: 'g'.repeat(43) }])
  } else {
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
    expect(await getDb().prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
    expect(await getDb().prepare('SELECT cookie_hash,browser_verifier,state,return_path,expires_at FROM prerelease_browser_handoffs').all()).toEqual(before)
    const resumed = await exchange(pending)
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
    expect(exchangeCalls).toBe(1)
  }
})

it('rejects malformed callback fields before calling the authority', async () => {
  const pending = await begin()
  const response = await exchange({ ...pending, body: { ...pending.body, code: 'invalid' } })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ ok: false, code: 'invalid_prerelease_handoff' })
  expect(exchangeCalls).toBe(0)
  expect(await getDb().prepare('SELECT id FROM users').all()).toEqual([])
})

it('pauses receipt recovery when formal status is unavailable without returning stale identity data', async () => {
  const pending = await begin(), accepted = await exchange(pending)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Handoff response did not issue a session cookie')
  const stale = identity()
  stale.confirmedAt -= 30_001; stale.validUntil = stale.confirmedAt + 30_000
  await getDb().prepare('UPDATE prerelease_sessions SET identity_state=?').run(JSON.stringify(stale))
  statusReply = () => { throw new Error('Formal status offline') }
  const response = await exchange(pending, cookie)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
  expect(response.headers.getSetCookie()).toEqual([])
  expect(exchangeCalls).toBe(1)
  statusReply = () => Response.json({ ok: true, state: identity() })
  const recovered = await exchange(pending, cookie)
  expect(recovered.status).toBe(200)
  expect(await recovered.json()).toMatchObject({ ok: true, user: { id: 'handoff-user' } })
  expect(exchangeCalls).toBe(1)
})

it.each(['beta_withdrawn', 'account_deleted', 'source_invalid', 'source_expired', 'grant_revoked', 'grant_expired', 'freshness_elapsed', 'invalid_protocol'])(
  'fails closed when receipt status confirms %s without returning or advancing an unauthorized identity', async reason => {
    const pending = await begin(), accepted = await exchange(pending)
    const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
    if (!cookie) throw new Error('Handoff response did not issue a session cookie')
    const stale = identity()
    stale.confirmedAt -= 30_001; stale.validUntil = stale.confirmedAt + 30_000
    const stored = JSON.stringify(stale)
    await getDb().prepare('UPDATE prerelease_sessions SET identity_state=?').run(stored)
    const state = identity()
    if (state.account.kind === 'active') state.account.subject.displayName = 'Unaccepted profile'
    if (reason === 'beta_withdrawn') state.betaAccess = false
    if (reason === 'account_deleted') state.account = { kind: 'deleted' }
    if (reason === 'source_invalid') state.source = { kind: 'invalid' }
    if (reason === 'source_expired') state.source = { kind: 'active', expiresAt: Date.now() - 1 }
    if (reason === 'grant_revoked') state.grant.kind = 'revoked'
    if (reason === 'grant_expired') state.grant.expiresAt = Date.now() - 1
    if (reason === 'freshness_elapsed') { state.confirmedAt -= 30_001; state.validUntil = state.confirmedAt + 30_000 }
    if (reason === 'invalid_protocol') state.targetOrigin = 'https://wrong-target.example.test'
    statusReply = () => Response.json({ ok: true, state })
    const response = await exchange(pending, cookie)
    const paused = reason === 'freshness_elapsed' || reason === 'invalid_protocol'
    expect(response.status).toBe(paused ? 503 : 403)
    expect(await response.json()).toEqual({ ok: false, code: paused ? 'prerelease_access_paused' : 'prerelease_access_expired' })
    expect(response.headers.getSetCookie().some(value => value.startsWith('__Host-oa-pre-session='))).toBe(false)
    expect(await getDb().prepare('SELECT display_name FROM users').all()).toEqual([{ display_name: 'Handoff Farmer' }])
    if (paused) expect(await getDb().prepare('SELECT identity_state FROM prerelease_sessions').all()).toEqual([{ identity_state: stored }])
    expect(exchangeCalls).toBe(1)
  })

it('rolls back a receipt refresh when updating the principal fails after the session write', async () => {
  const pending = await begin(), accepted = await exchange(pending)
  const cookie = accepted.headers.getSetCookie().find(value => value.startsWith('__Host-oa-pre-session='))?.split(';')[0]
  if (!cookie) throw new Error('Handoff response did not issue a session cookie')
  const stale = identity()
  stale.confirmedAt -= 30_001; stale.validUntil = stale.confirmedAt + 30_000
  const stored = JSON.stringify(stale)
  await getDb().prepare('UPDATE prerelease_sessions SET identity_state=?').run(stored)
  const state = identity()
  if (state.account.kind === 'active') state.account.subject.displayName = 'Unaccepted profile'
  statusReply = () => Response.json({ ok: true, state })
  await getDb().exec(`CREATE FUNCTION reject_handoff_profile() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Controlled handoff profile storage failure'; END $$;
    CREATE TRIGGER reject_handoff_profile BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_handoff_profile();`)
  try {
    const response = await exchange(pending, cookie)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await getDb().prepare('SELECT display_name FROM users').all()).toEqual([{ display_name: 'Handoff Farmer' }])
    expect(await getDb().prepare('SELECT identity_state FROM prerelease_sessions').all()).toEqual([{ identity_state: stored }])
    expect(exchangeCalls).toBe(1)
  } finally {
    await getDb().exec('DROP TRIGGER reject_handoff_profile ON users; DROP FUNCTION reject_handoff_profile()')
  }
})

it.each(['source_revoked', 'account_deleted'])('does not publish a cookie or profile when %s races the handoff COMMIT', async kind => {
  const db = getDb(), service = getPrereleaseSessions()
  if (!service) throw new Error('Missing prerelease consumer')
  service.setAccountErasure(async userId => { await db.prepare('DELETE FROM users WHERE id=?').run(userId) })
  const pending = await begin(), locked = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const invalidated = Promise.withResolvers<void>()
  service.subscribeInvalidation(() => invalidated.resolve())
  let pid: number | undefined
  authorityReply = async () => {
    pid = (await db.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())?.pid
    return Response.json({ ok: true, state: identity() })
  }
  await db.exec(`CREATE FUNCTION hold_handoff_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(166300015); RETURN NEW; END $$;
    CREATE CONSTRAINT TRIGGER hold_handoff_commit AFTER INSERT ON prerelease_sessions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hold_handoff_commit();`)
  const holding = db.transaction(async () => { await db.prepare('SELECT pg_advisory_xact_lock(166300015)').get(); locked.resolve(); await release.promise })()
  let response: Promise<Response> | undefined, processing: Promise<void> | undefined
  try {
    await locked.promise
    response = exchange(pending)
    await vi.waitFor(async () => {
      const row = pid ? await db.prepare('SELECT query,wait_event FROM pg_stat_activity WHERE pid=?').get<{ query: string; wait_event: string }>(pid) : undefined
      expect(row).toEqual({ query: 'COMMIT', wait_event: 'advisory' })
    }, { timeout: 3000, interval: 5 })
    const eventId = randomUUID()
    events.push(kind === 'source_revoked'
      ? { id: eventId, kind: 'source_revoked', userId: 'handoff-user', grantId: 'g'.repeat(43), createdAt: Date.now() }
      : { id: eventId, kind: 'account_deleted', userId: 'handoff-user', grantId: null, createdAt: Date.now() })
    processing = service.processEvents()
    await invalidated.promise
    expect(acknowledgements).toEqual([])
    release.resolve(); await holding
    const denied = await response
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
    expect(denied.headers.getSetCookie().some(value => value.startsWith('__Host-oa-pre-session='))).toBe(false)
    await processing
    expect(acknowledgements).toEqual([eventId])
    if (kind === 'account_deleted') {
      expect(await db.prepare('SELECT id FROM users').all()).toEqual([])
      expect(await db.prepare('SELECT token_hash FROM prerelease_sessions').all()).toEqual([])
    } else {
      expect(await db.prepare('SELECT revoked_at IS NOT NULL AS revoked FROM prerelease_sessions').all()).toEqual([{ revoked: true }])
    }
  } finally {
    release.resolve()
    await Promise.allSettled([holding, response, processing])
    await db.exec('DROP TRIGGER hold_handoff_commit ON prerelease_sessions; DROP FUNCTION hold_handoff_commit()')
  }
})


it.each(['beta_true', 'status_unavailable', 'beta_false', 'source_revoked', 'account_deleted'])('distinguishes confirmed denial from a post-lease qualification notification for %s', async scenario => {
    const service = getPrereleaseSessions()
    if (!service) throw new Error('Missing prerelease consumer')
    service.setAccountErasure(async userId => { await getDb().prepare('DELETE FROM users WHERE id=?').run(userId) })
    const pending = await begin()
    const original = service.exchangeHandoff.bind(service)
    const spy = vi.spyOn(service, 'exchangeHandoff').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      const eventId = randomUUID()
      events.push(scenario === 'source_revoked'
        ? { id: eventId, kind: 'source_revoked', userId: 'handoff-user', grantId: 'g'.repeat(43), createdAt: Date.now() }
        : { id: eventId, kind: scenario === 'account_deleted' ? 'account_deleted' : 'beta_changed', userId: 'handoff-user', grantId: null, createdAt: Date.now() })
      statusReply = () => {
        if (scenario === 'status_unavailable') throw new Error('Fresh qualification is unknown')
        return Response.json({ ok: true, state: { ...identity(), betaAccess: scenario !== 'beta_false' } })
      }
      await service.processEvents().catch(error => {
        if (scenario !== 'status_unavailable') throw error
      })
      return result
    })
    try {
      const response = await exchange(pending)
      const paused = scenario === 'beta_true' || scenario === 'status_unavailable'
      expect({ status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() })
        .toEqual({ status: paused ? 503 : 403,
          body: { ok: false, code: paused ? 'prerelease_access_paused' : 'prerelease_access_expired' }, cookies: [] })
    } finally { spy.mockRestore() }
  })
