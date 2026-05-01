# Sprint 6a Cookery Exchange Refactor + 6 Stub Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate cookery trade data from hardcoded `cookeryTrades` table to per-card `exchanges` metadata; generalize harvest exchange selector for reverse trades (food → resources); unify `family-growth` action; add 4 new mutation kinds to `special-effect`; implement 6 stub/buggy cards (C109/D62/D108/C105/D157/D92/E139).

**Architecture:** Each card-fix is independent and uses existing extension points (`exchanges` metadata, `card-listeners`, `actionContext`, `futureMeeples`, `xor` node). Three main-path edits to `game-core.ts` (delete `hasHarvestCooking`, change feed-queue entry condition, switch selection model to entry-index) drive the cookery-window generalization. **D92 mutations must go through `special-effect` leaf, never via direct `writeCardExtraData` in handler/execute.** Plan does NOT touch other cards (E149/E38/D134/C104) using direct mutation — those are follow-up cleanup.

**Tech Stack:** TypeScript, vitest, existing engine + listener system, `xor`/`seq` node types.

---

## File Map

| File | Responsibility | Touch |
|---|---|---|
| `shared/cards/major/types.ts` | `MajorCardEffect` type | Modify (add `exchanges?: CardExchange[]`) |
| `shared/cards/major/fireplace.ts` | Fireplace1/2 metadata | Modify (add `exchanges` field, 5 entries each) |
| `shared/cards/major/cooking-hearth.ts` | CookingHearth1/2 metadata | Modify (add `exchanges` field, 5 entries each) |
| `shared/actions/effects/exchange.ts:220-275` | cookery trade table + helpers | Modify (delete `cookeryTrades` table; rewrite `getPlayerCookeryTrades` + `hasAffordableCookeryTrade` to scan card metadata) |
| `shared/cards/E/E53_BoarSpear.ts` | E53 metadata + listener | Modify (add `exchanges:[]` with `triggers:[]` empty array; listener still references via tradeIds) |
| `shared/session/game-core.ts:583-598` | `hasHarvestCooking` private method | Delete |
| `shared/session/game-core.ts:1474-1486` | feed queue entry condition | Modify (replace `hasHarvestCooking` check with `hasAnyHarvestExchange`) |
| `shared/session/game-core.ts:2215-2275` | cookery selection consumer | Modify (entry-index based + double-direction apply) |
| `shared/cards/types.ts` | `CardExchange` type | Modify (add `triggers: ExchangeWindow[]` array) |
| `shared/cards/C/C109_SchnappsDistiller.ts` | C109 stub | Modify (add `exchanges` metadata) |
| `shared/cards/D/D62_BeerTap.ts` | D62 stub | Modify (add 3-tier `exchanges` with shared sourceId) |
| `shared/cards/D/D108_StoneCarver.ts` | D108 stub | Modify (add `exchanges` metadata) |
| `shared/cards/C/C105_BasketCarrier.ts` | C105 stub | Modify (reverse trade `exchanges` metadata) |
| `shared/actions/effects/special-effect.ts` | special-effect stub | Rewrite (4-kind dispatcher + register in internal-actions) |
| `shared/actions/internal-actions.ts` | action registry | Modify (add `specialEffectAction` import + register) |
| `shared/actions/effects/wish-children.ts` | family-growth effects | Modify (merge `wishChildrenAction` + `growFamilyWithoutRoomAction` → single `familyGrowthAction`) |
| `shared/cards/action/round-wish-children.ts` | space flow | Modify (`actionId: 'family-growth'`) |
| `shared/cards/action/round-urgent-wish-children.ts` | space flow | Modify (`actionId: 'family-growth'` + `actionContext: { skipRoomCheck: true }`) |
| `shared/cards/E/E113_Godmother.ts` | listener actionId migrate | Modify |
| `shared/cards/E/E130_Overachiever.ts` | listener actionId migrate | Modify |
| `shared/cards/E/E151_DeliveryNurse.ts` | listener + dispatch actionId | Modify |
| `shared/cards/E/E92_FieldDoctor.ts` | listener + dispatch actionId | Modify |
| `shared/cards/D/D150_GodlySpouse.ts` | listener actionId migrate | Modify |
| `shared/cards/E/E22_GuestRoom.ts` | dispatch actionId | Modify |
| `shared/cards/C/C24_BedintheGrainField.ts` | dispatch actionId | Modify |
| `shared/cards/C/C92_AutumnMother.ts` | dispatch actionId | Modify |
| `shared/cards/C/C127_Lover.ts` | dispatch actionId | Modify |
| `shared/cards/B/B127_Seducer.ts` | dispatch actionId | Modify |
| `shared/i18n/zh.ts:451` / `en.ts:470` | i18n key rename | Modify (`'wish-children-growth'` → `'family-growth'`) |
| `shared/cards/D/D157_PartyOrganizer.ts` | listener + bonus score | Modify (opponent listener on family-growth + 8 food gain + verify computeBonusScore) |
| `shared/cards/D/D92_ChildOmbudsman.ts` | full rewrite | Modify (listen `place-farmer`; SEQ optional with special-effect leaf + family-growth leaf) |
| `shared/cards/E/E139_BunnyBreeder.ts` | onBuy implementation | Modify (xor optional with futureMeeples children) |
| `server/__tests__/C109_SchnappsDistiller-session.test.ts` | C109 tests | Create |
| `server/__tests__/D62_BeerTap-session.test.ts` | D62 tests | Create |
| `server/__tests__/D108_StoneCarver-session.test.ts` | D108 tests | Create |
| `server/__tests__/C105_BasketCarrier-session.test.ts` | C105 tests | Create |
| `server/__tests__/D157_PartyOrganizer-session.test.ts` | D157 tests | Create |
| `server/__tests__/D92_ChildOmbudsman-session.test.ts` | D92 tests | Create or modify |
| `server/__tests__/E139_BunnyBreeder-session.test.ts` | E139 tests | Create |
| `shared/actions/effects/__tests__/special-effect.test.ts` | special-effect tests | Create |
| `shared/actions/effects/__tests__/exchange-metadata.test.ts` | metadata-driven cookery tests | Create |
| `docs/card_progress.md` / `docs/master-plan.md` / `docs/ENGINE_ARCHITECTURE.md` / `docs/CUSTOM_CARD_SANDBOX.md` | doc sync | Modify (commit 9 only) |

---

## Task 1: Migrate Cookery Trade Data to Card Metadata

**Goal:** Delete hardcoded `cookeryTrades` table; move 4 Major + E53 trade data into respective card files; update `getPlayerCookeryTrades` to scan metadata; remove `hasHarvestCooking` ID-prefix hardcode.

**Files:**
- Modify: `shared/cards/major/types.ts:1-18` (add `exchanges` field)
- Modify: `shared/cards/types.ts` (find `CardExchange` definition; add/keep `triggers: ExchangeWindow[]` array; add `ExchangeWindow` type)
- Modify: `shared/cards/major/fireplace.ts` (add `exchanges` to fireplace1/2)
- Modify: `shared/cards/major/cooking-hearth.ts` (add `exchanges` to cookingHearth1/2)
- Modify: `shared/cards/E/E53_BoarSpear.ts` (add `exchanges:[{...,triggers:[]}]`)
- Modify: `shared/actions/effects/exchange.ts:220-275` (delete `cookeryTrades` table; rewrite helpers)
- Modify: `shared/session/game-core.ts:583-598` (delete `hasHarvestCooking`)
- Modify: `shared/session/game-core.ts:1474-1486` (replace check with `hasAnyHarvestExchange`)
- Test: `shared/actions/effects/__tests__/exchange-metadata.test.ts` (Create)

- [ ] **Step 1.1: Read CardExchange current type**

```bash
grep -n 'CardExchange\|ExchangeWindow\|trigger' shared/cards/types.ts | head -20
```

Expected: locate the `CardExchange` type and current `trigger` field shape (probably `'anytime' | 'harvest'` single string).

- [ ] **Step 1.2: Update CardExchange type to use `triggers` array**

Modify `shared/cards/types.ts` `CardExchange` type:

```ts
export type ExchangeWindow = 'anytime' | 'harvest' | 'bake-bread'

export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  sourceId: string
  max?: number
  triggers: ExchangeWindow[]   // empty array = event-trigger only (E53), not visible in any window
}
```

If existing field is `trigger: ExchangeWindow` (single), rename / replace with array form. Update C59_SchnappsDistillery.ts `exchanges:` field accordingly:

```ts
// shared/cards/C/C59_SchnappsDistillery.ts:16-18
exchanges: [
  { from: { vegetable: 1 }, to: { food: 5 }, sourceId: 'C59_SchnappsDistillery', max: 1, triggers: ['harvest'] },
],
```

- [ ] **Step 1.3: Add `exchanges?: CardExchange[]` field to MajorCardEffect**

Modify `shared/cards/major/types.ts`:

```ts
import type { Resource, ComplexCost } from '../../game/types'
import type { CardEffect, CardEffectHook } from '../card-effects'
import type { CardExchange } from '../types'

export type MajorEffectHook = CardEffectHook

export type MajorCardEffect = CardEffect & {
  cost: Partial<Resource> | ComplexCost
  vp: number
  extraVp: boolean
  description: string[]
  isCookery?: boolean
  isBaking?: boolean
  returnCards?: string[]
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
  exchanges?: CardExchange[]   // NEW
}
```

- [ ] **Step 1.4: Add `exchanges` to fireplace1/fireplace2 metadata**

Modify `shared/cards/major/fireplace.ts`:

```ts
import type { MajorCardEffect } from './types'

export const fireplace1: MajorCardEffect = {
  id: 'Major_Fireplace1',
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  description: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>      <PIG> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 },     to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { boar: 1 },      to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { cattle: 1 },    to: { food: 3 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { grain: 1 },     to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['bake-bread'] },
  ],
}

export const fireplace2: MajorCardEffect = {
  ...fireplace1,
  id: 'Major_Fireplace2',
  cost: { clay: 3 },
  exchanges: fireplace1.exchanges?.map(ex => ({ ...ex, sourceId: 'Major_Fireplace2' })),
}
```

- [ ] **Step 1.5: Add `exchanges` to cookingHearth1/2 metadata**

Modify `shared/cards/major/cooking-hearth.ts`:

```ts
import type { MajorCardEffect } from './types'

export const cookingHearth1: MajorCardEffect = {
  id: 'Major_CookingHearth1',
  cost: {
    fee: { clay: 4 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],
  description: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 3<FOOD>      <PIG> <ARROW> 3<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 4<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 3<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 },     to: { food: 2 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { boar: 1 },      to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { cattle: 1 },    to: { food: 4 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { grain: 1 },     to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['bake-bread'] },
  ],
}

export const cookingHearth2: MajorCardEffect = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  cost: {
    fee: { clay: 5 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  exchanges: cookingHearth1.exchanges?.map(ex => ({ ...ex, sourceId: 'Major_CookingHearth2' })),
}
```

- [ ] **Step 1.6: Add `exchanges` to E53_BoarSpear metadata (empty triggers)**

Modify `shared/cards/E/E53_BoarSpear.ts` — add to MinorImprovement constructor:

```ts
export const E53_BoarSpear = new MinorImprovement({
  id: CARD_ID,
  name: 'Boar Spear',
  deck: 'E', number: 53,
  category: 'FOOD',
  desc: ['Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each.'],
  vp: 1,
  cost: { wood: 1, stone: 1 },
  exchanges: [
    { from: { boar: 1 }, to: { food: 4 }, sourceId: 'E53_BoarSpear', triggers: [] },  // empty: only listener-triggered
  ],
})
```

- [ ] **Step 1.7: Rewrite exchange.ts cookery helpers to scan metadata**

Modify `shared/actions/effects/exchange.ts:215-275`:

Delete the `cookeryTrades` table (lines 220-248) and rewrite `getPlayerCookeryTrades` + `hasAffordableCookeryTrade`:

```ts
import { getMajorCardEffect } from '../../cards/major'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../../cards/types'
import type { CardExchange, ExchangeWindow } from '../../cards/types'

const getCardExchanges = (cardId: string): CardExchange[] => {
  const major = getMajorCardEffect(cardId)
  if (major?.exchanges) return major.exchanges
  const minor = getRegisteredMinorImprovement(cardId)
  if (minor?.exchanges) return minor.exchanges
  const occ = getRegisteredOccupation(cardId)
  if (occ?.exchanges) return occ.exchanges
  return []
}

export const getExchangesInWindow = (
  player: PlayerState,
  window: ExchangeWindow,
): CardExchange[] => {
  const result: CardExchange[] = []
  for (const cardId of [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]) {
    for (const ex of getCardExchanges(cardId)) {
      if (ex.triggers.includes(window)) result.push(ex)
    }
  }
  return result
}

export const getExchangesByTradeIds = (
  player: PlayerState,
  tradeIds: string[],
): CardExchange[] => {
  // Used by listener-triggered exchanges (e.g. E53): force-include by sourceId
  // regardless of triggers array (so triggers:[] entries are still reachable).
  const result: CardExchange[] = []
  for (const cardId of [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]) {
    for (const ex of getCardExchanges(cardId)) {
      if (tradeIds.includes(ex.sourceId)) result.push(ex)
    }
  }
  return result
}

const getPlayerCookeryTrades = (player: PlayerState): Trade[] => {
  return getExchangesInWindow(player, 'anytime')
}

const hasAffordableCookeryTrade = (player: PlayerState): boolean => {
  for (const ex of getExchangesInWindow(player, 'anytime')) {
    if (canAffordTrade(player, ex, 1)) return true
  }
  return false
}
```

- [ ] **Step 1.8: Replace `hasHarvestCooking` in game-core.ts**

Delete `shared/session/game-core.ts:583-598` (`hasHarvestCooking` method).

Add new method using metadata-driven scan:

```ts
import { getExchangesInWindow } from '../actions/effects/exchange'

private hasAnyHarvestExchange(player: PlayerState): boolean {
  return getExchangesInWindow(player, 'harvest').length > 0 ||
         getExchangesInWindow(player, 'anytime').length > 0
}
```

- [ ] **Step 1.9: Update feed queue entry condition (game-core.ts:1474-1486)**

Replace lines 1474-1486:

```ts
const hasHarvestExchange = this.hasAnyHarvestExchange(player)
const hasBasicCookable = player.resources.grain > 0 || player.resources.vegetable > 0
const remaining = required - useFood

if (remaining > 0 || hasHarvestExchange) {
  feedQueue.push({ index: i, remaining, foodUsed: useFood })
} else if (remaining > 0 && !hasBasicCookable) {
  player.resources.begging += remaining
  this.logHarvestResourceEntry('log.harvestFeedDetail', player, { food: useFood, begging: remaining })
}
```

- [ ] **Step 1.10: Write metadata test for exchange.ts**

Create `shared/actions/effects/__tests__/exchange-metadata.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getExchangesInWindow, getExchangesByTradeIds } from '../exchange'

describe('cookery exchange metadata', () => {
  it('returns Major Fireplace1 anytime trades for player who played it', () => {
    const player = makeTestPlayer({ improvements: ['Major_Fireplace1'] })
    const trades = getExchangesInWindow(player, 'anytime')
    expect(trades.length).toBeGreaterThanOrEqual(4)   // sheep/boar/cattle/veg
    expect(trades.some(t => t.sourceId === 'Major_Fireplace1')).toBe(true)
    expect(trades.every(t => !t.triggers.includes('bake-bread'))).toBe(true)
  })
  
  it('returns E53 boar trade only by tradeIds, not in any window', () => {
    const player = makeTestPlayer({ minorPlayed: ['E53_BoarSpear'] })
    expect(getExchangesInWindow(player, 'anytime')).toHaveLength(0)
    expect(getExchangesInWindow(player, 'harvest')).toHaveLength(0)
    const byId = getExchangesByTradeIds(player, ['E53_BoarSpear'])
    expect(byId).toHaveLength(1)
    expect(byId[0].from.boar).toBe(1)
    expect(byId[0].to.food).toBe(4)
  })
  
  it('separates bake-bread from anytime for Fireplace', () => {
    const player = makeTestPlayer({ improvements: ['Major_Fireplace1'] })
    const bake = getExchangesInWindow(player, 'bake-bread')
    expect(bake).toHaveLength(1)
    expect(bake[0].from.grain).toBe(1)
    expect(bake[0].to.food).toBe(2)
  })
  
  it('returns empty for player with no cookery cards', () => {
    const player = makeTestPlayer({})
    expect(getExchangesInWindow(player, 'anytime')).toHaveLength(0)
    expect(getExchangesInWindow(player, 'harvest')).toHaveLength(0)
  })
})

// makeTestPlayer: copy boilerplate from server/__tests__/A4_Baseboards-session.test.ts or
// shared/cards/__tests__/A151_Minstrel.test.ts (use existing test helpers).
```

- [ ] **Step 1.11: Run new test to verify it passes**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/exchange-metadata.test.ts
```
Expected: PASS all 4 cases.

- [ ] **Step 1.12: Regression run on existing cookery tests**

```bash
pnpm exec vitest run shared/cards/__tests__/cooking-exchange.test.ts shared/cards/__tests__/sourceCard-card-production.test.ts server/__tests__/E53_BoarSpear-session.test.ts
```
Expected: all PASS unchanged. If any failure, the metadata-driven helpers diverge from old `cookeryTrades` semantics — investigate and fix.

- [ ] **Step 1.13: Commit**

```bash
git add shared/cards/major/types.ts shared/cards/major/fireplace.ts shared/cards/major/cooking-hearth.ts shared/cards/E/E53_BoarSpear.ts shared/cards/types.ts shared/cards/C/C59_SchnappsDistillery.ts shared/actions/effects/exchange.ts shared/session/game-core.ts shared/actions/effects/__tests__/exchange-metadata.test.ts
git commit -m "refactor(exchange): migrate cookeryTrades + Major exchanges to card metadata; remove hasHarvestCooking"
```

---

## Task 2: Add Metadata for C109 / D62 / D108 Stub Cards

**Files:**
- Modify: `shared/cards/C/C109_SchnappsDistiller.ts`
- Modify: `shared/cards/D/D62_BeerTap.ts`
- Modify: `shared/cards/D/D108_StoneCarver.ts`
- Test: 3 new session test files

- [ ] **Step 2.1: Add C109 exchanges metadata**

Modify `shared/cards/C/C109_SchnappsDistiller.ts`:

```ts
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C109_SchnappsDistiller'

export const C109_SchnappsDistiller = new Occupation({
  id: CARD_ID,
  name: 'Schnapps Distiller',
  deck: 'C',
  number: 109,
  category: 'FOOD_PROVIDER',
  desc: ['Once each harvest, you can turn 1 <VEGETABLE> into 5 <FOOD>.'],
  players: '1+',
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, sourceId: CARD_ID, max: 1, triggers: ['harvest'] },
  ],
})

export const C109_SchnappsDistiller_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2.2: Write C109 session test**

Create `server/__tests__/C109_SchnappsDistiller-session.test.ts` — copy boilerplate from `server/__tests__/A4_Baseboards-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('C109 Schnapps Distiller', () => {
  it('appears as a harvest exchange option (vegetable -> 5 food)', () => {
    const session = newTwoPlayerSession()
    const p1 = session.state.players[0]
    p1.occupationPlayed = ['C109_SchnappsDistiller']
    p1.resources.vegetable = 1
    p1.resources.food = 0
    // trigger harvest feeding phase via session API; assert prompt includes
    // the {vegetable:1 -> food:5} option for sourceId 'C109_SchnappsDistiller'
    // (boilerplate: see e.g. existing harvest-cookery test)
  })
  
  it('caps at max:1 per harvest', () => {
    // 2 vegetable; only 1 should be convertible per harvest
  })
  
  it('not available outside harvest', () => {
    // anytime exchange action should NOT include C109 trade (triggers:['harvest'])
  })
})
```

- [ ] **Step 2.3: Run C109 test**

```bash
pnpm exec vitest run server/__tests__/C109_SchnappsDistiller-session.test.ts
```
Expected: PASS.

- [ ] **Step 2.4: Add D108 exchanges metadata**

Modify `shared/cards/D/D108_StoneCarver.ts`:

```ts
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D108_StoneCarver'

export const D108_StoneCarver = new Occupation({
  id: CARD_ID,
  name: 'Stone Carver',
  deck: 'D',
  number: 108,
  category: 'FOOD_PROVIDER',
  desc: ['In each feeding phase of a harvest, you can turn 1 <STONE> into 3 <FOOD>.'],
  players: '1+',
  exchanges: [
    { from: { stone: 1 }, to: { food: 3 }, sourceId: CARD_ID, max: 1, triggers: ['harvest'] },
  ],
})

export const D108_StoneCarver_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2.5: Write D108 session test (3 cases mirror C109)**

Create `server/__tests__/D108_StoneCarver-session.test.ts` (analogous to C109).

- [ ] **Step 2.6: Add D62 BeerTap 3-tier exchanges**

Modify `shared/cards/D/D62_BeerTap.ts`:

```ts
import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D62_BeerTap'

export const D62_BeerTap = new MinorImprovement({
  id: CARD_ID,
  name: 'Beer Tap',
  deck: 'D',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, you immediately get 2 <FOOD>. In the feeding phase of each harvest, you can turn 2/3/4 <GRAIN> into 3/6/9 <FOOD>.'],
  cost: { wood: 1 },
  exchanges: [
    { from: { grain: 2 }, to: { food: 3 }, sourceId: CARD_ID, max: 1, triggers: ['harvest'] },
    { from: { grain: 3 }, to: { food: 6 }, sourceId: CARD_ID, max: 1, triggers: ['harvest'] },
    { from: { grain: 4 }, to: { food: 9 }, sourceId: CARD_ID, max: 1, triggers: ['harvest'] },
  ],
})

export const D62_BeerTap_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: 2 },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

(D62 onBuy `+2 food` was a TODO in the stub; this implements it via the unified `gain` leaf, mirroring mech-E gain merge convention.)

- [ ] **Step 2.7: Write D62 session test**

Create `server/__tests__/D62_BeerTap-session.test.ts`:

```ts
describe('D62 Beer Tap', () => {
  it('grants +2 food onBuy', () => {
    // play D62; assert player.resources.food increased by 2
  })
  
  it('lists all 3 tiers in harvest exchange prompt', () => {
    // 2->3, 3->6, 4->9 all visible
  })
  
  it('caps integral card to 1 use per harvest (sourceId-level cap across tiers)', () => {
    // pick tier 1 (2->3); pick tier 2 next — should be capped (perSourceUsed = 1)
  })
  
  it('not available outside harvest', () => {
    // anytime exchange should NOT show D62 entries
  })
})
```

- [ ] **Step 2.8: Run all Task 2 tests**

```bash
pnpm exec vitest run server/__tests__/C109_SchnappsDistiller-session.test.ts server/__tests__/D108_StoneCarver-session.test.ts server/__tests__/D62_BeerTap-session.test.ts
```
Expected: all PASS (10+ cases total).

- [ ] **Step 2.9: Commit**

```bash
git add shared/cards/C/C109_SchnappsDistiller.ts shared/cards/D/D62_BeerTap.ts shared/cards/D/D108_StoneCarver.ts server/__tests__/C109_SchnappsDistiller-session.test.ts server/__tests__/D62_BeerTap-session.test.ts server/__tests__/D108_StoneCarver-session.test.ts
git commit -m "feat(stub): C109 / D62 / D108 metadata exchanges"
```

---

## Task 3: C105 BasketCarrier + Selector Generalization

**Goal:** Generalize `game-core.ts` cookery selection consumer to use entry-index based model + support reverse-direction trades (food → resources). Add C105 metadata.

**Files:**
- Modify: `shared/session/game-core.ts:2215-2275` (selection consumer)
- Modify: `shared/cards/C/C105_BasketCarrier.ts`
- Modify: client cookery prompt UI (find via grep — likely `src/app/.../FeedingFamilyDialog.tsx` or similar)
- Test: `server/__tests__/C105_BasketCarrier-session.test.ts` (Create)

- [ ] **Step 3.1: Find existing cookery selection schema**

```bash
grep -rn 'CookerySelection\|cookerySelection\|resourceKey.*food' shared/ src/ 2>/dev/null | head -10
```
Expected: locate the `selections` array shape passed from client to game-core. Currently keyed by `(sourceId, resourceKey, count, food)`.

- [ ] **Step 3.2: Update selection schema to entry-index based**

In the file holding selection types (shared protocol or selection.ts), update:

```ts
// Old (in shared/protocol or similar):
type CookerySelection = {
  sourceId: string
  resourceKey: keyof Resource
  count: number
  food: number
}

// New:
type CookerySelection = {
  sourceId: string
  exchangeIndex: number   // index into card.exchanges[]
  count: number
}
```

- [ ] **Step 3.3: Update game-core consumer (lines 2215-2275)**

Replace the `cappedSelections` block with entry-index lookup:

```ts
const perSourceUsed = new Map<string, number>()
const cappedSelections = selections.map((sel) => {
  if (!sel.sourceId || sel.count <= 0) return sel
  const card =
    player.minorPlayed.includes(sel.sourceId) ? getRegisteredMinorImprovement(sel.sourceId) :
    player.occupationPlayed.includes(sel.sourceId) ? getRegisteredOccupation(sel.sourceId) :
    player.improvements.includes(sel.sourceId) ? getMajorCardEffect(sel.sourceId) :
    undefined
  
  const exchange = card?.exchanges?.[sel.exchangeIndex]
  if (!exchange || !exchange.triggers.includes('harvest')) return sel
  if (exchange.max === undefined) return sel
  
  const usedSoFar = perSourceUsed.get(sel.sourceId) ?? 0
  const remaining = Math.max(0, exchange.max - usedSoFar)
  const capped = Math.min(sel.count, remaining)
  perSourceUsed.set(sel.sourceId, usedSoFar + capped)
  return { ...sel, count: capped }
})
```

- [ ] **Step 3.4: Update consumer to apply double-direction**

Replace the consumption block (which was `usedResources.food += sel.food * sel.count`) with bidirectional apply:

```ts
let totalFood = 0
const usedResources: Partial<Resource> = { food: this.pending.foodUsed }
for (const sel of cappedSelections) {
  if (sel.count <= 0) continue
  const card = /* same lookup as Step 3.3 */
  const exchange = card?.exchanges?.[sel.exchangeIndex]
  if (!exchange) continue
  
  // Verify player has enough `from` resources
  for (const [k, v] of Object.entries(exchange.from)) {
    const available = (player.resources as Record<string, number>)[k] ?? 0
    if (available < v * sel.count) return this.respond(false, 'cookery-insufficient-resources')
  }
  // Apply: subtract `from`, add `to`
  for (const [k, v] of Object.entries(exchange.from)) {
    (player.resources as Record<string, number>)[k] -= v * sel.count
    usedResources[k as keyof Resource] = (usedResources[k as keyof Resource] ?? 0) + v * sel.count
  }
  for (const [k, v] of Object.entries(exchange.to)) {
    (player.resources as Record<string, number>)[k] += v * sel.count
    if (k === 'food') totalFood += v * sel.count
  }
}
```

- [ ] **Step 3.5: Update client cookery prompt to render reverse trades**

Find client prompt rendering (search `cookerySelection\|InteractionFeedingFamily\|cookery`):

```bash
grep -rn 'cookerySelection\|interactionFeed\|InteractionFeed' src/ 2>/dev/null | head -10
```

Update prompt UI to:
1. List all `exchanges` for player's harvest+anytime windows (forward + reverse)
2. For each entry, render `{from} → {to}` label (regardless of direction)
3. Disable selection if player can't afford `from` resources
4. Send `{ sourceId, exchangeIndex, count }` selection back to server

(Specific code shape depends on existing UI structure; copy boilerplate from current cookery dialog.)

- [ ] **Step 3.6: Add C105 metadata**

Modify `shared/cards/C/C105_BasketCarrier.ts`:

```ts
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C105_BasketCarrier'

export const C105_BasketCarrier = new Occupation({
  id: CARD_ID,
  name: 'Basket Carrier',
  deck: 'C',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['Once each harvest, you can buy 1 <WOOD>, 1 <REED>, and 1 <GRAIN> for 2 <FOOD> total.'],
  players: '1+',
  exchanges: [
    {
      from: { food: 2 },
      to: { wood: 1, reed: 1, grain: 1 },
      sourceId: CARD_ID,
      max: 1,
      triggers: ['harvest'],
    },
  ],
})

export const C105_BasketCarrier_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 3.7: Write C105 session test (4 cases)**

Create `server/__tests__/C105_BasketCarrier-session.test.ts`:

```ts
describe('C105 Basket Carrier', () => {
  it('cannot select reverse trade with insufficient food', () => {
    // player has C105 + 1 food (< 2 required); reverse trade should be unavailable / disabled
  })
  
  it('reverse trade: spend 2 food, gain 1 wood + 1 reed + 1 grain', () => {
    // player has C105 + 5 food + 0 wood/reed/grain
    // confirm harvest exchange selection: { sourceId:'C105', exchangeIndex:0, count:1 }
    // assert food -= 2, wood/reed/grain each += 1
  })
  
  it('caps at max:1 per harvest', () => {
    // 4 food; only 1 reverse-trade allowed
  })
  
  it('not available outside harvest', () => {
    // anytime exchange should NOT show C105
  })
})
```

- [ ] **Step 3.8: Run C105 + selector tests**

```bash
pnpm exec vitest run server/__tests__/C105_BasketCarrier-session.test.ts
pnpm exec vitest run shared/cards/__tests__/cooking-exchange.test.ts
pnpm exec vitest run server/__tests__/E53_BoarSpear-session.test.ts
```
Expected: C105 PASS new; existing cookery / E53 PASS no regression.

- [ ] **Step 3.9: Commit**

```bash
git add shared/session/game-core.ts shared/cards/C/C105_BasketCarrier.ts server/__tests__/C105_BasketCarrier-session.test.ts <client UI files modified in Step 3.5> <selection schema file from Step 3.2>
git commit -m "feat(C105, exchange): generic selection model + reverse trade support"
```

---

## Task 4: special-effect Mutation Dispatcher

**Goal:** Upgrade `special-effect.ts` from stub to dispatcher supporting 4 mutation kinds (increment-extra-data, set-extra-data, set-flag, set-infobox).

**Files:**
- Modify: `shared/actions/effects/special-effect.ts`
- Modify: `shared/actions/internal-actions.ts` (register `specialEffectAction`)
- Test: `shared/actions/effects/__tests__/special-effect.test.ts`

- [ ] **Step 4.1: Read current special-effect.ts state**

```bash
cat shared/actions/effects/special-effect.ts
```
Expected: empty stub returning `{ type: 'ok' }`.

- [ ] **Step 4.2: Rewrite special-effect.ts as dispatcher**

Replace `shared/actions/effects/special-effect.ts`:

```ts
import type { ActionDefinition } from '../../game/types'
import { setCardFlag, writeCardInfobox, readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

export type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }

export const specialEffectAction: ActionDefinition = {
  id: 'special-effect',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
    const p = params as SpecialEffectParams | undefined
    if (!p) return { type: 'fail', logKey: 'log.specialEffectFail' }
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(player, sourceCard, p.key) ?? 0
        writeCardExtraData(player, sourceCard, p.key, current + p.amount)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(player, sourceCard, p.key, p.value)
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(player, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(player, sourceCard, p.text)
        return { type: 'ok' }
    }
  },
}
```

- [ ] **Step 4.3: Register in internal-actions.ts**

Modify `shared/actions/internal-actions.ts`:

Find the existing import for `specialEffect` (the stub function) and replace with:

```ts
import { specialEffectAction } from './effects/special-effect'

// In the action list array:
export const internalActions = [
  // ... existing actions
  specialEffectAction,
  // ...
]
```

(If `specialEffect` was used as a function elsewhere, find usages and verify they're test-only — if so, leave that signature alongside the new dispatcher to avoid breaking tests.)

- [ ] **Step 4.4: Add i18n keys**

Modify `shared/i18n/zh.ts` and `shared/i18n/en.ts` to add:

```ts
// zh.ts
'special-effect': { name: '卡牌效果', description: '触发卡牌特殊效果' },
'log.specialEffectFail': '{player} 的卡牌效果失败',

// en.ts
'special-effect': { name: 'Card Effect', description: 'Trigger card-specific side effect' },
'log.specialEffectFail': '{player} card effect failed',
```

- [ ] **Step 4.5: Write special-effect test (4 cases)**

Create `shared/actions/effects/__tests__/special-effect.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { specialEffectAction } from '../special-effect'
import { readCardExtraData, isCardFlagged } from '../../../cards/helpers/card-state'

describe('special-effect dispatcher', () => {
  it('increment-extra-data adds to existing counter', () => {
    const player = makeTestPlayer({})
    // initial: no extraData
    specialEffectAction.execute({ player, sourceCard: 'TEST_CARD', params: { kind: 'increment-extra-data', key: 'foo', amount: 5 } } as any)
    expect(readCardExtraData<number>(player, 'TEST_CARD', 'foo')).toBe(5)
    specialEffectAction.execute({ player, sourceCard: 'TEST_CARD', params: { kind: 'increment-extra-data', key: 'foo', amount: 3 } } as any)
    expect(readCardExtraData<number>(player, 'TEST_CARD', 'foo')).toBe(8)
  })
  
  it('set-extra-data overwrites value', () => {
    const player = makeTestPlayer({})
    specialEffectAction.execute({ player, sourceCard: 'TEST_CARD', params: { kind: 'set-extra-data', key: 'foo', value: 'hello' } } as any)
    expect(readCardExtraData(player, 'TEST_CARD', 'foo')).toBe('hello')
  })
  
  it('set-flag enables/disables card flag', () => {
    const player = makeTestPlayer({})
    specialEffectAction.execute({ player, sourceCard: 'TEST_CARD', params: { kind: 'set-flag', flag: true } } as any)
    expect(isCardFlagged(player, 'TEST_CARD')).toBe(true)
    specialEffectAction.execute({ player, sourceCard: 'TEST_CARD', params: { kind: 'set-flag', flag: false } } as any)
    expect(isCardFlagged(player, 'TEST_CARD')).toBe(false)
  })
  
  it('fails without sourceCard', () => {
    const player = makeTestPlayer({})
    const result = specialEffectAction.execute({ player, sourceCard: undefined, params: { kind: 'set-flag', flag: true } } as any)
    expect(result.type).toBe('fail')
  })
})
```

- [ ] **Step 4.6: Run special-effect test**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/special-effect.test.ts
```
Expected: all 4 PASS.

- [ ] **Step 4.7: Commit**

```bash
git add shared/actions/effects/special-effect.ts shared/actions/internal-actions.ts shared/i18n/zh.ts shared/i18n/en.ts shared/actions/effects/__tests__/special-effect.test.ts
git commit -m "feat(special-effect): upgrade stub to mutation dispatcher (4 kinds)"
```

---

## Task 5: family-growth Action Unification

**Goal:** Merge `wishChildrenAction` (`'wish-children-growth'`) and `growFamilyWithoutRoomAction` (`'grow-family-without-room'`) into single `familyGrowthAction` (`'family-growth'`) with `actionContext.skipRoomCheck`. Migrate 13 caller files.

**Files:**
- Modify: `shared/actions/effects/wish-children.ts`
- Modify: `shared/cards/action/round-wish-children.ts`
- Modify: `shared/cards/action/round-urgent-wish-children.ts`
- Modify: 6 listener cards (E113 / E130 / E151 / E92 / D150 / D92)
- Modify: 7 dispatch cards (E22 / E92 / E151 / C24 / C92 / C127 / B127)
- Modify: `shared/i18n/zh.ts:451` / `shared/i18n/en.ts:470`
- Test: existing tests for wish-children + new test for skipRoomCheck

- [ ] **Step 5.1: List all caller files**

```bash
grep -rn "'wish-children-growth'\|'grow-family-without-room'" shared/ server/ src/ 2>/dev/null
```
Expected: see all references — should match the file list above (13 source + ~5 test files).

- [ ] **Step 5.2: Merge the two actions in wish-children.ts**

Replace `shared/actions/effects/wish-children.ts`:

```ts
import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { getExtraRoomCapacity } from '../../cards/card-effects'
import { activateSmallestInactive, familySize } from '../../game/player'
import { addWorkerRef } from '../../game/space'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

const growFamilyCore = (
  state: GameState,
  player: PlayerState,
  fgSpaceId: string,
): ActionExecutionResult => {
  const newborn = activateSmallestInactive(player)
  if (!newborn) return { type: 'fail', logKey: 'log.familyFull' }
  const fgSpace = state.actionSpaces.find(s => s.id === fgSpaceId)
  if (fgSpace) {
    addWorkerRef(fgSpace, player.id, newborn.id)
  }
  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const familyGrowthAction: ActionDefinition = {
  id: 'family-growth',
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player, ctx) => {
    if (ctx?.actionContext?.skipRoomCheck === true) return true
    return effectiveRooms(player) > familySize(player)
  },
  execute: ({ state, player, space, actionContext }) => {
    const skipRoom = (actionContext as { skipRoomCheck?: boolean } | undefined)?.skipRoomCheck === true
    if (!skipRoom && effectiveRooms(player) <= familySize(player)) {
      return { type: 'fail', logKey: 'log.familyGrowthFail' }
    }
    return growFamilyCore(state, player, space.id)
  },
}

// Keep `growFamily` and `growFamilyWithoutRoom` as exports for backward compat in case any
// non-test caller still uses them directly; they delegate to growFamilyCore now.
export const growFamily = growFamilyCore
export const growFamilyWithoutRoom = growFamilyCore
```

- [ ] **Step 5.3: Update space registrations**

Modify `shared/cards/action/round-wish-children.ts:15`:

```ts
{ type: 'leaf', actionId: 'family-growth' }   // (was 'wish-children-growth')
```

Modify `shared/cards/action/round-urgent-wish-children.ts:14`:

```ts
{ type: 'leaf', actionId: 'family-growth', actionContext: { skipRoomCheck: true } }
```

- [ ] **Step 5.4: Migrate 6 listener cards**

For each of E113 / E130 / E151 / E92 / D150 / (D92 will be rewritten in Task 7), change `actions: [...]`:

```ts
// E113_Godmother.ts:14 — was ['wish-children', 'wish-children-growth']
actions: ['family-growth'],

// E130_Overachiever.ts:17 — was ['wish-children-growth']
actions: ['family-growth'],

// E151_DeliveryNurse.ts:26 — was ['wish-children-growth']
actions: ['family-growth'],

// E92_FieldDoctor.ts:42 — was ['wish-children-growth']
actions: ['family-growth'],

// D150_GodlySpouse.ts:14 — was ['wish-children-growth']
actions: ['family-growth'],
```

- [ ] **Step 5.5: Migrate 7 dispatch cards (actionId in flow leaves)**

For E22 / E92 / E151 / C24 / C92 / C127 / B127, change every `actionId: 'wish-children-growth'` or `actionId: 'grow-family-without-room'` in their flow children:

```ts
// E22_GuestRoom.ts:38 — was 'grow-family-without-room'
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } }

// E92_FieldDoctor.ts:49 (and :53)
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } }

// E151_DeliveryNurse.ts:34 (and :38)
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } }

// C24_BedintheGrainField.ts:33 — was 'wish-children-growth'
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID }   // require room (default)

// C92_AutumnMother.ts:31 — was 'wish-children-growth'
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID }

// C127_Lover.ts:31 — was 'grow-family-without-room'
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } }

// B127_Seducer.ts:30 — was 'grow-family-without-room'
{ type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, actionContext: { skipRoomCheck: true } }
```

- [ ] **Step 5.6: Update i18n keys**

Modify `shared/i18n/zh.ts:451`:

```ts
'family-growth': { name: '家庭增长', description: '增加 1 家庭成员' },
// remove or alias old key:
'wish-children-growth': { name: '家庭增长', description: '增加 1 家庭成员' },   // keep as alias for now (hot-fix safety)
```

Modify `shared/i18n/en.ts:470`:

```ts
'family-growth': { name: 'Family Growth', description: 'Grow family' },
'wish-children-growth': { name: 'Family Growth', description: 'Grow family' },   // alias
```

- [ ] **Step 5.7: Run full test suite to catch regressions**

```bash
pnpm test:fast 2>&1 | tail -10
```
Expected: all PASS. If any test references `'wish-children-growth'` or `'grow-family-without-room'` actionId directly, update those tests:

```bash
grep -rn "'wish-children-growth'\|'grow-family-without-room'" server/__tests__ shared/cards/__tests__ 2>/dev/null
```

For each match: replace actionId in test setup; if test was asserting `pending.actionId`, update to `'family-growth'`.

- [ ] **Step 5.8: Run lint + build**

```bash
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 5.9: Commit**

```bash
git add shared/actions/effects/wish-children.ts shared/cards/action/round-wish-children.ts shared/cards/action/round-urgent-wish-children.ts shared/cards/E/E113_Godmother.ts shared/cards/E/E130_Overachiever.ts shared/cards/E/E151_DeliveryNurse.ts shared/cards/E/E92_FieldDoctor.ts shared/cards/D/D150_GodlySpouse.ts shared/cards/E/E22_GuestRoom.ts shared/cards/C/C24_BedintheGrainField.ts shared/cards/C/C92_AutumnMother.ts shared/cards/C/C127_Lover.ts shared/cards/B/B127_Seducer.ts shared/i18n/zh.ts shared/i18n/en.ts <test files updated>
git commit -m "refactor(family-growth): unify two grow effects into single action with actionContext.skipRoomCheck"
```

---

## Task 6: D157 PartyOrganizer Listener + Bonus Score

**Files:**
- Modify: `shared/cards/D/D157_PartyOrganizer.ts`
- Test: `server/__tests__/D157_PartyOrganizer-session.test.ts` (Create)

- [ ] **Step 6.1: Read current D157 state**

```bash
cat shared/cards/D/D157_PartyOrganizer.ts
```
Expected: see existing computeBonusScore + missing listener.

- [ ] **Step 6.2: Read opponent listener context shape (E113/D92/E92 reference)**

```bash
grep -n "scope: 'opponent'" shared/cards/E/ shared/cards/D/ -r 2>/dev/null
grep -A 5 "scope: 'opponent'" shared/cards/E/E160_KelpGatherer.ts | head -15
```
Expected: see how opponent scope listener accesses the actor (`context.eventPlayer` / `context.actor` / similar).

- [ ] **Step 6.3: Add D157 opponent listener for family-growth**

Modify `shared/cards/D/D157_PartyOrganizer.ts`:

```ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'D157_PartyOrganizer'

const listener: CardListenerRegistration = {
  id: 'D157-after-opponent-grows-family',
  cardIds: [CARD_ID],
  scope: 'opponent',
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // The opponent who triggered family-growth: use whichever field your listener context provides.
    // Mirror E160 KelpGatherer / E154 Margrave / D92 ChildOmbudsman conventions.
    const opponent = (context as any).eventPlayer ?? (context as any).actor
    if (!opponent) return
    if (familySize(opponent) !== 5) return   // BGA: triggers only at the moment opponent reaches 5
    
    setCardFlag(context.player, CARD_ID, true)
    return {
      flow: {
        type: 'leaf',
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { food: 8 },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D157_PartyOrganizer = new MinorImprovement({
  id: CARD_ID,
  name: 'Party Organizer',
  deck: 'D',
  number: 157,
  category: 'POINTS_PROVIDER',
  desc: ['When an opponent gets their 5th family member, you immediately get 8 <FOOD>. During scoring, if you have 5 family members and no other player does, you get 3 bonus <SCORE>.'],
  cost: {},
  vp: 1,
})

export const D157_PartyOrganizer_impl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    computeBonusScore: (state, player) => {
      if (familySize(player) < 5) return 0
      const otherPlayersWith5 = state.players.filter(
        p => p.id !== player.id && familySize(p) >= 5
      ).length
      return otherPlayersWith5 === 0 ? 3 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 6.4: Write D157 session test**

Create `server/__tests__/D157_PartyOrganizer-session.test.ts`:

```ts
describe('D157 Party Organizer', () => {
  it('owner gains 8 food when opponent reaches 5 family', () => {
    // p1 plays D157; p2 grows family from 4 → 5 via wish-children
    // assert p1.resources.food increased by 8 + flag set
  })
  
  it('does not re-trigger when opponent grows from 5 → 6', () => {
    // After first trigger, opponent grows again; p1 should NOT gain another 8 food
  })
  
  it('does not trigger when opponent goes from 3 → 4', () => {
    // family != 5, no trigger
  })
  
  it('computeBonusScore: 3 VP if owner has 5 + sole 5-family', () => {
    // p1 has 5, p2 has 4 → +3 bonus
  })
  
  it('computeBonusScore: 0 VP if multiple players have 5', () => {
    // p1 has 5, p2 has 5 → 0 bonus
  })
})
```

- [ ] **Step 6.5: Run D157 tests**

```bash
pnpm exec vitest run server/__tests__/D157_PartyOrganizer-session.test.ts
```
Expected: all 5 PASS.

- [ ] **Step 6.6: Commit**

```bash
git add shared/cards/D/D157_PartyOrganizer.ts server/__tests__/D157_PartyOrganizer-session.test.ts
git commit -m "fix(D157): opponent listener using family-growth + 8 food gain on opponent reaching 5"
```

---

## Task 7: D92 ChildOmbudsman Rewrite

**Files:**
- Modify: `shared/cards/D/D92_ChildOmbudsman.ts` (full rewrite)
- Test: `server/__tests__/D92_ChildOmbudsman-session.test.ts` (Create or modify)

- [ ] **Step 7.1: Confirm BGA semantic**

Read `output/bga-agricola/modules/php/Cards/D/D92_ChildOmbudsman.php` to verify:
- Listens to ANY `place-farmer` (not family-growth)
- round ≥ 5 only
- Requires `freeRoom` (effectiveRooms > familySize)
- Offers SEQ optional [SPECIAL_EFFECT increment negativeScore by 2, family-growth]

(Already explored in spec §3.3.)

- [ ] **Step 7.2: Rewrite D92_ChildOmbudsman.ts**

Replace `shared/cards/D/D92_ChildOmbudsman.ts`:

```ts
import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { familySize } from '../../game/player'
import { getExtraRoomCapacity } from '../card-effects'
import type { CardImpl } from '../registry'

const CARD_ID = 'D92_ChildOmbudsman'

const effectiveRooms = (player: any) => player.rooms + getExtraRoomCapacity(player)

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'D92-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round < 5) return
    if (effectiveRooms(context.player) <= familySize(context.player)) return
    
    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.D92_ChildOmbudsman.choice',
        children: [
          // 1. Mutation via special-effect (only fires if player chooses yes)
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'negativeScore', amount: 2 },
          },
          // 2. Free family growth (skipRoomCheck NOT set; require room — already verified)
          {
            type: 'leaf',
            actionId: 'family-growth',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D92_ChildOmbudsman = new Occupation({
  id: CARD_ID,
  name: 'Child Ombudsman',
  deck: 'D',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['From round 5 on, if you have room in your house, at the end of each person action, you can take a __Family Growth__ action with that person. If you do, you get 2 negative <SCORE>.'],
  cost: {},
  players: '1+',
})

export const D92_ChildOmbudsman_impl = {
  listeners: [afterPlaceFarmerListener],
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      return -(readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 7.3: Add i18n key for D92 choice prompt**

Modify `shared/i18n/zh.ts`:

```ts
// Under cards.D92_ChildOmbudsman:
'D92_ChildOmbudsman': { choice: '使用儿童监察员（-2 VP，立即增长家庭）？' },
```

Modify `shared/i18n/en.ts`:

```ts
'D92_ChildOmbudsman': { choice: 'Use Child Ombudsman (-2 VP, immediate family growth)?' },
```

- [ ] **Step 7.4: Write D92 session test (5 cases)**

Create or replace `server/__tests__/D92_ChildOmbudsman-session.test.ts`:

```ts
describe('D92 Child Ombudsman', () => {
  it('does not offer SEQ in round 4', () => {
    // p1 plays D92, places farmer in round 4; no SEQ optional pending
  })
  
  it('does not offer SEQ in round 5 when no free room', () => {
    // p1 has D92, rooms = familySize, places farmer → no SEQ
  })
  
  it('offers SEQ optional in round 5 with free room', () => {
    // p1 has D92, rooms = 3, family = 2, places farmer → pending SEQ optional
  })
  
  it('player chooses yes: -2 VP recorded + family +1', () => {
    // After yes: cardStates.D92.extraData.negativeScore = 2 (via special-effect leaf)
    // player.workers active count increased by 1
  })
  
  it('player chooses no: no VP change, no family growth', () => {
    // After no: cardStates unchanged, family same
  })
  
  it('computeBonusScore returns -negativeScore total', () => {
    // 3 yes choices accumulated → -6 VP
  })
})
```

- [ ] **Step 7.5: Run D92 tests**

```bash
pnpm exec vitest run server/__tests__/D92_ChildOmbudsman-session.test.ts
```
Expected: all 6 PASS.

- [ ] **Step 7.6: Commit**

```bash
git add shared/cards/D/D92_ChildOmbudsman.ts server/__tests__/D92_ChildOmbudsman-session.test.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "fix(D92): rewrite to listen place-farmer; offer optional [-2 VP via special-effect + family-growth] SEQ"
```

---

## Task 8: E139 BunnyBreeder XOR Optional + futureMeeples

**Files:**
- Modify: `shared/cards/E/E139_BunnyBreeder.ts`
- Test: `server/__tests__/E139_BunnyBreeder-session.test.ts` (Create)

- [ ] **Step 8.1: Confirm xor + futureMeeples patterns**

```bash
grep -B 2 -A 10 "type: 'xor'" shared/cards/E/E10_StrawHat.ts | head -20
grep -B 2 -A 10 "queueFutureMeeples" shared/cards/E/E108_BlackberryFarmer.ts shared/cards/E/E119_LandHeir.ts
```
Expected: see `xor` node with `optional: true, children: [...]` and `queueFutureMeeples + futureMeeplesNode()` returning a flow.

- [ ] **Step 8.2: Implement E139 onBuy XOR + child queue**

Modify `shared/cards/E/E139_BunnyBreeder.ts`:

```ts
import { Occupation } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E139_BunnyBreeder'

export const E139_BunnyBreeder = new Occupation({
  id: CARD_ID,
  name: 'Bunny Breeder',
  deck: 'E',
  number: 139,
  category: 'FOOD',
  desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
  players: '3+',
})

export const E139_BunnyBreeder_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const turnLeft = 14 - state.round
      if (turnLeft <= 0) return
      
      // Pre-queue all possible futures using sub-functions (engine xor will execute selected child)
      // Pattern: each xor child is a `seq` containing 'queue then futureMeeplesNode'.
      // Engine evaluates the chosen child only.
      const children = []
      for (let i = 1; i <= turnLeft; i += 1) {
        children.push({
          type: 'seq' as const,
          children: [
            {
              type: 'leaf' as const,
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'set-extra-data',
                key: `bunny_choice_i_${i}`,
                value: { round: state.round + i, food: i },
              },
            },
            // Note: special-effect only stamps data; the actual queueFutureMeeples mutation
            // must be triggered by a follow-up listener that reads the extraData and queues.
          ],
        })
      }
      return { type: 'xor', optional: true, children }
    },
    // Listener: after onBuy runs and one xor child sets extraData, queue the futureMeeple.
    // This follows the "no direct mutation in execute/handler" rule by routing through special-effect.
    // ALTERNATIVE simpler implementation: see Step 8.3.
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

**WAIT — that approach is overly indirect.** The actual idiom in this codebase (see E108_BlackberryFarmer / E119_LandHeir) is to `queueFutureMeeples` directly inside the `onBuy` flow handler. `queueFutureMeeples` mutates `state.futureMeeples` (a top-level GameState field, not `player.cardStates`), so it does not violate the "no listener mutate cardStates" rule.

Use the simpler form:

- [ ] **Step 8.3: Replace with simpler xor + queueFutureMeeples-per-child pattern**

Replace E139_BunnyBreeder_impl with:

```ts
export const E139_BunnyBreeder_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const turnLeft = 14 - state.round
      if (turnLeft <= 0) return
      // Single XOR optional with 1 child per i = round delta.
      // Each child is a seq that queueFutureMeeples + futureMeeplesNode for THAT i.
      // Engine executes only the chosen child.
      const children = Array.from({ length: turnLeft }, (_, idx) => {
        const i = idx + 1
        return {
          type: 'seq' as const,
          children: [
            {
              // Inline-execution leaf that calls queueFutureMeeples for this i
              // and returns futureMeeplesNode(). We need a leaf actionId that
              // does this; reuse the existing 'queue-future-meeple' leaf if it exists.
              // PLAN VERIFICATION: Confirm leaf actionId in shared/actions/effects/future-meeples.ts.
              type: 'leaf' as const,
              actionId: 'queue-future-meeple',
              sourceCard: CARD_ID,
              params: { round: state.round + i, resources: { food: i } },
            },
          ],
        }
      })
      return { type: 'xor' as const, optional: true, children }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

If `'queue-future-meeple'` action does NOT exist (verify via `grep`), create one:

```ts
// shared/actions/effects/future-meeples.ts — add new export:
export const queueFutureMeepleAction: ActionDefinition = {
  id: 'queue-future-meeple',
  nameKey: 'actions.queue-future-meeple.name',
  descriptionKey: 'actions.queue-future-meeple.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.queueFutureMeepleFail' }
    const p = params as { round: number; resources: Partial<Resource> } | undefined
    if (!p) return { type: 'fail', logKey: 'log.queueFutureMeepleFail' }
    queueFutureMeeples(state, {
      cardId: sourceCard,
      playerId: player.id,
      entries: [{ round: p.round, resources: p.resources }],
    })
    return { type: 'ok' }
  },
}
```

Register in internal-actions.ts.

- [ ] **Step 8.4: Add i18n keys for E139 prompt + queue action**

Modify `shared/i18n/zh.ts`:

```ts
'queue-future-meeple': { name: '预定未来食物', description: '将食物预约到指定回合' },
'cards.E139_BunnyBreeder.option': '+{delta} 食物 → 第 {targetRound} 回合开始时获得',
'cards.E139_BunnyBreeder.prompt': '选择放置 1 标记到哪个未来回合空间',
```

Modify `shared/i18n/en.ts`:

```ts
'queue-future-meeple': { name: 'Queue Future Meeple', description: 'Reserve resources for a target round' },
'cards.E139_BunnyBreeder.option': '+{delta} food at the start of round {targetRound}',
'cards.E139_BunnyBreeder.prompt': 'Choose which future round to place 1 marker',
```

- [ ] **Step 8.5: Write E139 session test**

Create `server/__tests__/E139_BunnyBreeder-session.test.ts`:

```ts
describe('E139 Bunny Breeder', () => {
  it('on round 1 buy: shows xor with 13 children (one per future round)', () => {
    // play E139 in round 1; pending should be xor with 13 options
  })
  
  it('player picks i=2 (target round 3, +2 food)', () => {
    // resolve xor selection 2; futureMeeples queue should have 1 entry: { round: 3, resources: { food: 2 } }
  })
  
  it('round 3 startOfRound: player gets 2 food', () => {
    // advance to round 3; confirm food += 2; queue cleared
  })
  
  it('on round 14 buy: no xor (turnLeft = 0)', () => {
    // play E139 in round 14; nothing to queue, no pending
  })
  
  it('player skips xor optional: no future meeples queued', () => {
    // skip the xor; futureMeeples should remain empty
  })
})
```

- [ ] **Step 8.6: Run E139 tests**

```bash
pnpm exec vitest run server/__tests__/E139_BunnyBreeder-session.test.ts
```
Expected: all 5 PASS.

- [ ] **Step 8.7: Commit**

```bash
git add shared/cards/E/E139_BunnyBreeder.ts shared/actions/effects/future-meeples.ts shared/actions/internal-actions.ts shared/i18n/zh.ts shared/i18n/en.ts server/__tests__/E139_BunnyBreeder-session.test.ts
git commit -m "feat(E139): onBuy XOR optional choose 1 target round + futureMeeples single entry"
```

---

## Task 9: Documentation Sync

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/CUSTOM_CARD_SANDBOX.md`
- Verify: `pnpm run check:prompt-sync` passes

- [ ] **Step 9.1: Update card_progress.md §2.0 changelog**

Append:

```markdown
- **2026-04-30 Sprint 6a — Cookery exchange metadata 化 + 6 张 stub 卡 + family-growth 统一 + special-effect 升级**：
  - **C109 SchnappsDistiller / D108 StoneCarver / D62 BeerTap**：纯 metadata 加 `exchanges` 字段（vegetable→5 food / stone→3 food / 3 档 grain→food），D62 三 entries 共享 sourceId max:1 自然 cap 整张卡 1 次。
  - **C105 BasketCarrier**：反向 trade（食物→3 资源）；触发 cookery selector 通用化（entry-index based + 双向 apply），game-core.ts 删 `hasHarvestCooking` 硬编码。
  - **D157 PartyOrganizer**：opponent listener on family-growth → 当对手 family 到 5 时 owner 立即获 8 food。
  - **D92 ChildOmbudsman 重写**：原监听 wish-children-growth + 自动累加 -2 VP（错），改为监听任何 place-farmer + SEQ optional `[special-effect 累 -2 VP, family-growth]`，玩家选 yes 才 mutate（通过 special-effect leaf 走 engine）。
  - **E139 BunnyBreeder**：XOR optional + queueFutureMeeples，玩家选 i 在 round+i 派 i food。
  - **family-growth 统一**：合并 `wish-children-growth` + `grow-family-without-room` 为单一 `family-growth` action with `actionContext.skipRoomCheck`（BGA 对齐）。13+ caller 同步迁移。
  - **special-effect 升级**：从空 stub 升级为 mutation dispatcher（4 kind：increment-extra-data / set-extra-data / set-flag / set-infobox），D92 mutation 走 leaf 不 mutate handler。
  - **删除硬编码反模式**：cookeryTrades 表（exchange.ts:220）+ hasHarvestCooking ID 前缀（game-core.ts:583）— Major Fireplace/CookingHearth 加 metadata `exchanges`，统一从 metadata 扫描。
  - 测试：~25 例新增 / 修改（C109/D62/D108/C105/D157/D92/E139 各 4-6 例 + special-effect 4 例 + exchange-metadata 4 例）。spec / plan：`docs/superpowers/specs/2026-04-30-sprint-6a-cookery-trades-batch-design.md` / `docs/superpowers/plans/2026-04-30-sprint-6a-cookery-trades-batch.md`。
```

- [ ] **Step 9.2: Update card_progress.md §2.6 stub list**

Migrate 6 cards out of stub list (mark as ✅):

```markdown
- ~~**C109 SchnappsDistiller**~~ ✅ Sprint 6a — metadata exchange (1 vegetable → 5 food, max:1 harvest)
- ~~**D62 BeerTap**~~ ✅ Sprint 6a — metadata exchange (2/3/4 grain → 3/6/9 food, sourceId-cap 1) + onBuy +2 food
- ~~**D108 StoneCarver**~~ ✅ Sprint 6a — metadata exchange (1 stone → 3 food, max:1 harvest)
- ~~**C105 BasketCarrier**~~ ✅ Sprint 6a — reverse trade metadata (food → wood/reed/grain) via selector generalization
- ~~**D157 PartyOrganizer**~~ ✅ Sprint 6a — opponent listener + 8 food gain
- ~~**D92 ChildOmbudsman**~~ ✅ Sprint 6a — full rewrite: listen place-farmer + SEQ optional with special-effect leaf
- ~~**E139 BunnyBreeder**~~ ✅ Sprint 6a — onBuy XOR + queueFutureMeeples
```

Remaining stubs: C62 / D94 / E155 (推 6c) / 其他.

- [ ] **Step 9.3: Update card_progress.md §3 infrastructure**

Append (find §3 / "基础设施" section):

```markdown
| **`exchanges` metadata 字段统一**（2026-04-30, Sprint 6a） | ✅ | 删 `cookeryTrades` 硬编码表（exchange.ts:220）+ Major Fireplace/CookingHearth 加 `exchanges` 字段（types.ts MajorCardEffect）+ E53 加 `exchanges:[{...,triggers:[]}]`（空数组 = 仅事件触发）。`getExchangesInWindow(player, window)` / `getExchangesByTradeIds(player, ids)` 通用 helper 扫所有卡 metadata。删 `hasHarvestCooking` 硬编码 ID 检测（game-core.ts:583）。 |
| **harvest exchange selector 通用化**（2026-04-30, Sprint 6a） | ✅ | game-core.ts:2215+ selection consumer 改为 entry-index based（`{ sourceId, exchangeIndex, count }`），消费阶段双向 apply（forward + reverse trade）。 |
| **`family-growth` action 统一**（2026-04-30, Sprint 6a） | ✅ | 合并 `wish-children-growth` + `grow-family-without-room` 为单一 `family-growth` action with `actionContext.skipRoomCheck` boolean。BGA 对齐（单一 `WISHCHILDREN` action）。13 caller 迁移。 |
| **`special-effect` mutation dispatcher**（2026-04-30, Sprint 6a） | ✅ | 从空 stub 升级为 dispatcher，4 kind discriminated union：`increment-extra-data / set-extra-data / set-flag / set-infobox`。用例：D92 SEQ child 累加 negativeScore；为后续 listener mutation cleanup 提供基础。 |
```

- [ ] **Step 9.4: Update card_progress.md §6 follow-up**

Append:

```markdown
- **listener handler / execute 内直接 mutate cardStates 清理（4 张）**：性质与 6a 不同（已用卡 mutation pattern 清理 vs 补 stub），独立 sprint：
  1. **E149 MidnightFencer** — `resolveChoice` 累加 `owedFences += K` → 改 special-effect leaf
  2. **E38 RodCollection** — listener `after-collect` handler 累加 `woodCount += 2` → 改 special-effect leaf
  3. **D134 OysterEater** — listener `after-place-farmer` handler 累加 `skipNextPlacement += 1` → 改 SEQ + special-effect
  4. **C104 Collector** — PlayerActionCard `execute` 累加 `used += 1` → 改 SEQ + special-effect（涉及 PlayerActionCard 模式重写）
- **flag-card / unflag-card 重定向到 `special-effect` kind=`'set-flag'`**：rename / 兼容工作
```

- [ ] **Step 9.5: Update card_progress.md §8 timeline**

Append:

```markdown
| Sprint 6a (cookery exchange metadata + 6 stub cards + family-growth unified + special-effect dispatcher) | 04-30 | 0 | 822 | 92.1% |
```

- [ ] **Step 9.6: Update master-plan.md §1 / §8 Sprint 6 row**

Update Sprint 6 row in §8: progress notation includes 6a (~3.3-3.6d). Add 6a entry in spec / plan / branch columns.

- [ ] **Step 9.7: Update ENGINE_ARCHITECTURE.md §15.x**

Append (after §15.7 from 5b):

```markdown
## 15.8 Cookery Exchange Metadata-Driven (Sprint 6a)

All cookery trades live in card metadata (`exchanges: CardExchange[]`), not a central registry table. `CardExchange.triggers: ExchangeWindow[]` controls which window the trade appears in:
- `'anytime'` — visible in anytime exchange action (e.g. Fireplace)
- `'harvest'` — visible only in harvest feeding phase prompt (e.g. C59, C105, D62, D108, C109)
- `'bake-bread'` — visible only in bake-bread action
- `[]` (empty) — not visible in any window; only listener-triggered (e.g. E53)

**Helpers:**
- `getExchangesInWindow(player, window)` — scans played cards' metadata, returns trades matching that window
- `getExchangesByTradeIds(player, ids)` — force-include by sourceId regardless of triggers (for listener-driven invocations)

**Removed:** Hardcoded `cookeryTrades` table in `shared/actions/effects/exchange.ts`, hardcoded `'Major_Fireplace' / 'Major_CookingHearth'` ID prefix detection in `hasHarvestCooking` (now `hasAnyHarvestExchange` walks metadata).

## 15.9 Harvest Exchange Selector Generalization (Sprint 6a)

`game-core.ts` selection consumer (around lines 2215-2275) uses entry-index model:

```ts
type CookerySelection = {
  sourceId: string
  exchangeIndex: number   // index into card.exchanges[]
  count: number
}
```

Consumption applies bidirectionally: subtract `from`, add `to` (no longer assumes `to.food` is the only output). Enables reverse-direction trades like C105 BasketCarrier (food → wood + reed + grain).

## 15.10 family-growth Action Unification (Sprint 6a)

Merged `wishChildrenAction` (`'wish-children-growth'`) and `growFamilyWithoutRoomAction` (`'grow-family-without-room'`) into single `familyGrowthAction` (`'family-growth'`). Routes through `actionContext.skipRoomCheck: boolean`:
- standard `wish-children` space: `actionContext.skipRoomCheck = undefined` (default false; require freeRoom)
- urgent `urgent-wish-children` space: `actionContext.skipRoomCheck = true` (no room required)

BGA aligned: BGA also uses single `WISHCHILDREN` action (urgent variant via `actionCardType`).

## 15.11 special-effect Mutation Dispatcher (Sprint 6a)

`shared/actions/effects/special-effect.ts` upgraded from stub to dispatcher with 4 mutation kinds (discriminated union `params.kind`):

```ts
type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }
```

**Use case:** card SEQ children that conditionally mutate `cardStates` only when the player accepts (e.g., D92 SEQ optional `[special-effect, family-growth]` — yes triggers both, no triggers neither).

**Rationale:** previous pattern of `writeCardExtraData(...current + delta)` directly inside `listener.handler` violates "engine sees all mutations" — engine cannot distinguish accepted vs declined SEQ optional. Routing through leaf ensures mutations replay correctly via flow tree.

(Cleanup of existing 4 cards using direct mutation — E149 / E38 / D134 / C104 — tracked as follow-up; not in 6a.)
```

- [ ] **Step 9.8: Update CUSTOM_CARD_SANDBOX.md prompt-sync blocks**

Modify `docs/CUSTOM_CARD_SANDBOX.md`:

For LLM workshop visibility, the new public surface needed:

```markdown
<!-- prompt-sync:start id=card-effect-hooks -->
- existing hooks
<!-- prompt-sync:end id=card-effect-hooks -->
```

(The card-effect-hooks block is independent of new exchange metadata.)

The `exchanges` field is on the card class definition, not in `cardEffectHooks`, so prompt-sync may not flag it. Verify via:

```bash
pnpm run check:prompt-sync 2>&1 | tail -10
```

If a new hook appears in `cardEffectHooks` (e.g. via Task 1's metadata changes propagating to type unions), update the prompt-sync block accordingly. Otherwise no doc change needed for this block.

For `client/services/llmPrompts.ts`, ensure all hooks listed in CUSTOM_CARD_SANDBOX.md `cardEffectHooks` block are also mentioned in llmPrompts.ts — `pnpm run check:prompt-sync` validates this. If 6a's task changes the public hook list (it should not), add/update the missing entry.

- [ ] **Step 9.9: Run prompt-sync check (must pass — avoid 5b hot-fix recurrence)**

```bash
pnpm run check:prompt-sync 2>&1 | tail -10
```
Expected: `All sources and targets are in sync.` If any drift detected, add the missing hook/identifier to CUSTOM_CARD_SANDBOX.md or llmPrompts.ts before commit.

- [ ] **Step 9.10: Run full test suite**

```bash
pnpm test:fast 2>&1 | tail -10
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```
Expected:
- fast: ~280 files PASS, 0 failures
- lint: 0 errors
- build: success

- [ ] **Step 9.11: Commit docs**

```bash
git add docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md docs/CUSTOM_CARD_SANDBOX.md client/services/llmPrompts.ts
git commit -m "docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / CUSTOM_CARD_SANDBOX for sprint-6a"
```

---

## Final Validation

- [ ] **Step F.1: Inspect commit list**

```bash
git log --oneline origin/main..HEAD
```

Expected: 9 commits in order (numbered above) — match the sequence.

- [ ] **Step F.2: Final test + lint + build run**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm test:slow 2>&1 | tail -5   # optional but recommended given selector model change
pnpm run lint 2>&1 | tail -3
pnpm run build 2>&1 | tail -3
pnpm run check:prompt-sync 2>&1 | tail -5
```

All must be GREEN.

- [ ] **Step F.3: Hand off for push**

Report:
> "Sprint 6a implementation complete. 9 commits ready on `sprint-6a-cookery-trades-batch` branch.
> Tests: fast PASS, slow PASS, lint 0 errors, build success, prompt-sync GREEN.
> Push command (manual, after rebase if main moved):
> ```bash
> cd /data00/home/xuxinhao.titan/raw/open-agricola
> git fetch origin main
> # If main moved: cd .worktree/sprint-6a-cookery-trades && git rebase origin/main
> git checkout main && git merge --ff-only sprint-6a-cookery-trades-batch && git push origin main
> ```
> Then verify CI run on https://github.com/titanxxh/open-agricola/actions."

---

## Spec Coverage Self-Check

- [x] Spec §1 范围: 6 张 stub + 4 通用机制 → Tasks 1-8
- [x] Spec §2.0 cookery metadata 重构 → Task 1
- [x] Spec §2.1-§2.3 (C109/D62/D108) → Task 2
- [x] Spec §2.4 (C105 + selector 通用化) → Task 3
- [x] Spec §2.5 special-effect 升级 → Task 4
- [x] Spec §3.1 family-growth refactor → Task 5
- [x] Spec §3.2 D157 → Task 6
- [x] Spec §3.3 D92 → Task 7
- [x] Spec §4 E139 → Task 8
- [x] Spec §5 测试 + 文档 → Test steps in each task + Task 9
- [x] Spec §6 follow-up: 4 mutation 卡 + flag-card cleanup → Documented in Task 9 Step 9.4
- [x] Spec §7 风险 → Risk mitigations in Plan steps (regression tests in Task 1.12, lint in Task 5.8)
- [x] Spec §8 DoD → Final Validation steps F.1-F.3
- [x] Spec §9 工时 ~3.3-3.6d → Task count and step granularity match (~9 days when bite-sized × overhead)

---

## Notes for Implementer

1. **Test boilerplate**: Always copy from a recently-committed neighbor (e.g., `server/__tests__/A4_Baseboards-session.test.ts` for session tests, `shared/cards/__tests__/A151_Minstrel.test.ts` for unit tests). Do not invent helpers.

2. **Listener context fields**: `context.eventPlayer` / `context.actor` — verify the exact field name by reading similar listener implementations (`E160 KelpGatherer`, `D92 ChildOmbudsman`, `E92 FieldDoctor`). All recent listeners follow the same convention.

3. **`getRegisteredCard` does not exist**: Use the trio `getMajorCardEffect / getRegisteredMinorImprovement / getRegisteredOccupation` (already imported in exchange.ts). Plan does NOT introduce a new unified `getRegisteredCard` because mech-A/D/etc. already pattern-match this trio inline.

4. **xor node verified working**: E10 StrawHat / E74 AshTrees / E78 SleightofHand / E39 Paintbrush all use `{ type: 'xor', optional: true, children: [...] }`. Engine fully supports this.

5. **`queueFutureMeeples` is direct mutation**: Mutates `state.futureMeeples` (top-level GameState field) — NOT `player.cardStates`. The "no listener mutate cardStates" rule does NOT apply; reusing `queueFutureMeeples` from card flow is allowed (E108, E119, E43 all do this).

6. **`'wish-children-growth'` i18n alias**: Keep the alias entry in zh.ts/en.ts for safety in case any UI text still references the old key. Remove only after manual verification of zero referrer.

7. **D92 mutation rule**: D92 listener handler MUST NOT call `writeCardExtraData(player, CARD_ID, 'negativeScore', ...)` directly. Mutation must occur in the SEQ child via `special-effect` leaf. This is the new pattern; verify in test "player chooses no" that `cardStates.D92.negativeScore` is unchanged after canceled SEQ.

8. **Plan adaptation**: If actual code shape differs from this plan (e.g. selection schema field names, listener context fields), adapt to existing convention; do NOT force the plan's naming. The plan's structural decisions (entry-index, triggers array, special-effect dispatcher) are non-negotiable.

9. **prompt-sync hot-fix prevention**: Run `pnpm run check:prompt-sync` BEFORE every commit (especially commits 1, 4, 9). If any drift, fix CUSTOM_CARD_SANDBOX.md or llmPrompts.ts in the same commit.

10. **Commit gating**: Each task's tests MUST pass before committing. Do not batch-commit failing tests — discipline ensures clean revertability.
