CREATE TABLE game_opening_facts (
  room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id) ON DELETE CASCADE,
  started_at BIGINT NOT NULL,
  playing_at BIGINT,
  mode TEXT NOT NULL CHECK (mode IN ('solo','hotseat','multiplayer','unknown')),
  seat_count INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 6),
  parent_cards BOOLEAN,
  through_the_seasons BOOLEAN,
  farmers_of_the_moor BOOLEAN,
  snake_opening BOOLEAN,
  moor_balance_rules BOOLEAN,
  community_deck BOOLEAN,
  origin TEXT NOT NULL CHECK (origin IN ('live','legacy'))
);
CREATE INDEX game_opening_facts_started ON game_opening_facts(started_at);

CREATE TABLE game_opening_accounts (
  room_id TEXT NOT NULL REFERENCES game_opening_facts(room_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(room_id,user_id)
);
CREATE INDEX game_opening_accounts_user ON game_opening_accounts(user_id,room_id);

CREATE TABLE game_opening_tracking (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  tracking_since BIGINT NOT NULL
);
INSERT INTO game_opening_tracking(tracking_since)
VALUES ((extract(epoch FROM transaction_timestamp())*1000)::bigint);

INSERT INTO game_opening_facts (
  room_id, started_at, mode, seat_count, parent_cards, through_the_seasons,
  farmers_of_the_moor, snake_opening, moor_balance_rules, origin
)
SELECT r.id, r.started_at,
  CASE WHEN r.hotseat=1 THEN 'hotseat' WHEN r.max_players=1 THEN 'solo' ELSE 'multiplayer' END,
  r.max_players, r.enable_parent_cards=1, r.enable_through_the_seasons=1,
  r.enable_farmers_of_the_moor=1, r.enable_snake_opening=1, r.enable_moor_balance_rules=1, 'legacy'
FROM rooms r
WHERE r.status='playing' AND r.started_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM room_ownership o WHERE o.room_id=r.id AND o.development);

INSERT INTO game_opening_accounts(room_id,user_id)
SELECT DISTINCT p.room_id,p.user_id FROM room_players p
JOIN game_opening_facts f ON f.room_id=p.room_id;

CREATE VIEW operations_current_openings WITH (security_barrier=true) AS
SELECT
  CASE WHEN r.hotseat=1 THEN 'hotseat' WHEN r.max_players=1 THEN 'solo' ELSE 'multiplayer' END AS mode,
  r.max_players::integer AS seat_count,
  CASE WHEN r.status='waiting' THEN
    CASE WHEN r.color_confirmation_player_index IS NOT NULL THEN 'color_confirmation' ELSE 'waiting' END
  ELSE CASE (CASE WHEN r.state_json IS JSON OBJECT THEN r.state_json::jsonb#>>'{state,phase}' END)
    WHEN 'parent-selection' THEN 'parent_selection'
    WHEN 'draft' THEN 'draft'
    WHEN 'solo-hand-selection' THEN 'solo_hand_selection'
    WHEN 'playing' THEN 'playing'
    ELSE 'unknown'
  END END AS stage,
  CASE WHEN EXISTS (
    SELECT 1 FROM room_ownership o
    JOIN app_instances i ON i.instance_id=o.instance_id
      AND i.status='ready' AND i.lease_until>extract(epoch FROM statement_timestamp())*1000
    JOIN room_presence p ON p.room_id=o.room_id AND p.epoch=o.epoch AND p.connected_count>0
    WHERE o.room_id=r.id AND o.status='active'
      AND o.lease_until>extract(epoch FROM statement_timestamp())*1000
  ) THEN 'online' ELSE 'retained' END AS presence,
  greatest(0, (extract(epoch FROM statement_timestamp())*1000-r.updated_at)/1000)::double precision AS age_seconds
FROM rooms r JOIN game_contexts c ON c.room_id=r.id AND c.lifecycle='active'
WHERE r.status IN ('waiting','playing')
  AND NOT EXISTS (SELECT 1 FROM room_ownership o WHERE o.room_id=r.id AND o.development);
