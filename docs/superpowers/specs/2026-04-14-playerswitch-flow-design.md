# PlayerSwitch in ActionFlow — Complete Design

## Goal

Add `type: 'playerSwitch'` to ActionFlow so cards can embed player context switches in their flows. Smart confirmation: auto-proceed for automatic actions, show confirmation only when a choice is encountered.

## Problem

Current PlayerSwitch only exists as an engine-internal node created automatically by opponent-scope listeners. Cards cannot explicitly switch player context in their returned flows. E167_DairyCrier needs all players to sequentially choose between 2 sheep or 2 food.

## Design: Lazy Confirmation

When the engine encounters a PlayerSwitch node:
1. Update `activePlayerIndex` immediately (silently)
2. Continue running engine steps (DON'T show confirmation)
3. If subsequent steps are all `ok` (auto-resolved) → proceed silently, no confirmation needed
4. If a `choice` step is encountered → PAUSE, show `confirmPlayerSwitch` first, then present the choice after confirmation

This works because the engine's ChoiceNode stays unresolved until `resolveChoice` is called. So we can:
1. Hit the choice → save the switch info → show confirmation
2. User confirms → resume engine → hit the same unresolved choice → present it normally

### Key insight: the engine's choice node persists

When `proceed()` returns `{ type: 'choice' }`, the ChoiceNode is NOT resolved. It stays in `ready` state. So if we defer the choice to show a confirmation first, the next `proceed()` call will return the same choice again.

## Changes

### 1. ActionFlow type

File: `shared/game/types.ts`

```typescript
export type ActionFlow =
  | { type: 'leaf'; ... }
  | { type: 'seq' | 'or' | 'xor' | 'parallel'; ... }
  | { type: 'playerSwitch'; targetPlayerId: string }
```

### 2. Engine — buildFlowNode

File: `shared/engine/engine.ts`

In `buildFlowNode()`, add handling for `'playerSwitch'`:

```typescript
if (flow.type === 'playerSwitch') {
  return new PlayerSwitchNode(`ps-flow-${this.flowNodeCounter++}`, flow.targetPlayerId)
}
```

### 3. Game Session — runEngineSteps lazy confirmation

File: `server/game-session.ts`

The current `playerSwitch` handler in `runEngineSteps()`:

```typescript
// CURRENT (always confirms)
if (step.type === 'playerSwitch') {
  this.pushHistory(false, true)
  const toIndex = ...
  if (toIndex !== -1 && toIndex !== this.activePlayerIndex) {
    this.pending = { type: 'confirmPlayerSwitch', ... }
    return
  }
  continue
}
```

Change to lazy confirmation:

```typescript
// NEW (lazy confirmation)
if (step.type === 'playerSwitch') {
  const toIndex = this.state.players.findIndex((p) => p.id === step.targetPlayerId)
  if (toIndex !== -1 && toIndex !== this.activePlayerIndex) {
    this.pushHistory(false, true)
    const fromIndex = this.activePlayerIndex!
    this.activePlayerIndex = toIndex
    // Update player reference for subsequent steps
    player = this.state.players[this.activePlayerIndex]!
    space = this.getSpaceById(this.activeSpaceId!) ?? space
    // Mark that we just switched (for deferred confirmation if choice encountered)
    this.deferredPlayerSwitch = { fromPlayerIndex: fromIndex, toPlayerIndex: toIndex }
  }
  continue
}
```

Then in the `choice` handler, check for deferred switch:

```typescript
if (step.type === 'choice') {
  // If we just auto-switched players and now hit a choice, show confirmation first
  if (this.deferredPlayerSwitch) {
    this.pending = {
      type: 'confirmPlayerSwitch',
      fromPlayerIndex: this.deferredPlayerSwitch.fromPlayerIndex,
      toPlayerIndex: this.deferredPlayerSwitch.toPlayerIndex,
    }
    this.deferredPlayerSwitch = null
    return  // Don't process the choice yet — it stays unresolved in the engine
  }
  
  // Normal choice handling (existing code)
  // ...
}
```

Clear the deferred switch flag after any non-choice step:

```typescript
// At top of the while loop, after any ok/done/blocked step:
if (step.type !== 'playerSwitch') {
  this.deferredPlayerSwitch = null
}
```

Actually, cleaner: clear when we hit `ok` steps (auto-resolved actions):

```typescript
if (step.type === 'ok') {
  this.deferredPlayerSwitch = null  // auto-resolved, no confirmation needed
  // ... existing ok handling
}
```

Wait — this clears too eagerly. If we switch, then have 3 auto ok steps, then a choice, the flag is already cleared. We need to keep it until either:
- A `choice` is encountered (show confirmation)
- A `playerSwitch` back happens (cancel the deferred)
- A `done/blocked` is reached (finalize)

Better approach: DON'T clear on `ok`. Only clear on `done/blocked` or when consumed by a choice.

```typescript
// Only clear in these cases:
if (step.type === 'choice' && this.deferredPlayerSwitch) {
  // Consumed by choice → show confirmation
  this.deferredPlayerSwitch = null
}
if (step.type === 'done' || step.type === 'blocked') {
  this.deferredPlayerSwitch = null
}
if (step.type === 'playerSwitch') {
  // New switch replaces the deferred one (or cancels if switching back)
  // handled by the playerSwitch case above
}
```

### 4. `player` variable staleness

Currently `runEngineSteps()` reads `player` once at the top:
```typescript
const player = this.state.players[this.activePlayerIndex]
```

After a silent PlayerSwitch, this is stale. Change to `let` and re-assign after switch:

```typescript
let player = this.state.players[this.activePlayerIndex]
// ...
// In playerSwitch handler:
this.activePlayerIndex = toIndex
player = this.state.players[this.activePlayerIndex]!
```

### 5. New field on GameSession

```typescript
private deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null = null
```

### 6. confirmPlayerSwitch — reset deferredPlayerSwitch

In `confirmPlayerSwitch()`, ensure `deferredPlayerSwitch` is cleared:

```typescript
confirmPlayerSwitch(): SessionResponse {
  if (this.pending.type !== 'confirmPlayerSwitch') return this.respond(false, 'no pending player switch')
  this.pushHistory(false, true)
  this.activePlayerIndex = this.pending.toPlayerIndex
  this.pending = { type: 'none' }
  this.deferredPlayerSwitch = null  // clear any leftover
  this.runEngineSteps()
  return this.respond()
}
```

## Test Scenarios

### Scenario 1: E167_DairyCrier — choice after switch → confirmation shown

Flow:
```
gainLeaf(cattle: 1)           → ok (owner, auto)
PlayerSwitch(player2)         → silent switch
XOR [gain(sheep:2), gain(food:2)]  → choice encountered!
  → deferredPlayerSwitch set → show confirmPlayerSwitch
  → user confirms → resume → show XOR choice to player2
  → player2 chooses
PlayerSwitch(owner)           → silent switch back
```

Expected: confirmation shown before player2's choice. No confirmation for the switch back (auto gain for owner already done).

### Scenario 2: Auto-gain after switch → no confirmation

Flow:
```
PlayerSwitch(player2)
gainLeaf(food: 1)             → ok (auto, for player2)
PlayerSwitch(owner)
```

Expected: no confirmation shown. Player2 silently gains 1 food.

### Scenario 3: Gain triggers card with choice → confirmation shown

Flow:
```
PlayerSwitch(player2)
gainLeaf(grain: 1)            → ok (auto)
  → but player2 has a card that triggers XOR choice after gaining grain
  → engine step returns choice
  → deferredPlayerSwitch is still set → show confirmation
```

Expected: confirmation shown because the triggered card produced a choice.

### Scenario 4: Gain triggers Wolf (auto-pop, no choice) → no confirmation

Flow:
```
PlayerSwitch(player2)
gainLeaf(grain: 1)            → ok (auto)
  → Wolf triggers: pop stack + gain pig → both ok (auto)
PlayerSwitch(owner)
```

Expected: no confirmation. All Wolf actions auto-resolve.

### Scenario 5: Existing opponent-scope behavior unchanged

A128_RiparianBuilder: opponent uses reed-bank → engine auto-creates PlayerSwitch sandwich. The construct action is optional (has choice). So:

```
PlayerSwitch(card owner)      → silent switch, deferredPlayerSwitch set
OptionalNode → ConstructFlow  → choice! → show confirmation
```

Expected: same behavior as before — confirmation shown. The lazy approach doesn't break existing cards.

### Scenario 6: Multiple players sequentially (E167 with 3+ players)

Flow:
```
gainLeaf(cattle: 1)           → auto
PlayerSwitch(p2)              → silent
XOR choice                    → confirm shown for p2
PlayerSwitch(owner)           → silent (auto switch back)
PlayerSwitch(p3)              → silent
XOR choice                    → confirm shown for p3
PlayerSwitch(owner)           → silent
```

Expected: 2 confirmations (one for p2, one for p3). Auto-gains and switch-backs are silent.

## Undo Behavior

`pushHistory()` is called before the switch. If auto-gains happen after the silent switch and then undo is triggered, all changes (including auto-gains) are rolled back to the pre-switch snapshot.

**UX for undo rollback:** When state is rolled back, the game log entries that were added during the rolled-back steps should be displayed with strikethrough (deletion line) styling. This makes it clear to all players that those actions were undone.

Implementation: compare log length before/after undo. Entries added after the snapshot get a `rolledBack: true` flag or are removed. Simplest: just let the existing undo mechanism truncate the log to the snapshot length — entries disappear, which is the current behavior.

## Edge Cases

### Switch to same player (no-op)
If `targetPlayerId === activePlayer.id`, skip entirely (existing behavior).

### Switch during stageResume
During `stageResume` (harvest phases), PlayerSwitch in flows should still work. No special handling needed since `runEngineSteps` is the same code path.

### deferredPlayerSwitch cleared on `ok` that triggers new PlayerSwitch
If after auto-gain, we hit another PlayerSwitch (switch back), the deferred flag is replaced by the new switch info. If switching back to the original player, no deferred needed.

### Multiple deferred switches
Only one `deferredPlayerSwitch` is tracked at a time. A new PlayerSwitch overwrites the previous one. This handles the switch-to-B → auto-gain → switch-back-to-A → switch-to-C pattern correctly.

## Change Summary

| File | Change | Lines |
|------|--------|-------|
| `shared/game/types.ts` | Add `playerSwitch` to ActionFlow union | +1 |
| `shared/engine/engine.ts` | Handle `playerSwitch` in `buildFlowNode()` | +3 |
| `server/game-session.ts` | `deferredPlayerSwitch` field + lazy confirmation in `runEngineSteps` | ~20 |
| `server/game-session.ts` | `player` variable from `const` to `let` + re-assign after switch | 2 |
