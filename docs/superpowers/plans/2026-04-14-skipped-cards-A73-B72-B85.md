# Skipped Cards (A73, B72, B85) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 3 previously skipped P5 cards that each need small infrastructure extensions: A73_AgriculturalFertilizers (newUsedSpaces tracking), B72_LoveforAgriculture (sow in pastures), B85_FarmHand (special stable as room).

**Architecture:** Each card requires a targeted hook or context extension. A73 needs `newUsedSpaces` count in listener event data. B72 needs `onComputeSowableFields` + `onComputeHarvestFields` hooks. B85 needs a special stable type that provides room capacity.

**Tech Stack:** TypeScript, GameSession, CardEffect/CardListener, Vitest.

---

### Task 1: A73_AgriculturalFertilizers — newUsedSpaces tracking

**BGA behavior:** After using Plow/Construct/Fencing/Stables, if 2+ unused farmyard spaces became used in that one action, get an optional Sow action.

**Gap:** Listener `after` phase context doesn't include how many new spaces were used. We need to count tiles before and after the action.

**Files:**
- Create: `shared/cards/A/A73_AgriculturalFertilizers.ts`
- Create: `server/__tests__/A73_AgriculturalFertilizers-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Implement A73 using a before+after pattern**

Instead of modifying core actions, use a two-listener approach:
1. A `before` phase listener on `plow`/`construct`/`fencing`/`stables` that snapshots the current used-space count into `cardStates.extraData.spacesBefore`
2. An `after` phase listener on the same actions that counts current used spaces, compares with snapshot, and returns optional sow if diff >= 2

Used-space count helper (reuse existing pattern from `room-payment.ts`):
```typescript
const countUsedSpaces = (player: PlayerState): number => {
  const occupied = new Set<string>()
  player.roomTiles.forEach((t) => occupied.add(positionKey(t)))
  player.fields.forEach((f) => occupied.add(positionKey({ row: f.row, col: f.col })))
  player.stableTiles.forEach((t) => occupied.add(positionKey(t)))
  player.pastures.flatMap((p) => p.tiles).forEach((t) => occupied.add(positionKey(t)))
  return occupied.size
}
```

Before listener: snapshot count into extraData.
After listener: compare, return optional sow flow if diff >= 2.

For the double-plow edge case (A20, C19): use flag-card. Before-plow sets flag if it's a double-plow card, after-plow only triggers sow on the second plow when flag is set.

Simplified approach: skip the double-plow edge case initially. Single plow adds 1 space (never >= 2 alone), so plow only triggers after construct/fencing/stables by default.

- [ ] **Step 2: Write session test**

Test: play A73, then build 2 rooms (construct), verify optional sow is offered.
Test: play A73, build 1 room, verify sow is NOT offered.
Test: play A73, build 2 stables, verify sow is offered.

- [ ] **Step 3: Run tests**

Run: `timeout 30 npx vitest run server/__tests__/A73_AgriculturalFertilizers-session.test.ts`

- [ ] **Step 4: Register in catalog.ts, commit**

```
feat: implement A73_AgriculturalFertilizers (sow after 2+ spaces used)
```

---

### Task 2: B72_LoveforAgriculture — sow crops in pastures

**BGA behavior:** You can sow crops in pastures of size 1 or 2. Sown pastures hold 1/2 fewer animals respectively. Pastures with crops are considered fields for harvesting.

**Gap:** Sow action's `getEmptyFields()` only looks at `player.fields`. Need a hook to add eligible pastures as sowable fields. Reap needs to harvest from sown pastures too.

**Files:**
- Create: `shared/cards/B/B72_LoveforAgriculture.ts`
- Create: `server/__tests__/B72_LoveforAgriculture-session.test.ts`
- Modify: `shared/cards/card-effects.ts` — add `onComputeSowableFields` and `onComputeHarvestFields` hooks
- Modify: `shared/actions/effects/sow.ts` — call hook to extend field list
- Modify: `shared/actions/effects/reap.ts` — call hook to extend field list
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Add hooks to CardEffect**

In `shared/cards/card-effects.ts`, add to the `CardEffect` type:
```typescript
onComputeSowableFields?: (player: PlayerState, fields: SowableField[]) => void
onComputeHarvestFields?: (player: PlayerState, fields: HarvestField[]) => void
```

Add runner functions (same pattern as `onComputeAnimalZones`):
```typescript
export const runComputeSowableFieldsHooks = (state: GameState, player: PlayerState, fields: SowableField[]) =>
  runComputeHookForAllCards(state, player, 'onComputeSowableFields', fields)

export const runComputeHarvestFieldsHooks = (state: GameState, player: PlayerState, fields: HarvestField[]) =>
  runComputeHookForAllCards(state, player, 'onComputeHarvestFields', fields)
```

The `SowableField` and `HarvestField` types should match the existing `Field` type from `PlayerState` — or be a simple extension. Check `shared/game/types.ts` for the `Field` type.

- [ ] **Step 2: Call hooks in sow.ts and reap.ts**

In `sow.ts`, modify `getEmptyFields()` or the sow action's execute to call the hook after building the initial field list, allowing cards to append additional sowable locations.

In `reap.ts`, modify `reap()` to call the hook after building the harvest field list, allowing cards to include pasture-fields.

- [ ] **Step 3: Implement B72_LoveforAgriculture**

```typescript
registerCardEffect({
  id: CARD_ID,
  onComputeSowableFields: (player, fields) => {
    // Add eligible pastures (size 1-2) without existing crops as sowable
    player.pastures
      .filter(p => p.tiles.length <= 2)
      .filter(p => !hasCropsInPasture(player, p))
      .forEach(p => fields.push(pastureToField(p)))
  },
  onComputeHarvestFields: (player, fields) => {
    // Add pastures WITH crops as harvestable
    player.pastures
      .filter(p => p.tiles.length <= 2)
      .filter(p => hasCropsInPasture(player, p))
      .forEach(p => fields.push(pastureToField(p)))
  },
  onComputeAnimalZones: (player, zones) => {
    // Reduce capacity of sown pastures
    for (const zone of zones) {
      if (zone.zoneType === 'pasture' && hasCropsInPasture(player, findPasture(player, zone.id))) {
        zone.capacity = Math.max(0, zone.capacity - pastureSize)
      }
    }
  },
})
```

The tricky part: storing crops "on a pasture" requires either extending the Pasture type to hold crop data, or using `cardStates.extraData` to map pasture IDs to crop state.

Simplest approach: store sown-pasture crops in `cardStates[CARD_ID].extraData.pastureCrops: Record<string, { crop: string, remaining: number }>` keyed by pasture ID. The hooks read this data. Sow writes to it, reap reads/decrements it.

This requires the sow action's resolveChoice to check if the chosen "field" is actually a pasture-field and handle storage differently. This is the main complexity — sow.ts would need a small hook or check.

- [ ] **Step 4: Write session tests**

Test: play B72, sow grain in a size-1 pasture.
Test: harvest from sown pasture.
Test: sown pasture has reduced animal capacity.

- [ ] **Step 5: Run tests, commit**

```
feat: implement B72_LoveforAgriculture (sow in pastures)
```

---

### Task 3: B85_FarmHand — special stable providing room capacity

**BGA behavior:** Once per game, during Build Stables, if you have 4 fields in a 2x2 pattern, you can build a special stable in the center. This stable provides room for 1 person but NOT for animals.

**Gap:** No concept of "special stable" that acts as a room. Need a way to mark a stable as room-providing.

**Files:**
- Create: `shared/cards/B/B85_FarmHand.ts`
- Create: `server/__tests__/B85_FarmHand-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Design the special stable**

Approach: Don't modify the stable system. Instead:
1. Track the Farm Hand stable position in `cardStates[CARD_ID].extraData.pos: { row, col }`
2. Use a `computeArgs` listener on `stables` to add the Farm Hand option
3. After building, increment `player.familySize` (room capacity) by 1 via a card effect
4. Use `onComputeAnimalZones` to exclude this stable from animal capacity

The 2x2 field detection helper:
```typescript
const find2x2FieldCenters = (player: PlayerState): { row: number, col: number }[] => {
  const fieldSet = new Set(player.fields.map(f => positionKey({ row: f.row, col: f.col })))
  const centers: { row: number, col: number }[] = []
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const tl = positionKey({ row: r, col: c })
      const tr = positionKey({ row: r, col: c + 1 })
      const bl = positionKey({ row: r + 1, col: c })
      const br = positionKey({ row: r + 1, col: c + 1 })
      if (fieldSet.has(tl) && fieldSet.has(tr) && fieldSet.has(bl) && fieldSet.has(br)) {
        // Center is between 4 fields — use a fractional or pick one corner
        // BGA places stable at center of 2x2, but our grid is integer-based
        // Simplification: place stable at top-left position of 2x2 block
        centers.push({ row: r, col: c })
      }
    }
  }
  return centers
}
```

**Simplification vs BGA:** BGA places the stable at the geometric center of the 2x2 (which is between tiles). Our grid is integer-based. Place the Farm Hand stable on an empty adjacent tile instead, or store it as a virtual position in cardStates only (not in stableTiles).

Actually, re-reading BGA: the stable IS placed on a farmyard tile (the center of 2x2 in their grid maps to an actual tile). In our 3x5 grid, a 2x2 block of fields at (0,0),(0,1),(1,0),(1,1) could have the stable at... well, there's no center tile. The stable goes ON one of the 2x2 tiles in BGA's implementation.

**Better approach:** Store the Farm Hand stable position in extraData. It's virtual — not in `stableTiles`. A `computeBonusScore`-like mechanism adds 1 to room count. Use `onComputeAnimalZones` to add a card zone with 0 animal capacity.

The once-per-game flag uses `isCardFlagged`.

- [ ] **Step 2: Implement B85_FarmHand**

This card's complexity is high. The core logic:
1. `computeArgs` listener on `stables`: if not flagged and 4 fields in 2x2, add candidate positions
2. After stables action: if player chose the Farm Hand option, flag card, store position, apply room bonus
3. `onComputeAnimalZones`: exclude Farm Hand stable from zones

Due to the UI complexity (choosing between normal stables and Farm Hand stables in the same action), this may need to be implemented as a separate action flow or XOR choice rather than modifying the stables action itself.

- [ ] **Step 3: Write session tests**

Test: player has 4 fields in 2x2, plays B85, builds stables — Farm Hand option available.
Test: after Farm Hand built, player has +1 room capacity.
Test: Farm Hand stable does NOT provide animal capacity.
Test: can only use once per game.

- [ ] **Step 4: Run tests, commit**

```
feat: implement B85_FarmHand (special stable as room)
```

---

## Implementation Order

1. **Task 1: A73** — Smallest change, self-contained two-listener pattern
2. **Task 2: B72** — Medium change, needs 2 new hooks in card-effects + sow/reap
3. **Task 3: B85** — Largest change, needs UI integration with stables action

## Risk Assessment

- **A73**: Low risk. Two-listener pattern is proven (similar to before/after hooks). Skip double-plow edge case for now.
- **B72**: Medium risk. Modifying sow.ts and reap.ts affects core game flow. Need careful testing.
- **B85**: High risk. The 2x2 detection + virtual stable + room capacity is novel. May need simplification.
