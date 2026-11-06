CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id, created_at);

CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at);
