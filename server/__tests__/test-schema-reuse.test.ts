import { describe, expect, it } from 'vitest'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'

// fast-server enables schema reuse in its setup file; these tests run in order (never shuffled) and observe the shared pool.
const schemaOf = async (db: PostgresDatabase) =>
  (await db.prepare('SELECT current_schema() AS name').get<{ name: string }>())!.name

const snapshot = async (db: PostgresDatabase) => ({
  users: (await db.prepare('SELECT count(*)::int AS n FROM users').get<{ n: number }>())!.n,
  policy: await db.prepare('SELECT revision, waiting_days, updated_by_user_id FROM room_retention_policy').all(),
  migrations: (await db.prepare('SELECT count(*)::int AS n FROM postgres_schema_migrations').get<{ n: number }>())!.n,
  tracking: await db.prepare('SELECT * FROM game_opening_tracking').all(),
  sequence: await db.prepare("SELECT nextval('bug_report_feedback_id_seq')::text AS value").get(),
})

describe('test schema reuse', { shuffle: false }, () => {
  let fresh: Awaited<ReturnType<typeof snapshot>>
  let firstSchema = ''

  it('a released schema comes back in its freshly migrated state', async () => {
    const first = await createTestDatabase()
    firstSchema = await schemaOf(first)
    fresh = await snapshot(first)
    // Dirty plain tables, seeded rows (one only through the users FK cascade) and a sequence.
    await first.exec(`INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('u1', 'u1', 'U1', 'x', 1)`)
    await first.exec(`UPDATE room_retention_policy SET revision = 2, waiting_days = 9, updated_by_user_id = 'u1'`)
    await first.exec('DELETE FROM postgres_schema_migrations WHERE version = 1')
    await first.exec("SELECT nextval('bug_report_feedback_id_seq') FROM generate_series(1, 5)")
    await first.close()

    const second = await createTestDatabase()
    try {
      expect(await schemaOf(second)).toBe(firstSchema)
      expect(await snapshot(second)).toEqual(fresh)
    } finally { await second.close() }
  })

  it('a schema whose catalog a test changed is dropped instead of reused', async () => {
    const changed = await createTestDatabase()
    expect(await schemaOf(changed)).toBe(firstSchema)
    await changed.exec('CREATE TABLE leftover(x int)')
    await changed.close()

    const next = await createTestDatabase()
    try {
      expect(await schemaOf(next)).not.toBe(firstSchema)
      // A new schema records its own migration time.
      expect({ ...await snapshot(next), tracking: [] }).toEqual({ ...fresh, tracking: [] })
      const gone = await next.prepare('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = ?').get<{ n: number }>(firstSchema)
      expect(gone!.n).toBe(0)
    } finally { await next.close() }
  })

  it('concurrent databases in one file get separate schemas', async () => {
    const [a, b] = await Promise.all([createTestDatabase(), createTestDatabase()])
    try {
      expect(await schemaOf(a)).not.toBe(await schemaOf(b))
    } finally { await Promise.all([a.close(), b.close()]) }
  })
})
