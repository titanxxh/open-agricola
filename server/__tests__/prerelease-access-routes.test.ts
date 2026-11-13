import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_GENERATION_HEADER } from '../../shared/contract/prerelease-runtime'

const fixture = vi.hoisted(() => {
  const runtime = { buildId: 'a'.repeat(40), generationId: '11111111-2222-4333-8444-555555555555', appOrigin: 'https://pre.example.test',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://api.example.test', targetId: 'prerelease-main' }
  let authorized = true
  let invalidity: 'paused' | 'expired' = 'paused'
  const service = { runtime,
    resolve: vi.fn(async (token: string) => authorized && token === 'pre-only' ? { user: { id: 'formal-user', username: 'farmer', displayName: 'Farmer', isAdmin: false }, expiresAt: 700000, validUntil: 30000 } : null),
    cachedAuthorized: vi.fn((token: string) => authorized && token === 'pre-only'),
    status: vi.fn(() => invalidity),
    beginHandoff: vi.fn(async () => ({ cookie: 'browser-binding', formalUrl: 'https://formal.example.test/?page=prerelease-handoff#challenge', expiresAt: Date.now() + 60000 })),
    exchangeHandoff: vi.fn(async () => ({ token: 'pre-only', returnPath: '/open-agricola/?room=retained', user: { id: 'formal-user', username: 'farmer', displayName: 'Farmer', isAdmin: false }, expiresAt: Date.now() + 86400000, validUntil: Date.now() + 30000 })),
    revoke: vi.fn(async () => { authorized = false }),
  }
  return { runtime, service, authorize: (value: boolean, reason: 'paused' | 'expired' = 'expired') => { authorized = value; invalidity = reason } }
})
vi.mock('../prerelease-sessions', () => ({ getPrereleaseSessions: () => process.env.RELEASE_CHANNEL === 'prerelease' ? fixture.service : undefined,
  readPrereleaseRuntime: () => process.env.RELEASE_CHANNEL === 'prerelease' ? fixture.runtime : undefined }))

import { handlePrereleaseRoute, requirePrereleaseRequest } from '../prerelease-routes'

let server: Server | undefined
let origin = ''
let dataReads = 0
let releaseSlow: (() => void) | undefined
beforeEach(async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  fixture.authorize(true)
  fixture.runtime.buildId = 'a'.repeat(40)
  vi.clearAllMocks()
  dataReads = 0
  server = createServer((req, res) => { void (async () => {
    if (await handlePrereleaseRoute(req, res)) return
    if (!await requirePrereleaseRequest(req, res)) return
    if (req.url === '/api/game/slow') await new Promise<void>(resolve => { releaseSlow = resolve })
    const program = req.url?.startsWith('/open-agricola/') || req.url?.startsWith('/replay-viewers/')
    if (!program) dataReads++
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(program ? 'public program' : 'private game state')
  })().catch(error => { res.writeHead(500); res.end(String(error)) }) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP test did not start')
  origin = `http://127.0.0.1:${address.port}`
  fixture.runtime.appOrigin = `https://127.0.0.1:${address.port}`
})
afterEach(async () => {
  releaseSlow?.(); releaseSlow = undefined
  await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()))
  vi.unstubAllEnvs()
})
const headers = (cookie = '__Host-oa-pre-session=pre-only') => ({ origin: fixture.runtime.appOrigin,
  [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), [PRERELEASE_BUILD_HEADER]: 'a'.repeat(40),
  [PRERELEASE_GENERATION_HEADER]: '11111111-2222-4333-8444-555555555555', cookie })

it('gates all data owners before reads while keeping only the program and metadata bootstrap public', async () => {
  for (const path of ['/api/rooms', '/api/rooms/locate', '/api/v1/game-contexts/room', '/api/v1/game-contexts/room/evidence/0',
    '/api/v1/replays/room/manifest', '/replay-assets/' + 'b'.repeat(64), '/card-art/private.png', '/api/workshop/public-cards/cards', '/api/game/state']) {
    const response = await fetch(origin + path, { headers: headers('__Host-oa-session=formal; oa_dev_session=dev; __Host-oa-ops-session=owner') })
    expect(response.status, path).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_auth_required' })
  }
  expect(dataReads).toBe(0)
  for (const path of ['/open-agricola/', '/open-agricola/auth/handoff', '/open-agricola/assets/app-12345678.js', '/replay-viewers/' + 'b'.repeat(64) + '/index.html']) {
    expect((await fetch(origin + path)).status).toBe(200)
  }
  const runtime = await fetch(origin + '/api/prerelease/runtime')
  expect(await runtime.json()).toEqual({ ok: true, channel: 'prerelease', ...fixture.runtime })
  expect(dataReads).toBe(0)
  expect(fixture.service.resolve).not.toHaveBeenCalled()
})

it('admits a current bound session and rejects a cookie retained by an old tab or worker', async () => {
  const current = await fetch(origin + '/api/game/state', { headers: headers() })
  expect(await current.text()).toBe('private game state')
  for (const stale of [{ [PRERELEASE_BUILD_HEADER]: 'c'.repeat(40) }, { [PRERELEASE_GENERATION_HEADER]: '99999999-2222-4333-8444-555555555555' }]) {
    const response = await fetch(origin + '/api/game/state', { headers: { ...headers(), ...stale } })
    expect(response.status).toBe(426)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_runtime_changed' })
  }
  expect(dataReads).toBe(1)
  const crossed = await fetch(origin + '/api/game/state', { headers: { ...headers(), origin: 'https://formal.example.test' } })
  expect(crossed.status).toBe(401)
})

it('blocks local account management and unsupported Viewer data for qualified sessions', async () => {
  for (const path of ['/api/auth/register', '/api/auth/change-password', '/api/auth/oauth/github/start', '/api/admin/beta-access', '/api/prerelease/handoffs',
    '/api/v1/replays/room/manifest', '/replay-assets/' + 'b'.repeat(64)]) {
    const response = await fetch(origin + path, { headers: headers() })
    expect(response.status, path).toBe(403)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_readonly' })
  }
  expect(dataReads).toBe(0)
})

it('does not publish data when access becomes invalid while an owner is awaiting work', async () => {
  const response = fetch(origin + '/api/game/slow', { headers: headers() })
  await vi.waitFor(() => expect(releaseSlow).toBeTypeOf('function'))
  fixture.authorize(false)
  releaseSlow!()
  const result = await response
  expect(result.status).toBe(403)
  expect(await result.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
})

it('keeps an unknown lease lapse paused while suppressing awaited data', async () => {
  const response = fetch(origin + '/api/game/slow', { headers: headers() })
  await vi.waitFor(() => expect(releaseSlow).toBeTypeOf('function'))
  fixture.authorize(false, 'paused')
  releaseSlow!()
  const result = await response
  expect(result.status).toBe(503)
  expect(await result.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
})

it('starts browser-bound handoff and exchanges only the dedicated handoff cookie', async () => {
  const start = await fetch(origin + '/open-agricola/auth/start', { headers: {}, redirect: 'manual' })
  expect(start.status).toBe(302)
  expect(start.headers.get('location')).toBe('https://formal.example.test/?page=prerelease-handoff#challenge')
  expect(start.headers.get('set-cookie')).toMatch(/^__Host-oa-pre-handoff=browser-binding; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure$/)
  const body = { protocolVersion: 1, code: 'code', state: 'state', browserChallenge: 'challenge', returnTo: 'https://formal.example.test/' }
  const response = await fetch(origin + '/api/prerelease/session', { method: 'POST', headers: { ...headers('__Host-oa-pre-handoff=browser-binding; __Host-oa-session=formal'), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  expect(response.status).toBe(200)
  expect(fixture.service.exchangeHandoff).toHaveBeenCalledWith('browser-binding', body, '')
  expect(response.headers.get('set-cookie')).toContain('__Host-oa-pre-session=pre-only; HttpOnly; SameSite=Lax; Path=/; Max-Age=')
  expect(response.headers.get('set-cookie')).not.toMatch(/(?:Domain|Partitioned)=?/)
})

it('permits same-origin image loads with the pre cookie and still rejects sibling-origin image loads', async () => {
  const image = { cookie: '__Host-oa-pre-session=pre-only', 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'image' }
  const response = await fetch(origin + '/card-art/card.png', { headers: image })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('private game state')
  expect((await fetch(origin + '/card-art/card.png', { headers: { ...image, 'sec-fetch-site': 'same-site' } })).status).toBe(401)
  expect((await fetch(origin + '/card-art/card.png', { headers: { ...image, cookie: '__Host-oa-session=formal' } })).status).toBe(401)
  expect(dataReads).toBe(1)
})

it('preserves only canonical product locators through the browser handoff', async () => {
  const preserved = await fetch(origin + '/open-agricola/auth/start?returnPath=' + encodeURIComponent('/open-agricola/?room=retained&step=3&frame=abc'), { redirect: 'manual' })
  expect(preserved.status).toBe(302)
  expect(fixture.service.beginHandoff).toHaveBeenCalledWith('/open-agricola/?room=retained&step=3&frame=abc')
  for (const target of ['https://evil.example/', '//evil.example/', '/open-agricola/../', '/open-agricola/%2e%2e/', '/open-agricola/?room=x#token', '/open-agricola/?token=secret', '/open-agricola/?room=a&room=b']) {
    const response = await fetch(origin + '/open-agricola/auth/start?returnPath=' + encodeURIComponent(target), { redirect: 'manual' })
    expect(response.status, target).toBe(400)
  }
  expect(fixture.service.beginHandoff).toHaveBeenCalledTimes(1)
})

it('does not publish a new session cookie or identity when revocation wins after exchange succeeds', async () => {
  const result = { token: 'pre-only', returnPath: '/open-agricola/?room=retained',
    user: { id: 'formal-user', username: 'farmer', displayName: 'Farmer', isAdmin: false },
    expiresAt: Date.now() + 86400000, validUntil: Date.now() + 30000 }
  fixture.service.exchangeHandoff.mockImplementationOnce(async () => {
    queueMicrotask(() => fixture.authorize(false))
    return result
  })
  const response = await fetch(origin + '/api/prerelease/session', { method: 'POST',
    headers: { ...headers('__Host-oa-pre-handoff=browser-binding; __Host-oa-pre-session=older-session'), 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, code: 'code', state: 'state', browserChallenge: 'challenge', returnTo: 'https://formal.example.test/' }) })
  expect(response.status).toBe(403)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
  expect(fixture.service.revoke).not.toHaveBeenCalled()
})

it('does not publish an identity when revocation wins after the final current-session resolution', async () => {
  const result = { user: { id: 'formal-user', username: 'farmer', displayName: 'Farmer', isAdmin: false }, expiresAt: 700000, validUntil: 30000 }
  fixture.service.resolve.mockResolvedValueOnce(result).mockImplementationOnce(async () => {
    queueMicrotask(() => fixture.authorize(false))
    return result
  })
  const response = await fetch(origin + '/api/auth/me', { headers: headers() })
  expect(response.status).toBe(403)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_expired' })
  expect(fixture.service.revoke).not.toHaveBeenCalled()
})

it('does not publish a session cookie when its immutable application binding changes during exchange', async () => {
  fixture.service.exchangeHandoff.mockImplementationOnce(async () => {
    queueMicrotask(() => { fixture.runtime.buildId = 'd'.repeat(40) })
    return { token: 'pre-only', returnPath: '/open-agricola/',
      user: { id: 'formal-user', username: 'farmer', displayName: 'Farmer', isAdmin: false },
      expiresAt: Date.now() + 86400000, validUntil: Date.now() + 30000 }
  })
  const response = await fetch(origin + '/api/prerelease/session', { method: 'POST',
    headers: { ...headers('__Host-oa-pre-handoff=browser-binding'), 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, code: 'code', state: 'state', browserChallenge: 'challenge', returnTo: 'https://formal.example.test/' }) })
  expect(response.status).toBe(426)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_runtime_changed' })
  expect(fixture.service.revoke).not.toHaveBeenCalled()
})
