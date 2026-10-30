import { describe, expect, it } from 'vitest'
import { LocalGameTransport } from '../local-transport.ts'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game.ts'
import { FakeWorker } from './fake-worker.ts'
import { getActiveCardRegistry, setActiveCardRegistry } from '../../../shared/cards/active-registry'
import { CardRegistry } from '../../../shared/cards/registry'
import type { PersistedLocalGame } from '../protocol'

const CONFIG = { cards: [], playerCount: 2, seed: 42 }

describe('LocalGameTransport', () => {
  it('keeps farm restrictions session-bound through the sandbox worker protocol', async () => {
    const persisted: PersistedLocalGame[][] = [[], []]
    const transports = persisted.map(snapshots => new LocalGameTransport({
      cards: [], playerCount: 2, seed: 42, deckIds: ['A'],
    }, { workerFactory: () => new FakeWorker(), onPersist: snapshot => snapshots.push(snapshot) }))
    const [locked, ordinary] = transports
    if (!locked || !ordinary) throw new Error('Expected two local transports')
    const previous = getActiveCardRegistry()
    try {
      for (const transport of transports) {
        const initial = await transport.start()
        const state = initial.state
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
        }
        if (transport === locked) {
          state.players[0]!.minorPlayed = ['B038_FutureBuildingSite']
          state.players[0]!.cardStates.B038_FutureBuildingSite = {
            extraData: { locked: [{ row: 0, col: 0 }] },
          }
        }
        const loaded = await transport.loadGame(state)
        expect(loaded.ok).toBe(true)
        expect(loaded.state.players).toHaveLength(2)
        expect(loaded.interaction.stateId).toBe('idle')
      }
      const before = persisted.map(snapshots => JSON.stringify(snapshots.at(-1)))
      for (const ambient of [null, new CardRegistry()]) {
        setActiveCardRegistry(ambient)
        expect(await locked.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 0 } }))
          .toEqual({ valid: false, error: 'LOCKED' })
        expect(await ordinary.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 0 } }))
          .toEqual({ valid: true, error: null })
        expect(await locked.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 1 } }))
          .toEqual({ valid: true, error: null })
        expect(getActiveCardRegistry()).toBe(ambient)
      }
      await locked.getState()
      await ordinary.getState()
      expect(persisted.map(snapshots => JSON.stringify(snapshots.at(-1)))).toEqual(before)
    } finally {
      transports.forEach(transport => transport.destroy())
      setActiveCardRegistry(previous)
    }
  })

  it('quotes a fence draft through the worker without publishing or persisting a new snapshot', async () => {
    const transport = new LocalGameTransport(CONFIG, { workerFactory: () => new FakeWorker(), viewer: { viewerPlayerId: 'p1', mode: 'viewer' } })
    const snapshots: GameSyncPayload[] = []
    transport.onSnapshot(payload => snapshots.push(payload))
    try {
      const initial = await transport.start()
      initial.state.round = 14
      for (const player of initial.state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      initial.state.players[0]!.resources.wood = 10
      initial.state.actionSpaces.find(space => space.id === 'fencing')!.roundAvailable = 1
      await transport.loadGame(initial.state)
      const pending = await transport.takeAction(0, 'fencing')
      expect(pending.ok, pending.error).toBe(true)
      if (pending.interaction.stateId !== 'wait' || !pending.interaction.requestKey) throw new Error('Expected fence request')
      const requestKey = pending.interaction.requestKey
      const count = snapshots.length
      const edges = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
      expect(await transport.quoteFenceSelection(0, requestKey, { edges })).toEqual({
        requestKey, woodCost: 4, affordable: true, valid: true, error: null,
      })
      expect(snapshots).toHaveLength(count)
      const stray = { edges, extraWood: 0 } as never
      await expect(transport.quoteFenceSelection(0, requestKey, stray)).rejects.toThrow('Invalid fence selection')
      await expect(transport.commitSelection(0, stray)).rejects.toThrow('invalid payload')
      expect(snapshots).toHaveLength(count)
      expect((await transport.commitSelection(0, { edges })).state.players[0]!.resources.wood).toBe(6)
    } finally { transport.destroy() }
  })

  it('starts a game and dispatches calls through the worker', async () => {
    const transport = new LocalGameTransport(CONFIG, { workerFactory: () => new FakeWorker() })
    const snapshots: GameSyncPayload[] = []
    transport.onSnapshot((payload) => snapshots.push(payload))

    const initial = await transport.start()
    expect(initial.ok).toBe(true)
    expect(initial.state.players).toHaveLength(2)

    const updated = await transport.devSetResources(0, { food: 6 })
    expect(updated.state.players[0]?.resources.food).toBe(6)
    expect(snapshots).toHaveLength(2)
    transport.destroy()
  })

  it('exposes farm-choice validation through the raw channel', async () => {
    const transport = new LocalGameTransport(CONFIG, { workerFactory: () => new FakeWorker() })
    const initial = await transport.start()
    const playerId = initial.state.players[0]!.id

    const missing = await transport.validateFarmChoice('room', 'nobody', {})
    expect(missing).toEqual({ valid: false, error: 'Player not found', requestError: true })

    const noSelection = await transport.validateFarmChoice('sow', playerId, {})
    expect(noSelection).toEqual({ valid: false, error: 'NO_SELECTION' })
    transport.destroy()
  })

  it('terminates a stuck worker and recovers from the last persist snapshot', async () => {
    const workers: FakeWorker[] = []
    let swallowNext = false
    const recoveries: string[] = []
    const transport = new LocalGameTransport(CONFIG, {
      timeoutMs: 20,
      workerFactory: () => {
        const worker = new FakeWorker((request) =>
          swallowNext && request.kind === 'call' && request.method === 'takeAction')
        workers.push(worker)
        return worker
      },
      onRecovered: (info) => recoveries.push(info.error),
    })
    const snapshots: GameSyncPayload[] = []
    transport.onSnapshot((payload) => snapshots.push(payload))

    await transport.start()
    await transport.devSetResources(0, { food: 8 })

    swallowNext = true
    await expect(transport.takeAction(0, 'meeting-place')).rejects.toMatchObject({ message: expect.stringMatching(/timed out/) })
    swallowNext = false

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(workers[0]?.terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(recoveries).toEqual(['local sandbox timed out'])
    const recovered = snapshots[snapshots.length - 1]
    expect(recovered?.state.players[0]?.resources.food).toBe(8)

    const after = await transport.devSetResources(1, { wood: 5 })
    expect(after.state.players[1]?.resources.wood).toBe(5)
    expect(after.state.players[0]?.resources.food).toBe(8)
    transport.destroy()
  })

  it('stays dead-but-consistent when init itself times out', async () => {
    const transport = new LocalGameTransport(CONFIG, {
      timeoutMs: 20,
      workerFactory: () => new FakeWorker(() => true),
    })
    await expect(transport.start()).rejects.toMatchObject({ message: expect.stringMatching(/timed out/) })
    transport.destroy()
  })

  it('rejects start() when the worker errors before ready', async () => {
    const transport = new LocalGameTransport(CONFIG, {
      timeoutMs: 5_000,
      workerFactory: () => new FakeWorker(() => false, { failOnStart: true }),
    })
    await expect(transport.start()).rejects.toMatchObject({ message: expect.stringMatching(/worker failed to load/) })
    transport.destroy()
  })

  it('serializes mutating commands — a concurrent second command is rejected', async () => {
    let swallow = false
    const transport = new LocalGameTransport(CONFIG, {
      workerFactory: () => new FakeWorker(
        (req) => swallow && req.kind === 'call' && req.method === 'takeAction',
      ),
    })
    await transport.start()

    swallow = true
    const first = transport.takeAction(0, 'meeting-place') // swallowed → stays in flight
    const firstSettled = first.catch(() => 'rejected')
    await expect(transport.takeAction(0, 'grove')).rejects.toMatchObject({ message: expect.stringMatching(/in flight/) })

    // getState is a read and must not be blocked by the in-flight guard.
    await expect(transport.getState()).resolves.toBeTruthy()

    transport.destroy() // rejects the still-pending first command
    await expect(firstSettled).resolves.toBe('rejected')
  })

  it('terminates the previous worker when a failed restore falls back to start', async () => {
    const workers: FakeWorker[] = []
    const transport = new LocalGameTransport(CONFIG, {
      workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w },
    })

    // A schema mismatch makes restore reject after the worker was already spawned.
    await expect(transport.startFromPersisted({
      schemaVersion: 999,
      config: CONFIG,
      serializedState: {} as never,
    })).rejects.toMatchObject({ message: expect.stringMatching(/schema/) })

    await transport.start() // fallback
    expect(workers).toHaveLength(2)
    expect(workers[0]?.terminated, 'the failed-restore worker must be terminated').toBe(true)
    transport.destroy()
  })
})
