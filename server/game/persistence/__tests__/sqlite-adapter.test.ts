import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import type { RoomMeta, RoomSnapshot } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/session/serialization.ts'

const WAITING_TTL = 30 * 60 * 1000
const PLAYING_TTL = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const META: RoomMeta = {
  createdBy: 'u1',
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u1', playerIndex: 0 }],
}

const STATE = { _stub: true } as unknown as SerializedGameState

const setupDb = () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT,
      state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0,
      custom_card_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      player_index INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );
  `)
  return db
}

describe('SqliteRoomPersistence', () => {
  let db: ReturnType<typeof setupDb>
  let p: SqliteRoomPersistence

  beforeEach(() => {
    db = setupDb()
    p = new SqliteRoomPersistence(db)
  })

  it('save → load round-trips serialized + meta', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.id).toBe('r1')
    expect(snap.serialized).toEqual(STATE)
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.status).toBe('playing')
    expect(snap.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
  })

  it('load returns null for missing id', () => {
    expect(p.load('nope')).toBeNull()
  })

  it('delete removes the row + cascades room_players', () => {
    p.save('r1', STATE, META)
    expect(p.load('r1')).not.toBeNull()
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
    const rp = db.prepare('SELECT COUNT(*) AS n FROM room_players WHERE room_id = ?').get('r1') as { n: number }
    expect(rp.n).toBe(0)
  })

  it('markFinished flips status without changing serialized', () => {
    p.save('r1', STATE, META)
    p.markFinished('r1', NOW + 100)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.meta.status).toBe('finished')
    expect(snap.serialized).toEqual(STATE)
  })

  it('listRestorable excludes finished + excluded ids + stale rows (and prunes them)', () => {
    p.save('r-fresh', STATE, { ...META, status: 'playing' })
    p.save('r-stale-playing', STATE, { ...META, status: 'playing' })
    p.save('r-stale-waiting', STATE, { ...META, status: 'waiting' })
    p.save('r-finished', STATE, { ...META, status: 'finished' })
    p.save('dev2', STATE, { ...META, status: 'playing' })

    db.prepare('UPDATE rooms SET updated_at = ? WHERE id IN (?, ?)').run(
      NOW - PLAYING_TTL - 1, 'r-stale-playing', 'r-stale-waiting',
    )

    const restored = p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
      excludeIds: ['dev2'],
    })

    const ids = restored.map((s) => s.id).sort()
    expect(ids).toEqual(['r-fresh'])

    const stale = db.prepare('SELECT id, status FROM rooms WHERE id LIKE ?').all('r-stale-%') as Array<{ id: string; status: string }>
    expect(stale.every((r) => r.status === 'finished')).toBe(true)
  })

  it('save → load preserves non-empty customCardDbIds', () => {
    const meta: RoomMeta = { ...META, customCardDbIds: ['card-1', 'card-2'] }
    p.save('r1', STATE, meta)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.meta.customCardDbIds).toEqual(['card-1', 'card-2'])
  })

  it('second save bumps version (optimistic concurrency token)', () => {
    p.save('r1', STATE, META)
    const v1 = db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1') as { version: number }
    expect(v1.version).toBe(1)
    p.save('r1', STATE, META)
    const v2 = db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1') as { version: number }
    expect(v2.version).toBe(2)
  })

  it('save with null serialized creates placeholder row; load returns snap with null serialized but meta present', () => {
    p.save('r1', null, META)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.serialized).toBeNull()
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.maxPlayers).toBe(2)
  })
})
