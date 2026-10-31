import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import { createWorkSession } from '../../../__tests__/_helpers/session-fixtures'
import type { PostgresDatabase } from '../../../database/postgres'
import { migratePostgres } from '../../../database/migrations'
import { cleanExpiredSessions } from '../../../db'
import { serializeSessionSnapshot } from '../../../../shared/session/serialization'
import { frameHash } from '../../replay-codec'
import { OpeningFacts } from '../opening-facts'
import { PostgresRoomPersistence, type ReplayCommit } from '../postgres-adapter'
import type { RoomMeta } from '../room-persistence'

let db: PostgresDatabase
let now: number
let persistence: PostgresRoomPersistence
let facts: OpeningFacts
const meta = (overrides: Partial<RoomMeta> = {}): RoomMeta => ({
  createdBy: null, startedAt: now, maxPlayers: 2, customCardDbIds: [], status: 'playing',
  players: [{ userId: 'u1', playerIndex: 0 }], ...overrides,
})
const context = async (id: string) => {
  await db.prepare(`INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at)
    VALUES (?,'active','playing',?,?)`).run(id, now - 1000, now)
}
beforeEach(async () => {
  db = await createTestDatabase()
  now = Date.now() + 10_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  persistence = new PostgresRoomPersistence(db)
  facts = new OpeningFacts(db)
  for (const id of ['u1', 'u2']) {
    await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, id, id, '', now - 100_000)
  }
})
afterEach(async () => { vi.restoreAllMocks(); await db.close() })

it('records only real starts, freezes distinct starting accounts and preserves the first gameplay milestone through a phase rollback', async () => {
  await context('opening')
  await facts.capture({ roomId: 'opening', meta: meta({ status: 'waiting' }), state: undefined, committedAt: now })
  expect(await db.prepare('SELECT count(*) AS count FROM game_opening_facts').get()).toEqual({ count: 0 })
  const startingAt = now
  const hotseat = meta({ hotseat: true, enableParentCards: true, players: [
    { userId: 'u1', playerIndex: 0 }, { userId: 'u1', playerIndex: 1 },
  ] })
  const draft = { phase: 'draft', gameOver: false, enableCommunityDeck: true } as const
  const playing = { phase: 'playing', gameOver: false, enableCommunityDeck: true } as const
  await db.transaction(async () => {
    await facts.capture({ roomId: 'opening', meta: hotseat, state: draft, committedAt: now })
  })()
  now += 3000
  const firstPlayingAt = now
  await db.transaction(async () => {
    await facts.capture({ roomId: 'opening', meta: hotseat, state: playing, committedAt: now })
  })()
  now += 3000
  await db.transaction(async () => {
    await facts.capture({ roomId: 'opening', meta: meta({ startedAt: now, players: [{ userId: 'u2', playerIndex: 0 }] }), state: draft, committedAt: now })
    await facts.capture({ roomId: 'opening', meta: hotseat, state: playing, committedAt: now })
  })()
  expect(await db.prepare('SELECT started_at,playing_at,mode,seat_count,parent_cards,community_deck,origin FROM game_opening_facts').get())
    .toEqual({ started_at: startingAt, playing_at: firstPlayingAt, mode: 'hotseat', seat_count: 2, parent_cards: true, community_deck: true, origin: 'live' })
  expect(await db.prepare('SELECT user_id FROM game_opening_accounts').all()).toEqual([{ user_id: 'u1' }])
})

it('captures through the public save transaction and rolls back the whole start when its account snapshot cannot be stored', async () => {
  const session = createWorkSession({ seed: 31208, configure: state => {
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
  } })
  try {
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    await persistence.save('waiting', snapshot, meta({ status: 'waiting', startedAt: null }))
    expect(await db.prepare('SELECT count(*) AS count FROM game_opening_facts').get()).toEqual({ count: 0 })
    await db.exec(`CREATE FUNCTION reject_opening_account() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'opening account unavailable'; END; $$;
      CREATE TRIGGER reject_opening_account BEFORE INSERT ON game_opening_accounts
      FOR EACH ROW EXECUTE FUNCTION reject_opening_account();`)
    await expect(persistence.save('rollback', snapshot, meta())).rejects.toThrow('opening account unavailable')
    expect(await db.prepare("SELECT count(*) AS count FROM game_contexts WHERE room_id='rollback'").get()).toEqual({ count: 0 })
    expect(await db.prepare("SELECT count(*) AS count FROM rooms WHERE id='rollback'").get()).toEqual({ count: 0 })
    expect(await db.prepare('SELECT count(*) AS count FROM game_opening_facts').get()).toEqual({ count: 0 })
    await db.exec('DROP TRIGGER reject_opening_account ON game_opening_accounts')
    await persistence.save('waiting', snapshot, meta())
    expect(await db.prepare("SELECT playing_at,origin FROM game_opening_facts WHERE room_id='waiting'").get()).toEqual({ playing_at: now, origin: 'live' })
  } finally { session.dispose() }
})

it('captures initial replay commits idempotently and keeps opening facts and account links after expiry cleanup', async () => {
  const session = createWorkSession({ seed: 31209, configure: state => {
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
  } })
  try {
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const commit: ReplayCommit = {
      roomId: 'replay-opening', meta: meta(), serialized: snapshot,
      header: { schemaVersion: 1, viewerBuildId: 'test-viewer', gameBuildId: 'test-game', missingPrefix: false, customCardsJson: '[]' },
      step: { stepNo: 0, roomVersion: 0, checkpointStepNo: 0, playerIndex: null,
        commandType: 'initial', intentJson: '{}', payloadKind: 'checkpoint', payloadGzip: Buffer.from('initial'),
        frameHash: frameHash(snapshot.frame), createdAt: now },
    }
    expect(await persistence.commitReplay(commit)).toEqual({ kind: 'committed' })
    now += 5000
    expect(await persistence.commitReplay(commit)).toEqual({ kind: 'idempotent' })
    expect(await db.prepare('SELECT started_at,playing_at FROM game_opening_facts').get()).toEqual({ started_at: commit.meta.startedAt, playing_at: commit.step.createdAt })
    await persistence.discard('replay-opening')
    await cleanExpiredSessions(db)
    expect(await db.prepare('SELECT count(*) AS count FROM game_replays').get()).toEqual({ count: 0 })
    expect(await db.prepare('SELECT lifecycle FROM game_contexts').get()).toEqual({ lifecycle: 'expired' })
    expect(await db.prepare('SELECT user_id FROM game_opening_accounts').all()).toEqual([{ user_id: 'u1' }])
    await db.prepare('DELETE FROM users WHERE id=?').run('u1')
    expect(await db.prepare('SELECT count(*) AS count FROM game_opening_accounts').get()).toEqual({ count: 0 })
    expect(await db.prepare('SELECT count(*) AS count FROM game_opening_facts').get()).toEqual({ count: 1 })
  } finally { session.dispose() }
})

it('exposes only safe stage fields and counts online presence only for a matching epoch, a ready instance and live leases', async () => {
  await db.prepare(`INSERT INTO app_instances(instance_id,internal_url,generation,status,room_capacity,lease_until,updated_at)
    VALUES ('slot','http://private','build','ready',30,?,?)`).run(now + 120_000, now)
  for (const [id, development] of [['ordinary', false], ['development', true]] as const) {
    await db.prepare(`INSERT INTO room_ownership(room_id,instance_id,epoch,lease_until,status,development)
      VALUES (?,'slot',2,?,'active',?)`).run(id, now + 120_000, development)
    await persistence.save(id, null, meta({ status: 'waiting', startedAt: null, colorConfirmationPlayerIndex: 0 }))
    await db.prepare('INSERT INTO room_presence(room_id,epoch,connected_count,occupied_count) VALUES (?,1,1,2)').run(id)
  }
  expect(await db.prepare('SELECT mode,seat_count,stage,presence FROM operations_current_openings').all())
    .toEqual([{ mode: 'multiplayer', seat_count: 2, stage: 'color_confirmation', presence: 'retained' }])
  await db.exec("UPDATE room_presence SET epoch=2 WHERE room_id='ordinary'")
  expect(await db.prepare('SELECT presence FROM operations_current_openings').get()).toEqual({ presence: 'online' })
  await db.exec("UPDATE app_instances SET status='draining'")
  expect(await db.prepare('SELECT presence FROM operations_current_openings').get()).toEqual({ presence: 'retained' })
  await db.exec("UPDATE app_instances SET status='ready'; UPDATE room_ownership SET lease_until=0")
  expect(await db.prepare('SELECT presence FROM operations_current_openings').get()).toEqual({ presence: 'retained' })
  expect((await db.prepare(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='operations_current_openings' ORDER BY ordinal_position`).all()).map(row => row.column_name))
    .toEqual(['mode', 'seat_count', 'stage', 'presence', 'age_seconds'])
})

it('backfills only proven surviving starts as legacy and never replaces missing historical gameplay time with a recovery observation', async () => {
  await persistence.save('legacy', null, meta({ startedAt: now - 60_000 }))
  await db.exec(`DROP VIEW operations_current_openings;
    DROP TABLE game_opening_accounts,game_opening_facts,game_opening_tracking;
    DELETE FROM postgres_schema_migrations WHERE version=31;`)
  await migratePostgres(db)
  expect(await db.prepare('SELECT started_at,playing_at,origin,community_deck FROM game_opening_facts').get())
    .toEqual({ started_at: now - 60_000, playing_at: null, origin: 'legacy', community_deck: null })
  await facts.capture({ roomId: 'legacy', meta: meta(), state: { phase: 'playing', gameOver: false, enableCommunityDeck: true }, committedAt: now })
  expect(await db.prepare('SELECT playing_at,origin FROM game_opening_facts').get()).toEqual({ playing_at: null, origin: 'legacy' })
  expect(await db.prepare('SELECT user_id FROM game_opening_accounts').all()).toEqual([{ user_id: 'u1' }])
})
