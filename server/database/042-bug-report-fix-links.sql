CREATE TABLE bug_report_fix_roots (
  root_id TEXT PRIMARY KEY REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 0,
  pull_requests JSONB NOT NULL DEFAULT '[]',
  updated_at BIGINT NOT NULL
);
CREATE TABLE bug_report_fix_links (
  submission_id TEXT PRIMARY KEY REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
  root_id TEXT NOT NULL REFERENCES bug_report_fix_roots(root_id),
  version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_bug_report_fix_links_root ON bug_report_fix_links(root_id);
CREATE TABLE bug_report_fix_requests (
  submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(submission_id, request_id)
);
