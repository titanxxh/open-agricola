# 21. Active Rooms share immutable history across recovery snapshots

- Status: Accepted
- Date: 2026-10-04

## Context

Issues #938–#942. Late-game Room snapshots repeatedly copied and serialized logs, events, archives, ordinary Undo History and nested provisional checkpoints. These histories have different semantics: logs prepend and change display names, effective events roll back and reuse sequence numbers, and the public archive keeps cancellations. A length or sequence number cannot identify a recoverable history version.

## Decision

- Snapshots keep the smaller core game and private execution state and reference Room-owned immutable history records through explicit History Branch identities, used for logs, events, the public event archive and checkpoint reuse. Ordinary undo and provisional restoration semantics are unchanged, including after process recovery; there is no inverse-operation journal or persistent object tree.
- One capture and restore model covers ordinary history, command checkpoints and every nested provisional checkpoint; shared checkpoints are stored once, and capture never deep-clones complete histories just to split them again. Rule and Workshop inputs keep their complete logical history.
- PostgreSQL stores history nodes and recovery records incrementally inside the existing Room / Replay transaction and frozen-retry contract; the memory test adapter stores complete logical snapshots. Active recovery stays independent of Replay payload (ADR 0011).
- Packed latest, undo and checkpoint bodies are serialized once and stored in a level-1 gzip / base64 envelope only when smaller; history nodes are never compressed individually. Recovery checksums cover the exact encoded text, readers accept raw JSON too, and the latest envelope exposes only the lobby's turn-query fields.
- **Latest committed Frame.** The latest raw Frame is stored as a structural `frameDelta` against the same snapshot's packed `state`, with exact references to its `log`, `events` and `publicEventArchive` versions. The overlay keeps every difference (derived values, constants, removed execution fields, scores, history references), is self-contained in the Room snapshot and uses no field allowlist. Restoration applies it to an independent copy of the saved state, joins history and checks the canonical Frame Hash, without current rules, `serializeState` or Replay payload.
- One in-memory capture of the authoritative core is shared by the snapshot's `state` and `frame` views as immutable values; display projections are captured separately, and rehydration copies the core before rules write to it. `RoomCommitter` owns the captured Frame and payload for its baseline and retries; private-cursor change detection compares owned content.
- Restored state and Frame core bodies share no mutable values. Room record and group identities and History Branch references stay outside the raw Replay Frame, and the original raw Frame is verified before viewer filtering, the History Window or name projections apply.
- Players keep access to the complete history. Live presentation uses a bounded History Window of complete operation groups; older records load on demand with participant authorization and viewer filtering. Names are projected from participant identity (current name, archived name or anonymization) without rewriting Replay payload or Frame Hashes.
- History identity is distinct from reusable event sequences: undo then a different action, same-length replacement, rename, cancellation and nested recovery stay distinguishable. Missing records or inconsistent references are errors, never substituted silently.

## Consequences

- Late-game save cost, write volume and memory fall while recovery and Replay stay exact; acceptance measurements are recorded in [Replay Room Capacity](../performance/replay-room-capacity.md).
- Recovery tests must cover undo variants, reused sequences, renames, nested scope aborts, Protected Observation boundaries and restart continuation, and every new record write must survive atomic failure and retry.

## Alternatives considered

- An inverse-state journal: must capture every mutation, observation boundary and nested rollback.
- A general persistent object tree: broad changes to the mutable GameState model.
- Only compressing existing snapshots: leaves the costly capture and cloning in place.
- Session-wide dirty tracking or caching every history prefix: adds invalidation obligations or quadratic storage.
