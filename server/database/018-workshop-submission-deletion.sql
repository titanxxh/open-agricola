-- A cascaded delete must never discard an executing or uncertain delivery.
UPDATE workshop_submissions SET lease_owner=NULL, lease_until=0 WHERE state='complete';

CREATE FUNCTION protect_workshop_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'pending' OR OLD.lease_owner IS NOT NULL
    OR (OLD.state = 'blocked' AND OLD.payload::jsonb @> '{"createAttempted":true}'
      AND COALESCE(OLD.payload::jsonb->'pr','null'::jsonb) = 'null'::jsonb) THEN
    RAISE EXCEPTION 'Recover the pending Workshop submission before deleting'
      USING ERRCODE = '23514', CONSTRAINT = 'workshop_submission_in_progress';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER protect_workshop_submission
  BEFORE DELETE ON workshop_submissions
  FOR EACH ROW EXECUTE FUNCTION protect_workshop_submission();
