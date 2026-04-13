# Anytime Action System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cards to register custom anytime actions via `phases: ['anytime']` on CardListenerRegistration, extending the existing anytime pipeline with zero frontend changes.

**Architecture:** `buildAnytimeEntries()` in game-session.ts gets a second pass that broadcasts an anytime event to all CardListeners, collecting returned flows. Two validation cards (D122_ClayCarrier, E86_PenBuilder) prove the infrastructure works.

**Tech Stack:** TypeScript, GameSession, CardListener, Vitest session tests.

---

### Task 1: Add `labelKey` / `labelParams` to ActionHookResult + add `'anytime'` to ActionHookPhase

**Files:**
- Modify: `shared/actions/hooks.ts`

- [ ] **Step 1: Add fields to ActionHookResult**

In `shared/actions/hooks.ts`, find the `ActionHookResult` type (around line 20) and add two fields after the existing `logParams`:

```typescript
// Add these two fields to ActionHookResult:
  labelKey?: string
  labelParams?: Record<string, unknown>
```

The full type after modification should include:
```typescript
export type ActionHookResult = {
  doable?: boolean
  canUseOccupied?: boolean
  actionId?: string
  extraData?: Record<string, unknown>
  extraOptions?: ActionChoiceOption[]
  followUpActions?: FollowUpAction[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  bonuses?: import('../game/types').Bonus[]
  sourceCard?: string
  logKey?: string
  logParams?: Record<string, unknown>
  labelKey?: string
  labelParams?: Record<string, unknown>
  decline?: boolean
  alternativeFlow?: ActionFlow
}
```

- [ ] **Step 2: Add 'anytime' to ActionHookPhase**

In the same file, find the `ActionHookPhase` union type and add `'anytime'`:

```typescript
export type ActionHookPhase =
  | 'before'
  | 'during'
  | 'immediatelyAfter'
  | 'after'
  | 'computeCosts'
  | 'computeArgs'
  | 'computeReplace'
  | 'isDoable'
  | 'canUseOccupied'
  | 'anytime'
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.app.json`
Expected: clean (no errors)

- [ ] **Step 4: Commit**

```
feat: add labelKey/labelParams to ActionHookResult + anytime phase
```

---

### Task 2: Extend `buildAnytimeEntries()` with CardListener scan

**Files:**
- Modify: `server/game-session.ts`

- [ ] **Step 1: Add imports**

At the top of `server/game-session.ts`, verify these are already imported from `card-listeners.ts`:
- `getMatchingListeners`
- `executeCardListener`

If not, add them to the existing import block. They should already be imported (used by `runPlaceFarmerAfterHooks`).

- [ ] **Step 2: Extend buildAnytimeEntries()**

Find `buildAnytimeEntries()` (around line 591). After the existing `for (const action of this.registry.values())` loop that collects registry-based anytime entries, and before the `return anytimeEntries`, add the CardListener scan:

```typescript
    // Card-sourced anytime actions via CardListener phases:['anytime']
    const anytimeContext: import('../shared/cards/card-listeners').CardListenerContext = {
      state: this.state,
      player,
      space,
      actionId: 'anytime',
      phase: 'anytime',
    }
    const matched = getMatchingListeners(anytimeContext)
    for (const entry of matched) {
      if (!entry.cardId) continue
      if (entry.ownerPlayerId !== player.id) continue
      const result = executeCardListener(entry.registration, anytimeContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (!result?.flow) continue
      anytimeEntries.push({
        descriptor: {
          id: entry.registration.id,
          labelKey: result.labelKey ?? `cards.${entry.cardId}.anytime`,
          labelParams: result.labelParams,
          sourceCard: entry.cardId,
        },
        flow: result.flow,
      })
    }
```

Key points:
- `getMatchingListeners` already resolves card ownership and returns `ownerPlayerId`
- We filter `ownerPlayerId !== player.id` to only show the current player's cards
- `entry.registration.id` becomes the anytime action id (used by `takeAnytimeAction` to find it later)
- Falls back to `cards.{cardId}.anytime` for the label if `result.labelKey` is not provided

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.server.json`
Expected: clean

- [ ] **Step 4: Commit**

```
feat: extend buildAnytimeEntries with CardListener anytime scan
```

---

### Task 3: D122_ClayCarrier — simple exchange, once per round

**BGA behavior:** On buy: gain 2 clay. At any time (once per round): pay 2 food → gain 2 clay. Flag resets at start of turn.

**Files:**
- Create: `shared/cards/D/D122_ClayCarrier.ts`
- Create: `server/__tests__/D122_ClayCarrier-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createInitialState } from '../../shared/logic/state'

describe('D122_ClayCarrier session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'D122_ClayCarrier')
    return session
  }

  it('onBuy grants 2 clay', () => {
    const session = makeSession()
    const clay = session.getState().state.players[0].resources.clay
    expect(clay).toBeGreaterThanOrEqual(2)
  })

  it('anytime action appears when player has 2+ food', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 5
    session.loadState(s)
    // Take an action to enter active interaction
    session.takeAction(0, 'day-laborer')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const clayCarrier = anytime.find((a: any) => a.id === 'D122-clay-carrier-anytime')
    expect(clayCarrier).toBeDefined()
  })

  it('anytime exchange: pay 2 food, gain 2 clay', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 5
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    const foodBefore = session.getState().state.players[0].resources.food
    const clayBefore = session.getState().state.players[0].resources.clay
    session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    const after = session.getState().state.players[0]
    expect(after.resources.food).toBe(foodBefore - 2)
    expect(after.resources.clay).toBe(clayBefore + 2)
  })

  it('once per round: second use is blocked', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 10
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    // After first use, anytime should no longer appear
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const clayCarrier = anytime.find((a: any) => a.id === 'D122-clay-carrier-anytime')
    expect(clayCarrier).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `timeout 30 npx vitest run server/__tests__/D122_ClayCarrier-session.test.ts`

- [ ] **Step 3: Implement D122_ClayCarrier**

Create `shared/cards/D/D122_ClayCarrier.ts`:

```typescript
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'

const CARD_ID = 'D122_ClayCarrier'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 2 }),
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'D122-clay-carrier-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.food < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          gainLeaf(CARD_ID, { clay: 2 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D122_ClayCarrier.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const D122_ClayCarrier = new Occupation({
  id: CARD_ID,
  name: 'Clay Carrier',
  deck: 'D',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, you immediately get 2 <CLAY>. At any time, but only once per round, you can buy 2 <CLAY> for 2 <FOOD>.'],
  cost: {},
  players: '1+',
})
```

Register in `shared/cards/catalog.ts`: add import and push to `occupationCards` array.

- [ ] **Step 4: Run test — expect PASS**

Run: `timeout 30 npx vitest run server/__tests__/D122_ClayCarrier-session.test.ts`

- [ ] **Step 5: Commit**

```
feat: implement D122_ClayCarrier (anytime exchange, once per round)
```

---

### Task 4: E86_PenBuilder — conditional anytime, unlimited uses

**BGA behavior:** At any time, discard 1 wood. This card holds 2 animals per wood discarded. Uses `onComputeAnimalZones` to add capacity.

**Files:**
- Modify: `shared/cards/E/E86_PenBuilder.ts`
- Create: `server/__tests__/E86_PenBuilder-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createInitialState } from '../../shared/logic/state'

describe('E86_PenBuilder session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'E86_PenBuilder')
    return session
  }

  it('anytime action appears when player has wood', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.wood = 3
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const penBuilder = anytime.find((a: any) => a.id === 'E86-pen-builder-anytime')
    expect(penBuilder).toBeDefined()
  })

  it('anytime action not available without wood', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.wood = 0
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const penBuilder = anytime.find((a: any) => a.id === 'E86-pen-builder-anytime')
    expect(penBuilder).toBeUndefined()
  })

  it('discarding wood increases animal capacity via onComputeAnimalZones', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.wood = 3
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    const woodBefore = session.getState().state.players[0].resources.wood
    session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    const after = session.getState().state.players[0]
    expect(after.resources.wood).toBe(woodBefore - 1)
    const discards = (after.cardStates?.E86_PenBuilder?.extraData as any)?.discards ?? 0
    expect(discards).toBe(1)
  })

  it('can use multiple times (not once per round)', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.wood = 5
    session.loadState(s)
    session.takeAction(0, 'day-laborer')
    session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    // Should still be available
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const penBuilder = anytime.find((a: any) => a.id === 'E86-pen-builder-anytime')
    expect(penBuilder).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `timeout 30 npx vitest run server/__tests__/E86_PenBuilder-session.test.ts`

- [ ] **Step 3: Implement E86_PenBuilder**

Modify `shared/cards/E/E86_PenBuilder.ts` to add listeners and effects:

```typescript
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'E86_PenBuilder'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    const discards = readCardExtraData<number>(player, CARD_ID, 'discards') ?? 0
    if (discards <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card' as any,
      animalType: null,
      animalCount: 0,
      capacity: discards * 2,
      allowedAnimals: ['sheep', 'boar', 'cattle'],
    })
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'E86-pen-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.resources.wood < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            actionContext: {
              method: 'incDiscards',
              cardId: CARD_ID,
            },
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E86_PenBuilder.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const E86_PenBuilder = new Occupation({
  id: CARD_ID,
  name: 'Pen Builder',
  deck: 'E',
  number: 86,
  desc: ['At any time, you can discard 1 <WOOD> from your supply. This card can hold two animals of any type for each <WOOD> discarded this way.'],
  cost: {},
  players: '1+',
})
```

Note: The `special-effect` action with `incDiscards` may need a simpler approach. Check if `special-effect` action supports arbitrary methods. If not, use an inline approach: increment the counter directly in the listener handler before returning the pay flow, or use `store-on-card` action. Read `shared/actions/effects/special-effect.ts` to verify. Alternative: just use a `flag-card`-like approach but with counter increment via the existing `mark-card-observed` or a custom effect action.

The simplest approach: increment the counter in the handler itself (before returning the flow) and only return the pay flow. The handler runs when `buildAnytimeEntries()` checks availability — but it should NOT modify state there. Instead, increment during flow execution. Use a dedicated small action or `store-on-card` with params.

Read `shared/actions/effects/store-on-card.ts` to understand how to store data on a card during flow execution.

- [ ] **Step 4: Run test — expect PASS**

Run: `timeout 30 npx vitest run server/__tests__/E86_PenBuilder-session.test.ts`

- [ ] **Step 5: Commit**

```
feat: implement E86_PenBuilder (anytime wood→animal capacity)
```

---

### Task 5: i18n labels + full test suite

**Files:**
- Modify: `shared/i18n/en.ts`
- Modify: `shared/i18n/zh.ts`

- [ ] **Step 1: Add i18n keys**

In `shared/i18n/en.ts`, add to the translation object:

```typescript
'cards.D122_ClayCarrier.anytime': 'Clay Carrier: Pay 2 Food → 2 Clay',
'cards.E86_PenBuilder.anytime': 'Pen Builder: Pay 1 Wood → +2 Animal Capacity',
```

In `shared/i18n/zh.ts`, add:

```typescript
'cards.D122_ClayCarrier.anytime': '搬黏土工：付2食物 → 获2黏土',
'cards.E86_PenBuilder.anytime': '围栏工：付1木材 → 动物容量+2',
```

- [ ] **Step 2: Run full test suite**

Run: `timeout 120 npx vitest run --exclude 'e2e-tests/**' --exclude 'scripts/**'`
Expected: all pass (except pre-existing `custom-code-executor` isolated-vm failure)

- [ ] **Step 3: Commit**

```
feat: add i18n for anytime action cards
```

---

## Implementation Order

1. **Task 1** — Type changes (ActionHookResult + ActionHookPhase)
2. **Task 2** — buildAnytimeEntries() CardListener scan
3. **Task 3** — D122_ClayCarrier validation card (simple exchange, once/round)
4. **Task 4** — E86_PenBuilder validation card (conditional, unlimited, animal zones)
5. **Task 5** — i18n + full test suite
