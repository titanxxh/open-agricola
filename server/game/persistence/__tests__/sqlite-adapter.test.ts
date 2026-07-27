import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import type { GameResult, RoomMeta, RoomSnapshot } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/session/serialization.ts'

const WAITING_TTL = 30 * 60 * 1000
const PLAYING_TTL = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const META: RoomMeta = {
  createdBy: 'u1',
  startedAt: NOW - 1000,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u1', playerIndex: 0 }],
}

const STATE = { _stub: true } as unknown as SerializedGameState
const RESULT: GameResult = {
  roomId: 'r1',
  startedAt: NOW - 1000,
  finishedAt: NOW,
  roundsPlayed: 14,
  playerCount: 2,
  communityDeck: true,
  parentCards: false,
  throughTheSeasons: true,
  farmersOfTheMoor: false,
  players: [
    { playerIndex: 0, gamePlayerId: 'p1', userId: null, displayName: 'Alice', score: 42 },
    { playerIndex: 1, gamePlayerId: 'p2', userId: 'live-u2', displayName: 'Bob', score: 35 },
  ],
}

const setupDb = (options?: Database.Options) => {
  const db = new Database(':memory:', options)
  db.exec(`
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT,
      state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0,
      custom_card_ids TEXT NOT NULL DEFAULT '[]',
      custom_cards_runtime_json TEXT,
      replay_recording INTEGER,
      replay_viewer_build_id TEXT,
      replay_game_build_id TEXT,
      enable_parent_cards INTEGER NOT NULL DEFAULT 0,
      draft_parents INTEGER,
      enable_through_the_seasons INTEGER NOT NULL DEFAULT 0,
      enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0,
      allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
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
    CREATE TABLE game_results (
      room_id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      rounds_played INTEGER NOT NULL,
      player_count INTEGER NOT NULL,
      enable_community_deck INTEGER NOT NULL,
      enable_parent_cards INTEGER NOT NULL,
      enable_through_the_seasons INTEGER NOT NULL,
      enable_farmers_of_the_moor INTEGER NOT NULL
    );
    CREATE TABLE game_result_players (
      room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
      player_index INTEGER NOT NULL,
      game_player_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      PRIMARY KEY (room_id, player_index)
    );
    CREATE TABLE game_contexts (
      room_id TEXT PRIMARY KEY,
      lifecycle TEXT NOT NULL,
      phase TEXT,
      replay_status TEXT,
      expires_at INTEGER,
      removal_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE game_replays (
      room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id),
      schema_version INTEGER NOT NULL,
      viewer_build_id TEXT NOT NULL,
      game_build_id TEXT NOT NULL,
      status TEXT NOT NULL,
      latest_step_no INTEGER NOT NULL,
      missing_prefix INTEGER NOT NULL,
      custom_cards_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE game_replay_steps (
      room_id TEXT NOT NULL REFERENCES game_replays(room_id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL,
      room_version INTEGER NOT NULL,
      checkpoint_step_no INTEGER NOT NULL,
      player_index INTEGER,
      command_type TEXT NOT NULL,
      intent_json TEXT NOT NULL,
      payload_kind TEXT NOT NULL,
      payload_gzip BLOB NOT NULL,
      frame_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, step_no)
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
    expect(snap.meta.startedAt).toBe(NOW - 1000)
    expect(snap.meta.status).toBe('playing')
    expect(snap.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
  })

  it('load returns null for missing id', () => {
    expect(p.load('nope')).toBeNull()
  })

  it('discard removes the row + cascades room_players without a result', () => {
    p.save('r1', STATE, META)
    expect(p.load('r1')).not.toBeNull()
    p.discard('r1')
    expect(p.load('r1')).toBeNull()
    const rp = db.prepare('SELECT COUNT(*) AS n FROM room_players WHERE room_id = ?').get('r1') as { n: number }
    expect(rp.n).toBe(0)
    expect(db.prepare('SELECT room_id FROM game_results WHERE room_id = ?').get('r1')).toBeUndefined()
  })

  it('archives scalar completion data and deletes the full state atomically', () => {
    p.save('r1', STATE, {
      ...META,
      players: [
        { userId: 'persisted-u1', playerIndex: 0 },
        { userId: 'persisted-u2', playerIndex: 1 },
      ],
    })

    expect(p.complete(RESULT)).toEqual({ ok: true, archived: true })
    expect(p.load('r1')).toBeNull()
    expect(db.prepare('SELECT * FROM game_results WHERE room_id = ?').get('r1')).toEqual({
      room_id: 'r1',
      started_at: NOW - 1000,
      finished_at: NOW,
      rounds_played: 14,
      player_count: 2,
      enable_community_deck: 1,
      enable_parent_cards: 0,
      enable_through_the_seasons: 1,
      enable_farmers_of_the_moor: 0,
    })
    expect(db.prepare(`
      SELECT player_index, game_player_id, user_id, display_name, score
      FROM game_result_players WHERE room_id = ? ORDER BY player_index
    `).all('r1')).toEqual([
      { player_index: 0, game_player_id: 'p1', user_id: 'persisted-u1', display_name: 'Alice', score: 42 },
      { player_index: 1, game_player_id: 'p2', user_id: 'persisted-u2', display_name: 'Bob', score: 35 },
    ])
    expect(p.hasRoomId('r1')).toBe(true)
  })

  it('archives the latest persisted user for a replaced player index', () => {
    p.save('r1', STATE, { ...META, players: [{ userId: 'old-user', playerIndex: 0 }] })
    p.save('r1', STATE, { ...META, players: [{ userId: 'new-user', playerIndex: 0 }] })

    expect(p.complete(RESULT)).toEqual({ ok: true, archived: true })
    expect(db.prepare(`
      SELECT user_id FROM game_result_players WHERE room_id = ? AND player_index = 0
    `).get('r1')).toEqual({ user_id: 'new-user' })
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

    const stale = db.prepare('SELECT id FROM rooms WHERE id LIKE ?').all('r-stale-%')
    expect(stale).toEqual([])
  })

  it('listRestorable excludes rooms whose Game Context is already completed', () => {
    p.save('r1', STATE, META)
    db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed', phase = NULL
      WHERE room_id = ?
    `).run('r1')

    expect(p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    })).toEqual([])
  })

  it('save → load preserves non-empty customCardDbIds', () => {
    const meta: RoomMeta = { ...META, customCardDbIds: ['card-1', 'card-2'] }
    p.save('r1', STATE, meta)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.meta.customCardDbIds).toEqual(['card-1', 'card-2'])
  })

  it('save → load freezes custom card runtime data', () => {
    const customCards = [{
      cardType: 'minor' as const,
      cardJson: {
        id: 'CUSTOM_Pinned',
        name: 'Pinned',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      effectCode: 'source',
      compiledCode: 'compiled',
    }]
    p.save('r1', STATE, { ...META, customCards: customCards as never })

    expect(p.load('r1')?.meta.customCards).toEqual(customCards)
  })

  it('save → load preserves room expansion flags', () => {
    const meta: RoomMeta = {
      ...META,
      enableParentCards: true,
      draftParents: false,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }

    p.save('r1', STATE, meta)

    expect(p.load('r1')?.meta).toMatchObject({
      enableParentCards: true,
      draftParents: false,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
  })

  it('second save bumps version (optimistic concurrency token)', () => {
    p.save('r1', STATE, META)
    const v1 = db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1') as { version: number }
    expect(v1.version).toBe(1)
    p.save('r1', STATE, META)
    const v2 = db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1') as { version: number }
    expect(v2.version).toBe(2)
  })

  it('keeps the first startedAt value', () => {
    p.save('r1', STATE, { ...META, startedAt: NOW })
    p.save('r1', STATE, { ...META, startedAt: NOW + 100 })

    expect(p.load('r1')?.meta.startedAt).toBe(NOW)
  })

  it('save with null serialized creates placeholder row; load returns snap with null serialized but meta present', () => {
    p.save('r1', null, META)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.serialized).toBeNull()
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.maxPlayers).toBe(2)
  })

  it('caches prepared statements instead of preparing on each operation', () => {
    let prepareCalls = 0
    const instrumented = {
      prepare: (sql: string) => {
        prepareCalls += 1
        return db.prepare(sql)
      },
      transaction: db.transaction.bind(db),
    }
    const persistence = new SqliteRoomPersistence(instrumented)
    const preparedAtConstruction = prepareCalls

    persistence.save('r1', STATE, META)
    persistence.save('r1', STATE, META)
    persistence.load('r1')
    persistence.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    })

    expect(prepareCalls).toBe(preparedAtConstruction)
  })

  it('rolls back the room and players when one player write fails', () => {
    db.exec(`
      CREATE TRIGGER reject_player
      BEFORE INSERT ON room_players
      WHEN NEW.user_id = 'reject'
      BEGIN
        SELECT RAISE(ABORT, 'rejected player');
      END;
    `)

    expect(() => p.save('r1', STATE, {
      ...META,
      players: [
        { userId: 'u1', playerIndex: 0 },
        { userId: 'reject', playerIndex: 1 },
      ],
    })).toThrow('rejected player')

    expect(db.prepare('SELECT id FROM rooms WHERE id = ?').get('r1')).toBeUndefined()
    expect(db.prepare('SELECT room_id FROM room_players WHERE room_id = ?').all('r1')).toEqual([])
  })

  it('keeps the final room state when result archival fails', () => {
    p.save('r1', STATE, META)
    db.exec(`
      CREATE TRIGGER reject_result_player
      BEFORE INSERT ON game_result_players
      BEGIN
        SELECT RAISE(ABORT, 'rejected result player');
      END;
    `)

    expect(p.complete(RESULT)).toEqual({ ok: false, error: 'rejected result player' })
    expect(p.load('r1')?.serialized).toEqual(STATE)
    expect(db.prepare('SELECT * FROM game_results WHERE room_id = ?').get('r1')).toBeUndefined()
  })

  it('keeps the first archived result on repeated completion', () => {
    p.save('r1', STATE, META)
    expect(p.complete(RESULT)).toEqual({ ok: true, archived: true })
    p.save('r1', STATE, META)
    expect(p.complete({
      ...RESULT,
      finishedAt: NOW + 1,
      players: RESULT.players.map((player) => ({ ...player, score: 999 })),
    })).toEqual({ ok: true, archived: true })

    expect(db.prepare('SELECT finished_at FROM game_results WHERE room_id = ?').get('r1')).toEqual({
      finished_at: NOW,
    })
    expect(db.prepare('SELECT score FROM game_result_players WHERE room_id = ? ORDER BY player_index').all('r1')).toEqual([
      { score: 42 },
      { score: 35 },
    ])
    expect(p.load('r1')).toBeNull()
  })

  it('restores healthy rooms when another room has invalid state JSON', () => {
    p.save('healthy', STATE, META)
    p.save('invalid', STATE, META)
    db.prepare("UPDATE rooms SET state_json = '{' WHERE id = 'invalid'").run()

    expect(p.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    }).map((room) => room.id)).toEqual(['healthy'])
  })

  it.each([0, 1, 1000])('restores %i rooms with one read query', (roomCount) => {
    const queries: string[] = []
    const tracedDb = setupDb({ verbose: (sql) => queries.push(sql) })
    const persistence = new SqliteRoomPersistence(tracedDb)
    const players = [
      { userId: 'u1', playerIndex: 0 },
      { userId: 'u2', playerIndex: 1 },
    ]
    for (let index = 0; index < roomCount; index += 1) {
      persistence.save(`r${index}`, STATE, { ...META, players })
    }
    queries.length = 0

    const restored = persistence.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    })

    expect(restored).toHaveLength(roomCount)
    if (roomCount > 0) expect(restored[0]?.meta.players).toEqual(players)
    expect(queries.filter((sql) => /^\s*SELECT/i.test(sql))).toHaveLength(1)
    tracedDb.close()
  })
})
