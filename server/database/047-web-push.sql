CREATE TABLE web_push_bindings (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL UNIQUE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  draft_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  inbox_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_web_push_bindings_user ON web_push_bindings(user_id);
CREATE INDEX idx_web_push_bindings_session ON web_push_bindings(session_token);

CREATE TABLE web_push_retired_devices (
  device_id UUID PRIMARY KEY
);

CREATE TABLE web_push_events (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'bug-report-inbox')),
  source_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT,
  seat BIGINT,
  opportunity_key TEXT,
  inbox_id BIGINT REFERENCES bug_report_feedback(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  UNIQUE (kind, source_key),
  CHECK (
    (kind = 'draft' AND room_id IS NOT NULL AND seat IS NOT NULL AND opportunity_key IS NOT NULL AND inbox_id IS NULL)
    OR (kind = 'bug-report-inbox' AND room_id IS NULL AND seat IS NULL AND opportunity_key IS NULL AND inbox_id IS NOT NULL)
  )
);

CREATE INDEX idx_web_push_events_user ON web_push_events(user_id);
CREATE INDEX idx_web_push_events_inbox ON web_push_events(inbox_id);

CREATE TABLE web_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES web_push_events(id) ON DELETE CASCADE,
  binding_id UUID REFERENCES web_push_bindings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'discarded')),
  next_attempt_at BIGINT NOT NULL,
  claim_token UUID,
  claim_until BIGINT NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, binding_id)
);

CREATE INDEX idx_web_push_deliveries_due ON web_push_deliveries(next_attempt_at, id) WHERE status = 'pending';
CREATE INDEX idx_web_push_deliveries_binding ON web_push_deliveries(binding_id);
