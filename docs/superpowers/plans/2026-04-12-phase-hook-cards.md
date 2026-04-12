# Phase Hook Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one card per unimplemented phase hook (8 cards total) so every harvest/round phase has at least one working card.

**Architecture:** Two layers of change: (1) promote 7 imperative-only hooks in `game-session.ts` to stage hooks (adding `continueStageHook` calls so cards can return ActionFlow), and (2) change corresponding hook types in `card-effects.ts` from `EffectHandler` to `FlowEffectHandler`, then implement each card. Cards use `registerCardEffect` returning ActionFlow from the appropriate hook.

**Tech Stack:** TypeScript, vitest, shared/cards card-effects pattern

---

## Key Patterns

### Stage Hook Pattern
`game-session.ts` has two kinds of hook calls:
- **Imperative** (`runXxxHooks`): calls `runHookForAllCards()` which iterates all cards and calls `handler(state, player)` ignoring return values. Used for simple flag-setting.
- **Stage** (`continueStageHook`): calls `runCardEffectHook()` per card, and if an ActionFlow is returned, feeds it into the engine via `startStageFlow()`. Supports player choices, gains, pending states.

To make a card return ActionFlow from a hook, the hook must have BOTH an imperative call (for side effects) AND a `continueStageHook` call (for ActionFlow execution). The hook type must be `FlowEffectHandler`.

### Card Implementation Pattern
```typescript
const CARD_ID = 'X99_CardName'
registerCardEffect({
  id: CARD_ID,
  onSomeHook: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return  // ownership check
    // condition check...
    return { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }
  },
})
```

### Test Pattern (unit tests at `shared/cards/__tests__/`)
Tests use `getCardEffect()` to get the registered effect, then call the hook directly and assert on the returned ActionFlow. No GameSession needed.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `shared/cards/card-effects.ts` | Modify | Change 7 hook types from `EffectHandler` to `FlowEffectHandler` |
| `server/game-session.ts` | Modify | Add 7 `continueStageHook` calls + new `continueXxx` methods + update `StageResumeState` + `resumeStageFlow` |
| `shared/cards/D/D107_Bellfounder.ts` | Modify | Add `registerCardEffect` with `onStartReturnHome` |
| `shared/cards/D/D167_PureBreeder.ts` | Modify | Add `registerCardEffect` with `onBuy` + `onAfterRoundEnd` |
| `shared/cards/C/C24_BedintheGrainField.ts` | Modify | Add `registerCardEffect` with `onBuy` + `onStartHarvest` |
| `shared/cards/E/E73_Scythe.ts` | Modify | Add `registerCardEffect` with `onStartHarvestFieldPhase` |
| `shared/cards/A/A112_ScytheWorker.ts` | Modify | Add `registerCardEffect` with `onBuy` + `onHarvestFieldPhase` |
| `shared/cards/E/E112_GrainThief.ts` | Modify | Add `registerCardEffect` with `onEndHarvestFieldPhase` |
| `shared/cards/C/C63_CraftBrewery.ts` | Modify | Add `registerCardEffect` with `onHarvestFeedingPhase` |
| `shared/cards/E/E133_ChampionBreeder.ts` | Modify | Add `registerCardEffect` with `onEndHarvestFeedingPhase` |
| `shared/cards/__tests__/phase-hook-cards.test.ts` | Create | Unit tests for all 8 cards |

---

## Task 0: Promote hook types in card-effects.ts

**Files:**
- Modify: `shared/cards/card-effects.ts:67-93` (CardEffect type)

- [ ] **Step 1: Change 7 hook types from EffectHandler to FlowEffectHandler**

In `shared/cards/card-effects.ts`, update the `CardEffect` type:

```typescript
// Change these from EffectHandler to FlowEffectHandler:
onStartReturnHome?: FlowEffectHandler    // was EffectHandler
onAfterRoundEnd?: FlowEffectHandler      // was EffectHandler
onStartHarvest?: FlowEffectHandler       // was EffectHandler
onStartHarvestFieldPhase?: FlowEffectHandler  // was EffectHandler
onHarvestFieldPhase?: FlowEffectHandler       // was EffectHandler
onEndHarvestFieldPhase?: FlowEffectHandler    // was EffectHandler
onHarvestFeedingPhase?: FlowEffectHandler     // was EffectHandler
onEndHarvestFeedingPhase?: FlowEffectHandler  // was EffectHandler
```

No other changes needed — `runCardEffectHook()` already casts all handlers to `FlowEffectHandler` (line 137), and `runHookForAllCards()` ignores return values so existing imperative calls still work.

---

## Task 1: Add stage hooks to game-session.ts

**Files:**
- Modify: `server/game-session.ts`

This is the core infrastructure change. We add 7 new `continueStageHook` calls by splitting existing methods into smaller stages. Each new stage hook name must be added to the `StageResumeState` type and the `resumeStageFlow` switch.

### 1a. Update StageResumeState type

- [ ] **Step 1: Add 7 new hook names to the StageResumeState union**

At `server/game-session.ts:136-148`, add to the `hook` union:

```typescript
type StageResumeState = {
  hook:
    | 'onBeforeHarvest'
    | 'onAfterReap'
    | 'onHarvest'
    | 'onEndHarvest'
    | 'onAfterHarvest'
    | 'onBeforeStartOfTurn'
    | 'onRoundStart'
    | 'onStartHarvestFeedingPhase'
    | 'onReturnHome'
    // NEW:
    | 'onStartReturnHome'
    | 'onAfterRoundEnd'
    | 'onStartHarvest'
    | 'onStartHarvestFieldPhase'
    | 'onHarvestFieldPhase'
    | 'onEndHarvestFieldPhase'
    | 'onHarvestFeedingPhase'
    | 'onEndHarvestFeedingPhase'
  playerIndex: number
  cardIndex: number
}
```

### 1b. Refactor return-home flow

- [ ] **Step 2: Split performRoundEnd to thread through onStartReturnHome stage hook**

Current flow:
```
performRoundEnd → runBeforeReturnHomeHooks → runStartReturnHomeHooks → continueReturnHomeHooks
```

New flow:
```
performRoundEnd → runBeforeReturnHomeHooks → runStartReturnHomeHooks → continueStartReturnHomeHooks(NEW) → onStartReturnHome stage → continueReturnHomeHooks
```

Add new method:
```typescript
private continueStartReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (this.continueStageHook('onStartReturnHome', playerIndex, cardIndex)) {
    return this.respond()
  }
  return this.continueReturnHomeHooks()
}
```

Change `performRoundEnd`: replace `return this.continueReturnHomeHooks()` with `return this.continueStartReturnHomeHooks()`.

### 1c. Refactor harvest field phase flow

- [ ] **Step 3: Split continueHarvestFromBeforeHarvest into stages**

Current flow (after onBeforeHarvest resolves):
```
runStartHarvestHooks → runStartHarvestFieldPhaseHooks → runHarvestFieldPhaseHooks → reap → continueAfterReapEffects
```

New flow — insert 3 stage hooks:
```
→ continueFromStartHarvest(NEW)
  → runStartHarvestHooks (imperative)
  → onStartHarvest stage hook
  → continueHarvestFieldStart(NEW)
    → phase='field', log, runStartHarvestFieldPhaseHooks (imperative)
    → onStartHarvestFieldPhase stage hook
    → continueHarvestFieldPhase(NEW)
      → runHarvestFieldPhaseHooks (imperative)
      → onHarvestFieldPhase stage hook
      → continueHarvestReap(NEW)
        → reap()
        → continueAfterReapEffects (existing)
          → onAfterReap stage hook (existing)
          → continueEndFieldPhase(NEW)
            → runEndHarvestFieldPhaseHooks (imperative)
            → onEndHarvestFieldPhase stage hook
            → continueHarvestEffects (existing)
```

New methods:
```typescript
private continueFromStartHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (this.continueStageHook('onStartHarvest', playerIndex, cardIndex)) {
    return this.respond()
  }
  return this.continueHarvestFieldStart()
}

private continueHarvestFieldStart(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (playerIndex === 0 && cardIndex === 0) {
    // First entry — set up field phase
    const harvestOrder = this.getHarvestPlayerIndices()
    this.state.phase = 'field'
    this.state.log.unshift({ key: 'log.harvestPhaseReap' })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runStartHarvestFieldPhaseHooks(this.state, player)
    })
  }
  if (this.continueStageHook('onStartHarvestFieldPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  return this.continueHarvestFieldPhase()
}

private continueHarvestFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (playerIndex === 0 && cardIndex === 0) {
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runHarvestFieldPhaseHooks(this.state, player)
    })
  }
  if (this.continueStageHook('onHarvestFieldPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  return this.continueHarvestReap()
}

private continueHarvestReap(): SessionResponse {
  this.state.harvestReapSummary = {}
  const harvestOrder = this.getHarvestPlayerIndices()
  harvestOrder.forEach((index) => {
    const player = this.state.players[index]
    if (!player) return
    const result = reap(player)
    this.state.harvestReapSummary![player.id] = result.reapSummary
    this.logHarvestResourceEntry('log.harvestReapDetail', player, result.reapSummary.resources)
  })
  return this.continueAfterReapEffects()
}
```

Modify `continueHarvestFromBeforeHarvest`: after onBeforeHarvest resolves, call imperative `runStartHarvestHooks` then `return this.continueFromStartHarvest()` (remove all the inline code after it).

Modify `continueAfterReapEffects`: after onAfterReap resolves, call `return this.continueEndFieldPhase()` instead of inline code.

Add:
```typescript
private continueEndFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (playerIndex === 0 && cardIndex === 0) {
    this.getHarvestPlayerIndices().forEach((index) => {
      const player = this.state.players[index]
      if (player) runEndHarvestFieldPhaseHooks(this.state, player)
    })
  }
  if (this.continueStageHook('onEndHarvestFieldPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  delete this.state.harvestReapSummary
  this.state.phase = 'harvest'
  return this.continueHarvestEffects()
}
```

### 1d. Refactor feeding/breed phase flow

- [ ] **Step 4: Add onHarvestFeedingPhase stage hook before feeding logic**

In `continueHarvestEffects`, after onStartHarvestFeedingPhase stage hook resolves, replace inline feeding setup with a new `continueHarvestFeeding` method:

```typescript
private continueHarvestFeeding(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (playerIndex === 0 && cardIndex === 0) {
    this.state.log.unshift({ key: 'log.harvestPhaseFeed' })
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runBeforeFeedHooks(this.state, player)
    })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runHarvestFeedingPhaseHooks(this.state, player)
    })
  }
  if (this.continueStageHook('onHarvestFeedingPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  // ... existing feeding logic (feedQueue etc.)
  return this.executeFeedingLogic()
}
```

Extract the existing feeding queue logic from `continueHarvestEffects` into `executeFeedingLogic()`.

- [ ] **Step 5: Add onEndHarvestFeedingPhase stage hook in startBreedPhase**

In `startBreedPhase`, after imperative hooks, add:
```typescript
private startBreedPhase(): SessionResponse {
  this.state.phase = 'breeding'
  const harvestOrder = this.getHarvestPlayerIndices()
  harvestOrder.forEach((index) => {
    const player = this.state.players[index]
    if (player) runEndHarvestFeedingPhaseHooks(this.state, player)
  })
  return this.continueAfterFeedingPhase()
}

private continueAfterFeedingPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (this.continueStageHook('onEndHarvestFeedingPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  const harvestOrder = this.getHarvestPlayerIndices()
  harvestOrder.forEach((index) => {
    const player = this.state.players[index]
    if (player) runAfterFeedHooks(this.state, player)
  })
  this.state.log.unshift({ key: 'log.harvestPhaseBreed' })
  this.applyBreedPhase()
  // ... existing animal reorg check + continueEndHarvestEffects
}
```

### 1e. Refactor finalizeRound for onAfterRoundEnd

- [ ] **Step 6: Add onAfterRoundEnd stage hook in finalizeRound**

Split `finalizeRound`:
```typescript
private finalizeRound(): SessionResponse {
  this.state.phase = 'preparation'
  this.state.players.forEach((p) => runRoundEndHooks(this.state, p))
  this.state.players.forEach((p) => runAfterRoundEndHooks(this.state, p))
  return this.continueAfterRoundEnd()
}

private continueAfterRoundEnd(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (this.continueStageHook('onAfterRoundEnd', playerIndex, cardIndex)) {
    return this.respond()
  }
  this.state.players.forEach((p) => { p.newbornCount = 0 })
  this.state.round += 1
  if (this.state.round > 14) {
    this.state.gameOver = true
    this.state.log.unshift({ key: 'log.gameOver' })
    this.pending = { type: 'none' }
    return this.respond()
  }
  return this.continueBeforeStartOfTurn()
}
```

### 1f. Update resumeStageFlow switch

- [ ] **Step 7: Add all 7 new cases to resumeStageFlow**

```typescript
case 'onStartReturnHome':
  this.continueStartReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onAfterRoundEnd':
  this.continueAfterRoundEnd(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onStartHarvest':
  this.continueFromStartHarvest(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onStartHarvestFieldPhase':
  this.continueHarvestFieldStart(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onHarvestFieldPhase':
  this.continueHarvestFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onEndHarvestFieldPhase':
  this.continueEndFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onHarvestFeedingPhase':
  this.continueHarvestFeeding(stageResume.playerIndex, stageResume.cardIndex)
  return
case 'onEndHarvestFeedingPhase':
  this.continueAfterFeedingPhase(stageResume.playerIndex, stageResume.cardIndex)
  return
```

- [ ] **Step 8: Run existing tests to verify no regressions**

Run: `npx vitest run server/__tests__/ shared/`
Expected: All existing tests pass — the refactor is pure structural, no behavioral change.

- [ ] **Step 9: Commit**

```
feat: add stage hooks for 7 unimplemented harvest/round phases
```

---

## Task 2: D107_Bellfounder (onStartReturnHome)

**Files:**
- Modify: `shared/cards/D/D107_Bellfounder.ts`
- Test: `shared/cards/__tests__/phase-hook-cards.test.ts`

**Card effect:** In the returning home phase, if you have ≥ 1 clay, optionally discard ALL clay for your choice of 3 food or 1 bonus VP.

- [ ] **Step 1: Write test**

```typescript
describe('D107_Bellfounder', () => {
  it('returns xor flow when player has clay', () => {
    const effect = getCardEffect('D107_Bellfounder')
    const player = createPlayer()
    player.occupationPlayed = ['D107_Bellfounder']
    player.resources.clay = 5
    const flow = effect!.onStartReturnHome!(createState(player), player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    // first child: pay all clay → 3 food
    // second child: pay all clay → 1 VP
    // third child: noop (decline)
  })

  it('does not trigger without clay', () => {
    const effect = getCardEffect('D107_Bellfounder')
    const player = createPlayer()
    player.occupationPlayed = ['D107_Bellfounder']
    player.resources.clay = 0
    const flow = effect!.onStartReturnHome!(createState(player), player)
    expect(flow).toBeUndefined()
  })
})
```

- [ ] **Step 2: Implement card**

```typescript
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D107_Bellfounder'

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.resources.clay <= 0) return
    const clay = player.resources.clay
    return {
      type: 'xor',
      optional: true,
      children: [
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay-resources', params: { clay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
          ],
        },
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay-resources', params: { clay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          ],
        },
      ],
    }
  },
})

export const D107_Bellfounder = new Occupation({ ... }) // keep existing definition
```

- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement D107_Bellfounder (onStartReturnHome)`

---

## Task 3: D167_PureBreeder (onAfterRoundEnd)

**Files:**
- Modify: `shared/cards/D/D167_PureBreeder.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** onBuy: gain 1 wood. After each non-harvest round, optionally breed 1 animal type (need ≥ 2 of that type). Not a breeding phase.

- [ ] **Step 1: Write test**

```typescript
describe('D167_PureBreeder', () => {
  it('onBuy returns gain 1 wood', () => { ... })

  it('returns xor breed choice after non-harvest round', () => {
    const effect = getCardEffect('D167_PureBreeder')
    const player = createPlayer()
    player.occupationPlayed = ['D167_PureBreeder']
    player.resources.sheep = 3
    player.resources.cattle = 2
    const state = createState(player)
    state.round = 3 // non-harvest round
    const flow = effect!.onAfterRoundEnd!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
  })

  it('does not trigger on harvest round', () => {
    const effect = getCardEffect('D167_PureBreeder')
    const player = createPlayer()
    player.occupationPlayed = ['D167_PureBreeder']
    player.resources.sheep = 3
    const state = createState(player)
    state.round = 4 // harvest round
    const flow = effect!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not trigger without breedable animals', () => { ... })
})
```

- [ ] **Step 2: Implement card**

onBuy: return `gainLeaf(CARD_ID, { wood: 1 })`.

onAfterRoundEnd: check `!harvestRounds.includes(state.round)`, check which animal types have ≥ 2, return xor flow with one gain option per breedable type + noop decline. Use `getTotalAnimalCapacity(player)` to verify space exists.

```typescript
const harvestRounds = [4, 7, 9, 11, 13, 14]
const BREEDABLE = ['sheep', 'boar', 'cattle'] as const

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onAfterRoundEnd: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (harvestRounds.includes(state.round)) return
    const cap = getTotalAnimalCapacity(player)
    if (cap <= 0) return
    const children: ActionFlow[] = BREEDABLE
      .filter((t) => player.resources[t] >= 2)
      .map((t) => ({ type: 'leaf', actionId: 'gain', params: { [t]: 1 }, sourceCard: CARD_ID }))
    if (children.length === 0) return
    children.push({ type: 'leaf', actionId: 'noop', choiceLabelKey: 'ui.interactionDecline' })
    return { type: 'xor', optional: true, children }
  },
})
```

- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement D167_PureBreeder (onAfterRoundEnd)`

---

## Task 4: C24_BedintheGrainField (onStartHarvest)

**Files:**
- Modify: `shared/cards/C/C24_BedintheGrainField.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** One-shot: at the start of the NEXT harvest after playing, get a Family Growth action if rooms > familySize. Uses `cardStates` flag.

- [ ] **Step 1: Write test**

```typescript
describe('C24_BedintheGrainField', () => {
  it('onBuy sets nextHarvestReady flag', () => {
    const effect = getCardEffect('C24_BedintheGrainField')
    const player = createPlayer()
    const state = createState(player)
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'C24_BedintheGrainField', 'nextHarvestReady')).toBe(true)
  })

  it('onStartHarvest returns family-growth flow when ready and rooms > familySize', () => {
    const player = createPlayer()
    player.minorPlayed = ['C24_BedintheGrainField']
    player.rooms = 3; player.familySize = 2
    writeCardExtraData(player, 'C24_BedintheGrainField', 'nextHarvestReady', true)
    const effect = getCardEffect('C24_BedintheGrainField')
    const flow = effect!.onStartHarvest!(createState(player), player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('wish-children-growth')
    // Flag should be cleared
    expect(readCardExtraData(player, 'C24_BedintheGrainField', 'nextHarvestReady')).toBeFalsy()
  })

  it('does not trigger without flag', () => { ... })
  it('does not trigger when no room', () => { ... })
})
```

- [ ] **Step 2: Implement card**

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'nextHarvestReady', true)
  },
  onStartHarvest: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (!readCardExtraData(player, CARD_ID, 'nextHarvestReady')) return
    writeCardExtraData(player, CARD_ID, 'nextHarvestReady', false)
    if (player.rooms <= player.familySize) return
    return {
      type: 'leaf',
      actionId: 'wish-children-growth',
      sourceCard: CARD_ID,
    }
  },
})
```

- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement C24_BedintheGrainField (onStartHarvest)`

---

## Task 5: E73_Scythe (onStartHarvestFieldPhase) — Full BGA-aligned

**Files:**
- Create: `shared/actions/effects/scythe-harvest-field.ts`
- Modify: `shared/actions/internal-actions.ts` (register new action)
- Modify: `shared/cards/E/E73_Scythe.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** During field phase of each harvest, player can select exactly one field and harvest ALL remaining crops from it (not just 1). Fires at `onStartHarvestFieldPhase` (BEFORE normal reap). Normal reap then skips the drained field.

**Design:** Create a custom internal action `scythe-harvest-field` (same pattern as `pay-grain-any` which also mutates fields). Takes `{ fieldIndex }` in params, drains the field entirely, gives resources to player. Card returns xor flow with one option per eligible field.

- [ ] **Step 1: Create `shared/actions/effects/scythe-harvest-field.ts`**

```typescript
import type { ActionDefinition } from '../../game/types'

/** Harvest ALL remaining crops from a specific field. Used by E73_Scythe. */
export const scytheHarvestFieldAction: ActionDefinition = {
  id: 'scythe-harvest-field',
  nameKey: 'actions.scythe-harvest-field.name',
  descriptionKey: 'actions.scythe-harvest-field.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail' }
    const field = player.fields[fieldIndex]
    if (!field || !field.crop || field.remaining <= 0) return { type: 'fail' }
    const crop = field.crop
    const amount = field.remaining
    player.resources[crop] += amount
    field.remaining = 0
    field.crop = null
    return {
      type: 'ok',
      resourcesGained: { [crop]: amount },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { [crop]: amount }, cardId: sourceCard },
    }
  },
}
```

- [ ] **Step 2: Register in `shared/actions/internal-actions.ts`**

Add `import { scytheHarvestFieldAction } from './effects/scythe-harvest-field'` and add to array.

- [ ] **Step 3: Write tests**

```typescript
describe('E73_Scythe', () => {
  it('returns xor with one option per harvestable field', () => {
    const effect = getCardEffect('E73_Scythe')
    const player = createPlayer()
    player.minorPlayed = ['E73_Scythe']
    player.fields = [
      { x: 0, y: 0, crop: 'grain', remaining: 3 },
      { x: 1, y: 0, crop: 'vegetable', remaining: 2 },
      { x: 2, y: 0, crop: null, remaining: 0 },
    ] as any
    const flow = effect!.onStartHarvestFieldPhase!(createState(player), player)
    expect(flow!.type).toBe('xor')
    // 2 harvestable fields + 1 decline = 3 children
    expect((flow as any).children.length).toBe(3)
    expect((flow as any).children[0].actionId).toBe('scythe-harvest-field')
    expect((flow as any).children[0].params.fieldIndex).toBe(0)
  })

  it('does not trigger without harvestable fields', () => { ... })
  it('does not trigger without card', () => { ... })
})
```

- [ ] **Step 4: Implement E73_Scythe card**

```typescript
registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const harvestable = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => field.crop && field.remaining > 0)
    if (harvestable.length === 0) return
    const children: ActionFlow[] = harvestable.map(({ field, index }) => ({
      type: 'leaf' as const,
      actionId: 'scythe-harvest-field',
      params: { fieldIndex: index },
      sourceCard: CARD_ID,
      choiceLabelKey: 'ui.interactionScytheField',
      choiceLabelParams: { crop: field.crop, amount: field.remaining },
    }))
    children.push({ type: 'leaf', actionId: 'noop', choiceLabelKey: 'ui.interactionDecline' })
    return { type: 'xor', children }
  },
})
```

Player picks a field → `scythe-harvest-field` drains it entirely → normal reap skips it.

- [ ] **Step 5: Run test, verify pass**
- [ ] **Step 6: Commit** — `feat: implement E73_Scythe (onStartHarvestFieldPhase)`

---

## Task 6: A112_ScytheWorker (onHarvestFieldPhase)

**Files:**
- Modify: `shared/cards/A/A112_ScytheWorker.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** onBuy: gain 1 grain. In field phase of each harvest: +1 grain per grain field (that has remaining > 0).

- [ ] **Step 1: Write test**

```typescript
describe('A112_ScytheWorker', () => {
  it('onBuy returns gain 1 grain', () => {
    const effect = getCardEffect('A112_ScytheWorker')
    const flow = effect!.onBuy!(createState(createPlayer()), createPlayer())
    expect(flow).toBeDefined()
  })

  it('onHarvestFieldPhase returns gain grain per grain field', () => {
    const effect = getCardEffect('A112_ScytheWorker')
    const player = createPlayer()
    player.occupationPlayed = ['A112_ScytheWorker']
    player.fields = [
      { x: 0, y: 0, crop: 'grain', remaining: 2 },
      { x: 1, y: 0, crop: 'grain', remaining: 1 },
      { x: 2, y: 0, crop: 'vegetable', remaining: 1 },
    ] as any
    const flow = effect!.onHarvestFieldPhase!(createState(player), player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).params).toEqual({ grain: 2 }) // 2 grain fields
  })

  it('does not trigger without grain fields', () => { ... })
})
```

- [ ] **Step 2: Implement card**

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  onHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainFields = player.fields.filter((f) => f.crop === 'grain' && f.remaining > 0).length
    if (grainFields <= 0) return
    return { type: 'leaf', actionId: 'gain', params: { grain: grainFields }, sourceCard: CARD_ID }
  },
})
```

- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement A112_ScytheWorker (onHarvestFieldPhase)`

---

## Task 7: E112_GrainThief (onEndHarvestFieldPhase) — Full BGA-aligned

**Files:**
- Create: `shared/actions/effects/grain-thief-protect.ts`
- Modify: `shared/actions/internal-actions.ts` (register new action)
- Modify: `shared/cards/E/E112_GrainThief.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** "Each time you would harvest a grain field, you can leave the grain on the field and take 1 GRAIN from the general supply instead."

The player gets the same grain either way, but field preservation matters:
- Protected fields are SKIPPED during reap (remaining unchanged, no reap-triggered card effects)
- Player gets 1 grain from supply per protected field
- Player can choose per-field: protect (use E112) or normal harvest (trigger reap normally)

**Design:** Uses TWO hooks + a custom internal action:

1. **`grain-thief-protect` action**: takes `{ fieldIndex }` in params. Saves field's remaining to `cardStates`, sets `remaining = 0` (so reap naturally skips it), gives player 1 grain from supply.

2. **`onHarvestFieldPhase`** (BEFORE reap): returns a **seq of xor** flow — one xor per grain field, each with two options: "protect" (use `grain-thief-protect`) or "harvest normally" (noop). Engine presents these choices sequentially.

3. **`onEndHarvestFieldPhase`** (AFTER reap): reads protected field data from cardStates, restores `remaining` to original values. Fields that were protected now have their original remaining back; fields that were normally harvested were already decremented by reap.

This ensures:
- Protected fields never enter reap → no reap-triggered card effects fire for them
- Normally harvested fields go through reap as usual → reap-triggered cards work correctly
- Each field is an independent per-field player decision

- [ ] **Step 1: Create `shared/actions/effects/grain-thief-protect.ts`**

```typescript
import type { ActionDefinition } from '../../game/types'
import { readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

const SOURCE_CARD = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

/**
 * Protect a grain field from reap: save its remaining, set to 0 (reap skips it),
 * give 1 grain from supply. Used by E112_GrainThief.
 */
export const grainThiefProtectAction: ActionDefinition = {
  id: 'grain-thief-protect',
  nameKey: 'actions.grain-thief-protect.name',
  descriptionKey: 'actions.grain-thief-protect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail' }
    const field = player.fields[fieldIndex]
    if (!field || field.crop !== 'grain' || field.remaining <= 0) return { type: 'fail' }

    // Save original remaining for post-reap restoration
    const protected_ = readCardExtraData<{ index: number; remaining: number }[]>(
      player, SOURCE_CARD, PROTECTED_KEY,
    ) ?? []
    protected_.push({ index: fieldIndex, remaining: field.remaining })
    writeCardExtraData(player, SOURCE_CARD, PROTECTED_KEY, protected_)

    // Set remaining = 0 so reap() skips this field
    field.remaining = 0
    field.crop = null

    // Give 1 grain from supply
    player.resources.grain += 1

    return {
      type: 'ok',
      resourcesGained: { grain: 1 },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { grain: 1 }, cardId: SOURCE_CARD },
    }
  },
}
```

- [ ] **Step 2: Register in `shared/actions/internal-actions.ts`**

Add import and entry to `internalActionDefinitions` array.

- [ ] **Step 3: Write tests**

```typescript
describe('E112_GrainThief', () => {
  it('returns seq of xor choices, one per grain field', () => {
    const effect = getCardEffect('E112_GrainThief')
    const player = createPlayer()
    player.occupationPlayed = ['E112_GrainThief']
    player.fields = [
      { x: 0, y: 0, crop: 'grain', remaining: 3 },
      { x: 1, y: 0, crop: 'vegetable', remaining: 2 },
      { x: 2, y: 0, crop: 'grain', remaining: 1 },
    ] as any
    const flow = effect!.onHarvestFieldPhase!(createState(player), player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    // 2 grain fields → 2 xor children
    expect((flow as any).children.length).toBe(2)
    expect((flow as any).children[0].type).toBe('xor')
    // Each xor has 2 options: protect + noop
    expect((flow as any).children[0].children.length).toBe(2)
    expect((flow as any).children[0].children[0].actionId).toBe('grain-thief-protect')
  })

  it('protected fields are restored after reap', () => {
    const effect = getCardEffect('E112_GrainThief')
    const player = createPlayer()
    player.occupationPlayed = ['E112_GrainThief']
    player.fields = [
      { x: 0, y: 0, crop: 'grain', remaining: 3 },
    ] as any

    // Simulate: player chose to protect field 0
    writeCardExtraData(player, 'E112_GrainThief', 'protectedFields', [{ index: 0, remaining: 3 }])
    // Field was zeroed by grain-thief-protect action
    player.fields[0].remaining = 0
    player.fields[0].crop = null

    // onEndHarvestFieldPhase restores
    effect!.onEndHarvestFieldPhase!(createState(player), player)
    expect(player.fields[0].remaining).toBe(3)
    expect(player.fields[0].crop).toBe('grain')
  })

  it('does not trigger without grain fields', () => { ... })
  it('does not trigger without card', () => { ... })
})
```

- [ ] **Step 4: Implement card**

```typescript
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

registerCardEffect({
  id: CARD_ID,
  // Before reap: return seq of per-field xor choices
  onHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Clear any stale data
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    const grainFields = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => field.crop === 'grain' && field.remaining > 0)
    if (grainFields.length === 0) return
    const children: ActionFlow[] = grainFields.map(({ field, index }) => ({
      type: 'xor' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'grain-thief-protect',
          params: { fieldIndex: index },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.grainThiefProtect',
          choiceLabelParams: { remaining: field.remaining },
        },
        {
          type: 'leaf' as const,
          actionId: 'noop',
          choiceLabelKey: 'ui.grainThiefNormalHarvest',
        },
      ],
    }))
    return { type: 'seq', children }
  },
  // After reap: restore all protected fields
  onEndHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const protectedFields = readCardExtraData<{ index: number; remaining: number }[]>(
      player, CARD_ID, PROTECTED_KEY,
    ) ?? []
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    for (const { index, remaining } of protectedFields) {
      const field = player.fields[index]
      if (!field) continue
      field.crop = 'grain'
      field.remaining = remaining
    }
  },
})
```

- [ ] **Step 5: Run test, verify pass**
- [ ] **Step 6: Commit** — `feat: implement E112_GrainThief (onHarvestFieldPhase + onEndHarvestFieldPhase)`

---

## Task 8: C63_CraftBrewery (onHarvestFeedingPhase)

**Files:**
- Modify: `shared/cards/C/C63_CraftBrewery.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** In feeding phase, optionally exchange 1 grain from supply + 1 grain from a field → 4 food + 2 bonus VP.

Simplified: require 1 grain in supply + at least 1 grain field with remaining > 0. Pay 1 grain, reduce field remaining by 1, gain 4 food + 2 VP.

```typescript
registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (player.resources.grain < 1) return
    const grainField = player.fields.find((f) => f.crop === 'grain' && f.remaining > 0)
    if (!grainField) return
    // Deduct field grain imperatively (before flow executes)
    grainField.remaining -= 1
    if (grainField.remaining === 0) grainField.crop = null
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
      ],
    }
  },
})
```

Note: The field deduction is imperative (mutates before flow). If player declines the optional seq, the undo system should restore the field. This matches how other cards like E73_Scythe work.

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement card**
- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement C63_CraftBrewery (onHarvestFeedingPhase)`

---

## Task 9: E133_ChampionBreeder (onEndHarvestFeedingPhase)

**Files:**
- Modify: `shared/cards/E/E133_ChampionBreeder.ts`
- Test: add to `phase-hook-cards.test.ts`

**Card effect:** In breeding phase, if you placed 2 newborns → 1 bonus VP, if 3+ → 2 bonus VP.

This fires at onEndHarvestFeedingPhase (after feeding, before breed). BUT breeding hasn't happened yet at this phase! The card says "breeding phase" which is AFTER feeding. We need `onEndHarvestFeedingPhase` to fire AFTER `breedAnimals()`.

Looking at game-session flow: `startBreedPhase` calls `runEndHarvestFeedingPhaseHooks` BEFORE `breedAnimals`. So this card can't see breed results here.

**Correction:** This card should use a hook that fires AFTER breeding. Looking at the flow: `applyBreedPhase` → `continueEndHarvestEffects` → `onEndHarvest`. So `onEndHarvest` fires after breeding.

But the doc maps E133 to `onEndHarvestFeedingPhase`. Let me re-read the game-session flow:

```
startBreedPhase:
  runEndHarvestFeedingPhaseHooks  ← fires BEFORE breed
  runAfterFeedHooks
  breedAnimals()  ← actual breeding
  continueEndHarvestEffects → onEndHarvest  ← fires AFTER breed
```

So E133 should actually use `onEndHarvest` (which fires after breeding), not `onEndHarvestFeedingPhase`. But `onEndHarvest` already has cards (C71_SlurrySpreader, D115_FodderPlanter) so it's not one of the "empty" phases.

**Alternative:** Move E133 to use `onEndHarvestFeedingPhase` but check the breed result from PREVIOUS harvest (wrong), or restructure to fire AFTER breedAnimals.

**Best solution:** Use `onEndHarvest` which correctly fires after breeding. This means we don't have a card for `onEndHarvestFeedingPhase`, but the hook is still wired up. We can later find a proper card for that phase.

For the plan, implement E133 at `onEndHarvest` and note that `onEndHarvestFeedingPhase` remains without a new card (but the stage hook is wired up).

Actually wait — let me re-examine. The doc says "onEndHarvestFeedingPhase — E83_ShepherdsWhistle etc 4 cards". These fire BEFORE breeding. So these cards probably do something feeding-related (reduce begging, convert food, etc.) rather than breeding-related. E133_ChampionBreeder is about breeding, so it's in the wrong slot in the plan.

Let me fix: put E133 at `onEndHarvest` (after breeding), and for `onEndHarvestFeedingPhase`, use a different card or leave it empty for now (the hook is wired).

**Revised card:** E133_ChampionBreeder uses `onEndHarvest` to check `harvestBreedSummary`.

```typescript
registerCardEffect({
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const summary = state.harvestBreedSummary?.[player.id]
    if (!summary || summary.animalCount < 2) return
    const vpCount = summary.animalCount >= 3 ? 2 : 1
    const children = Array.from({ length: vpCount }, () => ({
      type: 'leaf' as const, actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID,
    }))
    return { type: 'seq', children }
  },
})
```

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement card at onEndHarvest**
- [ ] **Step 3: Run test, verify pass**
- [ ] **Step 4: Commit** — `feat: implement E133_ChampionBreeder (onEndHarvest)`

---

## Task 10: Run full test suite + update docs

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/cards_impl.md`

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Update card_progress.md**

Update status for all 8 cards: mark as ✅, add hook coverage info.

- [ ] **Step 3: Update cards_impl.md**

Add new cards to the appropriate rows in the Hook 覆盖矩阵.

- [ ] **Step 4: Commit** — `docs: update card progress for phase hook cards`

---

## Summary

| Phase | Card | Hook Type | Complexity |
|---|---|---|---|
| onStartReturnHome | D107_Bellfounder | stage (new) | moderate (xor choice) |
| onAfterRoundEnd | D167_PureBreeder | stage (new) | moderate (breed xor) |
| onStartHarvest | C24_BedintheGrainField | stage (new) | moderate (one-shot family growth) |
| onStartHarvestFieldPhase | E73_Scythe | stage (new) | full (xor field choice → custom `scythe-harvest-field` action) |
| onHarvestFieldPhase | A112_ScytheWorker | stage (new) | simple (gain per grain field) |
| onEndHarvestFieldPhase | E112_GrainThief | stage (new) | full (per-field xor choice before reap → `grain-thief-protect` action → restore after reap) |
| onHarvestFeedingPhase | C63_CraftBrewery | stage (new) | moderate (pay → gain + VP) |
| onEndHarvest | E133_ChampionBreeder | stage (existing) | simple (VP per breed count) |

Note: `onEndHarvestFeedingPhase` stage hook is wired up but no card implemented yet (E133 was moved to `onEndHarvest` where breeding data is available). `onBeforeReturnHome` skipped (D51 is action space card).
