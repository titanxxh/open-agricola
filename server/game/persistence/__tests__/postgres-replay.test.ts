import { randomUUID } from 'node:crypto'
import { CommandStore } from '../../command-store'
import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../../database/postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgresRoomPersistence, type ReplayCommit } from '../postgres-adapter.ts'
import type { GameResult, RoomMeta } from '../room-persistence.ts'
import type { PersistedSessionSnapshot } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: null,
  startedAt: 100,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
}

const snapshot = (marker: number) => ({
  state: { players: [] },
  frame: { marker },
  sessionCursor: {},
}) as unknown as PersistedSessionSnapshot

const STATE0 = snapshot(0)
const STATE1 = snapshot(1)

const RESULT: GameResult = {
  roomId: 'room-1',
  startedAt: 100,
  finishedAt: 200,
  roundsPlayed: 14,
  playerCount: 2,
  communityDeck: false,
  parentCards: false,
  throughTheSeasons: false,
  farmersOfTheMoor: false,
  snakeOpening: false,
  players: [
    { playerIndex: 0, gamePlayerId: 'p1', userId: null, displayName: 'P1', score: 10 },
    { playerIndex: 1, gamePlayerId: 'p2', userId: null, displayName: 'P2', score: 9 },
  ],
}

const step0 = (): ReplayCommit => ({
  roomId: 'room-1',
  serialized: STATE0,
  meta: META,
  header: {
    schemaVersion: 1,
    viewerBuildId: 'viewer-1',
    gameBuildId: 'game-1',
    missingPrefix: false,
    customCardsJson: '[]',
  },
  step: {
    stepNo: 0,
    roomVersion: 0,
    checkpointStepNo: 0,
    playerIndex: null,
    commandType: 'initial',
    intentJson: '{}',
    payloadKind: 'checkpoint',
    payloadGzip: Buffer.from('step-0'),
    frameHash: 'a86755ae3f54757d427a9ad58fc7f1ada412ee0770ff00e27fe40bd67951901a',
    createdAt: 100,
  },
})

const nextStep = (): ReplayCommit => ({
  roomId: 'room-1',
  serialized: STATE1,
  meta: META,
  step: {
    stepNo: 1,
    roomVersion: 1,
    checkpointStepNo: 0,
    playerIndex: 0,
    commandType: 'action',
    intentJson: '{"spaceId":"forest"}',
    payloadKind: 'delta',
    payloadGzip: Buffer.from('step-1'),
    frameHash: '89277a17d149f9f933c443e2ec92d03bc5fe8bd74f361dd75224a4c2db03eb7f',
    createdAt: 101,
  },
})

describe('PostgresRoomPersistence replay commit', () => {
  let db: PostgresDatabase
  let persistence: PostgresRoomPersistence
  let cleanExpiredSessions: (db: PostgresDatabase) => Promise<void>

  beforeEach(async () => {
    const database = await import('../../../db.ts')
    db = await createTestDatabase()
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    cleanExpiredSessions = database.cleanExpiredSessions
    persistence = new PostgresRoomPersistence(db)
  })

  afterEach(async () => {
    ;(await db.close())
    vi.restoreAllMocks()
  })

  it('commits the command receipt atomically with the Replay step and refuses step collisions', async () => {
    await persistence.commitReplay(step0())
    const commands = new CommandStore(db)
    const scope = await commands.issueScope('actor')
    const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
    const reserved = await commands.reserve('actor', identity, 'room-1', { type: 'action', spaceId: 'forest', expectedVersion: 0 })
    if (reserved.kind !== 'pending') throw new Error('Expected reservation')
    const commit = nextStep()
    commit.receipt = { request: reserved.request, outcome: { ok: true, roomId: 'room-1', roomVersion: 1, stepNo: 1, frameHash: commit.step.frameHash } }
    await db.exec(`CREATE FUNCTION reject_receipt() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'receipt rejected'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_receipt BEFORE UPDATE OF outcome_json ON command_requests FOR EACH ROW EXECUTE FUNCTION reject_receipt();`)
    await expect(persistence.commitReplay(commit)).rejects.toThrow('receipt rejected')
    expect((await persistence.loadReplayHead('room-1'))?.latestStepNo).toBe(0)
    expect(await commands.lookup('actor', identity)).toMatchObject({ kind: 'pending' })
    await db.exec('DROP TRIGGER reject_receipt ON command_requests')
    expect(await persistence.commitReplay(commit)).toEqual({ kind: 'committed' })
    expect(await commands.lookup('actor', identity)).toMatchObject({ kind: 'completed', receipt: { outcome: commit.receipt.outcome } })
    expect(await persistence.commitReplay(commit)).toEqual({ kind: 'idempotent' })
    const other = await commands.reserve('actor', { scopeId: scope.scopeId, commandId: randomUUID() }, 'room-1', { type: 'action', spaceId: 'forest', expectedVersion: 0 })
    if (other.kind !== 'pending') throw new Error('Expected reservation')
    expect(await persistence.commitReplay({ ...commit, receipt: { ...commit.receipt, request: other.request } })).toMatchObject({ kind: 'conflict' })
  })

  it('atomically starts a replay with Step 0 and the recoverable snapshot', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })

    expect((await persistence.load('room-1'))?.serialized).toEqual(STATE0)
    expect((await persistence.loadReplayHead('room-1'))).toEqual({
      schemaVersion: 1,
      viewerBuildId: 'viewer-1',
      gameBuildId: 'game-1',
      status: 'recording',
      latestStepNo: 0,
      roomVersion: 0,
      checkpointStepNo: 0,
      frameHash: 'a86755ae3f54757d427a9ad58fc7f1ada412ee0770ff00e27fe40bd67951901a',
      missingPrefix: false,
    })
    expect((await db.prepare('SELECT payload_gzip FROM game_replay_steps').get())).toEqual({
      payload_gzip: Buffer.from('step-0'),
    })
  })

  it('treats the same Step and Hash as idempotent and blocks a different Hash', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })
    expect((await persistence.commitReplay(nextStep()))).toEqual({ kind: 'committed' })
    expect((await persistence.commitReplay(nextStep()))).toEqual({ kind: 'idempotent' })
    expect((await persistence.commitReplay({
      ...nextStep(),
      step: { ...nextStep().step, frameHash: '2'.repeat(64) },
    }))).toEqual({
      kind: 'conflict',
      error: 'replay hash conflict at room-1 step 1',
    })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get())).toEqual({ count: 2 })
  })

  it('rolls back the snapshot and replay head when a Step insert fails', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })
    ;(await db.exec(`
      CREATE FUNCTION reject_replay_step_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'replay write failed'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_replay_step BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_replay_step_fn();
    `))

    ;(await expect(persistence.commitReplay(nextStep())).rejects.toThrow('replay write failed'))
    expect((await persistence.load('room-1'))?.serialized).toEqual(STATE0)
    expect((await persistence.loadReplayHead('room-1'))?.latestStepNo).toBe(0)
  })

  it('rolls back Context writes when the Step sequence conflicts', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })
    const skipped = nextStep()
    skipped.step = {
      ...skipped.step,
      stepNo: 2,
      roomVersion: 2,
      createdAt: 999,
    }

    expect((await persistence.commitReplay(skipped))).toEqual({
      kind: 'conflict',
      error: 'replay sequence conflict at room-1 step 2',
    })
    expect((await db.prepare('SELECT updated_at FROM game_contexts WHERE room_id = ?').get('room-1')))
      .toEqual({ updated_at: 100 })
  })

  it('preserves an empty-room expiry through a later replay commit', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })
    ;(await db.prepare(`
      UPDATE game_contexts SET expires_at = 500 WHERE room_id = 'room-1'
    `).run())

    expect((await persistence.commitReplay(nextStep()))).toEqual({ kind: 'committed' })
    expect((await db.prepare(`
      SELECT expires_at FROM game_contexts WHERE room_id = 'room-1'
    `).get())).toEqual({ expires_at: 500 })
  })

  it('commits the final Step, result, completed context, and room deletion together', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })

    expect((await persistence.commitReplay({ ...nextStep(), result: RESULT }))).toEqual({
      kind: 'committed',
    })
    expect((await persistence.load('room-1'))).toBeNull()
    expect((await persistence.loadReplayHead('room-1'))?.status).toBe('completed')
    expect((await db.prepare('SELECT lifecycle, replay_status FROM game_contexts').get())).toEqual({
      lifecycle: 'completed',
      replay_status: 'available',
    })
    expect((await db.prepare('SELECT room_id FROM game_results').get())).toEqual({ room_id: 'room-1' })
  })

  it('archives current seat identities, name provenance and variant flags once with the final recorded Step', async () => {
    for (const id of ['old', 'replacement']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)").run(id, id, id)
    const initial = step0()
    initial.meta = { ...META, players: [{ playerIndex: 0, userId: 'old' }] }
    await persistence.commitReplay(initial)
    const meta = { ...META, players: [{ playerIndex: 0, userId: 'replacement' }] }
    await persistence.save('room-1', null, meta)
    const result = { ...RESULT, snakeOpening: true, players: [
      { ...RESULT.players[0]!, userId: 'old', displayName: 'Player 2' },
      { ...RESULT.players[1]!, displayName: 'Player 2', nameIsDefault: true },
    ] }
    const final = { ...nextStep(), meta, result }
    expect(await persistence.commitReplay(final)).toEqual({ kind: 'committed' })
    expect(await persistence.commitReplay({ ...final, result: { ...result, finishedAt: 999, players: [] } })).toEqual({ kind: 'idempotent' })
    expect(await db.prepare('SELECT user_id, display_name, name_is_default, score FROM game_result_players ORDER BY player_index').all()).toEqual([
      { user_id: 'replacement', display_name: 'Player 2', name_is_default: 0, score: 10 },
      { user_id: null, display_name: 'Player 2', name_is_default: 1, score: 9 },
    ])
    expect(await db.prepare('SELECT finished_at,enable_snake_opening FROM game_results').get()).toEqual({ finished_at: 200, enable_snake_opening: 1 })
    expect(await persistence.hasRoomId('room-1')).toBe(true)
    await expect(persistence.save('room-1', STATE0, META)).rejects.toThrow('Room context is no longer active')
  })

  it('keeps the recoverable Room and previous Step together when final result archival fails', async () => {
    await persistence.commitReplay(step0())
    await db.exec(`CREATE FUNCTION reject_final_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'result rejected'; END $$;
      CREATE TRIGGER reject_final_result BEFORE INSERT ON game_result_players FOR EACH ROW EXECUTE FUNCTION reject_final_result();`)
    await expect(persistence.commitReplay({ ...nextStep(), result: RESULT })).rejects.toThrow('result rejected')
    expect((await persistence.load('room-1'))?.serialized).toEqual(STATE0)
    expect((await persistence.loadReplayHead('room-1'))?.latestStepNo).toBe(0)
    expect(await db.prepare('SELECT room_id FROM game_results').get()).toBeUndefined()
  })

  it('expires the permanent context when an active room is discarded', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })

    ;(await persistence.discard('room-1'))

    expect((await persistence.load('room-1'))).toBeNull()
    expect((await db.prepare(`
      SELECT lifecycle, phase, replay_status
      FROM game_contexts WHERE room_id = ?
    `).get('room-1'))).toEqual({
      lifecycle: 'expired',
      phase: null,
      replay_status: null,
    })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM game_replays').get())).toEqual({ count: 0 })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get())).toEqual({ count: 0 })
  })

  it('keeps only a reported evidence segment when discarding an active room', async () => {
    expect((await persistence.commitReplay(step0()))).toEqual({ kind: 'committed' })
    expect((await persistence.commitReplay(nextStep()))).toEqual({ kind: 'committed' })
    ;(await db.prepare(`
      INSERT INTO bug_reports (
        submission_id, reporter_user_id, room_id, player_index, lifecycle,
        room_version, step_no, frame_hash, status, evidence_expires_at,
        created_at, updated_at
      ) VALUES (
        'report-1', NULL, 'room-1', 0, 'active',
        0, 0, ?, 'submitted', ?, 100, 100
      )
    `).run('a86755ae3f54757d427a9ad58fc7f1ada412ee0770ff00e27fe40bd67951901a', Date.now() + 60_000))

    ;(await persistence.discard('room-1'))

    expect((await db.prepare(`
      SELECT latest_step_no FROM game_replays WHERE room_id = 'room-1'
    `).get())).toEqual({ latest_step_no: 0 })
    expect((await db.prepare(`
      SELECT step_no, payload_gzip FROM game_replay_steps WHERE room_id = 'room-1'
    `).all())).toEqual([{ step_no: 0, payload_gzip: Buffer.from('step-0') }])
    ;(await db.prepare(`
      INSERT INTO game_context_participants (room_id, player_index, user_id)
      VALUES ('room-1', 0, NULL)
    `).run())

    ;(await db.prepare(`
      UPDATE bug_reports SET evidence_expires_at = ? WHERE submission_id = 'report-1'
    `).run(Date.now() - 1))
    await cleanExpiredSessions(db)

    expect((await db.prepare('SELECT COUNT(*) AS count FROM game_replays').get())).toEqual({ count: 0 })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get())).toEqual({ count: 0 })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM game_context_participants
    `).get())).toEqual({ count: 0 })
  })
})
