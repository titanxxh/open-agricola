# 1. Extra turns are pulled by rotation through a provider hook

- Status: Accepted
- Date: 2026-05-30

## Context

Some cards give a player an additional placement opportunity in the current round. A092 Adoptive Parents is the first: paying 1 food lets a newborn act in the round it was born. The first implementation pushed `seq[pay, place-farmer]` from a `place-farmer` `after` listener, so the player placed twice in a row and broke strict alternating placement.

Rotation only considered players with `workersAvailable > 0`. A player with no remaining workers but a pending extra opportunity was skipped and never received a turn, so the opportunity could not be expressed inside the card file.

## Decision

- Extra placement opportunities are pulled by rotation, never pushed by a listener. A card declares `contributeExtraTurn?(state, player): ActionFlow | void`; `hasPendingExtraTurn(state, player)` is true when any provider returns a flow.
- Rotation treats a player as finished only when `workersAvailable <= 0 && !hasPendingExtraTurn`. The same test governs `nextSeatedPlayerIdx`, the rotation loop and the `allWorkersUsed` round-end check.
- When rotation reaches such a player, the provider flow becomes the pending interaction for that turn.
- Several providers are collected by `collectExtraTurnContributions()`. One provider expands directly; several enter a one-shot `ParallelNode(mode='trigger-select')` of `activate-extra-turn` children, and the selected card's own flow expands only then. A provider that no longer contributes at activation fails instead of silently consuming the prompt.
- Skipping or forced consumption is counted per source card (`_extraTurnSkipCountsByCard`, `_extraTurnConsumedCountsByCard`), not by a player-level counter. A card that lets its player decline for the round records that in its own `cardStates`, which rotation reads through the provider.

## Consequences

- Alternating placement holds for every extra-placement card, and several providers coexist without hiding each other.
- A card's forfeit flag stays in its own `cardStates`. The per-source counters `_extraTurnSkipCountsByCard` / `_extraTurnConsumedCountsByCard` are `PlayerState` fields: cleared when the next round opens, but part of the authoritative state that snapshots and undo restore.
- The three rotation gates must change together; Session tests cover all three.

## Alternatives considered

- Keep the push model and fix its dead code: it cannot restore alternation.
- Add a global `GameState.skippedPlayers`: changes the core state and the snapshot / patch shape when a card-local forfeit flag already suffices.
- Separate boolean and flow hooks: two predicates that must be kept in sync.
- Extend `onBeforePlayerTurn` to return `{ skipTurn?, flow? }`: mixes skipping with extra turns and still needs a separate aggregate for rotation.
