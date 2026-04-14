# Batch 1+2: Data-Only + ON_BUY Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 171 cards (29 data/exchange/score + 142 onBuy) to raise implementation rate from 21% to 40%.

**Architecture:** Each card gets a `.ts` file exporting a `MinorImprovement` or `Occupation` instance. Cards with effects call `registerCardEffect()` with the relevant hook (`onBuy`, `exchanges`, `computeBonusScore`). All cards must be imported and registered in `shared/cards/catalog.ts`. BGA PHP files at `~/bga-agricola/modules/php/Cards/{DECK}/` are the reference for each card's logic.

**Tech Stack:** TypeScript, shared/cards/ module, Vitest for testing.

**Conventions:**
- Card file path: `shared/cards/{DECK}/{ID}_{Name}.ts`
- Cards 1-80 per deck → `MinorImprovement`, cards 81+ → `Occupation`
- `CARD_ID` const at top of file, used in both `registerCardEffect` and export
- Import `registerCardEffect` from `'../card-effects'`, types from `'../types'`
- Action leaf nodes use `{ type: 'leaf' as const, actionId: '...', sourceCard: CARD_ID }`
- Gain nodes use `{ type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { wood: N, ... } }`
- Optional actions wrap in `optional: true`

---

## Reference: Key Patterns

### Pattern A: Data-only (no hooks)

```typescript
import { MinorImprovement } from '../types'

export const A1_Shelter = new MinorImprovement({
  id: 'A1_Shelter',
  name: 'Shelter',
  deck: 'A',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['Description here'],
  cost: { wood: 0 },
})
```

### Pattern B: Simple onBuy gain

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E7_Pumpernickel'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { food: 4 },
  }),
})

export const E7_Pumpernickel = new MinorImprovement({
  id: CARD_ID,
  name: 'Pumpernickel',
  deck: 'E',
  number: 7,
  category: 'FOOD_MISC',
  desc: ['Immediately gain 4 <FOOD>.'],
  cost: { grain: 1 },
})
```

### Pattern C: onBuy with conditional gain

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const amount = player.rooms.length  // or any condition
    if (amount === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: amount },
    }
  },
})
```

### Pattern D: onBuy triggering an action

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'plow',  // or 'fencing', 'renovation', 'stables', 'sow', 'bake-bread'
    sourceCard: CARD_ID,
    optional: true,
  }),
})
```

### Pattern E: onBuy with XOR choice

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'xor' as const,
    children: [
      { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { sheep: 1 } },
      { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 2 } },
    ],
  }),
})
```

### Pattern F: onBuy with seq (multi-step)

```typescript
registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { clay: 5 } },
      { type: 'leaf' as const, actionId: 'renovation', sourceCard: CARD_ID, optional: true },
    ],
  }),
})
```

### Pattern G: exchanges only

```typescript
export const B80_HardPorcelain = new MinorImprovement({
  id: 'B80_HardPorcelain',
  // ... other fields
  exchanges: [
    { from: { clay: 2 }, to: { stone: 1 }, trigger: 'anytime' },
    { from: { clay: 3 }, to: { stone: 2 }, trigger: 'anytime' },
  ],
})
```

---

## Task 1: ON_BUY Cards — A Deck (20 cards)

**Files:**
- Modify existing: `shared/cards/A/A1_Shelter.ts`, `A2_ShiftingCultivation.ts`, `A4_Baseboards.ts`, `A5_ClayEmbankment.ts`, `A6_StorageBarn.ts`, `A7_GardenersKnife.ts`, `A8_FoodBasket.ts`, `A9_YoungAnimalMarket.ts`, `A89_StablePlanner.ts`
- Create new: `A13_RenovationCompany.ts`, `A19_Handplow.ts`, `A33_BigCountry.ts`, `A36_FacadesCarving.ts`, `A44_PondHut.ts`, `A47_Trellises.ts`, `A57_MilkingParlor.ts`, `A69_LargeGreenhouse.ts`, `A117_WoodCarrier.ts`, `A125_Priest.ts`, `A135_AnimalReeve.ts`
- Modify: `shared/cards/catalog.ts` (add imports + register)

**Card list — read BGA PHP for each:**

| Card | BGA File | Pattern |
|---|---|---|
| A1_Shelter | `~/bga-agricola/modules/php/Cards/A/A1_Shelter.php` | onBuy: build 1 stable in 1-space pasture |
| A2_ShiftingCultivation | `A2_ShiftingCultivation.php` | onBuy: optional plow |
| A4_Baseboards | `A4_Baseboards.php` | onBuy: gain wood per rooms |
| A5_ClayEmbankment | `A5_ClayEmbankment.php` | onBuy: gain clay based on supply |
| A6_StorageBarn | `A6_StorageBarn.php` | onBuy: gain resources per majors |
| A7_GardenersKnife | `A7_GardenersKnife.php` | onBuy: gain food/grain per fields |
| A8_FoodBasket | `A8_FoodBasket.php` | onBuy: gain 1 grain + 1 veg |
| A9_YoungAnimalMarket | `A9_YoungAnimalMarket.php` | onBuy: gain 1 cattle (pay 1 sheep) |
| A13_RenovationCompany | `A13_RenovationCompany.php` | onBuy: gain resources + optional renovation |
| A19_Handplow | `A19_Handplow.php` | onBuy: plow action |
| A33_BigCountry | `A33_BigCountry.php` | onBuy: gain resources |
| A36_FacadesCarving | `A36_FacadesCarving.php` | onBuy: gain resources |
| A44_PondHut | `A44_PondHut.php` | onBuy: gain resources |
| A47_Trellises | `A47_Trellises.php` | onBuy: gain resources |
| A57_MilkingParlor | `A57_MilkingParlor.php` | onBuy: gain resources |
| A69_LargeGreenhouse | `A69_LargeGreenhouse.php` | onBuy: gain resources |
| A89_StablePlanner | `A89_StablePlanner.php` | onBuy: future meeples for stables |
| A117_WoodCarrier | `A117_WoodCarrier.php` | onBuy: gain resources |
| A125_Priest | `A125_Priest.php` | onBuy: gain resources |
| A135_AnimalReeve | `A135_AnimalReeve.php` | onBuy: gain resources |

- [ ] **Step 1:** For each card, read the BGA PHP file to understand its `onBuy()` logic
- [ ] **Step 2:** For cards WITH existing .ts files: add `registerCardEffect` with `onBuy` hook, remove `implemented: false` if present
- [ ] **Step 3:** For cards WITHOUT .ts files: create new file following Pattern B/C/D/E/F as appropriate
- [ ] **Step 4:** Add all new imports to `shared/cards/catalog.ts` and register in `minorImprovementCards` or `occupationCards` array
- [ ] **Step 5:** Run `npx tsc --noEmit` to verify no type errors
- [ ] **Step 6:** Commit

```bash
git add shared/cards/A/ shared/cards/catalog.ts
git commit -m "feat: implement A-deck onBuy cards (A1-A135, 20 cards)"
```

---

## Task 2: ON_BUY Cards — B Deck (31 cards)

**Files:**
- Modify existing: `B1_UpscaleLifestyle.ts`, `B2_MiniPasture.ts`, `B4_WoodPile.ts`, `B5_StoreofExperience.ts`, `B6_ExcursiontotheQuarry.ts`, `B7_Wage.ts`, `B8_MarketStall.ts`, `B9_BeatingRod.ts`, `B149_OpenAirFarmer.ts`
- Create new (30): `B14_Hawktower.ts`, `B20_ChainFloat.ts`, `B22_WalkingBoots.ts`, `B33_Mantlepiece.ts`, `B37_Grange.ts`, `B41_Hauberg.ts`, `B44_ChickStable.ts`, `B45_StrawberryPatch.ts`, `B46_ClubHouse.ts`, `B52_GrowingFarm.ts`, `B59_FoodChest.ts`, `B66_SackCart.ts`, `B71_HarvestHouse.ts`, `B73_GiftBasket.ts`, `B74_ThickForest.ts`, `B78_ReedBelt.ts`, `B84_AcornsBasket.ts`, `B88_EstablishedPerson.ts`, `B93_Confidant.ts`, `B96_TreeFarmJoiner.ts`, `B102_Consultant.ts`, `B105_CaseBuilder.ts`, `B113_PatchCaregiver.ts`, `B119_Lumberjack.ts`, `B123_RoofBallaster.ts`, `B125_EstateWorker.ts`, `B127_Seducer.ts`, `B141_FieldCaretaker.ts`, `B164_SheepWhisperer.ts`, `B167_StableSergeant.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1:** For each card, read `~/bga-agricola/modules/php/Cards/B/{ID}_{Name}.php` to get onBuy logic
- [ ] **Step 2:** Implement all cards following the patterns above
- [ ] **Step 3:** Register in catalog.ts
- [ ] **Step 4:** Run `npx tsc --noEmit`
- [ ] **Step 5:** Commit

```bash
git add shared/cards/B/ shared/cards/catalog.ts
git commit -m "feat: implement B-deck onBuy cards (31 cards)"
```

---

## Task 3: ON_BUY Cards — C Deck (22 cards)

**Files:**
- Modify existing: `C1_Overhaul.ts`, `C2_Stable.ts`, `C3_CarriageTrip.ts`, `C4_WritingBoards.ts`, `C5_Remodeling.ts`, `C6_StoneClearing.ts`, `C7_BladeShears.ts`, `C8_PlantFertilizer.ts`, `C9_AutomaticWaterTrough.ts`, `C156_HoofCaregiver.ts`
- Create new (12): `C16_FieldFences.ts`, `C38_Christianity.ts`, `C40_CanvasSack.ts`, `C44_ChickenCoop.ts`, `C47_GardenClaw.ts`, `C50_StableYard.ts`, `C65_Granary.ts`, `C72_FestivalPlanning.ts`, `C74_PrivateForest.ts`, `C77_ClaySupply.ts`, `C78_ReedHattedToad.ts`, `C79_StoneCart.ts`, `C83_EarlyCattle.ts`, `C108_Layabout.ts`, `C118_WoodCollector.ts`, `C127_Lover.ts`, `C136_RanchProvost.ts`, `C139_BasketmakersWife.ts`, `C161_PotatoDigger.ts`, `C165_GameCatcher.ts`, `C166_CattleWhisperer.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1-5:** Same process as Task 1 (read BGA → implement → register → tsc → commit)

```bash
git commit -m "feat: implement C-deck onBuy cards (22 cards)"
```

---

## Task 4: ON_BUY Cards — D Deck (17 cards)

**Files:**
- Modify existing: `D1_ZigzagHarrow.ts`, `D2_DwellingPlan.ts`, `D3_Furrows.ts`, `D4_CrossCutWood.ts`, `D6_PetrifiedWood.ts`, `D9_GameTrade.ts`, `D131_CraftsmanshipPromoter.ts` (7 have files)
- Create new (10): `D40_Cesspit.ts`, `D41_HorseDrawnBoat.ts`, `D43_Hutch.ts`, `D44_ForestWell.ts`, `D45_SheepWell.ts`, `D47_Churchyard.ts`, `D57_WholesaleMarket.ts`, `D62_BeerTap.ts`, `D67_ReapHook.ts`, `D69_SmallGreenhouse.ts`, `D78_ReedPond.ts`, `D91_Plowman.ts`, `D120_ClayDeliveryman.ts`, `D145_RoofExaminer.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1-5:** Same process

```bash
git commit -m "feat: implement D-deck onBuy cards (17 cards)"
```

---

## Task 5: ON_BUY Cards — E Deck (27 cards)

**Files:**
- Modify existing: `E1_PoleBarns.ts`, `E2_RenovationMaterials.ts`, `E3_TeaTime.ts`, `E5_NightLoot.ts`, `E6_Recount.ts`, `E7_Pumpernickel.ts`, `E8_FarmersMarket.ts`, `E9_BarteringHut.ts`, `E30_ChildsToy.ts`, `E36_HerbalGarden.ts`, `E76_LumberPile.ts`, `E78_SleightofHand.ts`, `E155_Visionary.ts`, `E159_OldMiser.ts` (14 have files)
- Create new (13): `E25_BumperCrop.ts`, `E41_MuddyWaters.ts`, `E42_WaterGully.ts`, `E43_BarnCats.ts`, `E44_FodderBeets.ts`, `E45_FruitLadder.ts`, `E46_WaterlilyPond.ts`, `E65_Almsbag.ts`, `E94_Prophet.ts`, `E97_Beneficiary.ts`, `E98_Prodigy.ts`, `E104_SpiceTrader.ts`, `E106_EmergencySeller.ts`, `E119_LandHeir.ts`, `E120_ScrapCollector.ts`, `E127_DiligentFarmer.ts`, `E138_LivestockExpert.ts`, `E139_BunnyBreeder.ts`, `E145_Parvenu.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1-5:** Same process

```bash
git commit -m "feat: implement E-deck onBuy cards (27 cards)"
```

---

## Task 6: Exchange + Score Cards (7 cards)

**Files:**
- Modify existing: `E153_StoneSculptor.ts` (has file)
- Create new: `B32_Kettle.ts`, `B80_HardPorcelain.ts`, `B104_SheepWalker.ts`, `C62_CookeryExtension.ts`, `D162_ClayFirer.ts`
- Modify existing: `B31_PotteryYard.ts` (score-only, if file exists) — check first
- Modify: `shared/cards/catalog.ts`

**Exchange details (from BGA):**

| Card | Type | Exchanges | Trigger |
|---|---|---|---|
| B32_Kettle | Minor | 1 grain→3 food, 3 grain→4 food+1vp, 5 grain→5 food+2vp | anytime |
| B80_HardPorcelain | Minor | 2 clay→1 stone, 3 clay→2 stone, 4 clay→3 stone | anytime |
| B104_SheepWalker | Occ | 1 sheep→1 pig/veg/stone (XOR) | anytime |
| C62_CookeryExtension | Minor | Doubles food output of existing cooking exchanges | harvest |
| D162_ClayFirer | Occ | 2 clay→1 stone, 3 clay→2 stone (+ onBuy: gain 2 clay) | anytime |
| E153_StoneSculptor | Occ | 1 stone→1 food+1vp | harvest |

**Note:** B32_Kettle and E153_StoneSculptor give VP via exchanges. Our `CardExchange` type may need `scoreCardId` or VP support. If not supported, implement the exchange and add a TODO comment for VP tracking. C62_CookeryExtension is complex (dynamically doubles other exchanges) — implement as a simplified version or skip with a comment.

- [ ] **Step 1:** Read BGA PHP for each card
- [ ] **Step 2:** Check if `CardExchange` type supports VP scoring (`scoreCardId`). If not, note limitation.
- [ ] **Step 3:** Implement simple exchange cards (B80, D162) — Pattern G
- [ ] **Step 4:** Implement B104_SheepWalker — uses XOR exchange choice
- [ ] **Step 5:** Implement E153, B32 with VP exchanges (best-effort with current type)
- [ ] **Step 6:** Implement B31_PotteryYard with `computeBonusScore`
- [ ] **Step 7:** Skip or simplify C62_CookeryExtension (complex dynamic exchange doubling)
- [ ] **Step 8:** Register in catalog.ts
- [ ] **Step 9:** Run `npx tsc --noEmit`
- [ ] **Step 10:** Commit

```bash
git commit -m "feat: implement exchange and score cards (7 cards)"
```

---

## Task 7: NO_LOGIC Data-Only Cards (up to 70 cards)

These cards have no BGA game logic — just card definitions (name, cost, VP, prerequisites). Many are 5+ player cards with `implemented=false` in BGA.

**Strategy:** For each card that doesn't have a `.ts` file:
1. Read the BGA PHP file to get: name, cost, VP, type (Minor/Occupation), prerequisites, `passing` flag, player count
2. Create a data-only `.ts` file (Pattern A)
3. Register in catalog.ts

**Cards to check/create (by deck):**

Cards listed in batch 1 NO_LOGIC: A10, A41, A85, A87, A106, B10, C10, D85, E16, plus any 5+ player cards that need data files.

For cards that ALREADY have files (A10, A41, A85, A87, A106, B10, C10, D85, E16): remove `implemented: false` flag since BGA also has no logic for them.

For 5+ player cards (A169-A180, B169-B180, C169-C180, D169-D180): create data files only if they have BGA PHP files with card definitions.

- [ ] **Step 1:** Check which NO_LOGIC cards already have `.ts` files vs need new files
- [ ] **Step 2:** For existing files: remove `implemented: false` if present
- [ ] **Step 3:** For cards without files: read BGA PHP, create data-only `.ts` file
- [ ] **Step 4:** Register all new cards in catalog.ts
- [ ] **Step 5:** Run `npx tsc --noEmit`
- [ ] **Step 6:** Commit

```bash
git commit -m "feat: add data-only card files (NO_LOGIC batch)"
```

---

## Task 8: Smoke Test + Verification

**Files:**
- Create: `server/__tests__/batch-onbuy-smoke.test.ts`

Write a batch smoke test that verifies all implemented onBuy cards work:

```typescript
import { describe, it, expect } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { createPlayer, createState } from './helpers'

// List all onBuy card IDs from batch 2
const ON_BUY_CARDS = [
  'A1_Shelter', 'A2_ShiftingCultivation', /* ... all 142 cards */
]

describe('Batch 2: onBuy cards smoke test', () => {
  for (const cardId of ON_BUY_CARDS) {
    it(`${cardId} has registered onBuy effect`, () => {
      const effect = getCardEffect(cardId)
      expect(effect).toBeDefined()
      expect(effect?.onBuy).toBeDefined()
    })

    it(`${cardId} onBuy returns a valid flow`, () => {
      const effect = getCardEffect(cardId)
      const player = createPlayer()
      const state = createState(player)
      const flow = effect!.onBuy!(state, player)
      // Flow should be undefined (no-op) or a valid ActionFlow
      if (flow) {
        expect(['leaf', 'seq', 'xor', 'or', 'parallel']).toContain(flow.type)
      }
    })
  }
})
```

- [ ] **Step 1:** Create the smoke test file with all implemented card IDs
- [ ] **Step 2:** Run `npm test` to verify all tests pass
- [ ] **Step 3:** Fix any failures (missing registrations, type errors, etc.)
- [ ] **Step 4:** Commit

```bash
git commit -m "test: add batch onBuy smoke test (171 cards)"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `docs/card_progress.md`

- [ ] **Step 1:** Update the overview table counts (已实现 Hook column)
- [ ] **Step 2:** Update the implemented card lists per deck
- [ ] **Step 3:** Mark batch 1 and 2 as complete in the recommendation table
- [ ] **Step 4:** Update test count
- [ ] **Step 5:** Commit

```bash
git commit -m "docs: update card_progress.md after batch 1+2 implementation"
```

---

## Execution Notes

### BGA Reference Lookup

For each card, the subagent should:
1. Read `~/bga-agricola/modules/php/Cards/{DECK}/{ID}_{Name}.php`
2. Look at the `onBuy()` method return value
3. Translate PHP node types to our ActionFlow types:
   - `gainNode([...])` → `{ type: 'leaf', actionId: 'gain', params: {...} }`
   - `['action' => PLOW]` → `{ type: 'leaf', actionId: 'plow' }`
   - `['action' => FENCING]` → `{ type: 'leaf', actionId: 'fencing' }`
   - `['action' => RENOVATION]` → `{ type: 'leaf', actionId: 'renovation' }`
   - `['action' => STABLES]` → `{ type: 'leaf', actionId: 'stables' }`
   - `NODE_SEQ` → `{ type: 'seq', children: [...] }`
   - `NODE_XOR` → `{ type: 'xor', children: [...] }`
   - `['optional' => true]` → add `optional: true` to the leaf
4. Check `isBuyable()` for prerequisites
5. Check constructor for `cost`, `vp`, `passing`, `exchanges`, `occupationPrerequisites`, `improvementPrerequisites`

### Card Categories

Use these categories in card definitions:
- `FOOD_GRAIN`, `FOOD_ANIMAL`, `FOOD_MISC` — food-related
- `RESOURCE_WOOD`, `RESOURCE_CLAY`, `RESOURCE_STONE`, `RESOURCE_REED` — building resources
- `FARM_PLANNER`, `FARM_BUILDER` — farm infrastructure
- `POINTS_PROVIDER` — VP scoring
- `ANIMAL_HANDLER` — animal management
- `ACTION_ENHANCER` — action improvements

Pick the best-fitting category based on the card's primary function.

### Parallelization

Tasks 1-5 (ON_BUY by deck) are independent and can be executed in parallel as separate subagents. Task 6 (exchanges) is independent. Task 7 (NO_LOGIC) is independent. Task 8-9 depend on all prior tasks completing.
