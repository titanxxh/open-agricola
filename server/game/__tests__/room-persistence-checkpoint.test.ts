import { describe, expect, it, vi } from 'vitest'
import { GameSession } from '../authoritative-session.ts'
import type { Room } from '../room.ts'
import { snapshotToRoom } from '../room.ts'
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

const schedulerHarness = () => {
  type Timer = { callback: () => void; delay: number }
  const timers = new Set<Timer>()
  const scheduler = {
    setTimeout: vi.fn((callback: () => void, delay: number) => {
      const timer = { callback, delay }
      timers.add(timer)
      return timer
    }),
    clearTimeout: vi.fn((handle: unknown) => {
      timers.delete(handle as Timer)
    }),
  }
  return {
    scheduler,
    pending: () => timers.size,
    tick: () => {
      const timer = timers.values().next().value
      if (!timer) return
      timers.delete(timer)
      timer.callback()
    },
  }
}

describe('Room Persistence Checkpoint', () => {
  it('persists creation state immediately while delaying later state serialization', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })
    const r = room()
    r.session = new GameSession(undefined, undefined, {
      playerCount: 2,
      enableCommunityDeck: true,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    r.draftParents = false

    checkpoint.recordCreated(r)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenLastCalledWith('r1', expect.any(Object), expect.objectContaining({ status: 'waiting' }))
    expect(persistence.load('r1')?.serialized).not.toBeNull()
    expect(snapshotToRoom(persistence.load('r1')!).session.state).toMatchObject({
      enableCommunityDeck: true,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    expect(clock.pending()).toBe(0)

    r.status = 'playing'
    checkpoint.recordMeta(r)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('r1', null, expect.objectContaining({ status: 'playing' }))

    checkpoint.recordState(r)
    expect(clock.pending()).toBe(1)
    clock.tick()
    expect(save).toHaveBeenCalledTimes(3)
    expect(persistence.load('r1')?.serialized).not.toBeNull()
    expect(snapshotToRoom(persistence.load('r1')!).draftParents).toBe(false)
  })

  it('coalesces rapid updates and saves the latest authoritative state once', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })
    const r = room()

    checkpoint.recordState(r)
    r.session.state.rngTick = 1
    checkpoint.recordState(r)
    r.session.state.rngTick = 2
    checkpoint.recordState(r)

    expect(save).not.toHaveBeenCalled()
    expect(clock.scheduler.setTimeout).toHaveBeenCalledOnce()
    expect(clock.scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000)
    clock.tick()
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[1]).toMatchObject({ rngTick: 2 })
  })

  it('flushes multiple dirty rooms from one scheduler tick', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })

    checkpoint.recordState(room('r1'))
    checkpoint.recordState(room('r2'))

    expect(clock.scheduler.setTimeout).toHaveBeenCalledOnce()
    clock.tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls.map(([id]) => id).sort()).toEqual(['r1', 'r2'])
  })

  it('keeps an update that arrives during a flush dirty for the next tick', () => {
    const persistence = new InMemoryRoomPersistence()
    const originalSave = persistence.save.bind(persistence)
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })
    const r = room()
    let saves = 0
    vi.spyOn(persistence, 'save').mockImplementation((...args) => {
      originalSave(...args)
      saves += 1
      if (saves === 1) {
        r.session.state.rngTick = 2
        checkpoint.recordState(r)
      }
    })

    checkpoint.recordState(r)
    clock.tick()
    expect(saves).toBe(1)
    expect(clock.pending()).toBe(1)

    clock.tick()
    expect(saves).toBe(2)
    expect(persistence.load(r.id)?.serialized).toMatchObject({ rngTick: 2 })
  })

  it('cancels stale writes for deleted and terminal rooms', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const complete = vi.spyOn(persistence, 'complete')
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
      now: () => 123,
    })
    const deleted = room('deleted')
    const finished = room('finished')
    finished.startedAt = 1
    finished.session.state.gameOver = true

    checkpoint.recordState(deleted)
    checkpoint.discardRoom(deleted.id)
    checkpoint.flushRoom(deleted)
    checkpoint.recordState(deleted)
    checkpoint.recordState(finished)
    checkpoint.completeGame(finished)
    checkpoint.flushRoom(finished)
    checkpoint.recordState(finished)
    clock.tick()

    expect(save).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'finished',
      startedAt: 1,
      finishedAt: 123,
      playerCount: 2,
    }))
    expect(clock.pending()).toBe(0)
  })

  it('flushes all dirty rooms and disposes the timer on shutdown', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })

    checkpoint.recordState(room('r1'))
    checkpoint.recordState(room('r2'))
    checkpoint.shutdown()

    expect(save).toHaveBeenCalledTimes(2)
    expect(clock.pending()).toBe(0)
    checkpoint.recordState(room('r3'))
    checkpoint.flushAll()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('filters dirty saves without filtering discard checkpoints', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const discard = vi.spyOn(persistence, 'discard')
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      shouldPersist: (r) => r.id === 'dev2',
    })

    checkpoint.recordCreated(room('r1'))
    checkpoint.flushAll()
    expect(save).not.toHaveBeenCalled()

    checkpoint.discardRoom('r1')
    expect(discard).toHaveBeenCalledWith('r1')
    checkpoint.shutdown()
  })

  it('retains the final state and leaves completion retryable on archive failure', () => {
    const persistence = new InMemoryRoomPersistence()
    vi.spyOn(persistence, 'complete').mockReturnValue({ ok: false, error: 'write failed' })
    const save = vi.spyOn(persistence, 'save')
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const finished = room('finished')
    finished.startedAt = 10
    finished.session.state.gameOver = true

    expect(checkpoint.completeGame(finished, 20)).toEqual({ ok: false, error: 'write failed' })
    expect(persistence.load('finished')?.serialized?.gameOver).toBe(true)
    checkpoint.recordState(finished)
    checkpoint.flushAll()

    expect(save).toHaveBeenCalledTimes(2)
    checkpoint.shutdown()
  })

  it('does not write when no room is dirty', () => {
    const persistence = new InMemoryRoomPersistence()
    const save = vi.spyOn(persistence, 'save')
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })

    checkpoint.flushAll()

    expect(save).not.toHaveBeenCalled()
    checkpoint.shutdown()
  })

  it('contains immediate save failures and retries them later', () => {
    const persistence = new InMemoryRoomPersistence()
    const originalSave = persistence.save.bind(persistence)
    const save = vi.spyOn(persistence, 'save')
      .mockImplementationOnce(() => { throw new Error('write failed') })
      .mockImplementationOnce(() => { throw new Error('write failed') })
      .mockImplementationOnce(() => { throw new Error('write failed') })
      .mockImplementation(originalSave)
    const clock = schedulerHarness()
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      scheduler: clock.scheduler,
    })
    const r = room()

    expect(() => checkpoint.recordCreated(r)).not.toThrow()
    expect(() => checkpoint.recordMeta(r)).not.toThrow()
    expect(() => checkpoint.flushRoom(r)).not.toThrow()
    expect(clock.pending()).toBe(1)
    clock.tick()

    expect(save).toHaveBeenCalledTimes(4)
    expect(persistence.load(r.id)?.serialized).not.toBeNull()
  })
})
