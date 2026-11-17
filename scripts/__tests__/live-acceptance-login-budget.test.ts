import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { logoutAll } from '../prerelease/live-acceptance/formal-admin.mjs'
import { LOGIN_LIMIT, loginBudget } from '../prerelease/live-acceptance/login-budget.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const privateRoot = () => { const root = mkdtempSync(join(tmpdir(), 'oa-login-budget-')); chmodSync(root, 0o700); roots.push(root); return root }

/** A fake clock shared by every budget in a test: sleeping advances it. */
function clock(start = 1_000_000) {
  const state = { at: start, slept: [] as number[] }
  return { state, now: () => state.at, sleep: async (ms: number) => { state.slept.push(ms); state.at += ms } }
}

describe('formal login budget', () => {
  it('stays below the server limit of 10 per 60 s window', () => {
    expect(LOGIN_LIMIT.max).toBeLessThanOrEqual(8)
    expect(LOGIN_LIMIT.windowMs).toBe(60_000)
  })
  it('shares one rolling 60 s budget across engines and separate processes of a window', async () => {
    const root = privateRoot(), time = clock(), start = time.state.at
    // Two budgets on one ledger stand for the handoff and boundary CLI processes.
    const handoff = loginBudget(root, time), boundary = loginBudget(root, time)
    for (let index = 0; index < 8; index++) {
      expect(await (index % 2 ? boundary : handoff).take()).toBe(0)
      time.state.at += 1_000
    }
    // The ninth login waits until the first leaves the window, plus the margin.
    expect(await boundary.take()).toBe(start + 60_000 + LOGIN_LIMIT.marginMs - (start + 8_000))
    expect(time.state.at).toBe(start + 61_000)
    const ledger = JSON.parse(readFileSync(join(root, 'login-ledger.json'), 'utf8'))
    // Pruned to the rolling window: +2 s … +7 s and the new login at +61 s.
    expect(ledger.logins.map((at: number) => at - start)).toEqual([2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 61_000])
  })
  it('holds every login for a full window after a 429', async () => {
    const root = privateRoot(), time = clock(), budget = loginBudget(root, time)
    expect(await budget.take()).toBe(0)
    await budget.rejected()
    expect(await loginBudget(root, time).take()).toBe(60_000 + LOGIN_LIMIT.marginMs)
  })
  it('waits for a live lock and breaks one left by a dead process', async () => {
    const root = privateRoot(), time = clock(), lock = join(root, 'login-ledger.lock')
    writeFileSync(lock, String(time.state.at - LOGIN_LIMIT.lockStaleMs - 1))
    expect(await loginBudget(root, time).take()).toBe(0)
    expect(time.state.slept).toEqual([])
    writeFileSync(lock, String(time.state.at))
    const held = { ...time, sleep: async (ms: number) => { await time.sleep(ms); rmSync(lock, { force: true }) } }
    expect(await loginBudget(root, held).take()).toBe(0)
    expect(time.state.slept).toEqual([LOGIN_LIMIT.lockPollMs])
  })
  it('paces logout-all logins and logs in again once after a 429', async () => {
    const root = privateRoot(), time = clock(), budget = loginBudget(root, time), statuses = [429, 200]
    const origins = { formalApp: 'https://app.example.test', formalApi: 'https://api.example.test' }
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/api/auth/login')) {
        const status = statuses.shift() ?? 200
        return { status, headers: { getSetCookie: () => status === 200 ? ['__Host-oa-session=abc; Path=/'] : [] } }
      }
      return { status: url.endsWith('/api/auth/me') ? 401 : 200 }
    }
    const rows = await logoutAll({ origins, fetchImpl, budget }, [{ label: 'A', username: 'a', password: 'p' }])
    expect(rows).toEqual([{ label: 'A', login: 200, logoutAll: 200, meAfter: 401 }])
    expect(time.state.slept).toEqual([60_000 + LOGIN_LIMIT.marginMs])
  })
})
