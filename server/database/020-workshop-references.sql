-- Public main commits authorized for bounded metadata reads across app instances.
CREATE TABLE workshop_reference_commits (
  commit_sha text PRIMARY KEY CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  expires_at bigint NOT NULL
);
CREATE INDEX workshop_reference_commits_expiry ON workshop_reference_commits (expires_at);

-- GitHub Retry-After/reset applies to the project's credential on every instance.
CREATE TABLE workshop_reference_cooldowns (
  repository text PRIMARY KEY,
  blocked_until bigint NOT NULL
);
