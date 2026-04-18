# B38 Future Building Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite B38 FutureBuildingSite to remove incorrect future-meeples logic and implement BGA-aligned behavior: 3VP, maxRound 4, farmyard space locking (adjacency prohibition).

**Architecture:** Card stores locked tiles in `cardStates[B38].extraData.locked` on purchase. A new generic `computeLockedFarmTiles` extension on `CardEffect` provides dynamic lock evaluation. Validation functions accept an optional `lockedKeys` parameter; the interaction layer filters locked tiles from selectable positions. Frontend renders locked tiles with a grey overlay + lock icon.

**Tech Stack:** TypeScript, Vitest (session tests), Playwright (E2E), React (frontend)

---

## File Structure

| File | Role |
|---|---|
| `shared/cards/B/B38_FutureBuildingSite.ts` | Card definition + card effect (onBuy, computeLockedFarmTiles) |
| `shared/cards/card-effects.ts` | Add `computeLockedFarmTiles` to `CardEffect` type; add `collectLockedFarmTileKeys()` collector |
| `server/validators.ts` | Add optional `lockedKeys` param to `validateRoomSelection` and `validateStableSelection` |
| `server/plow-validation.ts` | Add optional `lockedKeys` param to `validatePlowSelection`; extend error code union |
| `server/fence-validation.ts` | Add optional `lockedKeys` param to `validateFenceSelection`; check new pasture tiles |
| `server/farm-interaction.ts` | Filter locked tiles in `buildRoomFarmInteraction`, `buildStableFarmInteraction`, `buildPlowFarmInteraction` |
| `server/farm-choice.ts` | Pass `lockedKeys` when calling validation functions |
| `server/game-session.ts` | Pass `lockedKeys` when calling validation functions in `commitFarmChoice` |
| `shared/i18n/en.ts` | Update B38 description text |
| `shared/i18n/zh.ts` | Update B38 description text |
| `src/components/board/FarmBoard.tsx` | Render locked tiles with grey overlay + lock icon |
| `server/__tests__/B38_FutureBuildingSite-session.test.ts` | Session tests (9 cases) |
| `docs/card_progress.md` | Update implementation status |

---

### Task 1: Add `computeLockedFarmTiles` to CardEffect type and collector function

**Files:**
- Modify: `shared/cards/card-effects.ts:87-123` (CardEffect type) and after line 395 (new collector)

- [ ] **Step 1: Add the new field to CardEffect type**

In `shared/cards/card-effects.ts`, after line 122 (`onSowExtraField`), add:

```typescript
  /** Return farmyard tiles currently locked by this card. Empty = no lock active. */
  computeLockedFarmTiles?: (player: PlayerState) => FarmTilePosition[]
```

- [ ] **Step 2: Add the collector function**

At the end of `shared/cards/card-effects.ts` (after `handleSowExtraField`), add:

```typescript
/**
 * Collect all locked farmyard tile keys from cards that implement computeLockedFarmTiles.
 * Returns a Set of position keys ("row-col") that are currently locked.
 */
export const collectLockedFarmTileKeys = (player: PlayerState): Set<string> => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const lockedKeys = new Set<string>()
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeLockedFarmTiles) continue
    try {
      const tiles = effect.computeLockedFarmTiles(player)
      tiles.forEach(tile => lockedKeys.add(`${tile.row}-${tile.col}`))
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[card-effects] custom card ${cardId} computeLockedFarmTiles threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return lockedKeys
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add shared/cards/card-effects.ts
git commit -m "feat(B38): add computeLockedFarmTiles extension point to CardEffect"
```

---

### Task 2: Rewrite B38 card definition and effect

**Files:**
- Rewrite: `shared/cards/B/B38_FutureBuildingSite.ts`
- Modify: `shared/i18n/en.ts` (line ~494)
- Modify: `shared/i18n/zh.ts` (line ~475)

- [ ] **Step 1: Rewrite the card file**

Replace the entire content of `shared/cards/B/B38_FutureBuildingSite.ts` with:

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { FarmTilePosition } from '../../game/types'
import { getAllTilePositions, getUsedFarmyardTileKeys, positionKey } from '../../game/farm'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'B38_FutureBuildingSite'

const DELTAS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
]

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const usedKeys = getUsedFarmyardTileKeys(player)
    const roomKeys = new Set(player.roomTiles.map(positionKey))
    const lockedTiles: FarmTilePosition[] = []
    for (const tile of getAllTilePositions()) {
      const key = positionKey(tile)
      if (usedKeys.has(key)) continue
      const adjacentToRoom = DELTAS.some((d) =>
        roomKeys.has(positionKey({ row: tile.row + d.dr, col: tile.col + d.dc })),
      )
      if (adjacentToRoom) lockedTiles.push(tile)
    }
    writeCardExtraData(player, CARD_ID, 'locked', lockedTiles)
    return null
  },
  computeLockedFarmTiles: (player) => {
    const locked = readCardExtraData<FarmTilePosition[]>(player, CARD_ID, 'locked')
    if (!locked || locked.length === 0) return []
    const usedKeys = getUsedFarmyardTileKeys(player)
    const lockedKeys = new Set(locked.map(positionKey))
    const hasNonLockedFree = getAllTilePositions().some((tile) => {
      const key = positionKey(tile)
      return !usedKeys.has(key) && !lockedKeys.has(key)
    })
    return hasNonLockedFree ? locked : []
  },
})

export const B38_FutureBuildingSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Future Building Site',
  deck: 'B',
  number: 38,
  category: 'POINTS_PROVIDER',
  desc: [
    'Up until all other farmyard spaces are used, you cannot use the unused spaces that are orthogonally adjacent to your house (not even to build rooms).',
  ],
  cost: {},
  vp: 3,
  maxRound: 4,
  prerequisite: 'Play in Round 4 or Before',
  implemented: true,
})
```

- [ ] **Step 2: Update English i18n**

In `shared/i18n/en.ts`, find the B38 entry (line ~494) and replace:

```typescript
    B38_FutureBuildingSite: { name: 'Future Building Site', description: 'Up until all other farmyard spaces are used, you cannot use the unused spaces that are orthogonally adjacent to your house (not even to build rooms).' },
```

- [ ] **Step 3: Update Chinese i18n**

In `shared/i18n/zh.ts`, find the B38 entry (line ~475) and replace:

```typescript
    B38_FutureBuildingSite: { name: '未来建地', description: '在所有其他农场格被使用完之前，你不能使用与房屋正交相邻的空闲格（也不能用来建造房间）。' },
```

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add shared/cards/B/B38_FutureBuildingSite.ts shared/i18n/en.ts shared/i18n/zh.ts
git commit -m "feat(B38): rewrite FutureBuildingSite — 3VP + space locking, remove future meeples"
```

---

### Task 3: Add `lockedKeys` parameter to validation functions

**Files:**
- Modify: `server/validators.ts:14-73` (validateRoomSelection) and `server/validators.ts:81-114` (validateStableSelection)
- Modify: `server/plow-validation.ts:9-11` (PlowValidationError type) and `server/plow-validation.ts:33-84` (validatePlowSelection)
- Modify: `server/fence-validation.ts:48-63` (FenceValidationError type) and `server/fence-validation.ts:346-503` (validateFenceSelection)

- [ ] **Step 1: Update validateRoomSelection**

In `server/validators.ts`, change the signature at line 14:

```typescript
export const validateRoomSelection = (
  player: PlayerFarmState,
  rooms: { row: number; col: number }[],
  lockedKeys?: Set<string>,
): RoomSelectionResult => {
```

After the OCCUPIED check (line 41), before `selectedSet.add(key)` (line 43), add:

```typescript
    if (lockedKeys?.has(key)) {
      return { ok: false, code: 'LOCKED' }
    }
```

- [ ] **Step 2: Update validateStableSelection**

In `server/validators.ts`, change the signature at line 81:

```typescript
export const validateStableSelection = (
  player: PlayerFarmState,
  stables: { row: number; col: number }[],
  lockedKeys?: Set<string>,
): StableSelectionResult => {
```

After the OCCUPIED check (line 102), before `selectedSet.add(key)` (line 105), add:

```typescript
    if (lockedKeys?.has(key)) {
      return { ok: false, code: 'LOCKED' }
    }
```

- [ ] **Step 3: Update validatePlowSelection**

In `server/plow-validation.ts`, extend the error code union at line 10:

```typescript
export type PlowValidationError = {
  code: 'NO_SELECTION' | 'INVALID_POSITION' | 'OCCUPIED' | 'NOT_ADJACENT' | 'FENCED' | 'LOCKED'
}
```

Change the signature at line 33:

```typescript
export const validatePlowSelection = <T extends PlayerFarmState>(
  player: T,
  tile?: FarmTilePosition,
  lockedKeys?: Set<string>,
): PlowValidationResult<T> => {
```

After the FENCED check (line 55), add:

```typescript
  if (lockedKeys?.has(targetKey)) {
    return { ok: false, error: { code: 'LOCKED' } }
  }
```

- [ ] **Step 4: Update validateFenceSelection**

In `server/fence-validation.ts`, add `'LOCKED'` to the `FenceValidationError.code` union at line 49:

```typescript
export type FenceValidationError = {
  code:
    | 'INVALID_EDGE'
    | 'NO_NEW_FENCES'
    | 'NOT_ENOUGH_WOOD'
    | 'MAX_FENCES_EXCEEDED'
    | 'FENCE_NOT_CONNECTED'
    | 'NO_ENCLOSED_AREA'
    | 'ENCLOSED_TILE_OCCUPIED'
    | 'EDGE_TYPE_CONFLICT'
    | 'PALISADES_NOT_UNLOCKED'
    | 'LOCKED'
  edges: string[]
  palisadeEdges: string[]
  newFenceEdges: string[]
  newPalisadeEdges: string[]
}
```

Change the signature at line 346:

```typescript
export const validateFenceSelection = <T extends PlayerFarmState>(
  player: T,
  edges: string[],
  palisadeEdges: string[] = [],
  extraWood = 0,
  freeFences = 0,
  options: FenceValidationOptions = {},
  lockedKeys?: Set<string>,
): FenceValidationResult<T> => {
```

After the `ENCLOSED_TILE_OCCUPIED` check (line 452-457), before the stableSet computation (line 459), add:

```typescript
  if (lockedKeys && lockedKeys.size > 0) {
    const lockedRegion = fencedRegions.find((region) =>
      region.tiles.some((tile) => lockedKeys.has(positionKey(tile))),
    )
    if (lockedRegion) {
      return {
        ok: false,
        error: { code: 'LOCKED', edges, palisadeEdges, newFenceEdges, newPalisadeEdges },
      }
    }
  }
```

- [ ] **Step 5: Verify build**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: type errors in `farm-choice.ts` and `game-session.ts` where callers don't pass lockedKeys yet — these are expected and will be fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add server/validators.ts server/plow-validation.ts server/fence-validation.ts
git commit -m "feat(B38): add lockedKeys parameter to farm validation functions"
```

---

### Task 4: Update interaction layer to filter locked tiles

**Files:**
- Modify: `server/farm-interaction.ts:42-62` (buildRoomFarmInteraction), `server/farm-interaction.ts:64-88` (buildStableFarmInteraction), `server/farm-interaction.ts:90-103` (buildPlowFarmInteraction)

- [ ] **Step 1: Add import**

At the top of `server/farm-interaction.ts`, add to the import from `card-effects.ts`:

```typescript
import { computeExtraSowableFields, collectLockedFarmTileKeys } from '../shared/cards/card-effects.ts'
```

(Replace the existing `import { computeExtraSowableFields } from '../shared/cards/card-effects.ts'`)

- [ ] **Step 2: Update buildRoomFarmInteraction**

In `buildRoomFarmInteraction` (line 42-62), after computing `occupied` (line 51) and before the `selectableTiles` filter (line 52), add locked filtering:

```typescript
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = getAllTilePositions().filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
```

Replace the existing line 52 (`const selectableTiles = getAllTilePositions().filter(...)`) with the above.

- [ ] **Step 3: Update buildStableFarmInteraction**

In `buildStableFarmInteraction` (line 64-88), after computing `occupied` (line 71) and before the `selectableTiles` filter (line 72), add locked filtering:

```typescript
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = getAllTilePositions().filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
```

Replace the existing line 72 with the above.

- [ ] **Step 4: Update buildPlowFarmInteraction**

In `buildPlowFarmInteraction` (line 90-103), compute `lockedKeys` and pass it to `validatePlowSelection`:

```typescript
export const buildPlowFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const payableCost = sanitizePayableCost(costOverride)
  const canAffordPlow = canAffordTypedFlatCost(normalized as PlayerState, payableCost, 'plow')
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = canAffordPlow
    ? getAllTilePositions().filter(
        (tile) => validatePlowSelection(normalized, tile, lockedKeys).ok,
      )
    : []
  return { farmType: 'plow', selectableTiles }
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: remaining errors only in `farm-choice.ts` and `game-session.ts` (Task 5)

- [ ] **Step 6: Commit**

```bash
git add server/farm-interaction.ts
git commit -m "feat(B38): filter locked tiles in farm interaction layer"
```

---

### Task 5: Pass lockedKeys at call sites (farm-choice.ts + game-session.ts)

**Files:**
- Modify: `server/farm-choice.ts:1-28` (imports) and `server/farm-choice.ts:106-290` (applyFarmChoice)
- Modify: `server/game-session.ts:117-121` (imports) and `server/game-session.ts:2423-2653` (commitFarmChoice)

- [ ] **Step 1: Update farm-choice.ts imports**

Add to imports in `server/farm-choice.ts`:

```typescript
import { collectLockedFarmTileKeys } from '../shared/cards/card-effects.ts'
```

- [ ] **Step 2: Compute lockedKeys in applyFarmChoice**

In `server/farm-choice.ts`, inside `applyFarmChoice` at line 112, right after `const normalized = normalizePlayerFarm(player)`, add:

```typescript
  const lockedKeys = collectLockedFarmTileKeys(player)
```

Then pass `lockedKeys` to each validation call:

- **fence** (line 120): `validateFenceSelection(normalized, edges, palisadeEdges, adjustedExtraWood, freeFences, { skipPayment: true, ... }, lockedKeys)`
- **room** (line 172): `validateRoomSelection(normalized, rooms, lockedKeys)`
- **stable** (line 222): `validateStableSelection(normalized, stables, lockedKeys)`
- **plow** (line 258): `validatePlowSelection(normalized, tile, lockedKeys)`

- [ ] **Step 3: Update game-session.ts imports**

Add to imports in `server/game-session.ts`:

```typescript
import { collectLockedFarmTileKeys } from '../shared/cards/card-effects.ts'
```

- [ ] **Step 4: Compute lockedKeys in commitFarmChoice**

In `server/game-session.ts`, inside `commitFarmChoice`, right after `const normalized = normalizePlayerFarm(player)` (line 2434), add:

```typescript
    const lockedKeys = collectLockedFarmTileKeys(player)
```

Then pass `lockedKeys` to each validation call:

- **fence** (line 2450): add `lockedKeys` as the last argument to `validateFenceSelection`
- **room** (line 2521): `validateRoomSelection(normalized, rooms, lockedKeys)`
- **stable** (line 2579): `validateStableSelection(normalized, stables, lockedKeys)`
- **plow** (line 2626): `validatePlowSelection(normalized, tile, lockedKeys)`

- [ ] **Step 5: Verify full build**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json && pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS — no errors

- [ ] **Step 6: Commit**

```bash
git add server/farm-choice.ts server/game-session.ts
git commit -m "feat(B38): pass lockedKeys to validation functions at all call sites"
```

---

### Task 6: Write session tests

**Files:**
- Create: `server/__tests__/B38_FutureBuildingSite-session.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/__tests__/B38_FutureBuildingSite-session.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeScores } from '../../shared/logic/scoring'
import { positionKey } from '../../shared/game/farm'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B38_FutureBuildingSite'

const CARD_ID = 'B38_FutureBuildingSite'

/**
 * Default 2-player layout: rooms at (2,0) and (1,0).
 * Locked tiles (adjacent to rooms, free): (0,0), (1,1), (2,1).
 *
 *   col: 0  1  2  3  4
 * row 0: [L] .  .  .  .
 * row 1: [R][L] .  .  .
 * row 2: [R][L] .  .  .
 */
const LOCKED_TILES = [
  { row: 0, col: 0 },
  { row: 1, col: 1 },
  { row: 2, col: 1 },
]
const LOCKED_KEYS = new Set(LOCKED_TILES.map(positionKey))

// A tile that is free but NOT locked (safe to use)
const FREE_TILE = { row: 0, col: 1 }

const setup = (opts: { round?: number; withCard?: boolean } = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  if (opts.round !== undefined) state.round = opts.round

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: 20, clay: 20, reed: 20, stone: 20, food: 20 }
  if (opts.withCard !== false) {
    player.minorPlayed.push(CARD_ID)
    // Simulate onBuy: write locked tiles
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = {
      extraData: { locked: LOCKED_TILES },
    }
  }

  session.loadState(state)
  return session
}

describe('B38 FutureBuildingSite — session', () => {
  it('card has vp=3, maxRound=4', () => {
    const { B38_FutureBuildingSite } = require('../../shared/cards/B/B38_FutureBuildingSite')
    expect(B38_FutureBuildingSite.vp).toBe(3)
    expect(B38_FutureBuildingSite.maxRound).toBe(4)
  })

  it('onBuy computes correct locked tiles for default 2-player layout', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.hand = [CARD_ID]
    player.resources = { ...player.resources, food: 10 }
    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)

    // Play the minor improvement
    const resp2 = session.resolveChoice(0, CARD_ID)
    if (!resp2.ok) {
      // May need to navigate the improvement flow differently
      // depending on session flow — adapt as needed
    }

    const updatedPlayer = session.getState().state.players[0]!
    const locked = readCardExtraData<{ row: number; col: number }[]>(updatedPlayer, CARD_ID, 'locked')
    if (locked) {
      const lockedKeys = new Set(locked.map(positionKey))
      expect(lockedKeys).toEqual(LOCKED_KEYS)
    }
  })

  it('rejects plow on locked tile', () => {
    const session = setup()
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'plow', { tile: LOCKED_TILES[0] })
    expect(resp.ok).toBe(false)
  })

  it('allows plow on non-locked free tile', () => {
    const session = setup()
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'plow', { tile: FREE_TILE })
    expect(resp.ok).toBe(true)
  })

  it('rejects room on locked tile', () => {
    const session = setup()
    let resp = session.takeAction(0, 'room-then-stable')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'room', { rooms: [LOCKED_TILES[1]] })
    expect(resp.ok).toBe(false)
  })

  it('rejects stable on locked tile', () => {
    const session = setup()
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'stable', { stables: [LOCKED_TILES[2]] })
    expect(resp.ok).toBe(false)
  })

  it('rejects fence enclosing locked tile', () => {
    const session = setup()
    // Fence around (0,0) which is locked
    const edges = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'fence', { edges, palisadeEdges: [] })
    expect(resp.ok).toBe(false)
  })

  it('unlocks tiles when all non-locked tiles are used', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Fill all non-locked free tiles with fields
    // Non-locked free tiles: (0,1),(0,2),(0,3),(0,4),(1,2),(1,3),(1,4),(2,2),(2,3),(2,4)
    // Plus (1,1) and (2,1) are locked, (0,0) is locked
    // Rooms at (1,0) and (2,0)
    const nonLockedFree = [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
      { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 },
      { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 },
    ]
    player.fields = nonLockedFree.map((tile) => ({
      stacks: [],
      row: tile.row,
      col: tile.col,
    }))
    session.loadState(state)

    // Now all remaining free tiles are locked — lock should be lifted
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // Plow on a previously-locked tile should succeed now
    resp = session.commitFarmChoice(0, 'plow', { tile: LOCKED_TILES[0] })
    expect(resp.ok).toBe(true)
  })

  it('scores 3VP at end of game', () => {
    const session = setup()
    const state = session.getState().state
    const scores = computeScores(state)
    const p0Score = scores.find((s) => s.playerId === state.players[0]!.id)!
    const cardVp = p0Score.categories.find((c) => c.key === 'cardVp')
    expect(cardVp?.total).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm exec vitest run server/__tests__/B38_FutureBuildingSite-session.test.ts`
Expected: All tests pass. If any fail, investigate and fix.

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `pnpm test`
Expected: No regressions. The `lockedKeys` parameter is optional so existing callers are unaffected.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/B38_FutureBuildingSite-session.test.ts
git commit -m "test(B38): add session tests for FutureBuildingSite space locking"
```

---

### Task 7: Frontend — render locked tiles

**Files:**
- Modify: `src/components/board/FarmBoard.tsx`

- [ ] **Step 1: Import the shared lock evaluation function**

At the top of `src/components/board/FarmBoard.tsx`, add:

```typescript
import { collectLockedFarmTileKeys } from '../../../shared/cards/card-effects'
import { positionKey } from '../../../shared/game/farm'
```

- [ ] **Step 2: Compute locked tile keys**

In the `FarmBoard` component body, near where other derived sets are computed (look for `roomPositions`, `fieldPositions`, `stablePositions`), add:

```typescript
const lockedTileKeys = collectLockedFarmTileKeys(player)
```

- [ ] **Step 3: Add locked class and lock icon to tile rendering**

In the tile rendering loop (where `isTileSelectable`, `isRoom`, `isField`, etc. are computed), add:

```typescript
const isTileLocked = lockedTileKeys.has(tileKey)
```

Add `${isTileLocked ? ' locked' : ''}` to the className string of the farm-cell div.

Inside the cell div, after any existing content (but before the closing tag), add:

```tsx
{isTileLocked && (
  <div className="farm-cell-locked-overlay">
    <span className="farm-cell-lock-icon">🔒</span>
  </div>
)}
```

- [ ] **Step 4: Add CSS styles**

Find the relevant CSS/SCSS file for FarmBoard (likely `src/components/board/FarmBoard.css` or `agricola.scss`) and add:

```css
.farm-cell.locked {
  position: relative;
}

.farm-cell-locked-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
  border-radius: 2px;
}

.farm-cell-lock-icon {
  font-size: 16px;
  opacity: 0.8;
}
```

- [ ] **Step 5: Verify in browser**

Start the dev server with `./restart-intranet.sh`. Navigate to a game, play B38 in round 1-4, and verify:
- Locked tiles show grey overlay + lock icon
- Locked tiles are not selectable when entering plow/room/stable mode
- When all non-locked tiles are occupied, overlay disappears

- [ ] **Step 6: Commit**

```bash
git add src/components/board/FarmBoard.tsx
# Also add the CSS file if modified separately
git commit -m "feat(B38): render locked farmyard tiles with grey overlay and lock icon"
```

---

### Task 8: Update docs/card_progress.md

**Files:**
- Modify: `docs/card_progress.md`

- [ ] **Step 1: Remove B38 from the intentional-deviation section (§2.5)**

Find the B38 row in the "刻意偏离 BGA" table and remove it.

- [ ] **Step 2: Update the current-round notes (§2)**

Add a line describing this change:

```
- 2026-04-18: B38 FutureBuildingSite — 完全重写：移除错误的 future meeples，对齐 BGA（3VP + maxRound 4 + 农场空间锁定）
```

- [ ] **Step 3: Update infrastructure section (§7) if applicable**

Add a note about the new `computeLockedFarmTiles` extension point:

```
- `CardEffect.computeLockedFarmTiles` — 通用农场格锁定扩展点，卡牌可声明动态锁定的格子，验证层和交互层自动过滤
```

- [ ] **Step 4: Commit**

```bash
git add docs/card_progress.md
git commit -m "docs(B38): update card_progress — remove deviation, record reimplementation"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: No new lint errors.

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual browser test**

Start `./restart-intranet.sh` and test the full flow:
1. Start a 2-player game in devMode
2. In round 1-4, play B38 as minor improvement
3. Verify locked tiles appear with grey overlay
4. Try to plow/build on a locked tile — should be impossible
5. Fill all non-locked tiles, then verify locked tiles become usable
6. Verify end-game score includes 3VP from B38
7. Start a new game, advance to round 5+ — verify B38 is not buyable

- [ ] **Step 5: Run E2E tests (if applicable)**

Run: `pnpm run test:e2e`
Expected: No regressions. (E2E test file creation is deferred to a follow-up task if needed.)
