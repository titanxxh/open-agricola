-- Source login secrets never leave this database. Grant IDs only identify associations.
CREATE TABLE prerelease_identity_grants (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  source_token text REFERENCES sessions(token) ON DELETE SET NULL,
  target_origin text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  revoked_at bigint
);
CREATE INDEX idx_prerelease_grants_source ON prerelease_identity_grants(source_token);
CREATE INDEX idx_prerelease_grants_user ON prerelease_identity_grants(user_id, target_origin);

CREATE TABLE prerelease_identity_handoffs (
  code_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_token text NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  target_origin text NOT NULL,
  browser_challenge text NOT NULL,
  return_to text NOT NULL,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX idx_prerelease_handoffs_expires ON prerelease_identity_handoffs(expires_at);

-- Events survive formal account deletion until the isolated target confirms its work.
CREATE TABLE prerelease_identity_events (
  id text PRIMARY KEY,
  target_origin text NOT NULL,
  user_id text NOT NULL,
  grant_id text,
  kind text NOT NULL CHECK(kind IN ('source_revoked','account_deleted','beta_changed')),
  created_at bigint NOT NULL,
  acknowledged_at bigint,
  CHECK ((kind='source_revoked') = (grant_id IS NOT NULL))
);
CREATE INDEX idx_prerelease_identity_pending ON prerelease_identity_events(target_origin, created_at) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_prerelease_identity_user ON prerelease_identity_events(user_id);

CREATE FUNCTION prerelease_source_revoked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at)
    SELECT gen_random_uuid()::text,target_origin,user_id,id,'source_revoked',
      (extract(epoch FROM clock_timestamp())*1000)::bigint
    FROM prerelease_identity_grants WHERE source_token=OLD.token;
  UPDATE prerelease_identity_grants SET revoked_at=COALESCE(revoked_at,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    WHERE source_token=OLD.token;
  RETURN OLD;
END $$;
CREATE TRIGGER prerelease_source_revoked BEFORE DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION prerelease_source_revoked();

CREATE FUNCTION prerelease_account_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject text;
BEGIN
  IF TG_TABLE_NAME='users' THEN subject := OLD.id; ELSE subject := NEW.user_id; END IF;
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at)
    SELECT gen_random_uuid()::text,g.target_origin,subject,NULL,'account_deleted',
      (extract(epoch FROM clock_timestamp())*1000)::bigint
    FROM prerelease_identity_grants g WHERE g.user_id=subject AND NOT EXISTS(
      SELECT 1 FROM prerelease_identity_events e WHERE e.user_id=subject AND e.target_origin=g.target_origin AND e.kind='account_deleted'
    ) GROUP BY g.target_origin;
  UPDATE prerelease_identity_grants SET revoked_at=COALESCE(revoked_at,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    WHERE user_id=subject;
  IF TG_TABLE_NAME='users' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER prerelease_account_deletion_requested AFTER INSERT ON account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION prerelease_account_deleted();
CREATE TRIGGER prerelease_account_deleted BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION prerelease_account_deleted();

CREATE FUNCTION prerelease_beta_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject text;
BEGIN
  IF TG_OP='DELETE' THEN subject := OLD.user_id; ELSE subject := NEW.user_id; END IF;
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at)
    SELECT gen_random_uuid()::text,target_origin,subject,NULL,'beta_changed',
      (extract(epoch FROM clock_timestamp())*1000)::bigint
    FROM prerelease_identity_grants WHERE user_id=subject GROUP BY target_origin;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER prerelease_beta_changed AFTER INSERT OR DELETE ON beta_access
  FOR EACH ROW EXECUTE FUNCTION prerelease_beta_changed();
