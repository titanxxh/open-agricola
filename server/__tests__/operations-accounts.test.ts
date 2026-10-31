import { createServer } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createAccountsHandler } from '../../operations/accounts-exporter'
import { accountsFunction } from '../../operations/database-access'
import { createTestDatabase } from './_helpers/postgres'
import { createOperationsTestReader } from './_helpers/operations-reader'

const db = await createTestDatabase()
const reader = await createOperationsTestReader(db).catch(async (error: unknown) => { await db.close(); throw error })
const pool = reader.pool
let now = Date.parse('2026-10-29T00:30:00+08:00')
const handler = createAccountsHandler({ pool, token: 'test-scrape-token', now: () => now, buildId: 'test-operations' })
const server = createServer((req, res) => { void handler(req, res) })
let base = ''
beforeAll(async () => {
  const times = [now, now - 30 * 60_000, now - 30 * 60_000 - 1, now - 86_400_000, now - 86_400_000 - 1, now - 604_800_000, now - 604_800_000 - 1]
  for (const [index, createdAt] of times.entries()) {
    await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(`account-${index}`, `private-user-${index}`, `Private player ${index}`, 'unused-test-password', createdAt)
  }
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()))
  await reader.close()
  await db.close()
})
const metrics = () => fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer test-scrape-token' } })

it('requires scrape authorization and refuses writes at both HTTP and database boundaries', async () => {
  expect((await fetch(base + '/internal/metrics')).status).toBe(401)
  expect((await fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer forged' } })).status).toBe(401)
  expect((await fetch(base + '/internal/metrics', { method: 'POST' })).status).toBe(405)
  await expect(pool.query('DELETE FROM users')).rejects.toMatchObject({ code: '25006' })
})

it('exports UTC+8 day and inclusive rolling boundaries, removes deleted accounts and clears failed observations', async () => {
  let body = await (await metrics()).text()
  for (const sample of ['total"} 7', 'today"} 2', 'last_24h"} 4', 'last_7d"} 6']) expect(body).toContain('agricola_accounts{kind="' + sample)
  expect(body).not.toContain('private-user')
  expect(body).not.toContain('Private player')
  expect(await (await fetch(base + '/health')).json()).toEqual({ status: 'ready', buildId: 'test-operations', collectedAt: now / 1000 })
  await db.prepare('DELETE FROM users WHERE id=?').run('account-0')
  now += 61_000
  body = await (await metrics()).text()
  expect(body).toContain('agricola_accounts{kind="total"} 6')
  expect(body).toContain('agricola_accounts{kind="today"} 1')
  const lastSuccess = now / 1000
  await db.exec(`ALTER FUNCTION ${accountsFunction}(bigint) RENAME TO unavailable_account_metrics`)
  now += 61_000
  body = await (await metrics()).text()
  expect(body).not.toContain('agricola_accounts{')
  expect(body).toContain('agricola_accounts_collection_success 0')
  expect(body).toContain(`agricola_accounts_last_success_unixtime ${lastSuccess}`)
  expect((await fetch(base + '/health')).status).toBe(503)
})
