ALTER TABLE rooms ADD COLUMN solo_hand_mode TEXT CHECK (solo_hand_mode IN ('random', 'choose-7'));

CREATE TABLE game_creation_configurations (
  room_id TEXT PRIMARY KEY REFERENCES game_contexts(room_id),
  configuration_json TEXT NOT NULL CHECK (configuration_json IS JSON OBJECT)
);
