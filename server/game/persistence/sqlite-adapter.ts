import type Database from 'better-sqlite3'
import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RoomStatus,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/game/serialization.ts'

type RoomRow = {
  id: string
  created_by: string | null
  state_json: string | null
  max_players: number
  status: string
  version: number
  custom_card_ids: string | null
  updated_at: number
}

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

export class SqliteRoomPersistence implements RoomPersistence {
  constructor(private readonly db: Pick<Database.Database, 'prepare'>) {}

  load(id: string): RoomSnapshot | null {
    const row = this.db.prepare(
      'SELECT id, created_by, state_json, max_players, status, version, custom_card_ids, updated_at FROM rooms WHERE id = ?',
    ).get(id) as RoomRow | undefined
    if (!row) return null
    const players = this.db.prepare(
      'SELECT user_id AS userId, player_index AS playerIndex FROM room_players WHERE room_id = ? ORDER BY player_index',
    ).all(id) as Array<{ userId: string; playerIndex: number }>
    return {
      id: row.id,
      serialized: row.state_json ? (JSON.parse(row.state_json) as SerializedGameState) : null,
      meta: {
        createdBy: row.created_by,
        maxPlayers: row.max_players,
        customCardDbIds: parseCustomCardDbIds(row.custom_card_ids),
        status: toStatus(row.status),
        players,
      },
      updatedAt: row.updated_at,
    }
  }

  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void {
    const now = Date.now()
    const stateJson = JSON.stringify(serialized)
    const customCardIdsJson = JSON.stringify(meta.customCardDbIds)
    const existing = this.db.prepare('SELECT id FROM rooms WHERE id = ?').get(id)
    if (existing) {
      this.db.prepare(
        'UPDATE rooms SET state_json = ?, status = ?, custom_card_ids = ?, version = version + 1, updated_at = ? WHERE id = ?',
      ).run(stateJson, meta.status, customCardIdsJson, now, id)
    } else {
      this.db.prepare(
        'INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      ).run(id, meta.createdBy, stateJson, meta.maxPlayers, meta.status, customCardIdsJson, now, now)
    }
    for (const p of meta.players) {
      const exists = this.db.prepare(
        'SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?',
      ).get(id, p.userId)
      if (!exists) {
        this.db.prepare(
          'INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)',
        ).run(id, p.userId, p.playerIndex, now)
      }
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  }

  markFinished(id: string, now: number): void {
    this.db.prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?").run(now, id)
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    this.pruneStale(opts)
    const excludeIds = opts.excludeIds ?? []
    const placeholders = excludeIds.length > 0 ? excludeIds.map(() => '?').join(', ') : "''"
    const rows = this.db.prepare(
      `SELECT id, created_by, state_json, max_players, status, version, custom_card_ids, updated_at
       FROM rooms WHERE status != 'finished' AND id NOT IN (${placeholders})`,
    ).all(...excludeIds) as RoomRow[]
    return rows
      .map((row) => this.load(row.id))
      .filter((s): s is RoomSnapshot => s !== null)
  }

  private pruneStale(opts: RestoreOptions): void {
    const excludeIds = opts.excludeIds ?? []
    const placeholders = excludeIds.length > 0 ? excludeIds.map(() => '?').join(', ') : "''"
    const staleWaiting = opts.now - opts.waitingTtlMs
    const stalePlaying = opts.now - opts.playingTtlMs
    this.db.prepare(
      `UPDATE rooms
       SET status = 'finished', updated_at = ?
       WHERE status != 'finished'
         AND (
           (status = 'playing' AND updated_at < ?)
           OR (status != 'playing' AND updated_at < ?)
         )
         AND id NOT IN (${placeholders})`,
    ).run(opts.now, stalePlaying, staleWaiting, ...excludeIds)
  }
}
