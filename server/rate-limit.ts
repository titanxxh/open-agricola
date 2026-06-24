const buckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, opts: { windowMs: number; max: number }): boolean {
  if (process.env.DISABLE_RATE_LIMIT === '1') return true
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return true
  }
  entry.count++
  return entry.count <= opts.max
}

export function resetRateLimitsForTests(): void {
  buckets.clear()
}
