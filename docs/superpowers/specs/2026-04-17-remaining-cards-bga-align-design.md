# Remaining Cards BGA Alignment — Design Spec

**Date**: 2026-04-17
**Scope**: 5 card rewrites + 1 engine primitive + 6 verifications
**Deferred**: A25 Bassinet (cross-player first-space tracking), B30 WoodPalisades (alternative fence data model)

## Context

Batches 1–6 aligned 25 of ~40 rule-divergent cards with BGA reference. This spec covers the remaining cards that can be fixed with card-local rewrites or a single small engine addition.

## Phase 1: Engine Primitive — Harvest Exchange Trigger

### Problem

`CardExchange.trigger` supports `'anytime' | 'bake-bread'`. C59 SchnappsDistillery needs an exchange that only fires during the harvest feeding phase (1 vegetable → 5 food, max 1). Currently approximated with `'anytime'` which is too permissive.

### Changes

1. **`shared/cards/types.ts`**: Extend `CardExchange.trigger` union to `'anytime' | 'bake-bread' | 'harvest'`.

2. **`shared/actions/effects/exchange.ts`** (or `feed-family.ts`): When evaluating available exchanges during the feeding phase, include exchanges with `trigger: 'harvest'` alongside `'anytime'` trades. Non-feeding contexts must exclude `'harvest'` exchanges.

3. **`shared/actions/effects/feed-family.ts`**: Pass a phase flag or context so the exchange evaluator knows it's in feeding mode.

### Testing

- Unit test: `trigger: 'harvest'` exchange appears during feeding evaluation.
- Unit test: `trigger: 'harvest'` exchange does NOT appear in anytime exchange listing.

---

## Phase 2: Card Rewrites

### 2a. B27 Toolbox

**File**: `shared/cards/B/B27_Toolbox.ts`

**Current behavior**: After construct/stables, offers any `minor-improvement` action.

**BGA behavior**: After building at least 1 room, stable, or fence, the player can build one of 3 specific majors: `Major_Joinery`, `Major_Pottery`, or `Major_Basket` (paying full cost).

**Changes**:
- Replace `actionId: 'minor-improvement'` with an XOR of 3 improvement-any leaves, each filtered to a specific major ID via `actionContext: { allowedCards: [id] }`. If the engine doesn't support `allowedCards` filtering, use 3 separate `improvement-any` leaves with conditional `choiceLabelKey` and pre-check affordability.
- Add `'fencing'` to the listened actions array (currently only `construct` and `build-stables`).
- Remove `afterStablesListener` if `build-stables` is merged into `construct`; otherwise keep both + add fencing listener.

**Tests**: 
- After construct → XOR offers exactly Joinery/Pottery/Basket.
- After fencing → same XOR.
- Does not trigger on other actions.
- Affordable check: only shows majors the player can afford.

---

### 2b. C48 Farmstead

**File**: `shared/cards/C/C48_Farmstead.ts`

**Current behavior**: On buy, places 1 food on each of next 5 round spaces via `queueFutureMeeples`.

**BGA behavior**: After each turn in which the player makes at least 1 unused farmyard space "used" (via plow, construct rooms, build stables, fencing), gain 1 food.

**Changes**:
- Remove `onBuy` + `queueFutureMeeples` logic entirely.
- Add a `before` listener on `place-farmer` that snapshots the current count of "used farmyard tiles" (rooms + fields + pasture tiles + stable tiles) into `cardStates[CARD_ID].extraData.usedTilesBefore`.
- Add an `after` listener on `place-farmer` that computes current used-tile count and compares to snapshot. If increased, return `gainLeaf(CARD_ID, { food: 1 })`.
- Alternative (simpler): listen `after` on specific actions (`plow`, `construct`, `build-stables`, `fencing`) and always grant 1 food. This avoids snapshot logic but may double-fire if a single turn does plow + construct. BGA counts per-turn (not per-action), so snapshot approach is more accurate.

**Recommended approach**: Use before/after snapshot on `place-farmer`.

**Used tile count function**:
```typescript
const countUsedTiles = (player: PlayerState): number =>
  player.roomTiles.length +
  player.fields.length +
  player.stableTiles.length +
  new Set(player.pastures.flatMap(p => p.tiles?.map(t => `${t.row},${t.col}`) ?? [])).size
```

**Tests**:
- Plow a field in a turn → gain 1 food.
- Build a room → gain 1 food.
- Turn with no space change → no food.
- Multiple space changes in same turn → still only 1 food.

---

### 2c. C59 SchnappsDistillery

**File**: `shared/cards/C/C59_SchnappsDistillery.ts`

**Current behavior**: Only has `computeBonusScore` (5th/6th vegetable → 1/2 VP). Missing harvest exchange.

**BGA behavior**: During each feeding phase, can turn exactly 1 vegetable → 5 food (max 1 use per feeding). Plus the scoring.

**Changes**:
- Add `exchanges` array to card definition:
  ```typescript
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
  ]
  ```
- Requires Phase 1 engine primitive.

**Tests**:
- Exchange appears during feeding phase evaluation.
- Exchange does NOT appear in anytime exchange listing.
- Scoring logic unchanged (already correct).

---

### 2d. C69 LandConsolidation

**File**: `shared/cards/C/C69_LandConsolidation.ts`

**Current behavior**: Anytime once-per-round: pay 3 grain from supply → gain 1 vegetable to supply.

**BGA behavior**: Anytime (not once-per-round limited): if player has a grain field with exactly 3 sown grain, swap the field to 1 vegetable on the field. The grain/vegetable stay in the field, not supply.

**Changes**:
- Rewrite anytime listener handler:
  1. Find qualifying fields: `player.fields.filter(f => f.crop === 'grain' && f.remaining === 3)`.
  2. If none, return undefined (not available).
  3. If one: directly mutate field in the flow (or return a custom leaf action).
  4. If multiple: offer XOR choice of which field to swap.
  5. Swap logic: `field.crop = 'vegetable'`, `field.remaining = 1`.
- Remove the once-per-round flag logic (BGA has no round limit; it's naturally limited by having qualifying fields).
- Remove `payLeaf` / `gainLeaf` since no supply resources change.

**Implementation**: Use a custom leaf action `swap-field-crop` or inline the mutation in the listener's flow via a `special-effect` leaf that calls a method.

**Simpler alternative**: Keep as an anytime listener that directly mutates `player.fields` when triggered. Since the listener fires and returns a flow, we can use a `leaf` with `actionId: 'noop'` and do the mutation in the handler before returning. However, mutations in handlers are not standard practice — the engine expects mutations to happen via action execution, not in hook handlers.

**Recommended**: Use an existing pattern — return a seq with a custom `actionId: 'swap-field-grain-to-veg'` leaf. Register a new internal action that performs the swap. This is cleaner and testable.

**Tests**:
- Grain field with remaining=3 → swap to vegetable remaining=1.
- No qualifying field → action not available.
- Multiple qualifying fields → XOR choice.
- After swap, field shows crop='vegetable', remaining=1.

---

### 2e. D82 HuntingTrophy

**File**: `shared/cards/D/D82_HuntingTrophy.ts`

**Current behavior**: Costs 1 boar, on-buy gains 3 food, has anytime boar→4 food exchange. Entirely wrong card.

**BGA behavior**: 
- Cost: "Return or Cook 1 Wild Boar" (pay 1 pig, or cook 1 pig via an existing cooking improvement's pig exchange).
- Effect 1: Improvements built on **HouseRedevelopment** action space cost 1 building resource of player's choice less (choose: -1 wood, -1 clay, -1 stone, or -1 reed).
- Effect 2: Fences built on **FarmRedevelopment** action space cost a total of 3 wood less.
- VP: 1.

**Changes**:
- Remove `onBuy` food gain.
- Remove `exchanges` array (boar→food).
- Keep `cost: { boar: 1 }`. The "return or cook" distinction requires XOR pay which is complex; simplify to just paying 1 boar.
- Add `computeCosts` listener on actions related to improvement-building, filtering by action space ID for house-redevelopment. Return `{ costs: { [chosenResource]: -1 } }`. The "choice" aspect (which resource to discount) may need a choice mechanism or default to the most expensive resource.
- Add `computeCosts` listener on fencing, filtering by action space ID for farm-redevelopment. Return `{ costs: { wood: -3 } }`.
- Update `category` from `FOOD_PROVIDER` to `BUILDING_RESOURCE_PROVIDER` (matches BGA).

**Open question**: How to implement the "choice of which building resource to discount"? Options:
- (a) Always discount the most expensive resource in the cost (heuristic).
- (b) Add a `choiceCosts` return type that lets the engine present the discount choice to the player.
- (c) Return all 4 discount options and let the cost resolution pick the cheapest valid one.

**Recommendation**: (a) for now — pick whichever resource has the highest count in the cost. This matches common gameplay (you discount the resource you have least of = highest cost). Can be refined later.

**Tests**:
- computeCosts on house-redevelopment → reduces a building resource by 1.
- computeCosts on farm-redevelopment fencing → reduces wood by 3.
- No discount on other action spaces.
- Card definition: no exchanges, category is BUILDING_RESOURCE_PROVIDER.

---

## Phase 3: Verifications

| Card | Expected Result | Fix if Needed |
|---|---|---|
| E105 Pioneer | Correct (`roundActionOrder[round-1]` = BGA `getLastRevealed`). onBuy XOR + after-place-farmer XOR. | None |
| B26 AgrarianFences | Partial: offers fence-instead-of-sow but not fence-instead-of-bake. BGA wraps entire grain-utilization flow in XOR with fence options for both sub-actions. | Add `computeReplace` on bake-bread within grain-utilization context |
| C35 LanternHouse | Scoring correct. Missing buy-time prereq: `occupationPrerequisites: { max: 0 }`. | Add prereq if missing |
| C39 StudioBoat | PlayerActionCard with food accumulation + owner VP. `players: '1-3'` filter matches BGA's `<4 players` check. | Verify only |
| C46 Mandoline | Functionally correct (pay veg → VP + future food). Flag order differs but same net effect. | None |
| D14 HammerCrusher | `before renovate-house` when clay: grants 2 clay + 1 reed + optional construct. | Verify BGA parity |

---

## Deferred (separate future specs)

- **A25 Bassinet**: Needs global `GameState.firstNonAccumulatingSpaceUsed` field, cross-player tracking on every `place-farmer`, and `canUseOccupied` for the tracked space. Substantial engine addition.
- **B30 WoodPalisades**: Needs alternative fence-tile data model where 2-wood tiles replace fence pieces at board edges. Touches fencing action, pasture calculation, and scoring.

---

## Summary

| Phase | Items | New files | Modified files |
|---|---|---|---|
| 1. Engine | harvest trigger | 0 | 3 (types.ts, exchange.ts, feed-family.ts) |
| 2. Cards | 5 rewrites | 0 | 5 card files |
| 3. Verify | 6 checks | 0 | 0-2 card files (B26, C35 if fixes needed) |
| Tests | ~25 new tests | 1-2 test files | 0-1 existing test files |
