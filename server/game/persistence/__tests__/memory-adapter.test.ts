import { describe, expect, it, beforeEach } from 'vitest'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = { _stub: true } as unknown as SerializedGameState

describe('InMemoryRoomPersistence', () => {
  let p: InMemoryRoomPersistence

  beforeEach(() => { p = new InMemoryRoomPersistence() })

  it('save → load round-trips serialized + meta + updatedAt', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1')
    expect(snap?.serialized).toEqual(STATE)
    expect(snap?.meta).toEqual(META)
    expect(snap?.updatedAt).toBeGreaterThan(0)
  })

  it('save twice updates the existing row (no duplicate on listRestorable)', () => {
    p.save('r1', STATE, META)
    p.save('r1', STATE, { ...META, status: 'waiting' })
    expect(p.load('r1')?.meta.status).toBe('waiting')
  })

  it('delete removes the row', () => {
    p.save('r1', STATE, META)
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
  })

  it('markFinished flips status', () => {
    p.save('r1', STATE, META)
    p.markFinished('r1', Date.now() + 100)
    expect(p.load('r1')?.meta.status).toBe('finished')
  })

  it('listRestorable filters finished + excluded + stale', () => {
    const NOW = 10_000_000
    p.save('fresh', STATE, { ...META, status: 'playing' })
    p.save('finished', STATE, { ...META, status: 'finished' })
    p.save('dev', STATE, { ...META, status: 'playing' })
    p.save('stale-playing', STATE, { ...META, status: 'playing' })
    p.__setUpdatedAtForTest('stale-playing', NOW - 99_999_999)

    const restored = p.listRestorable({
      now: NOW,
      waitingTtlMs: 1000,
      playingTtlMs: 1000,
      excludeIds: ['dev'],
    })
    expect(restored.map((s) => s.id).sort()).toEqual(['fresh'])
  })

  it('listRestorable updates updatedAt when marking stale rows as finished', () => {
    const NOW = 10_000_000
    p.save('stale', STATE, { ...META, status: 'playing' })
    p.__setUpdatedAtForTest('stale', NOW - 99_999_999)

    p.listRestorable({
      now: NOW,
      waitingTtlMs: 1000,
      playingTtlMs: 1000,
    })

    const after = p.load('stale')
    expect(after?.meta.status).toBe('finished')
    expect(after?.updatedAt).toBe(NOW)
  })
})
