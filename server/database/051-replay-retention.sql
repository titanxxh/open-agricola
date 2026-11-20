-- ADR 0053: a Game Replay Archive is kept for seven days after its game ends.
-- `expired` marks a completed or terminated game whose replay payload has been
-- removed; the result archive and termination record stay.
ALTER TABLE game_contexts DROP CONSTRAINT game_contexts_replay_status_check;
ALTER TABLE game_contexts ADD CHECK (replay_status IS NULL OR replay_status IN ('available', 'legacy_no_replay', 'expired'));
