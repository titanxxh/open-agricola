CREATE TABLE bug_report_feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES bug_reports(submission_id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('confirmed_bug')),
  report_summary TEXT NOT NULL,
  explanation TEXT NOT NULL,
  version BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT,
  UNIQUE (submission_id, request_id),
  UNIQUE (submission_id, version)
);

CREATE INDEX idx_bug_report_feedback_inbox ON bug_report_feedback(recipient_user_id, id DESC);
