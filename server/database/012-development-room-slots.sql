-- Stable development entry slots point at permanent Game Context identities.
-- Resetting/replaying a slot must never overwrite an earlier recorded game.
CREATE TABLE development_room_slots (
  root_id TEXT PRIMARY KEY CHECK (root_id IN ('dev2','dev3','dev4','dev5','dev6')),
  room_id TEXT NOT NULL UNIQUE
);
