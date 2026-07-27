import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { GameSession } from '../authoritative-session.ts'
import {
  RoomCommitter,
  replayIntentFromCommand,
  type RoomCommitScheduler,
} from '../room-committer.ts'
import { snapshotToRoom, type Room } from '../room.ts'
import { SqliteRoomPersistence } from '../persistence/sqlite-adapter.ts'

const makeRoom = (id = 'room-1'): Room => ({
  id,
  session: new GameSession(587, undefined, { playerCount: 2 }),
  players: [],
  seatOwners: [],
  maxPlayers: 2,
  version: 0,
  status: 'playing',
  startedAt: 100,
})

const actionIntent = replayIntentFromCommand({
  type: 'action',
  spaceId: 'forest',
  requestId: 'must-not-persist',
})

const fakeScheduler = () => {
  const tasks: Array<{ callback: () => void; delay: number }> = []
  const scheduler: RoomCommitScheduler = {
    setTimeout(callback, delay) {
      const task = { callback, delay }
      tasks.push(task)
      return task
    },
    clearTimeout(handle) {
      const index = tasks.indexOf(handle as (typeof tasks)[number])
      if (index >= 0) tasks.splice(index, 1)
    },
  }
  return { scheduler, tasks }
}

describe('RoomCommitter', () => {
  let tempDir = ''
  let db: Database.Database
  let persistence: SqliteRoomPersistence

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-room-committer-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    const { getDb } = await import('../../db.ts')
    db = getDb()
    persistence = new SqliteRoomPersistence(db)
  })

  afterEach(() => {
    db.close()
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  const createCommitter = (options: {
    enabled?: boolean
    scheduler?: RoomCommitScheduler
  } = {}) => new RoomCommitter({
    persistence,
    enabled: options.enabled ?? true,
    viewerBuildId: 'viewer-1',
    gameBuildId: 'game-1',
    scheduler: options.scheduler,
    now: () => 1_000,
  })

  it('waits until a restored waiting Room starts before creating Step 0', () => {
    const room = makeRoom()
    room.status = 'waiting'
    room.startedAt = undefined
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'unchanged',
    })
    expect(persistence.loadReplayHead(room.id)).toBeNull()

    room.status = 'playing'
    room.startedAt = 100
    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
  })

  it('creates Step 0, skips unchanged responses, and assigns consecutive global Steps', () => {
    const room = makeRoom()
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      roomVersion: 0,
      stepNo: 0,
    })
    expect(committer.commit(
      room,
      room.session.getState(),
      actionIntent!,
      0,
    )).toEqual({ kind: 'unchanged' })

    const first = room.session.devSetResources(0, { food: 1 })
    const secondIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 0,
      resources: { food: 1 },
      requestId: 'secret',
    })
    expect(committer.commit(room, first, secondIntent!, 0)).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    const second = room.session.devSetResources(1, { food: 3 })
    const thirdIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 1,
      resources: { food: 3 },
    })
    expect(committer.commit(room, second, thirdIntent!, 1)).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })

    expect(db.prepare(`
      SELECT step_no, room_version, player_index, command_type, intent_json
      FROM game_replay_steps ORDER BY step_no
    `).all()).toEqual([
      {
        step_no: 0,
        room_version: 0,
        player_index: null,
        command_type: 'initial',
        intent_json: '{}',
      },
      {
        step_no: 1,
        room_version: 1,
        player_index: 0,
        command_type: 'devSetResources',
        intent_json: '{"resources":{"food":1}}',
      },
      {
        step_no: 2,
        room_version: 2,
        player_index: 1,
        command_type: 'devSetResources',
        intent_json: '{"resources":{"food":3}}',
      },
    ])
  })

  it('serializes simultaneous player submissions and includes automatic resolution in the last Step', () => {
    const session = new GameSession(587, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    const room: Room = {
      ...makeRoom(),
      session,
    }
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })

    const p1Pool = session.state.draft!.pools.p1
    const p1Pick = {
      occCardId: p1Pool.occ[0]!,
      minorCardId: p1Pool.minor[0]!,
    }
    const p1Response = session.submitDraftPick('p1', p1Pick)
    expect(committer.commit(
      room,
      p1Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p1', pick: p1Pick })!,
      0,
    )).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect(p1Response.state.draft?.round).toBe(1)

    const p2Pool = session.state.draft!.pools.p2
    const p2Pick = {
      occCardId: p2Pool.occ[0]!,
      minorCardId: p2Pool.minor[0]!,
    }
    const p2Response = session.submitDraftPick('p2', p2Pick)
    expect(committer.commit(
      room,
      p2Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p2', pick: p2Pick })!,
      1,
    )).toMatchObject({ kind: 'committed', stepNo: 2 })
    expect(p2Response.state.draft?.round).toBe(2)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(2)
  })

  it('freezes a failed commit, blocks new commands, and retries the same Step', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.exec(`
      CREATE TRIGGER reject_step
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)
    const response = room.session.devSetResources(0, { food: 1 })
    const retried: number[] = []

    expect(committer.commit(room, response, actionIntent!, 0, (result) => {
      retried.push(result.stepNo)
    })).toEqual({ kind: 'blocked', error: 'disk unavailable' })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])
    expect(committer.commit(room, response, actionIntent!, 0)).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })

    db.exec('DROP TRIGGER reject_step')
    tasks.shift()!.callback()

    expect(retried).toEqual([1])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(1)
  })

  it('keeps a failed Step 0 on the durable path while it retries', () => {
    const room = makeRoom()
    const { scheduler } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    db.exec(`
      CREATE TRIGGER reject_step_zero
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 0
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })
    expect(committer.hasReplay(room.id)).toBe(true)
    committer.shutdown()
  })

  it('uses 1/2/5/10/30 second retry backoff and stays at 30 seconds', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.exec(`
      CREATE TRIGGER reject_step_backoff
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'still unavailable');
      END;
    `)
    const response = room.session.devSetResources(0, { food: 1 })

    committer.commit(room, response, actionIntent!, 0)

    for (const delay of [1_000, 2_000, 5_000, 10_000, 30_000, 30_000]) {
      expect(tasks[0]?.delay).toBe(delay)
      tasks.shift()!.callback()
    }
    expect(tasks[0]?.delay).toBe(30_000)
    committer.shutdown()
  })

  it('continues an existing replay after process recovery even when new recording is disabled', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    const response = room.session.devSetResources(0, { food: 1 })
    firstCommitter.commit(room, response, actionIntent!, 0)

    const restored = snapshotToRoom(persistence.load(room.id)!)
    const recoveredCommitter = createCommitter({ enabled: false })

    expect(recoveredCommitter.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    expect(restored.version).toBe(1)
    expect(persistence.loadReplayHead(room.id)?.missingPrefix).toBe(false)

    const next = restored.session.devSetResources(1, { food: 3 })
    expect(recoveredCommitter.commit(restored, next, actionIntent!, 1)).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })
  })

  it('blocks recovery of an unsupported replay schema', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    db.prepare('UPDATE game_replays SET schema_version = 2 WHERE room_id = ?').run(room.id)

    expect(createCommitter().prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: `unsupported replay schema 2 for ${room.id}`,
    })
  })

  it('starts an old active room at a missing-prefix Step 0', () => {
    const room = makeRoom()
    persistence.save(
      room.id,
      room.session.getState().state as never,
      {
        createdBy: null,
        startedAt: room.startedAt,
        maxPlayers: 2,
        customCardDbIds: [],
        status: 'playing',
        players: [],
      },
    )
    const committer = createCommitter({ enabled: false })

    expect(committer.prepareRoom(room, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    expect(persistence.loadReplayHead(room.id)?.missingPrefix).toBe(true)
  })

  it('permanently blocks a different Hash at the same Step', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 1, 1, 0, 0, 'action', '{}', 'delta', X'00', ?, 1001)
    `).run(room.id, 'f'.repeat(64))

    const response = room.session.devSetResources(0, { food: 1 })
    expect(committer.commit(room, response, actionIntent!, 0)).toEqual({
      kind: 'blocked',
      error: `replay hash conflict at ${room.id} step 1`,
    })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(tasks).toEqual([])
  })

  it('whitelists intent fields and excludes request and arbitrary payload data', () => {
    expect(actionIntent).toEqual({
      commandType: 'action',
      intentJson: '{"spaceId":"forest"}',
    })
    expect(replayIntentFromCommand({
      type: 'choice',
      value: 'confirm',
      payload: { token: 'secret', userId: 'u1' },
      requestId: 'req-1',
    })).toEqual({
      commandType: 'choice',
      intentJson: '{"value":"confirm"}',
    })
    expect(replayIntentFromCommand({ type: 'auth', token: 'secret' })).toBeNull()
  })
})
