# 9. Room ID identifies one game

- Status: Accepted
- Date: 2026-07-24

## Context

`newGame` replaced the `GameSession` inside the same Room, so one `roomId` stood for several games. The old persistence API also used one `markFinished` for normal completion, expiry, dissolution and account deletion, so a countable result could not be told apart from cleanup.

## Decision

- One `roomId` permanently identifies one game and at most one result. New Rooms and `newGame` use `crypto.randomUUID()`, excluding IDs already in active records, retired IDs and result archives.
- `newGame` may carry over player count, online seats, custom cards, draft settings and persisted variant flags, but the Room, registry, connections and client URL switch to the new ID before its first Durable Room Commit. The old game keeps its archive if completed and is discarded otherwise.
- The first `waiting → playing` transition records an immutable `started_at`.
- The persistence lifecycle is split into `complete(result)` and `discard(id)`. Only authoritative `gameOver` completes; expiry, dissolution, account deletion and unfinished rematches only discard. Discarding removes recoverable content but keeps the permanent Game Context (ADR 0013).
- `game_results` and `game_result_players` store scalar fields only, aligned to seats by the persisted `room_players.player_index`. Completion writes the final Replay Frame, marks the Replay completed and deletes the active Room in one transaction; failure rolls back and keeps the full final state.
- No result is synthesized for older rows whose completion cannot be proven.

## Consequences

- `roomId` doubles as the game and result identity; no separate match ID exists.
- Unfinished cleanup never pollutes statistics, and disconnected players still reach the result summary through their persisted seat.

## Alternatives considered

- Reusing `roomId` with an extra `gameId`: two identities across protocol, persistence and client.
- A single `finished` status for every ending: cannot prove a normal completion.
- Backfilling archives from old finished rows: their completion reason is untrustworthy.
