CREATE TABLE execution_epochs (
  kind TEXT NOT NULL CHECK(kind IN ('card','user')),
  subject_id TEXT NOT NULL,
  epoch BIGINT NOT NULL,
  PRIMARY KEY(kind, subject_id)
);
CREATE TABLE invalidation_operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('card','user')),
  subject_id TEXT NOT NULL,
  room_ids TEXT NOT NULL,
  card_ids TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX invalidation_operations_subject ON invalidation_operations(kind, subject_id, created_at);
CREATE TABLE invalidation_tasks (
  operation_id TEXT NOT NULL REFERENCES invalidation_operations(id),
  instance_id TEXT NOT NULL REFERENCES app_instances(instance_id),
  claim_token TEXT,
  claim_until BIGINT,
  completed_at BIGINT,
  PRIMARY KEY(operation_id, instance_id)
);
ALTER TABLE account_deletion_requests ADD COLUMN claim_token TEXT;
ALTER TABLE account_deletion_requests ADD COLUMN claim_until BIGINT;
