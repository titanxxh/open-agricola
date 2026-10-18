# 14. Durable Room Commit is the publish seam

- Status: Accepted (process and storage shape updated by ADR 0022)
- Date: 2026-07-27

## Context

The connection layer sent `StateUpdateEnvelope` first and saved the Room about a second later, so a step players had seen could vanish in a crash, and no module coordinated Room snapshots, Replay Steps, result archives and failure pauses. A representative probe with real commands and Replay writes on 2 CPU / 2 GiB measured 30 Rooms at 88.5 ms action p99 and 83.6 % CPU, and 35 Rooms at 371.6 ms and 96.1 %; executable Workshop Rooms later use two Workers each.

## Decision

**Durable publish.**

- `room-router` calls `GameSession`, the only server command entry and `GameState` owner; mutations run in the `GameCore` and action leaves it drives. This ownership is a review invariant; mechanical gates cover only the adjacent command entries and dependency seams.
- Every response that changes the public Frame or the private session cursor, and every `durableTransition`, passes through one concrete `RoomCommitter`. It updates the Room snapshot and appends the Replay Step in one database transaction; only then may `Broadcaster` build per-viewer envelopes.
- `RoomCommitter` returns `committed`, `unchanged` or `blocked` and hides serialization, delta, gzip, hashing, transactions, completion archives, idempotency and retries. It has no single-implementation interface or factory; the persistence adapter seam serves the real adapter differences.
- An ordinary failure (`ok=false` without `durableTransition`) answers only its origin and advances neither `roomVersion` nor `stepNo`. A durable rejection commits; its error goes only to the origin while peers receive the same committed version without error (ADR 0015). `unchanged` requires both an unchanged public Frame Hash and private-cursor content equal to the captured baseline; a cursor-only change still records a Step. Reconnection, refetch and heartbeats never commit.
- `roomVersion` and `stepNo` advance independently; simultaneous submissions take consecutive Steps and automatic settlement belongs to the last triggering input, independent of arrival order. Step 0 exists before the first interactive command.
- A write failure keeps the exact captured snapshot, Frame (with final scores), cursor baseline, encoded payload and Intent, and retries without recapturing (snapshot ownership in ADR 0021). The Room rejects new commands and shows a save pause, and connections arriving during the pause wait for success before receiving a snapshot; retries back off 1, 2, 5, 10 and 30 seconds, then every 30 seconds. A process exit before success restores the last committed Step.
- The same `roomId + stepNo + frameHash` retry is idempotent; a different hash for the same Step blocks the Room permanently and alerts. A persistence-wide failure rejects new Rooms while existing Rooms keep retrying.

**Capacity.**

- One instance keeps at most 30 ordinary in-memory Rooms (waiting and playing; fixed development Rooms excluded). Executable Workshop Rooms use a session Worker plus a code Worker; a process-wide budget of 15 Worker slots covers those Rooms, restored Rooms and HTTP sandboxes. The Room queue covers session execution, broadcast preparation and Durable Commit, and a `ready | blocked` gate stops retries interleaving with new commands. Raising either limit requires repeating the probe in the matching production shape.

**Storage and delivery.**

- Game Context, Replay and Bug Report tables were added in one migration with Replay `schemaVersion=1`; existing Rooms became active contexts, results completed contexts, and pre-launch completed games `legacy_no_replay`. Active recovery keeps `rooms` / `room_players`, and completed participants keep `game_results` / `game_result_players`.
- Replay adds only header and Step tables (`checkpointStepNo` expresses Segments) and no evidence-payload table.
- `gameBuildId`, `schemaVersion` and `viewerBuildId` are locked at Room creation. Standard card display ships with the Viewer Build and its assets come from the pinned asset site; custom-card snapshots and art are copied into content-addressed storage, never executable source.
- Public Replay APIs return versioned JSON, never storage encoding. Content-addressed Viewer Builds are retained permanently and read public manifests and Segments without cookies.
- The client resolves the Game Context before loading the card manifest and auth; only proven original participants can file a Bug Report from a completed game.

**GitHub and operations.**

- GitHub submission uses persisted drafts, stable `submissionId`s, attempt rows and claims, with no external queue (ADR 0012). Issues carry only the sanitized symptom and approved locators; repository automation adds `needs-triage`.
- Maintainer all-open forensics reuse administrator checks with permanent audit. Takedown deletes payloads, keeps Tombstones and appends the external deletion ledger (ADR 0010); a content resource is deleted only when no other non-removed Replay references it, and a violating resource first tombstones every game that references it.
- Viewer Builds publish before the backend that freezes their ID. After recording is enabled, rollback is allowed only to recorder-compatible builds.

## Consequences

- Every success a player has seen has a recoverable snapshot and Replay Step committed in the same transaction; transport no longer decides durability.
- Permanent Viewer Builds, content resources, the deletion ledger and compatible rollback are part of production deployment.

## Alternatives considered

- Broadcasting before saving: a seen step can vanish.
- Raising capacity with Workers or sharding: Workers exist only to isolate untrusted code.
- Per-player Replay chains: there is one authoritative Frame; perspectives filter on read.
- A Redis queue with separate commit workers: the Room state machine already retries and reconciles durably.
- Shipping historical Viewers inside the overwritten Pages build: old Replays would lose their Viewer.
