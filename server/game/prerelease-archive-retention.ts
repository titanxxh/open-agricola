import type { PostgresDatabase } from '../database/postgres'

export const PRERELEASE_ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
type Database = Pick<PostgresDatabase, 'prepare'>

/** Restores and reads use the original durable ending, never an access/update time. */
export async function prereleaseArchiveExpired(db: Database, roomId: string, now: () => number = Date.now): Promise<boolean> {
  if (process.env.RELEASE_CHANNEL !== 'prerelease') return false
  const row = await db.prepare(`SELECT c.lifecycle, (
      SELECT MIN(ended_at) FROM (
        SELECT finished_at AS ended_at FROM game_results WHERE room_id=c.room_id
        UNION ALL SELECT ended_at FROM game_terminations WHERE room_id=c.room_id
        UNION ALL SELECT completed_at AS ended_at FROM game_replays WHERE room_id=c.room_id
      ) endings
    ) AS ended_at FROM game_contexts c WHERE c.room_id=?`).get<{ lifecycle: string; ended_at: number | null }>(roomId)
  if (!row || !['completed', 'terminated', 'removed'].includes(row.lifecycle)) return false
  return row.ended_at !== null && now() >= row.ended_at + PRERELEASE_ARCHIVE_RETENTION_MS
}
