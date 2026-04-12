# Minor Improvement Cooking/Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Minor Improvement cards declare bake-bread exchange rates via a data `exchanges` field, then implement E63_IronOven and E64_SimpleOven as first consumers.

**Architecture:** Add `CardExchange` type and `exchanges` field to `CardDefinition`. Create `exchange-registry.ts` with `getPlayerBakeRates()` that collects rates from both Major (existing hardcoded table) and Minor (new `exchanges` field). Modify `bake-bread.ts` to use this dynamic collection instead of its hardcoded `bakeTable`.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-12-cooking-exchange-minor-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `shared/cards/types.ts` | Modify | Add `CardExchange` type + `exchanges` field to `CardDefinition` + `toJSON` |
| `shared/cards/helpers/exchange-registry.ts` | Create | `getPlayerBakeRates()` collects bake rates from Major + Minor cards |
| `shared/actions/effects/bake-bread.ts` | Modify | Replace hardcoded `bakeTable` with `getPlayerBakeRates()` |
| `shared/cards/E/E63_IronOven.ts` | Create | Card definition with `isBaking` + `exchanges` + onBuy optional bake |
| `shared/cards/E/E64_SimpleOven.ts` | Create | Card definition with `isBaking` + `exchanges` + onBuy optional bake |
| `shared/cards/__tests__/cooking-exchange.test.ts` | Create | Tests for exchange-registry + bake-bread integration |

---

## Task 1: Add CardExchange type + exchanges field to CardDefinition

**Files:**
- Modify: `shared/cards/types.ts`

- [ ] **Step 1: Add CardExchange type and exchanges field**

In `shared/cards/types.ts`, add the `CardExchange` type before `CardDefinition`:

```typescript
export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  trigger?: 'bake-bread' | 'anytime'
}
```

Add to `CardDefinition` (after `modifiers`):

```typescript
exchanges?: CardExchange[]
```

Add to `toJSON()` method (after the `modifiers` line):

```typescript
if (this.exchanges) def.exchanges = this.exchanges
```

- [ ] **Step 2: Commit**

```
feat: add CardExchange type and exchanges field to CardDefinition
```

---

## Task 2: Create exchange-registry.ts with getPlayerBakeRates

**Files:**
- Create: `shared/cards/helpers/exchange-registry.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { PlayerState } from '../../game/types'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../types'

export type BakeRate = {
  cardId: string
  rate: number
  max: number
  labelKey: string
}

const majorBakeTable: Record<string, { rate: number; max: number; labelKey: string }> = {
  Major_Fireplace1: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_Fireplace2: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_CookingHearth1: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_CookingHearth2: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_ClayOven: { rate: 5, max: 1, labelKey: 'ui.interactionBakeBreadClayOven' },
  Major_StoneOven: { rate: 4, max: 2, labelKey: 'ui.interactionBakeBreadStoneOven' },
}

/**
 * Collect all bake-bread rates from player's improvements (Major + Minor + Occupation).
 * Each rate: 1 grain → N food, with optional max uses per bake action.
 */
export const getPlayerBakeRates = (player: PlayerState): BakeRate[] => {
  const rates: BakeRate[] = []

  // Major improvements
  for (const cardId of player.improvements) {
    const entry = majorBakeTable[cardId]
    if (entry) {
      rates.push({ cardId, ...entry })
    }
  }

  // Minor improvements with isBaking + exchanges
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (!card || !card.isBaking || !card.exchanges) continue
    for (const ex of card.exchanges) {
      if (ex.trigger !== 'bake-bread') continue
      const grainCost = (ex.from as Record<string, number>).grain ?? 0
      const foodGain = (ex.to as Record<string, number>).food ?? 0
      if (grainCost > 0 && foodGain > 0) {
        rates.push({
          cardId,
          rate: foodGain / grainCost,
          max: ex.max ?? Infinity,
          labelKey: `cards.${cardId}.bakeBread`,
        })
      }
    }
  }

  // Occupations with isBaking + exchanges (future-proof)
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    if (!card || !card.isBaking || !card.exchanges) continue
    for (const ex of card.exchanges) {
      if (ex.trigger !== 'bake-bread') continue
      const grainCost = (ex.from as Record<string, number>).grain ?? 0
      const foodGain = (ex.to as Record<string, number>).food ?? 0
      if (grainCost > 0 && foodGain > 0) {
        rates.push({
          cardId,
          rate: foodGain / grainCost,
          max: ex.max ?? Infinity,
          labelKey: `cards.${cardId}.bakeBread`,
        })
      }
    }
  }

  return rates
}

/**
 * Check if a player has any baking improvement (Major or Minor).
 */
export const hasAnyBakingImprovement = (player: PlayerState): boolean => {
  if (player.improvements.some((id) => id in majorBakeTable)) return true
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (card?.isBaking) return true
  }
  return false
}
```

- [ ] **Step 2: Commit**

```
feat: add exchange-registry with getPlayerBakeRates
```

---

## Task 3: Migrate bake-bread.ts to use getPlayerBakeRates

**Files:**
- Modify: `shared/actions/effects/bake-bread.ts`

- [ ] **Step 1: Replace hardcoded tables with dynamic lookup**

The current file has 5 hardcoded maps (`bakeTable`, `bakeImprovements`, `bakeLabelKey`, `bakeMaxUses`, `buildBakeBreadOptions`). Replace all with `getPlayerBakeRates`.

Key changes:

1. Add import:
```typescript
import { getPlayerBakeRates, hasAnyBakingImprovement, type BakeRate } from '../../cards/helpers/exchange-registry'
```

2. Replace `canBakeBread`:
```typescript
export const canBakeBread = (player: PlayerState, cardId: string): boolean => {
  const rates = getPlayerBakeRates(player)
  return player.resources.grain > 0 && rates.some((r) => r.cardId === cardId)
}
```

3. Replace `bakeBread`:
```typescript
export const bakeBread = (
  player: PlayerState,
  cardId: string,
  times = 1,
): ActionExecutionResult => {
  const rates = getPlayerBakeRates(player)
  const rate = rates.find((r) => r.cardId === cardId)
  if (!rate || player.resources.grain <= 0) return { type: 'ok' }
  const bakeTimes = Math.max(0, Math.min(player.resources.grain, times))
  if (bakeTimes === 0) return { type: 'ok' }
  const foodGained = rate.rate * bakeTimes
  player.resources.grain -= bakeTimes
  player.resources.food += foodGained
  return {
    type: 'ok',
    logKey: 'log.bakeBreadResult',
    logParams: { grainUsed: bakeTimes, foodGained, improvement: cardId },
  }
}
```

4. Replace `buildBakeBreadOptions`:
```typescript
const buildBakeBreadOptions = (player: PlayerState): ActionChoiceOption[] => {
  const rates = getPlayerBakeRates(player)
  const options: ActionChoiceOption[] = rates
    .filter((r) => player.resources.grain > 0)
    .map((r) => ({ value: r.cardId, labelKey: r.labelKey }))
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return options
}
```

5. Replace `canBeExecutedByPlayer`:
```typescript
canBeExecutedByPlayer: (_, player) =>
  player.resources.grain > 0 && hasAnyBakingImprovement(player),
```

6. Update `resolveBakeBreadChoice` to use dynamic rates instead of hardcoded `bakeImprovements`/`bakeMaxUses`:
```typescript
const resolveBakeBreadChoice = (
  player: PlayerState,
  choice: string,
): ActionExecutionResult => {
  if (choice === 'cancel') return { type: 'ok' }
  const rates = getPlayerBakeRates(player)
  const rateMap = new Map(rates.map((r) => [r.cardId, r]))

  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    payload.split(',').forEach((entry) => {
      const [cardId, countText] = entry.split('=')
      const rate = rateMap.get(cardId!)
      if (!rate) return
      const count = Number(countText)
      if (!Number.isFinite(count) || count <= 0) return
      const allowed = Math.min(count, rate.max)
      if (allowed <= 0) return
      bakeBread(player, cardId!, allowed)
    })
    return { type: 'ok' }
  }

  if (choice.startsWith('count-')) {
    const [, cardId, countText] = choice.split('-')
    if (rateMap.has(cardId!)) {
      return bakeBread(player, cardId!, Number(countText))
    }
    return { type: 'ok' }
  }

  const rate = rateMap.get(choice)
  if (rate) {
    const grain = player.resources.grain
    const maxCount = Math.max(0, Math.min(grain, rate.max))
    if (maxCount <= 1) {
      return bakeBread(player, choice, maxCount)
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionBakeBreadCount',
      options: Array.from({ length: maxCount }, (_, index) => ({
        value: `count-${choice}-${index + 1}`,
        labelKey: 'ui.interactionBakeBreadCountLabel',
        labelParams: { count: index + 1 },
      })),
    }
  }
  return { type: 'ok' }
}
```

7. Remove all the old hardcoded maps (`bakeTable`, `bakeImprovements`, `bakeLabelKey`, `bakeMaxUses`).

8. Keep the export `BakeImprovementId` for backward compatibility, OR remove it and fix any callers. Search for `BakeImprovementId` usage across the codebase first.

- [ ] **Step 2: Check if BakeImprovementId is used elsewhere**

Search for `BakeImprovementId` in all files. If used, keep a compatible export or update callers.

- [ ] **Step 3: Commit**

```
refactor: migrate bake-bread.ts to dynamic getPlayerBakeRates
```

---

## Task 4: Implement E63_IronOven + E64_SimpleOven

**Files:**
- Create: `shared/cards/E/E63_IronOven.ts`
- Create: `shared/cards/E/E64_SimpleOven.ts`

- [ ] **Step 1: Create E63_IronOven**

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E63_IronOven'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
})

export const E63_IronOven = new MinorImprovement({
  id: CARD_ID,
  name: "Iron Oven",
  deck: "E",
  number: 63,
  category: "FOOD_GRAIN",
  desc: ["[Bake Bread action:] 1 <GRAIN> → 6 <FOOD>"],
  cost: { stone: 3 },
  vp: 2,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 6 }, max: 1, trigger: 'bake-bread' },
  ],
})
```

- [ ] **Step 2: Create E64_SimpleOven**

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E64_SimpleOven'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
})

export const E64_SimpleOven = new MinorImprovement({
  id: CARD_ID,
  name: "Simple Oven",
  deck: "E",
  number: 64,
  category: "FOOD_GRAIN",
  desc: ["[Bake Bread action:] 1 <GRAIN> → 3 <FOOD>"],
  cost: { clay: 2 },
  vp: 1,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, max: 1, trigger: 'bake-bread' },
  ],
})
```

- [ ] **Step 3: Commit**

```
feat: implement E63_IronOven and E64_SimpleOven with exchanges
```

---

## Task 5: Tests

**Files:**
- Create: `shared/cards/__tests__/cooking-exchange.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from 'vitest'
import { getPlayerBakeRates, hasAnyBakingImprovement } from '../helpers/exchange-registry'
import { canBakeBread, bakeBread } from '../../actions/effects/bake-bread'
import type { PlayerState } from '../../game/types'

import '../E/E63_IronOven'
import '../E/E64_SimpleOven'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 3, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as PlayerState

describe('getPlayerBakeRates', () => {
  it('returns Major bake rates from improvements', () => {
    const player = createPlayer({ improvements: ['Major_ClayOven'] })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(1)
    expect(rates[0]).toMatchObject({ cardId: 'Major_ClayOven', rate: 5, max: 1 })
  })

  it('returns Minor bake rates from minorPlayed', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(1)
    expect(rates[0]).toMatchObject({ cardId: 'E63_IronOven', rate: 6, max: 1 })
  })

  it('returns both Major and Minor rates', () => {
    const player = createPlayer({
      improvements: ['Major_Fireplace1'],
      minorPlayed: ['E64_SimpleOven'],
    })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(2)
    expect(rates.find((r) => r.cardId === 'Major_Fireplace1')).toMatchObject({ rate: 2 })
    expect(rates.find((r) => r.cardId === 'E64_SimpleOven')).toMatchObject({ rate: 3, max: 1 })
  })

  it('returns empty for player with no baking improvements', () => {
    const player = createPlayer()
    expect(getPlayerBakeRates(player)).toEqual([])
  })
})

describe('hasAnyBakingImprovement', () => {
  it('true with Major baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer({ improvements: ['Major_StoneOven'] }))).toBe(true)
  })

  it('true with Minor baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer({ minorPlayed: ['E63_IronOven'] }))).toBe(true)
  })

  it('false without any baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer())).toBe(false)
  })
})

describe('canBakeBread', () => {
  it('true when player has grain and matching card', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    expect(canBakeBread(player, 'E63_IronOven')).toBe(true)
  })

  it('false when no grain', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    player.resources.grain = 0
    expect(canBakeBread(player, 'E63_IronOven')).toBe(false)
  })

  it('false when card not played', () => {
    const player = createPlayer()
    expect(canBakeBread(player, 'E63_IronOven')).toBe(false)
  })
})

describe('bakeBread with Minor oven', () => {
  it('E63 bakes 1 grain → 6 food', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    const result = bakeBread(player, 'E63_IronOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(6)
  })

  it('E64 bakes 1 grain → 3 food', () => {
    const player = createPlayer({ minorPlayed: ['E64_SimpleOven'] })
    const result = bakeBread(player, 'E64_SimpleOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(3)
  })

  it('Major still works after migration', () => {
    const player = createPlayer({ improvements: ['Major_ClayOven'] })
    const result = bakeBread(player, 'Major_ClayOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run shared/cards/__tests__/cooking-exchange.test.ts`

- [ ] **Step 3: Commit**

```
test: add cooking exchange tests for E63, E64, and bake rate collection
```

---

## Summary

| Task | Changes | Tests |
|---|---|---|
| 1 | Add `CardExchange` type + `exchanges` to CardDefinition | — |
| 2 | Create `exchange-registry.ts` with `getPlayerBakeRates` + `hasAnyBakingImprovement` | — |
| 3 | Migrate `bake-bread.ts` to dynamic rates | — |
| 4 | E63_IronOven + E64_SimpleOven card files | — |
| 5 | All tests | 12 tests |
