import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

const setupMemory = (): RoomPersistence => new InMemoryRoomPersistence()

type AdapterFactory = (register: (dir: string) => void) => RoomPersistence

const adapters: Array<[string, AdapterFactory]> = [
  ['sqlite', () => setupSqlite()],
  ['json', (register) => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-contract-'))
    register(dir)
    return new JsonRoomPersistence(dir)
  }],
  ['memory', () => setupMemory()],
]

for (const [name, factory] of adapters) {
  describe(`RoomPersistence contract — ${name}`, () => {
    const tempDirs: string[] = []
    const register = (dir: string) => { tempDirs.push(dir) }

    afterEach(() => {
      for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true })
      }
      tempDirs.length = 0
    })

    it('load returns null for missing id', () => {
      const p = factory(register)
      expect(p.load('nope')).toBeNull()
    })

    it('save → load round-trips serialized', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      expect(p.load('r1')?.serialized).toEqual(STATE)
    })

    it('delete removes the row', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      p.delete('r1')
      expect(p.load('r1')).toBeNull()
    })

    it('markFinished does not throw', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      expect(() => p.markFinished('r1', Date.now())).not.toThrow()
    })

    it('listRestorable returns at most non-finished rooms', () => {
      const p = factory(register)
      p.save('r-active', STATE, { ...META, status: 'playing' })
      p.save('r-finished', STATE, { ...META, status: 'finished' })
      const res = p.listRestorable({ now: Date.now(), waitingTtlMs: 60_000, playingTtlMs: 60_000 })
      expect(res.every((s) => s.meta.status !== 'finished')).toBe(true)
    })

    it('save with null serialized on existing row preserves state', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      p.save('r1', null, { ...META, status: 'playing' })
      const snap = p.load('r1')
      expect(snap?.serialized).toEqual(STATE)
    })
  })
}
