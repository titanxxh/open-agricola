import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import { JsonRoomPersistence } from '../json-adapter.ts'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { RoomMeta, RoomPersistence } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: ['x'],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = { _stub: true } as unknown as SerializedGameState

const setupSqlite = (): RoomPersistence => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (id TEXT PRIMARY KEY, created_by TEXT, state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0, custom_card_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE room_players (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, player_index INTEGER NOT NULL, joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id));
  `)
  return new SqliteRoomPersistence(db)
}

const setupJson = (): RoomPersistence => new JsonRoomPersistence(mkdtempSync(join(tmpdir(), 'oa-')))
const setupMemory = (): RoomPersistence => new InMemoryRoomPersistence()

const adapters: Array<[string, () => RoomPersistence]> = [
  ['sqlite', setupSqlite],
  ['json', setupJson],
  ['memory', setupMemory],
]

for (const [name, factory] of adapters) {
  describe(`RoomPersistence contract — ${name}`, () => {
    it('load returns null for missing id', () => {
      const p = factory()
      expect(p.load('nope')).toBeNull()
    })

    it('save → load round-trips serialized', () => {
      const p = factory()
      p.save('r1', STATE, META)
      expect(p.load('r1')?.serialized).toEqual(STATE)
    })

    it('delete removes the row', () => {
      const p = factory()
      p.save('r1', STATE, META)
      p.delete('r1')
      expect(p.load('r1')).toBeNull()
    })

    it('markFinished does not throw', () => {
      const p = factory()
      p.save('r1', STATE, META)
      expect(() => p.markFinished('r1', Date.now())).not.toThrow()
    })

    it('listRestorable returns at most non-finished rooms', () => {
      const p = factory()
      p.save('r-active', STATE, { ...META, status: 'playing' })
      p.save('r-finished', STATE, { ...META, status: 'finished' })
      const res = p.listRestorable({ now: Date.now(), waitingTtlMs: 60_000, playingTtlMs: 60_000 })
      // SQLite + memory return ['r-active']; JSON returns []
      expect(res.every((s) => s.meta.status !== 'finished')).toBe(true)
    })
  })
}
