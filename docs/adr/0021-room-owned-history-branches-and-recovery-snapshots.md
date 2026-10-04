# 21. Active Rooms share immutable history across recovery snapshots

- Status: Accepted
- Date: 2026-10-04
- Issues: #938–#942; #937 is completed by PR #945

## Context

Late-game Room snapshots repeatedly copy and serialize logs, events, archives, ordinary Undo History and nested provisional checkpoints. These histories have different semantics: logs can prepend and change their display names, effective events roll back and reuse sequence numbers, and the public archive retains the cancellation record. A length or event sequence alone cannot identify a recoverable history version.

## Decision

Keep snapshots of the smaller core game and private execution state, and reference Room-owned immutable history records through explicit History Branch identities. Use these branches for logs, events, the public event archive and checkpoint reuse; a Frame overlay removes duplicated serialized core fields within the same snapshot. Preserve the existing ordinary undo and provisional restoration semantics, including after process recovery; do not replace the rules engine with an inverse-operation journal or a general persistent object tree.

Use one capture and restore model for ordinary history, command checkpoints and every nested provisional checkpoint, including their embedded histories. Shared checkpoints may be represented once. Optimize capture itself so the SQLite path does not first deep-clone or expand complete histories only to split them again at the adapter boundary. The authoritative rule and Workshop inputs retain their complete logical history.

SQLite alone uses incremental physical storage. JSON and memory adapters materialize and store complete logical snapshots from the same recovery model. Updated history references and recovery records participate in the existing Room/Replay transaction and frozen retry contract. Active recovery, including the committer's baseline, remains independent of historical Replay payload as specified by [ADR-0011 §11](0011-bounded-authoritative-state-delta-replays.md).

Serialize each packed latest, undo or checkpoint body once, then use a level-1 gzip/base64 JSON envelope only when its complete stored size is smaller. Do not expand referenced histories for compression or compress individual history-node records. Recovery-record checksums cover the exact encoded text before decoding. Readers accept raw JSON alongside compressed bodies. The latest envelope retains only the lobby SQL turn projection (`phase`, `gameOver`, current player and top-frame owner); recovery and local restart tooling decode the full body rather than treating that projection as authoritative state.

Players retain access to the complete history. Real-time presentation uses a bounded History Window of complete operation groups; older records are read on demand with the existing participant authorization and viewer filtering. Historical names are projected from the game's participant identity using the current active name or archived Participant name, including anonymization. This presentation projection does not rewrite immutable Replay payload or its recorded Frame Hash.

### Latest committed Frame

Store the latest committed raw Frame as a structural `frameDelta` against the same snapshot's packed authoritative `state`, including exact references to the original versions of `log`, `events` and `publicEventArchive`. Internal Room history version 2 writes this overlay; version 1 `frameWithoutStreams` records remain readable. The overlay retains every difference, including derived display values, constant keys, removed execution fields, scores, future fields and history references that differ from state. It is self-contained within the Room snapshot, independent of prior Replay Steps, and uses no field allowlist or general object-graph cache.

Issue #941 uses one in-memory capture of the authoritative core, shared by the snapshot's `state` and `frame` views as owned immutable values. Capture display projections separately from the live session context; copy the core again when rehydrating writable rules state, including after Worker IPC. The committer owns its smaller Frame body and final scores while retaining shared immutable histories for encoding, its accepted baseline and frozen retry. Shared core identity also stops unnecessary overlay traversal; the two logical views remain separate.

Restore by applying the overlay to an independent copy of the smaller saved state body, joining Room-owned history values and checking the existing canonical Frame Hash. Restored state and Frame core bodies must not share mutable values. Do not call current rules or `serializeState` to recalculate old derived values, and do not read historical Replay payload. Original per-entry log parameters and name values must remain reproducible; a single current-name map cannot reconstruct the mixed name history in existing raw logs. Room record/group identities and History Branch references stay outside the raw Replay Frame. Existing log participant identity fields remain part of the exact raw Frame.

Keep the complete logical Frame for Replay encoding, Worker IPC and the existing runtime snapshot consumers. Only its Room persistence representation changes. Verify the original raw Frame before applying viewer filtering, the History Window or current-name and anonymization projections; no Replay schema change is required by this storage representation.

## Alternatives and consequences

An inverse-state journal would need to capture every rule mutation, observation boundary and nested rollback. A general persistent object tree would require broad changes to the current mutable GameState model. Both enlarge the correctness boundary compared with sharing the large history data while retaining core snapshots. Merely compressing existing SQLite snapshots leaves the costly capture and cloning paths intact. The Frame overlay trades a structural comparison on save and a smaller-body copy on restore for fewer duplicated JSON fields and SQLite bytes; small-body compression adds synchronous encoding and decoding work to reduce those bytes further. Acceptance still requires the fixed-workload performance measurements below.

The internal history identity is distinct from a reusable event sequence. Undo followed by a different action, same-length state replacement, player rename, cancellation and nested scope recovery must remain distinguishable. Missing recovery records or inconsistent references are errors; the implementation must not silently substitute another branch.

Issues #947–#955 implement this representation and its completed-group acceptance. Raw measurements and unchanged performance gates are maintained in [Replay Room Capacity](../performance/replay-room-capacity.md).

## Implementation sequence and validation

1. Establish a fresh-Room baseline after PR #945 using fixed complete command transcripts. Include the existing two-player capacity workload and a four-player late-game workload with costs, payments, farm choices, undo and process recovery. Freeze improvement thresholds from repeated baseline measurements before implementing the optimizations.
2. Limit the first #941 slice to reusing the existing private cursor hash through commit, frozen retry and acceptance. Preserve canonical encoding and the `committed` / `unchanged` decisions. Revisit the remaining serialization and change-detection costs after the shared representation stabilizes.
3. Implement #942 under the existing query-purity contract: remove the whole-state preview clone, extend test protection to generic `computeCosts` hooks, and validate repeated previews, real costs and payment outcomes in the relevant Session and Workshop paths.
4. Implement #939/#940 as one common capture, history-reference and recovery model. Introduce stable record identity, actor and other participant-role references, complete operation-group membership, and exact raw-Frame parameter versions at this stage. Cover ordinary history and all nested checkpoints; retain complete logical output while the new storage is introduced.
5. Implement #938 using the small Frame body and shared history versions. Verify exact raw-Frame reconstruction and Hash equality, including after rename and restart. Restore without Replay payload or current-rule recalculation.
6. Switch the history window, authenticated on-demand reads and client consumption together. Keep viewer filtering and identity stable across window movement, paging, cancellation and undo branches. Apply current-name projection only to presentation. Earlier backend slices retain the full payload until this stage.
7. Repeat the same workloads and accept the completed group only when both latency/CPU cost and cumulative persistence write volume improve beyond the frozen thresholds, while capacity and recovery requirements remain satisfied. A slice may improve one objective if the others remain within permitted variation.

Recovery validation must include undoStep, undoAction, undo followed by a different action with a reused event sequence, same-length state replacement, rename, nested cross-player scope abort, Protected Observation boundaries and continuation after restart. Test SQLite atomic failure and retry for every new record/reference write, and round-trip the equivalent logical snapshot through JSON and memory adapters. Session fixtures use two players and explicit hands by default; the four-player fixtures are for the performance workload.

Report logical serialized bytes separately from cumulative SQLite DB/WAL file writes. A WAL file's net growth is not its cumulative write volume. Run write tracing separately from latency measurement, retain raw results and exact invocations, and compare identical runtime and resource settings. Historical Replay payload and Viewer Builds remain immutable under ADR-0011; storage-only slices must preserve the raw Frame chain.
