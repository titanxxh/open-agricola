import { describe, expect, it, vi } from 'vitest'
import { Broadcaster } from '../broadcaster.ts'
import { GameSession } from '../../game/authoritative-session.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import { isFixedDevRoom } from '../../game/room.ts'
import type { Room } from '../../game/room.ts'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint.ts'

const makeFakeWs = () => {
  const sent: string[] = []
  return {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => { sent.push(data) },
    close: vi.fn(),
    sent,
  }
}

const makeRoom = (id: string, playerCount = 2): Room => {
  const session = new GameSession()
  const players = Array.from({ length: playerCount }, (_, i) => ({
    ws: makeFakeWs() as never,
    playerIndex: i,
    name: `p${i}`,
    userId: `u${i}`,
  }))
  return { id, session, players, maxPlayers: playerCount, version: 0, status: 'playing' }
}

describe('Broadcaster.broadcastState', () => {
  it('sends one envelope per seated player and bumps version', () => {
    const persistence = new InMemoryRoomPersistence()
    const b = new Broadcaster({ checkpoint: createRoomPersistenceCheckpoint({ persistence }) })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    b.broadcastState(room, resp, 'action', 'req-1')
    expect(room.version).toBe(1)
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent).toHaveLength(1)
      const env = JSON.parse(ws.sent[0]!)
      expect(env.type).toBe('stateUpdate')
      expect(env.roomId).toBe('r1')
      expect(env.version).toBe(1)
    }
  })

  it('marks state dirty and persists it on checkpoint flush', () => {
    const persistence = new InMemoryRoomPersistence()
    const saveSpy = vi.spyOn(persistence, 'save')
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const b = new Broadcaster({ checkpoint })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    b.broadcastState(room, resp, 'action')
    expect(saveSpy).not.toHaveBeenCalled()
    checkpoint.flushAll()
    expect(saveSpy).toHaveBeenCalledTimes(1)
    checkpoint.shutdown()
  })

  it('respects custom shouldPersist predicate', () => {
    const persistence = new InMemoryRoomPersistence()
    const saveSpy = vi.spyOn(persistence, 'save')
    const checkpoint = createRoomPersistenceCheckpoint({
      persistence,
      shouldPersist: (room) => isFixedDevRoom(room.id),
    })
    const b = new Broadcaster({ checkpoint })
    const r1 = makeRoom('r1')
    b.broadcastState(r1, r1.session.withCtx(() => r1.session.getState()), 'action')
    const dev = makeRoom('dev2')
    b.broadcastState(dev, dev.session.withCtx(() => dev.session.getState()), 'action')
    expect(saveSpy).not.toHaveBeenCalled()
    checkpoint.flushAll()
    expect(saveSpy).toHaveBeenCalledTimes(1)
    checkpoint.shutdown()
  })

  it('flushes the final state before marking a game finished', () => {
    const persistence = new InMemoryRoomPersistence()
    const saveSpy = vi.spyOn(persistence, 'save')
    const markSpy = vi.spyOn(persistence, 'markFinished')
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const b = new Broadcaster({ checkpoint })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    ;(resp.state as { gameOver?: boolean }).gameOver = true
    b.broadcastState(room, resp, 'action')
    expect(saveSpy).toHaveBeenCalledOnce()
    expect(markSpy).toHaveBeenCalledWith('r1', expect.any(Number))
    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(markSpy.mock.invocationCallOrder[0]!)
    checkpoint.flushAll()
    expect(saveSpy).toHaveBeenCalledOnce()
    checkpoint.shutdown()
  })
})

describe('Broadcaster.sendStateTo / broadcastEvent / sendTo', () => {
  it('sendStateTo sends a single envelope with cause=reconnect', () => {
    const b = new Broadcaster({ checkpoint: createRoomPersistenceCheckpoint({ persistence: new InMemoryRoomPersistence() }) })
    const room = makeRoom('r1')
    const seat = room.players[0]!
    const resp = room.session.withCtx(() => room.session.getState())
    b.sendStateTo(seat.ws, room, resp, 'req-x')
    const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
    expect(ws.sent).toHaveLength(1)
    const env = JSON.parse(ws.sent[0]!)
    expect(env.cause).toBe('reconnect')
    expect(env.requestId).toBe('req-x')
  })

  it('broadcastEvent sends to all open sockets', () => {
    const b = new Broadcaster({ checkpoint: createRoomPersistenceCheckpoint({ persistence: new InMemoryRoomPersistence() }) })
    const room = makeRoom('r1')
    b.broadcastEvent(room, { type: 'gameStarted' })
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent.map((s) => JSON.parse(s).type)).toContain('gameStarted')
    }
  })

  it('sendTo skips closed sockets', () => {
    const b = new Broadcaster({ checkpoint: createRoomPersistenceCheckpoint({ persistence: new InMemoryRoomPersistence() }) })
    const ws = makeFakeWs()
    ws.readyState = 3 // CLOSED
    b.sendTo(ws as never, { type: 'gameStarted' })
    expect(ws.sent).toEqual([])
  })
})
