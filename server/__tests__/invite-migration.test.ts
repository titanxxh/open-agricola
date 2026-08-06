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
      CREATE TABLE oauth_states (
        state_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        intent TEXT NOT NULL,
        user_id TEXT,
        return_to TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE room_players (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        player_index INTEGER NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
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
      CREATE TABLE workshop_cards (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id),
        card_id TEXT NOT NULL DEFAULT '',
        card_json TEXT NOT NULL,
        code_manifest TEXT,
        art_url TEXT,
        art_prompt TEXT,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE workshop_card_versions (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
        card_json TEXT NOT NULL,
        code_manifest TEXT,
        art_url TEXT,
        version_number INTEGER NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at INTEGER NOT NULL
      );
      INSERT INTO account_invites (id, code_hash, created_at) VALUES ('unused', 'h1', 1);
      INSERT INTO account_invites (id, code_hash, created_at, used_at) VALUES ('used', 'h2', 1, 2);
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()
    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({ version: 28 })
    expect(db.prepare('SELECT id, use_count, max_uses FROM account_invites ORDER BY id').all()).toEqual([
      { id: 'unused', use_count: 0, max_uses: 1 },
      { id: 'used', use_count: 1, max_uses: 1 },
    ])
    db.close()
  })
})
