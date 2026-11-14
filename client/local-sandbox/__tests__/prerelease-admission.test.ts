// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { afterEach, expect, it, vi } from 'vitest'
import { FakeWorker } from './fake-worker'
const build = 'a'.repeat(40), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it.each(['revoked', 'logout'])('terminates the active local worker on %s and refuses a stale restore without spawning another worker', async ending => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
    appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })))
  const pre = await import('../../services/prerelease-runtime')
  await pre.loadPrereleaseRuntime()
  pre.acceptPrereleaseSession({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
    prerelease: { buildId: build, generationId: generation, expiresAt: Date.now() + 100_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  const { LocalGameTransport } = await import('../local-transport')
  let worker: FakeWorker | undefined
  const factory = vi.fn(() => { worker = new FakeWorker(); return worker })
  const config = { cards: [], playerCount: 2, seed: 42 }
  const transport = new LocalGameTransport(config, { workerFactory: factory })
  const initial = await transport.start()
  expect(initial.state.players).toHaveLength(2)
  const code = ending === 'logout' ? 'prerelease_auth_required' : 'prerelease_access_expired'
  if (ending === 'logout') pre.endPrereleaseSession()
  else pre.rejectPrereleaseAccess(code)
  expect(worker?.terminated).toBe(true)
  await expect(transport.getState()).rejects.toThrow(code)
  const stale = new LocalGameTransport(config, { workerFactory: factory })
  await expect(stale.start()).rejects.toThrow(code)
  expect(factory).toHaveBeenCalledOnce()
  stale.destroy()
})
