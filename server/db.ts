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
  _db.pragma('synchronous = NORMAL')
  _db.pragma('busy_timeout = 5000')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  return _db
}

export function runMigrations(db: Database.Database): void {
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
          -- effect_dsl/effect_code/compiled_code created here historically
          -- (v2/v3) and dropped in v7 below; new DBs walk through both.
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
          -- effect_dsl/effect_code/compiled_code created here historically
          -- (v2/v3) and dropped in v7 below; new DBs walk through both.
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
    {
      version: 4,
      sql: `
        ALTER TABLE workshop_cards ADD COLUMN code_manifest TEXT;
        ALTER TABLE workshop_card_versions ADD COLUMN code_manifest TEXT;

        CREATE TABLE sandbox_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          player_count INTEGER NOT NULL DEFAULT 2,
          deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
          updated_at INTEGER NOT NULL
        );
      `,
    },
    {
      version: 5,
      // One-time wipe of old workshop cards that used the legacy imperative
      // registerCardEffect / registerCardListener format. The new CARD_DEF /
      // CARD_IMPL declarative shape is incompatible, so we start fresh.
      // Delete child tables first to satisfy FK constraints, then the parent.
      sql: `
        DELETE FROM workshop_card_versions;
        DELETE FROM card_likes;
        DELETE FROM card_comments;
        DELETE FROM sandbox_cards;
        DELETE FROM workshop_cards;
      `,
    },
    {
      version: 6,
      // Workshop -> GitHub PR integration: track PR state on each card,
      // add per-user rate-limit table, and a full audit log.
      sql: `
        ALTER TABLE workshop_cards ADD COLUMN github_pr_url TEXT;
        ALTER TABLE workshop_cards ADD COLUMN github_pr_status TEXT;
        ALTER TABLE workshop_cards ADD COLUMN github_pr_last_synced_at INTEGER;

        CREATE TABLE github_propose_rate_limit (
          user_id TEXT PRIMARY KEY REFERENCES users(id),
          last_propose_at INTEGER NOT NULL
        );

        CREATE TABLE github_propose_audit (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          workshop_card_id TEXT NOT NULL,
          action TEXT NOT NULL,
          pr_url TEXT,
          error_code TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_propose_audit_user ON github_propose_audit(user_id, created_at DESC);
        CREATE INDEX idx_propose_audit_card ON github_propose_audit(workshop_card_id);
      `,
    },
    {
      version: 7,
      // Drop legacy DSL/code columns from v2/v3 (no new writes since PR-2;
      // CARD_DEF/CARD_IMPL declarative shape stores everything in card_json).
      // Requires SQLite >= 3.35 for ALTER TABLE ... DROP COLUMN; better-sqlite3
      // bundles a recent SQLite by default.
      sql: `
        ALTER TABLE workshop_cards DROP COLUMN effect_dsl;
        ALTER TABLE workshop_cards DROP COLUMN effect_code;
        ALTER TABLE workshop_cards DROP COLUMN compiled_code;
        ALTER TABLE workshop_card_versions DROP COLUMN effect_dsl;
        ALTER TABLE workshop_card_versions DROP COLUMN effect_code;
        ALTER TABLE workshop_card_versions DROP COLUMN compiled_code;
      `,
    },
    {
      version: 8,
      sql: `
        ALTER TABLE users ADD COLUMN password_updated_at INTEGER;

        CREATE TABLE auth_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          provider_user_id TEXT NOT NULL,
          provider_login TEXT,
          provider_email TEXT,
          provider_email_verified INTEGER NOT NULL DEFAULT 0,
          display_name TEXT,
          avatar_url TEXT,
          linked_at INTEGER NOT NULL,
          last_login_at INTEGER,
          UNIQUE(provider, provider_user_id),
          UNIQUE(user_id, provider)
        );
        CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);

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
        CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

        CREATE TABLE oauth_onboarding_tickets (
          ticket_hash TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          provider_user_id TEXT NOT NULL,
          provider_login TEXT,
          provider_email TEXT,
          provider_email_verified INTEGER NOT NULL DEFAULT 0,
          display_name TEXT,
          avatar_url TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER
        );
        CREATE INDEX idx_oauth_onboarding_expires ON oauth_onboarding_tickets(expires_at);
      `,
    },
    {
      version: 9,
      sql: `
        ALTER TABLE oauth_onboarding_tickets ADD COLUMN return_to TEXT;
      `,
    },
    {
      version: 10,
      sql: `
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
        CREATE INDEX idx_account_invites_created ON account_invites(created_at DESC);
        CREATE INDEX idx_account_invites_used ON account_invites(used_at);
        CREATE INDEX idx_account_invites_expires ON account_invites(expires_at);
      `,
    },
    {
      version: 11,
      sql: `
        CREATE TABLE reserved_usernames (
          username TEXT PRIMARY KEY COLLATE NOCASE,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `,
    },
    {
      version: 12,
      sql: `
        ALTER TABLE oauth_states ADD COLUMN invite_code_hash TEXT;
        ALTER TABLE oauth_onboarding_tickets ADD COLUMN invite_code_hash TEXT;
      `,
    },
    {
      version: 13,
      sql: `
        ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
        ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
        ALTER TABLE users ADD COLUMN email_verification_sent_at INTEGER;
        UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
        CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

        CREATE TABLE email_verification_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER
        );
        CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
        CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at);
      `,
    },
    {
      version: 14,
      sql: `
        ALTER TABLE rooms ADD COLUMN enable_parent_cards INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE rooms ADD COLUMN enable_through_the_seasons INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE rooms ADD COLUMN enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE rooms ADD COLUMN allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0;
        UPDATE rooms SET enable_parent_cards = 1 WHERE state_json LIKE '%"enableParentCards":true%';
        UPDATE rooms SET enable_through_the_seasons = 1 WHERE state_json LIKE '%"enableThroughTheSeasons":true%';
        UPDATE rooms SET enable_farmers_of_the_moor = 1 WHERE state_json LIKE '%"enableFarmersOfTheMoor":true%';
        UPDATE rooms SET allow_incomplete_farmers_of_the_moor_minor_deal = 1 WHERE state_json LIKE '%"enableFarmersOfTheMoor":true%';
      `,
    },
    {
      version: 15,
      sql: `
        ALTER TABLE sandbox_settings ADD COLUMN enable_through_the_seasons INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sandbox_settings ADD COLUMN enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sandbox_settings ADD COLUMN allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0;
      `,
    },
    {
      version: 16,
      sql: `
        ALTER TABLE rooms ADD COLUMN draft_parents INTEGER;
      `,
    },
    {
      version: 17,
      sql: `
        ALTER TABLE account_invites ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE account_invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
        UPDATE account_invites SET use_count = 1 WHERE used_at IS NOT NULL;
      `,
    },
    {
      version: 18,
      sql: `
        ALTER TABLE workshop_cards ADD COLUMN draft_revision INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE workshop_cards ADD COLUMN draft_generation_json TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE workshop_cards ADD COLUMN published_version_id TEXT;
        ALTER TABLE workshop_cards ADD COLUMN sandbox_pass_version_id TEXT;
        ALTER TABLE workshop_cards ADD COLUMN sandbox_passed_at INTEGER;

        ALTER TABLE workshop_card_versions ADD COLUMN content_hash TEXT;
        ALTER TABLE workshop_card_versions ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '{}';

        UPDATE workshop_cards
        SET draft_generation_json = CASE
          WHEN NULLIF(TRIM(art_url), '') IS NOT NULL THEN json_object(
            'art',
            json_object(
              'prompt', art_prompt,
              'lastCompleted', json_object(
                'id', 'legacy-art-' || id,
                'kind', 'art',
                'prompt', art_prompt,
                'resultUrl', art_url,
                'createdAt', updated_at
              ),
              'adopted', json_object(
                'id', 'legacy-art-' || id,
                'kind', 'art',
                'prompt', art_prompt,
                'resultUrl', art_url,
                'createdAt', updated_at
              )
            )
          )
          ELSE json_object('art', json_object('prompt', art_prompt))
        END
        WHERE NULLIF(TRIM(art_prompt), '') IS NOT NULL;

        INSERT INTO workshop_card_versions (
          id, card_id, card_json, code_manifest, art_url, version_number,
          created_by, created_at, content_hash, provenance_json
        )
        SELECT
          lower(hex(randomblob(16))),
          card.id,
          card.card_json,
          card.code_manifest,
          card.art_url,
          (
            SELECT COALESCE(MAX(version.version_number), 0) + 1
            FROM workshop_card_versions version
            WHERE version.card_id = card.id
          ),
          card.author_id,
          card.updated_at,
          NULL,
          '{}'
        FROM workshop_cards card
        WHERE card.status = 'published';

        UPDATE workshop_cards
        SET published_version_id = (
          SELECT version.id
          FROM workshop_card_versions version
          WHERE version.card_id = workshop_cards.id
          ORDER BY version.version_number DESC
          LIMIT 1
        )
        WHERE status = 'published';
      `,
    },
    {
      version: 19,
      sql: `
        ALTER TABLE rooms ADD COLUMN started_at INTEGER;
        UPDATE rooms SET started_at = created_at WHERE status = 'playing';

        CREATE TABLE game_results (
          room_id TEXT PRIMARY KEY,
          started_at INTEGER NOT NULL,
          finished_at INTEGER NOT NULL,
          rounds_played INTEGER NOT NULL,
          player_count INTEGER NOT NULL,
          community_deck INTEGER NOT NULL,
          parent_cards INTEGER NOT NULL,
          through_the_seasons INTEGER NOT NULL,
          farmers_of_the_moor INTEGER NOT NULL
        );

        CREATE TABLE game_result_players (
          room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
          player_index INTEGER NOT NULL,
          game_player_id TEXT NOT NULL,
          user_id TEXT,
          display_name TEXT NOT NULL,
          score INTEGER NOT NULL,
          PRIMARY KEY (room_id, player_index)
        );

        DELETE FROM rooms WHERE status = 'finished';
      `,
    },
    {
      version: 20,
      sql: `
        ALTER TABLE game_results RENAME COLUMN community_deck TO enable_community_deck;
        ALTER TABLE game_results RENAME COLUMN parent_cards TO enable_parent_cards;
        ALTER TABLE game_results RENAME COLUMN through_the_seasons TO enable_through_the_seasons;
        ALTER TABLE game_results RENAME COLUMN farmers_of_the_moor TO enable_farmers_of_the_moor;
      `,
    },
    {
      version: 21,
      sql: `
        CREATE TABLE game_contexts (
          room_id TEXT PRIMARY KEY,
          lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'completed', 'expired', 'removed')),
          phase TEXT CHECK (phase IS NULL OR phase IN ('waiting', 'playing')),
          replay_status TEXT CHECK (replay_status IS NULL OR replay_status IN ('available', 'legacy_no_replay')),
          expires_at INTEGER,
          removal_reason TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_game_contexts_lifecycle ON game_contexts(lifecycle);

        CREATE TABLE game_replays (
          room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id),
          schema_version INTEGER NOT NULL,
          viewer_build_id TEXT NOT NULL,
          game_build_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('recording', 'completed')),
          latest_step_no INTEGER NOT NULL,
          missing_prefix INTEGER NOT NULL DEFAULT 0,
          custom_cards_json TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE TABLE game_replay_steps (
          room_id TEXT NOT NULL REFERENCES game_replays(room_id) ON DELETE CASCADE,
          step_no INTEGER NOT NULL,
          room_version INTEGER NOT NULL,
          checkpoint_step_no INTEGER NOT NULL,
          player_index INTEGER,
          command_type TEXT NOT NULL,
          intent_json TEXT NOT NULL,
          payload_kind TEXT NOT NULL CHECK (payload_kind IN ('checkpoint', 'delta')),
          payload_gzip BLOB NOT NULL,
          frame_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, step_no)
        );
        CREATE INDEX idx_game_replay_steps_checkpoint
          ON game_replay_steps(room_id, checkpoint_step_no, step_no);

        CREATE TABLE issue_submission_connections (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          github_user_id TEXT NOT NULL UNIQUE,
          access_token_ciphertext BLOB NOT NULL,
          access_token_nonce BLOB NOT NULL,
          access_token_tag BLOB NOT NULL,
          refresh_token_ciphertext BLOB,
          refresh_token_nonce BLOB,
          refresh_token_tag BLOB,
          key_id TEXT NOT NULL,
          access_token_expires_at INTEGER NOT NULL,
          refresh_token_expires_at INTEGER,
          revoked_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE bug_reports (
          submission_id TEXT PRIMARY KEY,
          reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          room_id TEXT NOT NULL REFERENCES game_contexts(room_id),
          player_index INTEGER NOT NULL,
          lifecycle TEXT NOT NULL,
          room_version INTEGER NOT NULL,
          step_no INTEGER NOT NULL,
          frame_hash TEXT NOT NULL,
          phenomenon TEXT,
          author_identity TEXT CHECK (author_identity IS NULL OR author_identity IN ('github_user', 'hosted')),
          status TEXT NOT NULL DEFAULT 'draft',
          github_issue_number INTEGER,
          github_issue_url TEXT,
          evidence_expires_at INTEGER,
          claim_token TEXT,
          claimed_at INTEGER,
          next_attempt_at INTEGER,
          submitted_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bug_reports_reporter_created
          ON bug_reports(reporter_user_id, created_at);
        CREATE INDEX idx_bug_reports_room_created
          ON bug_reports(room_id, created_at);
        CREATE INDEX idx_bug_reports_delivery
          ON bug_reports(status, next_attempt_at);

        CREATE TABLE bug_report_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          outcome TEXT NOT NULL,
          http_status INTEGER,
          github_request_id TEXT,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          retry_at INTEGER,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bug_report_attempts_submission
          ON bug_report_attempts(submission_id, started_at);
        CREATE INDEX idx_bug_report_attempts_expires
          ON bug_report_attempts(expires_at);

        CREATE TABLE bug_report_evidence_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id),
          maintainer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          room_id TEXT NOT NULL,
          step_no INTEGER NOT NULL,
          frame_hash TEXT NOT NULL,
          perspective TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bug_report_evidence_audit_submission
          ON bug_report_evidence_audit(submission_id, created_at);

        INSERT INTO game_contexts (
          room_id, lifecycle, phase, replay_status, expires_at, removal_reason, created_at, updated_at
        )
        SELECT
          id,
          'active',
          CASE WHEN status = 'waiting' THEN 'waiting' ELSE 'playing' END,
          NULL,
          NULL,
          NULL,
          created_at,
          updated_at
        FROM rooms
        WHERE status != 'finished'
        ON CONFLICT(room_id) DO NOTHING;

        INSERT INTO game_contexts (
          room_id, lifecycle, phase, replay_status, expires_at, removal_reason, created_at, updated_at
        )
        SELECT
          room_id,
          'completed',
          NULL,
          'legacy_no_replay',
          NULL,
          NULL,
          started_at,
          finished_at
        FROM game_results
        WHERE 1
        ON CONFLICT(room_id) DO UPDATE SET
          lifecycle = 'completed',
          phase = NULL,
          replay_status = 'legacy_no_replay',
          expires_at = NULL,
          removal_reason = NULL,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at;

      `,
    },
    {
      version: 22,
      sql: `
        ALTER TABLE rooms ADD COLUMN replay_recording INTEGER;
        ALTER TABLE rooms ADD COLUMN replay_viewer_build_id TEXT;
        ALTER TABLE rooms ADD COLUMN replay_game_build_id TEXT;

        CREATE TRIGGER expire_game_context_after_room_delete
        AFTER DELETE ON rooms
        BEGIN
          UPDATE game_contexts
          SET lifecycle = 'expired',
              phase = NULL,
              expires_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
              updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
          WHERE room_id = OLD.id AND lifecycle = 'active';
        END;
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
