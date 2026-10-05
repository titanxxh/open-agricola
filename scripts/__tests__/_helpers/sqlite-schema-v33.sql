-- Frozen main schema 33, only for constructing one-time import fixtures.
CREATE TABLE schema_version (
      version INTEGER PRIMARY KEY
    );
CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login_at INTEGER
        , password_updated_at INTEGER, email TEXT COLLATE NOCASE, email_verified_at INTEGER, email_verification_sent_at INTEGER);
CREATE TABLE sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
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
        , enable_parent_cards INTEGER NOT NULL DEFAULT 0, enable_through_the_seasons INTEGER NOT NULL DEFAULT 0, enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0, allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0, draft_parents INTEGER, started_at INTEGER, replay_recording INTEGER, replay_viewer_build_id TEXT, replay_game_build_id TEXT, custom_cards_runtime_json TEXT, hotseat INTEGER NOT NULL DEFAULT 0, enable_snake_opening INTEGER NOT NULL DEFAULT 0);
CREATE TABLE room_players (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          player_index INTEGER NOT NULL,
          joined_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, user_id)
        );
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
          art_url TEXT,
          art_prompt TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        , featured INTEGER NOT NULL DEFAULT 0, code_manifest TEXT, github_pr_url TEXT, github_pr_status TEXT, github_pr_last_synced_at INTEGER, draft_revision INTEGER NOT NULL DEFAULT 1, draft_generation_json TEXT NOT NULL DEFAULT '{}', sandbox_pass_version_id TEXT, sandbox_passed_at INTEGER, review_status TEXT NOT NULL DEFAULT 'unsubmitted', live INTEGER NOT NULL DEFAULT 0, approved_commit_sha TEXT, approved_review_id TEXT, approved_at INTEGER, approved_version_id TEXT, built_in INTEGER NOT NULL DEFAULT 0, review_commit_sha TEXT, review_version_id TEXT);
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
CREATE TABLE sandbox_cards (
          user_id TEXT NOT NULL REFERENCES users(id),
          workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, workshop_card_id)
        );
CREATE TABLE workshop_card_versions (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
          card_json TEXT NOT NULL,
          -- effect_dsl/effect_code/compiled_code created here historically
          -- (v2/v3) and dropped in v7 below; new DBs walk through both.
          art_url TEXT,
          version_number INTEGER NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at INTEGER NOT NULL
        , code_manifest TEXT, content_hash TEXT, provenance_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE sandbox_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          player_count INTEGER NOT NULL DEFAULT 2,
          deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
          updated_at INTEGER NOT NULL
        , enable_through_the_seasons INTEGER NOT NULL DEFAULT 0, enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0, allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0, enable_snake_opening INTEGER NOT NULL DEFAULT 0);
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
CREATE TABLE oauth_states (
          state_hash TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          intent TEXT NOT NULL,
          user_id TEXT,
          return_to TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER
        , invite_code_hash TEXT, pkce_verifier_ciphertext BLOB, pkce_verifier_nonce BLOB, pkce_verifier_tag BLOB, pkce_verifier_key_id TEXT);
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
        , return_to TEXT, invite_code_hash TEXT);
CREATE TABLE account_invites (
          id TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL UNIQUE,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          used_at INTEGER,
          revoked_at INTEGER
        , max_uses INTEGER NOT NULL DEFAULT 1, use_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE reserved_usernames (
          username TEXT PRIMARY KEY COLLATE NOCASE,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
CREATE TABLE email_verification_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER
        );
CREATE TABLE game_results (
          room_id TEXT PRIMARY KEY,
          started_at INTEGER NOT NULL,
          finished_at INTEGER NOT NULL,
          rounds_played INTEGER NOT NULL,
          player_count INTEGER NOT NULL,
          enable_community_deck INTEGER NOT NULL,
          enable_parent_cards INTEGER NOT NULL,
          enable_through_the_seasons INTEGER NOT NULL,
          enable_farmers_of_the_moor INTEGER NOT NULL
        , enable_snake_opening INTEGER NOT NULL DEFAULT 0);
CREATE TABLE game_result_players (
          room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
          player_index INTEGER NOT NULL,
          game_player_id TEXT NOT NULL,
          user_id TEXT,
          display_name TEXT NOT NULL,
          score INTEGER NOT NULL, name_is_default INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (room_id, player_index)
        );
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
        , last_error_code TEXT, discarded_at INTEGER, github_issue_state TEXT CHECK (github_issue_state IS NULL OR github_issue_state IN ('open', 'closed', 'deleted')), duplicate_confirmed_at INTEGER, confirmed_github_user_id TEXT);
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
CREATE TABLE bug_report_evidence_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id),
          maintainer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          maintainer_identity TEXT NOT NULL,
          room_id TEXT NOT NULL,
          step_no INTEGER NOT NULL,
          frame_hash TEXT NOT NULL,
          perspective TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
CREATE TRIGGER expire_game_context_after_room_delete
        AFTER DELETE ON rooms
        BEGIN
          DELETE FROM game_replay_steps
          WHERE room_id = OLD.id
            AND EXISTS (
              SELECT 1 FROM game_contexts
              WHERE room_id = OLD.id AND lifecycle = 'active'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM bug_reports AS report
              JOIN game_replay_steps AS anchor
                ON anchor.room_id = report.room_id
               AND anchor.step_no = report.step_no
              WHERE report.room_id = OLD.id
                AND report.evidence_expires_at >
                  CAST(strftime('%s', 'now') AS INTEGER) * 1000
                AND game_replay_steps.step_no
                  BETWEEN anchor.checkpoint_step_no AND report.step_no
            );

          UPDATE game_replays
          SET latest_step_no = (
            SELECT MAX(step_no)
            FROM game_replay_steps
            WHERE room_id = OLD.id
          )
          WHERE room_id = OLD.id
            AND EXISTS (
              SELECT 1 FROM game_contexts
              WHERE room_id = OLD.id AND lifecycle = 'active'
            )
            AND EXISTS (
              SELECT 1 FROM game_replay_steps
              WHERE room_id = OLD.id
            );

          DELETE FROM game_replays
          WHERE room_id = OLD.id
            AND EXISTS (
              SELECT 1 FROM game_contexts
              WHERE room_id = OLD.id AND lifecycle = 'active'
            )
            AND NOT EXISTS (
              SELECT 1 FROM game_replay_steps
              WHERE room_id = OLD.id
            );

          UPDATE game_contexts
          SET lifecycle = 'expired',
              phase = NULL,
              expires_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
              updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
          WHERE room_id = OLD.id AND lifecycle = 'active';
        END;
CREATE TABLE account_deletion_requests (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            requested_at INTEGER NOT NULL,
            next_attempt_at INTEGER NOT NULL,
            last_error_code TEXT
          );
CREATE TABLE github_grant_revocations (
            token_hash TEXT PRIMARY KEY,
            access_token_ciphertext BLOB NOT NULL,
            access_token_nonce BLOB NOT NULL,
            access_token_tag BLOB NOT NULL,
            key_id TEXT NOT NULL,
            next_attempt_at INTEGER NOT NULL,
            last_error_code TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
CREATE TABLE game_context_participants (
            room_id TEXT NOT NULL REFERENCES game_contexts(room_id) ON DELETE CASCADE,
            player_index INTEGER NOT NULL,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            PRIMARY KEY (room_id, player_index)
          );
CREATE TRIGGER preserve_game_context_participants_before_room_delete
          BEFORE DELETE ON rooms
          WHEN EXISTS (
            SELECT 1 FROM game_contexts
            WHERE room_id = OLD.id AND lifecycle = 'active'
          )
          BEGIN
            INSERT OR IGNORE INTO game_context_participants (
              room_id, player_index, user_id
            )
            SELECT OLD.id, player_index, user_id
            FROM room_players
            WHERE room_id = OLD.id;
          END;
CREATE TABLE github_webhook_events (
            delivery_id TEXT PRIMARY KEY,
            event_name TEXT NOT NULL,
            received_at INTEGER NOT NULL
          );
CREATE TABLE room_history_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, kind TEXT NOT NULL, previous_id TEXT,
  length INTEGER NOT NULL, record_json TEXT NOT NULL, identity_json TEXT NOT NULL,
  checksum TEXT NOT NULL, PRIMARY KEY (room_id, node_id)
);
CREATE TABLE room_recovery_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, kind TEXT NOT NULL, body_json TEXT NOT NULL,
  checksum TEXT NOT NULL, PRIMARY KEY (room_id, node_id)
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_workshop_author ON workshop_cards(author_id);
CREATE INDEX idx_comments_card ON card_comments(card_id);
CREATE INDEX idx_versions_card ON workshop_card_versions(card_id);
CREATE INDEX idx_propose_audit_user ON github_propose_audit(user_id, created_at DESC);
CREATE INDEX idx_propose_audit_card ON github_propose_audit(workshop_card_id);
CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX idx_oauth_onboarding_expires ON oauth_onboarding_tickets(expires_at);
CREATE INDEX idx_account_invites_created ON account_invites(created_at DESC);
CREATE INDEX idx_account_invites_used ON account_invites(used_at);
CREATE INDEX idx_account_invites_expires ON account_invites(expires_at);
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at);
CREATE INDEX idx_game_contexts_lifecycle ON game_contexts(lifecycle);
CREATE INDEX idx_game_replay_steps_checkpoint
          ON game_replay_steps(room_id, checkpoint_step_no, step_no);
CREATE INDEX idx_bug_reports_reporter_created
          ON bug_reports(reporter_user_id, created_at);
CREATE INDEX idx_bug_reports_room_created
          ON bug_reports(room_id, created_at);
CREATE INDEX idx_bug_reports_delivery
          ON bug_reports(status, next_attempt_at);
CREATE INDEX idx_bug_report_attempts_submission
          ON bug_report_attempts(submission_id, started_at);
CREATE INDEX idx_bug_report_attempts_expires
          ON bug_report_attempts(expires_at);
CREATE INDEX idx_bug_report_evidence_audit_submission
          ON bug_report_evidence_audit(submission_id, created_at);
CREATE INDEX idx_bug_report_evidence_audit_maintainer
          ON bug_report_evidence_audit(maintainer_user_id, created_at);
CREATE INDEX idx_account_deletion_requests_due
            ON account_deletion_requests(next_attempt_at);
CREATE INDEX idx_github_grant_revocations_due
            ON github_grant_revocations(next_attempt_at);
CREATE INDEX idx_game_context_participants_user
            ON game_context_participants(user_id);
CREATE INDEX idx_workshop_review_status ON workshop_cards(review_status);
CREATE UNIQUE INDEX idx_workshop_card_id_gated
            ON workshop_cards(card_id) WHERE review_status IN ('approved', 'merged');
INSERT INTO schema_version VALUES (33);
