-- ADR 0053: a Game Replay Archive is kept for seven days after its game ends.
-- `expired` marks a completed or terminated game whose replay payload has been
-- removed; the result archive and termination record stay.
ALTER TABLE game_contexts DROP CONSTRAINT game_contexts_replay_status_check;
ALTER TABLE game_contexts ADD CHECK (replay_status IS NULL OR replay_status IN ('available', 'legacy_no_replay', 'expired'));
-- Reports on completed or terminated games had no evidence deadline because the
-- public archive was permanent. Give them the same 30 days from submission.
UPDATE bug_reports
SET evidence_expires_at = submitted_at + 2592000000::bigint -- 30 days in ms
WHERE evidence_expires_at IS NULL AND submitted_at IS NOT NULL AND lifecycle IN ('completed', 'terminated');
