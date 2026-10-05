import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, lstat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import type { PostgresDatabase } from '../../server/database/postgres'
import type { ResourceStore } from '../../server/storage/resource-store'
import { ReplayResources, parseViewerManifest } from '../../server/storage/replay-resources'
import { objectHash } from '../../server/storage/s3-store'
import { applyReplayRemovalLedger, validateBatch, validateEntry } from '../../server/game/replay-removal'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'
import { assertSqliteImportSchema } from './schema'
import { validateStorage } from '../storage-validation'

// This is the native schema's dependency order, not a dialect translation.
export const IMPORT_TABLES = [...readFileSync(new URL('../../server/database/schema.sql', import.meta.url), 'utf8').matchAll(/^CREATE TABLE (\w+) \(/gm)].map(match => match[1]!)
type Row = Record<string, string | number | null | Buffer>
export type ImportPaths = { database: string; cardArt: string; replayAssets: string; viewers: string; erasureLedger: string }
const quote = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error('Invalid import identifier')
  return `"${identifier}"`
}
const rowHash = (row: Row, columns: string[]): string => createHash('sha256').update(JSON.stringify(columns.map(key => {
  const value = row[key]
  return Buffer.isBuffer(value) ? { bytes: value.toString('hex') } : value
}))).digest('hex')
const digest = (rows: Row[], columns: string[]): string => createHash('sha256').update(rows.map(row => rowHash(row, columns)).sort().join('\n')).digest('hex')
async function exists(path: string): Promise<boolean> { try { await stat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } }

async function readLocalFile(root: string, relativePath: string): Promise<Buffer> {
  let path = root
  for (const part of relativePath.split('/')) {
    path = join(path, part)
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Import resources cannot contain symlinks')
  }
  return readFile(path)
}

async function stageResources(paths: ImportPaths, resources: ResourceStore): Promise<number> {
  let count = 0
  const stage = async (key: string, body: Buffer, type: string) => {
    if (key.startsWith('replay-assets/') && objectHash(body) !== key.slice('replay-assets/'.length)) throw new Error(`Replay asset hash mismatch: ${key}`)
    if (await resources.ledger.isHashRemoved(objectHash(body))) {
      // A restored reference may name erased content. Retain its identity only;
      // the independent ledger already denies reads, and no bytes are uploaded.
      await resources.db.prepare(`INSERT INTO stored_objects(object_key, content_hash, content_type, size_bytes, state, retain_until, updated_at)
        VALUES (?, ?, ?, ?, 'ready', ?, ?) ON CONFLICT DO NOTHING`).run(key, objectHash(body), type, body.length, Date.now() + 86400000, Date.now())
    } else await resources.stage(key, body, type)
    count++
  }
  for (const [root, prefix] of [[paths.cardArt, 'card-art'], [paths.replayAssets, 'replay-assets']]) {
    if (!root || !await exists(root)) continue
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[A-Za-z0-9._-]+$/.test(entry.name)) throw new Error(`Unexpected resource entry: ${prefix}/${entry.name}`)
      const type = /\.png$/i.test(entry.name) ? 'image/png' : /\.webp$/i.test(entry.name) ? 'image/webp' : /\.jpe?g$/i.test(entry.name) ? 'image/jpeg' : 'application/octet-stream'
      await stage(`${prefix}/${entry.name}`, await readLocalFile(root, entry.name), type)
    }
  }
  if (await exists(paths.viewers)) {
    for (const entry of await readdir(paths.viewers, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) throw new Error(`Unexpected Viewer build: ${entry.name}`)
      const manifest = await readLocalFile(join(paths.viewers, entry.name), 'manifest.json')
      const parsed = parseViewerManifest(manifest, entry.name)
      for (const [path, hash] of Object.entries(parsed.files)) {
        const body = await readLocalFile(join(paths.viewers, entry.name), path)
        if (objectHash(body) !== hash) throw new Error(`Viewer file hash mismatch: ${entry.name}/${path}`)
        await stage(`replay-viewers/${entry.name}/${path}`, body, 'application/octet-stream')
      }
      await new ReplayResources(resources).publishViewer(entry.name, manifest)
    }
  }
  return count
}

async function importLedger(path: string, resources: ResourceStore): Promise<void> {
  if (!await exists(path)) return
  const batches = (await readFile(path, 'utf8')).split('\n').filter(line => line.trim()).map(line => {
    const raw: unknown = JSON.parse(line)
    return raw && typeof raw === 'object' && 'entries' in raw ? validateBatch(raw)
      : { version: 1 as const, entries: [validateEntry(raw)], assetTakedowns: [] }
  })
  const current = new Set((await resources.ledger.read()).map(batch => JSON.stringify(batch)))
  for (const batch of batches) if (!current.has(JSON.stringify(batch))) {
    await resources.ledger.append(batch); current.add(JSON.stringify(batch))
  }
}

/** Read-only SQLite input, immutable S3 staging, then one validated PG cutover. */
export async function importSqlite(paths: ImportPaths, db: PostgresDatabase, resources: ResourceStore) {
  const directory = await mkdtemp(join(tmpdir(), 'agricola-sqlite-import-'))
  let source: Sqlite.Database | undefined
  let sourceHash: string | undefined
  let started = false
  try {
    const input = new Sqlite(paths.database, { readonly: true, fileMustExist: true })
    try { await input.backup(join(directory, 'source.db')) } finally { input.close() }
    sourceHash = objectHash(await readFile(join(directory, 'source.db')))
    source = new Sqlite(join(directory, 'source.db'))
    if (source.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity check failed')
    const originalVersion = assertSqliteImportSchema(source)
    if ((source.pragma('foreign_key_check') as unknown[]).length) throw new Error('SQLite foreign key check failed')
    const previous = await db.prepare('SELECT status, report_json FROM data_imports WHERE source_hash = ?').get<{ status: string; report_json: string | null }>(sourceHash)
    if (previous?.status === 'validated') return JSON.parse(previous.report_json!) as ImportReport
    // Persist the barrier before staging; a failed run cannot leave a seemingly
    // empty target that an application can start accepting new writes into.
    await db.transaction(async () => {
      await db.exec('SELECT pg_advisory_xact_lock(972)')
      for (const table of IMPORT_TABLES) {
        if (await db.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get()) throw new Error(`Import requires an empty target: ${table}`)
      }
      const other = await db.prepare("SELECT 1 FROM data_imports WHERE source_hash != ? AND status != 'validated'").get(sourceHash)
      if (other) throw new Error('Another source import is unfinished')
      await db.prepare(`INSERT INTO data_imports(source_hash, status, updated_at) VALUES (?, 'importing', ?)
        ON CONFLICT(source_hash) DO UPDATE SET status = 'importing', updated_at = excluded.updated_at`).run(sourceHash, Date.now())
    })()
    started = true
    await importLedger(paths.erasureLedger, resources)
    const stagedObjects = await stageResources(paths, resources)
    return await db.transaction(async () => {
      await db.exec('SELECT pg_advisory_xact_lock(972)')
      const tables: Record<string, { rows: number; sha256: string }> = {}
      // Table locks also exclude an accidentally running writer throughout the
      // copy and verification. Maintenance remains required before invoking CLI.
      await db.exec(`LOCK TABLE ${IMPORT_TABLES.map(quote).join(', ')} IN ACCESS EXCLUSIVE MODE`)
      for (const table of IMPORT_TABLES) {
        if (await db.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get()) throw new Error(`Target gained data during import: ${table}`)
        const columns = (source!.prepare(`PRAGMA table_info(${quote(table)})`).all() as { name: string }[]).map(column => column.name)
        const rows = source!.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]
        const statement = db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
        for (const row of rows) await statement.run(...columns.map(column => row[column]))
        const copied = await db.prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}`).all<Row>()
        const sha256 = digest(rows, columns)
        if (copied.length !== rows.length || digest(copied, columns) !== sha256) throw new Error(`Exact row verification failed: ${table}`)
        tables[table] = { rows: rows.length, sha256 }
        if (['bug_report_attempts', 'bug_report_evidence_audit'].includes(table)) {
          await db.prepare(`SELECT setval(pg_get_serial_sequence(current_schema() || '.${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${quote(table)}`).get()
        }
      }
      const discardedRoomIds = await new PostgresRoomPersistence(db).discardUnrecordedActiveRooms()
      const erasure = await applyReplayRemovalLedger(db, { resources })
      for (const row of await db.prepare('SELECT room_id, custom_cards_json FROM game_replays').all<{ room_id: string; custom_cards_json: string }>()) {
        const cards = JSON.parse(row.custom_cards_json) as { artUrl?: string }[]
        await resources.reference('replay', row.room_id, cards.flatMap(card => /^\/replay-assets\/[a-f0-9]{64}$/.test(card.artUrl ?? '') ? [card.artUrl!.slice(1)] : []))
      }
      const validation = await validateStorage(db, resources)
      const report = { sourceHash: sourceHash!, sourceSchemaVersion: originalVersion, importedSchemaVersion: (source!.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v, tables, stagedObjects, discardedRoomIds, erasure, validation }
      await db.prepare("UPDATE data_imports SET status = 'validated', report_json = ?, updated_at = ? WHERE source_hash = ?").run(JSON.stringify(report), Date.now(), sourceHash)
      return report
    })()
  } catch (error) {
    if (started && sourceHash) await db.prepare("UPDATE data_imports SET status = 'failed', updated_at = ? WHERE source_hash = ? AND status != 'validated'").run(Date.now(), sourceHash)
    throw error
  } finally { source?.close(); await rm(directory, { recursive: true, force: true }) }
}
export type ImportReport = { sourceHash: string; sourceSchemaVersion: number; importedSchemaVersion: number; tables: Record<string, { rows: number; sha256: string }>; stagedObjects: number; discardedRoomIds: string[]; erasure: Awaited<ReturnType<typeof applyReplayRemovalLedger>>; validation: Awaited<ReturnType<typeof validateStorage>> }
