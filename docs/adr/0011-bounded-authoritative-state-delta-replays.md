# 11. Replay archives use bounded authoritative state deltas

- Status: Accepted
- Date: 2026-07-26

## Context

The Game Replay Archive must replay completed games exactly forever, while supporting live appends, Room recovery, stable Bug Report Anchors and seat and all-open perspectives. A representative 176-step game stored as independent gzip Frames took 2.63 MiB; replaying commands would depend on historical rule code, and persisted state cannot faithfully replay undo.

## Decision

- **Frames are the truth.** Step 0 is stored before the first interactive command (a classic deal is inside it; draft, Parent Selection and other submissions start at Step 1). Each successful command or choice that changes the public Frame or the private session cursor, or carries `durableTransition`, records a Step; a cursor-only change may repeat the public Frame. Ordinary failures, reconnection, refetch and heartbeats are not recorded; a successful undo is a new Step. `stepNo` is Room-global and serial, independent of `roomVersion`; simultaneous submissions take consecutive Steps and automatic settlement belongs to the last triggering input, independent of arrival order.
- A Replay Frame reuses the unfiltered `SerializedGameState` with events and log; `engineStack` is an empty placeholder. Private Events, private prompts, envelopes, functions and undo snapshots are excluded; commands are metadata only and never recomputed.
- **Storage.** Each game has one Replay header and one row per Step distinguished by `payloadKind` (checkpoint or delta), unique by `roomId + stepNo`; there is no Segment table. A checkpoint starts at Step 0 and normally every 16 Steps, so a target applies at most 15 deltas; a delta not smaller than its full Frame starts a new checkpoint early. Each row is gzip-compressed independently.
- A Replay State Delta is the RFC 6902 `add` / `remove` / `replace` subset with sorted object keys and index-wise arrays, without LCS or a diff dependency.
- Each row stores the SHA-256 of its reconstructed Frame over canonical JSON (sorted keys). It detects corruption and misordering; it is not a signature.
- Step metadata stores only `stepNo`, `roomVersion`, actor `playerIndex`, command type, allowlisted parameters and Frame Hash — never tokens, `requestId`, site `userId`, raw messages or unvalidated payloads.
- **Versions.** The header locks `schemaVersion`, the content-addressed `viewerBuildId` and the diagnostic `gameBuildId` at Room creation. A newer backend keeps writing an existing Room in its original schema; published payloads are never migrated or rewritten, and historical rule code is never executed. Each Viewer Build is an immutable read-only bundle in a credentialless sandbox, retained while any Replay references it; a missing or damaged Build is reported unavailable.
- One authoritative chain holds all hidden state; it is never copied per player. Live recovery filters by seat; completed playback filters per perspective.
- **Recovery independence.** Active Room recovery, including undo history, provisional checkpoints and the committer baseline, never requires decoding Replay checkpoints or deltas; it may check the head Step and Frame Hash. Each Step updates the Room recovery snapshot and appends its Replay row in the same PostgreSQL transaction before broadcast.
- Retrying the same `roomId + stepNo + frameHash` is idempotent; a different hash for the same Step pauses the Room. `gameOver` writes the final Frame, the Game Result Archive, Replay completion and Room deletion in one transaction.
- A Bug Report Anchor is `roomId + stepNo + frameHash`: the latest persisted Step in a live game, the displayed Step in a completed one.
- A failed delta or hash mismatch is never repaired silently: the Segment is marked damaged and playback resumes at the next checkpoint.

## Consequences

- Rule and schema evolution never changes an archived Frame's meaning.
- Random access applies at most 15 patches, and damage stays within one Segment.
- Permanent Replays require permanently retained Viewer Builds.

## Alternatives considered

- Full gzip Frames per Step: 2.63 MiB for a representative game, growing linearly.
- Initial state plus a command log replayed through rule code: rules and custom cards evolve, and undo history is not replayable.
- An unbounded delta chain: seek cost and damage scope grow with game length.
- One chain per perspective: duplicates the same state and drifts at Step boundaries.
- Rewriting history on deploy or migrating schemas in the newest Viewer: alters forensic data and adds rollback risk.
