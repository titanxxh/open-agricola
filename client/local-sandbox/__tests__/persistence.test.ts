import { describe, expect, it } from 'vitest'
import {
  createDebouncedSaver,
  loadResumable,
  MemoryGameStore,
  type LocalGameStore,
} from '../persistence.ts'
import { LOCAL_SANDBOX_SCHEMA_VERSION, type PersistedLocalGame } from '../protocol.ts'
import { LocalGameTransport } from '../local-transport.ts'
import { FakeWorker } from './fake-worker.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fakePersisted = (overrides: Partial<PersistedLocalGame> = {}): PersistedLocalGame => ({
  schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION,
  config: { cards: [], playerCount: 2, seed: 1 },
  serializedState: { marker: 'fake' } as never,
  ...overrides,
})

describe('MemoryGameStore & loadResumable', () => {
  it('round-trips a persisted game', async () => {
    const store = new MemoryGameStore()
    expect(await loadResumable(store)).toBeNull()
    await store.save(fakePersisted())
    expect((await loadResumable(store))?.config.playerCount).toBe(2)
  })

  it('drops saves from another schema version', async () => {
    const store = new MemoryGameStore()
    await store.save(fakePersisted({ schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION + 1 }))
    expect(await loadResumable(store)).toBeNull()
    expect(await store.load()).toBeNull()
  })

  it('drops saves that fail to read', async () => {
    let cleared = false
    const broken: LocalGameStore = {
      save: () => Promise.resolve(),
      load: () => Promise.reject(new Error('corrupt')),
      clear: () => { cleared = true; return Promise.resolve() },
    }
    expect(await loadResumable(broken)).toBeNull()
    expect(cleared).toBe(true)
  })
})

describe('createDebouncedSaver', () => {
  it('coalesces rapid pushes into one write of the latest snapshot', async () => {
    const writes: PersistedLocalGame[] = []
    const store: LocalGameStore = {
      save: (p) => { writes.push(p); return Promise.resolve() },
      load: () => Promise.resolve(null),
      clear: () => Promise.resolve(),
    }
    const saver = createDebouncedSaver(store, 10)
    saver.push(fakePersisted({ config: { cards: [], playerCount: 2, seed: 1 } }))
    saver.push(fakePersisted({ config: { cards: [], playerCount: 3, seed: 1 } }))
    saver.push(fakePersisted({ config: { cards: [], playerCount: 4, seed: 1 } }))
    await sleep(30)
    expect(writes).toHaveLength(1)
    expect(writes[0]?.config.playerCount).toBe(4)
  })

  it('flush writes immediately and cancel discards', async () => {
    const writes: PersistedLocalGame[] = []
    const store: LocalGameStore = {
      save: (p) => { writes.push(p); return Promise.resolve() },
      load: () => Promise.resolve(null),
      clear: () => Promise.resolve(),
    }
    const saver = createDebouncedSaver(store, 10_000)
    saver.push(fakePersisted())
    await saver.flush()
    expect(writes).toHaveLength(1)

    saver.push(fakePersisted())
    saver.cancel()
    await sleep(20)
    expect(writes).toHaveLength(1)
  })
})

describe('end-to-end resume through the transport', () => {
  it('persists via onPersist and resumes a fresh transport from the store', async () => {
    const store = new MemoryGameStore()
    const saver = createDebouncedSaver(store, 5)
    const first = new LocalGameTransport(
      { cards: [], playerCount: 2, seed: 42 },
      { workerFactory: () => new FakeWorker(), onPersist: saver.push },
    )
    await first.start()
    await first.devSetResources(0, { food: 6, clay: 3 })
    await saver.flush()
    first.destroy()

    const persisted = await loadResumable(store)
    expect(persisted).not.toBeNull()

    const second = new LocalGameTransport(
      { cards: [], playerCount: 2 },
      { workerFactory: () => new FakeWorker() },
    )
    const resumed = await second.startFromPersisted(persisted!)
    expect(resumed.ok).toBe(true)
    expect(resumed.state.players[0]?.resources.food).toBe(6)
    expect(resumed.state.players[0]?.resources.clay).toBe(3)
    second.destroy()
  })
})
