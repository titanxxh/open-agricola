import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { CONCURRENT_MIGRATION_LOCKS, DATABASE_EXTENSIONS, migratePostgres, migrationLockScope } from '../database/migrations'
import { databaseMaintenance, getTestDatabaseUrl } from './_helpers/postgres'

const repository = resolve(import.meta.dirname, '../..')
const ready = { schema: 'test_a', maxLocksPerTransaction: CONCURRENT_MIGRATION_LOCKS, installedExtensions: DATABASE_EXTENSIONS.length }

describe('migration lock scope', () => {
  it('scopes the lock to a non-default schema only when concurrent migrations are safe', () => {
    expect(migrationLockScope(ready)).toBe('schema')
    // The formal and prerelease applications migrate the default schema under the database-wide lock.
    expect(migrationLockScope({ ...ready, schema: 'public' })).toBe('database')
    expect(migrationLockScope({ ...ready, schema: null })).toBe('database')
    // PostgreSQL's default lock table fits about five concurrent migration transactions.
    expect(migrationLockScope({ ...ready, maxLocksPerTransaction: 64 })).toBe('database')
    expect(migrationLockScope({ ...ready, maxLocksPerTransaction: CONCURRENT_MIGRATION_LOCKS - 1 })).toBe('database')
    // A database without its extensions is bootstrapped by one migration at a time.
    expect(migrationLockScope({ ...ready, installedExtensions: DATABASE_EXTENSIONS.length - 1 })).toBe('database')
  })

  it('keeps every database-wide object of the migrations in the bootstrap list', () => {
    const directory = join(repository, 'server/database')
    const sql = readdirSync(directory).filter(file => file.endsWith('.sql')).map(file => readFileSync(join(directory, file), 'utf8')
      // Comments and string bodies never create objects.
      .replace(/--[^\n]*/g, '')).join('\n')
    const extensions = [...sql.matchAll(/CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_]+)"?/gi)].map(match => match[1])
    expect([...new Set(extensions)].sort()).toEqual([...DATABASE_EXTENSIONS].sort())
    // Objects outside the migrating schema would race between concurrently migrating schemas.
    expect(sql.match(/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|DATABASE|TABLESPACE|PUBLICATION|SUBSCRIPTION|EVENT\s+TRIGGER|SERVER|FOREIGN\s+DATA\s+WRAPPER|LANGUAGE|CAST|SCHEMA)\b/gi)).toBeNull()
    expect(sql.replace(/CREATE\s+EXTENSION[^;]*;/gi, '').match(/\bpublic\./gi)).toBeNull()
  })

  it('gives the local test database the lock table that concurrent migrations need', () => {
    expect(readFileSync(join(repository, 'docker-compose.local.yml'), 'utf8')).toContain(`max_locks_per_transaction=${CONCURRENT_MIGRATION_LOCKS}`)
  })
})

describe('migration locks in a private database', () => {
  // A private database keeps these deliberate lock waits away from every other test's migrations. Each test
  // gets its own, so whether the extensions are installed never depends on which test ran first.
  const admin = databaseMaintenance()
  let name = ''
  let open: PostgresDatabase[] = []
  const database = (schema?: string) => {
    const url = new URL(getTestDatabaseUrl())
    url.pathname = `/${name}`
    const db = new PostgresDatabase({ connectionString: url.toString(), schema, max: 2 })
    open.push(db)
    return db
  }
  const schemaA = 'tenant_a', schemaB = 'tenant_b', bootstrap = 'bootstrap'
  let concurrent = false
  /** Installs the database extensions through a schema the test does not otherwise use. */
  const installExtensions = () => migratePostgres(database(bootstrap))

  beforeEach(async () => {
    name = `migration_lock_${randomUUID().replaceAll('-', '')}`
    open = []
    await admin.exec(`CREATE DATABASE "${name}"`)
    const setup = database()
    for (const schema of [schemaA, schemaB, bootstrap]) await setup.exec(`CREATE SCHEMA ${schema}`)
    const row = await setup.prepare("SELECT current_setting('max_locks_per_transaction')::integer AS locks").get<{ locks: number }>()
    concurrent = row!.locks >= CONCURRENT_MIGRATION_LOCKS
    // Verification always starts the local service from docker-compose.local.yml.
    if (process.env.CI) expect(concurrent).toBe(true)
  }, 300_000)

  afterEach(async () => {
    for (const db of open) await db.close()
    await admin.exec(`DROP DATABASE IF EXISTS "${name}"`)
  }, 300_000)

  afterAll(async () => { await admin.close() })

  /** Runs `work` while `holder` keeps whatever `hold` acquired in an open transaction. */
  async function whileHolding<Result>(holder: PostgresDatabase, hold: () => Promise<unknown>, work: () => Promise<Result>): Promise<Result> {
    let release!: () => void
    let held!: () => void
    const acquired = new Promise<void>(done => { held = done })
    const gate = new Promise<void>(done => { release = done })
    const pending = holder.transaction(async () => { await hold(); held(); await gate })()
    await Promise.race([acquired, pending])
    try { return await work() } finally { release(); await pending }
  }
  /** Rolls back with `lock_not_available` instead of waiting when the migration lock is taken. */
  const tryMigrate = (db: PostgresDatabase) => db.transaction(async () => {
    await db.exec("SET LOCAL lock_timeout = '400ms'")
    await migratePostgres(db)
  })()
  const blocked = { code: '55P03' }

  it('bootstraps a database without its extensions one migration at a time', async () => {
    const holder = database(), first = database(schemaA)
    await whileHolding(holder, () => holder.exec('SELECT pg_advisory_xact_lock_shared(962)'), async () => {
      await expect(tryMigrate(first)).rejects.toMatchObject(blocked)
    })
    await migratePostgres(first)
    expect(await first.prepare("SELECT count(*)::integer AS installed FROM pg_extension WHERE extname = 'citext'").get()).toEqual({ installed: 1 })
  }, 60_000)

  it('migrates another schema during an open migration and still excludes the same schema', async () => {
    await installExtensions()
    const holder = database(schemaA), sameSchema = database(schemaA), otherSchema = database(schemaB)
    await whileHolding(holder, () => migratePostgres(holder), async () => {
      await expect(tryMigrate(sameSchema)).rejects.toMatchObject(blocked)
      if (concurrent) await tryMigrate(otherSchema)
      // A lock table of the default size keeps every migration under the database-wide lock.
      else await expect(tryMigrate(otherSchema)).rejects.toMatchObject(blocked)
    })
    await migratePostgres(otherSchema)
    expect(await otherSchema.prepare('SELECT count(*)::integer AS applied FROM postgres_schema_migrations').get())
      .toEqual(await holder.prepare('SELECT count(*)::integer AS applied FROM postgres_schema_migrations').get())
  }, 60_000)

  it('keeps the database-wide lock for the default schema and against an instance that still uses it', async () => {
    await installExtensions()
    const holder = database(), defaultSchema = database(), scoped = database(schemaB)
    // The default schema requests the exclusive lock, so even a shared holder makes it wait.
    await whileHolding(holder, () => holder.exec('SELECT pg_advisory_xact_lock_shared(962)'), async () => {
      await expect(tryMigrate(defaultSchema)).rejects.toMatchObject(blocked)
    })
    expect(await defaultSchema.prepare("SELECT to_regclass('public.postgres_schema_migrations') AS migrations").get()).toEqual({ migrations: null })
    // An instance from before this change holds the exclusive lock; a scoped migration waits for it.
    await whileHolding(holder, () => holder.exec('SELECT pg_advisory_xact_lock(962)'), async () => {
      await expect(tryMigrate(scoped)).rejects.toMatchObject(blocked)
    })
  }, 60_000)
})
