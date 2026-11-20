import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { PostgresDatabase } from '../../database/postgres'
import { migratePostgres } from '../../database/migrations'
import { releaseAll } from './release-all'

/** A private schema in an explicitly separate test database, never DATABASE_URL. */
export function getTestDatabaseUrl(): string {
  const root = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim())
  const connectionString = process.env.TEST_DATABASE_URL
    ?? parseEnv(readFileSync(join(root, 'data/dependencies.local'), 'utf8')).TEST_DATABASE_URL
  if (!connectionString) throw new Error('Start test dependencies with node scripts/local-services.mjs --test')
  return connectionString
}

/**
 * A maintenance connection for CREATE / DROP DATABASE. Both can wait for a cluster
 * checkpoint, and a cancelled DROP leaves an invalid database (cleared by
 * scripts/invalid-databases.mjs), so the connection disables statement timeouts,
 * including role and database defaults.
 */
export function databaseMaintenance(connectionString = getTestDatabaseUrl()): PostgresDatabase {
  return new PostgresDatabase({ connectionString, max: 1, statement_timeout: 0 })
}

/**
 * Catalog state of one schema that a reset cannot restore: tables, columns, defaults, constraints, indexes,
 * triggers (including their enabled state), functions, types, views, policies and privileges. A test that changes
 * any of it leaves a schema that is dropped instead of reused.
 */
const CATALOG_FINGERPRINT = `
  WITH ns AS (SELECT oid, nspacl FROM pg_namespace WHERE nspname = $1)
  SELECT md5(concat_ws('|',
    (SELECT nspacl::text FROM ns),
    (SELECT string_agg(concat_ws(':', c.relname, c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity,
        CASE WHEN c.relkind IN ('v', 'm') THEN md5(pg_get_viewdef(c.oid)) END), ',' ORDER BY c.relname)
      FROM pg_class c WHERE c.relnamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', c.relname, a.attnum, a.attname, a.atttypid, a.attnotnull, a.attisdropped,
        a.attidentity, a.attgenerated, a.attacl::text, pg_get_expr(d.adbin, d.adrelid)), ',' ORDER BY c.relname, a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE c.relnamespace = (SELECT oid FROM ns) AND a.attnum > 0),
    (SELECT string_agg(concat_ws(':', conrelid, conname, convalidated, pg_get_constraintdef(oid)), ',' ORDER BY conrelid, conname)
      FROM pg_constraint WHERE connamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', tgname, tgenabled, pg_get_triggerdef(t.oid)), ',' ORDER BY tgrelid, tgname)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = (SELECT oid FROM ns) AND NOT t.tgisinternal),
    (SELECT string_agg(concat_ws(':', proname, proargtypes::text, md5(coalesce(prosrc, '')), proacl::text, proconfig::text,
        prosecdef), ',' ORDER BY proname, proargtypes::text)
      FROM pg_proc WHERE pronamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', typname, typacl::text), ',' ORDER BY typname)
      FROM pg_type WHERE typnamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', polrelid, polname, polcmd, polroles::text, pg_get_expr(polqual, polrelid),
        pg_get_expr(polwithcheck, polrelid)), ',' ORDER BY polrelid, polname)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', defaclrole, defaclobjtype, defaclacl::text), ',' ORDER BY defaclrole, defaclobjtype)
      FROM pg_default_acl WHERE defaclnamespace = (SELECT oid FROM ns)),
    (SELECT string_agg(concat_ws(':', s.seqrelid::regclass::text, seqstart, seqincrement, seqmax, seqmin, seqcycle), ','
        ORDER BY s.seqrelid::regclass::text)
      FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid WHERE c.relnamespace = (SELECT oid FROM ns))
  )) AS fingerprint`

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`
const tableHash = (schema: string, table: string) =>
  `SELECT md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS hash FROM ${quoteIdent(schema)}.${quoteIdent(table)} t`

/** The data of a freshly migrated schema that a reset restores; the same for every schema of one migration set. */
type MigratedBaseline = {
  tables: string[]
  seeds: Array<{ table: string; hash: string; rows: string }>
  sequences: Array<{ name: string; start: string; last: string | null }>
}

/** Fingerprints contain object ids and schema-qualified names, so each schema is compared with its own. */
const catalogFingerprint = async (admin: PostgresDatabase, schema: string) =>
  (await admin.query<{ fingerprint: string }>(CATALOG_FINGERPRINT, [schema])).rows[0].fingerprint

async function captureBaseline(admin: PostgresDatabase, schema: string): Promise<MigratedBaseline> {
  const tables = (await admin.query<{ name: string }>(
    'SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema])).rows.map(row => row.name)
  const seeds: MigratedBaseline['seeds'] = []
  for (const table of tables) {
    const { rows } = await admin.query<{ rows: string | null; hash: string }>(
      `SELECT json_agg(t)::text AS rows, (${tableHash(schema, table)}) AS hash FROM ${quoteIdent(schema)}.${quoteIdent(table)} t`)
    if (rows[0].rows !== null) seeds.push({ table, hash: rows[0].hash, rows: rows[0].rows })
  }
  const sequences = (await admin.query<{ name: string; start: string; last: string | null }>(
    `SELECT sequencename AS name, start_value::text AS start, last_value::text AS last
     FROM pg_sequences WHERE schemaname = $1 ORDER BY sequencename`, [schema])).rows
  return { tables, seeds, sequences }
}

/**
 * Returns a used schema to its freshly migrated state: truncates every table that gained rows, restores the rows
 * migrations seeded and every sequence position. Returns false when the catalog changed, so the schema is dropped.
 */
async function resetToBaseline(
  admin: PostgresDatabase, schema: string, fingerprint: string, baseline: MigratedBaseline,
): Promise<boolean> {
  return admin.transaction(async () => {
    if (await catalogFingerprint(admin, schema) !== fingerprint) return false
    const q = (table: string) => `${quoteIdent(schema)}.${quoteIdent(table)}`
    const seedTables = new Set(baseline.seeds.map(seed => seed.table))
    const changedSeeds = async () => {
      const changed: MigratedBaseline['seeds'] = []
      for (const seed of baseline.seeds) {
        if ((await admin.query<{ hash: string }>(tableHash(schema, seed.table))).rows[0].hash !== seed.hash) changed.push(seed)
      }
      return changed
    }
    const plain = baseline.tables.filter(table => !seedTables.has(table))
    const filled = plain.length === 0 ? [] : (await admin.query<{ name: string }>(plain
      .map((table, index) => `SELECT $${index + 1}::text AS name WHERE EXISTS (SELECT 1 FROM ${q(table)})`)
      .join(' UNION ALL '), plain)).rows.map(row => row.name)
    const dirty = [...filled, ...(await changedSeeds()).map(seed => seed.table)]
    if (dirty.length > 0) await admin.exec(`TRUNCATE ${dirty.map(q).join(', ')} CASCADE`)
    // CASCADE may also have emptied a seeded table that references a truncated one.
    for (const seed of await changedSeeds()) {
      await admin.exec(`DELETE FROM ${q(seed.table)}`)
      await admin.query(`INSERT INTO ${q(seed.table)} OVERRIDING SYSTEM VALUE
        SELECT * FROM json_populate_recordset(NULL::${q(seed.table)}, $1::json)`, [seed.rows])
    }
    if ((await changedSeeds()).length > 0) return false
    for (const sequence of baseline.sequences) {
      const name = `${quoteIdent(schema)}.${quoteIdent(sequence.name)}`
      await admin.query('SELECT setval($1::regclass, $2::bigint, $3)',
        [name, sequence.last ?? sequence.start, sequence.last !== null])
    }
    return true
  })()
}

/**
 * Schema reuse for one test file. Creating and migrating a schema costs far more than resetting one, so a file that
 * enables reuse keeps its released schemas, resets them and hands them to the next test. Concurrent tests in a file
 * each get their own schema. Every schema is dropped when the file finishes.
 */
type SchemaPool = { admin?: PostgresDatabase; idle: string[]; all: Set<string>; fingerprints: Map<string, string>; baseline?: MigratedBaseline }
let schemaPool: SchemaPool | undefined

/** Turns on schema reuse for the current test file; the returned function drops every schema the file created. */
export function enableTestSchemaReuse(): () => Promise<void> {
  if (schemaPool) throw new Error('Test schema reuse is already enabled')
  // Files that never open a database never connect.
  const pool: SchemaPool = { idle: [], all: new Set(), fingerprints: new Map() }
  schemaPool = pool
  return async () => {
    if (schemaPool === pool) schemaPool = undefined
    const admin = pool.admin
    if (!admin) return
    await releaseAll([
      ...[...pool.all].map(schema => () => admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)),
      () => admin.close(),
    ])
  }
}

async function createReusableTestDatabase(pool: SchemaPool): Promise<PostgresDatabase> {
  const connectionString = getTestDatabaseUrl()
  const admin = pool.admin ??= new PostgresDatabase({ connectionString, max: 1 })
  const reused = pool.idle.pop()
  const schema = reused ?? `test_${randomUUID().replaceAll('-', '')}`
  const db = new PostgresDatabase({ connectionString, schema, max: 4 })
  const closeDb = db.close.bind(db)
  const drop = async () => {
    pool.all.delete(schema)
    pool.fingerprints.delete(schema)
    await admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
  let closing: Promise<void> | undefined
  const release = () => closing ??= releaseAll([
    closeDb,
    async () => {
      const fingerprint = pool.fingerprints.get(schema)
      if (schemaPool !== pool || !pool.baseline || fingerprint === undefined) return drop()
      let reusable = false
      try { reusable = await resetToBaseline(admin, schema, fingerprint, pool.baseline) }
      finally { if (reusable) pool.idle.push(schema); else await drop() }
    },
  ])
  if (!reused) {
    pool.all.add(schema)
    try {
      await admin.exec(`CREATE SCHEMA "${schema}"`)
      await migratePostgres(db)
      pool.baseline ??= await captureBaseline(admin, schema)
      pool.fingerprints.set(schema, await catalogFingerprint(admin, schema))
    } catch (error) {
      await releaseAll([closeDb, drop]).catch((cleanupError: unknown) => {
        throw new AggregateError([error, cleanupError], 'Test database setup and cleanup both failed')
      })
      throw error
    }
  }
  db.close = release
  return db
}

export async function createTestDatabase(): Promise<PostgresDatabase> {
  if (schemaPool) return createReusableTestDatabase(schemaPool)
  const connectionString = getTestDatabaseUrl()
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const admin = new PostgresDatabase({ connectionString, max: 1 })
  const db = new PostgresDatabase({ connectionString, schema, max: 4 })
  const closeDb = db.close.bind(db)
  let closing: Promise<void> | undefined
  const release = () => closing ??= releaseAll([
    closeDb,
    () => admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
    () => admin.close(),
  ])
  try {
    await admin.exec(`CREATE SCHEMA "${schema}"`)
    await migratePostgres(db)
  } catch (error) {
    await release().catch((cleanupError: unknown) => {
      throw new AggregateError([error, cleanupError], 'Test database setup and cleanup both failed')
    })
    throw error
  }
  db.close = release
  return db
}
