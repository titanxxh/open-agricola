import { describe, expect, it } from 'vitest'
import { RoomRegistry } from '../room-registry.ts'
import type { Room } from '../room.ts'

const fakeRoom = (id: string): Room => ({
  id, session: {} as never, players: [], maxPlayers: 2, version: 0, status: 'waiting',
})

describe('RoomRegistry', () => {
  it('set / get / has / delete round-trip', () => {
    const r = new RoomRegistry()
    expect(r.get('a')).toBeUndefined()
    r.set(fakeRoom('a'))
    expect(r.has('a')).toBe(true)
    expect(r.get('a')?.id).toBe('a')
    r.delete('a')
    expect(r.get('a')).toBeUndefined()
  })

  it('size + iter reflect contents', () => {
    const r = new RoomRegistry()
    r.set(fakeRoom('a'))
    r.set(fakeRoom('b'))
    expect(r.size()).toBe(2)
    expect([...r.iter()].map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('touchActivity / lastActivityOf / clearActivity are independent of rooms', () => {
    const r = new RoomRegistry()
    r.touchActivity('a', 1000)
    expect(r.lastActivityOf('a')).toBe(1000)
    r.clearActivity('a')
    expect(r.lastActivityOf('a')).toBeUndefined()
  })

  it('delete does not auto-clear activity (caller responsibility)', () => {
    const r = new RoomRegistry()
    r.set(fakeRoom('a'))
    r.touchActivity('a', 1000)
    r.delete('a')
    expect(r.lastActivityOf('a')).toBe(1000)
  })
})
