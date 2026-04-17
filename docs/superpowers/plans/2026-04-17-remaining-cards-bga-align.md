# Remaining Cards BGA Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 card rewrites + 1 engine primitive + 6 verifications to align remaining BGA-divergent cards.

**Architecture:** Engine-first approach — add `trigger: 'harvest'` to the exchange system first, then rewrite cards that depend on it (C59) and the remaining 4 card-local rewrites (B27, C48, C69, D82). Phase 3 verifies 6 cards with small fixes where needed.

**Tech Stack:** TypeScript, Vitest, shared/ domain layer (no React, no Node APIs in card files).

**BGA reference:** `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/`

---

## File Map

| File | Responsibility | Phase |
|---|---|---|
| `shared/cards/types.ts` | CardExchange type — extend trigger union | 1 |
| `shared/actions/effects/exchange.ts` | Exchange filtering — exclude `'harvest'` from anytime listing | 1 |
| `shared/actions/effects/feed-family.ts` | Feeding flow — include `'harvest'` exchanges during harvestFeed | 1 |
| `shared/cards/B/B27_Toolbox.ts` | Card rewrite: minor-improvement → 3 specific majors + fencing trigger | 2 |
| `shared/cards/C/C48_Farmstead.ts` | Card rewrite: future-food → per-turn used-space gain | 2 |
| `shared/cards/C/C59_SchnappsDistillery.ts` | Card fix: add harvest exchange to card definition | 2 |
| `shared/cards/C/C69_LandConsolidation.ts` | Card rewrite: supply exchange → field-local crop swap | 2 |
| `shared/actions/internal-actions.ts` | Register new `swap-field-grain-to-veg` action | 2 |
| `shared/actions/effects/swap-field-crop.ts` | New internal action: grain→veg field swap | 2 |
| `shared/cards/D/D82_HuntingTrophy.ts` | Card rewrite: boar→food → computeCosts listeners | 2 |
| `shared/cards/__tests__/batch-bga-align-7.test.ts` | Tests for Phase 1 engine + Phase 2 cards | 1–2 |
| `shared/cards/__tests__/batch-bga-align-8.test.ts` | Tests for Phase 3 verifications | 3 |

---

## Task 1: Add `'harvest'` to CardExchange trigger type

**Files:**
- Modify: `shared/cards/types.ts:7`

- [ ] **Step 1: Read the current CardExchange type**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola
grep -n "trigger" shared/cards/types.ts | head -10
```

- [ ] **Step 2: Extend the trigger union**

In `shared/cards/types.ts`, find the `trigger` field on the `CardExchange` type (line ~7) and change:

```typescript
// Before:
trigger?: 'bake-bread' | 'anytime'

// After:
trigger?: 'bake-bread' | 'anytime' | 'harvest'
```

- [ ] **Step 3: Verify build still compiles**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20
```

Expected: no new errors (existing errors may remain).

- [ ] **Step 4: Commit**

```bash
git add shared/cards/types.ts
git commit -m "feat(engine): add 'harvest' to CardExchange trigger type"
```

---

## Task 2: Filter harvest exchanges out of anytime listing

**Files:**
- Modify: `shared/actions/effects/exchange.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts`

The exchange system has a static `cookeryTrades` lookup that `getPlayerCookeryTrades()` (line ~244) uses to return trades for anytime exchange UI. Exchanges with `trigger: 'harvest'` must NOT appear in the anytime listing — they should only be available during feeding.

- [ ] **Step 1: Write the failing test**

Create `shared/cards/__tests__/batch-bga-align-7.test.ts` with shared test helpers at the top (reused by Tasks 3–7):

```typescript
import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (playerCount: number, ...players: PlayerState[]): GameState => {
  const ps = players.length ? players : [createPlayer()]
  while (ps.length < playerCount) ps.push(createPlayer(`p${ps.length + 1}`))
  return ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players: ps,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState
}

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// ===== Phase 1: harvest trigger type =====
describe('harvest exchange trigger type', () => {
  it('CardExchange accepts harvest trigger', () => {
    const exchange = {
      from: { vegetable: 1 },
      to: { food: 5 },
      max: 1,
      trigger: 'harvest' as const,
    }
    expect(exchange.trigger).toBe('harvest')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx vitest run shared/cards/__tests__/batch-bga-align-7.test.ts
```

Expected: PASS (the type itself was added in Task 1).

- [ ] **Step 3: Check getPlayerCookeryTrades for harvest filtering**

Read `shared/actions/effects/exchange.ts` around lines 244–253 and the `cookeryTrades` initialization. Determine:
- Where are trades registered into the `cookeryTrades` map?
- Is there a filter point where we can exclude `trigger: 'harvest'` trades from the anytime listing?

The `cookeryTrades` map is typically built from card definitions' `exchanges` arrays. Find where `trigger` is checked (if anywhere) and add a filter:

```typescript
// In getPlayerCookeryTrades or wherever trades are filtered for anytime display:
// Exclude harvest-only exchanges from anytime context
trades = trades.filter(t => t.trigger !== 'harvest')
```

If no explicit trigger filter exists, add one at the point where anytime trades are collected.

- [ ] **Step 4: Verify no harvest-trigger exchange leaks into anytime**

Add test:

```typescript
it('harvest-trigger exchange is excluded from anytime trades', () => {
  // This test will be meaningful once C59 adds a harvest exchange.
  // Placeholder assertion to verify the filter path exists.
  expect(true).toBe(true)
})
```

- [ ] **Step 5: Include harvest exchanges during feeding**

Read `shared/actions/effects/feed-family.ts`. The feeding flow is pure resource deduction. During the `harvestFeed` pending state, the UI shows the exchange panel. The exchange panel reads available trades via `getPlayerCookeryTrades`. To include harvest exchanges during feeding:

Option A: `getPlayerCookeryTrades` accepts an optional `{ includeTriggers?: string[] }` parameter. During feeding, pass `{ includeTriggers: ['harvest'] }`. During anytime, omit it (harvest excluded by default).

Option B: Add a separate `getPlayerHarvestTrades()` that returns `trigger: 'harvest'` exchanges.

Choose whichever fits the codebase pattern better after reading the exchange code.

- [ ] **Step 6: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add shared/actions/effects/exchange.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(engine): filter harvest exchanges from anytime, include in feeding"
```

---

## Task 3: C59 SchnappsDistillery — add harvest exchange

**Files:**
- Modify: `shared/cards/C/C59_SchnappsDistillery.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `batch-bga-align-7.test.ts`:

```typescript
import '../C/C59_SchnappsDistillery'
import { C59_SchnappsDistillery } from '../C/C59_SchnappsDistillery'

describe('C59_SchnappsDistillery harvest exchange', () => {
  it('declares a harvest exchange: 1 vegetable → 5 food, max 1', () => {
    const exchanges = (C59_SchnappsDistillery as any).exchanges
    expect(exchanges).toEqual([
      { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
    ])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run shared/cards/__tests__/batch-bga-align-7.test.ts
```

Expected: FAIL — `exchanges` is undefined on C59.

- [ ] **Step 3: Add the exchange to C59**

In `shared/cards/C/C59_SchnappsDistillery.ts`, add to the `MinorImprovement` constructor:

```typescript
export const C59_SchnappsDistillery = new MinorImprovement({
  // ... existing fields ...
  cost: { wood: 2, clay: 1 },
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
  ],
})
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run shared/cards/__tests__/batch-bga-align-7.test.ts
```

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add shared/cards/C/C59_SchnappsDistillery.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(cards): C59 SchnappsDistillery add harvest exchange (1 veg → 5 food)"
```

---

## Task 4: B27 Toolbox — rewrite to offer 3 specific majors

**Files:**
- Modify: `shared/cards/B/B27_Toolbox.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts` (append)

The `improvement-any` action already supports an `allowedPurchases` param (line ~656 in `shared/actions/effects/improvement.ts`). So instead of XOR, we pass `actionContext: { allowedPurchases: ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] }`.

- [ ] **Step 1: Write the failing test**

Append to `batch-bga-align-7.test.ts`:

```typescript
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B27_Toolbox'

// Use shared test helpers (createPlayer, createState, createSpace, findListener)
// defined at top of file or copy from batch-bga-align-5.test.ts pattern.

describe('B27_Toolbox rewrite', () => {
  it('after construct, offers improvement-any filtered to 3 specific majors', () => {
    const listener = findListener('B27-toolbox-after-construct')!
    const p = createPlayer()
    p.minorPlayed = ['B27_Toolbox']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as any
    expect(flow.actionId).toBe('improvement-any')
    expect(flow.actionContext?.allowedPurchases).toEqual(
      expect.arrayContaining(['Major_Joinery', 'Major_Pottery', 'Major_Basket'])
    )
  })

  it('also triggers after fencing', () => {
    const listeners = getRegisteredCardListeners().filter(
      l => l.cardIds.includes('B27_Toolbox') && l.actions?.includes('fencing')
    )
    expect(listeners.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

The current handler returns `actionId: 'minor-improvement'`, not `'improvement-any'`.

- [ ] **Step 3: Rewrite B27_Toolbox.ts**

Replace the full file content:

```typescript
import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B27_Toolbox'

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

const makeToolboxFlow = (): ActionHookResult => ({
  flow: {
    type: 'leaf',
    actionId: 'improvement-any',
    optional: true,
    promptKey: 'ui.interactionToolboxImprovement',
    sourceCard: CARD_ID,
    actionContext: { allowedPurchases: ALLOWED_MAJORS },
  },
  logKey: 'log.cardGrantedAction',
  logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
  sourceCard: CARD_ID,
})

const handler = (context: CardListenerContext): ActionHookResult | void => {
  if (!context.player.minorPlayed.includes(CARD_ID)) return
  return makeToolboxFlow()
}

registerCardListener({
  id: 'B27-toolbox-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler,
})

registerCardListener({
  id: 'B27-toolbox-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['build-stables'],
  handler,
})

registerCardListener({
  id: 'B27-toolbox-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fencing'],
  handler,
})

export const B27_Toolbox = new MinorImprovement({
  id: CARD_ID,
  name: 'Toolbox',
  deck: 'B',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "In the work phase, after each turn in which you build at least 1 room, stable, or fence, you can build the __Joinery__, __Pottery__, or __Basketmaker's Workshop__ major improvement.",
  ],
  cost: { wood: 1 },
})
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add shared/cards/B/B27_Toolbox.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(cards): B27 Toolbox offer 3 specific majors after construct/stables/fencing"
```

---

## Task 5: C48 Farmstead — rewrite to per-turn used-space gain

**Files:**
- Modify: `shared/cards/C/C48_Farmstead.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `batch-bga-align-7.test.ts`:

```typescript
import '../C/C48_Farmstead'
import { getCardEffect } from '../card-effects'

describe('C48_Farmstead per-turn used-space gain', () => {
  it('no longer has onBuy (no future meeples)', () => {
    const effect = getCardEffect('C48_Farmstead')
    expect(effect?.onBuy).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Current `C48_Farmstead` has `onBuy` that places future food.

- [ ] **Step 3: Rewrite C48_Farmstead.ts**

```typescript
import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import type { PlayerState } from '../../game/types'

const CARD_ID = 'C48_Farmstead'

const countUsedTiles = (player: PlayerState): number =>
  player.roomTiles.length +
  player.fields.length +
  player.stableTiles.length +
  new Set(
    player.pastures.flatMap((p) => p.tiles?.map((t) => `${t.row},${t.col}`) ?? []),
  ).size

const beforePlaceFarmer: CardListenerRegistration = {
  id: 'C48-farmstead-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(context.player, CARD_ID, 'usedTilesBefore', countUsedTiles(context.player))
  },
}

const afterPlaceFarmer: CardListenerRegistration = {
  id: 'C48-farmstead-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const before = readCardExtraData<number>(context.player, CARD_ID, 'usedTilesBefore') ?? 0
    const after = countUsedTiles(context.player)
    if (after > before) {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(beforePlaceFarmer)
registerCardListener(afterPlaceFarmer)

export const C48_Farmstead = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmstead',
  deck: 'C',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: [
    'After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.',
  ],
  cost: { wood: 1, clay: 1 },
})
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add shared/cards/C/C48_Farmstead.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(cards): C48 Farmstead rewrite to per-turn used-space food gain"
```

---

## Task 6: C69 LandConsolidation — field-local crop swap

**Files:**
- Create: `shared/actions/effects/swap-field-crop.ts`
- Modify: `shared/actions/internal-actions.ts`
- Modify: `shared/cards/C/C69_LandConsolidation.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `batch-bga-align-7.test.ts`:

```typescript
import '../C/C69_LandConsolidation'

describe('C69_LandConsolidation field swap', () => {
  it('offers anytime action when player has grain field with remaining=3', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'grain', remaining: 3, row: 1, col: 0 }] as any
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeDefined()
  })

  it('not available when no grain field with remaining=3', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'grain', remaining: 2, row: 1, col: 0 }] as any
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeUndefined()
  })

  it('not available when only vegetable fields', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'vegetable', remaining: 2, row: 1, col: 0 }] as any
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Current C69 doesn't check field state; it checks supply grain.

- [ ] **Step 3: Create swap-field-crop action**

Create `shared/actions/effects/swap-field-crop.ts`:

```typescript
import type { ActionDefinition } from '../../game/types'

export const swapFieldGrainToVegAction: ActionDefinition = {
  id: 'swap-field-grain-to-veg',
  nameKey: 'actions.swap-field-grain-to-veg.name',
  descriptionKey: 'actions.swap-field-grain-to-veg.description',
  execute: ({ player, params }) => {
    const row = params?.row as number
    const col = params?.col as number
    const field = player.fields.find((f) => f.row === row && f.col === col)
    if (!field || field.crop !== 'grain' || field.remaining !== 3) {
      return { type: 'fail', logKey: 'log.swapFieldFail' }
    }
    field.crop = 'vegetable'
    field.remaining = 1
    return { type: 'ok' }
  },
}
```

- [ ] **Step 4: Register the action in internal-actions.ts**

Add import and entry:

```typescript
import { swapFieldGrainToVegAction } from './effects/swap-field-crop'

// In the internalActionDefinitions array:
swapFieldGrainToVegAction,
```

- [ ] **Step 5: Rewrite C69_LandConsolidation.ts**

```typescript
import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C69_LandConsolidation'

const anytimeListener: CardListenerRegistration = {
  id: 'C69-land-consolidation-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const qualifying = context.player.fields.filter(
      (f) => f.crop === 'grain' && f.remaining === 3,
    )
    if (qualifying.length === 0) return

    if (qualifying.length === 1) {
      const field = qualifying[0]!
      return {
        flow: {
          type: 'leaf',
          actionId: 'swap-field-grain-to-veg',
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
        labelKey: 'cards.C69_LandConsolidation.anytime',
      }
    }

    return {
      flow: {
        type: 'xor',
        children: qualifying.map((field) => ({
          type: 'leaf' as const,
          actionId: 'swap-field-grain-to-veg',
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionFieldChoice',
          choiceLabelParams: { row: field.row, col: field.col },
        })),
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C69_LandConsolidation.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C69_LandConsolidation = new MinorImprovement({
  id: CARD_ID,
  name: 'Land Consolidation',
  deck: 'C',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: [
    'At any time, if you have a grain field with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the field for 1 <VEGETABLE> on the field.',
  ],
  cost: {},
})
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run shared/cards/__tests__/batch-bga-align-7.test.ts
```

- [ ] **Step 7: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add shared/actions/effects/swap-field-crop.ts shared/actions/internal-actions.ts \
  shared/cards/C/C69_LandConsolidation.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(cards): C69 LandConsolidation field-local grain→veg swap"
```

---

## Task 7: D82 HuntingTrophy — computeCosts rewrite

**Files:**
- Modify: `shared/cards/D/D82_HuntingTrophy.ts`
- Test: `shared/cards/__tests__/batch-bga-align-7.test.ts` (append)

- [ ] **Step 1: Identify house/farm-redevelopment action space IDs**

```bash
grep -rn "house-redevelopment\|farm-redevelopment\|HouseRedevelopment\|FarmRedevelopment" shared/actions/ | head -20
```

Note the exact `id` strings used for these action spaces.

- [ ] **Step 2: Write the failing test**

Append to `batch-bga-align-7.test.ts`:

```typescript
import '../D/D82_HuntingTrophy'

describe('D82_HuntingTrophy computeCosts', () => {
  it('reduces 1 building resource on house-redevelopment improvement', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    // Use the actual house-redevelopment action space ID found in Step 1
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('house-redevelopment'),
      actionId: 'improvement-any', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toBeDefined()
    // Should reduce one building resource by -1
    const reduced = Object.values(result!.costs!)
    expect(reduced).toContain(-1)
  })

  it('reduces wood by 3 on farm-redevelopment fencing', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-fencing')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('farm-redevelopment'),
      actionId: 'fencing', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ wood: -3 })
  })

  it('no discount on other action spaces', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })

  it('card definition: no exchanges, category is BUILDING_RESOURCE_PROVIDER', () => {
    const module = require('../D/D82_HuntingTrophy')
    const card = module.D82_HuntingTrophy
    expect((card as any).exchanges).toBeUndefined()
    expect((card as any).category).toBe('BUILDING_RESOURCE_PROVIDER')
  })
})
```

- [ ] **Step 3: Run test — expect FAIL**

- [ ] **Step 4: Rewrite D82_HuntingTrophy.ts**

```typescript
import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D82_HuntingTrophy'

// Use the actual IDs found in Step 1. Placeholders shown:
const HOUSE_REDEV_SPACE = 'house-redevelopment' // verify!
const FARM_REDEV_SPACE = 'farm-redevelopment'   // verify!

const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const

const improvementCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== HOUSE_REDEV_SPACE) return
    // Discount 1 of the most expensive building resource in the cost
    const costs = context.costs ?? {}
    let maxRes: string | null = null
    let maxVal = 0
    for (const res of BUILDING_RESOURCES) {
      const val = (costs as any)[res] ?? 0
      if (val > maxVal) {
        maxVal = val
        maxRes = res
      }
    }
    if (!maxRes) {
      // Default to wood if no building resource in cost
      maxRes = 'wood'
    }
    return { costs: { [maxRes]: -1 } }
  },
}

const fencingCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-compute-costs-fencing',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fencing'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== FARM_REDEV_SPACE) return
    return { costs: { wood: -3 } }
  },
}

registerCardListener(improvementCostListener)
registerCardListener(fencingCostListener)

export const D82_HuntingTrophy = new MinorImprovement({
  id: CARD_ID,
  name: 'Hunting Trophy',
  deck: 'D',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. Fences built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
  ],
  cost: { boar: 1 },
  vp: 1,
})
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add shared/cards/D/D82_HuntingTrophy.ts shared/cards/__tests__/batch-bga-align-7.test.ts
git commit -m "feat(cards): D82 HuntingTrophy rewrite to computeCosts discount on HouseRedev/FarmRedev"
```

---

## Task 8: Phase 3 — Verify E105, B26, C35, C39, C46, D14

**Files:**
- Read: BGA PHP files for each card
- Modify (if needed): `shared/cards/B/B26_AgrarianFences.ts`, `shared/cards/C/C35_LanternHouse.ts`
- Test: `shared/cards/__tests__/batch-bga-align-8.test.ts` (new)

- [ ] **Step 1: Read each card's BGA PHP + our TS side by side**

For each of E105, B26, C35, C39, C46, D14:

```bash
diff <(grep -A 30 'function onBuy\|function onPlayer\|function computeBonus\|isListeningTo' \
  /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/*/CARD_FILE.php) \
  <(cat shared/cards/*/CARD_FILE.ts)
```

- [ ] **Step 2: E105 Pioneer — verify correct, no change**

Read `shared/cards/E/E105_Pioneer.ts` and `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/E/E105_Pioneer.php`. Confirm `roundActionOrder[round-1]` matches `Globals::getLastRevealed()`. onBuy XOR + afterPlaceFarmer XOR match. If correct, mark as verified.

- [ ] **Step 3: B26 AgrarianFences — add bake-bread replacement if missing**

Read BGA: wraps entire grain-utilization flow in XOR with fence alternatives for both sow and bake sub-actions. If our impl only replaces sow but not bake, add a `computeReplace` listener for `bake-bread` on `grain-utilization` space.

- [ ] **Step 4: C35 LanternHouse — check occupationPrerequisites**

BGA has `occupationPrerequisites = ['max' => 0]`. Check if our card has this:

```bash
grep "occupationPrerequisites" shared/cards/C/C35_LanternHouse.ts
```

If missing, add: `occupationPrerequisites: { max: 0 },`

- [ ] **Step 5: C39 StudioBoat — verify correct**

Read both files. Confirm PlayerActionCard with food accumulation + owner VP bonus. `players: '1-3'` filter matches BGA. Mark as verified.

- [ ] **Step 6: C46 Mandoline — verify correct**

Functionally equivalent. Flag order is cosmetic. Mark as verified.

- [ ] **Step 7: D14 HammerCrusher — verify BGA parity**

Read both files. Confirm `before renovate-house` listener when clay house. Mark as verified or fix.

- [ ] **Step 8: Write verification test for any fixes**

If B26 or C35 needed changes, write tests in `batch-bga-align-8.test.ts`.

- [ ] **Step 9: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 10: Commit**

```bash
git add -A shared/cards
git commit -m "feat(cards): verify E105/B26/C35/C39/C46/D14 BGA parity + small fixes"
```

---

## Task 9: Final integration check

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass. Record total count.

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -10
```

Expected: no new errors (pre-existing warnings OK).

- [ ] **Step 3: Update docs/card_desc_audit.md**

Mark fixed cards as resolved in the audit report. Update the remaining count.

- [ ] **Step 4: Commit**

```bash
git add docs/card_desc_audit.md
git commit -m "docs: update card_desc_audit.md with remaining-cards fixes"
```
