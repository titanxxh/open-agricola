import type Sqlite from 'better-sqlite3'

/** Import the current released SQLite format only; no historical upgrades. */
export function assertSqliteImportSchema(db: Sqlite.Database): number {
  const version = (db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }).v
  if (version !== 33) throw new Error(`Unsupported SQLite import schema ${version}; export from the current schema 33 build first`)
  return version
}
