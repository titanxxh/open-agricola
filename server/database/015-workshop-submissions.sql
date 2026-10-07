CREATE TABLE workshop_submissions (
  id text PRIMARY KEY,
  card_id text NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_id text NOT NULL,
  revision bigint NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete', 'blocked', 'failed')),
  phase text NOT NULL DEFAULT 'prepare',
  payload text NOT NULL,
  lease_owner text,
  lease_until bigint NOT NULL DEFAULT 0,
  error_code text,
  retry_at bigint NOT NULL DEFAULT 0,
  attempts bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE UNIQUE INDEX workshop_submission_pending_card ON workshop_submissions(card_id) WHERE state = 'pending';
CREATE INDEX workshop_submission_history ON workshop_submissions(card_id, created_at DESC);
