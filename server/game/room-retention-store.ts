import { parseRoomRetentionPolicy, type RoomRetentionPolicy, type RoomRetentionUpdate } from '../../shared/contract/room-retention'
import type { PostgresDatabase } from '../database/postgres'

const selectPolicy = `SELECT p.revision, p.waiting_days AS "waitingDays", p.playing_days AS "playingDays",
  p.updated_at AS "updatedAt", u.display_name AS "updatedBy"
  FROM room_retention_policy p LEFT JOIN users u ON u.id=p.updated_by_user_id WHERE p.singleton=TRUE`

export type RoomRetentionUpdateResult =
  | { kind: 'updated'; policy: RoomRetentionPolicy }
  | { kind: 'conflict'; policy: RoomRetentionPolicy }

export class RoomRetentionStore {
  private readonly db: Pick<PostgresDatabase, 'prepare' | 'transaction'>

  constructor(db: Pick<PostgresDatabase, 'prepare' | 'transaction'>) { this.db = db }

  async read(): Promise<RoomRetentionPolicy> {
    return parseRoomRetentionPolicy(await this.db.prepare(selectPolicy).get())
  }

  async update(input: RoomRetentionUpdate, actorUserId: string): Promise<RoomRetentionUpdateResult> {
    return this.db.transaction(async (): Promise<RoomRetentionUpdateResult> => {
      await this.db.prepare('SELECT singleton FROM room_retention_policy WHERE singleton=TRUE FOR UPDATE').get()
      const previous = await this.read()
      if (previous.revision !== input.expectedRevision) return { kind: 'conflict', policy: previous }
      const { now } = (await this.db.prepare('SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now').get<{ now: number }>())!
      await this.db.prepare(`UPDATE room_retention_policy SET revision=revision+1, waiting_days=?, playing_days=?,
        updated_at=?, updated_by_user_id=? WHERE singleton=TRUE`)
        .run(input.waitingDays, input.playingDays, now, actorUserId)
      await this.db.prepare(`INSERT INTO room_retention_policy_audit
        (revision, previous_revision, previous_waiting_days, previous_playing_days, waiting_days, playing_days, actor_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(previous.revision + 1, previous.revision, previous.waitingDays, previous.playingDays,
          input.waitingDays, input.playingDays, actorUserId, now)
      return { kind: 'updated', policy: await this.read() }
    })()
  }
}
