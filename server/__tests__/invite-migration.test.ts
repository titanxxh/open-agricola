import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalDbPath = process.env.DB_PATH
let tempDir = ''

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = originalDbPath
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  vi.resetModules()
})

describe('account invite migration', () => {
  it('backfills v16 invites as compatible single-use rows', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-invites-'))
    const path = join(tempDir, 'migration.db')
    const seed = new Database(path)
    seed.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (16);
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE account_invites (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_at INTEGER,
        revoked_at INTEGER
      );
      INSERT INTO account_invites (id, code_hash, created_at) VALUES ('unused', 'h1', 1);
      INSERT INTO account_invites (id, code_hash, created_at, used_at) VALUES ('used', 'h2', 1, 2);
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()
    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({ version: 17 })
    expect(db.prepare('SELECT id, use_count, max_uses FROM account_invites ORDER BY id').all()).toEqual([
      { id: 'unused', use_count: 0, max_uses: 1 },
      { id: 'used', use_count: 1, max_uses: 1 },
    ])
    db.close()
  })
})
