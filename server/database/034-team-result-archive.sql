ALTER TABLE game_results
  ADD COLUMN team_mode TEXT CHECK (team_mode IN ('team', 'multihand')),
  ADD COLUMN team_scoring TEXT CHECK (team_scoring IN ('sum', 'product', 'category-min', 'total-min')),
  ADD COLUMN team_scores JSONB CHECK (jsonb_typeof(team_scores) = 'array'),
  ADD CONSTRAINT game_results_team_result_complete CHECK (
    (team_mode IS NULL AND team_scoring IS NULL AND team_scores IS NULL)
    OR (team_mode IS NOT NULL AND team_scoring IS NOT NULL AND team_scores IS NOT NULL)
  );

ALTER TABLE game_result_players ADD COLUMN team_index BIGINT CHECK (team_index >= 0);
