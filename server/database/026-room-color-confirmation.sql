ALTER TABLE rooms ADD COLUMN color_confirmation_player_index BIGINT
  CHECK (color_confirmation_player_index BETWEEN 0 AND 5);
