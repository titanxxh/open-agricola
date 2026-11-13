// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { afterEach, expect, it, vi } from 'vitest'
import type { PrereleaseFailure } from '../prerelease-runtime'

const build = 'a'.repeat(40)
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const runtime = { ok: true, channel: 'prerelease', buildId: build, generationId: generation,
  appOrigin: 'https://pre.agricola.test', formalAppOrigin: 'https://formal.agricola.test',
  formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' }
const session = { ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
  prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } }
afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

it('binds authenticated API work to this tab build and generation, refusing a replacement generation', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(runtime)).mockResolvedValue(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetchMock)
  const pre = await import('../prerelease-runtime')
  await pre.loadPrereleaseRuntime()
  pre.acceptPrereleaseSession(session)
  const { browserApiFetch } = await import('../browser-api')
  await browserApiFetch('/api/rooms')
  const headers = new Headers(fetchMock.mock.calls[1]![1].headers)
  expect(headers.get('x-oa-pre-build')).toBe(build)
  expect(headers.get('x-oa-pre-generation')).toBe(generation)
  expect(() => pre.acceptPrereleaseSession({ ...session, prerelease: { ...session.prerelease, generationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } })).toThrow('prerelease_runtime_changed')
  await expect(browserApiFetch('/api/rooms')).rejects.toThrow('prerelease_runtime_changed')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})


it('does not reveal a late private response or revive an older successful refresh after a known denial', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  let release: (response: Response) => void = () => { throw new Error('Request was not started') }
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(runtime)).mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const pre = await import('../prerelease-runtime')
  await pre.loadPrereleaseRuntime(); pre.acceptPrereleaseSession(session)
  const revision = pre.getPrereleaseRevision()
  const { browserApiFetch } = await import('../browser-api')
  const privateRead = browserApiFetch('/api/v1/game-contexts/room-1')
  pre.rejectPrereleaseAccess('prerelease_access_expired')
  release(Response.json({ ok: true, hidden: 'private-room-data' }))
  await expect(privateRead).rejects.toThrow('prerelease_access_expired')
  expect(() => pre.acceptPrereleaseSession(session, revision)).toThrow()
  expect(pre.getPrereleaseAccess()).toEqual({ kind: 'blocked', code: 'prerelease_access_expired' })
})

it('refuses a different compiled app build before an account request can start', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', 'b'.repeat(40))
  const fetchMock = vi.fn().mockResolvedValue(Response.json(runtime)); vi.stubGlobal('fetch', fetchMock)
  const pre = await import('../prerelease-runtime')
  await expect(pre.loadPrereleaseRuntime()).rejects.toThrow('prerelease_runtime_changed')
  const { browserApiFetch } = await import('../browser-api')
  await expect(browserApiFetch('/api/auth/me')).rejects.toThrow()
  expect(fetchMock).toHaveBeenCalledOnce()
})


it('expires the worker lease using monotonic request time, including transit despite a skewed browser clock', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.spyOn(Date, 'now').mockReturnValue(1)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(runtime)))
  const pre = await import('../prerelease-runtime')
  await pre.loadPrereleaseRuntime()
  const started = performance.now()
  await vi.advanceTimersByTimeAsync(1000)
  pre.acceptPrereleaseSession({ ...session, prerelease: { ...session.prerelease, serverTime: 1_000_000, validUntil: 1_003_000 } }, pre.getPrereleaseRevision(), started)
  expect(pre.prereleaseWebSocketProtocols()).toEqual(['oa.browser.v2', 'oa.pre.build.' + build, 'oa.pre.generation.' + generation])
  expect(pre.getPrereleaseLeaseRemainingMs()).toBe(2000)
  await vi.advanceTimersByTimeAsync(1999)
  expect(pre.getPrereleaseAccess().kind).toBe('active')
  expect(pre.getPrereleaseLeaseRemainingMs()).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(pre.getPrereleaseAccess()).toEqual({ kind: 'blocked', code: 'prerelease_access_paused' })
  expect(pre.getPrereleaseLeaseRemainingMs()).toBe(0)
  expect(() => pre.assertPrereleaseAccess()).toThrow('prerelease_access_paused')
})


it('preserves a Context locator for handoff while dropping fragments, development flags and credentials', async () => {
  const pre = await import('../prerelease-runtime')
  expect(new URL(pre.prereleaseStartUrl('?context=kept-room&step=4&frame=' + 'f'.repeat(64) + '&devMode=1&player=p1&token=secret'), window.location.origin).searchParams.get('returnPath'))
    .toBe('/open-agricola/?context=kept-room&step=4&frame=' + 'f'.repeat(64))
})


it('keeps an explicit local sign-out terminal despite later failures and fresh positive confirmations', async () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(runtime)))
  const pre = await import('../prerelease-runtime')
  await pre.loadPrereleaseRuntime()
  pre.acceptPrereleaseSession(session)
  pre.endPrereleaseSession()
  const revision = pre.getPrereleaseRevision()
  pre.rejectPrereleaseAccess('prerelease_access_paused')
  expect(pre.getPrereleaseAccess()).toEqual({ kind: 'ended', code: 'prerelease_auth_required' })
  expect(pre.getPrereleaseRevision()).toBe(revision)
  expect(() => pre.acceptPrereleaseSession(session, revision)).toThrow('prerelease_auth_required')
  expect(pre.getPrereleaseLeaseRemainingMs()).toBe(0)
  expect(() => pre.assertPrereleaseAccess()).toThrow('prerelease_auth_required')
})

const terminalFailures: Array<Exclude<PrereleaseFailure, 'prerelease_access_paused'>> = [
  'prerelease_auth_required', 'prerelease_access_expired', 'prerelease_runtime_changed', 'invalid_prerelease_handoff',
]
it.each(terminalFailures)('requires a fresh document after %s despite later pauses and positive confirmations', async code => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(runtime)))
  const pre = await import('../prerelease-runtime')
  await pre.loadPrereleaseRuntime(); pre.acceptPrereleaseSession(session)
  pre.observePrereleaseFailure(code)
  const revision = pre.getPrereleaseRevision()
  pre.observePrereleaseFailure('prerelease_access_paused')
  expect(pre.getPrereleaseAccess()).toEqual({ kind: 'blocked', code })
  expect(pre.getPrereleaseRevision()).toBe(revision)
  expect(() => pre.acceptPrereleaseSession(session, revision)).toThrow(code)
  expect(() => pre.assertPrereleaseAccess()).toThrow(code)
  expect(pre.getPrereleaseLeaseRemainingMs()).toBe(0)

  vi.resetModules()
  const fresh = await import('../prerelease-runtime')
  await fresh.loadPrereleaseRuntime(); fresh.acceptPrereleaseSession(session)
  expect(fresh.getPrereleaseAccess()).toMatchObject({ kind: 'active', session: { user: { id: 'u1' } } })
})
