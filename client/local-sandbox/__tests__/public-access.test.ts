// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { canonicalJson } from '../../../shared/contract/authoritative-command'
import type { WorkshopPublicCardInput } from '../../../shared/contract/workshop-public-cards'

const buildId = 'a'.repeat(40), generationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const input: WorkshopPublicCardInput = { protocolVersion: 1, source: { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: 'public', versionId: 'version' },
  cardJson: { id: 'CUSTOM_PublicLease', name: 'Public lease', deck: 'CUSTOM', number: 0, desc: [], card_type: 'minor' }, effectCode: null, art: null }
const snapshot = { input, sha256: createHash('sha256').update(canonicalJson(input)).digest('hex') }
const cleanups: Array<() => void> = []
afterEach(() => { cleanups.splice(0).forEach(close => close()); vi.useRealTimers(); vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function setup() {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); vi.setSystemTime(1_800_000_000_000)
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', buildId)
  let reply = async () => Response.json({ ok: true, lease: { buildId, generationId, contractId: 'candidate-contract', serverTime: Date.now(), validUntil: Date.now() + 30_000 } })
  const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/api/prerelease/runtime') ? Response.json({ ok: true, channel: 'prerelease', buildId, generationId,
    appOrigin: window.location.origin, formalAppOrigin: 'https://formal.test', formalApiBase: 'https://formal-api.test', targetId: 'prerelease-main' }) : reply())
  vi.stubGlobal('fetch', fetcher)
  const pre = await import('../../services/prerelease-runtime'); await pre.loadPrereleaseRuntime()
  pre.acceptPrereleaseSession({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
    prerelease: { buildId, generationId, expiresAt: Date.now() + 86_400_000, serverTime: Date.now(), validUntil: Date.now() + 30_000 } })
  const { PublicSandboxAccess } = await import('../public-access')
  const inputs = { snapshots: [snapshot], buildId, generationId, contractId: 'candidate-contract' }
  return { pre, PublicSandboxAccess, inputs, fetcher, reply: (value: typeof reply) => { reply = value } }
}

it('counts source-response transit and sleep against the original deadline without extending it on failure', async () => {
  const fixture = await setup(), paused = vi.fn(), access = new fixture.PublicSandboxAccess(fixture.inputs, paused)
  cleanups.push(() => access.stop())
  const release = Promise.withResolvers<Response>(), started = Date.now()
  fixture.reply(() => release.promise)
  const opening = access.start()
  await vi.advanceTimersByTimeAsync(1000)
  release.resolve(Response.json({ ok: true, lease: { ...fixture.inputs, snapshots: undefined, serverTime: started, validUntil: started + 2000 } }))
  await opening
  expect(access.lease().wallDeadline).toBe(started + 2000)
  fixture.reply(async () => { throw new Error('source offline') })
  await vi.advanceTimersByTimeAsync(999)
  expect(() => access.assert()).not.toThrow()
  vi.setSystemTime(started + 2000)
  expect(() => access.assert()).toThrow('Public card execution paused')
  await vi.advanceTimersByTimeAsync(1)
  expect(paused).toHaveBeenCalledOnce()
})

it('does not accept an older positive source response after a known disable', async () => {
  const fixture = await setup(), paused = vi.fn(), access = new fixture.PublicSandboxAccess(fixture.inputs, paused)
  cleanups.push(() => access.stop()); await access.start()
  const release = Promise.withResolvers<Response>()
  fixture.reply(() => release.promise)
  const stale = access.refresh().catch((error: unknown) => error)
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_execution_paused' }, { status: 400 }))
  await expect(access.refresh()).rejects.toThrow('Public card execution paused')
  release.resolve(Response.json({ ok: true, lease: { buildId, generationId, contractId: 'candidate-contract', serverTime: Date.now(), validUntil: Date.now() + 30_000 } }))
  expect(await stale).toBeInstanceOf(Error)
  expect(() => access.assert()).toThrow('Public card execution paused')
  expect(paused).toHaveBeenCalledOnce()
})

it('terminates an idle actual-core worker at source denial and checks a restore before spawning a replacement', async () => {
  const fixture = await setup(), { LocalGameTransport } = await import('../local-transport'), { FakeWorker } = await import('./fake-worker')
  let worker: InstanceType<typeof FakeWorker> | undefined
  const factory = vi.fn(() => { worker = new FakeWorker(); return worker })
  const config = { cards: [], playerCount: 2, seed: 42, publicInputs: fixture.inputs }, persisted: import('../protocol').PersistedLocalGame[] = []
  const transport = new LocalGameTransport(config, { workerFactory: factory, onPersist: value => persisted.push(value) })
  cleanups.push(() => transport.destroy())
  const initial = await transport.start()
  expect(initial.state.players).toHaveLength(2)
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_execution_paused' }, { status: 400 }))
  await vi.advanceTimersByTimeAsync(15_000)
  expect(worker?.terminated).toBe(true)
  await expect(transport.getState()).rejects.toThrow()
  const restored = new LocalGameTransport(config, { workerFactory: factory }); cleanups.push(() => restored.destroy())
  await expect(restored.startFromPersisted(persisted[0]!)).rejects.toThrow()
  expect(factory).toHaveBeenCalledOnce()
  expect(persisted).toHaveLength(1)
})

it('rejects arbitrary source and a different build or generation before the worker starts', async () => {
  const fixture = await setup(), { LocalGameTransport } = await import('../local-transport')
  const factory = vi.fn()
  expect(() => new LocalGameTransport({ cards: [{ cardType: 'minor', cardJson: { id: 'CUSTOM_Injected', name: 'Injected', deck: 'CUSTOM', number: 0, desc: [] }, source: 'private code' }], playerCount: 2 }, { workerFactory: factory })).toThrow('Fixed public inputs required')
  for (const binding of [{ buildId: 'b'.repeat(40) }, { generationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]) {
    const transport = new LocalGameTransport({ cards: [], playerCount: 2, publicInputs: { ...fixture.inputs, ...binding } }, { workerFactory: factory })
    cleanups.push(() => transport.destroy()); await expect(transport.start()).rejects.toThrow('prerelease_runtime_changed')
  }
  expect(factory).not.toHaveBeenCalled()
})

it('drops a pending worker response after source denial instead of publishing or persisting it', async () => {
  const fixture = await setup(), { LocalGameTransport } = await import('../local-transport'), { FakeWorker } = await import('./fake-worker')
  class DelayedWorker extends FakeWorker {
    held?: import('../protocol').LocalSandboxRequest
    override postMessage(request: import('../protocol').LocalSandboxRequest) { if (request.kind === 'call') this.held = request; else super.postMessage(request) }
    release() { if (this.held) super.postMessage(this.held) }
  }
  let worker: DelayedWorker | undefined
  const saved: import('../protocol').PersistedLocalGame[] = [], transport = new LocalGameTransport({ cards: [], playerCount: 2, seed: 42, publicInputs: fixture.inputs }, {
    workerFactory: () => { worker = new DelayedWorker(); return worker }, onPersist: value => saved.push(value),
  })
  cleanups.push(() => transport.destroy()); await transport.start(); await vi.advanceTimersByTimeAsync(14_000)
  const emit = vi.fn(); transport.onSnapshot(emit)
  const pending = transport.getState().catch((error: unknown) => error)
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_execution_paused' }, { status: 400 }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toBeInstanceOf(Error)
  worker?.release(); await Promise.resolve()
  expect(worker?.terminated).toBe(true); expect(emit).not.toHaveBeenCalled(); expect(saved).toHaveLength(1)
})

it('does not recreate a timed-out worker from a compiled package after the fixed source is disabled', async () => {
  const fixture = await setup(), { LocalGameTransport } = await import('../local-transport'), { FakeWorker } = await import('./fake-worker')
  const factory = vi.fn(() => new FakeWorker(request => request.kind === 'call'))
  const transport = new LocalGameTransport({ cards: [], playerCount: 2, seed: 42, publicInputs: fixture.inputs }, { workerFactory: factory, timeoutMs: 10 })
  cleanups.push(() => transport.destroy()); await transport.start()
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_execution_paused' }, { status: 400 }))
  const pending = transport.getState().catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(10)
  expect(await pending).toMatchObject({ message: 'local sandbox timed out' })
  expect(factory).toHaveBeenCalledOnce()
})

it('checks a fresh allowNew before resetting an existing game without revoking its allowExisting lease', async () => {
  const fixture = await setup(), { LocalGameTransport } = await import('../local-transport'), { FakeWorker } = await import('./fake-worker')
  const transport = new LocalGameTransport({ cards: [], playerCount: 2, seed: 42, publicInputs: fixture.inputs }, { workerFactory: () => new FakeWorker() })
  cleanups.push(() => transport.destroy())
  const initial = await transport.start()
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_unavailable_new' }, { status: 409 }))
  await expect(transport.newGame(43)).rejects.toThrow('Public card unavailable for new execution')
  expect((await transport.getState()).state).toEqual(initial.state)
})

it('preserves the specific source refusal when loading fixed inputs', async () => {
  const fixture = await setup(), { loadPublicSandboxInputs } = await import('../public-access')
  fixture.reply(async () => Response.json({ ok: false, code: 'public_card_execution_paused', error: 'Public image checksum mismatch' }, { status: 400 }))
  await expect(loadPublicSandboxInputs(['public'])).rejects.toThrow('Public image checksum mismatch')
})
