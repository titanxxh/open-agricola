import type { PostgresDatabase } from '../database/postgres'

export const PRERELEASE_ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
type Database = Pick<PostgresDatabase, 'prepare'>

/** Reads use one durable snapshot of lifecycle and ending, never an access/update time. */
export async function prereleaseArchiveReadState(db: Database, roomId: string, now: () => number = Date.now) {
  if (process.env.RELEASE_CHANNEL !== 'prerelease') return undefined
  const row = await db.prepare(`SELECT c.lifecycle, c.removal_reason, (
      SELECT MIN(ended_at) FROM (
        SELECT finished_at AS ended_at FROM game_results WHERE room_id=c.room_id
        UNION ALL SELECT ended_at FROM game_terminations WHERE room_id=c.room_id
        UNION ALL SELECT completed_at AS ended_at FROM game_replays WHERE room_id=c.room_id
      ) endings
    ) AS ended_at FROM game_contexts c WHERE c.room_id=?`).get<{ lifecycle: string; removal_reason: string | null; ended_at: number | null }>(roomId)
  if (!row) return undefined
  return { lifecycle: row.lifecycle, removalReason: row.removal_reason, endedAt: row.ended_at,
    expired: ['completed','terminated','removed'].includes(row.lifecycle)
      && row.ended_at !== null && now() >= row.ended_at + PRERELEASE_ARCHIVE_RETENTION_MS }
}

export async function prereleaseArchiveExpired(db: Database, roomId: string, now: () => number = Date.now): Promise<boolean> {
  return (await prereleaseArchiveReadState(db, roomId, now))?.expired ?? false
}
