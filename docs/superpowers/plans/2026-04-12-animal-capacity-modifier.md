# Animal Capacity Modifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `onComputeAnimalZones` hook to CardEffect so cards can modify animal zone capacities. Implement A12_DrinkingTrough as first consumer.

**Architecture:** New `computeAnimalZones(player)` function in `animals.ts` builds base zones then applies card hooks. All existing capacity consumers (`getTotalAnimalCapacity`, `enforceAnimalCapacity`, `buildAnimalReorgZones`, `getPastureCapacities`, `confirmAnimalReorg`) switch to using `computeAnimalZones`. A12_DrinkingTrough adds +2 capacity to every pasture zone.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-12-animal-capacity-modifier-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `shared/actions/effects/animals.ts` | Modify | Add `AnimalZone` type + `computeAnimalZones()`, update `getTotalAnimalCapacity` + `enforceAnimalCapacity` |
| `shared/cards/card-effects.ts` | Modify | Add `onComputeAnimalZones` to `CardEffect` type |
| `server/game-session.ts` | Modify | Update `buildAnimalReorgZones`, `getPastureCapacities`, `confirmAnimalReorg` to use `computeAnimalZones` |
| `shared/cards/A/A12_DrinkingTrough.ts` | Create | Card definition + `registerCardEffect` with `onComputeAnimalZones` |
| `shared/cards/__tests__/animal-capacity-modifier.test.ts` | Create | Tests for computeAnimalZones, A12 effect, getTotalAnimalCapacity |

---

## Task 1: Add AnimalZone type + computeAnimalZones function + tests

**Files:**
- Modify: `shared/actions/effects/animals.ts`
- Modify: `shared/cards/card-effects.ts`
- Create: `shared/cards/__tests__/animal-capacity-modifier.test.ts`

- [ ] **Step 1: Add onComputeAnimalZones to CardEffect type**

In `shared/cards/card-effects.ts`, add after `computeBonusScore` (line 93):

```typescript
onComputeAnimalZones?: (player: PlayerState, zones: AnimalZone[]) => void
```

Also add the import at the top:
```typescript
import type { AnimalZone } from '../actions/effects/animals'
```

- [ ] **Step 2: Add AnimalZone type and computeAnimalZones function**

In `shared/actions/effects/animals.ts`, add the type BEFORE existing exports:

```typescript
export type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  capacity: number
  animalType?: string | null
  animalCount?: number
  cardId?: string
  pastureIndex?: number
}
```

Add `computeAnimalZones` function. It needs to import `getCardEffect` from card-effects. To avoid circular dependency (card-effects imports AnimalZone from animals), use a lazy import pattern OR import only the type from card-effects and pass the hook runner as a parameter.

Best approach: define `computeAnimalZones` to accept the player and internally call `getCardEffect` for each played card:

```typescript
import { getCardEffect } from '../../cards/card-effects'

export const computeAnimalZones = (player: PlayerState): AnimalZone[] => {
  const blocked = getBlockedPastureId(player)
  const zones: AnimalZone[] = [
    ...player.pastures.map((pasture, index) => ({
      id: pasture.id,
      zoneType: 'pasture' as const,
      capacity: getPastureCapacity(pasture, blocked),
      animalType: pasture.animalType ?? null,
      animalCount: pasture.animalCount,
      pastureIndex: index,
    })),
    {
      id: 'house',
      zoneType: 'house' as const,
      capacity: 1,
      animalType: player.houseAnimalType ?? null,
      animalCount: player.houseAnimalCount ?? 0,
    },
    ...getLooseStableKeys(player).map((key) => ({
      id: `stable:${key}`,
      zoneType: 'stable' as const,
      capacity: 1,
      animalType: (player.stableAnimals?.[key] as string) ?? null,
      animalCount: player.stableAnimals?.[key] ? 1 : 0,
    })),
  ]
  const allCards = [
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
    ...(player.improvements ?? []),
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onComputeAnimalZones) {
      effect.onComputeAnimalZones(player, zones)
    }
  }
  return zones
}
```

IMPORTANT: Check if `getCardEffect` is already exported from `card-effects.ts`. If importing from `card-effects.ts` creates a circular dependency (since `card-effects.ts` now imports `AnimalZone` from `animals.ts`), resolve by:
- Moving the `AnimalZone` type to a separate types file, OR
- Having `card-effects.ts` use `import type` (which doesn't create runtime circular deps)

Since `card-effects.ts` only imports the TYPE `AnimalZone` (not a value), `import type` avoids circular deps at runtime.

- [ ] **Step 3: Write tests**

Create `shared/cards/__tests__/animal-capacity-modifier.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { computeAnimalZones, getTotalAnimalCapacity } from '../../actions/effects/animals'
import type { PlayerState, Pasture } from '../../game/types'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
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
    ...overrides,
  }) as PlayerState

const makePasture = (id: string, size: number, stables = 0): Pasture =>
  ({ id, size, stables, tiles: [], animalType: null, animalCount: 0 }) as Pasture

describe('computeAnimalZones', () => {
  it('returns base zones without cards', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 1)],
    })
    const zones = computeAnimalZones(player)
    // 2 pastures + 1 house = 3 zones
    expect(zones.length).toBe(3)
    expect(zones[0]).toMatchObject({ id: 'p1', zoneType: 'pasture', capacity: 4 }) // 2*2*2^0=4
    expect(zones[1]).toMatchObject({ id: 'p2', zoneType: 'pasture', capacity: 4 }) // 1*2*2^1=4
    expect(zones[2]).toMatchObject({ id: 'house', zoneType: 'house', capacity: 1 })
  })

  it('includes loose stables', () => {
    const player = createPlayer({
      stableTiles: [{ row: 0, col: 0 }] as any,
    })
    const zones = computeAnimalZones(player)
    expect(zones.length).toBe(2) // house + 1 stable
    expect(zones[1]).toMatchObject({ zoneType: 'stable', capacity: 1 })
  })

  it('respects E33_BeaverColony blocked pasture', () => {
    const player = createPlayer({
      minorPlayed: ['E33_BeaverColony'],
      pastures: [makePasture('p1', 2, 1), makePasture('p2', 3, 0)],
    })
    const zones = computeAnimalZones(player)
    // p1 has stables, smaller capacity → blocked (capacity=0)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(0)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6) // 3*2*1=6
  })
})

describe('getTotalAnimalCapacity uses computeAnimalZones', () => {
  it('sums zone capacities', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0)],
    })
    // pasture=4 + house=1 = 5
    expect(getTotalAnimalCapacity(player)).toBe(5)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run shared/cards/__tests__/animal-capacity-modifier.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat: add computeAnimalZones with onComputeAnimalZones card hook
```

---

## Task 2: Migrate getTotalAnimalCapacity + enforceAnimalCapacity

**Files:**
- Modify: `shared/actions/effects/animals.ts`

- [ ] **Step 1: Rewrite getTotalAnimalCapacity to use computeAnimalZones**

```typescript
export const getTotalAnimalCapacity = (player: PlayerState) =>
  computeAnimalZones(player).reduce((sum, zone) => sum + zone.capacity, 0)
```

This replaces the old inline calculation.

- [ ] **Step 2: Rewrite enforceAnimalCapacity to use computeAnimalZones**

Replace the hardcoded capacity calls inside `enforceAnimalCapacity`. The function should call `computeAnimalZones(player)` once, then use `zone.capacity` for each zone when allocating animals.

Key changes in `enforceAnimalCapacity`:
- Replace `getPastureCapacity(pasture, blocked)` with looking up the zone's `.capacity`
- The allocation logic stays the same, but reads capacity from zones

```typescript
export const enforceAnimalCapacity = (player: PlayerState) => {
  const zones = computeAnimalZones(player)
  const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
  const stableZones = zones.filter((z) => z.zoneType === 'stable')
  // ... rest uses zone.capacity instead of getPastureCapacity(pasture, blocked)
}
```

The full rewrite follows the same allocation algorithm but replaces every `getPastureCapacity(pasture, blocked)` call with `pastureZones.find(z => z.id === pasture.id)?.capacity ?? 0`.

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run shared/`
Expected: All existing tests pass — no behavioral change yet (no cards registered).

- [ ] **Step 4: Commit**

```
refactor: migrate getTotalAnimalCapacity + enforceAnimalCapacity to computeAnimalZones
```

---

## Task 3: Migrate game-session.ts callsites

**Files:**
- Modify: `server/game-session.ts`

- [ ] **Step 1: Rewrite buildAnimalReorgZones to use computeAnimalZones**

Replace the entire method body (lines 631-658):

```typescript
private buildAnimalReorgZones(player: PlayerState): InteractionAnimalReorgZone[] {
  return computeAnimalZones(player).map((zone) => ({
    id: zone.id,
    zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
    animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
    animalCount: zone.animalCount ?? 0,
    capacity: zone.capacity,
  }))
}
```

Add import at the top:
```typescript
import { computeAnimalZones } from '../shared/actions/effects/animals'
```

Remove now-unused imports: `getPastureCapacity`, `getLooseStableKeys` (if no longer used elsewhere in the file — check first).

- [ ] **Step 2: Rewrite getPastureCapacities to use computeAnimalZones**

```typescript
getPastureCapacities(): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  this.state.players.forEach((player) => {
    const zones = computeAnimalZones(player)
    result[player.id] = Object.fromEntries(
      zones
        .filter((z) => z.zoneType === 'pasture')
        .map((z) => [z.id, z.capacity]),
    )
  })
  return result
}
```

- [ ] **Step 3: Update confirmAnimalReorg capacity validation**

In `confirmAnimalReorg` (line 1762+), replace:
```typescript
const blocked = getBlockedPastureId(player)
// ...
const capacity = getPastureCapacity(pasture, blocked)
```

With:
```typescript
const zones = computeAnimalZones(player)
const zoneCapacity = (id: string) => zones.find((z) => z.id === id)?.capacity ?? 0
// ...
const capacity = zoneCapacity(pasture.id)
```

Also update the house and stable capacity checks to use `zoneCapacity('house')` and `zoneCapacity(`stable:${key}`)`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run server/__tests__/ shared/`
Expected: All pass.

- [ ] **Step 5: Commit**

```
refactor: migrate game-session.ts animal callsites to computeAnimalZones
```

---

## Task 4: Implement A12_DrinkingTrough + tests

**Files:**
- Create: `shared/cards/A/A12_DrinkingTrough.ts`
- Modify: `shared/cards/__tests__/animal-capacity-modifier.test.ts`

- [ ] **Step 1: Create A12_DrinkingTrough card file**

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A12_DrinkingTrough'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    for (const zone of zones) {
      if (zone.zoneType === 'pasture') {
        zone.capacity += 2
      }
    }
  },
})

export const A12_DrinkingTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Drinking Trough",
  deck: "A",
  number: 12,
  category: "FARM_PLANNER",
  desc: ["Each of your pastures (with or without a stable) can hold up to 2 more animals."],
  cost: { clay: 1 },
})
```

- [ ] **Step 2: Add A12 tests**

Add to `shared/cards/__tests__/animal-capacity-modifier.test.ts`:

```typescript
import '../A/A12_DrinkingTrough'

describe('A12_DrinkingTrough', () => {
  it('adds +2 capacity to each pasture zone', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 1)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(6)  // 4+2=6
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)  // 4+2=6
  })

  it('does not affect house zone', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 1, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.zoneType === 'house')!.capacity).toBe(1)
  })

  it('does not affect stable zones', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      stableTiles: [{ row: 0, col: 0 }] as any,
    })
    const zones = computeAnimalZones(player)
    const stableZone = zones.find((z) => z.zoneType === 'stable')
    expect(stableZone!.capacity).toBe(1)
  })

  it('increases getTotalAnimalCapacity', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 0)],
    })
    // Without A12: 4+2+1=7, With A12: 6+4+1=11
    expect(getTotalAnimalCapacity(player)).toBe(11)
  })

  it('does not trigger without card played', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run shared/cards/__tests__/animal-capacity-modifier.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```
feat: implement A12_DrinkingTrough (+2 pasture capacity via onComputeAnimalZones)
```

---

## Summary

| Task | Changes | Tests |
|---|---|---|
| 1 | Add AnimalZone type + computeAnimalZones + CardEffect hook | 4 tests (base zones, stables, E33 blocking, capacity sum) |
| 2 | Migrate getTotalAnimalCapacity + enforceAnimalCapacity | Existing tests verify no regression |
| 3 | Migrate game-session.ts callsites | Existing session tests verify no regression |
| 4 | A12_DrinkingTrough implementation | 5 tests (pasture +2, house unchanged, stable unchanged, total capacity, no card) |
