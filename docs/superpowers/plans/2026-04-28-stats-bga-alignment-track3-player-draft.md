# Stats × BGA Alignment — Track 3 (PlayerStats + Draft history) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player-level fine-grained stats (action counts / harvest / resource origin / conversion) plus draft history, surfaced as new tabs in the existing post-game `ScoringPad` overlay. Pure post-game retrospective — no in-game live panel, no real-time push.

**Architecture:** New `PlayerStats` shape on `PlayerState` and `DraftHistoryEntry[]` for draft tracking. All writes go through helpers in a new `shared/logic/stats.ts` — no global post-mutation hook. `ScoringPad` gains tab navigation; existing Score tab unchanged. The existing `state.gameOver` trigger remains the only entry point.

**Tech Stack:** TypeScript, vitest (unit/session/component), React (ScoringPad), shared/server/client three-layer split per project CLAUDE.md.

**Spec:** `docs/superpowers/specs/2026-04-28-stats-bga-alignment-track3-player-draft-design.md`

**PR ordering:**
- PR-1 (Tasks 1.x) — `PlayerStats` type, init, helpers, unit tests. No write-points or UI.
- PR-2 (Tasks 2.x) — write-points: action counts / harvest / conversion. Depends on PR-1.
- PR-3 (Tasks 3.x) — write-points: resource origin (board vs cards) and draft history. Depends on PR-1. Parallelizable with PR-2.
- PR-4 (Tasks 4.x) — `ScoringPad` tab UI. Depends on PR-1 type only — UI tests use mock `PlayerStats`. Fully parallelizable with PR-2 / PR-3.

---

## PR-1 — Type, initialization, helpers, unit tests

### Task 1.1: Define `PlayerStats` and `DraftHistoryEntry` types

**Files:**
- Modify: `shared/game/types.ts`

- [ ] **Step 1: Find `PlayerState` definition and the closest natural insertion point**

Run: `grep -n "export type PlayerState\|export interface PlayerState\|cardStates\b" shared/game/types.ts | head -10`

Identify where to insert `PlayerStats` near other related types and where to add `stats: PlayerStats` inside `PlayerState`.

- [ ] **Step 2: Add `DraftHistoryEntry` and `PlayerStats` types**

Insert into `shared/game/types.ts` near the other player-related types:

```ts
export type DraftHistoryEntry = {
  cardId: string
  draftTurn: number       // 1..14
  playedTurn?: number     // turn the card was played; undefined if never played
}

export type PlayerStats = {
  // Action counts
  placedFarmers: number
  firstPlayerCount: number
  totalRoomsBuilt: number
  totalMajorBuilt: number
  totalMinorBuilt: number
  totalOccupationBuilt: number

  // Harvest
  harvestedGrain: number
  harvestedVegetable: number

  // Resource origin
  resourcesFromBoard: Partial<Resource>
  resourcesFromCards: Partial<Resource>

  // Conversion
  resourcesConverted: Partial<Resource>     // count of times each resource was used as feed/cooked food source
  foodFromConversion: Partial<Resource>     // food output keyed by source resource

  // Draft history
  draftHistory: DraftHistoryEntry[]
  draftDiscarded: string[]
}
```

- [ ] **Step 3: Add the field to `PlayerState`**

Inside the `PlayerState` definition, add:

```ts
stats: PlayerStats
```

Make it required (not optional) — the initializer in Task 1.2 fills it.

- [ ] **Step 4: Run typecheck — expect failures at every PlayerState constructor**

Run: `pnpm run build 2>&1 | tail -50`
Expected: errors at every place that builds a `PlayerState` literal without `stats`. Note their file paths — these are the sites Task 1.2 must update.

- [ ] **Step 5: Don't fix yet — proceed to Task 1.2 which adds the initializer**

---

### Task 1.2: Add `createInitialPlayerStats` and integrate into player creation

**Files:**
- Create: `shared/logic/stats.ts`
- Modify: `shared/logic/state.ts` (or wherever `createInitialPlayerState` lives)
- Modify: any other PlayerState constructors flagged in Task 1.1 Step 4
- Test: `shared/logic/__tests__/stats.test.ts`

- [ ] **Step 1: Locate `createInitialPlayerState` (or equivalent)**

Run: `grep -rn "createInitialPlayerState\|createPlayerState\|initialPlayer" shared/logic/ shared/game/ --include="*.ts" | grep -v __tests__ | head -10`

Open the file to see the existing shape and any helpers it uses.

- [ ] **Step 2: Write the failing tests**

Create `shared/logic/__tests__/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createInitialPlayerStats } from '../stats'

describe('createInitialPlayerStats', () => {
  it('returns zeroed numeric fields and empty dictionaries', () => {
    const stats = createInitialPlayerStats({ isFirstPlayer: false })
    expect(stats).toEqual({
      placedFarmers: 0,
      firstPlayerCount: 0,
      totalRoomsBuilt: 0,
      totalMajorBuilt: 0,
      totalMinorBuilt: 0,
      totalOccupationBuilt: 0,
      harvestedGrain: 0,
      harvestedVegetable: 0,
      resourcesFromBoard: {},
      resourcesFromCards: {},
      resourcesConverted: {},
      foodFromConversion: {},
      draftHistory: [],
      draftDiscarded: [],
    })
  })

  it('sets firstPlayerCount = 1 for the starting first player', () => {
    const stats = createInitialPlayerStats({ isFirstPlayer: true })
    expect(stats.firstPlayerCount).toBe(1)
  })
})
```

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm exec vitest run shared/logic/__tests__/stats.test.ts`
Expected: FAIL — `Cannot find module '../stats'`.

- [ ] **Step 4: Create `shared/logic/stats.ts`**

```ts
import type {
  PlayerState,
  PlayerStats,
  DraftHistoryEntry,
  Resource,
} from '../game/types'

export const createInitialPlayerStats = (
  options: { isFirstPlayer: boolean },
): PlayerStats => ({
  placedFarmers: 0,
  firstPlayerCount: options.isFirstPlayer ? 1 : 0,
  totalRoomsBuilt: 0,
  totalMajorBuilt: 0,
  totalMinorBuilt: 0,
  totalOccupationBuilt: 0,
  harvestedGrain: 0,
  harvestedVegetable: 0,
  resourcesFromBoard: {},
  resourcesFromCards: {},
  resourcesConverted: {},
  foodFromConversion: {},
  draftHistory: [],
  draftDiscarded: [],
})

const ensureStats = (player: PlayerState): PlayerStats => {
  if (!player.stats) {
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  }
  return player.stats
}

const addToDict = (
  dict: Partial<Resource>,
  resources: Partial<Resource>,
) => {
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    const k = key as keyof Resource
    dict[k] = (dict[k] ?? 0) + value
  })
}

// Action counts
export const incPlacedFarmers = (player: PlayerState) => {
  ensureStats(player).placedFarmers += 1
}

export const incFirstPlayer = (player: PlayerState) => {
  ensureStats(player).firstPlayerCount += 1
}

export const incRoomsBuilt = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).totalRoomsBuilt += count
}

export const incMajorBuilt = (player: PlayerState) => {
  ensureStats(player).totalMajorBuilt += 1
}

export const incMinorBuilt = (player: PlayerState) => {
  ensureStats(player).totalMinorBuilt += 1
}

export const incOccupationBuilt = (player: PlayerState) => {
  ensureStats(player).totalOccupationBuilt += 1
}

// Harvest
export const incHarvestedGrain = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).harvestedGrain += count
}

export const incHarvestedVegetable = (player: PlayerState, count: number) => {
  if (count <= 0) return
  ensureStats(player).harvestedVegetable += count
}

// Resource origin
export const addResourcesFromBoard = (
  player: PlayerState,
  resources: Partial<Resource>,
) => addToDict(ensureStats(player).resourcesFromBoard, resources)

export const addResourcesFromCards = (
  player: PlayerState,
  resources: Partial<Resource>,
) => addToDict(ensureStats(player).resourcesFromCards, resources)

// Conversion
export const incResourceConverted = (
  player: PlayerState,
  resource: keyof Resource,
  count: number,
) => {
  if (count <= 0) return
  const dict = ensureStats(player).resourcesConverted
  dict[resource] = (dict[resource] ?? 0) + count
}

export const addFoodFromConversion = (
  player: PlayerState,
  resource: keyof Resource,
  foodAmount: number,
) => {
  if (foodAmount <= 0) return
  const dict = ensureStats(player).foodFromConversion
  dict[resource] = (dict[resource] ?? 0) + foodAmount
}

// Draft history
export const recordDraftPick = (
  player: PlayerState,
  cardId: string,
  draftTurn: number,
) => {
  const stats = ensureStats(player)
  if (stats.draftHistory.find((entry) => entry.cardId === cardId)) return
  stats.draftHistory.push({ cardId, draftTurn })
}

export const recordDraftPlayed = (
  player: PlayerState,
  cardId: string,
  currentTurn: number,
) => {
  const stats = ensureStats(player)
  const entry = stats.draftHistory.find((e) => e.cardId === cardId)
  if (!entry) return
  if (entry.playedTurn !== undefined) return
  entry.playedTurn = currentTurn
}

export const recordDraftDiscarded = (player: PlayerState, cardId: string) => {
  const stats = ensureStats(player)
  if (!stats.draftDiscarded.includes(cardId)) {
    stats.draftDiscarded.push(cardId)
  }
}
```

- [ ] **Step 5: Run the test, verify PASS**

Run: `pnpm exec vitest run shared/logic/__tests__/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire `createInitialPlayerStats` into `createInitialPlayerState`**

In the player initializer file (Step 1), add:

```ts
import { createInitialPlayerStats } from './stats'
// ...
const isFirstPlayer = /* existing first-player flag — typically index === 0 in start order */
const stats = createInitialPlayerStats({ isFirstPlayer })
return {
  // ... all existing fields ...
  stats,
}
```

If the initializer isn't aware of "first player" status (e.g., it builds players before the start order is decided), default `isFirstPlayer: false` here and let the round-init code call `incFirstPlayer(player)` once for the actual starter when it's known. Note this in the function's JSDoc.

- [ ] **Step 7: Find every other PlayerState literal flagged by typecheck**

Run: `pnpm run build 2>&1 | tail -30`
For each error site, add `stats: createInitialPlayerStats({ isFirstPlayer: false })` (test fixtures, etc.).

For test fixtures that previously didn't have `stats`, add it. Pattern:
```ts
const mockPlayer = (): PlayerState => ({
  // ... existing fields ...
  stats: createInitialPlayerStats({ isFirstPlayer: false }),
})
```

- [ ] **Step 8: Run lint + full typecheck**

Run: `pnpm run lint 2>&1 | tail -20 && pnpm run build 2>&1 | tail -20`
Expected: zero TS errors.

- [ ] **Step 9: Run full vitest fast project**

Run: `pnpm test:fast 2>&1 | tail -50`
Expected: green. Many test fixtures will need `stats` added — sweep all failures.

- [ ] **Step 10: Commit**

```bash
git add shared/game/types.ts shared/logic/stats.ts shared/logic/state.ts \
        shared/logic/__tests__/stats.test.ts \
        # plus all test fixture files updated for the new field
git commit -m "feat(stats): PlayerStats type + initializer + helpers"
```

---

### Task 1.3: Unit tests for all 13 helpers

**Files:**
- Modify: `shared/logic/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `shared/logic/__tests__/stats.test.ts`:

```ts
import {
  createInitialPlayerStats,
  incPlacedFarmers, incFirstPlayer,
  incRoomsBuilt, incMajorBuilt, incMinorBuilt, incOccupationBuilt,
  incHarvestedGrain, incHarvestedVegetable,
  addResourcesFromBoard, addResourcesFromCards,
  incResourceConverted, addFoodFromConversion,
  recordDraftPick, recordDraftPlayed, recordDraftDiscarded,
} from '../stats'
import type { PlayerState } from '../../game/types'

const mockPlayer = (isFirstPlayer = false): PlayerState =>
  ({
    id: 'p1',
    stats: createInitialPlayerStats({ isFirstPlayer }),
  } as unknown as PlayerState)

describe('action-count helpers', () => {
  it('incPlacedFarmers', () => {
    const p = mockPlayer()
    incPlacedFarmers(p); incPlacedFarmers(p)
    expect(p.stats.placedFarmers).toBe(2)
  })

  it('incFirstPlayer', () => {
    const p = mockPlayer(true)
    expect(p.stats.firstPlayerCount).toBe(1)
    incFirstPlayer(p)
    expect(p.stats.firstPlayerCount).toBe(2)
  })

  it('incRoomsBuilt accumulates count, ignores 0/negative', () => {
    const p = mockPlayer()
    incRoomsBuilt(p, 2); incRoomsBuilt(p, 0); incRoomsBuilt(p, -1); incRoomsBuilt(p, 1)
    expect(p.stats.totalRoomsBuilt).toBe(3)
  })

  it('incMajorBuilt / incMinorBuilt / incOccupationBuilt', () => {
    const p = mockPlayer()
    incMajorBuilt(p); incMinorBuilt(p); incMinorBuilt(p); incOccupationBuilt(p)
    expect(p.stats.totalMajorBuilt).toBe(1)
    expect(p.stats.totalMinorBuilt).toBe(2)
    expect(p.stats.totalOccupationBuilt).toBe(1)
  })
})

describe('harvest helpers', () => {
  it('incHarvestedGrain / incHarvestedVegetable', () => {
    const p = mockPlayer()
    incHarvestedGrain(p, 3); incHarvestedVegetable(p, 1)
    expect(p.stats.harvestedGrain).toBe(3)
    expect(p.stats.harvestedVegetable).toBe(1)
  })
})

describe('resource origin helpers', () => {
  it('addResourcesFromBoard accumulates per resource', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 2 })
    addResourcesFromBoard(p, { wood: 1, clay: 3 })
    expect(p.stats.resourcesFromBoard).toEqual({ wood: 3, clay: 3 })
  })

  it('addResourcesFromCards keeps separate from board', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 1 })
    addResourcesFromCards(p, { wood: 2 })
    expect(p.stats.resourcesFromBoard.wood).toBe(1)
    expect(p.stats.resourcesFromCards.wood).toBe(2)
  })

  it('drops zero / negative entries', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 0, clay: -1, stone: 2 })
    expect(p.stats.resourcesFromBoard).toEqual({ stone: 2 })
  })
})

describe('conversion helpers', () => {
  it('incResourceConverted accumulates per source resource', () => {
    const p = mockPlayer()
    incResourceConverted(p, 'grain', 2)
    incResourceConverted(p, 'grain', 1)
    incResourceConverted(p, 'sheep', 1)
    expect(p.stats.resourcesConverted).toEqual({ grain: 3, sheep: 1 })
  })

  it('addFoodFromConversion records food output keyed by source', () => {
    const p = mockPlayer()
    addFoodFromConversion(p, 'grain', 4)
    addFoodFromConversion(p, 'grain', 2)
    addFoodFromConversion(p, 'sheep', 2)
    expect(p.stats.foodFromConversion).toEqual({ grain: 6, sheep: 2 })
  })
})

describe('draft helpers', () => {
  it('recordDraftPick appends', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPick(p, 'B12', 2)
    expect(p.stats.draftHistory).toEqual([
      { cardId: 'A29', draftTurn: 1 },
      { cardId: 'B12', draftTurn: 2 },
    ])
  })

  it('recordDraftPick is idempotent', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPick(p, 'A29', 1)
    expect(p.stats.draftHistory).toHaveLength(1)
  })

  it('recordDraftPlayed sets playedTurn once', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPlayed(p, 'A29', 5)
    expect(p.stats.draftHistory[0].playedTurn).toBe(5)
    recordDraftPlayed(p, 'A29', 9) // ignored — already set
    expect(p.stats.draftHistory[0].playedTurn).toBe(5)
  })

  it('recordDraftPlayed no-op for never-drafted cards', () => {
    const p = mockPlayer()
    recordDraftPlayed(p, 'A29', 5)
    expect(p.stats.draftHistory).toEqual([])
  })

  it('recordDraftDiscarded dedupes', () => {
    const p = mockPlayer()
    recordDraftDiscarded(p, 'D1')
    recordDraftDiscarded(p, 'D1')
    recordDraftDiscarded(p, 'D2')
    expect(p.stats.draftDiscarded).toEqual(['D1', 'D2'])
  })
})
```

- [ ] **Step 2: Run, expect PASS (helpers already implemented in Task 1.2)**

Run: `pnpm exec vitest run shared/logic/__tests__/stats.test.ts`
Expected: PASS (15+ tests).

- [ ] **Step 3: Commit**

```bash
git add shared/logic/__tests__/stats.test.ts
git commit -m "test(stats): unit tests for all PlayerStats helpers"
```

---

### Task 1.4: PR-1 wrap

- [ ] **Step 1: Run full test + lint + build**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: green.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin worktree-align-stats-with-bga
gh pr create --title "feat(stats): PlayerStats type & helpers (PR-1/4)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `PlayerStats` (action counts / harvest / resource origin / conversion / draft history) to `PlayerState`
- Adds `DraftHistoryEntry` type
- Initializer `createInitialPlayerStats({ isFirstPlayer })` honours starting first player
- 13 helpers in `shared/logic/stats.ts` for in-place writes
- All write-points and UI deferred to PR-2 / PR-3 / PR-4

## Test plan
- [x] `pnpm test:fast` green
- [x] `pnpm run lint` clean
- [x] `pnpm run build` clean
EOF
)"
```

---

## PR-2 — Write-points: action counts / harvest / conversion

Depends on PR-1.

### Task 2.1: `incPlacedFarmers` on PlaceFarmer

**Files:**
- Modify: `server/game-session.ts` (PlaceFarmer command path)
- Test: `server/__tests__/stats-tracking-actions.test.ts`

- [ ] **Step 1: Locate the PlaceFarmer command handler**

Run: `grep -n "PlaceFarmer\|placeFarmer\|case 'place_farmer'\|takeAction.*farmer" server/game-session.ts | head -20`

Open the file at the matched line. Identify the function body that processes the PlaceFarmer command — it should mutate the player's worker count and place a worker on an action space.

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/stats-tracking-actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
// ... existing test setup helpers

describe('PlayerStats action tracking', () => {
  it('incPlacedFarmers fires once per place', () => {
    const session = setupTwoPlayerSession()
    // place 1 worker via takeAction
    session.takeAction(/* PlaceFarmer command for first player */)
    expect(session.state.players[0].stats.placedFarmers).toBe(1)
    // place again
    session.takeAction(/* second worker */)
    expect(session.state.players[0].stats.placedFarmers).toBe(2)
  })
})
```

Pattern after an existing session test that drives PlaceFarmer (search server/__tests__/*.test.ts for takeAction with action-space params).

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm exec vitest run server/__tests__/stats-tracking-actions.test.ts`

- [ ] **Step 4: Add the increment**

In the PlaceFarmer handler, after the worker is successfully placed:

```ts
import { incPlacedFarmers } from '../shared/logic/stats'
// ...
incPlacedFarmers(player)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track placedFarmers"
```

---

### Task 2.2: `incFirstPlayer` on round start (after first-player rotation)

**Files:**
- Modify: `shared/logic/round.ts` (or wherever first-player advances each year)
- Test: extend `stats-tracking-actions.test.ts`

- [ ] **Step 1: Locate the first-player rotation point**

Run: `grep -rn "firstPlayerId\|startPlayerId\|setFirstPlayer\|advanceStartPlayer\|round.start\|nextRound" shared/logic/ shared/session/ --include="*.ts" | grep -v __tests__ | head -20`

Find the spot where, at the start of a new year, the first-player marker passes to a new player. That's where `incFirstPlayer(newFirstPlayer)` goes.

- [ ] **Step 2: Test the round-rotation increment**

Add test:

```ts
it('incFirstPlayer fires when first-player rotates each year', () => {
  const session = setupTwoPlayerSession()
  // Player[0] is starting first player → already has firstPlayerCount = 1 from init.
  expect(session.state.players[0].stats.firstPlayerCount).toBe(1)
  expect(session.state.players[1].stats.firstPlayerCount).toBe(0)
  // Advance through year 1 — player[1] takes "first player" action and becomes year 2 first.
  // ... drive the session ...
  // After year 2 begins:
  expect(session.state.players[1].stats.firstPlayerCount).toBe(1)
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the increment**

At the round-rotation spot:

```ts
import { incFirstPlayer } from './stats'
// ...
incFirstPlayer(newFirstPlayer)
```

If the starting first player is set during `createInitialPlayerStats` already (Task 1.2 honours `isFirstPlayer: true`), do NOT also call `incFirstPlayer` on round 1 — would double-count. Audit the round-init flow and place the call only on rounds 2..14.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track firstPlayerCount across years"
```

---

### Task 2.3: `incRoomsBuilt` on construct

**Files:**
- Modify: construct effect (`shared/actions/effects/construct.ts` or similar)
- Test: extend `stats-tracking-actions.test.ts`

- [ ] **Step 1: Locate construct**

Run: `grep -rn "rooms.push\|player.rooms\|buildRoom" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -10`

- [ ] **Step 2: Write the failing test**

```ts
it('incRoomsBuilt sums per construct', () => {
  const session = setupTwoPlayerSession()
  // give player wood/reed, drive Construct of 1 room
  // ... drive session ...
  expect(session.state.players[0].stats.totalRoomsBuilt).toBe(1)
  // build a second room
  expect(session.state.players[0].stats.totalRoomsBuilt).toBe(2)
  // renovation does NOT count
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the increment**

In the construct effect, after rooms are appended to `player.rooms`:

```ts
import { incRoomsBuilt } from '../../logic/stats'
// ...
incRoomsBuilt(player, roomsBuiltCount)
```

Renovation should NOT call this — only fresh room construction.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track totalRoomsBuilt"
```

---

### Task 2.4: `incMajorBuilt` / `incMinorBuilt`

**Files:**
- Modify: improvement effect (`shared/actions/effects/improvement.ts` / `play-major.ts` / `play-minor.ts`)
- Test: extend `stats-tracking-actions.test.ts`

- [ ] **Step 1: Locate**

Run: `grep -rn "improvements.push\|minorPlayed.push\|playMajor\|playMinor" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -10`

- [ ] **Step 2: Write tests**

```ts
it('major and minor counters separate correctly', () => {
  const session = setupTwoPlayerSession()
  // play a major
  expect(session.state.players[0].stats.totalMajorBuilt).toBe(1)
  // play a minor
  expect(session.state.players[0].stats.totalMinorBuilt).toBe(1)
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add increments**

Major effect:
```ts
import { incMajorBuilt } from '../../logic/stats'
incMajorBuilt(player)
```

Minor effect:
```ts
import { incMinorBuilt } from '../../logic/stats'
incMinorBuilt(player)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track totalMajorBuilt / totalMinorBuilt"
```

---

### Task 2.5: `incOccupationBuilt`

**Files:**
- Modify: occupation effect
- Test: extend `stats-tracking-actions.test.ts`

- [ ] **Step 1: Locate**

Run: `grep -rn "occupationPlayed.push\|playOccupation" shared/actions/effects/ --include="*.ts" | grep -v __tests__ | head -10`

- [ ] **Step 2: Write test**

```ts
it('occupation count increments', () => {
  const session = setupTwoPlayerSession()
  // play 2 occupations
  expect(session.state.players[0].stats.totalOccupationBuilt).toBe(2)
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add increment**

```ts
import { incOccupationBuilt } from '../../logic/stats'
incOccupationBuilt(player)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track totalOccupationBuilt"
```

---

### Task 2.6: `incHarvestedGrain` / `incHarvestedVegetable`

**Files:**
- Modify: harvest reap flow (search `shared/session/game-core.ts` near `harvestReapSummary` writes around line 1366-1389, or `shared/logic/harvest*` if separated)
- Test: `server/__tests__/stats-tracking-harvest.test.ts`

- [ ] **Step 1: Inspect existing reap site**

Run: `grep -n "harvestReapSummary\|reapSummary\|grainFields\|vegetableFields" shared/session/game-core.ts shared/logic/ -r 2>/dev/null | head -20`

Likely you'll find the reap result already produces `{ resources, grainFields, vegetableFields }`. Wire stats writes off `result.reapSummary.resources.grain` and `.vegetable`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { setupTwoPlayerSession } from '...'

describe('PlayerStats harvest tracking', () => {
  it('grain reaped from 3 fields adds 3 (1 per field)', () => {
    const session = setupTwoPlayerSession()
    // give player 3 grain fields with 3 grain on top of each
    // run harvest phase reap
    // ...
    expect(session.state.players[0].stats.harvestedGrain).toBe(3)
  })

  it('vegetable reaped tracked separately', () => {
    const session = setupTwoPlayerSession()
    // give player 1 vegetable field
    // run harvest reap
    expect(session.state.players[0].stats.harvestedVegetable).toBe(1)
  })
})
```

Pattern after existing harvest tests (search server/__tests__ for `harvest` or `reap`).

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the writes**

In `shared/session/game-core.ts:1372` (where `result.reapSummary` is assigned), after the assignment:

```ts
import { incHarvestedGrain, incHarvestedVegetable } from '../logic/stats'
// ...
this.state.harvestReapSummary![player.id] = result.reapSummary
incHarvestedGrain(player, result.reapSummary.resources.grain ?? 0)
incHarvestedVegetable(player, result.reapSummary.resources.vegetable ?? 0)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track harvestedGrain / harvestedVegetable"
```

---

### Task 2.7: `incResourceConverted` / `addFoodFromConversion`

**Files:**
- Modify: conversion effects (cooking/baking/feeding) — likely `shared/actions/effects/feed*.ts`, `shared/actions/effects/convert*.ts`, and any per-card cookable conversions
- Test: `server/__tests__/stats-tracking-conversion.test.ts`

- [ ] **Step 1: Find conversion entry points**

Run: `grep -rn "convert.*food\|cookFood\|bakeBread\|feed.*animal" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -20`

Common cards/effects: feeding sheep/pigs/cattle (1:2 conversion via cooking improvements), bread baking (grain → food via Bakery / Joinery), cooking improvements (Cooking Hearth, Stone Oven, etc.).

- [ ] **Step 2: Write the failing test**

```ts
describe('PlayerStats conversion tracking', () => {
  it('feeding 2 grain to family registers grain conversion + food output', () => {
    const session = setupTwoPlayerSession()
    // give player 2 grain; trigger conversion via "use grain as food" action (no cooker)
    // ...
    const stats = session.state.players[0].stats
    expect(stats.resourcesConverted.grain).toBe(2)
    expect(stats.foodFromConversion.grain).toBe(2)
  })

  it('baking 2 grain at Bakery (grain→3 food) records grain count + food output', () => {
    const session = setupTwoPlayerSession()
    // give player Bakery + 2 grain; bake
    // ...
    const stats = session.state.players[0].stats
    expect(stats.resourcesConverted.grain).toBe(2)
    expect(stats.foodFromConversion.grain).toBe(6) // assuming 1:3 ratio
  })
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the writes at each conversion site**

For each `convert food` effect site, after the conversion succeeds:

```ts
import { incResourceConverted, addFoodFromConversion } from '../../logic/stats'
// ...
incResourceConverted(player, sourceResource, sourceCount)
addFoodFromConversion(player, sourceResource, foodOutput)
```

For example, in a "1 grain → 1 food" site:
```ts
incResourceConverted(player, 'grain', 1)
addFoodFromConversion(player, 'grain', 1)
```

For an animal feeding site (e.g., "1 sheep → 1 food via Cooking Hearth"):
```ts
incResourceConverted(player, 'sheep', 1)
addFoodFromConversion(player, 'sheep', 2) // Cooking Hearth: sheep → 2 food
```

Audit ALL conversion entry points so cooking improvements with different ratios all write the right output amount.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track resourcesConverted / foodFromConversion"
```

---

### Task 2.8: PR-2 wrap

- [ ] **Step 1: Run full test + lint + build**

Run: `pnpm test && pnpm run lint && pnpm run build`
Expected: green.

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --title "feat(stats): PlayerStats — action / harvest / conversion (PR-2/4)" \
  --body "..."
```

---

## PR-3 — Write-points: resource origin + draft history

Depends on PR-1. Parallelizable with PR-2 — only conflicts at gain effect imports, easily rebased.

### Task 3.1: `addResourcesFromBoard` / `addResourcesFromCards` based on `sourceCard`

**Files:**
- Modify: `shared/actions/effects/gain.ts`
- Modify: `shared/actions/effects/take-from-card.ts`
- Modify: any other gain entry points (audit `addCardResourceGained` callers)
- Test: `server/__tests__/stats-tracking-origin.test.ts`

- [ ] **Step 1: Audit all gain sites**

Run: `grep -rn "addCardResourceGained\|gainResources(" shared/actions/effects/ shared/cards/ --include="*.ts" | grep -v __tests__ | head -30`

Each site is a candidate. Inspect each to confirm:
- Does it receive `sourceCard`?
- If sourceCard is set → write to `resourcesFromCards`
- If sourceCard is unset → write to `resourcesFromBoard`

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { setupTwoPlayerSession } from '...'

describe('PlayerStats resource origin tracking', () => {
  it('claims wood from "Forest" board space goes to resourcesFromBoard', () => {
    const session = setupTwoPlayerSession()
    // visit forest, accept wood
    expect(session.state.players[0].stats.resourcesFromBoard.wood).toBeGreaterThan(0)
    expect(session.state.players[0].stats.resourcesFromCards.wood ?? 0).toBe(0)
  })

  it('wood from a card effect goes to resourcesFromCards', () => {
    const session = setupTwoPlayerSession()
    // place E76_LumberPile on player; trigger
    expect(session.state.players[0].stats.resourcesFromCards.wood).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the writes**

In `shared/actions/effects/gain.ts`, near the existing `addCardResourceGained` call:

```ts
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../logic/stats'
// ...
if (sourceCard) {
  addCardResourceGained(player, sourceCard, gained)
  addResourcesFromCards(player, gained)
} else {
  addResourcesFromBoard(player, gained)
}
```

Repeat the dual-branch pattern at every gain site identified in Step 1. Centralize if there's a single chokepoint; otherwise patch each site.

Filter out pseudo-resource keys before writing — `resourcesFromBoard/Cards` should only contain real resources. Add a `filterRealOnly(resources)` step (or rely on the helper to ignore pseudo keys).

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track resourcesFromBoard vs resourcesFromCards"
```

---

### Task 3.2: `recordDraftPick` on draft pick

**Files:**
- Modify: `shared/draft/draft-manager.ts` (where a player picks a card from a pool)
- Modify: integration in session if needed
- Test: `server/__tests__/stats-tracking-draft.test.ts`

- [ ] **Step 1: Locate the draft pick site**

Open `shared/draft/draft-manager.ts` and find the function that finalizes a player's pick (likely takes `cardId`, validates, transfers from pool to hand, and increments draft turn).

Run: `grep -n "pickCard\|chooseCard\|finalize\|draftTurn" shared/draft/draft-manager.ts | head -10`

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/stats-tracking-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setupDraftSession } from '...'

describe('PlayerStats draft tracking', () => {
  it('records each pick with draftTurn', () => {
    const session = setupDraftSession({ players: 2 })
    session.pickCard('p1', 'A29')  // draft turn 1
    session.pickCard('p1', 'B12')  // turn 2
    expect(session.state.players[0].stats.draftHistory).toEqual([
      { cardId: 'A29', draftTurn: 1 },
      { cardId: 'B12', draftTurn: 2 },
    ])
  })

  it('idempotent on duplicate pick attempts (defensive)', () => {
    // ...
  })
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the write**

At the draft-manager pick site:

```ts
import { recordDraftPick } from '../logic/stats'
// ...
recordDraftPick(player, cardId, currentDraftTurn)
```

If `draft-manager.ts` doesn't have direct access to `PlayerState` (only the draft sub-state), thread the pick result back to the caller and have the caller invoke `recordDraftPick`. The session manager (`shared/session/game-core.ts`) is the obvious place if draft-manager is pure.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): record draft picks"
```

---

### Task 3.3: `recordDraftPlayed` on card play

**Files:**
- Modify: occupation/minor effect (where a card moves from hand → played)
- Test: extend `stats-tracking-draft.test.ts`

- [ ] **Step 1: Locate hand → played transitions**

Run: `grep -rn "occupationPlayed.push\|minorPlayed.push\|hand.splice\|removeFromHand" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -10`

These same sites already added increments in PR-2 (Tasks 2.4 and 2.5). Add the draft-history update next to them.

- [ ] **Step 2: Write the failing test**

```ts
it('recordDraftPlayed sets playedTurn on the original draft entry', () => {
  const session = setupDraftSession({ players: 2 })
  session.pickCard('p1', 'A29')
  // ... finish draft, start playing
  // ... advance to turn 5, play A29 from hand
  const entry = session.state.players[0].stats.draftHistory.find((e) => e.cardId === 'A29')
  expect(entry?.playedTurn).toBe(5)
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the write at the hand → played transition**

```ts
import { recordDraftPlayed } from '../../logic/stats'
// ...
recordDraftPlayed(player, cardId, currentTurn)
```

`currentTurn` is the round/turn the card was played — pull from `state.round` or equivalent.

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): record draft playedTurn on card play"
```

---

### Task 3.4: `recordDraftDiscarded` on pre-game discard

**Files:**
- Modify: `shared/draft/draft-manager.ts` (or wherever the "discard before final pool" choice is made)
- Test: extend `stats-tracking-draft.test.ts`

- [ ] **Step 1: Locate pre-game discard**

Run: `grep -rn "discard.*draft\|draftDiscard\|removeCard\|reject" shared/draft/ shared/session/ --include="*.ts" | grep -v __tests__ | head -10`

- [ ] **Step 2: Write the failing test**

```ts
it('records discarded cards', () => {
  const session = setupDraftSession({ players: 2 })
  session.discardFromHand('p1', 'D1')
  session.discardFromHand('p1', 'D2')
  expect(session.state.players[0].stats.draftDiscarded).toEqual(['D1', 'D2'])
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the write**

```ts
import { recordDraftDiscarded } from '../logic/stats'
// ...
recordDraftDiscarded(player, cardId)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): record pre-game discarded cards"
```

If our project does not have a "discard from hand" pre-game step (some Agricola variants skip this), this task becomes a no-op. Document in the spec's "待实施时确认" section.

---

### Task 3.5: PR-3 wrap

- [ ] **Step 1: Run full test + lint + build**

Run: `pnpm test && pnpm run lint && pnpm run build`

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --title "feat(stats): PlayerStats — origin + draft history (PR-3/4)" \
  --body "..."
```

---

## PR-4 — `ScoringPad` tab UI

Depends on PR-1 only. Fully parallelizable with PR-2 / PR-3 since UI tests use mock `PlayerStats`.

### Task 4.1: Tab navigation skeleton

**Files:**
- Modify: `client/components/board/ScoringPad.tsx`
- Test: `client/components/board/__tests__/ScoringPad.test.tsx`

- [ ] **Step 1: Write the failing test**

In `ScoringPad.test.tsx`:

```ts
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScoringPad } from '../ScoringPad'
import { createInitialPlayerStats } from '../../../../shared/logic/stats'
import type { PlayerScoreSummary } from '../../../../shared/logic/scoring'

const mockScores: PlayerScoreSummary[] = [
  { playerId: 'p1', playerName: 'Alice', categories: [], total: 30 },
  { playerId: 'p2', playerName: 'Bob', categories: [], total: 28 },
]

const mockPlayers = [
  { id: 'p1', name: 'Alice', stats: createInitialPlayerStats({ isFirstPlayer: true }) },
  { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
] as any

describe('ScoringPad tabs', () => {
  it('renders Score tab by default', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    // Score tab content visible
    expect(screen.getByText('30')).toBeInTheDocument() // total
  })

  it('switches to Stats tab on click', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Stats'))
    // Score totals should be hidden
    expect(screen.queryByText('30')).not.toBeInTheDocument()
    // Stats labels visible
    expect(screen.getByText('Placed farmers')).toBeInTheDocument()
  })

  it('switches to Draft tab on click', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Draft'))
    expect(screen.queryByText('Placed farmers')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, expect FAIL — players prop missing, tabs not rendered**

- [ ] **Step 3: Refactor `ScoringPad` props**

Change the `Props` type:

```ts
type Props = {
  locale: Locale
  scores: PlayerScoreSummary[]
  players: PlayerState[]   // NEW
  onClose: () => void
}
```

Add tab state:

```ts
import { useState } from 'react'
// ...
type Tab = 'score' | 'stats' | 'draft'
export const ScoringPad = ({ locale, scores, players, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('score')
  // ...
}
```

Add tab buttons inside `<div className="scoring-header">`:

```tsx
<div className="scoring-tabs">
  <button onClick={() => setActiveTab('score')} className={activeTab === 'score' ? 'active' : ''}>
    {t(locale, 'ui.scoringTabScore')}
  </button>
  <button onClick={() => setActiveTab('stats')} className={activeTab === 'stats' ? 'active' : ''}>
    {t(locale, 'ui.scoringTabStats')}
  </button>
  <button onClick={() => setActiveTab('draft')} className={activeTab === 'draft' ? 'active' : ''}>
    {t(locale, 'ui.scoringTabDraft')}
  </button>
</div>
```

Wrap the existing content in a conditional:

```tsx
{activeTab === 'score' && /* existing scoring grid */}
{activeTab === 'stats' && <StatsTab locale={locale} players={players} />}
{activeTab === 'draft' && <DraftTab locale={locale} players={players} />}
```

Stub out `StatsTab` and `DraftTab` for now:

```tsx
const StatsTab = ({ locale, players }: { locale: Locale; players: PlayerState[] }) => (
  <div className="scoring-stats-tab">{t(locale, 'ui.statsPlacedFarmers')}</div>
)

const DraftTab = ({ locale, players }: { locale: Locale; players: PlayerState[] }) => (
  <div className="scoring-draft-tab" />
)
```

The first test passes once tabs render; the Stats tab assertion only checks that the label "Placed farmers" appears (i.e., the tab is selected and we've at least stubbed one label).

- [ ] **Step 4: Update `GameContainerApi.tsx:1137` caller**

Find the place that renders `<ScoringPad />` and pass `players={state.players}`.

- [ ] **Step 5: Run, expect PASS for tab switching**

- [ ] **Step 6: Commit**

```bash
git add client/components/board/ScoringPad.tsx \
        client/components/board/__tests__/ScoringPad.test.tsx \
        client/app/GameContainerApi.tsx
git commit -m "feat(stats): ScoringPad tab navigation skeleton"
```

---

### Task 4.2: i18n keys for new tab content

**Files:**
- Modify: `shared/i18n/zh.ts`
- Modify: `shared/i18n/en.ts`

- [ ] **Step 1: Add tab + stat label keys**

In `shared/i18n/en.ts` `ui` section:

```ts
scoringTabScore: 'Score',
scoringTabStats: 'Stats',
scoringTabDraft: 'Draft',

statsPlacedFarmers: 'Placed farmers',
statsFirstPlayerCount: 'Times as first player',
statsTotalRoomsBuilt: 'Rooms built',
statsTotalMajorBuilt: 'Major improvements',
statsTotalMinorBuilt: 'Minor improvements',
statsTotalOccupationBuilt: 'Occupations played',

statsHarvestedGrain: 'Grain harvested',
statsHarvestedVegetable: 'Vegetable harvested',

statsResourcesFromBoard: 'Resources from board',
statsResourcesFromCards: 'Resources from cards',

statsResourcesConverted: 'Resources converted',
statsFoodFromConversion: 'Food from conversion',

draftHistoryHeader: 'Draft picks',
draftPlayedAt: 'played T{turn}',
draftDiscarded: 'Discarded',
```

In `shared/i18n/zh.ts`:

```ts
scoringTabScore: '得分',
scoringTabStats: '统计',
scoringTabDraft: '抓牌',

statsPlacedFarmers: '工人放置次数',
statsFirstPlayerCount: '当首家次数',
statsTotalRoomsBuilt: '建造房间数',
statsTotalMajorBuilt: '主要建筑数',
statsTotalMinorBuilt: '次要建筑数',
statsTotalOccupationBuilt: '出牌职业数',

statsHarvestedGrain: '收获谷物',
statsHarvestedVegetable: '收获蔬菜',

statsResourcesFromBoard: '行动格资源',
statsResourcesFromCards: '卡牌资源',

statsResourcesConverted: '转食物次数',
statsFoodFromConversion: '转出食物量',

draftHistoryHeader: '抓牌历史',
draftPlayedAt: '第 {turn} 回打出',
draftDiscarded: '弃掉',
```

- [ ] **Step 2: Verify translation lookup in tests**

Re-run: `pnpm exec vitest run client/components/board/__tests__/ScoringPad.test.tsx`
Expected: green (the test's `'Placed farmers'` assertion now resolves correctly).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(stats): i18n keys for ScoringPad new tabs"
```

---

### Task 4.3: Stats tab content

**Files:**
- Modify: `client/components/board/ScoringPad.tsx`
- Test: extend `ScoringPad.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('renders all PlayerStats fields in Stats tab', () => {
  const players = [
    {
      id: 'p1', name: 'Alice',
      stats: {
        ...createInitialPlayerStats({ isFirstPlayer: true }),
        placedFarmers: 14,
        totalRoomsBuilt: 3,
        totalMajorBuilt: 1,
        totalMinorBuilt: 2,
        totalOccupationBuilt: 3,
        harvestedGrain: 5,
        harvestedVegetable: 1,
        resourcesFromBoard: { wood: 8, clay: 3 },
        resourcesFromCards: { wood: 2 },
        resourcesConverted: { grain: 2 },
        foodFromConversion: { grain: 4 },
      },
    },
    { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
  ] as any

  render(<ScoringPad locale="en" scores={mockScores} players={players} onClose={() => {}} />)
  fireEvent.click(screen.getByText('Stats'))

  expect(screen.getByText('Placed farmers')).toBeInTheDocument()
  expect(screen.getByText('14')).toBeInTheDocument()
  expect(screen.getByText('Times as first player')).toBeInTheDocument()
  expect(screen.getByText('Rooms built')).toBeInTheDocument()
  // ... assertions for each row
})

it('renders zero or empty cleanly without empty rows', () => {
  const players = [
    { id: 'p1', name: 'Alice', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
  ] as any
  render(<ScoringPad locale="en" scores={[]} players={players} onClose={() => {}} />)
  fireEvent.click(screen.getByText('Stats'))
  // structural rows still present (label) but with `0` values
  expect(screen.getByText('Placed farmers')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `<StatsTab>`**

Add to `ScoringPad.tsx`:

```tsx
import { ResourceLine } from '../common/ResourceLine'
// ...

type StatRow =
  | { kind: 'number'; labelKey: string; getValue: (s: PlayerStats) => number }
  | { kind: 'resources'; labelKey: string; getValue: (s: PlayerStats) => Partial<Resource> }

const STATS_ROWS: StatRow[] = [
  { kind: 'number', labelKey: 'ui.statsPlacedFarmers', getValue: (s) => s.placedFarmers },
  { kind: 'number', labelKey: 'ui.statsFirstPlayerCount', getValue: (s) => s.firstPlayerCount },
  { kind: 'number', labelKey: 'ui.statsTotalRoomsBuilt', getValue: (s) => s.totalRoomsBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalMajorBuilt', getValue: (s) => s.totalMajorBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalMinorBuilt', getValue: (s) => s.totalMinorBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalOccupationBuilt', getValue: (s) => s.totalOccupationBuilt },
  { kind: 'number', labelKey: 'ui.statsHarvestedGrain', getValue: (s) => s.harvestedGrain },
  { kind: 'number', labelKey: 'ui.statsHarvestedVegetable', getValue: (s) => s.harvestedVegetable },
  { kind: 'resources', labelKey: 'ui.statsResourcesFromBoard', getValue: (s) => s.resourcesFromBoard },
  { kind: 'resources', labelKey: 'ui.statsResourcesFromCards', getValue: (s) => s.resourcesFromCards },
  { kind: 'resources', labelKey: 'ui.statsResourcesConverted', getValue: (s) => s.resourcesConverted },
  { kind: 'resources', labelKey: 'ui.statsFoodFromConversion', getValue: (s) => s.foodFromConversion },
]

const StatsTab = ({
  locale, players,
}: { locale: Locale; players: PlayerState[] }) => {
  const gridTemplateColumns = `minmax(180px, 1.3fr) repeat(${players.length}, minmax(120px, 1fr))`
  return (
    <div className="scoring-grid">
      <div className="scoring-row scoring-header-row" style={{ gridTemplateColumns }}>
        <div className="scoring-cell scoring-label">{t(locale, 'ui.scoringItem')}</div>
        {players.map((p) => (
          <div key={p.id} className="scoring-cell scoring-player-name">{p.name}</div>
        ))}
      </div>
      {STATS_ROWS.map((row) => (
        <div key={row.labelKey} className="scoring-row" style={{ gridTemplateColumns }}>
          <div className="scoring-cell scoring-label">{t(locale, row.labelKey)}</div>
          {players.map((p) => {
            const v = row.getValue(p.stats)
            if (row.kind === 'number') {
              return (
                <div key={p.id} className="scoring-cell">
                  <div className="scoring-cell-value">{v as number}</div>
                </div>
              )
            }
            return (
              <div key={p.id} className="scoring-cell">
                <ResourceLine
                  locale={locale}
                  resources={v as Partial<Resource>}
                  className="scoring-cell-resources"
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(stats): Stats tab in ScoringPad"
```

---

### Task 4.4: Draft tab content

**Files:**
- Modify: `client/components/board/ScoringPad.tsx`
- Test: extend `ScoringPad.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('renders draft history per player with played turns', () => {
  const players = [
    {
      id: 'p1', name: 'Alice',
      stats: {
        ...createInitialPlayerStats({ isFirstPlayer: true }),
        draftHistory: [
          { cardId: 'A29_AleBenches', draftTurn: 1, playedTurn: 3 },
          { cardId: 'B12_Cookbook', draftTurn: 2 },
        ],
        draftDiscarded: ['D1_Foo'],
      },
    },
    { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
  ] as any

  render(<ScoringPad locale="en" scores={[]} players={players} onClose={() => {}} />)
  fireEvent.click(screen.getByText('Draft'))

  // Alice column shows her 2 picks
  expect(screen.getByText(/AleBenches/)).toBeInTheDocument()
  expect(screen.getByText(/played T3/)).toBeInTheDocument()
  expect(screen.getByText(/Cookbook/)).toBeInTheDocument()
  // discarded section
  expect(screen.getByText(/Discarded/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `<DraftTab>`**

```tsx
import { getCardDisplayName } from '../common/cardText'

const inferCardType = (cardId: string): 'major' | 'minor' | 'occupation' => {
  // Codebase convention: A/B/C/D/E + number prefix encodes the deck.
  // Confirm at implementation time by inspecting `getCardDisplayName` callers.
  // Fallback: try each type and return the first non-fallback result.
  const prefix = cardId.charAt(0)
  if (prefix === 'A' || prefix === 'C' || prefix === 'D') return 'occupation'
  if (prefix === 'B' || prefix === 'E') return 'minor'
  return 'occupation'
}

const DraftTab = ({
  locale, players,
}: { locale: Locale; players: PlayerState[] }) => (
  <div
    className="scoring-draft-tab"
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${players.length}, 1fr)`,
      gap: '16px',
    }}
  >
    {players.map((player) => (
      <div key={player.id} className="scoring-draft-column">
        <div className="scoring-draft-header">
          {player.name}
          <span className="scoring-draft-subheader">
            {' '}— {t(locale, 'ui.draftHistoryHeader')}
          </span>
        </div>
        <ul>
          {player.stats.draftHistory.map((entry) => {
            const name = getCardDisplayName(locale, inferCardType(entry.cardId), entry.cardId)
            return (
              <li key={entry.cardId}>
                T{entry.draftTurn} ▸ {name}
                {entry.playedTurn !== undefined ? (
                  <span className="scoring-draft-played">
                    {' '}({t(locale, 'ui.draftPlayedAt', { turn: entry.playedTurn })})
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        {player.stats.draftDiscarded.length > 0 ? (
          <div className="scoring-draft-discarded">
            <div className="scoring-draft-subheader">{t(locale, 'ui.draftDiscarded')}</div>
            <ul>
              {player.stats.draftDiscarded.map((cardId) => (
                <li key={cardId}>
                  {getCardDisplayName(locale, inferCardType(cardId), cardId)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    ))}
  </div>
)
```

Confirm `inferCardType` logic by spot-checking 3-4 cards in `shared/cards/`. If the prefix→type mapping is wrong, fix the function.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(stats): Draft tab in ScoringPad"
```

---

### Task 4.5: Visual sanity + locale toggle

- [ ] **Step 1: Start dev server**

Run: `./restart-intranet.sh` (per project CLAUDE.md)

- [ ] **Step 2: Manual visual check**

Play through a short 2-player game (or load a saved final state from `output/<dev-room>.json` if dev tooling supports it). Open ScoringPad, click each tab. Verify:

- Score tab: unchanged from before
- Stats tab: all 12 rows render, numbers and resource lines look right, both player columns
- Draft tab: 14 entries per player (in a full game), played turns annotated, Discarded section appears only when non-empty
- Locale switch (zh ↔ en) updates all labels

If anything looks wrong, fix and add a regression test.

- [ ] **Step 3: Commit any visual fixes**

---

### Task 4.6: PR-4 wrap

- [ ] **Step 1: Run full test + lint + build**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --title "feat(stats): ScoringPad tabs — Stats & Draft (PR-4/4)" \
  --body "..."
```

---

## Cross-PR exit criteria

After all four PRs land:

- [ ] `pnpm test` green (fast + slow)
- [ ] `pnpm run lint` clean
- [ ] `pnpm run build` clean
- [ ] Visual: end-to-end 2-player game produces correct numbers in all 3 tabs
- [ ] Update `docs/card_progress.md` §7 (基础设施) — "PlayerStats + Draft history (Track 3)"
- [ ] Update `docs/card_progress.md` §2 — date + summary

---

## Coordination with Track 1

Track 1 (per-card stats) and Track 3 share zero schema (Track 1 lives in `cardStates[id].extraData`, Track 3 lives in `player.stats`). Possible merge conflicts:

- `shared/actions/effects/gain.ts` — Track 1 PR-2 Task 2.4 adds pseudo-resource writes; Track 3 PR-3 Task 3.1 adds origin writes. Both are unrelated lines in the same function — trivial rebase.
- `shared/actions/effects/pay.ts` — Track 1 wires `recordPaymentStats`; Track 3 doesn't touch.

If both tracks reach PR-2/PR-3 simultaneously, merge whichever lands first; rebase the other.
