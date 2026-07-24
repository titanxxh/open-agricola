import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { JsonRoomPersistence } from '../json-adapter.ts'
import type { GameResult, RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: null,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
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

describe('JsonRoomPersistence', () => {
  let dir: string
  let p: JsonRoomPersistence

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oa-json-'))
    p = new JsonRoomPersistence(dir)
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('save → load returns serialized; meta is best-effort', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1')
    expect(snap?.serialized).toEqual(STATE)
    expect(snap?.meta.status).toBe('playing')
  })

  it('load returns null when file is absent', () => {
    expect(p.load('nope')).toBeNull()
  })

  it('discard removes the file', () => {
    p.save('r1', STATE, META)
    p.discard('r1')
    expect(p.load('r1')).toBeNull()
  })

  it('discard is idempotent on missing files', () => {
    expect(() => p.discard('never-existed')).not.toThrow()
  })

  it('complete deletes the state file without archiving stats', () => {
    p.save('r1', STATE, META)
    expect(p.complete(RESULT)).toEqual({ ok: true, archived: false })
    expect(p.load('r1')).toBeNull()
  })

  it('lists rotated dev rooms for startup restore', () => {
    const id = 'dev2-12345678-1234-1234-1234-123456789abc'
    p.save(id, STATE, META)
    const snapshots = p.listRestorable({
      now: Date.now(),
      waitingTtlMs: 60_000,
      playingTtlMs: 60_000,
    })
    expect(snapshots).toEqual([
      expect.objectContaining({ id, serialized: STATE }),
    ])
    expect(snapshots[0]?.meta.startedAt).toBe(snapshots[0]?.updatedAt)
  })

  it('sanitises room ids that contain unsafe chars', () => {
    p.save('a/b\\c', STATE, META)
    expect(p.load('a/b\\c')?.serialized).toEqual(STATE)
  })

  it('save with null serialized is a no-op; load returns null (no file written)', () => {
    p.save('r1', null, META)
    expect(p.load('r1')).toBeNull()
  })
})
