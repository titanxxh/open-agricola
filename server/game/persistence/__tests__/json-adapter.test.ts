import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { JsonRoomPersistence } from '../json-adapter.ts'
import type { RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: null,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
}
const STATE = { _stub: true } as unknown as SerializedGameState

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

  it('delete removes the file', () => {
    p.save('r1', STATE, META)
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
  })

  it('delete is idempotent on missing files', () => {
    expect(() => p.delete('never-existed')).not.toThrow()
  })

  it('markFinished is a no-op (returns without throw)', () => {
    p.save('r1', STATE, META)
    expect(() => p.markFinished('r1', Date.now())).not.toThrow()
    expect(p.load('r1')?.serialized).toEqual(STATE)
  })

  it('listRestorable always returns []', () => {
    p.save('r1', STATE, META)
    expect(p.listRestorable({ now: 0, waitingTtlMs: 1, playingTtlMs: 1 })).toEqual([])
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
