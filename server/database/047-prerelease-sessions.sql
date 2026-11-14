-- A pre principal is an external identity, never a second password/OAuth account.
ALTER TABLE users ADD COLUMN identity_origin text NOT NULL DEFAULT 'local' CHECK(identity_origin IN ('local','external'));
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_identity_credentials CHECK (
  (identity_origin='local' AND password_hash IS NOT NULL)
  OR (identity_origin='external' AND password_hash IS NULL AND email IS NULL AND email_verified_at IS NULL AND password_updated_at IS NULL)
);

CREATE TABLE prerelease_external_identities (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_grant_id text NOT NULL,
  generation_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 0
);
-- Account ownership/access columns are separate from rule/player IDs in game JSON.
-- Keep unbound native references visible: the owner must not mistake them for empty data.
CREATE VIEW prerelease_retained_identity_refs AS
  WITH retained(user_id) AS (
    SELECT id FROM users
    UNION SELECT user_id FROM prerelease_external_identities
    UNION SELECT created_by FROM rooms WHERE created_by IS NOT NULL
    UNION SELECT jsonb_array_elements_text(invited_user_ids) FROM rooms WHERE invited_user_ids IS NOT NULL
    UNION SELECT user_id FROM room_players
    UNION SELECT user_id FROM game_result_players WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_context_participants WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_termination_players WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_opening_accounts
  )
  SELECT retained.user_id,projection.source_grant_id FROM retained
    LEFT JOIN prerelease_external_identities projection ON projection.user_id=retained.user_id;

CREATE TABLE prerelease_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES prerelease_external_identities(user_id) ON DELETE CASCADE,
  grant_id text NOT NULL,
  generation_id text NOT NULL,
  build_id text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  identity_state text NOT NULL,
  revoked_at bigint,
  handoff_request_hash text,
  handoff_return_path text,
  CHECK ((handoff_request_hash IS NULL AND handoff_return_path IS NULL)
    OR (handoff_request_hash IS NOT NULL AND handoff_return_path IS NOT NULL
      AND handoff_request_hash ~ '^[A-Za-z0-9_-]{43}$' AND handoff_return_path LIKE '/open-agricola/%'))
);
CREATE INDEX idx_prerelease_sessions_grant ON prerelease_sessions(grant_id);
CREATE INDEX idx_prerelease_sessions_user ON prerelease_sessions(user_id);
CREATE TABLE prerelease_browser_handoffs (
  cookie_hash text PRIMARY KEY,
  browser_verifier text NOT NULL,
  state text NOT NULL,
  return_path text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE prerelease_processed_identity_events (
  event_id text PRIMARY KEY,
  generation_id text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('revoked','deleted','rechecked')),
  completed_at bigint NOT NULL,
  acknowledged_at bigint
);
CREATE TABLE prerelease_revoked_grants (
  grant_id text PRIMARY KEY,
  user_id text NOT NULL,
  generation_id text NOT NULL,
  revoked_at bigint NOT NULL
);
CREATE TABLE prerelease_deleted_subjects (
  user_id text PRIMARY KEY,
  deleted_at bigint NOT NULL
);

CREATE FUNCTION refuse_external_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND identity_origin='external') THEN
    RAISE EXCEPTION 'External prerelease principals cannot own local login credentials';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refuse_external_session BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION refuse_external_credentials();
CREATE TRIGGER refuse_external_oauth BEFORE INSERT OR UPDATE ON auth_identities FOR EACH ROW EXECUTE FUNCTION refuse_external_credentials();
CREATE TRIGGER refuse_external_reset BEFORE INSERT OR UPDATE ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION refuse_external_credentials();
