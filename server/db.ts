import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const DB_DIR = process.env.DB_DIR ?? join(process.cwd(), 'data')
const DB_PATH = process.env.DB_PATH ?? join(DB_DIR, 'open-agricola.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  mkdirSync(DB_DIR, { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  return _db
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)

  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null } | undefined
  const currentVersion = row?.v ?? 0

  const migrations: { version: number; sql: string }[] = [
    {
      version: 1,
      sql: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login_at INTEGER
        );

        CREATE TABLE sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_user ON sessions(user_id);
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);

        -- rooms.custom_card_ids: JSON array of workshop_cards.id included in this game
        CREATE TABLE rooms (
          id TEXT PRIMARY KEY,
          created_by TEXT REFERENCES users(id),
          state_json TEXT,
          max_players INTEGER NOT NULL DEFAULT 2,
          status TEXT NOT NULL DEFAULT 'waiting',
          version INTEGER NOT NULL DEFAULT 0,
          custom_card_ids TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE room_players (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          player_index INTEGER NOT NULL,
          joined_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, user_id)
        );
      `,
    },
    {
      version: 2,
      sql: `
        CREATE TABLE workshop_cards (
          id TEXT PRIMARY KEY,
          author_id TEXT NOT NULL REFERENCES users(id),
          card_id TEXT NOT NULL,
          card_type TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          card_json TEXT NOT NULL,
          effect_dsl TEXT,
          effect_code TEXT,
          compiled_code TEXT,
          art_url TEXT,
          art_prompt TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_workshop_author ON workshop_cards(author_id);
        CREATE INDEX idx_workshop_status ON workshop_cards(status);
        -- 同一个 card_id 只能有一张 published 卡牌（全局唯一）
        CREATE UNIQUE INDEX idx_workshop_card_id_published
          ON workshop_cards(card_id) WHERE status = 'published';

        CREATE TABLE card_likes (
          user_id TEXT NOT NULL REFERENCES users(id),
          card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, card_id)
        );

        CREATE TABLE card_comments (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id),
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_comments_card ON card_comments(card_id);

        CREATE TABLE sandbox_cards (
          user_id TEXT NOT NULL REFERENCES users(id),
          workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, workshop_card_id)
        );
      `,
    },
    {
      version: 3,
      sql: `
        CREATE TABLE workshop_card_versions (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          card_json TEXT NOT NULL,
          effect_dsl TEXT,
          effect_code TEXT,
          compiled_code TEXT,
          art_url TEXT,
          version_number INTEGER NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_versions_card ON workshop_card_versions(card_id);

        ALTER TABLE workshop_cards ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
      `,
    },
  ]

  const insert = db.prepare('INSERT INTO schema_version (version) VALUES (?)')

  for (const m of migrations) {
    if (m.version <= currentVersion) continue
    db.transaction(() => {
      db.exec(m.sql)
      insert.run(m.version)
    })()
    console.log(`[db] migration v${m.version} applied`)
  }
}

/** Clean up expired sessions periodically. */
export function cleanExpiredSessions(): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
}
