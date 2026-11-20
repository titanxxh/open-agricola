# 53. Game Replay Archives are retained for seven days after the game ends

- Status: Accepted
- Date: 2026-11-20
- Amends: [ADR 0010](0010-public-replay-retention-and-erasure.md) (permanent public retention)

## Context

ADR 0010 kept every completed Replay public until erasure, so storage and every restore validation grew with all games ever played. On 2026-11-20 production held 1,237 Replays and 90,535 Replay Steps (795 MB compressed payload, most of the database). The count grew by about 6,000 Steps a day. Nightly single-threaded host validation took 16 minutes and grew by over a minute a day. The owner-local validation sits on the formal release downtime path. Completed games older than seven days accounted for 49,039 Steps (418 MB).

## Decision

- A Game Replay Archive of a completed or terminated game stays public for seven days after the game ends: `game_results.finished_at` for a completed game, `game_terminations.ended_at` for a terminated one.
- After that, the hourly storage cleanup sets the context's `replay_status` to `expired` and removes the replay payload. The Game Result Archive, its players and the termination record stay. Game Context returns `replayStatus: 'expired'` without a `replay` descriptor, and the client shows the result summary in place of the Replay.
- A submitted Bug Report keeps its minimal evidence segment until the report's evidence deadline, as for an expired unfinished game. Every report now gets that 30-day deadline at its first submission, including reports on completed and terminated games, and the migration backfills submitted ones. The rest of the archive is removed at once. When no evidence remains, the Replay header goes too, and with it the Replay's resource references. Maintainer evidence inspection serves such a segment only before the deadline. An expired archive is not a public Replay and accepts no new Bug Report.
- Each sweep marks at most 100 contexts, so the first backlog drains over several hours. Unfinished games keep the room retention policy of [ADR 0039](0039-runtime-room-retention-policy.md).
- Moderation and legal removal of an expired archive still work: the context becomes a Replay Tombstone, and a full-record legal erasure removes the result archive.
- Retention removal is not erasure. It writes no Replay Tombstone or erasure ledger entry. A restore from a backup made before the sweep brings the payload back until the next sweep removes it. Backups keep copies for at most 30 days.

## Consequences

- Stored payload, backups and restore validation are bounded by about one week of play, not by the whole history.
- Old Replay links show the result summary instead of the game.
- Storage validation treats an `expired` archive like an expired game: a remaining evidence segment may start at a later checkpoint and have gaps, and no public manifest is required.

## Alternatives considered

- Keeping Replays permanently: storage and downtime grow without bound.
- Deleting the result archive as well: personal results and game history would vanish with the Replay.
- Counting from game creation: long games would lose their Replay sooner.
