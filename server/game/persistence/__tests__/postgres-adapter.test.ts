import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../../database/postgres'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { PostgresRoomPersistence } from '../postgres-adapter.ts'
import type { RoomMeta, RoomSnapshot } from '../room-persistence.ts'
import type { PersistedSessionSnapshot } from '../../../../shared/session/serialization.ts'

const WAITING_TTL = 30 * 60 * 1000
const PLAYING_TTL = 7 * 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const META: RoomMeta = {
  createdBy: 'u1',
  startedAt: NOW - 1000,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u1', playerIndex: 0 }],
}

const STATE = {
  state: { players: [] },
  frame: { _stub: true },
  sessionCursor: {},
} as unknown as PersistedSessionSnapshot

const databases: PostgresDatabase[] = []
afterEach(async () => { for (const db of databases.splice(0)) await db.close() })
const setupDb = async () => {
  const db = await createTestDatabase()
  databases.push(db)
  for (const id of ['u1', 'u2', 'u3', 'live-u2', 'persisted-u1', 'persisted-u2', 'old-user', 'new-user', 'reject']) {
    await db.prepare('INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)').run(id, id, '', id, 1)
  }
  return db
}

describe('PostgresRoomPersistence', () => {
  let db: PostgresDatabase
  let p: PostgresRoomPersistence

  beforeEach(async () => {
    db = await setupDb()
    p = new PostgresRoomPersistence(db)
  })

  it('save → load round-trips serialized + meta', async () => {
    ;(await p.save('r1', STATE, META))
    const snap = (await p.load('r1')) as RoomSnapshot
    expect(snap.id).toBe('r1')
    expect(snap.serialized).toEqual(STATE)
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.startedAt).toBe(NOW - 1000)
    expect(snap.meta.status).toBe('playing')
    expect(snap.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
  })

  it('load returns null for missing id', async () => {
    expect((await p.load('nope'))).toBeNull()
  })

  describe('membership writes', () => {
    const players = [{ userId: 'u1', playerIndex: 0 }, { userId: 'u2', playerIndex: 1 }]
    const memberRows = async () => (await db.prepare(`
      SELECT user_id, player_index, joined_at FROM room_players
      WHERE room_id = 'r1' ORDER BY player_index
    `).all())
    const seatUpdates = async () => (await db.prepare('SELECT user_id, old_index, new_index FROM seat_updates').all())

    beforeEach(async () => {
      ;(await db.exec(`
        CREATE TABLE seat_updates (user_id TEXT, old_index INTEGER, new_index INTEGER);
        CREATE FUNCTION record_seat_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          INSERT INTO seat_updates VALUES (NEW.user_id, OLD.player_index, NEW.player_index); RETURN NEW;
        END $$;
        CREATE TRIGGER record_seat_update AFTER UPDATE OF player_index ON room_players FOR EACH ROW EXECUTE FUNCTION record_seat_update_fn();
      `))
      ;(await p.save('r1', STATE, { ...META, players }))
      ;(await db.prepare("UPDATE room_players SET joined_at = ? WHERE room_id = 'r1'").run(NOW))
    })

    it('does not UPDATE unchanged indices or refresh joined_at when saving the room', async () => {
      const members = (await memberRows())
      ;(await db.prepare("UPDATE rooms SET updated_at = 0 WHERE id = 'r1'").run())

      ;(await p.save('r1', STATE, { ...META, players }))

      expect((await seatUpdates())).toEqual([])
      expect((await memberRows())).toEqual(members)
      expect((await p.load('r1'))?.meta.players).toEqual(players)
      expect((await db.prepare("SELECT version FROM rooms WHERE id = 'r1'").get())).toEqual({ version: 0 })
      expect((await p.load('r1'))!.updatedAt).toBeGreaterThan(0)
    })

    it('updates a moved member exactly once and preserves its joined_at', async () => {
      const moved = [{ userId: 'u2', playerIndex: 1 }, { userId: 'u1', playerIndex: 2 }]

      ;(await p.save('r1', STATE, { ...META, maxPlayers: 3, players: moved }))

      expect((await seatUpdates())).toEqual([{ user_id: 'u1', old_index: 0, new_index: 2 }])
      expect((await memberRows())).toEqual([
        { user_id: 'u2', player_index: 1, joined_at: NOW },
        { user_id: 'u1', player_index: 2, joined_at: NOW },
      ])
      expect((await p.load('r1'))?.meta.players).toEqual(moved)
    })

    it('keeps the existing swap and replacement membership behavior', async () => {
      ;(await p.save('r1', STATE, { ...META, players: [
        { userId: 'u1', playerIndex: 1 },
        { userId: 'u2', playerIndex: 0 },
      ] }))

      expect((await p.load('r1'))?.meta.players).toEqual([
        { userId: 'u2', playerIndex: 0 },
        { userId: 'u1', playerIndex: 1 },
      ])
      expect((await seatUpdates())).toEqual([{ user_id: 'u1', old_index: 0, new_index: 1 }])
      // clearReplacedSeat deletes/reinserts the displaced member during swaps;
      // the surviving moved member retains its original join timestamp.
      expect((await memberRows())).toEqual([
        { user_id: 'u2', player_index: 0, joined_at: expect.any(Number) },
        { user_id: 'u1', player_index: 1, joined_at: NOW },
      ])

      ;(await p.save('r1', STATE, { ...META, players: [
        { userId: 'u3', playerIndex: 0 },
        { userId: 'u1', playerIndex: 1 },
      ] }))

      expect((await p.load('r1'))?.meta.players).toEqual([
        { userId: 'u3', playerIndex: 0 },
        { userId: 'u1', playerIndex: 1 },
      ])
      expect((await seatUpdates())).toEqual([{ user_id: 'u1', old_index: 0, new_index: 1 }])
    })

    it('rolls back actual moves, displaced members and update counters on a later failure', async () => {
      const before = (await p.load('r1'))
      const members = (await memberRows())
      ;(await db.exec(`
        CREATE FUNCTION reject_member_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = 'reject' THEN RAISE EXCEPTION 'rejected member'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_member BEFORE INSERT ON room_players FOR EACH ROW EXECUTE FUNCTION reject_member_fn();
      `))

      ;(await expect(p.save('r1', STATE, { ...META, maxPlayers: 3, players: [
        { userId: 'u1', playerIndex: 2 },
        { userId: 'reject', playerIndex: 1 },
      ] })).rejects.toThrow('rejected member'))

      expect((await seatUpdates())).toEqual([])
      expect((await memberRows())).toEqual(members)
      expect((await p.load('r1'))).toEqual(before)
      expect((await db.prepare("SELECT version FROM rooms WHERE id = 'r1'").get())).toEqual({ version: 0 })
    })
  })

  it('discard removes the row + cascades room_players without a result', async () => {
    ;(await p.save('r1', STATE, META))
    expect((await p.load('r1'))).not.toBeNull()
    ;(await p.discard('r1'))
    expect((await p.load('r1'))).toBeNull()
    const rp = (await db.prepare('SELECT COUNT(*) AS n FROM room_players WHERE room_id = ?').get('r1')) as { n: number }
    expect(rp.n).toBe(0)
    expect((await db.prepare('SELECT room_id FROM game_results WHERE room_id = ?').get('r1'))).toBeUndefined()
  })

  it('listRestorable excludes finished + excluded ids + stale rows (and prunes them)', async () => {
    ;(await p.save('r-fresh', STATE, { ...META, status: 'playing' }))
    ;(await p.save('r-stale-playing', STATE, { ...META, status: 'playing' }))
    ;(await p.save('r-stale-waiting', STATE, { ...META, status: 'waiting' }))
    ;(await p.save('r-finished', STATE, { ...META, status: 'finished' }))
    ;(await p.save('dev2', STATE, { ...META, status: 'playing' }))

    ;(await db.prepare('UPDATE rooms SET updated_at = ? WHERE id IN (?, ?)').run(
      NOW - PLAYING_TTL - 1, 'r-stale-playing', 'r-stale-waiting',
    ))
    ;(await db.prepare(`
      UPDATE game_contexts
      SET expires_at = ?
      WHERE room_id IN (?, ?)
    `).run(NOW - 1, 'r-stale-playing', 'r-stale-waiting'))

    const restored = (await p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
      excludeIds: ['dev2'],
    }))

    const ids = restored.map((s) => s.id).sort()
    expect(ids).toEqual(['r-fresh'])

    const stale = (await db.prepare('SELECT id FROM rooms WHERE id LIKE ?').all('r-stale-%'))
    expect(stale).toEqual([])
  })

  it('listRestorable excludes rooms whose Game Context is already completed', async () => {
    ;(await p.save('r1', STATE, META))
    ;(await db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed', phase = NULL
      WHERE room_id = ?
    `).run('r1'))

    expect((await p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    }))).toEqual([])
  })

  it('save → load preserves non-empty customCardDbIds', async () => {
    const meta: RoomMeta = { ...META, customCardDbIds: ['card-1', 'card-2'] }
    ;(await p.save('r1', STATE, meta))
    const snap = (await p.load('r1')) as RoomSnapshot
    expect(snap.meta.customCardDbIds).toEqual(['card-1', 'card-2'])
  })

  it('save → load freezes custom card runtime data', async () => {
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
    ;(await p.save('r1', STATE, { ...META, customCards: customCards as never }))

    expect((await p.load('r1'))?.meta.customCards).toEqual(customCards)
  })

  it('save → load preserves room expansion flags', async () => {
    const meta: RoomMeta = {
      ...META,
      enableParentCards: true,
      draftParents: false,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      enableSnakeOpening: true,
    }

    ;(await p.save('r1', STATE, meta))

    expect((await p.load('r1'))?.meta).toMatchObject({
      enableParentCards: true,
      draftParents: false,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      enableSnakeOpening: true,
    })
  })

  it('round-trips enableSnakeOpening through save → load and restore', async () => {
    ;(await p.save('r1', STATE, { ...META, enableSnakeOpening: true }))
    ;(await p.save('r2', STATE, META))

    expect((await p.load('r1'))?.meta.enableSnakeOpening).toBe(true)
    expect((await p.load('r2'))?.meta.enableSnakeOpening).toBe(false)
    expect((await p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    })).map((snap) => [snap.id, snap.meta.enableSnakeOpening]).sort()).toEqual([
      ['r1', true],
      ['r2', false],
    ])

  })

  it('metadata saves preserve the authoritative committed version', async () => {
    ;(await p.save('r1', STATE, META))
    const v1 = (await db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1')) as { version: number }
    expect(v1.version).toBe(0)
    ;(await p.save('r1', STATE, META))
    const v2 = (await db.prepare('SELECT version FROM rooms WHERE id = ?').get('r1')) as { version: number }
    expect(v2.version).toBe(0)
  })

  it('keeps the first startedAt value', async () => {
    ;(await p.save('r1', STATE, { ...META, startedAt: NOW }))
    ;(await p.save('r1', STATE, { ...META, startedAt: NOW + 100 }))

    expect((await p.load('r1'))?.meta.startedAt).toBe(NOW)
  })

  it('save with null serialized creates placeholder row; load returns snap with null serialized but meta present', async () => {
    ;(await p.save('r1', null, META))
    const snap = (await p.load('r1')) as RoomSnapshot
    expect(snap.serialized).toBeNull()
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.maxPlayers).toBe(2)
  })

  it('caches prepared statements instead of preparing on each operation', async () => {
    let prepareCalls = 0
    const instrumented = {
      prepare: (sql: string) => {
        prepareCalls += 1
        return db.prepare(sql)
      },
      transaction: db.transaction.bind(db),
    }
    const persistence = new PostgresRoomPersistence(instrumented)
    const preparedAtConstruction = prepareCalls

    ;(await persistence.save('r1', STATE, META))
    ;(await persistence.save('r1', STATE, META))
    ;(await persistence.load('r1'))
    ;(await persistence.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    }))

    expect(prepareCalls).toBe(preparedAtConstruction)
  })

  it('rolls back the room and players when one player write fails', async () => {
    ;(await db.exec(`
      CREATE FUNCTION reject_player_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = 'reject' THEN RAISE EXCEPTION 'rejected player'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_player BEFORE INSERT ON room_players FOR EACH ROW EXECUTE FUNCTION reject_player_fn();
    `))

    ;(await expect(p.save('r1', STATE, {
      ...META,
      players: [
        { userId: 'u1', playerIndex: 0 },
        { userId: 'reject', playerIndex: 1 },
      ],
    })).rejects.toThrow('rejected player'))

    expect((await db.prepare('SELECT id FROM rooms WHERE id = ?').get('r1'))).toBeUndefined()
    expect((await db.prepare('SELECT room_id FROM room_players WHERE room_id = ?').all('r1'))).toEqual([])
  })

  it('restores healthy rooms when another room has invalid state JSON', async () => {
    ;(await p.save('healthy', STATE, META))
    ;(await p.save('invalid', STATE, META))
    ;(await db.prepare("UPDATE rooms SET state_json = '{' WHERE id = 'invalid'").run())

    expect((await p.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    })).map((room) => room.id)).toEqual(['healthy'])
  })

  it.each([0, 1, 100])('restores %i rooms with a bounded set of read queries', async (roomCount) => {
    const queries: string[] = []
    const tracedDb = await setupDb()
    const originalQuery = tracedDb.query.bind(tracedDb)
    vi.spyOn(tracedDb, 'query').mockImplementation(async (sql, values) => { queries.push(sql); return (await originalQuery(sql, values)) })
    const persistence = new PostgresRoomPersistence(tracedDb)
    const players = [
      { userId: 'u1', playerIndex: 0 },
      { userId: 'u2', playerIndex: 1 },
    ]
    for (let index = 0; index < roomCount; index += 1) {
      ;(await persistence.save(`r${index}`, STATE, { ...META, players }))
    }
    queries.length = 0

    const restored = (await persistence.listRestorable({
      now: Date.now(),
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
    }))

    expect(restored).toHaveLength(roomCount)
    if (roomCount > 0) expect(restored[0]?.meta.players).toEqual(players)
    expect(queries.filter((sql) => /^\s*SELECT/i.test(sql))).toHaveLength(roomCount ? 3 : 1)

  })
})
