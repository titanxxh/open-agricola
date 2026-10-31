import { createServer, type Server } from 'node:http'
import type { Pool } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAccountsHandler, createAccountsPool } from '../../operations/accounts-exporter'
import { collectOpeningMetrics, type OpeningSample } from '../../operations/opening-metrics'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'

const day = 86_400_000
const observedAt = Date.parse('2026-10-31T12:00:00+08:00')
let db: PostgresDatabase
let pool: Pool
let server: Server | undefined
let readerRole: string | undefined
let now = observedAt

beforeEach(async () => {
  now = observedAt
  db = await createTestDatabase()
  const { rows: [row] } = await db.query<{ schema: string }>('SELECT current_schema() AS schema')
  if (!row) throw new Error('Expected test schema')
  pool = createAccountsPool(getTestDatabaseUrl(), row.schema)
  await db.prepare('UPDATE game_opening_tracking SET tracking_since=?').run(now - 40 * day)
})
afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    server = undefined
  }
  await pool?.end()
  if (readerRole) {
    await db.exec(`DROP OWNED BY ${readerRole}`)
    await db.exec(`DROP ROLE ${readerRole}`)
    readerRole = undefined
  }
  await db?.close()
})

const account = (id: string, createdAt: number) => db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
  .run(id, id, `Private ${id}`, 'unused-password', createdAt)

const opening = async (id: string, {
  startedAt, playingAt = null, mode = 'solo', seats = 1, lifecycle = 'active', origin = 'live', waiting = 60_000, variants = false,
}: {
  startedAt: number; playingAt?: number | null; mode?: string; seats?: number; lifecycle?: string; origin?: string; waiting?: number; variants?: boolean
}) => {
  await db.prepare('INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(id, lifecycle, lifecycle === 'active' ? 'playing' : null, startedAt - waiting, startedAt)
  await db.prepare(`INSERT INTO game_opening_facts(room_id,started_at,playing_at,mode,seat_count,parent_cards,through_the_seasons,
    farmers_of_the_moor,snake_opening,moor_balance_rules,community_deck,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, startedAt, playingAt, mode, seats, variants, variants, variants, variants, variants, variants, origin)
}

const participate = (room: string, user: string) => db.prepare('INSERT INTO game_opening_accounts(room_id,user_id) VALUES(?,?)').run(room, user)
const sample = (samples: OpeningSample[], name: string, labels: Record<string, string> = {}) => {
  const result = samples.find(row => row.name === `agricola_opening_${name}` && Object.keys(row.labels).length === Object.keys(labels).length
    && Object.entries(labels).every(([key, value]) => row.labels[key] === value))
  return result?.value
}

it('counts inclusive UTC+8 windows, unique accounts across modes, durable expired outcomes and exact preparation samples', async () => {
  await account('private-repeated-player', now - 50 * day)
  await opening('today-solo', { startedAt: now - day / 2, playingAt: now - day / 2 + 30_000, variants: true })
  await opening('24h-hotseat', { startedAt: now - day, playingAt: now - day + 50_000, mode: 'hotseat', seats: 3, origin: 'legacy' })
  await opening('7d-expired', { startedAt: now - 7 * day, playingAt: now - 7 * day + 90_000, mode: 'multiplayer', seats: 2, lifecycle: 'expired', waiting: 120_000 })
  await opening('too-old', { startedAt: now - 7 * day - 1 })
  await opening('future', { startedAt: now + 1 })
  await participate('today-solo', 'private-repeated-player')
  await participate('24h-hotseat', 'private-repeated-player')
  await participate('7d-expired', 'private-repeated-player')
  const values = await collectOpeningMetrics(pool, now)
  expect(sample(values, 'games', { window: 'today', mode: 'all' })).toBe(1)
  expect(sample(values, 'games', { window: 'last_24h', mode: 'all' })).toBe(2)
  expect(sample(values, 'games', { window: 'last_7d', mode: 'all' })).toBe(3)
  expect(sample(values, 'games', { window: 'last_7d', mode: 'unknown' })).toBe(0)
  expect(sample(values, 'accounts', { window: 'last_7d', mode: 'all' })).toBe(1)
  expect(sample(values, 'accounts', { window: 'last_7d', mode: 'solo' })).toBe(1)
  expect(sample(values, 'accounts', { window: 'last_7d', mode: 'hotseat' })).toBe(1)
  expect(sample(values, 'outcomes', { window: 'last_7d', mode: 'all', outcome: 'expired' })).toBe(1)
  expect(sample(values, 'duration_samples', { window: 'last_7d', stage: 'waiting' })).toBe(2)
  expect(sample(values, 'duration_samples', { window: 'last_7d', stage: 'preparation' })).toBe(2)
  expect(sample(values, 'duration_seconds', { window: 'last_7d', stage: 'waiting', quantile: '0.5' })).toBe(90)
  expect(sample(values, 'duration_seconds', { window: 'last_7d', stage: 'preparation', quantile: '0.9' })).toBeCloseTo(84)
  expect(sample(values, 'seats', { window: 'last_7d', seats: '3' })).toBe(1)
  expect(sample(values, 'variants', { window: 'last_7d', variant: 'farmers_of_the_moor' })).toBe(1)
  expect(JSON.stringify(values)).not.toContain('private-repeated-player')
  await db.prepare('DELETE FROM users WHERE id=?').run('private-repeated-player')
  const erased = await collectOpeningMetrics(pool, now)
  expect(sample(erased, 'accounts', { window: 'last_7d', mode: 'all' })).toBe(0)
  expect(sample(erased, 'games', { window: 'last_7d', mode: 'all' })).toBe(3)
})

it('uses mature registration cohorts and each account\'s own first 24h after the exact coverage epoch', async () => {
  await db.prepare('UPDATE game_opening_tracking SET tracking_since=?').run(now - 10 * day)
  for (const [id, createdAt] of [
    ['mature-boundary', now - day], ['mature-two-days', now - 2 * day], ['mature-old', now - 8 * day],
    ['immature', now - day + 1], ['before-coverage', now - 11 * day], ['late-opening', now - day - 6 * 3_600_000],
  ] as const) await account(id, createdAt)
  await opening('first', { startedAt: now - day + 3_600_000, playingAt: now - day + 2 * 3_600_000 })
  await opening('exact-deadline', { startedAt: now - day, playingAt: now - day + 1 })
  await opening('late', { startedAt: now - 5 * 3_600_000 })
  await participate('first', 'mature-boundary')
  await participate('exact-deadline', 'mature-two-days')
  await participate('late', 'late-opening')
  const values = await collectOpeningMetrics(pool, now)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'eligible' })).toBe(3)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'started_24h' })).toBe(2)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'playing_24h' })).toBe(1)
  expect(sample(values, 'conversion', { cohort: 'last_30d', milestone: 'eligible' })).toBe(4)
  expect(sample(values, 'conversion', { cohort: 'last_30d', milestone: 'started_24h' })).toBe(2)
  await db.prepare('UPDATE game_opening_tracking SET tracking_since=?').run(now + 1)
  const uncovered = await collectOpeningMetrics(pool, now)
  expect(sample(uncovered, 'games', { window: 'last_7d', mode: 'all' })).toBe(0)
  expect(sample(uncovered, 'conversion', { cohort: 'last_7d', milestone: 'eligible' })).toBe(0)
  expect(sample(uncovered, 'duration_samples', { window: 'last_7d', stage: 'waiting' })).toBe(0)
  expect(sample(uncovered, 'duration_seconds', { window: 'last_7d', stage: 'waiting', quantile: '0.5' })).toBeUndefined()
})

it('exports live opening stages through the safe view and distinguishes stale epoch presence and development rooms', async () => {
  const lease = Date.now() + day
  await db.prepare(`INSERT INTO app_instances(instance_id,internal_url,generation,status,room_capacity,lease_until,updated_at)
    VALUES('opening-node','http://localhost','test','ready',30,?,?)`).run(lease, Date.now())
  const current = async (id: string, { phase = 'draft', confirmation = null, epoch = 1, development = false }: {
    phase?: string; confirmation?: number | null; epoch?: number; development?: boolean
  } = {}) => {
    await db.prepare(`INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES(?,'active','playing',?,?)`).run(id, now, now)
    await db.prepare(`INSERT INTO rooms(id,max_players,status,state_json,created_at,updated_at,color_confirmation_player_index)
      VALUES(?,2,?,?,?, ?,?)`).run(id, confirmation === null ? 'playing' : 'waiting', JSON.stringify({ state: { phase } }), now, now, confirmation)
    await db.prepare(`INSERT INTO room_ownership(room_id,instance_id,epoch,lease_until,status,development)
      VALUES(?,'opening-node',1,?,'active',?)`).run(id, lease, development)
    await db.prepare(`INSERT INTO room_presence(room_id,epoch,connected_count,occupied_count) VALUES(?,?,1,2)`).run(id, epoch)
  }
  await current('online-draft')
  await current('offline-draft', { epoch: 2 })
  await current('confirm-color', { confirmation: 0 })
  await current('development-draft', { development: true })
  const values = await collectOpeningMetrics(pool, now)
  expect(sample(values, 'current', { mode: 'all', stage: 'draft', presence: 'online' })).toBe(1)
  expect(sample(values, 'current', { mode: 'multiplayer', stage: 'draft', presence: 'retained' })).toBe(1)
  expect(sample(values, 'current', { mode: 'all', stage: 'color_confirmation', presence: 'online' })).toBe(1)
  expect(sample(values, 'current', { mode: 'all', stage: 'parent_selection', presence: 'online' })).toBe(0)
  const columns = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='operations_current_openings'`)
  expect(columns.rows.map(row => row.column_name).sort()).toEqual(['age_seconds', 'mode', 'presence', 'seat_count', 'stage'])
})

it('keeps account metrics healthy when opening collection fails, clears old samples and retains the last success time', async () => {
  await account('existing-account', now)
  const handler = createAccountsHandler({ pool, token: 'opening-test-token', now: () => now })
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
  const base = `http://127.0.0.1:${address.port}`
  const request = () => fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer opening-test-token' } })
  expect(await (await request()).text()).toContain('agricola_opening_collection_success 1')
  await db.exec('ALTER TABLE game_opening_facts RENAME TO unavailable_opening_facts')
  now += 61_000
  const body = await (await request()).text()
  expect(body).toContain('agricola_accounts{kind="total"} 1')
  expect(body).toContain('agricola_accounts_collection_success 1')
  expect(body).toContain('agricola_opening_collection_success 0')
  expect(body).toContain(`agricola_opening_last_success_unixtime ${observedAt / 1000}`)
  expect(body).not.toContain('agricola_opening_games')
  expect(body).not.toContain('agricola_opening_tracking_since_unixtime')
  expect((await fetch(base + '/health')).status).toBe(200)
  await expect(pool.query('DELETE FROM game_opening_accounts')).rejects.toMatchObject({ code: '25006' })
})

it('keeps both collections healthy when an allowed account query exceeds the pool acquisition timeout', async () => {
  await account('slow-account-query', now)
  const delayedPool = new Proxy(pool, {
    get(target, property) {
      if (property !== 'query') return Reflect.get(target, property)
      return (...args: unknown[]) => {
        const text = args[0]
        if (typeof text === 'string' && text.startsWith('SELECT count(*)::integer AS total')) {
          args[0] = 'WITH delay AS MATERIALIZED (SELECT pg_sleep(1.2)) ' + text.replace('FROM users', 'FROM users CROSS JOIN delay')
        }
        return Reflect.apply(target.query, target, args)
      }
    },
  })
  const handler = createAccountsHandler({ pool: delayedPool, token: 'opening-test-token', now: () => now })
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
  const response = await fetch(`http://127.0.0.1:${address.port}/internal/metrics`, {
    headers: { Authorization: 'Bearer opening-test-token' },
  })
  const body = await response.text()
  expect(response.status).toBe(200)
  expect(body).toContain('agricola_accounts_collection_success 1')
  expect(body).toContain('agricola_opening_collection_success 1')
  expect(body).toContain('agricola_opening_games{')
})

it('collects with a restricted reader while private account fields and raw game snapshots remain inaccessible', async () => {
  const { rows: [row] } = await db.query<{ schema: string }>('SELECT current_schema() AS schema')
  if (!row) throw new Error('Expected test schema')
  readerRole = `opening_reader_${row.schema}`
  await db.exec(`CREATE ROLE ${readerRole} NOLOGIN`)
  await db.exec(`GRANT USAGE ON SCHEMA ${row.schema} TO ${readerRole}`)
  await db.exec(`GRANT SELECT ON game_opening_facts,game_opening_accounts,game_opening_tracking,operations_current_openings TO ${readerRole}`)
  await db.exec(`GRANT SELECT (room_id,created_at,lifecycle) ON game_contexts TO ${readerRole}`)
  await db.exec(`GRANT SELECT (id,created_at) ON users TO ${readerRole}`)
  const reader = await pool.connect()
  try {
    await reader.query(`SET ROLE ${readerRole}`)
    const values = await collectOpeningMetrics(reader, now)
    expect(sample(values, 'games', { window: 'today', mode: 'all' })).toBe(0)
    expect((await reader.query('SELECT * FROM operations_current_openings')).rows).toEqual([])
    await expect(reader.query('SELECT state_json FROM rooms')).rejects.toMatchObject({ code: '42501' })
    await expect(reader.query('SELECT username,password_hash FROM users')).rejects.toMatchObject({ code: '42501' })
  } finally {
    await reader.query('RESET ROLE')
    reader.release()
  }
})
