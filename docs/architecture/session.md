# `shared/session/`: Session Layer

[English](session.md) | [中文](session_zh.md)

`GameCore` coordinates `GameState`, `EngineStack`, history, phase progression, interaction building, undo and responses. Phase functions in `phases/` are pure helpers, not mixins; all coordination converges in `GameCore`.

## Files

```text
shared/session/
├── session-core.ts        GameCore command entry points
├── serialization.ts       SerializedGameState serialization
├── state-bootstrap.ts     Initial state construction
├── stats.ts               Statistics and logging
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

## GameCore Entry Points

`GameCore` owns `state`, `engineStack`, step history with the action-start snapshot, and the end-game scoring cache. `GameSession` (`server/game/authoritative-session.ts`) is a thin wrapper that injects the isolated custom-card executor and builds viewer-filtered or debug payloads. Commands exposed to the server:

```text
takeAction(playerIndex, spaceId)
takeSpecialAction(playerIndex, cardId, actionId, payload?)
takeAnytimeAction(playerIndex, actionId)
resolveChoice(playerIndex, value, payload?)
commitSelectionChoice(playerIndex, payload)
resolveOrdinaryCardDrawChoice(playerIndex, choiceId, keepCardId)
performRoundEnd()
loadState(raw)
undoStep() / undoAction()
```

## Unified SessionResponse

```ts
type SessionResponse = {
  ok: boolean
  state: GameState
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}
```

- Session tests assert this structure directly; WebSocket paths serialize it through `GameSession.buildSyncPayload()` and filter it per viewer.
- Every mutating command crosses one settlement boundary ([ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)). Input Rejection restores the complete command checkpoint, including history and action-start metadata; accepted mandatory blocking keeps its effects. `ok:false` or `recoverable:true` alone never classifies a rejection. A rule-valid guard-breaking command keeps its durable provisional restoration and failure memory; an invalid input inside a guarded scope gains neither.

Tests: `server/__tests__/{authoritative-command-settlement,rejected-pending-input}.test.ts`.

## Rotation, extra turns and supply people

**Extra turns** ([ADR 0001](../adr/0001-a92-adoptive-pull-model-extra-turn-hook.md), [ADR 0008](../adr/0008-node-parallel-reaction-dispatch.md)):

- `contributeExtraTurn?: (state, player) => ActionFlow | void` is a `CardEffect` hook consumed explicitly by rotation in `shared/session/phases/round.ts`, never by `runCardEffectHook`.
- `collectExtraTurnContributions()` is the single source; `hasPendingExtraTurn()` checks it and `collectExtraTurnFlow()` builds the interaction. Three gates treat a pending extra turn as eligibility: `nextSeatedPlayerIdx`, `roundWorkComplete` and the rotation skip loop.
- `startPendingExtraTurnIfAny(core)` is the only injection path, shared by work-phase entry, confirm-next-player rotation, state loading and undo restoration, and injects only into an empty stack at the current seat. A provider with `extraTurnBeforeWorkers: true` appears alongside ordinary placement and legal Moor special actions; otherwise providers run after ordinary workers are exhausted. A supply provider can be declined only once ordinary workers are exhausted, and choosing ordinary placement keeps later opportunities unless the card requires the first turn, which it consumes in `onEndTurn`. Pending ordinary-card draws defer injection.
- A repeatable provider may define `countExtraTurns`. Skips and forced consumption count per source card in `PlayerState` fields, and `countPendingExtraTurns()` reuses provider aggregation instead of a player-level counter; a non-interactive fallback consumes one source in stable card order only when automatic progression requires it.
- `onBeforePlayerTurn` returning `{ skipTurn: true }` makes rotation pass the player before their turn starts.
- Snake Opening (ignored for a single seat) gives every player 3 starting food. In round 1, `nextWorkRotationIdx()` reverses the work rotation the first time it would wrap past the Round Work Order start, emits `snakeOpening.reversed` and stays reversed for that work phase; the backward walk starts at the seat that just acted, so that seat is considered again first; other orderings use the forward helpers.

**Supply people:**

- Supply placements use `place-farmer` with `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`. Execution locks one finite worker ID before showing targets; submission, events, linked occupancy, movement and undo keep it. A card-driven placement records its person-action identity in the current Turn Scope.
- `inactiveWorkersInSupply()` excludes reservations, pending placements, temporary people and removed tokens; `availableWorkers()` includes a recalled temporary person, while family size, housing, feeding and scoring use permanent members.
- `returnSupplyWorkers()` runs after every `onBeforeReturnHome` and before `onStartReturnHome`, removing every location of the exact ID and applying its disposition; recalled or moved people keep theirs, and reservations without a due return round survive returning home. Before that, `recordReturnHomePlacements()` captures final positions in `__roundPlacement__`; return-home effects read `getReturnHomePlacements()` or `getReturningPersonPlacements()` (which excludes synthetic blocks and removed people), never live occupancy.
- A reservation is distinct from a placement opportunity; the reserving card releases it at its declared timing (for example, in the target StartOfTurn tree). Supply opportunities use ordinary current-step admission: an accepted use with no legal target blocks until explicit undo, with no future-target preflight or refund.
- When extra housing expires, its capacity clears first; insufficient housing permanently removes only the first active person in stable family order (`removedFromSupply`, references cleared, `worker.returned` with `to=removed`).

Tests: `server/__tests__/{supply-workers-session,snake-opening-session}.test.ts`.

## Turn Scope and Action-Execution Scope

Rotation opportunity, Turn Scope and action-execution scope are separate lifetimes. "On your turn" and "in the same turn" read the Turn Scope; "what was actually built / plowed / sown" reads the current action's scope or transaction.

| Rule situation | Rotation opportunity | Turn Scope | Action-execution scope |
|---|---|---|---|
| Ordinary placement or a Moor special action chosen by rotation | Consume the current opportunity | Open a new scope | One per complete Rule Action |
| A contributed Extra Turn | Open an additional opportunity | Open a new scope | One per complete Rule Action |
| A worker move through `move-farmer-to-space` (each moved worker) | No new opportunity | Open a new scope per moved worker | One per complete Rule Action |
| An immediate Rule Action that stays part of the current Turn | No new opportunity | Inherit the current scope | Open a new scope |
| A phase or anytime Rule Action that is not a Turn | No new opportunity | None | Open a new scope |
| A raw gain, payment, choice or listener activation | No new opportunity | Inherit if one exists | Stay in the surrounding scope |

- A Turn Scope begins before its placement, Moor special action or card-driven space use and lasts through every Rule Action, trailing effect, required reorganization and end-of-turn hook of that Turn; then it clears, and later processing never observes a completed Turn's identity or start snapshot. A moved worker's Turn passes the ordinary person-action trigger to those hooks and closes before the next worker is chosen.
- Executing an "on your turn" effect requires the owner's active scope; a doability query may project the scope the current rotation player is about to open.
- Multiple Rule Actions in one Turn share the Turn Scope and use separate action scopes. Per-action deltas use the action transaction.
- Same-person `jumpLeaf` relocations and worker-less `viaCardJump` uses stay in the surrounding Turn Scope, if any; only `move-farmer-to-space` wraps each move in `turn-scope` begin / end.
- `actionContext.trueAction` only says whether an effect counts as taking its named action for listeners; it creates no Turn and no action scope.
- **Person Placement Order** counts normal person placements in the Work Placement Chronology: moving the same worker does not advance it; normally placing a temporary or recalled person does. `isCurrentActionSecondPersonPlacement()` prefers the current context's `placedWorkerId`.

Tests: `server/__tests__/{person-placement-order-session,move-farmer-before-placement-session}.test.ts`.

## Snapshot data and executable-rule recovery

See [ADR 0028](../adr/0028-session-recovery-preserves-authoritative-snapshot-data.md). New-game creation owns initial dealing. Loading or restoring a Session preserves present empty hands, stored card identities, missing optional rule fields, animal assignments and history; it never re-deals, and it rejects invalid required input instead of converting it into a new game. `rehydrateState()` only decodes data; the owning Core then rebuilds known executable definitions and engine cursors without replacing the captured data. Undo, command checkpoints, provisional checkpoints and process recovery share this contract.

Tests: `server/__tests__/session-recovery-data.test.ts`.

