import { PostgresDatabase } from './database/postgres'
import { migratePostgres } from './database/migrations'

let database: PostgresDatabase | undefined

export function getDb(): PostgresDatabase {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; start local dependencies with restart-local.sh')
    database = new PostgresDatabase({ connectionString: process.env.DATABASE_URL, schema: process.env.DATABASE_SCHEMA })
  }
  return database
}

export async function initializeDatabase(): Promise<void> {
  await migratePostgres(getDb())
  await assertStorageReady(getDb())
}

export async function assertStorageReady(db: PostgresDatabase): Promise<void> {
  if (await db.prepare("SELECT 1 FROM data_imports WHERE status != 'validated' LIMIT 1").get()) {
    throw new Error('Storage import has not passed validation; keep applications stopped and finish the controlled import')
  }
}

/** Clean up expired sessions and replay evidence periodically. */
export async function cleanExpiredSessions(db = getDb()): Promise<void> {
  const now = Date.now()
  ;(await db.transaction(async () => {
    await db.prepare('DELETE FROM request_rate_limits WHERE reset_at < ?').run(now)
    await db.prepare('DELETE FROM workshop_oauth_handshakes WHERE expires_at < ?').run(now)
    ;(await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now))
    ;(await db.prepare('DELETE FROM bug_report_attempts WHERE expires_at < ?').run(now))
    ;(await db.prepare(`
      DELETE FROM game_replay_steps
      WHERE room_id IN (
        SELECT room_id FROM game_contexts WHERE lifecycle = 'expired'
      )
        AND NOT EXISTS (
          SELECT 1
          FROM bug_reports AS report
          JOIN game_replay_steps AS anchor
            ON anchor.room_id = report.room_id
           AND anchor.step_no = report.step_no
          WHERE report.room_id = game_replay_steps.room_id
            AND report.evidence_expires_at > ?
            AND game_replay_steps.step_no
              BETWEEN anchor.checkpoint_step_no AND report.step_no
        )
    `).run(now))
    ;(await db.prepare(`
      UPDATE game_replays
      SET latest_step_no = (
        SELECT MAX(step_no)
        FROM game_replay_steps
        WHERE room_id = game_replays.room_id
      )
      WHERE room_id IN (
        SELECT room_id FROM game_contexts WHERE lifecycle = 'expired'
      )
        AND EXISTS (
          SELECT 1 FROM game_replay_steps
          WHERE room_id = game_replays.room_id
        )
    `).run())
    ;(await db.prepare(`
      DELETE FROM game_replays
      WHERE room_id IN (
        SELECT room_id FROM game_contexts WHERE lifecycle = 'expired'
      )
        AND NOT EXISTS (
          SELECT 1 FROM game_replay_steps
          WHERE room_id = game_replays.room_id
        )
    `).run())
    ;(await db.prepare(`
      DELETE FROM game_context_participants
      WHERE room_id IN (
        SELECT room_id FROM game_contexts WHERE lifecycle = 'expired'
      )
        AND NOT EXISTS (
          SELECT 1 FROM game_replays
          WHERE room_id = game_context_participants.room_id
        )
    `).run())
  })())
}
