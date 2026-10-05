import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeSessionSnapshot } from '../../../shared/session/serialization.ts'
import { stabilizeRandomHands } from '../../__tests__/_helpers/stabilize-random-hands.ts'
import { GameSession } from '../authoritative-session.ts'
import { PostgresRoomPersistence } from '../persistence/postgres-adapter.ts'
import * as cursorComparison from '../private-cursor-comparison.ts'
import { RoomCommitter, replayIntentFromCommand, type RoomCommitScheduler } from '../room-committer.ts'
import { snapshotToRoom, type Room } from '../room.ts'

describe('RoomCommitter private cursor ownership', () => {
  let tempDir: string
  let db: PostgresDatabase
  let persistence: PostgresRoomPersistence
  const committers: RoomCommitter[] = []

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-private-cursor-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    db = await createTestDatabase()
    persistence = new PostgresRoomPersistence(db)
  })

  afterEach(async () => {
    committers.splice(0).forEach(committer => committer.shutdown())
    vi.restoreAllMocks()
    ;(await db.close())
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  const makeRoom = (): Room => {
    const session = new GameSession(587, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    return {
      id: 'private-cursor-room', session, players: [], seatOwners: [],
      maxPlayers: 2, version: 0, status: 'playing', replayRecording: true, replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1', startedAt: 100,
    }
  }
  const makeCommitter = (scheduler?: RoomCommitScheduler): RoomCommitter => {
    const committer = new RoomCommitter({
      persistence, viewerBuildId: 'viewer', gameBuildId: 'game',
      viewerBuildExists: () => true, scheduler, now: () => 1_000,
    })
    committers.push(committer)
    return committer
  }
  const intent = replayIntentFromCommand({ type: 'action', spaceId: 'forest' })!

  it('detects changes to a worker-owned cursor after an earlier snapshot was accepted', async () => {
    const room = makeRoom()
    const snapshot = serializeSessionSnapshot(room.session.state, room.session)
    room.customSessionExecutor = {
      serializedStateForPersistence: () => snapshot,
    } as NonNullable<Room['customSessionExecutor']>
    const committer = makeCommitter()
    expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')

    snapshot.sessionCursor.actionResultDetailsSinceFlush.gains.food = 2
    expect((await committer.commit(room, room.session.getState(), intent, 0)))
      .toMatchObject({ kind: 'committed', stepNo: 1 })
    expect((await committer.commit(room, room.session.getState(), intent, 0))).toEqual({ kind: 'unchanged' })
    expect((await persistence.load(room.id))!.serialized!.sessionCursor.actionResultDetailsSinceFlush.gains.food)
      .toBe(2)

    snapshot.sessionCursor.actionResultDetailsSinceFlush.gains.food = 3
    expect((await committer.commit(room, room.session.getState(), intent, 0)))
      .toMatchObject({ kind: 'committed', stepNo: 2 })
  })

  it('skips private equality when the public Frame changes or a durable rejection forces a Step', async () => {
    const room = makeRoom()
    const committer = makeCommitter()
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    const compare = vi.spyOn(cursorComparison, 'privateCursorEquals')

    const response = room.session.devSetResources(0, { food: 42 })
    expect((await committer.commit(room, response, intent, 0))).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect(compare).not.toHaveBeenCalled()

    const rejected = { ...room.session.getState(), ok: false, durableTransition: true }
    expect((await committer.commit(room, rejected, intent, 0))).toMatchObject({ kind: 'committed', stepNo: 2 })
    expect(compare).not.toHaveBeenCalled()
    expect((await committer.commit(room, { ...rejected, durableTransition: undefined }, intent, 0)))
      .toEqual({ kind: 'unchanged' })
    expect((await committer.commit(room, room.session.getState(), intent, 0))).toEqual({ kind: 'unchanged' })
    expect(compare).toHaveBeenCalledOnce()
  })

  it('accepts the frozen retry cursor and reconstructs its baseline after restart', async () => {
    const room = makeRoom()
    let snapshot = serializeSessionSnapshot(room.session.state, room.session)
    room.customSessionExecutor = {
      serializedStateForPersistence: () => snapshot,
    } as NonNullable<Room['customSessionExecutor']>
    const retries: Array<() => void> = []
    const committer = makeCommitter({
      setTimeout(callback) { retries.push(callback); return callback },
      clearTimeout() {},
    })
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    snapshot = serializeSessionSnapshot(room.session.state, room.session)
    snapshot.sessionCursor.actionResultDetailsSinceFlush.gains.food = 2
    ;(await db.exec(`
      CREATE FUNCTION reject_cursor_step_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'disk unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cursor_step BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_cursor_step_fn();
    `))
    expect((await committer.commit(room, room.session.getState(), intent, 0)).kind).toBe('blocked')

    // A newer producer snapshot must not replace the already frozen pending cursor.
    snapshot = serializeSessionSnapshot(room.session.state, room.session)
    snapshot.sessionCursor.actionResultDetailsSinceFlush.gains.food = 3
    ;(await db.exec('DROP TRIGGER reject_cursor_step ON game_replay_steps'))
    await retries.shift()!()
    expect((await persistence.load(room.id))!.serialized!.sessionCursor.actionResultDetailsSinceFlush.gains.food)
      .toBe(2)
    expect((await committer.commit(room, room.session.getState(), intent, 0)))
      .toMatchObject({ kind: 'committed', stepNo: 2 })

    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const restoredCommitter = makeCommitter()
    expect((await restoredCommitter.prepareRoom(restored, { missingPrefix: true })))
      .toMatchObject({ kind: 'committed', stepNo: 2 })
    expect((await restoredCommitter.commit(restored, restored.session.getState(), intent, 0)))
      .toEqual({ kind: 'unchanged' })
  })
})
