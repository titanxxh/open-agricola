CREATE TABLE command_scopes (
  scope_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX command_scopes_actor ON command_scopes(actor_id);
CREATE INDEX command_scopes_expiry ON command_scopes(expires_at);
CREATE TABLE command_requests (
  scope_id TEXT NOT NULL REFERENCES command_scopes(scope_id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  target_room_id TEXT,
  result_room_id TEXT,
  outcome_json TEXT,
  created_at BIGINT NOT NULL,
  completed_at BIGINT,
  PRIMARY KEY(scope_id, command_id)
);
-- Scopes are server-issued and never recreated. Receipts may only be collected
-- together with their expired scope; an unknown scope is never fresh authority.
