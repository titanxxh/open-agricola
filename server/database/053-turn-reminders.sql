ALTER TABLE web_push_bindings ADD COLUMN turn_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE web_push_events DROP CONSTRAINT web_push_events_kind_check,
  DROP CONSTRAINT web_push_events_check,
  ADD CHECK (kind IN ('turn', 'draft', 'bug-report-inbox')),
  ADD CHECK (
    (kind = 'turn' AND room_id IS NOT NULL AND seat IS NOT NULL AND opportunity_key IS NULL AND inbox_id IS NULL)
    OR (kind = 'draft' AND room_id IS NOT NULL AND seat IS NOT NULL AND opportunity_key IS NOT NULL AND inbox_id IS NULL)
    OR (kind = 'bug-report-inbox' AND room_id IS NULL AND seat IS NULL AND opportunity_key IS NULL AND inbox_id IS NOT NULL)
  );

CREATE INDEX idx_web_push_turn_events ON web_push_events(room_id, expires_at) WHERE kind = 'turn';
