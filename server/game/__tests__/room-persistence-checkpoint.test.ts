import { describe, expect, it, vi } from 'vitest'
import { GameSession } from '../authoritative-session.ts'
import type { Room } from '../room.ts'
import { snapshotToRoom } from '../room.ts'
import { InMemoryRoomPersistence } from '../persistence/memory-adapter.ts'
import { buildGameResult, createRoomPersistenceCheckpoint } from '../room-persistence-checkpoint.ts'

const room = (id = 'r1'): Room => {
  const session = new GameSession(961, undefined, { playerCount: 2 })
  return {
    id,
    session,
    players: [{
      ws: {} as never,
      playerIndex: 0,
      name: 'host',
      userId: 'u1',
    }],
    maxPlayers: 2,
    version: 0,
    status: 'waiting',
    createdBy: 'u1',
  }
}

describe('Room Persistence Checkpoint', () => {
  it('archives default-name provenance while preserving a colliding numeric account name', () => {
    const r = room()
    r.session = new GameSession(936, undefined, { playerCount: 2, playerNames: ['Player 2'] })
    for (const player of r.session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    r.startedAt = 1
    const result = buildGameResult(r, 2)
    expect(result.players[0]).toMatchObject({ displayName: 'Player 2' })
    expect(result.players[0]!.nameIsDefault).not.toBe(true)
    expect(result.players[1]).toMatchObject({ displayName: 'Player 2', nameIsDefault: true })
  })
  it('waits for durable creation and propagates a failed write', async () => {
    const persistence = new InMemoryRoomPersistence()
    const save = persistence.save.bind(persistence)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(persistence, 'save').mockImplementationOnce(async (...args) => { await gate; save(...args) })
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const r = room()
    let complete = false
    const pending = checkpoint.recordCreated(r).then(() => { complete = true })
    await Promise.resolve()
    expect(complete).toBe(false)
    expect(persistence.load(r.id)).toBeNull()
    release()
    await pending
    expect(snapshotToRoom(persistence.load(r.id)!).session.state.players).toHaveLength(2)
    vi.spyOn(persistence, 'save').mockImplementationOnce(() => { throw new Error('database unavailable') })
    await expect(checkpoint.recordMeta(r)).rejects.toThrow('database unavailable')
  })

  it('durably saves waiting-room names without changing the authoritative version', async () => {
    const persistence = new InMemoryRoomPersistence()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const r = room()
    await checkpoint.recordCreated(r)
    r.session.updatePlayerName(0, 'Renamed')
    await checkpoint.recordMeta(r)
    expect(persistence.load(r.id)?.serialized?.state.players[0]?.name).toBe('Renamed')
    expect(r.version).toBe(0)
  })

  it('prevents retired rooms or stopped checkpoints from saving again', async () => {
    const persistence = new InMemoryRoomPersistence()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const r = room()
    await checkpoint.recordCreated(r)
    await checkpoint.discardRoom(r.id)
    expect(persistence.load(r.id)).toBeNull()
    await expect(checkpoint.recordMeta(r)).rejects.toThrow('no longer writable')
    checkpoint.shutdown()
    await expect(checkpoint.recordCreated(room('new'))).rejects.toThrow('no longer writable')
  })

  it('archives final scores produced by the custom session worker', () => {
    const finished = room('finished')
    finished.startedAt = 10
    finished.session.state.gameOver = true
    const workerScores = finished.session.getState().scores!.map((score, index) => ({ ...score, total: 100 + index }))
    finished.customSessionExecutor = { scoresForPersistence: () => workerScores } as never
    expect(buildGameResult(finished, 20).players.map(player => player.score)).toEqual([100, 101])
  })
})
