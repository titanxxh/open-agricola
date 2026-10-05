CREATE TABLE request_rate_limits (
  scope text NOT NULL,
  subject text NOT NULL,
  count bigint NOT NULL,
  reset_at bigint NOT NULL,
  PRIMARY KEY (scope, subject)
);
CREATE INDEX request_rate_limits_expiry ON request_rate_limits (reset_at);
CREATE TABLE workshop_oauth_handshakes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL,
  callback_claimed bigint NOT NULL DEFAULT 0,
  token_ciphertext bytea,
  token_nonce bytea,
  token_tag bytea,
  token_key_id text
);
CREATE INDEX workshop_oauth_handshakes_expiry ON workshop_oauth_handshakes (expires_at);
