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

describe('replay migration', () => {
  it('creates the seven tables and backfills contexts without fabricating legacy replays', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-replay-migration-'))
    const path = join(tempDir, 'migration.db')
    const seed = new Database(path)
    seed.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version VALUES (20);
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE game_results (
        room_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL
      );
      INSERT INTO rooms VALUES ('waiting-room', 'waiting', 10, 11);
      INSERT INTO rooms VALUES ('playing-room', 'playing', 20, 21);
      INSERT INTO rooms VALUES ('completed-wins', 'playing', 30, 31);
      INSERT INTO game_results VALUES ('legacy-result', 40, 41);
      INSERT INTO game_results VALUES ('completed-wins', 50, 51);
    `)
    seed.close()

    process.env.DB_PATH = path
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const db = getDb()

    expect(db.prepare('SELECT MAX(version) AS version FROM schema_version').get()).toEqual({
      version: 23,
    })
    expect([
      'bug_report_attempts',
      'bug_report_evidence_audit',
      'bug_reports',
      'game_contexts',
      'game_replay_steps',
      'game_replays',
      'issue_submission_connections',
    ].every((table) =>
      db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
    )).toBe(true)
    expect(db.prepare(`
      SELECT room_id, lifecycle, phase, replay_status, created_at, updated_at
      FROM game_contexts
      ORDER BY room_id
    `).all()).toEqual([
      {
        room_id: 'completed-wins',
        lifecycle: 'completed',
        phase: null,
        replay_status: 'legacy_no_replay',
        created_at: 50,
        updated_at: 51,
      },
      {
        room_id: 'legacy-result',
        lifecycle: 'completed',
        phase: null,
        replay_status: 'legacy_no_replay',
        created_at: 40,
        updated_at: 41,
      },
      {
        room_id: 'playing-room',
        lifecycle: 'active',
        phase: 'playing',
        replay_status: null,
        created_at: 20,
        updated_at: 21,
      },
      {
        room_id: 'waiting-room',
        lifecycle: 'active',
        phase: 'waiting',
        replay_status: null,
        created_at: 10,
        updated_at: 11,
      },
    ])
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replays').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM game_replay_steps').get()).toEqual({ count: 0 })
    db.close()
  })
})
