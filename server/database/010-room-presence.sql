-- Ephemeral presence is scoped to an owner epoch, never part of game recovery.
CREATE TABLE room_presence (
  room_id TEXT PRIMARY KEY REFERENCES room_ownership(room_id) ON DELETE CASCADE,
  epoch BIGINT NOT NULL,
  connected_count BIGINT NOT NULL,
  occupied_count BIGINT NOT NULL
);
