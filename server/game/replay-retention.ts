import type { PostgresDatabase } from '../database/postgres'

/** ADR 0053: a Game Replay Archive stays public for seven days after its game ends. */
export const REPLAY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
/** Contexts marked per sweep; a backlog drains over successive hourly sweeps. */
export const REPLAY_RETENTION_BATCH = 100

/** Rooms whose replay payload is no longer public: expired unfinished games and expired archives. */
export const RETIRED_REPLAY_CONTEXTS = `SELECT room_id FROM game_contexts WHERE lifecycle = 'expired' OR replay_status = 'expired'`

/**
 * Marks completed and terminated games whose end is older than the retention
 * window. The result archive and termination record stay; the caller removes
 * the payload through the same Bug Report evidence rules as an expired game.
 */
export async function expireReplayArchives(
  db: PostgresDatabase,
  now: number,
  { retentionMs = REPLAY_RETENTION_MS, limit = REPLAY_RETENTION_BATCH }: { retentionMs?: number; limit?: number } = {},
): Promise<number> {
  const result = await db.prepare(`
    UPDATE game_contexts SET replay_status = 'expired', updated_at = ?
    WHERE replay_status = 'available' AND room_id IN (
      SELECT context.room_id
      FROM game_contexts AS context
      LEFT JOIN game_results AS result ON result.room_id = context.room_id
      LEFT JOIN game_terminations AS ending ON ending.room_id = context.room_id
      LEFT JOIN game_replays AS replay ON replay.room_id = context.room_id
      WHERE context.replay_status = 'available'
        AND context.lifecycle IN ('completed', 'terminated')
        AND COALESCE(result.finished_at, ending.ended_at, replay.completed_at) < ?
      ORDER BY context.room_id
      LIMIT ?
    )
  `).run(now, now - retentionMs, limit)
  return result.changes
}
