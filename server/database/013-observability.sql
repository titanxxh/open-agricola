-- One-use cross-site navigation grants retain the original session's revocation semantics.
CREATE TABLE observability_tickets (
  ticket_hash TEXT PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX observability_tickets_expiry ON observability_tickets(expires_at);
-- Private, expiring presence; identities are never exported as metric labels.
CREATE TABLE observability_presence (
  instance_id TEXT NOT NULL REFERENCES app_instances(instance_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY(instance_id,user_id)
);
