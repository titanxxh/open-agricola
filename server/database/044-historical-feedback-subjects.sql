CREATE TABLE bug_report_feedback_subjects (
  submission_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('native','historical')),
  native_submission_id TEXT UNIQUE REFERENCES bug_reports(submission_id) ON DELETE SET NULL,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  github_issue_number BIGINT NOT NULL,
  recipient_version BIGINT NOT NULL DEFAULT 0,
  import_actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  import_audit JSONB,
  historical_first_included JSONB,
  CHECK (source <> 'historical' OR (native_submission_id IS NULL AND import_audit IS NOT NULL))
);
CREATE INDEX idx_feedback_subject_issue ON bug_report_feedback_subjects(github_issue_number);
INSERT INTO bug_report_feedback_subjects(submission_id,source,native_submission_id,reporter_user_id,github_issue_number)
  SELECT submission_id,'native',submission_id,reporter_user_id,github_issue_number FROM bug_reports
  WHERE status='submitted' AND github_issue_number IS NOT NULL;
CREATE FUNCTION sync_native_feedback_subject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE bug_report_feedback_subjects SET reporter_user_id=NULL WHERE native_submission_id=OLD.submission_id;
    RETURN OLD;
  END IF;
  IF NEW.status='submitted' AND NEW.github_issue_number IS NOT NULL THEN
    INSERT INTO bug_report_feedback_subjects(submission_id,source,native_submission_id,reporter_user_id,github_issue_number)
      VALUES(NEW.submission_id,'native',NEW.submission_id,NEW.reporter_user_id,NEW.github_issue_number)
      ON CONFLICT(submission_id) DO UPDATE SET reporter_user_id=EXCLUDED.reporter_user_id,github_issue_number=EXCLUDED.github_issue_number
        WHERE bug_report_feedback_subjects.source='native' AND bug_report_feedback_subjects.native_submission_id=EXCLUDED.native_submission_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'feedback subject provenance conflict'; END IF;
  ELSE
    UPDATE bug_report_feedback_subjects SET reporter_user_id=NULL WHERE native_submission_id=NEW.submission_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER native_feedback_subject_sync AFTER INSERT OR UPDATE ON bug_reports FOR EACH ROW EXECUTE FUNCTION sync_native_feedback_subject();
CREATE TRIGGER native_feedback_subject_delete BEFORE DELETE ON bug_reports FOR EACH ROW EXECUTE FUNCTION sync_native_feedback_subject();
ALTER TABLE bug_report_feedback DROP CONSTRAINT bug_report_feedback_submission_id_fkey;
ALTER TABLE bug_report_feedback ADD FOREIGN KEY(submission_id) REFERENCES bug_report_feedback_subjects(submission_id) ON DELETE CASCADE;
ALTER TABLE bug_report_fix_roots DROP CONSTRAINT bug_report_fix_roots_root_id_fkey;
ALTER TABLE bug_report_fix_roots ADD FOREIGN KEY(root_id) REFERENCES bug_report_feedback_subjects(submission_id) ON DELETE CASCADE;
ALTER TABLE bug_report_fix_links DROP CONSTRAINT bug_report_fix_links_submission_id_fkey;
ALTER TABLE bug_report_fix_links ADD FOREIGN KEY(submission_id) REFERENCES bug_report_feedback_subjects(submission_id) ON DELETE CASCADE;
ALTER TABLE bug_report_fix_requests DROP CONSTRAINT bug_report_fix_requests_submission_id_fkey;
ALTER TABLE bug_report_fix_requests ADD FOREIGN KEY(submission_id) REFERENCES bug_report_feedback_subjects(submission_id) ON DELETE CASCADE;
ALTER TABLE bug_report_feedback_operations ADD COLUMN scope_issue_numbers JSONB;
ALTER TABLE bug_report_feedback_operations ADD COLUMN scope_subjects JSONB;
CREATE FUNCTION feedback_subject_recipient_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  NEW.recipient_version=OLD.recipient_version + CASE WHEN NEW.reporter_user_id IS DISTINCT FROM OLD.reporter_user_id THEN 1 ELSE 0 END;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_subject_recipient_revision BEFORE UPDATE ON bug_report_feedback_subjects FOR EACH ROW EXECUTE FUNCTION feedback_subject_recipient_revision();
