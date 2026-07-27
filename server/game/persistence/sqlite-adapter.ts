import type Database from 'better-sqlite3'
import type {
  GameResult,
  RoomCompletionResult,
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RoomStatus,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/session/serialization.ts'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'

type RoomRow = {
  id: string
  created_by: string | null
  state_json: string | null
  max_players: number
  status: string
  version: number
  custom_card_ids: string | null
  custom_cards_runtime_json: string | null
  replay_recording: number | null
  replay_viewer_build_id: string | null
  replay_game_build_id: string | null
  enable_parent_cards: number
  draft_parents: number | null
  enable_through_the_seasons: number
  enable_farmers_of_the_moor: number
  allow_incomplete_farmers_of_the_moor_minor_deal: number
  started_at: number | null
  updated_at: number
}

type RestorableRoomRow = RoomRow & {
  player_user_id: string | null
  player_index: number | null
}

type SqliteDb = Pick<Database.Database, 'prepare' | 'transaction'>

export type ReplayCommit = {
  roomId: string
  serialized: SerializedGameState
  meta: RoomMeta
  header?: {
    schemaVersion: number
    viewerBuildId: string
    gameBuildId: string
    missingPrefix: boolean
    customCardsJson: string
  }
  step: {
    stepNo: number
    roomVersion: number
    checkpointStepNo: number
    playerIndex: number | null
    commandType: string
    intentJson: string
    payloadKind: 'checkpoint' | 'delta'
    payloadGzip: Buffer
    frameHash: string
    createdAt: number
  }
  result?: GameResult
}

export type ReplayCommitResult =
  | { kind: 'committed' }
  | { kind: 'idempotent' }
  | { kind: 'conflict'; error: string }

export type ReplayHead = {
  schemaVersion: number
  viewerBuildId: string
  gameBuildId: string
  status: 'recording' | 'completed'
  latestStepNo: number
  roomVersion: number
  checkpointStepNo: number
  frameHash: string
  missingPrefix: boolean
}

type ReplayHeaderRow = {
  schema_version: number
  viewer_build_id: string
  game_build_id: string
  status: 'recording' | 'completed'
  latest_step_no: number
  missing_prefix: number
}

type ReplayHeadRow = ReplayHeaderRow & {
  room_version: number
  checkpoint_step_no: number
  frame_hash: string
}

type ReplayStepHashRow = { frame_hash: string }
type ReplayCustomCardsRow = { custom_cards_json: string }

class ReplayConflictError extends Error {}
const REPLAY_ASSET_URL_PATTERN = /^\/replay-assets\/([a-f0-9]{64})$/

const parseCustomCardDbIds = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const parseCustomCards = (raw: string): CustomCardData[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as CustomCardData[] : []
  } catch {
    return []
  }
}

const toStatus = (raw: string): RoomStatus =>
  raw === 'playing' || raw === 'finished' || raw === 'waiting' ? raw : 'waiting'

const roomValues = (
  id: string,
  serialized: SerializedGameState | null,
  meta: RoomMeta,
  now: number,
  version: number | null,
): Record<string, string | number | null> => ({
  id,
  createdBy: meta.createdBy,
  stateJson: serialized === null ? null : JSON.stringify(serialized),
  maxPlayers: meta.maxPlayers,
  status: meta.status,
  version,
  customCardIds: JSON.stringify(meta.customCardDbIds),
  customCards: meta.customCards === undefined ? null : JSON.stringify(meta.customCards),
  replayRecording: meta.replayRecording === undefined ? null : (meta.replayRecording ? 1 : 0),
  replayViewerBuildId: meta.replayViewerBuildId ?? null,
  replayGameBuildId: meta.replayGameBuildId ?? null,
  enableParentCards: meta.enableParentCards === true ? 1 : 0,
  draftParents: typeof meta.draftParents === 'boolean' ? (meta.draftParents ? 1 : 0) : null,
  enableThroughTheSeasons: meta.enableThroughTheSeasons === true ? 1 : 0,
  enableFarmersOfTheMoor: meta.enableFarmersOfTheMoor === true ? 1 : 0,
  allowIncompleteFarmersOfTheMoorMinorDeal:
    meta.allowIncompleteFarmersOfTheMoorMinorDeal === true ? 1 : 0,
  startedAt: meta.startedAt ?? null,
  now,
})

const toSnapshot = (
  row: RoomRow,
  players: RoomMeta['players'],
): RoomSnapshot => ({
  id: row.id,
  serialized: row.state_json ? (JSON.parse(row.state_json) as SerializedGameState) : null,
  meta: {
    createdBy: row.created_by,
    startedAt: row.started_at,
    maxPlayers: row.max_players,
    customCardDbIds: parseCustomCardDbIds(row.custom_card_ids),
    ...(row.custom_cards_runtime_json === null
      ? {}
      : { customCards: parseCustomCards(row.custom_cards_runtime_json) }),
    ...(row.replay_recording === null
      ? {}
      : { replayRecording: row.replay_recording === 1 }),
    ...(row.replay_viewer_build_id === null
      ? {}
      : { replayViewerBuildId: row.replay_viewer_build_id }),
    ...(row.replay_game_build_id === null
      ? {}
      : { replayGameBuildId: row.replay_game_build_id }),
    enableParentCards: row.enable_parent_cards === 1,
    draftParents: row.draft_parents === null ? undefined : row.draft_parents === 1,
    enableThroughTheSeasons: row.enable_through_the_seasons === 1,
    enableFarmersOfTheMoor: row.enable_farmers_of_the_moor === 1,
    allowIncompleteFarmersOfTheMoorMinorDeal: row.allow_incomplete_farmers_of_the_moor_minor_deal === 1,
    status: toStatus(row.status),
    players,
  },
  updatedAt: row.updated_at,
})

export class SqliteRoomPersistence implements RoomPersistence {
  private readonly loadRoom
  private readonly loadPlayers
  private readonly upsertRoom
  private readonly upsertPlayer
  private readonly clearReplacedSeat
  private readonly deleteRoom
  private readonly findRoomId
  private readonly findResult
  private readonly insertResult
  private readonly insertResultPlayer
  private readonly pruneRooms
  private readonly restoreRooms
  private readonly upsertActiveContext
  private readonly loadReplayHeader
  private readonly loadReplayHeadRow
  private readonly loadReplayStepHash
  private readonly listReplayCustomCards
  private readonly insertReplayHeader
  private readonly insertReplayStep
  private readonly advanceReplay
  private readonly completeReplay
  private readonly completeContext
  private readonly completeLegacyContext
  private readonly saveRoom
  private readonly completeRoom
  private readonly commitReplayTransaction

  constructor(db: SqliteDb) {
    this.loadRoom = db.prepare(
      `SELECT id, created_by, state_json, max_players, status, version, custom_card_ids,
              custom_cards_runtime_json,
              replay_recording, replay_viewer_build_id, replay_game_build_id,
              enable_parent_cards, draft_parents, enable_through_the_seasons, enable_farmers_of_the_moor,
              allow_incomplete_farmers_of_the_moor_minor_deal, started_at, updated_at
       FROM rooms WHERE id = ?`,
    )
    this.loadPlayers = db.prepare(
      'SELECT user_id AS userId, player_index AS playerIndex FROM room_players WHERE room_id = ? ORDER BY player_index',
    )
    this.upsertRoom = db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, max_players, status, version, custom_card_ids,
        custom_cards_runtime_json,
        replay_recording, replay_viewer_build_id, replay_game_build_id,
        enable_parent_cards, draft_parents, enable_through_the_seasons, enable_farmers_of_the_moor,
        allow_incomplete_farmers_of_the_moor_minor_deal, started_at, created_at, updated_at
      ) VALUES (
        @id, @createdBy, @stateJson, @maxPlayers, @status, COALESCE(@version, 1), @customCardIds,
        @customCards,
        @replayRecording, @replayViewerBuildId, @replayGameBuildId,
        @enableParentCards, @draftParents, @enableThroughTheSeasons, @enableFarmersOfTheMoor,
        @allowIncompleteFarmersOfTheMoorMinorDeal, @startedAt, @now, @now
      )
      ON CONFLICT(id) DO UPDATE SET
        state_json = COALESCE(excluded.state_json, rooms.state_json),
        status = excluded.status,
        custom_card_ids = excluded.custom_card_ids,
        custom_cards_runtime_json = COALESCE(rooms.custom_cards_runtime_json, excluded.custom_cards_runtime_json),
        replay_recording = COALESCE(rooms.replay_recording, excluded.replay_recording),
        replay_viewer_build_id = COALESCE(rooms.replay_viewer_build_id, excluded.replay_viewer_build_id),
        replay_game_build_id = COALESCE(rooms.replay_game_build_id, excluded.replay_game_build_id),
        enable_parent_cards = excluded.enable_parent_cards,
        draft_parents = excluded.draft_parents,
        enable_through_the_seasons = excluded.enable_through_the_seasons,
        enable_farmers_of_the_moor = excluded.enable_farmers_of_the_moor,
        allow_incomplete_farmers_of_the_moor_minor_deal = excluded.allow_incomplete_farmers_of_the_moor_minor_deal,
        started_at = COALESCE(rooms.started_at, excluded.started_at),
        version = COALESCE(@version, rooms.version + 1),
        updated_at = excluded.updated_at
    `)
    this.upsertPlayer = db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES (@roomId, @userId, @playerIndex, @now)
      ON CONFLICT(room_id, user_id) DO UPDATE SET
        player_index = excluded.player_index
    `)
    this.clearReplacedSeat = db.prepare(`
      DELETE FROM room_players
      WHERE room_id = @roomId AND player_index = @playerIndex AND user_id != @userId
    `)
    this.deleteRoom = db.prepare('DELETE FROM rooms WHERE id = ?')
    this.findRoomId = db.prepare(`
      SELECT id FROM rooms WHERE id = ?
      UNION ALL
      SELECT room_id AS id FROM game_results WHERE room_id = ?
      UNION ALL
      SELECT room_id AS id FROM game_contexts WHERE room_id = ?
      LIMIT 1
    `)
    this.findResult = db.prepare('SELECT room_id FROM game_results WHERE room_id = ?')
    this.insertResult = db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards, enable_through_the_seasons, enable_farmers_of_the_moor
      ) VALUES (
        @roomId, @startedAt, @finishedAt, @roundsPlayed, @playerCount,
        @communityDeck, @parentCards, @throughTheSeasons, @farmersOfTheMoor
      )
    `)
    this.insertResultPlayer = db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      ) VALUES (
        @roomId, @playerIndex, @gamePlayerId, @userId, @displayName, @score
      )
    `)
    this.pruneRooms = db.prepare(`
      DELETE FROM rooms
      WHERE status != 'finished'
        AND EXISTS (
          SELECT 1
          FROM game_contexts
          WHERE game_contexts.room_id = rooms.id
            AND game_contexts.lifecycle = 'active'
            AND game_contexts.expires_at IS NOT NULL
            AND game_contexts.expires_at <= ?
        )
        AND id NOT IN (SELECT value FROM json_each(?))
    `)
    this.restoreRooms = db.prepare(`
      SELECT rooms.id, rooms.created_by, rooms.state_json, rooms.max_players, rooms.status,
             rooms.version, rooms.custom_card_ids, rooms.custom_cards_runtime_json,
             rooms.replay_recording, rooms.replay_viewer_build_id, rooms.replay_game_build_id,
             rooms.enable_parent_cards, rooms.draft_parents,
             rooms.enable_through_the_seasons, rooms.enable_farmers_of_the_moor,
             rooms.allow_incomplete_farmers_of_the_moor_minor_deal, rooms.started_at, rooms.updated_at,
             room_players.user_id AS player_user_id, room_players.player_index
      FROM rooms
      JOIN game_contexts
        ON game_contexts.room_id = rooms.id
       AND game_contexts.lifecycle = 'active'
      LEFT JOIN room_players ON room_players.room_id = rooms.id
      WHERE rooms.status != 'finished'
        AND rooms.id NOT IN (SELECT value FROM json_each(?))
      ORDER BY rooms.id, room_players.player_index
    `)
    this.upsertActiveContext = db.prepare(`
      INSERT INTO game_contexts (
        room_id, lifecycle, phase, replay_status, expires_at, removal_reason, created_at, updated_at
      ) VALUES (
        @roomId, 'active', @phase, NULL, NULL, NULL, @now, @now
      )
      ON CONFLICT(room_id) DO UPDATE SET
        phase = excluded.phase,
        updated_at = excluded.updated_at
      WHERE game_contexts.lifecycle = 'active'
    `)
    this.loadReplayHeader = db.prepare(`
      SELECT schema_version, viewer_build_id, game_build_id, status, latest_step_no, missing_prefix
      FROM game_replays
      WHERE room_id = ?
    `)
    this.listReplayCustomCards = db.prepare(`
      SELECT custom_cards_json FROM game_replays
    `)
    this.loadReplayHeadRow = db.prepare(`
      SELECT replay.schema_version, replay.viewer_build_id, replay.game_build_id,
             replay.status, replay.latest_step_no, replay.missing_prefix,
             step.room_version, step.checkpoint_step_no, step.frame_hash
      FROM game_replays replay
      JOIN game_replay_steps step
        ON step.room_id = replay.room_id AND step.step_no = replay.latest_step_no
      WHERE replay.room_id = ?
    `)
    this.loadReplayStepHash = db.prepare(`
      SELECT frame_hash FROM game_replay_steps WHERE room_id = ? AND step_no = ?
    `)
    this.insertReplayHeader = db.prepare(`
      INSERT INTO game_replays (
        room_id, schema_version, viewer_build_id, game_build_id, status,
        latest_step_no, missing_prefix, custom_cards_json, created_at, completed_at
      ) VALUES (
        @roomId, @schemaVersion, @viewerBuildId, @gameBuildId, 'recording',
        -1, @missingPrefix, @customCardsJson, @createdAt, NULL
      )
      ON CONFLICT(room_id) DO NOTHING
    `)
    this.insertReplayStep = db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (
        @roomId, @stepNo, @roomVersion, @checkpointStepNo, @playerIndex,
        @commandType, @intentJson, @payloadKind, @payloadGzip, @frameHash, @createdAt
      )
    `)
    this.advanceReplay = db.prepare(`
      UPDATE game_replays
      SET latest_step_no = @stepNo
      WHERE room_id = @roomId AND status = 'recording' AND latest_step_no = @previousStepNo
    `)
    this.completeReplay = db.prepare(`
      UPDATE game_replays
      SET status = 'completed', completed_at = @completedAt
      WHERE room_id = @roomId AND status = 'recording'
    `)
    this.completeContext = db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed',
          phase = NULL,
          replay_status = 'available',
          expires_at = NULL,
          removal_reason = NULL,
          updated_at = @completedAt
      WHERE room_id = @roomId
    `)
    this.completeLegacyContext = db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed',
          phase = NULL,
          replay_status = 'legacy_no_replay',
          expires_at = NULL,
          removal_reason = NULL,
          updated_at = @completedAt
      WHERE room_id = @roomId
    `)
    const savePlayers = (
      roomId: string,
      now: number,
      players: RoomMeta['players'],
    ): void => {
      for (const player of players) {
        const seat = {
          roomId,
          userId: player.userId,
          playerIndex: player.playerIndex,
          now,
        }
        this.clearReplacedSeat.run(seat)
        this.upsertPlayer.run(seat)
      }
    }
    const saveResult = (result: GameResult): void => {
      const persistedPlayers = this.loadPlayers.all(result.roomId) as RoomMeta['players']
      const userIds = new Map(persistedPlayers.map((player) => [player.playerIndex, player.userId]))
      this.insertResult.run({
        ...result,
        communityDeck: result.communityDeck ? 1 : 0,
        parentCards: result.parentCards ? 1 : 0,
        throughTheSeasons: result.throughTheSeasons ? 1 : 0,
        farmersOfTheMoor: result.farmersOfTheMoor ? 1 : 0,
      })
      for (const player of result.players) {
        this.insertResultPlayer.run({
          ...player,
          roomId: result.roomId,
          userId: userIds.get(player.playerIndex) ?? player.userId,
        })
      }
    }
    this.saveRoom = db.transaction((
      values: Record<string, string | number | null>,
      players: RoomMeta['players'],
    ) => {
      this.upsertActiveContext.run({
        roomId: values.id,
        phase: values.status === 'waiting' ? 'waiting' : 'playing',
        now: values.now,
      })
      this.upsertRoom.run(values)
      savePlayers(String(values.id), Number(values.now), players)
    })
    this.completeRoom = db.transaction((result: GameResult) => {
      if (this.findResult.get(result.roomId)) {
        this.deleteRoom.run(result.roomId)
        return
      }
      saveResult(result)
      this.completeLegacyContext.run({ roomId: result.roomId, completedAt: result.finishedAt })
      this.deleteRoom.run(result.roomId)
    })
    this.commitReplayTransaction = db.transaction((commit: ReplayCommit): ReplayCommitResult => {
      const existingStep = this.loadReplayStepHash.get(
        commit.roomId,
        commit.step.stepNo,
      ) as ReplayStepHashRow | undefined
      if (existingStep) {
        return existingStep.frame_hash === commit.step.frameHash
          ? { kind: 'idempotent' }
          : {
              kind: 'conflict',
              error: `replay hash conflict at ${commit.roomId} step ${commit.step.stepNo}`,
            }
      }

      this.upsertActiveContext.run({
        roomId: commit.roomId,
        phase: commit.meta.status === 'waiting' ? 'waiting' : 'playing',
        now: commit.step.createdAt,
      })
      if (commit.header) {
        this.insertReplayHeader.run({
          roomId: commit.roomId,
          ...commit.header,
          missingPrefix: commit.header.missingPrefix ? 1 : 0,
          createdAt: commit.step.createdAt,
        })
      }
      const header = this.loadReplayHeader.get(commit.roomId) as ReplayHeaderRow | undefined
      if (!header) {
        throw new ReplayConflictError(`replay header missing for ${commit.roomId}`)
      }
      if (
        commit.header &&
        (
          header.schema_version !== commit.header.schemaVersion ||
          header.viewer_build_id !== commit.header.viewerBuildId ||
          header.game_build_id !== commit.header.gameBuildId ||
          header.missing_prefix !== (commit.header.missingPrefix ? 1 : 0)
        )
      ) {
        throw new ReplayConflictError(`replay header conflict for ${commit.roomId}`)
      }
      if (header.status !== 'recording' || header.latest_step_no !== commit.step.stepNo - 1) {
        throw new ReplayConflictError(
          `replay sequence conflict at ${commit.roomId} step ${commit.step.stepNo}`,
        )
      }

      const values = roomValues(
        commit.roomId,
        commit.serialized,
        commit.meta,
        commit.step.createdAt,
        commit.step.roomVersion,
      )
      this.upsertRoom.run(values)
      savePlayers(commit.roomId, commit.step.createdAt, commit.meta.players)
      this.insertReplayStep.run({ roomId: commit.roomId, ...commit.step })
      const advanced = this.advanceReplay.run({
        roomId: commit.roomId,
        stepNo: commit.step.stepNo,
        previousStepNo: commit.step.stepNo - 1,
      })
      if (advanced.changes !== 1) {
        throw new ReplayConflictError(
          `replay sequence conflict at ${commit.roomId} step ${commit.step.stepNo}`,
        )
      }
      if (commit.result) {
        if (!this.findResult.get(commit.roomId)) saveResult(commit.result)
        this.completeReplay.run({
          roomId: commit.roomId,
          completedAt: commit.result.finishedAt,
        })
        this.completeContext.run({
          roomId: commit.roomId,
          completedAt: commit.result.finishedAt,
        })
        this.deleteRoom.run(commit.roomId)
      }
      return { kind: 'committed' }
    })
  }

  load(id: string): RoomSnapshot | null {
    try {
      const row = this.loadRoom.get(id) as RoomRow | undefined
      if (!row) return null
      const players = this.loadPlayers.all(id) as RoomMeta['players']
      return toSnapshot(row, players)
    } catch (err) {
      console.warn('[sqlite-adapter] load failed:', err)
      return null
    }
  }

  save(id: string, serialized: SerializedGameState | null, meta: RoomMeta): void {
    const now = Date.now()
    this.saveRoom(roomValues(id, serialized, meta, now, null), meta.players)
  }

  commitReplay(commit: ReplayCommit): ReplayCommitResult {
    try {
      return this.commitReplayTransaction(commit)
    } catch (error) {
      if (error instanceof ReplayConflictError) {
        return { kind: 'conflict', error: error.message }
      }
      throw error
    }
  }

  loadReplayHead(id: string): ReplayHead | null {
    const row = this.loadReplayHeadRow.get(id) as ReplayHeadRow | undefined
    if (!row) return null
    return {
      schemaVersion: row.schema_version,
      viewerBuildId: row.viewer_build_id,
      gameBuildId: row.game_build_id,
      status: row.status,
      latestStepNo: row.latest_step_no,
      roomVersion: row.room_version,
      checkpointStepNo: row.checkpoint_step_no,
      frameHash: row.frame_hash,
      missingPrefix: row.missing_prefix === 1,
    }
  }

  referencedReplayAssetHashes(): Set<string> {
    const hashes = new Set<string>()
    const rows = this.listReplayCustomCards.all() as ReplayCustomCardsRow[]
    for (const row of rows) {
      const definitions = JSON.parse(row.custom_cards_json) as unknown
      if (!Array.isArray(definitions)) throw new Error('invalid replay custom card archive')
      for (const definition of definitions) {
        if (!definition || typeof definition !== 'object') continue
        const artUrl = (definition as { artUrl?: unknown }).artUrl
        if (typeof artUrl !== 'string') continue
        const match = REPLAY_ASSET_URL_PATTERN.exec(artUrl)
        if (match) hashes.add(match[1]!)
      }
    }
    return hashes
  }

  discard(id: string): void {
    try {
      this.deleteRoom.run(id)
    } catch (err) {
      console.warn('[sqlite-adapter] discard failed:', err)
    }
  }

  complete(result: GameResult): RoomCompletionResult {
    try {
      this.completeRoom(result)
      return { ok: true, archived: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.warn('[sqlite-adapter] completion failed:', err)
      return { ok: false, error }
    }
  }

  hasRoomId(id: string): boolean {
    try {
      return this.findRoomId.get(id, id, id) !== undefined
    } catch (err) {
      console.warn('[sqlite-adapter] room id lookup failed:', err)
      return true
    }
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    try {
      this.pruneStale(opts)
      const excludeIds = opts.excludeIds ?? []
      const rows = this.restoreRooms.all(JSON.stringify(excludeIds)) as RestorableRoomRow[]
      const groupedRows = new Map<string, { row: RoomRow; players: RoomMeta['players'] }>()
      for (const row of rows) {
        const group = groupedRows.get(row.id) ?? { row, players: [] }
        if (row.player_user_id !== null && row.player_index !== null) {
          group.players.push({
            userId: row.player_user_id,
            playerIndex: row.player_index,
          })
        }
        groupedRows.set(row.id, group)
      }
      const snapshots: RoomSnapshot[] = []
      for (const { row, players } of groupedRows.values()) {
        try {
          snapshots.push(toSnapshot(row, players))
        } catch (err) {
          console.warn(`[sqlite-adapter] failed to restore room ${row.id}:`, err)
        }
      }
      return snapshots
    } catch (err) {
      console.warn('[sqlite-adapter] listRestorable failed:', err)
      return []
    }
  }

  private pruneStale(opts: RestoreOptions): void {
    try {
      const excludeIds = opts.excludeIds ?? []
      this.pruneRooms.run(opts.now, JSON.stringify(excludeIds))
    } catch (err) {
      console.warn('[sqlite-adapter] pruneStale failed:', err)
    }
  }
}
