import { vi, afterEach, expect, it } from 'vitest'

// Native database/S3 and child-process operations also run under full-suite load.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })
import { importFixture } from './_helpers/import-fixture'
import { importSqlite } from '../sqlite-import/import'
import { backupMetadata, runBackupValidation, validateBackupDatabase } from '../validate-backup'
import { encodeReplayFrame, type JsonValue } from '../../server/game/replay-codec'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'

const metadata = { backupStem: 'test-backup', createdAt: '2026-10-05T00:00:00Z', sourceBuildId: 'main', targetBuildId: 'distributed', targetRef: 'test', archiveSha256: 'c'.repeat(64), archiveSizeBytes: 123 }
let fixture: Awaited<ReturnType<typeof importFixture>> | undefined
afterEach(async () => { await fixture?.close(); fixture = undefined })
async function imported() {
  fixture = await importFixture()
  await importSqlite(fixture.paths, fixture.db, fixture.resources)
  return fixture
}

it('verifies restored PostgreSQL, Room recovery, all Replay segments and private retained objects', async () => {
  const { db, resources } = await imported()
  expect(await validateBackupDatabase(db, metadata, resources)).toMatchObject({ formatVersion: 2, roomCount: 1, replayCount: 1, replayHeadCount: 1, replayStepCount: 4, retainedObjectCount: 3, replayRemovalLedgerEntryCount: 0 })
})

it('rejects corruption outside the latest Replay head', async () => {
  const { db, resources } = await imported()
  await db.prepare("UPDATE game_replay_steps SET payload_gzip = ? WHERE room_id='recorded' AND step_no=0").run(Buffer.from([0]))
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow('replay segment integrity failed at recorded step 0')
})

it('rejects a matching Replay hash when the Room cannot be rehydrated', async () => {
  const { db, resources } = await imported()
  const snapshot = (await new PostgresRoomPersistence(db).load('recorded'))!.serialized!
  const frame = { ...snapshot.frame, players: null } as unknown as JsonValue
  const encoded = encodeReplayFrame({ frame, previousFrame: null, stepNo: 3, previousCheckpointStepNo: 0 })
  await db.prepare("UPDATE rooms SET state_json = ? WHERE id='recorded'").run(JSON.stringify({ ...snapshot, state: { ...snapshot.state, players: null }, frame }))
  await db.prepare("UPDATE game_replay_steps SET frame_hash = ?, payload_gzip = ?, payload_kind='checkpoint', checkpoint_step_no=3 WHERE room_id='recorded' AND step_no=3").run(encoded.frameHash, encoded.payloadGzip)
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow(/rehydration|snapshot/i)
})

it('rejects a completed Replay with an unavailable Viewer', async () => {
  const { db, resources } = await imported()
  await db.prepare("UPDATE game_contexts SET lifecycle='completed', phase=NULL, replay_status='available' WHERE room_id='recorded'").run()
  await db.prepare("UPDATE game_replays SET status='completed', completed_at=2 WHERE room_id='recorded'").run()
  await db.prepare("DELETE FROM rooms WHERE id='recorded'").run()
  await db.prepare('DELETE FROM replay_viewer_builds').run()
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow('replay viewer unavailable')
})

it('rejects malformed Replay card metadata and changed retained resource bytes', async () => {
  const { db, resources } = await imported()
  await db.prepare("UPDATE game_replays SET custom_cards_json = '{}' WHERE room_id='recorded'").run()
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow(/custom card|archive|metadata/i)
  await db.prepare("UPDATE game_replays SET custom_cards_json = '[]' WHERE room_id='recorded'").run()
  const object = await resources.objects.get('card-art/saved.png')
  await resources.objects.replace('card-art/saved.png', Buffer.from('changed'), object!.etag)
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow('integrity check')
})

it('applies a newer independent erasure ledger before examining an older restored database', async () => {
  const { db, resources } = await imported()
  await resources.ledger.append({ version: 1, entries: [{ version: 1, roomId: 'recorded', reason: 'legal', removedAt: Date.now(), eraseResult: false, assetHashes: [] }], assetTakedowns: [] })
  expect(await validateBackupDatabase(db, metadata, resources)).toMatchObject({ roomCount: 0, replayCount: 0, replayRemovalLedgerEntryCount: 1, replayRemovalRoomCount: 1 })
  const object = await resources.objects.get('erasure/ledger.json')
  await resources.objects.replace('erasure/ledger.json', Buffer.from('{"version":1,"batches":[{}]}'), object!.etag)
  await expect(validateBackupDatabase(db, metadata, resources)).rejects.toThrow('Invalid independent erasure ledger')
})

it('requires a stopped application and exact archive metadata before connecting', async () => {
  await expect(runBackupValidation({})).rejects.toThrow('APPLICATIONS_STOPPED')
  expect(() => backupMetadata({ BACKUP_SHA256: 'bad' })).toThrow('BACKUP_SHA256 is invalid')
})
