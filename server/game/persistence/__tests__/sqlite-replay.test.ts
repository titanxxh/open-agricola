import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteRoomPersistence, type ReplayCommit } from '../sqlite-adapter.ts'
import type { GameResult, RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: null,
  startedAt: 100,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
}

const STATE0 = { marker: 0 } as unknown as SerializedGameState
const STATE1 = { marker: 1 } as unknown as SerializedGameState

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
    frameHash: '0'.repeat(64),
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
    frameHash: '1'.repeat(64),
    createdAt: 101,
  },
})

describe('SqliteRoomPersistence replay commit', () => {
  let tempDir = ''
  let db: Database.Database
  let persistence: SqliteRoomPersistence
  let cleanExpiredSessions: () => void

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-sqlite-replay-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    const database = await import('../../../db.ts')
    db = database.getDb()
    cleanExpiredSessions = database.cleanExpiredSessions
    persistence = new SqliteRoomPersistence(db)
  })

  afterEach(() => {
    db.close()
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('atomically starts a replay with Step 0 and the recoverable snapshot', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })

    expect(persistence.load('room-1')?.serialized).toEqual(STATE0)
    expect(persistence.loadReplayHead('room-1')).toEqual({
      schemaVersion: 1,
      viewerBuildId: 'viewer-1',
      gameBuildId: 'game-1',
      status: 'recording',
      latestStepNo: 0,
      roomVersion: 0,
      checkpointStepNo: 0,
      frameHash: '0'.repeat(64),
      missingPrefix: false,
    })
    expect(db.prepare('SELECT payload_gzip FROM game_replay_steps').get()).toEqual({
      payload_gzip: Buffer.from('step-0'),
    })
  })

  it('treats the same Step and Hash as idempotent and blocks a different Hash', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })
    expect(persistence.commitReplay(nextStep())).toEqual({ kind: 'committed' })
    expect(persistence.commitReplay(nextStep())).toEqual({ kind: 'idempotent' })
    expect(persistence.commitReplay({
      ...nextStep(),
      step: { ...nextStep().step, frameHash: '2'.repeat(64) },
    })).toEqual({
      kind: 'conflict',
      error: 'replay hash conflict at room-1 step 1',
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get()).toEqual({ count: 2 })
  })

  it('rolls back the snapshot and replay head when a Step insert fails', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })
    db.exec(`
      CREATE TRIGGER reject_replay_step
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'replay write failed');
      END;
    `)

    expect(() => persistence.commitReplay(nextStep())).toThrow('replay write failed')
    expect(persistence.load('room-1')?.serialized).toEqual(STATE0)
    expect(persistence.loadReplayHead('room-1')?.latestStepNo).toBe(0)
  })

  it('rolls back Context writes when the Step sequence conflicts', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })
    const skipped = nextStep()
    skipped.step = {
      ...skipped.step,
      stepNo: 2,
      roomVersion: 2,
      createdAt: 999,
    }

    expect(persistence.commitReplay(skipped)).toEqual({
      kind: 'conflict',
      error: 'replay sequence conflict at room-1 step 2',
    })
    expect(db.prepare('SELECT updated_at FROM game_contexts WHERE room_id = ?').get('room-1'))
      .toEqual({ updated_at: 100 })
  })

  it('preserves an empty-room expiry through a later replay commit', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })
    db.prepare(`
      UPDATE game_contexts SET expires_at = 500 WHERE room_id = 'room-1'
    `).run()

    expect(persistence.commitReplay(nextStep())).toEqual({ kind: 'committed' })
    expect(db.prepare(`
      SELECT expires_at FROM game_contexts WHERE room_id = 'room-1'
    `).get()).toEqual({ expires_at: 500 })
  })

  it('commits the final Step, result, completed context, and room deletion together', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })

    expect(persistence.commitReplay({ ...nextStep(), result: RESULT })).toEqual({
      kind: 'committed',
    })
    expect(persistence.load('room-1')).toBeNull()
    expect(persistence.loadReplayHead('room-1')?.status).toBe('completed')
    expect(db.prepare('SELECT lifecycle, replay_status FROM game_contexts').get()).toEqual({
      lifecycle: 'completed',
      replay_status: 'available',
    })
    expect(db.prepare('SELECT room_id FROM game_results').get()).toEqual({ room_id: 'room-1' })
  })

  it('expires the permanent context when an active room is discarded', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })

    persistence.discard('room-1')

    expect(persistence.load('room-1')).toBeNull()
    expect(db.prepare(`
      SELECT lifecycle, phase, replay_status
      FROM game_contexts WHERE room_id = ?
    `).get('room-1')).toEqual({
      lifecycle: 'expired',
      phase: null,
      replay_status: null,
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replays').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get()).toEqual({ count: 0 })
  })

  it('keeps only a reported evidence segment when discarding an active room', () => {
    expect(persistence.commitReplay(step0())).toEqual({ kind: 'committed' })
    expect(persistence.commitReplay(nextStep())).toEqual({ kind: 'committed' })
    db.prepare(`
      INSERT INTO bug_reports (
        submission_id, reporter_user_id, room_id, player_index, lifecycle,
        room_version, step_no, frame_hash, status, evidence_expires_at,
        created_at, updated_at
      ) VALUES (
        'report-1', NULL, 'room-1', 0, 'active',
        0, 0, ?, 'submitted', ?, 100, 100
      )
    `).run('0'.repeat(64), Date.now() + 60_000)

    persistence.discard('room-1')

    expect(db.prepare(`
      SELECT latest_step_no FROM game_replays WHERE room_id = 'room-1'
    `).get()).toEqual({ latest_step_no: 0 })
    expect(db.prepare(`
      SELECT step_no, payload_gzip FROM game_replay_steps WHERE room_id = 'room-1'
    `).all()).toEqual([{ step_no: 0, payload_gzip: Buffer.from('step-0') }])

    db.prepare(`
      UPDATE bug_reports SET evidence_expires_at = ? WHERE submission_id = 'report-1'
    `).run(Date.now() - 1)
    cleanExpiredSessions()

    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replays').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get()).toEqual({ count: 0 })
  })
})
