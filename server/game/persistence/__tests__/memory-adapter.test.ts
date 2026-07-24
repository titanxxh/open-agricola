import { describe, expect, it, beforeEach } from 'vitest'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { GameResult, RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = { _stub: true } as unknown as SerializedGameState
const RESULT: GameResult = {
  roomId: 'r1',
  startedAt: 1,
  finishedAt: 2,
  roundsPlayed: 14,
  playerCount: 1,
  communityDeck: false,
  parentCards: false,
  throughTheSeasons: false,
  farmersOfTheMoor: false,
  players: [{ playerIndex: 0, gamePlayerId: 'p1', userId: null, displayName: 'P1', score: 10 }],
}

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
    p.save('r1', STATE, { ...META, startedAt: 1 })
    p.save('r1', STATE, { ...META, status: 'waiting', startedAt: 2 })
    expect(p.load('r1')?.meta.status).toBe('waiting')
    expect(p.load('r1')?.meta.startedAt).toBe(1)
  })

  it('discard removes the row without archiving', () => {
    p.save('r1', STATE, META)
    p.discard('r1')
    expect(p.load('r1')).toBeNull()
    expect(p.__getResultForTest('r1')).toBeUndefined()
  })

  it('complete archives persisted identity and removes full state', () => {
    p.save('r1', STATE, META)
    expect(p.complete(RESULT)).toEqual({ ok: true, archived: true })
    expect(p.load('r1')).toBeNull()
    expect(p.__getResultForTest('r1')?.players[0]).toMatchObject({ userId: 'u', score: 10 })
    expect(p.hasRoomId('r1')).toBe(true)
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

  it('listRestorable discards stale rows without archiving', () => {
    const NOW = 10_000_000
    p.save('stale', STATE, { ...META, status: 'playing' })
    p.__setUpdatedAtForTest('stale', NOW - 99_999_999)

    p.listRestorable({
      now: NOW,
      waitingTtlMs: 1000,
      playingTtlMs: 1000,
    })

    expect(p.load('stale')).toBeNull()
    expect(p.__getResultForTest('stale')).toBeUndefined()
  })

  it('save with null serialized creates placeholder row; load returns snap with null serialized but meta present', () => {
    p.save('r1', null, META)
    const snap = p.load('r1')
    expect(snap).not.toBeNull()
    expect(snap?.serialized).toBeNull()
    expect(snap?.meta.createdBy).toBe('u')
  })
})
