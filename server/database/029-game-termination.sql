ALTER TABLE rooms ADD COLUMN end_proposal_json TEXT;
ALTER TABLE rooms ADD COLUMN awaiting_rematch_players BIGINT NOT NULL DEFAULT 0;
ALTER TABLE game_contexts DROP CONSTRAINT game_contexts_lifecycle_check;
ALTER TABLE game_contexts ADD CHECK (lifecycle IN ('active', 'completed', 'terminated', 'expired', 'removed'));

CREATE TABLE game_terminations (
  room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id),
  reason TEXT NOT NULL CHECK (reason IN ('agreement', 'solo_confirmation', 'hotseat_confirmation')),
  intent TEXT NOT NULL CHECK (intent IN ('end', 'rematch')),
  proposer_index BIGINT NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  round BIGINT NOT NULL
);

CREATE TABLE game_termination_players (
  room_id TEXT NOT NULL REFERENCES game_terminations(room_id) ON DELETE CASCADE,
  player_index BIGINT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  name_is_default BIGINT NOT NULL DEFAULT 0,
  agreed_at BIGINT NOT NULL,
  PRIMARY KEY (room_id, player_index)
);
CREATE INDEX game_termination_players_user ON game_termination_players(user_id, room_id);
