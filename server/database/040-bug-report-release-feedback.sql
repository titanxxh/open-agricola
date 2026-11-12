ALTER TABLE bug_report_feedback DROP CONSTRAINT bug_report_feedback_kind_check;
ALTER TABLE bug_report_feedback ADD CONSTRAINT bug_report_feedback_kind_check CHECK (kind IN ('confirmed_bug','not_bug','needs_info','fix_released'));
ALTER TABLE bug_report_feedback ALTER COLUMN version DROP NOT NULL;
ALTER TABLE bug_report_feedback DROP CONSTRAINT bug_report_feedback_submission_id_version_key;
CREATE UNIQUE INDEX idx_bug_report_feedback_triage_version ON bug_report_feedback(submission_id,version) WHERE kind <> 'fix_released';
ALTER TABLE bug_report_feedback ADD COLUMN release JSONB;
ALTER TABLE bug_report_feedback ADD COLUMN root_id TEXT REFERENCES bug_report_fix_roots(root_id);
ALTER TABLE bug_report_feedback ADD CONSTRAINT bug_report_feedback_release_check CHECK (
  CASE WHEN kind='fix_released' THEN release IS NOT NULL AND root_id IS NOT NULL AND version IS NULL
  ELSE release IS NULL AND root_id IS NULL AND version IS NOT NULL END
);
CREATE UNIQUE INDEX idx_bug_report_feedback_root_recipient ON bug_report_feedback(recipient_user_id,root_id) WHERE kind='fix_released';
CREATE TABLE bug_report_feedback_operations (
  operation_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('deployment','reconcile')),
  fingerprint TEXT NOT NULL,
  proof JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  error TEXT,
  result JSONB,
  created_at BIGINT NOT NULL,
  completed_at BIGINT,
  CHECK ((kind='deployment')=(proof IS NOT NULL))
);
CREATE TABLE bug_report_fix_verifications (
  root_id TEXT NOT NULL REFERENCES bug_report_fix_roots(root_id),
  fix_version BIGINT NOT NULL,
  operation_id TEXT NOT NULL REFERENCES bug_report_feedback_operations(operation_id),
  verified_at BIGINT NOT NULL,
  PRIMARY KEY(root_id,fix_version,operation_id)
);
