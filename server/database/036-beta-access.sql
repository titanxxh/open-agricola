CREATE TABLE beta_access (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by text REFERENCES users(id) ON DELETE SET NULL,
  granted_at bigint NOT NULL
);
