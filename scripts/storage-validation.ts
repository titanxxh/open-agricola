import type { PostgresDatabase } from '../server/database/postgres'
import type { ResourceStore } from '../server/storage/resource-store'
import { ReplayResources } from '../server/storage/replay-resources'
import { PostgresRoomPersistence } from '../server/game/persistence/postgres-adapter'
import { RoomCommitter } from '../server/game/room-committer'
import { snapshotToRoom } from '../server/game/room'
import { parseCustomCards, ReplayStore } from '../server/game/replay-store'
import { validateReplay, type ReplayHeaderRow, type ReplayStepRow } from './replay-integrity'

/** Read-only target-build verification. It never reconstructs active state from Replay. */
export async function validateStorage(db: PostgresDatabase, resources: ResourceStore) {
  const replayResources = new ReplayResources(resources)
  const persistence = new PostgresRoomPersistence(db)
  const committer = new RoomCommitter({ persistence, resources: replayResources, viewerBuildId: '', gameBuildId: '', viewerBuildExists: async id => !!await replayResources.viewer(id) })
  const rooms = await db.prepare('SELECT id FROM rooms ORDER BY id').all<{ id: string }>()
  const headers = await db.prepare(`SELECT replay.*, context.lifecycle, context.replay_status
    FROM game_replays replay JOIN game_contexts context ON context.room_id = replay.room_id ORDER BY replay.room_id`).all<ReplayHeaderRow>()
  let replayHeadCount = 0
  let replayStepCount = 0
  let replaySegmentCount = 0
  try {
    for (const { id } of rooms) {
      const snapshot = await persistence.load(id)
      if (!snapshot) throw new Error(`room snapshot unreadable: ${id}`)
      const room = snapshotToRoom(snapshot)
      try {
        if (room.snapshotRehydrationFailed) throw new Error(`room rehydration failed: ${id}`)
        const head = await persistence.loadReplayHead(id)
        if (!head && room.status !== 'waiting') throw new Error(`recorded room replay header is missing: ${id}`)
        const result = await committer.prepareRoom(room, { missingPrefix: true })
        if (result.kind === 'blocked') throw new Error(`room recovery failed: ${id}: ${result.error}`)
        if (head) replayHeadCount++
      } finally { room.customSessionExecutor?.dispose(); room.session.dispose() }
    }
  } finally { committer.shutdown() }
  const store = new ReplayStore(db)
  for (const header of headers) {
    parseCustomCards(header.custom_cards_json)
    if (!await replayResources.viewer(header.viewer_build_id)) throw new Error(`replay viewer unavailable: ${header.room_id}: ${header.viewer_build_id}`)
    if (header.lifecycle === 'active' && (header.replay_status !== null || header.status !== 'recording')) throw new Error(`replay metadata invalid: ${header.room_id}`)
    if (header.lifecycle === 'completed' && !(await store.manifest(header.room_id)).ok) throw new Error(`replay metadata invalid: ${header.room_id}`)
    const steps = await db.prepare('SELECT * FROM game_replay_steps WHERE room_id = ? ORDER BY step_no').all<ReplayStepRow>(header.room_id)
    const counts = validateReplay(header, steps)
    replayStepCount += counts.stepCount; replaySegmentCount += counts.segmentCount
    const cards = JSON.parse(header.custom_cards_json) as Array<{ artUrl?: string }>
    for (const card of cards) {
      if (!card.artUrl?.startsWith('/replay-assets/')) continue
      if (!await db.prepare("SELECT 1 FROM object_references WHERE owner_kind = 'replay' AND owner_id = ? AND object_key = ?").get(header.room_id, card.artUrl.slice(1))) throw new Error(`Missing Replay resource reference: ${header.room_id}`)
    }
  }
  // Validate every retained private object, including Viewer files that are not
  // the HTML entrypoint and Workshop generation candidates not yet adopted.
  const objects = await db.prepare("SELECT DISTINCT o.object_key FROM stored_objects o JOIN object_references r USING(object_key) WHERE NOT o.blocked").all<{ object_key: string }>()
  for (const { object_key: key } of objects) if (!await resources.read(key)) throw new Error(`retained resource unavailable: ${key}`)
  return { roomCount: rooms.length, replayCount: headers.length, replayHeadCount, replayStepCount, replaySegmentCount, retainedObjectCount: objects.length,
    replaySchemaVersions: [...new Set(headers.map(header => header.schema_version))].sort((a, b) => a - b) }
}
