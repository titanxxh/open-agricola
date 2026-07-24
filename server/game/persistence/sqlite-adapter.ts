import type Database from 'better-sqlite3'
import type {
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
  private readonly deleteRoom
  private readonly finishRoom
  private readonly pruneRooms
  private readonly restoreRooms
  private readonly saveRoom

  constructor(db: SqliteDb) {
    this.loadRoom = db.prepare(
      `SELECT id, created_by, state_json, max_players, status, version, custom_card_ids,
              enable_parent_cards, draft_parents, enable_through_the_seasons, enable_farmers_of_the_moor,
              allow_incomplete_farmers_of_the_moor_minor_deal, updated_at
       FROM rooms WHERE id = ?`,
    )
    this.loadPlayers = db.prepare(
      'SELECT user_id AS userId, player_index AS playerIndex FROM room_players WHERE room_id = ? ORDER BY player_index',
    )
    this.upsertRoom = db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, max_players, status, version, custom_card_ids,
        enable_parent_cards, draft_parents, enable_through_the_seasons, enable_farmers_of_the_moor,
        allow_incomplete_farmers_of_the_moor_minor_deal, created_at, updated_at
      ) VALUES (
        @id, @createdBy, @stateJson, @maxPlayers, @status, 1, @customCardIds,
        @enableParentCards, @draftParents, @enableThroughTheSeasons, @enableFarmersOfTheMoor,
        @allowIncompleteFarmersOfTheMoorMinorDeal, @now, @now
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
        version = rooms.version + 1,
        updated_at = excluded.updated_at
    `)
    this.upsertPlayer = db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES (@roomId, @userId, @playerIndex, @now)
      ON CONFLICT(room_id, user_id) DO UPDATE SET
        player_index = excluded.player_index
    `)
    this.deleteRoom = db.prepare('DELETE FROM rooms WHERE id = ?')
    this.finishRoom = db.prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?")
    this.pruneRooms = db.prepare(`
      UPDATE rooms
      SET status = 'finished', updated_at = ?
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
             rooms.allow_incomplete_farmers_of_the_moor_minor_deal, rooms.updated_at,
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
        this.upsertPlayer.run({
          roomId: values.id,
          userId: player.userId,
          playerIndex: player.playerIndex,
          now: values.now,
        })
      }
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
      now,
    }, meta.players)
  }

  delete(id: string): void {
    try {
      this.deleteRoom.run(id)
    } catch (err) {
      console.warn('[sqlite-adapter] delete failed:', err)
    }
  }

  markFinished(id: string, now: number): void {
    try {
      this.finishRoom.run(now, id)
    } catch (err) {
      console.warn('[sqlite-adapter] markFinished failed:', err)
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
      this.pruneRooms.run(opts.now, stalePlaying, staleWaiting, JSON.stringify(excludeIds))
    } catch (err) {
      console.warn('[sqlite-adapter] pruneStale failed:', err)
    }
  }
}
