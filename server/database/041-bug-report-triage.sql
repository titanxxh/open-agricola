ALTER TABLE bug_report_feedback DROP CONSTRAINT bug_report_feedback_kind_check;
ALTER TABLE bug_report_feedback ADD COLUMN missing_items JSONB;
ALTER TABLE bug_report_feedback ADD CONSTRAINT bug_report_feedback_kind_check CHECK (kind IN ('confirmed_bug', 'not_bug', 'needs_info'));
ALTER TABLE bug_report_feedback ADD CONSTRAINT bug_report_feedback_missing_items_check CHECK (
  CASE WHEN kind = 'needs_info' THEN
    missing_items IS NOT NULL AND jsonb_typeof(missing_items) = 'array' AND jsonb_array_length(missing_items) BETWEEN 1 AND 10
  ELSE missing_items IS NULL END
);
