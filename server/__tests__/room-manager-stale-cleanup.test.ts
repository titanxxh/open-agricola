/**
 * Stale-room cleanup regression tests for the room manager.
 *
 * Reproduces the lobby zombie-room incident: when the server restarts after
 * a crash or TTL window, rooms with `status='playing'` whose `updated_at`
 * lies outside the TTL window must NOT be re-loaded into memory; they should
 * be batch-marked as `'finished'` so the lobby only ever lists fresh rooms.
 *
 * The two unit tests below exercise the prune helper directly against a
 * throwaway in-memory SQLite DB so we don't have to spin up the WS layer.
 */
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { pruneStaleRoomRows, summarizeRoomsForLobby } from '../game/room-manager.ts'

const WAITING_TTL_MS = 30 * 60 * 1000
const PLAYING_TTL_MS = 24 * 60 * 60 * 1000

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
  `)
  return db
}

const insertRoom = (
  db: Database.Database,
  id: string,
  status: string,
  updatedAt: number,
) => {
  db.prepare(
    `INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at)
     VALUES (?, NULL, NULL, 2, ?, 0, '[]', ?, ?)`,
  ).run(id, status, updatedAt, updatedAt)
}

describe('pruneStaleRoomRows', () => {
  it('uses a shorter TTL for waiting rooms and a one-day TTL for started games', () => {
    const db = setupDb()
    const now = 1_700_000_000_000
    const staleWaiting = now - WAITING_TTL_MS - 1
    const staleButPlayable = now - WAITING_TTL_MS - 1
    const stalePlaying = now - PLAYING_TTL_MS - 1
    const freshWaiting = now - WAITING_TTL_MS + 1000
    insertRoom(db, 'stale-waiting', 'waiting', staleWaiting)
    insertRoom(db, 'fresh-waiting', 'waiting', freshWaiting)
    insertRoom(db, 'playing-under-day', 'playing', staleButPlayable)
    insertRoom(db, 'playing-over-day', 'playing', stalePlaying)
    insertRoom(db, 'already-done', 'finished', stalePlaying)

    const changes = pruneStaleRoomRows(db, now, WAITING_TTL_MS, [], PLAYING_TTL_MS)

    expect(changes).toBe(2)
    const rows = db.prepare('SELECT id, status FROM rooms ORDER BY id').all()
    expect(rows).toEqual([
      { id: 'already-done', status: 'finished' },
      { id: 'fresh-waiting', status: 'waiting' },
      { id: 'playing-over-day', status: 'finished' },
      { id: 'playing-under-day', status: 'playing' },
      { id: 'stale-waiting', status: 'finished' },
    ])
  })

  it('skips fixed dev rooms even when their updated_at is stale', () => {
    const db = setupDb()
    const now = 1_700_000_000_000
    const stale = now - PLAYING_TTL_MS - 1
    insertRoom(db, 'dev2', 'playing', stale)
    insertRoom(db, 'dev3', 'playing', stale)
    insertRoom(db, 'abc123', 'playing', stale)

    const changes = pruneStaleRoomRows(db, now, WAITING_TTL_MS, ['dev2', 'dev3', 'dev4'], PLAYING_TTL_MS)

    expect(changes).toBe(1)
    const stillPlaying = db
      .prepare("SELECT id FROM rooms WHERE status = 'playing' ORDER BY id")
      .all()
    expect(stillPlaying).toEqual([{ id: 'dev2' }, { id: 'dev3' }])
  })
})

describe('summarizeRoomsForLobby', () => {
  const room = (
    id: string,
    playerCount: number,
    maxPlayers = 2,
    createdBy = 'u1',
  ) => ({
    id,
    players: Array.from({ length: playerCount }, () => ({} as never)),
    maxPlayers,
    createdBy,
  })

  it('hides rooms with zero players to keep the lobby free of zombies', () => {
    const summaries = summarizeRoomsForLobby(
      [room('alive', 1), room('zombie', 0), room('joinable', 1, 4)],
      undefined,
      () => false,
    )
    expect(summaries.map((s) => s.id)).toEqual(['alive', 'joinable'])
  })

  it('keeps fixed dev rooms even when empty', () => {
    const summaries = summarizeRoomsForLobby(
      [room('dev2', 0), room('alive', 1)],
      undefined,
      (id) => id === 'dev2',
    )
    expect(summaries.map((s) => s.id)).toEqual(['dev2', 'alive'])
  })

  it('caps the result count when given a positive limit', () => {
    const summaries = summarizeRoomsForLobby(
      [room('a', 1), room('b', 1), room('c', 1)],
      2,
      () => false,
    )
    expect(summaries.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('reports status="playing" only when all seats are filled', () => {
    const summaries = summarizeRoomsForLobby(
      [room('half', 1, 4), room('full', 2, 2)],
      undefined,
      () => false,
    )
    expect(summaries).toEqual([
      { id: 'half', playerCount: 1, maxPlayers: 4, createdBy: 'u1', status: 'waiting' },
      { id: 'full', playerCount: 2, maxPlayers: 2, createdBy: 'u1', status: 'playing' },
    ])
  })
})
