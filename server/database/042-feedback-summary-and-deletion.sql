ALTER TABLE bug_report_feedback_subjects ADD COLUMN github_issue_state TEXT CHECK (github_issue_state IS NULL OR github_issue_state IN ('open','closed','deleted'));
ALTER TABLE bug_report_fix_roots ADD COLUMN fix_summary TEXT CHECK (fix_summary IS NULL OR (length(btrim(fix_summary))>0 AND length(fix_summary)<=2000));
