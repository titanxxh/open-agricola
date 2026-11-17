// Formal logins of one acceptance window share the production per-IP `authentication` limit (server/index.ts:
// RATE_LIMIT_MAX 10 per fixed RATE_LIMIT_WINDOW 60 s, consumeRateLimit in server/database/rate-limit.ts). Register,
// resend-verification and password reset count against the same budget, and a rejected request still increments the
// count without extending the window. Parallel engines and the window's separate CLI processes therefore take every
// login slot from one ledger in the run directory and stay at most 8 per rolling 60 s, below the limit even with the
// owner's own logins.
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'

export const LOGIN_LIMIT = { max: 8, windowMs: 60_000, marginMs: 1_000, lockStaleMs: 30_000, lockPollMs: 50 }

const defaultSleep = ms => new Promise(done => setTimeout(done, ms))

/** One window's login ledger. `now` and `sleep` are injectable so pacing tests run on a fake clock. */
export function loginBudget(directory, { now = Date.now, sleep = defaultSleep, limit = LOGIN_LIMIT } = {}) {
  const ledger = join(directory, 'login-ledger.json'), lock = join(directory, 'login-ledger.lock')
  const read = () => {
    try {
      const value = JSON.parse(readFileSync(ledger, 'utf8'))
      return { logins: Array.isArray(value.logins) ? value.logins.filter(Number.isFinite) : [], blockedUntil: Number.isFinite(value.blockedUntil) ? value.blockedUntil : 0 }
    } catch { return { logins: [], blockedUntil: 0 } }
  }
  const write = value => {
    const temporary = `${ledger}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify({ format: 1, ...value }) + '\n', { mode: 0o600 }); renameSync(temporary, ledger)
  }
  /** Exclusive-create lock holding its acquisition time; a lock older than `lockStaleMs` belongs to a dead process. */
  async function locked(work) {
    for (;;) {
      try {
        const fd = openSync(lock, 'wx', 0o600)
        try { writeSync(fd, String(now())) } finally { closeSync(fd) }
        break
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        let heldSince = 0
        try { heldSince = Number(readFileSync(lock, 'utf8')) } catch { continue }
        if (heldSince && now() - heldSince > limit.lockStaleMs) { rmSync(lock, { force: true }); continue }
        await sleep(limit.lockPollMs)
      }
    }
    try { return work() } finally { rmSync(lock, { force: true }) }
  }
  return {
    /** Waits for a free slot and records it; returns how long it waited. */
    async take() {
      let waited = 0
      for (;;) {
        const wait = await locked(() => {
          const at = now(), state = read(), recent = state.logins.filter(time => at - time < limit.windowMs).sort((a, b) => a - b)
          const freeAt = Math.max(state.blockedUntil, recent.length >= limit.max ? recent[recent.length - limit.max] + limit.windowMs + limit.marginMs : 0)
          if (freeAt <= at) { write({ logins: [...recent, at], blockedUntil: state.blockedUntil }); return 0 }
          return freeAt - at
        })
        if (!wait) return waited
        waited += wait
        await sleep(wait)
      }
    },
    /** A 429 means the server's fixed window is full; hold every login of this window until it has certainly reset. */
    async rejected() {
      await locked(() => { const at = now(), state = read(); write({ ...state, blockedUntil: Math.max(state.blockedUntil, at + limit.windowMs + limit.marginMs) }) })
    },
  }
}
