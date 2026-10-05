-- PostgreSQL platform schema. Exact recovery text stays TEXT; Replay payload stays BYTEA.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TABLE schema_version (
  version BIGINT PRIMARY KEY
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username CITEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT,
  password_updated_at BIGINT,
  email CITEXT,
  email_verified_at BIGINT,
  email_verification_sent_at BIGINT
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  state_json TEXT,
  max_players BIGINT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'waiting',
  version BIGINT NOT NULL DEFAULT 0,
  custom_card_ids TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  enable_parent_cards BIGINT NOT NULL DEFAULT 0,
  enable_through_the_seasons BIGINT NOT NULL DEFAULT 0,
  enable_farmers_of_the_moor BIGINT NOT NULL DEFAULT 0,
  allow_incomplete_farmers_of_the_moor_minor_deal BIGINT NOT NULL DEFAULT 0,
  draft_parents BIGINT,
  started_at BIGINT,
  replay_recording BIGINT,
  replay_viewer_build_id TEXT,
  replay_game_build_id TEXT,
  custom_cards_runtime_json TEXT,
  hotseat BIGINT NOT NULL DEFAULT 0,
  enable_snake_opening BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  player_index BIGINT NOT NULL,
  joined_at BIGINT NOT NULL,
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
  art_url TEXT,
  art_prompt TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  featured BIGINT NOT NULL DEFAULT 0,
  code_manifest TEXT,
  github_pr_url TEXT,
  github_pr_status TEXT,
  github_pr_last_synced_at BIGINT,
  draft_revision BIGINT NOT NULL DEFAULT 1,
  draft_generation_json TEXT NOT NULL DEFAULT '{}',
  sandbox_pass_version_id TEXT,
  sandbox_passed_at BIGINT,
  review_status TEXT NOT NULL DEFAULT 'unsubmitted',
  live BIGINT NOT NULL DEFAULT 0,
  approved_commit_sha TEXT,
  approved_review_id TEXT,
  approved_at BIGINT,
  approved_version_id TEXT,
  built_in BIGINT NOT NULL DEFAULT 0,
  review_commit_sha TEXT,
  review_version_id TEXT
);

CREATE INDEX idx_workshop_author ON workshop_cards(author_id);

CREATE TABLE card_likes (
  user_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_comments_card ON card_comments(card_id);

CREATE TABLE sandbox_cards (
  user_id TEXT NOT NULL REFERENCES users(id),
  workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  added_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, workshop_card_id)
);

CREATE TABLE workshop_card_versions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  card_json TEXT NOT NULL,
  art_url TEXT,
  version_number BIGINT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  code_manifest TEXT,
  content_hash TEXT,
  provenance_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_versions_card ON workshop_card_versions(card_id);

CREATE TABLE sandbox_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  player_count BIGINT NOT NULL DEFAULT 2,
  deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
  updated_at BIGINT NOT NULL,
  enable_through_the_seasons BIGINT NOT NULL DEFAULT 0,
  enable_farmers_of_the_moor BIGINT NOT NULL DEFAULT 0,
  allow_incomplete_farmers_of_the_moor_minor_deal BIGINT NOT NULL DEFAULT 0,
  enable_snake_opening BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE github_propose_rate_limit (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  last_propose_at BIGINT NOT NULL
);

CREATE TABLE github_propose_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workshop_card_id TEXT NOT NULL,
  action TEXT NOT NULL,
  pr_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_propose_audit_user ON github_propose_audit(user_id, created_at DESC);

CREATE INDEX idx_propose_audit_card ON github_propose_audit(workshop_card_id);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_login TEXT,
  provider_email TEXT,
  provider_email_verified BIGINT NOT NULL DEFAULT 0,
  display_name TEXT,
  avatar_url TEXT,
  linked_at BIGINT NOT NULL,
  last_login_at BIGINT,
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
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  used_at BIGINT,
  invite_code_hash TEXT,
  pkce_verifier_ciphertext BYTEA,
  pkce_verifier_nonce BYTEA,
  pkce_verifier_tag BYTEA,
  pkce_verifier_key_id TEXT
);

CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

CREATE TABLE oauth_onboarding_tickets (
  ticket_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_login TEXT,
  provider_email TEXT,
  provider_email_verified BIGINT NOT NULL DEFAULT 0,
  display_name TEXT,
  avatar_url TEXT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  used_at BIGINT,
  return_to TEXT,
  invite_code_hash TEXT
);

CREATE INDEX idx_oauth_onboarding_expires ON oauth_onboarding_tickets(expires_at);

CREATE TABLE account_invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at BIGINT,
  revoked_at BIGINT,
  max_uses BIGINT NOT NULL DEFAULT 1,
  use_count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_account_invites_created ON account_invites(created_at DESC);

CREATE INDEX idx_account_invites_used ON account_invites(used_at);

CREATE INDEX idx_account_invites_expires ON account_invites(expires_at);

CREATE TABLE reserved_usernames (
  username CITEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);

CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at);

CREATE TABLE game_results (
  room_id TEXT PRIMARY KEY,
  started_at BIGINT NOT NULL,
  finished_at BIGINT NOT NULL,
  rounds_played BIGINT NOT NULL,
  player_count BIGINT NOT NULL,
  enable_community_deck BIGINT NOT NULL,
  enable_parent_cards BIGINT NOT NULL,
  enable_through_the_seasons BIGINT NOT NULL,
  enable_farmers_of_the_moor BIGINT NOT NULL,
  enable_snake_opening BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE game_result_players (
  room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
  player_index BIGINT NOT NULL,
  game_player_id TEXT NOT NULL,
  user_id TEXT,
  display_name TEXT NOT NULL,
  score BIGINT NOT NULL,
  name_is_default BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, player_index)
);

CREATE TABLE game_contexts (
  room_id TEXT PRIMARY KEY,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'completed', 'expired', 'removed')),
  phase TEXT CHECK (phase IS NULL OR phase IN ('waiting', 'playing')),
  replay_status TEXT CHECK (replay_status IS NULL OR replay_status IN ('available', 'legacy_no_replay')),
  expires_at BIGINT,
  removal_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_game_contexts_lifecycle ON game_contexts(lifecycle);

CREATE TABLE game_replays (
  room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id),
  schema_version BIGINT NOT NULL,
  viewer_build_id TEXT NOT NULL,
  game_build_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recording', 'completed')),
  latest_step_no BIGINT NOT NULL,
  missing_prefix BIGINT NOT NULL DEFAULT 0,
  custom_cards_json TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE TABLE game_replay_steps (
  room_id TEXT NOT NULL REFERENCES game_replays(room_id) ON DELETE CASCADE,
  step_no BIGINT NOT NULL,
  room_version BIGINT NOT NULL,
  checkpoint_step_no BIGINT NOT NULL,
  player_index BIGINT,
  command_type TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  payload_kind TEXT NOT NULL CHECK (payload_kind IN ('checkpoint', 'delta')),
  payload_gzip BYTEA NOT NULL,
  frame_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (room_id, step_no)
);

CREATE INDEX idx_game_replay_steps_checkpoint
          ON game_replay_steps(room_id, checkpoint_step_no, step_no);

CREATE TABLE issue_submission_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_user_id TEXT NOT NULL UNIQUE,
  access_token_ciphertext BYTEA NOT NULL,
  access_token_nonce BYTEA NOT NULL,
  access_token_tag BYTEA NOT NULL,
  refresh_token_ciphertext BYTEA,
  refresh_token_nonce BYTEA,
  refresh_token_tag BYTEA,
  key_id TEXT NOT NULL,
  access_token_expires_at BIGINT NOT NULL,
  refresh_token_expires_at BIGINT,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE bug_reports (
  submission_id TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  room_id TEXT NOT NULL REFERENCES game_contexts(room_id),
  player_index BIGINT NOT NULL,
  lifecycle TEXT NOT NULL,
  room_version BIGINT NOT NULL,
  step_no BIGINT NOT NULL,
  frame_hash TEXT NOT NULL,
  phenomenon TEXT,
  author_identity TEXT CHECK (author_identity IS NULL OR author_identity IN ('github_user', 'hosted')),
  status TEXT NOT NULL DEFAULT 'draft',
  github_issue_number BIGINT,
  github_issue_url TEXT,
  evidence_expires_at BIGINT,
  claim_token TEXT,
  claimed_at BIGINT,
  next_attempt_at BIGINT,
  submitted_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_error_code TEXT,
  discarded_at BIGINT,
  github_issue_state TEXT CHECK (github_issue_state IS NULL OR github_issue_state IN ('open', 'closed', 'deleted')),
  duplicate_confirmed_at BIGINT,
  confirmed_github_user_id TEXT
);

CREATE INDEX idx_bug_reports_reporter_created
          ON bug_reports(reporter_user_id, created_at);

CREATE INDEX idx_bug_reports_room_created
          ON bug_reports(room_id, created_at);

CREATE INDEX idx_bug_reports_delivery
          ON bug_reports(status, next_attempt_at);

CREATE TABLE bug_report_attempts (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  outcome TEXT NOT NULL,
  http_status BIGINT,
  github_request_id TEXT,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  retry_at BIGINT,
  expires_at BIGINT NOT NULL
);

CREATE INDEX idx_bug_report_attempts_submission
          ON bug_report_attempts(submission_id, started_at);

CREATE INDEX idx_bug_report_attempts_expires
          ON bug_report_attempts(expires_at);

CREATE TABLE bug_report_evidence_audit (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id),
  maintainer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  maintainer_identity TEXT NOT NULL,
  room_id TEXT NOT NULL,
  step_no BIGINT NOT NULL,
  frame_hash TEXT NOT NULL,
  perspective TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_bug_report_evidence_audit_submission
          ON bug_report_evidence_audit(submission_id, created_at);

CREATE INDEX idx_bug_report_evidence_audit_maintainer
          ON bug_report_evidence_audit(maintainer_user_id, created_at);

CREATE TABLE account_deletion_requests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at BIGINT NOT NULL,
  next_attempt_at BIGINT NOT NULL,
  last_error_code TEXT
);

CREATE INDEX idx_account_deletion_requests_due
            ON account_deletion_requests(next_attempt_at);

CREATE TABLE github_grant_revocations (
  token_hash TEXT PRIMARY KEY,
  access_token_ciphertext BYTEA NOT NULL,
  access_token_nonce BYTEA NOT NULL,
  access_token_tag BYTEA NOT NULL,
  key_id TEXT NOT NULL,
  next_attempt_at BIGINT NOT NULL,
  last_error_code TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_github_grant_revocations_due
            ON github_grant_revocations(next_attempt_at);

CREATE TABLE game_context_participants (
  room_id TEXT NOT NULL REFERENCES game_contexts(room_id) ON DELETE CASCADE,
  player_index BIGINT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (room_id, player_index)
);

CREATE INDEX idx_game_context_participants_user
            ON game_context_participants(user_id);

CREATE INDEX idx_workshop_review_status ON workshop_cards(review_status);

CREATE UNIQUE INDEX idx_workshop_card_id_gated
            ON workshop_cards(card_id) WHERE review_status IN ('approved', 'merged');

CREATE TABLE github_webhook_events (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  received_at BIGINT NOT NULL
);

CREATE TABLE room_history_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  previous_id TEXT,
  length BIGINT NOT NULL,
  record_json TEXT NOT NULL,
  identity_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  PRIMARY KEY (room_id, node_id)
);

CREATE TABLE room_recovery_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  PRIMARY KEY (room_id, node_id)
);

CREATE FUNCTION expire_game_context_after_room_delete() RETURNS trigger LANGUAGE plpgsql AS $$
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
                  (extract(epoch FROM clock_timestamp()) * 1000)::bigint
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
              expires_at = (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
              updated_at = (extract(epoch FROM clock_timestamp()) * 1000)::bigint
          WHERE room_id = OLD.id AND lifecycle = 'active';
RETURN OLD;
END;
$$;
CREATE TRIGGER expire_game_context_after_room_delete AFTER DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION expire_game_context_after_room_delete();

CREATE FUNCTION preserve_game_context_participants_before_room_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
IF EXISTS (SELECT 1 FROM game_contexts WHERE room_id = OLD.id AND lifecycle = 'active') THEN
INSERT INTO game_context_participants (
              room_id, player_index, user_id
            )
            SELECT OLD.id, player_index, user_id
            FROM room_players
            WHERE room_id = OLD.id ON CONFLICT DO NOTHING;
END IF;
RETURN OLD;
END;
$$;
CREATE TRIGGER preserve_game_context_participants_before_room_delete BEFORE DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION preserve_game_context_participants_before_room_delete();
