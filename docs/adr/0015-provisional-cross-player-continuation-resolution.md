# 15. Mandatory continuations use nested provisional scopes and guards

- Status: Accepted
- Date: 2026-08-29

## Context

An action can be initially unreachable until another player responds, as with A132 Publican enabling an opponent's Sow. A nested action can also hand control to another player before its mandatory parent continuation is known to remain reachable, as when D014 Hammer Crusher builds a room, triggers D128 Building Tycoon, and then can no longer renovate. Treating every foreign confirmation as an immediate permanent undo boundary either rejects the first case or can strand the second in a non-recoverable `engine-blocked` state. A flat rollback scope is also insufficient when mandatory continuations nest or a provisional flow produces a random result or new hidden information that players cannot forget.

## Decision

An unresolved mandatory continuation uses a Provisional Continuation Scope when its pre-resolution chain first crosses a rollback hazard: control switches to another player or the current command produces a Protected Observation. The host action has been committed to but its core effect has not executed. A nested action may already have executed inside that chain, as with Hammer Crusher's Construct, while an ordinary `after` response to a completed top-level action remains final.

Scopes follow mandatory-host ancestry. Multiple helpers for the same host share one scope. A genuinely nested mandatory host creates a child scope: child failure restores only the child checkpoint, child success merges its effects into the parent, and an unguarded parent failure still restores the whole nested subtree.

The entry checkpoint for the command that first crosses the rollback hazard becomes the scope rollback point. Player commands remain atomic: if a nested scope opens partway through a command, child failure may also undo earlier mutations from that same command, but it does not undo prior commands already retained by the parent scope. A failed Publican-assisted Sow therefore returns to the Sow selection, while a failed Hammer Crusher room plan returns to the room-plan interaction and retains the resources granted before that command. The session must then resolve to one of two outcomes: the host continuation validates and the provisional effects become final, or this checkpoint is restored and control returns to the host player's prior choice.

Restoring the checkpoint does not forget the failed attempt. The restored parent pending retains the normalized command that failed, so submitting the same command again without changing authoritative state cannot repeat the foreign prompts. If a completed anytime flow changes authoritative state, the pending discards its failed attempts and derives its choices again; this uses before-and-after state comparison rather than a new global revision or the Room publication version. The marker ends with the parent pending.

At every authoritative command boundary, the session strictly probes every active mandatory host with its `before` triggers skipped. The probe must not mutate authoritative state. A provisional host whose probe succeeds becomes guarded: its own scope can no longer abort for host-doability failure, and every later command must leave that host strictly executable. Its effects remain subject to any unguarded ancestor scope. A command that violates an existing guard restores its command checkpoint before publication and records the normalized initiating choice on the current pending, so the same option is disabled until authoritative state changes. Optional flows with no remaining accepting choice decline without another confirmation. The guard ends when the host enters its core execution; already-open nested flows may finish under the guard, but unrelated actions and anytime windows may not interleave.

If a host reaches the end of its pre-resolution chain while still not strictly executable, its scope checkpoint is restored.

Random results and newly disclosed hidden information are Protected Observations. Generic random and hidden-zone primitives report them explicitly; scope safety does not infer them only from state diffs and does not depend on card IDs. They remain buffered inside the current command and may be published only when every active ancestor scope is guarded by command settlement. A random result that makes all ancestors strictly executable in the same command is therefore supported. If a Protected Observation must be shown before a later player command can guard an ancestor, that branch cannot cross the publication gate and the current command is restored. A concrete rule that requires such a sequence must introduce a reusable continuation permit or reservation semantic; it must not leak the observation, pretend that player knowledge was rolled back, or add a card-ID exception.

Provisional does not mean unpublished. Every successful player command inside the scope still goes through Durable Room Commit, advances the Replay with its visible Frame, and survives reconnect or process recovery. An abort commits the restored Frame as a new Replay Step and emits one generic system rollback log instead of deleting or rewriting the provisional Steps. It adds no confirmation interaction or dedicated scope UI. The active scope, rollback savepoint, and failed-attempt metadata therefore belong to the serialized authoritative session cursor rather than a client draft.

Foreign confirmations remain user-facing undo boundaries: no player may manually erase another player's response. Scope abort is a separate system rollback authority that may restore its savepoint across those provisional boundaries. They become ordinary permanent boundaries once the scope and every ancestor are guarded or completed.

This is an Engine/Session semantic and must not special-case card or action IDs. Cards continue to produce ordinary ActionFlow values; the Session owns command checkpoints and observation buffering, while the Engine supplies mandatory-host ancestry and strict probes.

## Considered alternatives

A single flat checkpoint cannot isolate nested-host failure. Publishing protected observations and later restoring state leaks player knowledge. Preparing and reserving every ActionFlow before execution could prevent both failures, but would require an exact execution witness, dry-run semantics, and protocol changes across all actions. This design uses nested checkpoints and runtime guards now, and adds a general permit only when a concrete rule cannot pass the observation gate.
