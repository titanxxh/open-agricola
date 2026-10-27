ALTER TABLE game_result_players
  ALTER COLUMN score TYPE DOUBLE PRECISION USING score::double precision;
