import { ROOM_HISTORY_SCHEMA, ROOM_RECOVERY_SCHEMA } from '../room-history-store'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import { JsonRoomPersistence } from '../json-adapter.ts'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { GameResult, RoomMeta, RoomPersistence } from '../room-persistence.ts'
import type { PersistedSessionSnapshot } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: ['x'],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = {
  state: { _stub: true, players: [] },
  frame: { _stub: true },
  sessionCursor: {},
} as unknown as PersistedSessionSnapshot
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
  snakeOpening: false,
  players: [{ playerIndex: 0, gamePlayerId: 'p1', userId: 'u', displayName: 'P1', score: 10 }],
}

const setupSqlite = (): RoomPersistence => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (id TEXT PRIMARY KEY, created_by TEXT, state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0, custom_card_ids TEXT NOT NULL DEFAULT '[]',
      custom_cards_runtime_json TEXT,
      replay_recording INTEGER, replay_viewer_build_id TEXT, replay_game_build_id TEXT,
      enable_parent_cards INTEGER NOT NULL DEFAULT 0,
      draft_parents INTEGER,
      enable_through_the_seasons INTEGER NOT NULL DEFAULT 0,
      enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0,
      allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0,
      enable_snake_opening INTEGER NOT NULL DEFAULT 0,
      hotseat INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE room_players (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, player_index INTEGER NOT NULL, joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id));
    CREATE TABLE game_results (
      room_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER NOT NULL,
      rounds_played INTEGER NOT NULL, player_count INTEGER NOT NULL,
      enable_community_deck INTEGER NOT NULL, enable_parent_cards INTEGER NOT NULL,
      enable_through_the_seasons INTEGER NOT NULL, enable_farmers_of_the_moor INTEGER NOT NULL,
      enable_snake_opening INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE game_result_players (
      room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
      player_index INTEGER NOT NULL, game_player_id TEXT NOT NULL, user_id TEXT,
      name_is_default INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL, score INTEGER NOT NULL,
      PRIMARY KEY (room_id, player_index));
    CREATE TABLE game_contexts (
      room_id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL, phase TEXT, replay_status TEXT,
      expires_at INTEGER, removal_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE game_replays (
      room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id), schema_version INTEGER NOT NULL,
      viewer_build_id TEXT NOT NULL, game_build_id TEXT NOT NULL, status TEXT NOT NULL,
      latest_step_no INTEGER NOT NULL, missing_prefix INTEGER NOT NULL,
      custom_cards_json TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER);
    CREATE TABLE game_replay_steps (
      room_id TEXT NOT NULL REFERENCES game_replays(room_id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL, room_version INTEGER NOT NULL, checkpoint_step_no INTEGER NOT NULL,
      player_index INTEGER, command_type TEXT NOT NULL, intent_json TEXT NOT NULL,
      payload_kind TEXT NOT NULL, payload_gzip BLOB NOT NULL, frame_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY (room_id, step_no));
  `)
  db.exec(ROOM_HISTORY_SCHEMA)
  db.exec(ROOM_RECOVERY_SCHEMA)
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

    it('discard removes the row', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      p.discard('r1')
      expect(p.load('r1')).toBeNull()
    })

    it('complete removes the full-state row', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      expect(p.complete(RESULT).ok).toBe(true)
      expect(p.load('r1')).toBeNull()
    })

    it('detects active room ids', () => {
      const p = factory(register)
      p.save('r1', STATE, META)
      expect(p.hasRoomId('r1')).toBe(true)
      expect(p.hasRoomId('missing')).toBe(false)
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
