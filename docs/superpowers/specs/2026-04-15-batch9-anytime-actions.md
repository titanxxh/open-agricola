# Batch 9 Spec: Anytime Actions (22 Cards)

## Goal

Implement 22 cards that provide **anytime actions** — abilities players can activate during their turn outside the normal action flow. All use the existing `phases: ['anytime']` CardListener infrastructure.

## Card Inventory

| # | Card ID | Name | Type | Sub-type | BGA Pattern |
|---|---------|------|------|----------|-------------|
| 1 | A153 | Pig Owner | Occ | Passive threshold | `onPlayerAtAnytime` animal check |
| 2 | B35 | Hook Knife | Minor | Passive threshold | `onPlayerAtAnytime` animal check |
| 3 | B154 | Sheep Keeper | Occ | Passive threshold | `onPlayerAtAnytime` + `isBuyable` |
| 4 | C143 | Stone Buyer | Occ | Per-round pay→gain | `onBuy` + `onPlayerAtAnytime` flag |
| 5 | C101 | Stall Holder | Occ | Per-round pay→gain | `onPlayerAtAnytime` flag + dynamic gain |
| 6 | C46 | Mandoline | Minor | Per-round pay→gain | `onPlayerAtAnytime` + futureMeeples |
| 7 | C64 | Corn Schnapps Distillery | Minor | Per-round pay→gain | `onPlayerAtAnytime` + futureMeeples |
| 8 | D46 | Pellet Press | Minor | Per-round pay→gain | `onPlayerAtAnytime` + futureMeeples |
| 9 | C84 | Perennial Rye | Minor | Per-round breed | `onPlayerAtAnytime` + XOR breed |
| 10 | C85 | Den Builder | Occ | One-time room | `onPlayerAtAnytime` flag + room on card |
| 11 | C87 | Mason | Occ | One-time room | `onBuy` + conditional construct |
| 12 | D87 | Master Builder | Occ | One-time room | conditional construct |
| 13 | A71 | Clearing Spade | Minor | Field select | SPECIAL_EFFECT 2-step field |
| 14 | C18 | Roll-Over Plow | Minor | Field select | SPECIAL_EFFECT discard+plow |
| 15 | D71 | Changeover | Minor | Field select | SPECIAL_EFFECT discard+sow |
| 16 | C53 | Gypsy's Crock | Minor | Cooking hook | Exchange monitor → bonus food |
| 17 | D56 | Fatstock Stretcher | Minor | Cooking hook | Exchange monitor → bonus food |
| 18 | C115 | Sower | Occ | Multi-event | after:MajorImprovement + anytime XOR |
| 19 | D124 | Emissary | Occ | Multi-event | anytime XOR (unique goods) |
| 20 | E85 | Master Tanner | Occ | Multi-event | Exchange hook + quantity + room |
| 21 | E91 | Plow Builder | Occ | Multi-event | Exchange hook (Joinery) + plow |
| 22 | D129 | Lumber Virtuoso | Occ | Harvest anytime | Harvest flag + build action |

---

## Sub-type 1: Passive Threshold Checks (3 cards)

### Pattern

Anytime listener fires on every anytime check. If animal count meets threshold AND card is not flagged, grant one-time bonus (VP + optional resources), then flag card permanently.

BGA also implements `enforceReorganizeOnLastHarvest` to force a reorg prompt in the last harvest so animals get placed optimally to trigger the check. We skip this for now — it's a UX optimization, not a rule requirement.

### A153 — Pig Owner (Occupation, 4+)

**Effect:** The first time after you play this card that you have 5 pigs on your farm, you immediately get 3 bonus points.

**Implementation:**
- Anytime listener: check `player.resources.boar >= 5` (boar includes all pig locations)
- Actually need total pig count across all zones — use animal counting from pastures + house + stables
- Wait, in our model `player.resources.boar` is NOT the placed count. Need to count from zones.

**Correction — Animal counting approach:**
In our model, animals on the farm are tracked in zones (pastures, house, stables), but `player.resources.sheep/boar/cattle` reflects the total count including placed animals. Checking `player.resources.boar >= 5` is correct.

- Guard: `isCardFlagged(context.player, CARD_ID)` → return
- Guard: `context.player.resources.boar < 5` → return
- Flow: `bonus-vp` ×3 + `flag-card`
- Label: `cards.A153_PigOwner.anytime`

### B35 — Hook Knife (MinorImprovement, cost: 1 wood)

**Effect:** Once this game, when you have 9/8/7/6/5/5 sheep (for 1/2/3/4/5/6 players), you immediately get 2 bonus points.

**Implementation:**
- Need player count: `context.state.players.length`
- Threshold array: `[9, 8, 7, 6, 5, 5]` indexed by `playerCount - 1`
- Guard: `isCardFlagged` + `resources.sheep < threshold`
- Flow: `bonus-vp` ×2 + `flag-card`

### B154 — Sheep Keeper (Occupation, 4+)

**Effect:** Can only play if you have < 7 sheep. Once this game, when you have 7 sheep, you immediately get 3 bonus points and 2 food.

**Implementation:**
- **Purchase restriction:** Need `prerequisite: "Less Than 7 Sheep"` or custom `isBuyable` check. The existing prerequisite parser doesn't support "Less Than N Animal" pattern. Options:
  - (a) Add new prerequisite string pattern `"Less Than N Sheep"` to prerequisites.ts
  - (b) Use a card listener on `before:PlayOccupation` to block
  - (c) Add `maxAnimals` field to card definition
  - **Decision:** Use approach (a) — add `"Less Than N Sheep/Boar/Cattle"` pattern. Minimal change, reusable.
- Anytime listener: `resources.sheep >= 7` → 3 VP + 2 food + flag
- Flow: `bonus-vp` ×3 + `gainLeaf(CARD_ID, { food: 2 })` + `flag-card`

---

## Sub-type 2: Per-Round Pay → Gain (5 cards)

### Pattern

Once per round, player can pay resources to get something. Flag on use, unflag at `onBeforeStartOfTurn`. Identical to D122_ClayCarrier pattern.

### C143 — Stone Buyer (Occupation, 3+)

**Effect:**
- **onBuy:** Immediately buy exactly 2 stone for 1 food (flag card to prevent anytime in same round).
- **Anytime (once per round):** Pay 2 food → gain 1 stone.

**Implementation:**
- `onBuy`: `payLeaf({cost: {food: 1}})` + `gainLeaf({stone: 2})` + `flag-card`
  - Actually BGA just flags and exchanges directly. We need a seq flow for onBuy.
  - onBuy returns: `{ type: 'seq', children: [payLeaf({food:1}), gainLeaf({stone:2}), {actionId:'flag-card'}] }`
- `onBeforeStartOfTurn`: reset flag
- Anytime listener: guard food >= 2, guard !flagged → pay 2 food, gain 1 stone, flag

### C101 — Stall Holder (Occupation, 1+)

**Effect:** Once per round, if you have unfenced stables, pay 2 grain → gain 1 bonus point and (unfenced_stables + 1) food.

**Implementation:**
- Need unfenced stable count. Use pattern from animals.ts: filter `player.stableTiles` excluding those inside pastures.
- Guard: !flagged, grain >= 2, unfencedStableCount defined
- Dynamic food gain: `unfencedStableCount + 1`
- Flow: pay 2 grain → bonus-vp ×1 + gain {food: computed} + flag

**Note:** The food amount is dynamic based on stable count at execution time. The listener handler computes it and injects into the flow.

### C46 — Mandoline (MinorImprovement, cost: 1 wood)

**Effect:** Once per round, pay 1 vegetable → gain 1 bonus point and place 1 food on each of the next 2 round spaces.

**Implementation:**
- Guard: !flagged, vegetable >= 1
- Flow: pay 1 veg → bonus-vp ×1 + `queueFutureMeeplesFlow(state, {cardId, playerId, startRound: state.round+1, count: 2, resources: {food: 1}})` + flag
- **Problem:** The anytime listener handler doesn't have access to `state` in the same way as `onBuy`. Actually, `CardListenerContext` extends `ActionExecutionContext` which includes `state`. So `context.state` is available.
- Need to return a flow that queues future meeples. The `queueFutureMeeplesFlow` returns an ActionFlow leaf. Include it in the seq.
- Actually, `queueFutureMeeplesFlow(state, request)` modifies state AND returns a flow. But we need the flow to execute during the engine step, not during handler evaluation. The handler should return a flow that, when executed, will queue the future meeples.
- **Solution:** Use `{ type: 'leaf', actionId: 'queue-future-meeples', params: { cardId, startRound, count, resources }, sourceCard: CARD_ID }` if such an action exists. Otherwise, inline the state modification in a custom action.
- Looking at `queueFutureMeeplesFlow`: it directly calls `queueFutureMeeples(state, request)` AND returns a leaf `{ type: 'leaf', actionId: 'resolve-future-meeples' }`. So calling it in the handler IS correct — it queues at handler time and the flow leaf resolves them.
- **Revised approach:** Call `queueFutureMeeples(context.state, {...})` inside the handler, then include `{ type: 'leaf', actionId: 'resolve-future-meeples', sourceCard: CARD_ID }` in the flow children.

### C64 — Corn Schnapps Distillery (MinorImprovement, VP: 1, cost: 1 wood + 2 clay)

**Effect:** Once per round, pay 1 grain → place 1 food on each of the next 4 round spaces.

**Implementation:** Same as C46 but: cost = 1 grain, no VP bonus, count = 4 rounds.

### D46 — Pellet Press (MinorImprovement, cost: 2 clay, prereq: 2 Occupations)

**Effect:** Once per round, pay 1 reed → place 1 food on each of the next 4 round spaces.

**Implementation:** Same as C64 but: cost = 1 reed instead of grain.

---

## Sub-type 3: Per-Round Breed (1 card)

### C84 — Perennial Rye (MinorImprovement, cost: 1 food, prereq: 2 Occupations)

**Effect:** Each round that does not end with a harvest, you can pay 1 grain to breed exactly 1 type of animal. (This is not considered a breeding phase.)

**Implementation:**
- This is an anytime action but only available in non-harvest rounds.
- Guard: !flagged, grain >= 1, current round is NOT a harvest round
  - Harvest rounds: 4, 7, 9, 11, 13, 14 (standard game)
  - Check: `!state.harvestRounds?.includes(state.round)` or equivalent
- XOR choice for animal type: sheep, boar, cattle — only types where player has ≥ 2
- Flow: pay 1 grain → XOR(breed sheep / breed boar / breed cattle) → flag
- After breeding, need animal reorg (the new animal needs placement)
- Each XOR child: gain 1 of that animal type + trigger reorg

**Note on "not a harvest round":** BGA checks `isHarvestRound()`. In our codebase, harvest rounds are determined by game state. Need to find or implement this check.

---

## Sub-type 4: One-Time Room on Card (3 cards)

### C85 — Den Builder (Occupation, 1+)

**Effect:** When you live in a clay or stone house, you can pay 1 grain and 2 food. If you do, for the rest of the game, this card provides room for exactly one person.

**Implementation:**
- Guard: !flagged, houseType !== 'wood', grain >= 1, food >= 2
- Flow: pay {grain:1, food:2} + flag
- After flagging, the card should provide +1 room capacity for family growth
- Need `onComputeAnimalZones`-like mechanism for rooms, or simpler: just add a rooms modifier
- BGA sets a global "DenBuilderRoom" flag. In our system, we can use `computeBonusScore` to not affect rooms but instead affect family capacity check.
- **Simplest approach:** Register a card effect hook that modifies room capacity calculation. If the card is flagged, `player.rooms` effectively +1 for family growth checks.
- This needs integration with the family growth system. For now, the flag is set; the family growth code needs to check for this card's flag.

### C87 — Mason (Occupation, 1+)

**Effect:** Place a stone room on this card when you play it. Once you have a stone house with at least 4 rooms, at any time, you can add that room without paying building resources.

**Implementation:**
- `onBuy`: Store 1 "room" resource on card via `writeCardExtraData(player, CARD_ID, 'hasRoom', true)`
- Guard: !flagged, houseType === 'stone', rooms >= 4, hasRoom on card
- Flow: flag + trigger construct action with zero cost
- **Challenge:** Need to invoke the construct room flow but bypass payment. This is complex — the room needs a valid farm position.
- BGA creates a CONSTRUCT node with overridden costs. We need the same: inject a construct flow that skips resource payment.
- **Approach:** Return flow with `{ type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { freeBuild: true, roomType: 'stone' } }` and modify construct action to check `freeBuild` context.

### D87 — Master Builder (Occupation, 1+)

**Effect:** Once your house has at least 5 rooms, at any time, but only once this game, you can add another room at no cost.

**Implementation:**
- Guard: !flagged, rooms >= 5
- Flow: flag + construct with free build
- Same approach as C87 but no stored room and no house type requirement.

**Infrastructure needed for C87/D87:** The `construct` action must support a `freeBuild` flag in `actionContext` to skip resource payment. This is a small extension to `construct.ts`.

---

## Sub-type 5: Field Selection SPECIAL_EFFECT (3 cards)

### A71 — Clearing Spade (MinorImprovement, cost: 1 wood)

**Effect:** At any time, you can move 1 crop from a planted field containing at least 2 crops to an empty field.

**Implementation:**
- This requires TWO field selections: source (≥2 crops) then target (empty field with no crop).
- **Approach:** Two sequential `field-select` actions:
  1. First: `fieldFilter: 'has-2-plus-crops'`, `maxSelections: 1`, `fieldEffect: 'select-source'`
  2. Second: `fieldFilter: 'empty-field'`, `maxSelections: 1`, `fieldEffect: 'move-crop-from-source'`
  - The second step needs to know the source field. Use `cardStates.extraData.selectedSource` to pass between steps.
- **field-select.ts extensions needed:**
  - New filter: `has-2-plus-crops` (fields with remaining >= 2)
  - New filter: `empty-field` (fields with no crop, i.e., plowed but empty)
  - New effect: `move-crop-to-target` — reads source from extraData, moves 1 crop
- **Alternative approach:** Create a dedicated action `move-crop` that handles the full 2-step interaction internally. This avoids overloading field-select.
- **Decision:** Dedicated action is cleaner for 2-step. But only A71 uses it. Use sequential field-selects with extraData passing.

### C18 — Roll-Over Plow (MinorImprovement, cost: 2 wood)

**Effect:** At any time, if you have at least 3 planted fields, you can discard all goods from one of those fields to plow 1 field.

**Implementation:**
- Guard: 3+ planted fields (fields with crop !== null && remaining > 0)
- Flow: field-select (planted field, maxSelections: 1, effect: `discard-all-crops`) → plow action
- **field-select.ts extension:** New effect `discard-all-crops` — sets `remaining = 0`, `crop = null`
- After discarding, trigger a plow action: `{ type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: false }`
- The plow action is already defined and handles field placement UI.

### D71 — Changeover (MinorImprovement, no cost)

**Effect:** At any time, if a field contains exactly 1 good as a result of a harvest, you can discard that good and immediately take a Sow action limited to that field.

**Implementation:**
- This triggers DURING harvest (after field harvest phase), when fields have been reaped down.
- Guard: at least 1 field with `remaining === 1` (post-harvest)
- Flow: field-select (fields with exactly 1 remaining, effect: `discard-single-crop`) → sow action limited to that field
- **Challenge:** The sow action needs to be limited to ONLY the selected field. Standard sow lets player choose any empty field.
- **Approach:** After field-select discards the crop (setting remaining=0, crop=null), the field becomes empty and sowable. Then trigger sow with `actionContext: { limitedToFields: [selectedFieldKey] }`.
- **sow extension needed:** Support `limitedToFields` in actionContext to restrict which fields can be sown.
- BGA marks fields with a "harvested" flag. In our system, we need to track which fields were just harvested this phase. This may need a small extension.

---

## Sub-type 6: Cooking/Exchange Hooks (2 cards)

### C53 — Gypsy's Crock (MinorImprovement, VP: 1, cost: 2 clay)

**Effect:** Each time you use a cooking improvement to turn 2 goods into food at the same time, you get 1 additional food.

**Implementation:**
- This monitors the `anytime-exchange` action. When the player cooks 2+ goods in a single exchange batch, grant bonus food.
- **Approach:** Register an `after:anytime-exchange` listener that counts how many goods were converted to food in this exchange batch.
- BGA tracks "pairs cooked" — every 2 individual items converted counts as 1 pair, granting 1 food per pair.
- **Example:** Converting 3 sheep (at 2 food each) = 3 goods → 1 pair (floor(3/2)) → 1 bonus food.
- Need to intercept the exchange result and count distinct non-food items converted.
- **Challenge:** The exchange action processes bulk trades. We need to hook `after` the exchange and count what was traded.
- **Approach:** Use `after:anytime-exchange` listener. In the handler, read `context.extraData` or `context.result` to see what was exchanged. If the exchange system doesn't expose this, we need to snapshot resources before and diff after.
- **Simpler approach:** Register `before:anytime-exchange` to snapshot animal/goods counts, then `after:anytime-exchange` to diff. Compute pairs, set flag with bonus amount, and provide an anytime action to collect the bonus.
- This is the BGA approach: `checkPairIsCooked()` runs during exchange, counts pairs, flags card with bonus. Then `onPlayerAtAnytime()` grants the accumulated bonus.

### D56 — Fatstock Stretcher (MinorImprovement, cost: 1 wood)

**Effect:** Each time you turn a sheep or pig into food using a cooking improvement, you get 1 additional food.

**Implementation:**
- Similar to C53 but simpler: count each individual sheep or pig converted.
- `before:anytime-exchange` → snapshot sheep + boar counts
- `after:anytime-exchange` → compute decrease in sheep + boar → bonus food = total decrease
- Flag card with bonus amount, provide anytime to collect

**Infrastructure needed for C53/D56:**
- Both cards need `before:anytime-exchange` and `after:anytime-exchange` listeners
- Both accumulate a bonus during exchange, then provide an anytime action to collect it
- The `anytime-exchange` action needs to support `before`/`after` phase listeners (check if it already does)

---

## Sub-type 7: Multi-Event + Anytime (5 cards)

### C115 — Sower (Occupation, 1+)

**Effect:**
- Each time you build a major improvement, place 1 reed from general supply on this card.
- At any time, you can move the reed to your supply or exchange it for a Sow action.

**Implementation:**
- **Listener 1:** `after:PlayMajorImprovement` or similar — add 1 reed to card counter
  - Use `writeCardExtraData(player, CARD_ID, 'reedCount', current + 1)`
  - Also update infobox: `writeCardInfobox(player, CARD_ID, \`${count} Reed\`)`
- **Listener 2:** `phases: ['anytime']` — XOR: take reed OR sow
  - Guard: reedCount > 0
  - Option A: gain 1 reed + decrement counter
  - Option B: decrement counter + sow action
- Flow: `{ type: 'xor', children: [takeReedFlow, sowFlow] }`

### D124 — Emissary (Occupation, 1+, newSet)

**Effect:** At any time, you can place a good from your supply on this card to get 1 stone. You must place different goods. (Food is also a good.)

**Implementation:**
- 10 good types: wood, clay, reed, stone, food, grain, vegetable, sheep, boar, cattle
- Track which goods are already on card via `readCardExtraData(player, CARD_ID, 'placedGoods')` — array of resource names
- Guard: at least 1 good type not yet placed AND player has that good
- XOR with one option per available good type:
  - Each option: pay 1 of that good + gain 1 stone + add good to `placedGoods` array
- Dynamic XOR — options depend on what's already been placed
- Infobox shows placed goods count

### E85 — Master Tanner (Occupation, 1+)

**Effect:** For each pig or cattle you turn into food, you can place 1 of that food on this card. While its food equals your number of rooms, this card provides room for 1 person.

**Implementation:**
- **Listener 1:** `after:anytime-exchange` — detect pig/cattle→food conversions, flag with count
- **Listener 2:** `phases: ['anytime']` — when flagged, offer to place food on card
  - Flow: XOR for each unit of food to place (or quantity choice)
  - Decrement player food, increment card food counter
- **Room provision:** When `cardFoodCount === player.rooms`, card provides +1 room capacity
  - Hook into family growth capacity check
- Very complex — multiple hooks, state tracking, room capacity modification

### E91 — Plow Builder (Occupation, 1+)

**Effect:** You can build the Joinery when taking a Minor Improvement action. If you use the Joinery (or upgrade) during the harvest, you can pay 1 food to plow 1 field.

**Implementation:**
- **Listener 1:** `after:anytime-exchange` during harvest — detect Joinery usage
  - Check if Joinery (Major_Joinery) was used in the exchange
  - Flag card with `usedJoinery: true`
- **Listener 2:** `phases: ['anytime']` — when `usedJoinery` is flagged
  - Guard: food >= 1
  - Flow: pay 1 food + plow action
- **Listener 3:** `onEndHarvestFeedingPhase` — reset both flags
- Additional: "Can build Joinery during Minor Improvement" — this is a `computeReplace` or `computeArgs` hook that adds Joinery to minor improvement options. Complex.

### D129 — Lumber Virtuoso (Occupation, 3+)

**Effect:** Each harvest in which you have at least 5 wood, you can discard down to 5 wood to take a Build Stables or Build Wood Rooms action by paying the usual costs.

**Implementation:**
- **Listener 1:** `onStartHarvest` — if wood >= 5, flag card (make anytime available during harvest)
- **Listener 2:** `phases: ['anytime']` — when flagged during harvest
  - Guard: wood >= 5
  - Flow: discard (wood - 5) wood → XOR(build stables / build wood rooms)
  - Each option triggers the corresponding build action with normal costs
- **Listener 3:** `onAfterHarvest` — unflag card

---

## Infrastructure Extensions Required

### 1. Prerequisite parser extension (for B154)
- File: `shared/cards/helpers/prerequisites.ts`
- Add pattern: `"Less Than N Sheep"` / `"Less Than N Boar"` / `"Less Than N Cattle"`

### 2. field-select new effects (for A71, C18, D71)
- File: `shared/actions/effects/field-select.ts`
- New filters: `has-2-plus-crops`, `empty-plowed-field`, `has-exactly-1-crop`
- New effects: `discard-all-crops`, `discard-single-crop`, `move-crop-to-target`

### 3. construct freeBuild support (for C87, D87)
- File: `shared/actions/effects/construct.ts`
- Support `actionContext.freeBuild: true` to skip resource payment

### 4. Future meeples in anytime handlers (for C46, C64, D46)
- Pattern: call `queueFutureMeeples()` in handler, include `resolve-future-meeples` leaf in flow

### 5. Exchange event monitoring (for C53, D56, E85, E91)
- Need `before:anytime-exchange` and `after:anytime-exchange` listeners to track resource changes during cooking

### 6. Room capacity from cards (for C85, E85)
- Need mechanism for cards to contribute to room/family capacity
- Could extend family growth check to query card flags

---

## Recommended Implementation Order

| Wave | Cards | Count | Dependencies |
|------|-------|-------|-------------|
| 1 | A153, B35, B154 | 3 | Prereq extension (B154 only) |
| 2 | C143, C101 | 2 | None — pure D122 pattern |
| 3 | C46, C64, D46 | 3 | Future meeples pattern |
| 4 | C84 | 1 | Breed + XOR + harvest round check |
| 5 | C85, C87, D87 | 3 | Construct freeBuild, room capacity |
| 6 | A71, C18, D71 | 3 | field-select extensions |
| 7 | C53, D56 | 2 | Exchange monitoring |
| 8 | C115, D124 | 2 | Multi-event patterns |
| 9 | E85, E91, D129 | 3 | Most complex — exchange hooks + action nesting |

Total: 9 waves, ~22 cards. Waves 1-4 (9 cards) can be done in one plan. Waves 5-9 (13 cards) need a second plan due to infrastructure extensions.

---

## Scope Decision

**Plan A (this plan):** Waves 1-4 = 9 cards (A153, B35, B154, C143, C101, C46, C64, D46, C84)
- All are straightforward anytime listeners with minor infra needs
- Estimated: ~15 tasks, ~2-3 hours

**Plan B (separate plan):** Waves 5-9 = 13 cards
- Require field-select extensions, construct modifications, exchange monitoring, room capacity
- Each sub-type needs its own infrastructure work first

This spec covers all 22 cards. The first implementation plan will cover Plan A (9 cards).
