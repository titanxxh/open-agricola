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

describe('room result migration', () => {
  it('deletes 2265 legacy finished rows without fabricating result archives', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-room-results-'))
    const path = join(tempDir, 'migration.db')
    const seed = new Database(path)
    seed.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (18);
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO rooms VALUES ('waiting', 'waiting', 10, 10);
      INSERT INTO rooms VALUES ('playing', 'playing', 20, 20);
      WITH RECURSIVE ids(value) AS (
        SELECT 1
        UNION ALL
        SELECT value + 1 FROM ids WHERE value < 2265
      )
      INSERT INTO rooms
      SELECT 'finished-' || value, 'finished', value, value FROM ids;
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({ version: 23 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM rooms WHERE status = 'finished'").get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT id, started_at FROM rooms ORDER BY id').all()).toEqual([
      { id: 'playing', started_at: 20 },
      { id: 'waiting', started_at: null },
    ])
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_results').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_result_players').get()).toEqual({ count: 0 })
    expect((db.pragma('table_info(game_results)') as Array<{ name: string }>).map(({ name }) => name)).toEqual([
      'room_id',
      'started_at',
      'finished_at',
      'rounds_played',
      'player_count',
      'enable_community_deck',
      'enable_parent_cards',
      'enable_through_the_seasons',
      'enable_farmers_of_the_moor',
    ])
    db.close()
  })

  it('opens a fresh database with WAL and synchronous NORMAL', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-room-results-'))
    process.env.DB_PATH = join(tempDir, 'fresh.db')
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('synchronous', { simple: true })).toBe(1)
    db.close()
  })
})
