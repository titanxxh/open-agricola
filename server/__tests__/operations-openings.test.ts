import { createServer, type Server } from 'node:http'
import type { Pool } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import pg from 'pg'
import { createAccountsHandler } from '../../operations/accounts-exporter'
import { accountsFunction, openingsFunction, provisionOperationsDatabase } from '../../operations/database-access'
import { collectOpeningMetrics, type OpeningSample } from '../../operations/opening-metrics'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'
import { createOperationsTestReader } from './_helpers/operations-reader'

const day = 86_400_000
const observedAt = Date.parse('2026-10-31T12:00:00+08:00')
let db: PostgresDatabase
let pool: Pool
let server: Server | undefined
let access: Awaited<ReturnType<typeof createOperationsTestReader>>
let now = observedAt

beforeEach(async () => {
  now = observedAt
  db = await createTestDatabase()
  access = await createOperationsTestReader(db)
  pool = access.pool
  await db.prepare('UPDATE game_opening_tracking SET tracking_since=?').run(now - 40 * day)
})
afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    server = undefined
  }
  await access?.close()
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

it('uses a read-only two-second connection without JIT compilation for short monitoring queries', async () => {
  const settings = await pool.query(`SELECT current_setting('jit') AS jit,
    current_setting('statement_timeout') AS timeout, current_setting('default_transaction_read_only') AS readonly`)
  expect(settings.rows).toEqual([{ jit: 'off', timeout: '2s', readonly: 'on' }])
})

const sample = (samples: OpeningSample[], name: string, labels: Record<string, string> = {}) => {
  const result = samples.find(row => row.name === `agricola_opening_${name}` && Object.keys(row.labels).length === Object.keys(labels).length
    && Object.entries(labels).every(([key, value]) => row.labels[key] === value))
  return result?.value
}

const ownerOpeningSamples = async (observedAt: number): Promise<OpeningSample[]> => {
  const { rows } = await db.query<Omit<OpeningSample, 'value'> & { value: string }>(
    `SELECT name,labels,value FROM ${access.schema}.${openingsFunction}($1::bigint)`, [observedAt],
  )
  return rows.map(row => ({ ...row, value: Number(row.value) }))
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
  const values = await ownerOpeningSamples(now)
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
  const erased = await ownerOpeningSamples(now)
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
  const values = await ownerOpeningSamples(now)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'eligible' })).toBe(3)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'started_24h' })).toBe(2)
  expect(sample(values, 'conversion', { cohort: 'last_7d', milestone: 'playing_24h' })).toBe(1)
  expect(sample(values, 'conversion', { cohort: 'last_30d', milestone: 'eligible' })).toBe(4)
  expect(sample(values, 'conversion', { cohort: 'last_30d', milestone: 'started_24h' })).toBe(2)
  await db.prepare('UPDATE game_opening_tracking SET tracking_since=?').run(now + 1)
  const uncovered = await ownerOpeningSamples(now)
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
  const values = await collectOpeningMetrics(pool)
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
  await db.exec(`ALTER FUNCTION ${openingsFunction}() RENAME TO unavailable_opening_metrics`)
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
        if (typeof text === 'string' && text.startsWith(`SELECT * FROM ${accountsFunction}(`)) {
          args[0] = `WITH delay AS MATERIALIZED (SELECT pg_sleep(1.2)) SELECT counts.* FROM ${accountsFunction}() counts CROSS JOIN delay`
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
  const values = await collectOpeningMetrics(pool)
  expect(sample(values, 'games', { window: 'today', mode: 'all' })).toBe(0)
  for (const sql of ['SELECT * FROM operations_current_openings', 'SELECT room_id,user_id FROM game_opening_accounts',
    'SELECT * FROM game_opening_facts', 'SELECT id,created_at FROM users', 'SELECT room_id,created_at,lifecycle FROM game_contexts',
    'SELECT state_json FROM rooms', 'SELECT username,password_hash FROM users',
    `SELECT * FROM ${accountsFunction}(0::bigint)`, `SELECT * FROM ${openingsFunction}(0::bigint)`]) {
    await expect(pool.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
})

it('removes legacy table, column and inherited access on repeated provisioning while preserving both aggregates', async () => {
  await account('private-upgrade-user', now - 2 * day)
  await opening('private-upgrade-room', { startedAt: Date.now() - 120_000 })
  await participate('private-upgrade-room', 'private-upgrade-user')
  const legacy = `legacy_${access.schema}`
  await db.exec(`CREATE ROLE ${legacy} NOLOGIN`)
  try {
    await db.exec(`GRANT USAGE ON SCHEMA ${access.schema} TO ${legacy}`)
    await db.exec(`GRANT SELECT (id,created_at) ON users TO ${legacy},${access.role}`)
    await db.exec(`GRANT SELECT (room_id,created_at,lifecycle) ON game_contexts TO ${access.role}`)
    await db.exec(`GRANT SELECT ON game_opening_accounts,game_opening_facts,operations_current_openings TO ${access.role}`)
    await db.exec(`GRANT ${legacy} TO ${access.role}`)
    await db.exec(`GRANT EXECUTE ON FUNCTION ${openingsFunction}(bigint),${accountsFunction}(bigint) TO ${access.role}`)
    expect((await pool.query('SELECT room_id,user_id FROM game_opening_accounts')).rows)
      .toEqual([{ room_id: 'private-upgrade-room', user_id: 'private-upgrade-user' }])
    await access.provision()
    await access.provision()
    for (const sql of ['SELECT room_id,user_id FROM game_opening_accounts', 'SELECT id,created_at FROM users',
      'SELECT room_id,created_at,lifecycle FROM game_contexts', 'SELECT * FROM operations_current_openings',
      `SELECT * FROM ${accountsFunction}(0::bigint)`, `SELECT * FROM ${openingsFunction}(0::bigint)`]) {
      await expect(pool.query(sql)).rejects.toMatchObject({ code: '42501' })
    }
    expect((await pool.query('SELECT pg_has_role($1,\'MEMBER\') AS member', [legacy])).rows).toEqual([{ member: false }])
    expect((await pool.query(`SELECT total FROM ${accountsFunction}()`)).rows).toEqual([{ total: 1 }])
    expect(sample(await collectOpeningMetrics(pool), 'accounts', { window: 'last_24h', mode: 'all' })).toBe(1)
  } finally {
    await db.exec(`DROP OWNED BY ${legacy}`)
    await db.exec(`DROP ROLE ${legacy}`)
  }
})

it('keeps fixed aggregates unchanged when the reader creates temporary shadow relations', async () => {
  await account('real-user', now - 2 * day)
  await opening('real-room', { startedAt: Date.now() - 120_000 })
  await participate('real-room', 'real-user')
  const client = await pool.connect()
  try {
    await client.query('SET default_transaction_read_only=off')
    await client.query('CREATE TEMP TABLE users(id text,created_at bigint)')
    await client.query('INSERT INTO users VALUES(\'fake-one\',$1),(\'fake-two\',$1)', [now])
    await client.query('CREATE TEMP TABLE game_opening_accounts(room_id text,user_id text)')
    await client.query('INSERT INTO game_opening_accounts VALUES(\'real-room\',\'fake-one\'),(\'real-room\',\'fake-two\')')
    await client.query(`SET search_path=pg_temp,${access.schema},pg_catalog`)
    expect((await client.query(`SELECT total FROM ${accountsFunction}()`)).rows).toEqual([{ total: 1 }])
    expect(sample(await collectOpeningMetrics(client), 'accounts', { window: 'last_24h', mode: 'all' })).toBe(1)
    await expect(client.query(`SELECT user_id FROM ${access.schema}.game_opening_accounts`)).rejects.toMatchObject({ code: '42501' })
  } finally {
    await client.query('RESET search_path')
    await client.query('RESET default_transaction_read_only')
    client.release()
  }
})

it('uses a database-controlled minute instead of accepting reader-selected historical times', async () => {
  const client = await pool.connect()
  await client.query('BEGIN READ ONLY')
  try {
    const clock = await client.query<{ started: Date }>('SELECT transaction_timestamp() AS started')
    const minute = Math.floor(clock.rows[0]!.started.getTime() / 60_000) * 60_000
    await opening('inside-current-minute', { startedAt: minute + 1 })
    expect(sample(await collectOpeningMetrics(client), 'games', { window: 'last_24h', mode: 'all' })).toBe(0)
    expect(sample(await ownerOpeningSamples(minute + 1), 'games', { window: 'last_24h', mode: 'all' })).toBe(1)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
})

it('does not grant PUBLIC execution of either privileged aggregate function', async () => {
  const outsider = `outside_${access.schema}`
  await db.exec(`CREATE ROLE ${outsider} NOLOGIN`)
  await db.exec(`GRANT USAGE ON SCHEMA ${access.schema} TO ${outsider}`)
  const client = new pg.Client({ connectionString: getTestDatabaseUrl() })
  try {
    await client.connect()
    await client.query(`SET ROLE ${outsider}`)
    for (const name of [accountsFunction, openingsFunction]) {
      for (const argumentsSql of ['', '0::bigint']) {
        await expect(client.query(`SELECT * FROM ${access.schema}.${name}(${argumentsSql})`)).rejects.toMatchObject({ code: '42501' })
      }
    }
  } finally {
    await client.end()
    await db.exec(`DROP OWNED BY ${outsider}`)
    await db.exec(`DROP ROLE ${outsider}`)
  }
})

it('keeps registration healthy before the game opening schema exists without installing game relations', async () => {
  await db.exec('DROP VIEW operations_current_openings; DROP TABLE game_opening_accounts; DROP TABLE game_opening_facts; DROP TABLE game_opening_tracking')
  await access.provision()
  await account('pre-opening-schema', now)
  expect((await pool.query(`SELECT total FROM ${accountsFunction}()`)).rows).toEqual([{ total: 1 }])
  await expect(collectOpeningMetrics(pool)).rejects.toMatchObject({ code: '55000' })
  expect((await db.query("SELECT to_regclass(current_schema()||'.game_opening_facts') AS relation")).rows).toEqual([{ relation: null }])
  const handler = createAccountsHandler({ pool, token: 'opening-test-token', now: () => now })
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
  const response = await fetch(`http://127.0.0.1:${address.port}/internal/metrics`, { headers: { Authorization: 'Bearer opening-test-token' } })
  const body = await response.text()
  expect(body).toContain('agricola_accounts_collection_success 1')
  expect(body).toContain('agricola_opening_collection_success 0')
  expect(body).not.toContain('agricola_opening_games{')
  expect((await fetch(`http://127.0.0.1:${address.port}/health`)).status).toBe(200)
})

it('rolls back failed hardening when shared raw permissions remain, including credential rotation', async () => {
  await db.exec('GRANT SELECT (created_at) ON users TO PUBLIC')
  const originalUrl = pool.options.connectionString
  if (!originalUrl) throw new Error('Expected restricted connection URL')
  try {
    await expect(provisionOperationsDatabase({ databaseUrl: getTestDatabaseUrl(), password: 'a'.repeat(64), schema: access.schema, role: access.role }))
      .rejects.toThrow('shared privileges')
    const client = new pg.Client({ connectionString: originalUrl })
    try {
      await client.connect()
      expect((await client.query(`SELECT total FROM ${access.schema}.${accountsFunction}()`)).rows).toEqual([{ total: 0 }])
    } finally { await client.end() }
  } finally {
    await db.exec('REVOKE SELECT (created_at) ON users FROM PUBLIC')
  }
  await access.provision()
  await expect(pool.query('SELECT created_at FROM users')).rejects.toMatchObject({ code: '42501' })
})

it('refuses reader-owned objects without dropping or transferring them', async () => {
  await db.exec(`GRANT CREATE ON SCHEMA ${access.schema} TO ${access.role}`)
  const client = await pool.connect()
  try {
    await client.query('SET default_transaction_read_only=off')
    await client.query(`CREATE TABLE ${access.schema}.reader_owned_probe(value integer)`)
  } finally {
    await client.query('RESET default_transaction_read_only')
    client.release()
  }
  try {
    await expect(access.provision()).rejects.toThrow('must not own')
    expect((await db.query(`SELECT to_regclass('${access.schema}.reader_owned_probe') IS NOT NULL AS present`)).rows).toEqual([{ present: true }])
  } finally {
    await db.exec('DROP TABLE reader_owned_probe')
    await db.exec(`REVOKE CREATE ON SCHEMA ${access.schema} FROM ${access.role}`)
  }
  await access.provision()
})
