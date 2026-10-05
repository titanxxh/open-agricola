import type { PostgresDatabase } from './postgres'

/** One atomic shared fixed-window counter; rejected requests do not extend the window. */
export async function consumeRateLimit(
  db: Pick<PostgresDatabase, 'prepare'>,
  scope: string,
  subject: string,
  maximum: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ allowed: boolean; resetAt: number }> {
  const row = await db.prepare(`
    INSERT INTO request_rate_limits (scope, subject, count, reset_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (scope, subject) DO UPDATE SET
      count = CASE WHEN request_rate_limits.reset_at <= ? THEN 1 ELSE request_rate_limits.count + 1 END,
      reset_at = CASE WHEN request_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE request_rate_limits.reset_at END
    RETURNING count, reset_at
  `).get<{ count: number; reset_at: number }>(scope, subject, now + windowMs, now, now)
  return { allowed: row!.count <= maximum, resetAt: row!.reset_at }
}
