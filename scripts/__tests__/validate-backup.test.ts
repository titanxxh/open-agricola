import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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
import { publishReplayViewer } from '../publish-replay-viewer.ts'
import { runBackupValidation, validateBackupDatabase } from '../validate-backup.ts'

const metadata = {
  backupStem: 'pre-v0.3.3-20260802T000000Z',
  createdAt: '2026-08-02T00:00:00Z',
  sourceBuildId: 'a'.repeat(40),
  targetBuildId: 'b'.repeat(40),
  targetRef: 'v0.3.3',
  archiveSha256: 'c'.repeat(64),
  archiveSizeBytes: 123,
}

describe('backup validation', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  const createFixture = () => {
    root = mkdtempSync(join(tmpdir(), 'open-agricola-backup-validation-'))
    const viewerStaging = join(root, 'viewer-staging')
    mkdirSync(viewerStaging)
    writeFileSync(join(viewerStaging, 'index.html'), '<main>Replay</main>')
    writeFileSync(join(viewerStaging, 'cards-manifest.json'), '[]')
    const { buildId: viewerBuildId } = publishReplayViewer(
      join(root, 'replay-viewers'),
      viewerStaging,
    )
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
      viewerBuildId,
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
    const asset = Buffer.from('archived custom card art')
    const assetHash = createHash('sha256').update(asset).digest('hex')
    mkdirSync(join(root, 'replay-assets'))
    writeFileSync(join(root, 'replay-assets', assetHash), asset)
    db.prepare('UPDATE game_replays SET custom_cards_json = ? WHERE room_id = ?')
      .run(JSON.stringify([{ artUrl: `/replay-assets/${assetHash}` }]), room.id)
    return { db, path, viewerBuildId, assetHash }
  }

  const validationPaths = () => ({
    viewerRoot: join(root, 'replay-viewers'),
    assetRoot: join(root, 'replay-assets'),
    ledgerPath: join(root, 'replay-removals.jsonl'),
  })

  const completeReplay = (db: Database.Database) => {
    db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed', phase = NULL, replay_status = 'available'
      WHERE room_id = 'room-1'
    `).run()
    db.prepare(`
      UPDATE game_replays
      SET status = 'completed', completed_at = 2_000
      WHERE room_id = 'room-1'
    `).run()
    db.prepare("DELETE FROM rooms WHERE id = 'room-1'").run()
  }

  it('runs target migrations and validates room, replay, and viewer recovery', () => {
    const { db } = createFixture()
    db.exec(`
      ALTER TABLE game_result_players DROP COLUMN name_is_default;
      DROP TABLE github_webhook_events;
      ALTER TABLE workshop_cards DROP COLUMN review_commit_sha;
      ALTER TABLE workshop_cards DROP COLUMN review_version_id;
      DELETE FROM schema_version WHERE version >= 27;
    `)

    expect(validateBackupDatabase(db, metadata, validationPaths())).toEqual({
      formatVersion: 1,
      ...metadata,
      sourceDatabaseSchemaVersion: 26,
      targetDatabaseSchemaVersion: 31,
      replaySchemaVersions: [1],
      roomCount: 1,
      replayCount: 1,
      replayHeadCount: 1,
      replayViewerBuildCount: 1,
      replayAssetCount: 1,
      replayRemovalLedgerEntryCount: 0,
      replayRemovalRoomCount: 0,
      replayRemovalAssetCount: 0,
      replaySegmentCount: 1,
      replayStepCount: 2,
    })

    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'github_webhook_events'
    `).get()).toBeTruthy()
    db.close()
  })

  it('rejects corruption outside the latest replay head', () => {
    const { db } = createFixture()
    db.prepare(`
      UPDATE game_replay_steps
      SET payload_gzip = X'00'
      WHERE room_id = 'room-1' AND step_no = 0
    `).run()
    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow('replay segment integrity failed at room-1 step 0')

    db.close()
  })

  it('rejects a matching replay head when the room cannot be rehydrated', () => {
    const { db } = createFixture()
    const snapshot = new SqliteRoomPersistence(db).load('room-1')!
    const incompatibleFrame = {
      ...snapshot.serialized!.frame,
      players: null,
    } as unknown as JsonValue
    const incompatibleSnapshot = {
      ...snapshot.serialized!,
      state: { ...snapshot.serialized!.state, players: null },
      frame: incompatibleFrame,
    }
    const encoded = encodeReplayFrame({
      frame: incompatibleFrame,
      previousFrame: null,
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })
    db.prepare("UPDATE rooms SET state_json = ? WHERE id = 'room-1'")
      .run(JSON.stringify(incompatibleSnapshot))
    db.prepare(`
      UPDATE game_replay_steps
      SET checkpoint_step_no = 1,
          payload_kind = 'checkpoint',
          payload_gzip = ?,
          frame_hash = ?
      WHERE room_id = 'room-1' AND step_no = 1
    `).run(encoded.payloadGzip, encoded.frameHash)
    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow('room rehydration failed: room-1')

    db.close()
  })

  it('rejects a completed replay whose viewer build is unavailable', () => {
    const { db, viewerBuildId } = createFixture()
    completeReplay(db)
    rmSync(join(root, 'replay-viewers', viewerBuildId), { recursive: true })

    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow(`replay viewer unavailable: room-1: ${viewerBuildId}`)

    db.close()
  })

  it('rejects malformed or inconsistent completed replay metadata', () => {
    const { db } = createFixture()
    completeReplay(db)
    db.prepare("UPDATE game_replays SET custom_cards_json = '{' WHERE room_id = 'room-1'")
      .run()

    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow('replay metadata invalid: room-1')

    db.prepare("UPDATE game_replays SET custom_cards_json = '[]' WHERE room_id = 'room-1'")
      .run()
    db.prepare("UPDATE game_contexts SET replay_status = 'legacy_no_replay' WHERE room_id = 'room-1'")
      .run()

    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow('replay metadata invalid: room-1')

    db.close()
  })

  it('validates replay assets by their content hash', () => {
    const { db, assetHash } = createFixture()
    writeFileSync(join(root, 'replay-assets', assetHash), 'corrupt')

    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow(`replay asset invalid: ${assetHash}`)

    rmSync(join(root, 'replay-assets', assetHash))
    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow(`replay asset invalid: ${assetHash}`)

    db.close()
  })

  it('rejects an invalid removal ledger and applies a valid ledger before validation', () => {
    const { db, assetHash } = createFixture()
    const ledgerPath = validationPaths().ledgerPath
    writeFileSync(ledgerPath, '{}\n')

    expect(() => validateBackupDatabase(db, metadata, validationPaths()))
      .toThrow('invalid replay removal ledger')

    writeFileSync(ledgerPath, `${JSON.stringify({
      version: 1,
      entries: [{
        version: 1,
        roomId: 'room-1',
        reason: 'removed',
        removedAt: 2_000,
        assetHashes: [assetHash],
        eraseResult: false,
      }],
      assetTakedowns: [],
    })}\n`)
    expect(validateBackupDatabase(db, metadata, validationPaths())).toMatchObject({
      roomCount: 0,
      replayCount: 0,
      replayAssetCount: 0,
      replayRemovalLedgerEntryCount: 1,
      replayRemovalRoomCount: 1,
      replayRemovalAssetCount: 1,
    })

    db.close()
  })

  it('maps a configured production viewer path into the extracted data copy', () => {
    const { db, path } = createFixture()
    db.close()
    renameSync(join(root, 'replay-viewers'), join(root, 'historical-viewers'))

    expect(runBackupValidation({
      DB_PATH: path,
      BACKUP_STEM: metadata.backupStem,
      BACKUP_CREATED_AT: metadata.createdAt,
      SOURCE_BUILD_ID: metadata.sourceBuildId,
      TARGET_BUILD_ID: metadata.targetBuildId,
      TARGET_REF: metadata.targetRef,
      BACKUP_SHA256: metadata.archiveSha256,
      BACKUP_SIZE_BYTES: String(metadata.archiveSizeBytes),
      REPLAY_VIEWER_ROOT: './data/historical-viewers',
      REPLAY_ASSET_ROOT: './data/replay-assets',
      REPLAY_REMOVAL_LEDGER_PATH: './data/replay-removals.jsonl',
    })).toMatchObject({
      replayViewerBuildCount: 1,
      replayAssetCount: 1,
    })
  })
})
