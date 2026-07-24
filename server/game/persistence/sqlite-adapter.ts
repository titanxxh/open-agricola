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

type RoomRow = {
  id: string
  created_by: string | null
  state_json: string | null
  max_players: number
  status: string
  version: number
  custom_card_ids: string | null
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

const parseCustomCardDbIds = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const toStatus = (raw: string): RoomStatus =>
  raw === 'playing' || raw === 'finished' || raw === 'waiting' ? raw : 'waiting'

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
  private readonly saveRoom
  private readonly completeRoom

  constructor(db: SqliteDb) {
    this.loadRoom = db.prepare(
      `SELECT id, created_by, state_json, max_players, status, version, custom_card_ids,
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
        enable_parent_cards, draft_parents, enable_through_the_seasons, enable_farmers_of_the_moor,
        allow_incomplete_farmers_of_the_moor_minor_deal, started_at, created_at, updated_at
      ) VALUES (
        @id, @createdBy, @stateJson, @maxPlayers, @status, 1, @customCardIds,
        @enableParentCards, @draftParents, @enableThroughTheSeasons, @enableFarmersOfTheMoor,
        @allowIncompleteFarmersOfTheMoorMinorDeal, @startedAt, @now, @now
      )
      ON CONFLICT(id) DO UPDATE SET
        state_json = COALESCE(excluded.state_json, rooms.state_json),
        status = excluded.status,
        custom_card_ids = excluded.custom_card_ids,
        enable_parent_cards = excluded.enable_parent_cards,
        draft_parents = excluded.draft_parents,
        enable_through_the_seasons = excluded.enable_through_the_seasons,
        enable_farmers_of_the_moor = excluded.enable_farmers_of_the_moor,
        allow_incomplete_farmers_of_the_moor_minor_deal = excluded.allow_incomplete_farmers_of_the_moor_minor_deal,
        started_at = COALESCE(rooms.started_at, excluded.started_at),
        version = rooms.version + 1,
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
        AND (
          (status = 'playing' AND updated_at < ?)
          OR (status != 'playing' AND updated_at < ?)
        )
        AND id NOT IN (SELECT value FROM json_each(?))
    `)
    this.restoreRooms = db.prepare(`
      SELECT rooms.id, rooms.created_by, rooms.state_json, rooms.max_players, rooms.status,
             rooms.version, rooms.custom_card_ids, rooms.enable_parent_cards, rooms.draft_parents,
             rooms.enable_through_the_seasons, rooms.enable_farmers_of_the_moor,
             rooms.allow_incomplete_farmers_of_the_moor_minor_deal, rooms.started_at, rooms.updated_at,
             room_players.user_id AS player_user_id, room_players.player_index
      FROM rooms
      LEFT JOIN room_players ON room_players.room_id = rooms.id
      WHERE rooms.status != 'finished'
        AND rooms.id NOT IN (SELECT value FROM json_each(?))
      ORDER BY rooms.id, room_players.player_index
    `)
    this.saveRoom = db.transaction((
      values: Record<string, string | number | null>,
      players: RoomMeta['players'],
    ) => {
      this.upsertRoom.run(values)
      for (const player of players) {
        const seat = {
          roomId: values.id,
          userId: player.userId,
          playerIndex: player.playerIndex,
          now: values.now,
        }
        this.clearReplacedSeat.run(seat)
        this.upsertPlayer.run(seat)
      }
    })
    this.completeRoom = db.transaction((result: GameResult) => {
      if (this.findResult.get(result.roomId)) {
        this.deleteRoom.run(result.roomId)
        return
      }
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
      this.deleteRoom.run(result.roomId)
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
    const stateJson = serialized === null ? null : JSON.stringify(serialized)
    const customCardIdsJson = JSON.stringify(meta.customCardDbIds)
    const enableParentCards = meta.enableParentCards === true ? 1 : 0
    const draftParents = typeof meta.draftParents === 'boolean' ? (meta.draftParents ? 1 : 0) : null
    const enableThroughTheSeasons = meta.enableThroughTheSeasons === true ? 1 : 0
    const enableFarmersOfTheMoor = meta.enableFarmersOfTheMoor === true ? 1 : 0
    const allowIncompleteFarmersOfTheMoorMinorDeal = meta.allowIncompleteFarmersOfTheMoorMinorDeal === true ? 1 : 0
    this.saveRoom({
      id,
      createdBy: meta.createdBy,
      stateJson,
      maxPlayers: meta.maxPlayers,
      status: meta.status,
      customCardIds: customCardIdsJson,
      enableParentCards,
      draftParents,
      enableThroughTheSeasons,
      enableFarmersOfTheMoor,
      allowIncompleteFarmersOfTheMoorMinorDeal,
      startedAt: meta.startedAt ?? null,
      now,
    }, meta.players)
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
      return this.findRoomId.get(id, id) !== undefined
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
      const staleWaiting = opts.now - opts.waitingTtlMs
      const stalePlaying = opts.now - opts.playingTtlMs
      this.pruneRooms.run(stalePlaying, staleWaiting, JSON.stringify(excludeIds))
    } catch (err) {
      console.warn('[sqlite-adapter] pruneStale failed:', err)
    }
  }
}
