-- ADR 0049: a classic game records its Card Edition and Classic Decks; NULL keeps every existing row revised.
-- Each column is added only when missing, so rebuilding an older table and migrating again stays valid.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS card_edition TEXT CHECK (card_edition = 'classic'),
  ADD COLUMN IF NOT EXISTS classic_deck_ids TEXT CHECK ((card_edition IS NULL) = (classic_deck_ids IS NULL));
ALTER TABLE game_results
  ADD COLUMN IF NOT EXISTS card_edition TEXT CHECK (card_edition = 'classic'),
  ADD COLUMN IF NOT EXISTS classic_deck_ids JSONB CHECK ((card_edition IS NULL) = (classic_deck_ids IS NULL));
ALTER TABLE game_opening_facts
  ADD COLUMN IF NOT EXISTS classic_edition BOOLEAN,
  ADD COLUMN IF NOT EXISTS classic_deck_ids JSONB CHECK ((classic_edition IS TRUE) = (classic_deck_ids IS NOT NULL));
ALTER TABLE sandbox_settings
  ADD COLUMN IF NOT EXISTS card_edition TEXT CHECK (card_edition = 'classic'),
  ADD COLUMN IF NOT EXISTS classic_deck_ids_json TEXT;
