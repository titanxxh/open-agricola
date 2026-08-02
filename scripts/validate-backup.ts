import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { runMigrations } from '../server/db.ts'
import { decodeReplayFrame, type JsonValue } from '../server/game/replay-codec.ts'
import { SqliteRoomPersistence } from '../server/game/persistence/sqlite-adapter.ts'
import { parseCustomCards, ReplayStore } from '../server/game/replay-store.ts'
import { viewerBuildExists } from '../server/game/replay-viewer-build.ts'
import { RoomCommitter } from '../server/game/room-committer.ts'
import { snapshotToRoom } from '../server/game/room.ts'

type BackupMetadata = {
  backupStem: string
  createdAt: string
  sourceBuildId: string
  targetBuildId: string
  targetRef: string
  archiveSha256: string
  archiveSizeBytes: number
}

export type BackupValidationReport = BackupMetadata & {
  formatVersion: 1
  databaseSchemaVersion: number
  replaySchemaVersions: number[]
  roomCount: number
  replayCount: number
  replayHeadCount: number
  replayViewerBuildCount: number
  replaySegmentCount: number
  replayStepCount: number
}

type ReplayHeaderRow = {
  room_id: string
  lifecycle: string
  replay_status: string | null
  status: string
  latest_step_no: number
  schema_version: number
  viewer_build_id: string
  missing_prefix: number
  custom_cards_json: string
}

type ReplayStepRow = {
  room_id: string
  step_no: number
  checkpoint_step_no: number
  payload_kind: 'checkpoint' | 'delta'
  payload_gzip: Buffer
  frame_hash: string
  intent_json: string
}

const validateSqlite = (db: Database.Database): void => {
  const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
    throw new Error(`sqlite integrity check failed: ${rows.map((row) => row.integrity_check).join('; ')}`)
  }
  const foreignKeyFailures = db.pragma('foreign_key_check') as unknown[]
  if (foreignKeyFailures.length > 0) throw new Error('sqlite foreign key check failed')
}

const validateRooms = (
  db: Database.Database,
  roomIds: string[],
  dataRoot: string,
): number => {
  const persistence = new SqliteRoomPersistence(db)
  const viewerRoot = join(dataRoot, 'replay-viewers')
  const committer = new RoomCommitter({
    persistence,
    enabled: false,
    viewerBuildId: '',
    gameBuildId: '',
    viewerBuildExists: (buildId) => viewerBuildExists(viewerRoot, buildId),
  })
  let replayHeadCount = 0
  try {
    for (const roomId of roomIds) {
      const snapshot = persistence.load(roomId)
      if (!snapshot) throw new Error(`room snapshot unreadable: ${roomId}`)
      const room = snapshotToRoom(snapshot)
      if (room.snapshotRehydrationFailed) {
        throw new Error(`room rehydration failed: ${roomId}`)
      }
      if (!persistence.loadReplayHead(roomId)) continue
      const result = committer.prepareRoom(room, { missingPrefix: true })
      if (result.kind === 'blocked') {
        throw new Error(`room recovery failed: ${roomId}: ${result.error}`)
      }
      replayHeadCount += 1
    }
  } finally {
    committer.shutdown()
  }
  return replayHeadCount
}

const validateReplay = (
  header: ReplayHeaderRow,
  rows: Iterable<ReplayStepRow>,
): { segmentCount: number; stepCount: number } => {
  let segmentCount = 0
  let stepCount = 0
  let previousFrame: JsonValue | null = null
  let checkpointStepNo = -1
  let previousStepNo: number | null = null
  let firstStepNo: number | null = null
  for (const row of rows) {
    firstStepNo ??= row.step_no
    if (header.lifecycle !== 'expired' && previousStepNo !== null && row.step_no !== previousStepNo + 1) {
      throw new Error(`replay step gap at ${header.room_id} step ${row.step_no}`)
    }
    if (row.payload_kind === 'checkpoint') {
      if (row.checkpoint_step_no !== row.step_no) {
        throw new Error(`invalid replay checkpoint at ${header.room_id} step ${row.step_no}`)
      }
      segmentCount += 1
      checkpointStepNo = row.step_no
      previousFrame = null
    } else if (previousFrame === null || row.checkpoint_step_no !== checkpointStepNo) {
      throw new Error(`invalid replay segment at ${header.room_id} step ${row.step_no}`)
    }
    try {
      JSON.parse(row.intent_json)
    } catch {
      throw new Error(`replay step metadata invalid at ${header.room_id} step ${row.step_no}`)
    }
    try {
      previousFrame = decodeReplayFrame(previousFrame, {
        payloadKind: row.payload_kind,
        payloadGzip: row.payload_gzip,
        checkpointStepNo: row.checkpoint_step_no,
        frameHash: row.frame_hash,
      })
    } catch {
      throw new Error(`replay segment integrity failed at ${header.room_id} step ${row.step_no}`)
    }
    previousStepNo = row.step_no
    stepCount += 1
  }
  if (stepCount === 0) throw new Error(`replay has no steps: ${header.room_id}`)
  if (header.lifecycle !== 'expired' && header.missing_prefix !== 1 && firstStepNo !== 0) {
    throw new Error(`replay does not start at step 0: ${header.room_id}`)
  }
  if (previousStepNo !== header.latest_step_no) {
    throw new Error(`replay head step mismatch: ${header.room_id}`)
  }
  return { segmentCount, stepCount }
}

const validateReplayMetadata = (
  db: Database.Database,
  headers: ReplayHeaderRow[],
  dataRoot: string,
): number => {
  const store = new ReplayStore(db)
  const viewerRoot = join(dataRoot, 'replay-viewers')
  const viewerBuildIds = new Set<string>()
  for (const header of headers) {
    try {
      parseCustomCards(header.custom_cards_json)
    } catch {
      throw new Error(`replay metadata invalid: ${header.room_id}`)
    }
    if (!viewerBuildExists(viewerRoot, header.viewer_build_id)) {
      throw new Error(`replay viewer unavailable: ${header.room_id}: ${header.viewer_build_id}`)
    }
    viewerBuildIds.add(header.viewer_build_id)
    if (header.lifecycle === 'active') {
      if (header.replay_status !== null || header.status !== 'recording') {
        throw new Error(`replay metadata invalid: ${header.room_id}`)
      }
      continue
    }
    if (header.lifecycle !== 'completed') continue
    const manifest = store.manifest(header.room_id)
    if (!manifest.ok) throw new Error(`replay metadata invalid: ${header.room_id}: ${manifest.code}`)
  }
  return viewerBuildIds.size
}

export const validateBackupDatabase = (
  db: Database.Database,
  metadata: BackupMetadata,
  dataRoot: string,
): BackupValidationReport => {
  db.pragma('foreign_keys = ON')
  runMigrations(db, () => {})
  validateSqlite(db)
  const schemaRow = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null
  }
  const databaseSchemaVersion = schemaRow.version ?? 0
  const roomIds = (db.prepare('SELECT id FROM rooms ORDER BY id').all() as Array<{ id: string }>)
    .map(({ id }) => id)
  const headers = db.prepare(`
    SELECT replay.room_id,
           context.lifecycle,
           context.replay_status,
           replay.status,
           replay.latest_step_no,
           replay.schema_version,
           replay.viewer_build_id,
           replay.missing_prefix,
           replay.custom_cards_json
    FROM game_replays AS replay
    JOIN game_contexts AS context ON context.room_id = replay.room_id
    ORDER BY replay.room_id
  `).all() as ReplayHeaderRow[]
  const orphan = db.prepare(`
    SELECT step.room_id
    FROM game_replay_steps AS step
    LEFT JOIN game_replays AS replay ON replay.room_id = step.room_id
    WHERE replay.room_id IS NULL
    LIMIT 1
  `).get() as { room_id: string } | undefined
  if (orphan) throw new Error(`orphan replay steps: ${orphan.room_id}`)
  const loadSteps = db.prepare(`
    SELECT room_id, step_no, checkpoint_step_no, payload_kind,
           payload_gzip, frame_hash, intent_json
    FROM game_replay_steps
    WHERE room_id = ?
    ORDER BY step_no
  `)
  let replaySegmentCount = 0
  let replayStepCount = 0
  for (const header of headers) {
    const counts = validateReplay(
      header,
      loadSteps.iterate(header.room_id) as IterableIterator<ReplayStepRow>,
    )
    replaySegmentCount += counts.segmentCount
    replayStepCount += counts.stepCount
  }
  return {
    formatVersion: 1,
    ...metadata,
    databaseSchemaVersion,
    replaySchemaVersions: [...new Set(headers.map(({ schema_version }) => schema_version))].sort((a, b) => a - b),
    roomCount: roomIds.length,
    replayCount: headers.length,
    replayHeadCount: validateRooms(db, roomIds, dataRoot),
    replayViewerBuildCount: validateReplayMetadata(db, headers, dataRoot),
    replaySegmentCount,
    replayStepCount,
  }
}

const requiredEnv = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const requiredArchiveSha256 = (env: NodeJS.ProcessEnv): string => {
  const value = requiredEnv(env, 'BACKUP_SHA256')
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('BACKUP_SHA256 is invalid')
  return value
}

const requiredArchiveSize = (env: NodeJS.ProcessEnv): number => {
  const value = Number(requiredEnv(env, 'BACKUP_SIZE_BYTES'))
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('BACKUP_SIZE_BYTES is invalid')
  return value
}

export const runBackupValidation = (
  env: NodeJS.ProcessEnv = process.env,
): BackupValidationReport => {
  const dbPath = resolve(requiredEnv(env, 'DB_PATH'))
  const db = new Database(dbPath, { fileMustExist: true })
  try {
    return validateBackupDatabase(db, {
      backupStem: requiredEnv(env, 'BACKUP_STEM'),
      createdAt: requiredEnv(env, 'BACKUP_CREATED_AT'),
      sourceBuildId: requiredEnv(env, 'SOURCE_BUILD_ID'),
      targetBuildId: requiredEnv(env, 'TARGET_BUILD_ID'),
      targetRef: requiredEnv(env, 'TARGET_REF'),
      archiveSha256: requiredArchiveSha256(env),
      archiveSizeBytes: requiredArchiveSize(env),
    }, dirname(dbPath))
  } finally {
    db.close()
  }
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(runBackupValidation(), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'backup validation failed')
    process.exitCode = 1
  }
}
