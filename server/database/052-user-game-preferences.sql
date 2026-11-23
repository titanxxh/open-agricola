-- Account defaults for seat settings (#2039). A game copies them into its seats when it starts;
-- a running game reads only its own state.
CREATE TABLE user_game_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auto_resolve_independent_reactions BOOLEAN NOT NULL,
  updated_at BIGINT NOT NULL
);
