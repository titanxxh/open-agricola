import { getDb } from './db'
import { consumeRateLimit } from './database/rate-limit'

export async function checkRateLimit(key: string, opts: { windowMs: number; max: number }): Promise<boolean> {
  if (process.env.DISABLE_RATE_LIMIT === '1') return true
  return (await consumeRateLimit(getDb(), 'api', key, opts.max, opts.windowMs)).allowed
}

export async function resetRateLimitsForTests(): Promise<void> {
  await getDb().prepare("DELETE FROM request_rate_limits WHERE scope = 'api'").run()
}
