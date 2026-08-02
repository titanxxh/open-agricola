import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { decodeReplayFrame, type JsonValue } from '../server/game/replay-codec.ts'
import { SqliteRoomPersistence } from '../server/game/persistence/sqlite-adapter.ts'
import { RoomCommitter } from '../server/game/room-committer.ts'
import { snapshotToRoom } from '../server/game/room.ts'

type BackupMetadata = {
  backupStem: string
  createdAt: string
  sourceBuildId: string
  targetBuildId: string
  targetRef: string
}

export type BackupValidationReport = BackupMetadata & {
  formatVersion: 1
  databaseSchemaVersion: number
  replaySchemaVersions: number[]
  roomCount: number
  replayCount: number
  replayHeadCount: number
  replaySegmentCount: number
  replayStepCount: number
}

type ReplayHeaderRow = {
  room_id: string
  lifecycle: string
  latest_step_no: number
  schema_version: number
}

type ReplayStepRow = {
  room_id: string
  step_no: number
  checkpoint_step_no: number
  payload_kind: 'checkpoint' | 'delta'
  payload_gzip: Buffer
  frame_hash: string
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
): number => {
  const persistence = new SqliteRoomPersistence(db)
  const committer = new RoomCommitter({
    persistence,
    enabled: false,
    viewerBuildId: '',
    gameBuildId: '',
    viewerBuildExists: () => true,
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
  rows: ReplayStepRow[],
): number => {
  if (rows.length === 0) throw new Error(`replay has no steps: ${header.room_id}`)
  let segmentCount = 0
  let previousFrame: JsonValue | null = null
  let checkpointStepNo = -1
  let previousStepNo: number | null = null
  for (const row of rows) {
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
  }
  if (header.lifecycle !== 'expired' && rows[0]?.step_no !== 0) {
    throw new Error(`replay does not start at step 0: ${header.room_id}`)
  }
  if (previousStepNo !== header.latest_step_no) {
    throw new Error(`replay head step mismatch: ${header.room_id}`)
  }
  return segmentCount
}

export const validateBackupDatabase = (
  db: Database.Database,
  metadata: BackupMetadata,
): BackupValidationReport => {
  db.pragma('query_only = ON')
  validateSqlite(db)
  const schemaRow = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null
  }
  const databaseSchemaVersion = schemaRow.version ?? 0
  const roomIds = (db.prepare('SELECT id FROM rooms ORDER BY id').all() as Array<{ id: string }>)
    .map(({ id }) => id)
  const headers = db.prepare(`
    SELECT replay.room_id, context.lifecycle, replay.latest_step_no, replay.schema_version
    FROM game_replays AS replay
    JOIN game_contexts AS context ON context.room_id = replay.room_id
    ORDER BY replay.room_id
  `).all() as ReplayHeaderRow[]
  const steps = db.prepare(`
    SELECT room_id, step_no, checkpoint_step_no, payload_kind, payload_gzip, frame_hash
    FROM game_replay_steps
    ORDER BY room_id, step_no
  `).all() as ReplayStepRow[]
  const stepsByRoom = new Map<string, ReplayStepRow[]>()
  for (const step of steps) {
    const roomSteps = stepsByRoom.get(step.room_id) ?? []
    roomSteps.push(step)
    stepsByRoom.set(step.room_id, roomSteps)
  }
  const replayRoomIds = new Set(headers.map(({ room_id }) => room_id))
  for (const roomId of stepsByRoom.keys()) {
    if (!replayRoomIds.has(roomId)) throw new Error(`orphan replay steps: ${roomId}`)
  }
  let replaySegmentCount = 0
  for (const header of headers) {
    replaySegmentCount += validateReplay(
      header,
      stepsByRoom.get(header.room_id) ?? [],
    )
  }
  return {
    formatVersion: 1,
    ...metadata,
    databaseSchemaVersion,
    replaySchemaVersions: [...new Set(headers.map(({ schema_version }) => schema_version))].sort((a, b) => a - b),
    roomCount: roomIds.length,
    replayCount: headers.length,
    replayHeadCount: validateRooms(db, roomIds),
    replaySegmentCount,
    replayStepCount: steps.length,
  }
}

const requiredEnv = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export const runBackupValidation = (
  env: NodeJS.ProcessEnv = process.env,
): BackupValidationReport => {
  const db = new Database(requiredEnv(env, 'DB_PATH'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    return validateBackupDatabase(db, {
      backupStem: requiredEnv(env, 'BACKUP_STEM'),
      createdAt: requiredEnv(env, 'BACKUP_CREATED_AT'),
      sourceBuildId: requiredEnv(env, 'SOURCE_BUILD_ID'),
      targetBuildId: requiredEnv(env, 'TARGET_BUILD_ID'),
      targetRef: requiredEnv(env, 'TARGET_REF'),
    })
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
