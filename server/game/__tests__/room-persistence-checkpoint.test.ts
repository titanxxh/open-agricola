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
  it('archives team membership and results from the same final worker score summaries', () => {
    const session = new GameSession(1601, undefined, { playerCount: 4,
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' } })
    try {
      session.state.gameOver = true
      const workerScores = session.getState().scores!.map((score, index) => ({ ...score, total: (index + 1) * 10 }))
      const finished: Room = { id: 'team-result', session, players: [], maxPlayers: 4,
        version: 0, status: 'playing', startedAt: 10,
        seatOwners: [{ playerIndex: 0, userId: 'u1' }, { playerIndex: 1, userId: 'u2' },
          { playerIndex: 2, userId: 'u1' }, { playerIndex: 3, userId: 'u2' }],
        customSessionExecutor: { scoresForPersistence: () => workerScores } as never }

      const result = buildGameResult(finished, 20)

      expect(result.players.map(player => ({ userId: player.userId, teamIndex: player.teamIndex, score: player.score }))).toEqual([
        { userId: 'u1', teamIndex: 0, score: 10 }, { userId: 'u2', teamIndex: 1, score: 20 },
        { userId: 'u1', teamIndex: 0, score: 30 }, { userId: 'u2', teamIndex: 1, score: 40 },
      ])
      expect(result.team).toMatchObject({ mode: 'multihand', scoring: 'sum', scores: [
        { teamIndex: 0, playerIds: ['p1', 'p3'], total: 40, rank: 2 },
        { teamIndex: 1, playerIds: ['p2', 'p4'], total: 60, rank: 1 },
      ] })
    } finally { session.dispose() }
  })

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
