import { describe, expect, it, vi } from 'vitest'
import { GameSession } from '../authoritative-session.ts'
import type { Room } from '../room.ts'
import { InMemoryRoomPersistence } from '../persistence/memory-adapter.ts'
import { createRoomPersistenceCheckpoint } from '../room-persistence-checkpoint.ts'

const room = (id = 'r1'): Room => {
  const session = new GameSession()
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
  it('records creation, metadata, state and completion through one seam', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const r = room()

    checkpoint.recordCreated(r)
    expect(save).toHaveBeenNthCalledWith(1, 'r1', null, expect.objectContaining({ status: 'waiting' }))
    expect(save).toHaveBeenNthCalledWith(2, 'r1', expect.objectContaining({ players: expect.any(Array) }), expect.objectContaining({ status: 'waiting' }))

    r.status = 'playing'
    checkpoint.recordMeta(r)
    expect(persistence.load('r1')?.serialized).not.toBeNull()
    expect(persistence.load('r1')?.meta.status).toBe('playing')

    checkpoint.recordState(r, r.session.getState().state)
    expect(save).toHaveBeenLastCalledWith('r1', expect.objectContaining({ players: expect.any(Array) }), expect.objectContaining({ status: 'playing' }))

    checkpoint.recordFinished('r1', 123)
    expect(persistence.load('r1')?.meta.status).toBe('finished')

    checkpoint.deleteRoom('r1')
    expect(persistence.load('r1')).toBeNull()
  })

  it('filters saves without filtering completion checkpoints', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const markFinished = vi.spyOn(persistence, 'markFinished')
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      shouldPersist: (r) => r.id === 'dev2',
    })

    checkpoint.recordCreated(room('r1'))
    expect(save).not.toHaveBeenCalled()

    checkpoint.recordFinished('r1', 123)
    expect(markFinished).toHaveBeenCalledWith('r1', 123)
  })
})
