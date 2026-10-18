# 15. Mandatory continuations use nested provisional scopes and guards

- Status: Accepted
- Date: 2026-08-29

## Context

An action can be unreachable until another player responds, as when A132 Publican enables an opponent's Sow. A nested action can also hand control to another player before its mandatory parent is known to remain reachable, as when D014 Hammer Crusher builds a room, triggers D128 Building Tycoon, and then can no longer renovate. Treating every foreign confirmation as a permanent undo boundary either rejects the first case or strands the second in an unrecoverable block. A flat checkpoint cannot isolate nested failures, and a random result or newly revealed hidden information cannot be taken back once players have seen it.

A committed occupation or improvement can also start a mandatory `afterHostCommit` continuation after a Protected Observation, where ordinary undo cannot cross the observation and restoring before it would let the player reroll.

Separately, an exhaustive preflight of every flow (Issue #830) was replaced by current-step admission (Issues #834–#837), and rejected input had to be distinguished from an accepted continuation that blocks (#1257).

## Decision

**Settlement boundary.** Every public mutating `GameCore` command crosses one atomic settlement boundary with a normalized command identity and a complete command-entry checkpoint. Set-valued fields, such as `commitSelection` farm elements and animal-reorganization `choice.payload.zones`, are normalized independently of order.

**Provisional scopes.**

- An unresolved mandatory continuation opens a Provisional Continuation Scope when its pre-resolution chain first switches control to another player or produces a Protected Observation. The checkpoint of that command is the scope's rollback point.
- Scopes follow mandatory-host ancestry: helpers of one host share a scope; a genuinely nested host creates a child. Child failure restores only the child checkpoint, child success merges into the parent, and an unguarded parent failure restores the whole subtree. Activation descendants suppress only the `before` listener that produced them.
- A mandatory `afterHostCommit` continuation and everything it returns or injects stays mandatory. If its host choice came from an interaction published after a Protected Observation, the scope opens at that interaction's checkpoint; explicit `undoAction` returns to the same choice and cached observation, never before it.
- The session must end in one of two outcomes: the host validates and provisional effects become final, or the checkpoint is restored and control returns to the host player's prior choice.

**Guards.** At every command boundary the session strictly probes active mandatory hosts with `skipBeforeTriggers=true`, without mutating state. A successful probe guards the host: later commands must keep it executable, and a command that breaks a guard is restored before publication. A scoped `isDoable` gate whose `before` already paid or unlocked must step aside in the probe; replacement alternatives run full `isDoable`. The guard ends when the host enters its core execution. A host still unreachable at the end of its pre-resolution chain restores its scope.

**Failure memory.** A restored command is remembered on the restored pending, so the same normalized command stays unavailable until rule-relevant state changes (compared before and after, not by a global revision). Only keys matching the current state and pending are projected to the recipient as `rejectedCommandKeys`. An exhausted optional flow declines through a nested command settlement, because `__skip__` can run further effects.

**Protected Observations.** Random results and newly disclosed hidden information are reported explicitly by the generic random and hidden-zone primitives, including dev commands that reveal a hand card, and are buffered in the command. They are published only when every active ancestor scope is guarded; a host completed in the same command no longer counts. A rule that needs to reveal before a later command can guard must introduce a reusable permit, never leak the observation or add a card exception. New observations also protect unstarted required steps and mandatory choices of continuation owners.

**Durability.** Provisional does not mean unpublished. Every successful command still goes through Durable Room Commit; change detection compares the public Frame and the private session cursor, and commands that persist failure memory carry `durableTransition`. A durable rejection sends its error only to the submitter while peers receive an error-free snapshot, and a reason-specific log explains the restoration. A scope abort commits the restored Frame as a new Replay Step with its own log and never rewrites earlier Steps. Scopes, checkpoints, guards and failure memory live in the private session cursor, never in Replay Frames.

**Undo boundaries.** Foreign confirmations stay user-facing undo boundaries. Scope abort is a separate system rollback that may cross them, and they become permanent once the scope and every ancestor are guarded or complete. Undo history keeps the restored host frame's identity and rejects an undo that would break an established guard.

**Current-step admission and explicit undo.** Entry checks the current atomic action with its parameters, source, owner, cost modifiers and replacement alternatives; an applicable `before` that can start also permits an attempt. SEQ checks its next step, OR/XOR its branch entries; vetoes and placement, phase and ownership restrictions stay binding. No query drives a cloned engine through future choices. Accepted roots and continuations keep required descendants mandatory; a failure exposes `engine-blocked` and keeps earlier effects until `undoStep` or `undoAction`. Before its body, an unavailable mandatory host offers a Continue window only when the legal anytime list is non-empty; Continue rechecks strictly without replaying `before`. Payment, fence geometry and supply remain atomic checks.

**Input rejection.** Rejected external input (pending-input validation, retryable `resolveChoice` rejection) restores the complete command checkpoint, including undo history, action-start metadata, engine cursor, private response buffers and interaction, returns the original `allowedCommands`, and creates no undo entry. A selected OR/XOR branch that fails after acceptance is accepted blocking, not rejection. The outcome is propagated explicitly and settled at the Session command boundary, never inferred from `SessionResponse.ok` or `recoverable`.

This is Engine / Session semantics with no card or action ID special cases. Cards return ordinary flows; the Session owns checkpoints and observation buffering, and the Engine supplies host ancestry and strict probes.

## Consequences

- Cross-player assistance and nested mandatory hosts recover without stranding a player, and revealed information is never taken back.
- Every command pays for a checkpoint and a probe of active hosts.
- Players see explicit restoration logs instead of a dedicated scope UI.

## Alternatives considered

- A single flat checkpoint: cannot isolate nested failures.
- Publishing observations and restoring later: leaks player knowledge.
- Preparing and reserving every flow before execution, or pre-disabling host choices: needs an exact execution witness, dry-run semantics and protocol changes for every action.
- Changing payment order: alters card semantics.
- Exhaustive preflight with completion scopes: replaced by current-step admission and explicit undo.
