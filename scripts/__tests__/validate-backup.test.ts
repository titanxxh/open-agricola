import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../server/db.ts'
import { GameSession } from '../../server/game/authoritative-session.ts'
import { SqliteRoomPersistence } from '../../server/game/persistence/sqlite-adapter.ts'
import { encodeReplayFrame, type JsonValue } from '../../server/game/replay-codec.ts'
import {
  RoomCommitter,
  replayIntentFromCommand,
} from '../../server/game/room-committer.ts'
import type { Room } from '../../server/game/room.ts'
import { validateBackupDatabase } from '../validate-backup.ts'

const metadata = {
  backupStem: 'pre-v0.3.3-20260802T000000Z',
  createdAt: '2026-08-02T00:00:00Z',
  sourceBuildId: 'a'.repeat(40),
  targetBuildId: 'b'.repeat(40),
  targetRef: 'v0.3.3',
}

describe('backup validation', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  const createFixture = () => {
    root = mkdtempSync(join(tmpdir(), 'open-agricola-backup-validation-'))
    const path = join(root, 'open-agricola.db')
    const db = new Database(path)
    runMigrations(db)
    const persistence = new SqliteRoomPersistence(db)
    const room: Room = {
      id: 'room-1',
      session: new GameSession(587, undefined, { playerCount: 2 }),
      players: [],
      seatOwners: [],
      maxPlayers: 2,
      version: 0,
      status: 'playing',
      startedAt: 100,
    }
    const committer = new RoomCommitter({
      persistence,
      enabled: true,
      viewerBuildId: 'viewer-1',
      gameBuildId: metadata.sourceBuildId,
      viewerBuildExists: () => true,
      now: () => 1_000,
    })
    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    const response = room.session.devSetResources(0, { food: 1 })
    const intent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 0,
      resources: { food: 1 },
    })!
    expect(committer.commit(room, response, intent, 0)).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    committer.shutdown()
    return { db, path }
  }

  it('validates room recovery and every replay segment from a read-only database', () => {
    const { db, path } = createFixture()
    db.close()
    const readonly = new Database(path, { readonly: true, fileMustExist: true })

    expect(validateBackupDatabase(readonly, metadata)).toEqual({
      formatVersion: 1,
      ...metadata,
      databaseSchemaVersion: 27,
      replaySchemaVersions: [1],
      roomCount: 1,
      replayCount: 1,
      replayHeadCount: 1,
      replaySegmentCount: 1,
      replayStepCount: 2,
    })

    readonly.close()
  })

  it('rejects corruption outside the latest replay head', () => {
    const { db, path } = createFixture()
    db.prepare(`
      UPDATE game_replay_steps
      SET payload_gzip = X'00'
      WHERE room_id = 'room-1' AND step_no = 0
    `).run()
    db.close()
    const readonly = new Database(path, { readonly: true, fileMustExist: true })

    expect(() => validateBackupDatabase(readonly, metadata))
      .toThrow('replay segment integrity failed at room-1 step 0')

    readonly.close()
  })

  it('rejects a matching replay head when the room cannot be rehydrated', () => {
    const { db, path } = createFixture()
    const snapshot = new SqliteRoomPersistence(db).load('room-1')!
    const incompatibleFrame = {
      ...snapshot.serialized,
      players: null,
    } as unknown as JsonValue
    const encoded = encodeReplayFrame({
      frame: incompatibleFrame,
      previousFrame: null,
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })
    db.prepare("UPDATE rooms SET state_json = ? WHERE id = 'room-1'")
      .run(JSON.stringify(incompatibleFrame))
    db.prepare(`
      UPDATE game_replay_steps
      SET checkpoint_step_no = 1,
          payload_kind = 'checkpoint',
          payload_gzip = ?,
          frame_hash = ?
      WHERE room_id = 'room-1' AND step_no = 1
    `).run(encoded.payloadGzip, encoded.frameHash)
    db.close()
    const readonly = new Database(path, { readonly: true, fileMustExist: true })

    expect(() => validateBackupDatabase(readonly, metadata))
      .toThrow('room rehydration failed: room-1')

    readonly.close()
  })
})
