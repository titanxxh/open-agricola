CREATE TABLE prerelease_identity_generations (
  id text PRIMARY KEY,
  target_origin text NOT NULL,
  target_id text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  admission_open boolean NOT NULL DEFAULT false,
  prepared_at bigint NOT NULL,
  retired_at bigint,
  CHECK (retired_at IS NULL OR NOT admission_open)
);
CREATE UNIQUE INDEX idx_prerelease_current_generation ON prerelease_identity_generations(target_origin) WHERE is_current;

-- Upgrade associations without claiming that any isolated projection has been erased.
INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at)
  SELECT gen_random_uuid()::text,target_origin,'legacy',MIN(created_at) FROM (
    SELECT target_origin,created_at FROM prerelease_identity_grants
    UNION ALL SELECT target_origin,created_at FROM prerelease_identity_events
    UNION ALL SELECT target_origin,created_at FROM prerelease_identity_handoffs
  ) sources GROUP BY target_origin;
ALTER TABLE prerelease_identity_grants ADD COLUMN generation_id text REFERENCES prerelease_identity_generations(id);
ALTER TABLE prerelease_identity_grants ADD COLUMN projection_erased_at bigint;
UPDATE prerelease_identity_grants g SET generation_id=n.id,
  revoked_at=COALESCE(revoked_at,(extract(epoch FROM clock_timestamp())*1000)::bigint)
  FROM prerelease_identity_generations n WHERE n.target_origin=g.target_origin;
ALTER TABLE prerelease_identity_grants ALTER COLUMN generation_id SET NOT NULL;
DELETE FROM prerelease_identity_handoffs;
ALTER TABLE prerelease_identity_handoffs ADD COLUMN generation_id text NOT NULL REFERENCES prerelease_identity_generations(id);
ALTER TABLE prerelease_identity_events ADD COLUMN generation_id text REFERENCES prerelease_identity_generations(id);
UPDATE prerelease_identity_events e SET generation_id=n.id FROM prerelease_identity_generations n WHERE n.target_origin=e.target_origin;
ALTER TABLE prerelease_identity_events ALTER COLUMN generation_id SET NOT NULL;
CREATE INDEX idx_prerelease_grants_generation ON prerelease_identity_grants(generation_id);
CREATE INDEX idx_prerelease_events_generation ON prerelease_identity_events(generation_id,created_at) WHERE acknowledged_at IS NULL;

CREATE TABLE prerelease_identity_owner_operations (
  operation_id text PRIMARY KEY,
  generation_id text NOT NULL REFERENCES prerelease_identity_generations(id),
  action text NOT NULL CHECK(action IN ('prepare','activate','close','retire')),
  request_hash text NOT NULL,
  completed_at bigint NOT NULL,
  purge_receipt_sha256 text,
  CHECK ((action='retire') = (purge_receipt_sha256 IS NOT NULL))
);
CREATE UNIQUE INDEX idx_prerelease_retirement_receipt ON prerelease_identity_owner_operations(generation_id) WHERE action='retire';
ALTER TABLE prerelease_identity_events ADD COLUMN erasure_operation_id text REFERENCES prerelease_identity_owner_operations(operation_id);

CREATE OR REPLACE FUNCTION prerelease_source_revoked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('open-agricola:prerelease-identity',0));
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at,generation_id)
    SELECT gen_random_uuid()::text,g.target_origin,g.user_id,g.id,'source_revoked',
      (extract(epoch FROM clock_timestamp())*1000)::bigint,g.generation_id
    FROM prerelease_identity_grants g JOIN prerelease_identity_generations n ON n.id=g.generation_id
    WHERE g.source_token=OLD.token AND g.projection_erased_at IS NULL AND n.retired_at IS NULL;
  UPDATE prerelease_identity_grants SET revoked_at=COALESCE(revoked_at,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    WHERE source_token=OLD.token;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION prerelease_account_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('open-agricola:prerelease-identity',0));
  IF TG_TABLE_NAME='users' THEN subject := OLD.id; ELSE subject := NEW.user_id; END IF;
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at,generation_id)
    SELECT gen_random_uuid()::text,g.target_origin,subject,NULL,'account_deleted',
      (extract(epoch FROM clock_timestamp())*1000)::bigint,g.generation_id
    FROM prerelease_identity_grants g JOIN prerelease_identity_generations n ON n.id=g.generation_id
    WHERE g.user_id=subject AND g.projection_erased_at IS NULL AND n.retired_at IS NULL AND NOT EXISTS(
      SELECT 1 FROM prerelease_identity_events e WHERE e.user_id=subject AND e.generation_id=g.generation_id AND e.kind='account_deleted'
    ) GROUP BY g.target_origin,g.generation_id;
  UPDATE prerelease_identity_grants SET revoked_at=COALESCE(revoked_at,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    WHERE user_id=subject;
  IF TG_TABLE_NAME='users' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION prerelease_beta_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('open-agricola:prerelease-identity',0));
  IF TG_OP='DELETE' THEN subject := OLD.user_id; ELSE subject := NEW.user_id; END IF;
  INSERT INTO prerelease_identity_events(id,target_origin,user_id,grant_id,kind,created_at,generation_id)
    SELECT gen_random_uuid()::text,g.target_origin,subject,NULL,'beta_changed',
      (extract(epoch FROM clock_timestamp())*1000)::bigint,g.generation_id
    FROM prerelease_identity_grants g JOIN prerelease_identity_generations n ON n.id=g.generation_id
    WHERE g.user_id=subject AND g.projection_erased_at IS NULL AND n.retired_at IS NULL GROUP BY g.target_origin,g.generation_id;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Restored privacy associations never carry a source session or login permission.
ALTER TABLE prerelease_identity_grants ADD COLUMN restored_from_grant_id text REFERENCES prerelease_identity_grants(id);
CREATE UNIQUE INDEX idx_prerelease_restored_principal ON prerelease_identity_grants(generation_id,user_id) WHERE restored_from_grant_id IS NOT NULL;
ALTER TABLE prerelease_identity_owner_operations DROP CONSTRAINT prerelease_identity_owner_operations_action_check;
ALTER TABLE prerelease_identity_owner_operations ADD CHECK(action IN ('prepare','activate','close','retire','associate','audit-complete'));
ALTER TABLE prerelease_identity_owner_operations ADD COLUMN identity_manifest_sha256 text;
ALTER TABLE prerelease_identity_owner_operations ADD COLUMN identity_count bigint;
ALTER TABLE prerelease_identity_owner_operations ADD COLUMN verification_receipt_sha256 text;
ALTER TABLE prerelease_identity_owner_operations ADD COLUMN audit_operation_id text REFERENCES prerelease_identity_owner_operations(operation_id);
ALTER TABLE prerelease_identity_owner_operations ADD CHECK((action='audit-complete') = (identity_manifest_sha256 IS NOT NULL AND identity_count IS NOT NULL AND verification_receipt_sha256 IS NOT NULL));
ALTER TABLE prerelease_identity_owner_operations ADD CHECK((action='activate') = (audit_operation_id IS NOT NULL));
-- Keep the audit pointer out of the generation/operation FK cycle for data-only restores.
-- Runtime reads verify that it names this generation's immutable completion receipt.
ALTER TABLE prerelease_identity_generations ADD COLUMN audit_operation_id text;

ALTER TABLE prerelease_identity_generations ADD CHECK(NOT admission_open OR audit_operation_id IS NOT NULL);
