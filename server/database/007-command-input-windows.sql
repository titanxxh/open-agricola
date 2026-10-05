-- Operational input identity is outside undoable Session/Frame state.
ALTER TABLE rooms ADD COLUMN input_window_json TEXT;
