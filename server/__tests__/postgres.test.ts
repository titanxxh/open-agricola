import { getTestDatabaseUrl } from './_helpers/postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { migratePostgres } from '../database/migrations'

// A test-owned schema in the explicitly configured test service, never the app schema.
const schema = `test_${randomUUID().replaceAll('-', '')}`
const connectionString = getTestDatabaseUrl()
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests')
const admin = new PostgresDatabase({ connectionString })
const db = new PostgresDatabase({ connectionString, schema })

beforeAll(async () => {
  await admin.exec(`CREATE SCHEMA "${schema}"`)
  await db.exec('CREATE TABLE balances (id text PRIMARY KEY, amount bigint NOT NULL)')
})
afterAll(async () => {
  await db.close()
  await admin.exec(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.close()
})

it('rolls back every write when an asynchronous transaction rejects', async () => {
  await expect(db.transaction(async () => {
    await db.prepare('INSERT INTO balances (id, amount) VALUES ($1, $2)').run('alice', 10)
    await Promise.resolve()
    await db.prepare('UPDATE balances SET amount = $1 WHERE id = $2').run(20, 'alice')
    throw new Error('cancelled transfer')
  })()).rejects.toThrow('cancelled transfer')
  expect(await db.prepare('SELECT amount FROM balances WHERE id = $1').get('alice')).toBeUndefined()
})

it('keeps concurrent transactions isolated and preserves exact binary and text parameters', async () => {
  await db.exec('CREATE TABLE encoded (id text PRIMARY KEY, body text NOT NULL, payload bytea NOT NULL)')
  const body = '{ "ordered": 1, "second": 2 }\n'
  const payload = Buffer.from([0, 255, 13, 10, 128])
  let unlock!: () => void
  let inserted!: () => void
  const ready = new Promise<void>(resolve => { inserted = resolve })
  const gate = new Promise<void>(resolve => { unlock = resolve })
  const pending = db.transaction(async () => {
    await db.prepare('INSERT INTO encoded (id, body, payload) VALUES (@id, @body, @payload)').run({ id: 'private', body, payload })
    inserted()
    await gate
  })()
  // Surface an insertion failure instead of leaving the test waiting forever.
  await Promise.race([ready, pending])
  try {
    expect(await db.prepare('SELECT body FROM encoded WHERE id = ?').get('private')).toBeUndefined()
    await db.transaction(async () => {
      await db.prepare('INSERT INTO encoded (id, body, payload) VALUES (?, ?, ?)').run('other', 'committed', payload)
    })()
  } finally {
    unlock()
    await pending
  }
  expect(await db.prepare('SELECT body, payload FROM encoded WHERE id = ?').get('private')).toEqual({ body, payload })
  expect(await db.prepare('SELECT body FROM encoded WHERE id = ?').get('other')).toEqual({ body: 'committed' })
})

it('initializes the platform once under concurrent startup and enforces case-insensitive identity', async () => {
  await Promise.all([migratePostgres(db), migratePostgres(db)])
  const create = db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
  await create.run('identity-one', 'Alice', 'Alice', 'test-hash', 1_800_000_000_000)
  await expect(create.run('identity-two', 'alice', 'Other Alice', 'test-hash', 1_800_000_000_000)).rejects.toMatchObject({ code: '23505' })
  expect(await db.prepare('SELECT id, created_at FROM users WHERE username = ?').get('ALICE'))
    .toEqual({ id: 'identity-one', created_at: 1_800_000_000_000 })
})

it('retains participant identity and expires a discarded active Game Context', async () => {
  const now = 1_800_000_000_000
  await db.prepare('INSERT INTO rooms (id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?)').run('discarded', 'identity-one', now, now)
  await db.prepare("INSERT INTO game_contexts (room_id, lifecycle, created_at, updated_at) VALUES (?, 'active', ?, ?)").run('discarded', now, now)
  await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)').run('discarded', 'identity-one', 0, now)
  await db.prepare('DELETE FROM rooms WHERE id = ?').run('discarded')
  expect(await db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id = ?').get('discarded')).toEqual({ lifecycle: 'expired' })
  expect(await db.prepare('SELECT user_id, player_index FROM game_context_participants WHERE room_id = ?').get('discarded'))
    .toEqual({ user_id: 'identity-one', player_index: 0 })
})

it('isolates concurrent nested rollback scopes while keeping successful siblings', async () => {
  await db.transaction(async () => {
    const results = await Promise.allSettled([
      db.transaction(async () => {
        await Promise.resolve()
        await db.prepare('INSERT INTO balances(id, amount) VALUES (?, ?)').run('nested-kept', 11)
        await db.transaction(async () => {
          await db.prepare('UPDATE balances SET amount = 12 WHERE id = ?').run('nested-kept')
        })()
      })(),
      db.transaction(async () => {
        await db.prepare('INSERT INTO balances(id, amount) VALUES (?, ?)').run('nested-rejected', 99)
        throw new Error('rejected child')
      })(),
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(await db.prepare('SELECT amount FROM balances WHERE id = ?').get('nested-kept')).toEqual({ amount: 12 })
    expect(await db.prepare('SELECT amount FROM balances WHERE id = ?').get('nested-rejected')).toBeUndefined()
  })()
  expect(await db.prepare('SELECT amount FROM balances WHERE id = ?').get('nested-kept')).toEqual({ amount: 12 })
})
