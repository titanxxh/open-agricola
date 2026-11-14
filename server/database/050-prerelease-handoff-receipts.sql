-- Source consumption must survive rollback of the local principal/session write.
-- The receipt contains no display profile, raw session token or formal credential.
CREATE SEQUENCE prerelease_handoff_sequence;
ALTER TABLE prerelease_external_identities ADD COLUMN logout_all_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE prerelease_browser_handoffs
  ADD COLUMN source_user_id text,
  ADD COLUMN source_grant_id text,
  ADD COLUMN handoff_request_hash text,
  ADD COLUMN exchanged_at bigint,
  ADD COLUMN binding_build_id text,
  ADD COLUMN binding_generation_id text,
  ADD COLUMN binding_target_origin text,
  ADD COLUMN started_sequence bigint;
ALTER TABLE prerelease_browser_handoffs ADD CONSTRAINT prerelease_handoff_receipt_complete CHECK (
  (source_user_id IS NULL AND source_grant_id IS NULL AND handoff_request_hash IS NULL AND exchanged_at IS NULL)
  OR (source_user_id IS NOT NULL AND source_grant_id IS NOT NULL AND handoff_request_hash IS NOT NULL
    AND exchanged_at IS NOT NULL AND started_sequence IS NOT NULL AND binding_build_id IS NOT NULL
    AND binding_generation_id IS NOT NULL AND binding_target_origin IS NOT NULL)
);
CREATE INDEX idx_prerelease_handoff_receipt_user ON prerelease_browser_handoffs(source_user_id) WHERE source_user_id IS NOT NULL;

CREATE INDEX idx_prerelease_browser_handoff_expiry ON prerelease_browser_handoffs(expires_at);
