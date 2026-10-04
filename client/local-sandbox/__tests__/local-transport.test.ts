import { describe, expect, it } from 'vitest'
import { LocalGameTransport } from '../local-transport.ts'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game.ts'
import { FakeWorker } from './fake-worker.ts'

const CONFIG = { cards: [], playerCount: 2, seed: 42 }

describe('LocalGameTransport', () => {
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
