import { describe, expect, it, vi } from 'vitest'
import { Broadcaster } from '../broadcaster.ts'
import { GameSession } from '../../game/authoritative-session.ts'
import type { Room } from '../../game/room.ts'

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
  const session = new GameSession(961, undefined, { playerCount: 2 })
  const players = Array.from({ length: playerCount }, (_, i) => ({
    ws: makeFakeWs() as never,
    playerIndex: i,
    name: `p${i}`,
    userId: `u${i}`,
  }))
  return { id, session, players, maxPlayers: playerCount, version: 0, status: 'playing' }
}

describe('Broadcaster.broadcastCommitted', () => {
  it('publishes the committed version and separate player perspectives', () => {
    const b = new Broadcaster()
    const room = makeRoom('r1')
    room.version = 12
    const response = room.session.getState()
    b.broadcastCommitted(room, response, 'action', 'request')
    expect(room.version).toBe(12)
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent).toHaveLength(1)
      const event = JSON.parse(ws.sent[0]!)
      expect(event).toMatchObject({ type: 'stateUpdate', version: 12, roomId: 'r1', requestId: 'request' })
      const other = 1 - seat.playerIndex
      expect(event.payload.state.players[other].minorHand).not.toEqual(response.state.players[other]!.minorHand)
    }
  })
})

describe('Broadcaster.sendStateTo / broadcastEvent / sendTo', () => {
  it('sendStateTo sends a single envelope with cause=reconnect', () => {
    const b = new Broadcaster()
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
    const b = new Broadcaster()
    const room = makeRoom('r1')
    b.broadcastEvent(room, { type: 'gameStarted' })
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent.map((s) => JSON.parse(s).type)).toContain('gameStarted')
    }
  })

  it('sendTo skips closed sockets', () => {
    const b = new Broadcaster()
    const ws = makeFakeWs()
    ws.readyState = 3 // CLOSED
    b.sendTo(ws as never, { type: 'gameStarted' })
    expect(ws.sent).toEqual([])
  })
})
