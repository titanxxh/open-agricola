# Sprint 5b Tail-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 张 P1 卡 tail-fix（C23 / A38 / A1 / A22 / E16）+ 2 个小通用扩展（stables `actionContext.zoneFilter / max`、fencing `computeFenceFreeAvailable` hook）。

**Architecture:** Each card-fix is independent and uses existing extension points (listener / `registerPrerequisite` / actionContext / effect hook). 0 main-path edits to `pay.ts` / `improvement.ts` / `game-session.ts`. A1 reuses existing `stables` effect via `actionContext`; no inline mini-flow.

**Tech Stack:** TypeScript, vitest, existing engine + listener system.

---

## File Map

| File | Responsibility | Touch |
|---|---|---|
| `shared/cards/C/C23_JobContract.ts` | C23 listener | Modify (delete 1 line + comment) |
| `server/__tests__/C23_JobContract-session.test.ts` | C23 session tests | Modify (flip 1-2 assertions, add 1 case) |
| `shared/cards/A/A38_WoolBlankets.ts` | A38 card def | Modify (prereq string + registerPrerequisite call inline) |
| `server/__tests__/A38_WoolBlankets-session.test.ts` | A38 session tests | Create (4 cases) |
| `shared/actions/effects/stables.ts` | stables action def | Modify (透传 actionContext) |
| `shared/logic/farm/farm-interaction.ts:111-138` | buildStableFarmInteraction | Modify (加 zoneFilter / max optional 参数) |
| `shared/session/game-core.ts:2780-2810` | stables placement handler | Modify (透传 actionContext.zoneFilter / max) |
| `shared/cards/A/A1_Shelter.ts` | A1 onBuy | Modify (用 actionContext) |
| `server/__tests__/A1_Shelter-session.test.ts` | A1 session tests | Create (3-4 cases) |
| `shared/cards/A/A22_Telegram.ts:32-58` | A22 listener | Modify (加 reserve guard + 注释) |
| `server/__tests__/A22_Telegram-session.test.ts` | A22 session tests | Create (3 cases) |
| `shared/cards/registry.ts` (or `card-effects.ts`) | CardEffect type | Modify (加 `computeFenceFreeAvailable` 字段) |
| `shared/cards/E/E16_BriarHedge.ts` | E16 effect | Modify (加 `computeFenceFreeAvailable` 实现) |
| `shared/actions/effects/fencing.ts:39-43` | canStartFencing | Modify (改签名加 state；走 hook 链) |
| `shared/cards/C/C88_CarpentersApprentice.ts:50` | caller | Modify (透传 state) |
| `shared/cards/B/B94_StockProtector.ts:51` | caller | Modify (透传 state) |
| `shared/cards/B/B26_AgrarianFences.ts:116,132` | caller (2 处) | Modify (透传 state / context.state) |
| `shared/actions/__tests__/fencing.test.ts:46,57` | fencing unit tests | Modify (透传 state) |
| `server/__tests__/E16_BriarHedge-session.test.ts` | E16 session test | Verify still passes |
| `shared/actions/effects/__tests__/fencing-entry-guard.test.ts` | new entry-guard unit tests | Create (4 cases) |
| `docs/card_progress.md` / `docs/master-plan.md` / `docs/ENGINE_ARCHITECTURE.md` / `docs/card_desc_audit.md` | doc sync | Modify |

---

## Task 1: C23 JobContract — Drop occupationHand guard

**Files:**
- Modify: `shared/cards/C/C23_JobContract.ts:59-61`
- Test: `server/__tests__/C23_JobContract-session.test.ts`

- [ ] **Step 1.1: Inspect current C23 test to find empty-hand assertion**

```bash
grep -n 'occupationHand\.length\|occupationHand: \[\]' server/__tests__/C23_JobContract-session.test.ts
```
Expected: locate any test asserting "empty hand → no SEQ flow". If no such test exists yet, skip Step 1.4 (just add new positive test).

- [ ] **Step 1.2: Write new failing test (empty hand still inserts fake worker)**

In `server/__tests__/C23_JobContract-session.test.ts`, add:

```ts
it('triggers fake-worker insertion at lessons even when occupationHand is empty', () => {
  const session = newTwoPlayerSession()
  const p1 = session.state.players[0]
  // Setup: P1 owns C23, no occupations in hand
  p1.minorPlayed.push('C23_JobContract')
  p1.occupationHand = []
  // Both day-laborer and lessons unoccupied
  // Place P1 farmer on day-laborer
  const resp = session.takeAction('day-laborer', { playerId: 'p1', workerId: '1' })
  // Lessons space should now have a fake worker from P1 (C23 effect)
  const lessons = session.state.actionSpaces.find((s) => s.id === 'lessons')!
  expect(lessons.takenBy.some((t) => t.playerId === 'p1')).toBe(true)
  // Pending should be the optional SEQ choice for play-occupation (or auto-resolved)
  expect(resp.ok).toBe(true)
})
```

- [ ] **Step 1.3: Run test to verify it fails**

```bash
pnpm exec vitest run server/__tests__/C23_JobContract-session.test.ts
```
Expected: FAIL — `lessons.takenBy` does not include p1, because line 61 returned early before `addWorkerRef`.

- [ ] **Step 1.4: Delete guard at line 59-61**

In `shared/cards/C/C23_JobContract.ts`, delete:

```ts
    // Check the player has at least one occupation in hand
    // (otherwise the lessons trigger is wasted).
    if (context.player.occupationHand.length === 0) return
```

- [ ] **Step 1.5: Run test to verify it passes**

```bash
pnpm exec vitest run server/__tests__/C23_JobContract-session.test.ts
```
Expected: PASS for new test. Existing tests should still pass; if any old test asserted "empty hand → no flow", flip its expectation:
- Old: `expect(resp.pending.type).toBe('none')` → New: `expect(resp.pending.type).toBe('choice')` or check that lessons is now occupied.

- [ ] **Step 1.6: Commit**

```bash
git add shared/cards/C/C23_JobContract.ts server/__tests__/C23_JobContract-session.test.ts
git commit -m "fix(C23): drop occupationHand guard so empty-hand path still triggers fake lessons"
```

---

## Task 2: A38 WoolBlankets — Change prereq to 5 Sheep

**Files:**
- Modify: `shared/cards/A/A38_WoolBlankets.ts`
- Test: `server/__tests__/A38_WoolBlankets-session.test.ts` (new)

- [ ] **Step 2.1: Inspect existing prereq registration pattern**

```bash
grep -n 'registerPrerequisite' shared/cards/E/E16_BriarHedge.ts
```
Expected: see `registerPrerequisite('1 Animal of Each Type', (player) => ...)` pattern at top level (module-load time).

- [ ] **Step 2.2: Write failing test — A38 not buyable with 4 sheep**

Create `server/__tests__/A38_WoolBlankets-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createTestPlayer } from '../../shared/game/player'  // or whatever helper
import { A38_WoolBlankets } from '../../shared/cards/A/A38_WoolBlankets'

describe('A38 Wool Blankets prerequisite', () => {
  it('is not buyable with 4 sheep on board', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorHand = ['A38_WoolBlankets']
    // 4 sheep distributed: 4 in pasture
    p1.pastures = [{ id: 'p0', size: 2, animalType: 'sheep', animalCount: 4, ... }]
    // Resources cleared
    p1.resources.sheep = 4
    
    expect(A38_WoolBlankets.isBuyable?.(session.state, p1) ?? false).toBe(false)
  })
  
  it('is buyable with 5 sheep on board', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorHand = ['A38_WoolBlankets']
    p1.pastures = [{ id: 'p0', size: 4, animalType: 'sheep', animalCount: 5, ... }]
    p1.resources.sheep = 5
    
    expect(A38_WoolBlankets.isBuyable?.(session.state, p1) ?? false).toBe(true)
  })
})
```

(Plan note: exact test setup helpers to be located via `grep 'createTestPlayer\|setupTestSession\|new GameSession' server/__tests__` and adapted to existing pattern — current 2-player test pattern lives in many files like `server/__tests__/A4_Baseboards-session.test.ts`; copy boilerplate from there.)

- [ ] **Step 2.3: Run test to verify it fails**

```bash
pnpm exec vitest run server/__tests__/A38_WoolBlankets-session.test.ts
```
Expected: FAIL — current prereq is "Wooden House" (always passes if wooden); 4-sheep test will pass when it should fail.

- [ ] **Step 2.4: Update A38 prereq + register handler**

Replace `shared/cards/A/A38_WoolBlankets.ts` content:

```ts
import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../game/types'

const CARD_ID = 'A38_WoolBlankets'

const countSheepOnBoard = (player: PlayerState): number => {
  let total = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'sheep') total += pasture.animalCount
  }
  if (player.houseAnimalType === 'sheep') total += player.houseAnimalCount
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal === 'sheep') total += 1
  }
  return total
}

registerPrerequisite('5 Sheep', (player) => countSheepOnBoard(player) >= 5)

export const A38_WoolBlankets = new MinorImprovement({
  id: CARD_ID,
  name: "Wool Blankets",
  deck: "A",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you live in a wooden/clay/stone house by then, you get 3/2/0 bonus <SCORE>."],
  cost: {},
  prerequisite: "5 Sheep",
  extraVp: true,
})

export const A38_WoolBlankets_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      if (player.houseType === 'wood') return 3
      if (player.houseType === 'clay') return 2
      return 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2.5: Run tests to verify pass**

```bash
pnpm exec vitest run server/__tests__/A38_WoolBlankets-session.test.ts
```
Expected: PASS.

- [ ] **Step 2.6: Add bonus VP test (3 / 2 / 0)**

Append to `A38_WoolBlankets-session.test.ts`:

```ts
it('awards 3 bonus VP for wooden house', () => {
  const session = new GameSession({ /* 2-player default */ })
  const p1 = session.state.players[0]
  p1.houseType = 'wood'
  p1.minorPlayed = ['A38_WoolBlankets']
  // 5+ sheep on board (so no resource cost — passes prereq + bonus calc)
  p1.pastures = [{ id: 'p0', size: 4, animalType: 'sheep', animalCount: 5, ... }]
  
  const scores = session.computeScores()
  // Expect bonus +3 from A38
  expect(scores[0].bonusVp).toBeGreaterThanOrEqual(3)
})

it('awards 2 bonus VP for clay house', () => {
  // Same as above but houseType = 'clay'; expect ≥2
})

it('awards 0 bonus VP for stone house', () => {
  // Same but houseType = 'stone'; expect bonus delta = 0
})
```

(Plan note: `computeScores` API or equivalent from existing test pattern — see `server/__tests__/computeBonus*.test.ts` if exists. Adapt to existing test conventions.)

- [ ] **Step 2.7: Run all A38 tests**

```bash
pnpm exec vitest run server/__tests__/A38_WoolBlankets-session.test.ts
```
Expected: All 4 cases PASS.

- [ ] **Step 2.8: Commit**

```bash
git add shared/cards/A/A38_WoolBlankets.ts server/__tests__/A38_WoolBlankets-session.test.ts
git commit -m "fix(A38): change prereq from Wooden House to 5 Sheep; register handler"
```

---

## Task 3: Stables effect — actionContext zoneFilter + max

**Files:**
- Modify: `shared/actions/effects/stables.ts`
- Modify: `shared/logic/farm/farm-interaction.ts:111-138`
- Modify: `shared/session/game-core.ts:2780-2810` (stables placement handler)

- [ ] **Step 3.1: Read current stables placement chain**

```bash
sed -n '2750,2830p' shared/session/game-core.ts
```
Expected: See how `actionContext`, `override` (cost override), and pending state are passed through. Confirm field names.

- [ ] **Step 3.2: Add `zoneFilter` and `max` parameters to buildStableFarmInteraction**

Modify `shared/logic/farm/farm-interaction.ts:111-138`:

```ts
export const buildStableFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  options?: {
    zoneFilter?: 'pasture-1'
    max?: number
  },
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  const lockedKeys = collectLockedFarmTileKeys(player)
  let selectableTiles = getAllTilePositions().filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
  // Apply zoneFilter (e.g. 'pasture-1' restricts to tiles inside size-1 pastures)
  if (options?.zoneFilter === 'pasture-1') {
    const oneSizePastureCells = new Set<string>()
    for (const pasture of player.pastures) {
      if (pasture.size === 1) {
        for (const cell of pasture.cells ?? []) {
          oneSizePastureCells.add(positionKey(cell))
        }
      }
    }
    selectableTiles = selectableTiles.filter((tile) =>
      oneSizePastureCells.has(positionKey(tile)),
    )
  }
  const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
  const structuralMax = Math.min(
    selectableTiles.length,
    Math.max(0, 4 - normalized.stableTiles.length),
    options?.max ?? Number.POSITIVE_INFINITY,
  )
  let resourceMax = 0
  for (let count = 1; count <= structuralMax; count += 1) {
    if (!canAffordTypedFlatCost(player, scaleCost(costPerStable, count), 'stables')) break
    resourceMax = count
  }
  return {
    farmType: 'stable',
    selectableTiles,
    maxSelections: resourceMax,
  }
}
```

(Plan verification: confirm `pasture.cells` exists on the Pasture type. If not, derive from `pasture.tiles` or whatever the field is — `grep -n 'cells\|tiles' shared/game/types.ts | head` to verify the Pasture interface.)

- [ ] **Step 3.3: Pass actionContext through stables placement handler**

In `shared/session/game-core.ts:2780-2810` area, find where `buildStableFarmInteraction(player, override)` (or equivalent) is called. Pass `actionContext.zoneFilter` and `actionContext.max`:

```ts
// Before:
const interaction = buildStableFarmInteraction(player, override)
// After:
const stablesContext = this.pending.actionContext ?? {}
const interaction = buildStableFarmInteraction(player, override, {
  zoneFilter: stablesContext.zoneFilter as 'pasture-1' | undefined,
  max: typeof stablesContext.max === 'number' ? stablesContext.max : undefined,
})
```

(Plan verification: confirm exact call site by reading `sed -n '2750,2830p' shared/session/game-core.ts`. The location of `buildStableFarmInteraction` call is the integration point.)

- [ ] **Step 3.4: Write failing test for A1 — no 1-size pasture skips placement**

Create `server/__tests__/A1_Shelter-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A1_Shelter } from '../../shared/cards/A/A1_Shelter'

describe('A1 Shelter onBuy stable placement', () => {
  it('skips placement when player has no 1-size pasture', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorHand = ['A1_Shelter']
    p1.pastures = []  // no pastures at all
    
    const resp = session.playMinor('p1', 'A1_Shelter')
    // No placement choice — pending should resolve cleanly without stable being added
    expect(p1.stableTiles).toHaveLength(0)
  })
})
```

- [ ] **Step 3.5: Update A1.onBuy to use actionContext**

Modify `shared/cards/A/A1_Shelter.ts`:

```ts
import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A1_Shelter'

export const A1_Shelter = new MinorImprovement({
  id: CARD_ID,
  name: 'Shelter',
  deck: 'A',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately build a stable at no cost, but only if you place it in a pasture covering exactly 1 farmyard space.'],
  cost: { wood: 0 },
  passing: true,
})

export const A1_Shelter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        costOverride: {},
        zoneFilter: 'pasture-1',
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

(Plan verification: confirm `costOverride` flows through onBuy → leaf → game-core. If costOverride is currently passed via different field (e.g. `params.costOverride` not `actionContext.costOverride`), adjust accordingly. Read `grep -n "costOverride" shared/cards/E/E*.ts shared/cards/B/B*.ts | head` to find existing pattern.)

- [ ] **Step 3.6: Run A1 tests**

```bash
pnpm exec vitest run server/__tests__/A1_Shelter-session.test.ts
```
Expected: PASS for "no 1-size pasture skips" case.

- [ ] **Step 3.7: Add 2 more A1 tests**

Append:

```ts
it('places free stable in 1-size pasture', () => {
  const session = new GameSession({ /* 2-player default */ })
  const p1 = session.state.players[0]
  p1.minorHand = ['A1_Shelter']
  // Setup: 1 pasture of size 1 at row 1, col 0
  p1.pastures = [{ id: 'p0', size: 1, cells: [{ row: 1, col: 0 }], animalType: null, animalCount: 0 }]
  p1.resources.wood = 0  // confirm free
  
  const resp = session.playMinor('p1', 'A1_Shelter')
  // Player chooses the 1-size pasture cell
  const stableResp = session.confirmStableSelection('p1', [{ row: 1, col: 0 }])
  expect(stableResp.ok).toBe(true)
  expect(p1.stableTiles).toHaveLength(1)
  expect(p1.resources.wood).toBe(0)  // free, no payment
})

it('limits to max 1 stable even if multiple 1-size pastures', () => {
  const session = new GameSession({ /* 2-player default */ })
  const p1 = session.state.players[0]
  p1.minorHand = ['A1_Shelter']
  // 2 pastures, both size 1
  p1.pastures = [
    { id: 'p0', size: 1, cells: [{ row: 1, col: 0 }], animalType: null, animalCount: 0 },
    { id: 'p1', size: 1, cells: [{ row: 1, col: 1 }], animalType: null, animalCount: 0 },
  ]
  
  const resp = session.playMinor('p1', 'A1_Shelter')
  // Selectable tiles include both, but maxSelections must equal 1
  expect(resp.pending.maxSelections ?? 1).toBe(1)
})
```

- [ ] **Step 3.8: Run all A1 tests**

```bash
pnpm exec vitest run server/__tests__/A1_Shelter-session.test.ts
```
Expected: All 3 cases PASS.

- [ ] **Step 3.9: Smoke test — existing stables-using cards still work**

```bash
pnpm exec vitest run server/__tests__/A89_StablePlanner-session.test.ts shared/cards/__tests__/B89*.test.ts
```
Expected: PASS unchanged. (Confirms 9 other `actionId:'stables'` callers don't regress when actionContext is empty.)

- [ ] **Step 3.10: Commit**

```bash
git add shared/actions/effects/stables.ts shared/logic/farm/farm-interaction.ts shared/session/game-core.ts shared/cards/A/A1_Shelter.ts server/__tests__/A1_Shelter-session.test.ts
git commit -m "feat(stables): zoneFilter + max actionContext; fix(A1): use 1-size pasture only"
```

---

## Task 4: A22 Telegram — hasFarmerInReserve guard

**Files:**
- Modify: `shared/cards/A/A22_Telegram.ts:32-58`
- Test: `server/__tests__/A22_Telegram-session.test.ts` (new)

- [ ] **Step 4.1: Confirm workersAvailable signature**

```bash
grep -n 'export const workersAvailable' shared/game/player.ts
```
Expected: `export const workersAvailable = (state: GameState, p: PlayerState): number => ...`

- [ ] **Step 4.2: Write failing test — A22 doesn't trigger when reserve empty**

Create `server/__tests__/A22_Telegram-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('A22 Telegram trigger conditions', () => {
  it('does not trigger when family is fully placed (no reserve)', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorPlayed = ['A22_Telegram']
    p1.cardStates = { A22_Telegram: { extraData: { triggerRound: 5 } } }
    session.state.round = 5
    // Place all of p1's workers on board (simulate)
    // Then call startOfTurn; expect no SEQ from A22
    const before = session.state.players[0].placedFarmers
    session.startOfTurnHooks?.('p1')
    // No new pending choice with sourceCard = A22
    expect(session.pending.sourceCard).not.toBe('A22_Telegram')
  })
  
  it('triggers when reserve has at least 1 worker', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorPlayed = ['A22_Telegram']
    p1.cardStates = { A22_Telegram: { extraData: { triggerRound: 5 } } }
    session.state.round = 5
    // p1 has at least 1 worker at home (default 2-player game start state)
    
    session.startOfTurnHooks?.('p1')
    // A22 should fire
    expect(session.pending.sourceCard).toBe('A22_Telegram')
  })
  
  it('does not trigger if round != triggerRound', () => {
    const session = new GameSession({ /* 2-player default */ })
    const p1 = session.state.players[0]
    p1.minorPlayed = ['A22_Telegram']
    p1.cardStates = { A22_Telegram: { extraData: { triggerRound: 7 } } }
    session.state.round = 5  // ≠ 7
    
    session.startOfTurnHooks?.('p1')
    expect(session.pending.sourceCard).not.toBe('A22_Telegram')
  })
})
```

(Plan note: actual `startOfTurnHooks` API may differ — find via `grep -n 'onBeforeStartOfTurn' server/game-session.ts shared/session/game-core.ts | head -3`. Adjust trigger entrypoint to match.)

- [ ] **Step 4.3: Run test — fail on case 1**

```bash
pnpm exec vitest run server/__tests__/A22_Telegram-session.test.ts
```
Expected: FAIL on "no reserve" case — A22 fires regardless of reserve, because the guard isn't there yet.

- [ ] **Step 4.4: Add hasFarmerInReserve guard**

Modify `shared/cards/A/A22_Telegram.ts:32-58`:

```ts
import { workersAvailable } from '../../game/player'  // 加 import

// ...

  onBeforeStartOfTurn: (state, player) => {
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    if (triggerRound === undefined || state.round !== triggerRound) return
    if (isCardFlagged(player, CARD_ID)) return
    // BGA hasFarmerInReserve equivalent: at least one worker not currently placed.
    // Without this guard, A22 would offer an extra placement even when the player
    // has no farmer to place (BGA Telegram::activate explicitly checks this).
    if (workersAvailable(state, player) === 0) return
    setCardFlag(player, CARD_ID, true)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
```

- [ ] **Step 4.5: Run all A22 tests**

```bash
pnpm exec vitest run server/__tests__/A22_Telegram-session.test.ts
```
Expected: All 3 cases PASS.

- [ ] **Step 4.6: Add §2.5 deliberate-divergence entry to card_progress.md**

Append to the "刻意偏离" / "deliberate divergence" section in `docs/card_progress.md` (search §2.5 marker):

```markdown
- **A22 Telegram extraPlacement leaf 模拟 BGA flagCardNode**（2026-04-30 Sprint 5b 登记）：BGA `Telegram::activate()` 用 `flagCardNode + Engine::insertAsChild($flow)` 让玩家这一回合可多放一次 worker（玩家自己选何时放）；我方在 `onBeforeStartOfTurn` 直接弹 SEQ optional + place-farmer leaf with `actionContext.extraPlacement`，玩家立即响应。两者实际游戏效果等价（都让玩家多放一次 worker，不消耗 family pool），我方语义更紧凑；不影响动画 / 计分 / 跨卡交互。`hasFarmerInReserve` 守卫已在 5b 加上（`workersAvailable(state, player) === 0` → no fire）。
```

- [ ] **Step 4.7: Commit**

```bash
git add shared/cards/A/A22_Telegram.ts server/__tests__/A22_Telegram-session.test.ts docs/card_progress.md
git commit -m "fix(A22): add hasFarmerInReserve guard; document extraPlacement as deliberate divergence"
```

---

## Task 5: Fencing — computeFenceFreeAvailable hook + canStartFencing rewrite

**Files:**
- Modify: `shared/cards/registry.ts` (or `card-effects.ts` — find via grep)
- Modify: `shared/cards/E/E16_BriarHedge.ts`
- Modify: `shared/actions/effects/fencing.ts:39-43, 64`
- Modify: callers — `shared/cards/C/C88_CarpentersApprentice.ts:50` / `B94_StockProtector.ts:51` / `B26_AgrarianFences.ts:116,132`
- Modify: `shared/actions/__tests__/fencing.test.ts:46,57`
- Test: `shared/actions/effects/__tests__/fencing-entry-guard.test.ts` (new)

- [ ] **Step 5.1: Locate CardEffect interface**

```bash
grep -rn 'computeFenceDiscount' shared/cards/ | head -3
```
Expected: locate the type file containing `computeFenceDiscount` (likely `shared/cards/registry.ts` or `shared/cards/card-effects.ts`). Add the new hook in the same place.

- [ ] **Step 5.2: Add computeFenceFreeAvailable hook to CardEffect interface**

In the file holding `CardEffect` type (e.g. `shared/cards/registry.ts`):

```ts
export interface CardEffect {
  // ... existing hooks ...
  
  // Returns the maximum number of free fences the player can build right now
  // (e.g. E16 returns count of unused border edges). Used by canStartFencing
  // entry-guard to check whether the player can fence at all considering
  // free-fence sources, mirroring BGA getMaxBuildableFences.
  computeFenceFreeAvailable?: (state: GameState, player: PlayerState) => number
}
```

- [ ] **Step 5.3: Implement computeFenceFreeAvailable on E16**

Modify `shared/cards/E/E16_BriarHedge.ts`. Add helper to count available border edges + register hook:

```ts
import { isBorderEdge, getAllPossibleEdges } from '../../game/farm'
// ... existing imports

const countAvailableBorderEdges = (player: PlayerState): number => {
  const builtFenceEdgeKeys = new Set(
    player.fences?.map((f) => `${f.row},${f.col},${f.side}`) ?? [],
  )
  let count = 0
  for (const edge of getAllPossibleEdges(player)) {
    if (!isBorderEdge(edge)) continue
    const key = `${edge.row},${edge.col},${edge.side}`
    if (builtFenceEdgeKeys.has(key)) continue
    count += 1
  }
  return count
}

export const E16_BriarHedge_impl = {
  effect: {
    id: CARD_ID,
    computeFenceDiscount: (_state, _player, ctx) => {
      return ctx.newFenceEdges.filter(isBorderEdge).length
    },
    computeFenceFreeAvailable: (_state, player) => countAvailableBorderEdges(player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

(Plan verification: `getAllPossibleEdges(player)` may not exist; find how player's fence-able edges are enumerated via `grep -n 'BorderEdge\|getEdges\|allEdges\|fenceEdges' shared/game/farm.ts shared/actions/effects/fencing.ts`. Use whichever helper / iterate raw `(rows×cols×sides)` set.)

- [ ] **Step 5.4: Write failing entry-guard tests**

Create `shared/actions/effects/__tests__/fencing-entry-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canStartFencing } from '../fencing'
import { createMockState, createMockPlayer } from '../../../game/__test-helpers__'  // or whatever helper

describe('canStartFencing entry-guard', () => {
  it('returns false when no fence-discount cards and 0 wood', () => {
    const state = createMockState()
    const player = createMockPlayer({ resources: { wood: 0 } })
    expect(canStartFencing(state, player)).toBe(false)
  })
  
  it('returns true when player has E16 and 0 wood (border-edge fence is free)', () => {
    const state = createMockState()
    const player = createMockPlayer({
      resources: { wood: 0 },
      minorPlayed: ['E16_BriarHedge'],
    })
    expect(canStartFencing(state, player)).toBe(true)
  })
  
  it('returns false when fence cap is reached', () => {
    const state = createMockState()
    const player = createMockPlayer({
      resources: { wood: 10 },
      fences: Array.from({ length: 14 }, (_, i) => ({ row: 0, col: i, side: 'top' })),
    })
    expect(canStartFencing(state, player)).toBe(false)
  })
  
  it('returns false when pasture cap is reached', () => {
    const state = createMockState()
    const player = createMockPlayer({
      resources: { wood: 10 },
      pastures: [{ size: 15, /* fills board */ }],  // simulate max cells
    })
    expect(canStartFencing(state, player)).toBe(false)
  })
})
```

(Plan note: exact mock helpers to be found via `grep -rn 'createMockPlayer\|createTestPlayer' shared/`. Use existing convention.)

- [ ] **Step 5.5: Run tests — fail because canStartFencing needs new sig + hook**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/fencing-entry-guard.test.ts
```
Expected: COMPILE FAIL — `canStartFencing(state, player)` 2 args but current sig is 1 arg.

- [ ] **Step 5.6: Rewrite canStartFencing to take state + walk effect chain**

Modify `shared/actions/effects/fencing.ts:39-43`:

```ts
import { getCardImpl } from '../../cards/registry'  // adjust import path

export const canStartFencing = (state: GameState, player: PlayerState) => {
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  
  // BGA-style: total max buildable = wood-affordable + sum(free fences from cards)
  const woodAffordable = Math.floor(player.resources.wood / 1)
  let maxBuildable = woodAffordable
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const impl = getCardImpl(cardId)
    const free = impl?.effect?.computeFenceFreeAvailable?.(state, player)
    if (typeof free === 'number') maxBuildable += free
  }
  return maxBuildable >= minimumFenceSegments
}
```

(Plan note: BGA also walks `canCreateNewPasture(nFences)` to check if a valid pasture is reachable with that many fences. For 5b YAGNI: skip pasture-shape solver — just check `maxBuildable >= minimumFenceSegments` + existing pasture-cells / fence-cap caps. If we hit a real bug in playtest where "玩家可以拿 wood 但所有 placement 都非法", revisit; for now, pasture-cells cap covers most cases.)

- [ ] **Step 5.7: Update fenceAction.canBeExecutedByPlayer at line 64**

Modify `shared/actions/effects/fencing.ts:64`:

```ts
canBeExecutedByPlayer: (state, player) => canStartFencing(state, player),
```

- [ ] **Step 5.8: Update C88 caller**

Modify `shared/cards/C/C88_CarpentersApprentice.ts:50`:

```ts
// Before: if (!canStartFencing(previewPlayer)) return
// After:
if (!canStartFencing(state, previewPlayer)) return
```

(In context, `state` should be available from the listener context. If previewPlayer is the only thing available, accept passing the same state from the listener context — find via `grep -n 'canStartFencing' shared/cards/C/C88_CarpentersApprentice.ts` and read surrounding 5 lines.)

- [ ] **Step 5.9: Update B94 caller**

Modify `shared/cards/B/B94_StockProtector.ts:51`:

```ts
if (!canStartFencing(state, previewPlayer)) return
```

- [ ] **Step 5.10: Update B26 callers (2 sites)**

Modify `shared/cards/B/B26_AgrarianFences.ts:116, 132`:

```ts
// Before: if (canStartFencing(context.player)) {
// After:
if (canStartFencing(context.state, context.player)) {
```

- [ ] **Step 5.11: Update existing fencing.test.ts callers**

Modify `shared/actions/__tests__/fencing.test.ts:46, 57`:

```ts
// Before: expect(canStartFencing(player)).toBe(true)
// After:
const state = makeMinimalState(player)  // or similar
expect(canStartFencing(state, player)).toBe(true)
```

(Plan note: read existing imports in the file and use whatever state helper is convention.)

- [ ] **Step 5.12: Run all fencing tests**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/fencing-entry-guard.test.ts shared/actions/__tests__/fencing.test.ts server/__tests__/E16_BriarHedge-session.test.ts
```
Expected: All PASS.

- [ ] **Step 5.13: Run B26 / B94 / C88 session tests as smoke check**

```bash
pnpm exec vitest run shared/cards/__tests__/B26*.test.ts server/__tests__/B26*.test.ts shared/cards/__tests__/B94*.test.ts shared/cards/__tests__/C88*.test.ts
```
Expected: PASS unchanged.

- [ ] **Step 5.14: Commit**

```bash
git add shared/cards/registry.ts shared/cards/E/E16_BriarHedge.ts shared/actions/effects/fencing.ts shared/cards/C/C88_CarpentersApprentice.ts shared/cards/B/B94_StockProtector.ts shared/cards/B/B26_AgrarianFences.ts shared/actions/__tests__/fencing.test.ts shared/actions/effects/__tests__/fencing-entry-guard.test.ts
git commit -m "feat(fencing): computeFenceFreeAvailable hook; fix(E16): entry-guard considers fence discount"
```

---

## Task 6: Documentation sync

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/card_desc_audit.md`

- [ ] **Step 6.1: Update card_progress.md changelog (§2.0)**

Append a new changelog entry near the top of §2.0:

```markdown
- **2026-04-30 Sprint 5b — C23 / A38 / A1 / A22 / E16 tail-fixes**：
  - **C23 JobContract**：删 `occupationHand.length === 0` 守卫，BGA `legacy isDoable` 不检查 occupation 在手——空手玩家也能让 lessons space 被假 worker 占用，让 A113 / B155 等 lessons-listener 卡能正确触发跨卡交互。
  - **A38 WoolBlankets**：prereq 改 `Wooden House → 5 Sheep`，加 inline `countSheepOnBoard(player)` + `registerPrerequisite('5 Sheep', ...)`；scan player.pastures + houseAnimal + stableAnimals 三处 sheep 总和。
  - **A1 Shelter**：onBuy 加 `actionContext: { max:1, costOverride:{}, zoneFilter:'pasture-1' }`；stables effect 扩展 `actionContext.max + zoneFilter`，`buildStableFarmInteraction` 加可选第三参数透传到 selectableTiles filter；A1 现在仅在 size=1 pasture 中放免费 stable，且最多 1 个。
  - **A22 Telegram**：加 `workersAvailable(state, player) === 0` 守卫（BGA `hasFarmerInReserve` 等价）；保留 `extraPlacement leaf` 模拟 `flagCardNode` 的偏差登记到 §2.5。
  - **E16 Briar Hedge**：新增 `CardEffect.computeFenceFreeAvailable` hook；`canStartFencing` 改签名 `(state, player)`，遍历持卡 effect 累加 free fence 上限（BGA `getMaxBuildableFences`-style）；E16 实现返回 `countAvailableBorderEdges`。caller 同步 6 处（B26 / B94 / C88 / fenceAction.canBeExecutedByPlayer / 2 测试）。
  - 测试新增：A38 4 例 / A1 3 例 / A22 3 例 / fencing-entry-guard 4 例 / C23 翻 1 + 加 1。spec / plan：`docs/superpowers/specs/2026-04-30-sprint-5b-tail-fixes-design.md` / `docs/superpowers/plans/2026-04-30-sprint-5b-tail-fixes.md`。
```

- [ ] **Step 6.2: Update card_progress.md §2.3 — move done cards out**

In §2.3 deferred list, mark resolved 5 cards:

```markdown
- ~~**C23**~~ ✅ Sprint 5b — empty-hand guard removed; lessons listener cascade works
- ~~**A38**~~ ✅ Sprint 5b — prereq fixed to 5 Sheep + registerPrerequisite handler
- ~~**A1 Shelter**~~ ✅ Sprint 5b — onBuy uses 1-size pasture only, free stable, max 1
- ~~**A22 Telegram**~~ ✅ Sprint 5b — hasFarmerInReserve guard added; extraPlacement vs flagCardNode logged in §2.5
- ~~**E16 Briar Hedge**~~ ✅ Sprint 5b — entry-guard now considers fence-discount effects (computeFenceFreeAvailable hook)
```

(Find the exact deferred subsection — search for "Sprint 5 PR-5 deferred" or "B 牌组 wide-scan" and locate the 5 entries.)

- [ ] **Step 6.3: Update card_progress.md §2.5 (already done in Task 4 step 4.6)**

Verify the A22 §2.5 entry is in place from Task 4 — it should have been committed already. If not, re-add.

- [ ] **Step 6.4: Update card_progress.md §7 infra**

Append:

```markdown
| **stables effect — `actionContext.zoneFilter / max`**（2026-04-30, Sprint 5b） | ✅ | `shared/actions/effects/stables.ts` 通过 `actionContext` 接受可选 `zoneFilter?: 'pasture-1'`（限定可放 zone）+ `max?: number`（限定本次最多放几个）。`buildStableFarmInteraction(player, costOverride?, options?)` 新加第三参数 `{zoneFilter, max}` 透传到 selectableTiles filter / structuralMax cap。`game-core.ts` stables placement handler 透传 `pending.actionContext.zoneFilter / max` 到 helper。消费者：A1 Shelter（`'pasture-1'`，max:1）。`costOverride` 已早期支持。|
| **fencing entry-guard — `computeFenceFreeAvailable` hook**（2026-04-30, Sprint 5b） | ✅ | `CardEffect.computeFenceFreeAvailable?: (state, player) => number` 返回该卡当前能贡献的"免费 fence 上限"。`canStartFencing(state, player)` 遍历 `[...improvements, ...minorPlayed]` 累加 free 计入 maxBuildable，对齐 BGA `getMaxBuildableFences`。E16 实现：`countAvailableBorderEdges(player)`。canStartFencing 签名加 state 参数，6 个 caller（B26 ×2 / B94 / C88 / fenceAction.canBeExecutedByPlayer / 测试 2 处）同步。|
```

- [ ] **Step 6.5: Update card_progress.md §8 timeline**

Append row:

```markdown
| Sprint 5b (C23/A38/A1/A22/E16 tail-fixes + stables actionContext + fencing entry-guard hook) | 04-30 | 0 | 822 | 92.1% |
```

(Adjust the count column if cards-implemented total changed; Sprint 5b doesn't add new cards, just fixes 5 existing → count stays at 822.)

- [ ] **Step 6.6: Update master-plan.md §1 / §8**

In `docs/master-plan.md` §8 Sprint 5 row, update progress: 20/28 → 25/28, append `+ ~1.8 day (5b)` to time column, add Sprint 5b entries to spec / plan / branch columns:

```markdown
| 5      | P1 单卡行为偏差 | 28 | 9 day | ~existing... + ~1.8 day (5b) | partially done (25/28; ... + 5b 5 张 (C23/A38/A1/A22/E16) tail-fixes; remaining 3 deferred — A165 PigBreeder + B155 ArtTeacher + C/wide-scan tail closed via §5.7 audit rerun) | ... + docs/superpowers/specs/2026-04-30-sprint-5b-tail-fixes-design.md | ... + docs/superpowers/plans/2026-04-30-sprint-5b-tail-fixes.md | ... / sprint-5b-tail-fixes |
```

(Adjust exact text based on current row content — find via `grep -n '| 5' docs/master-plan.md`.)

- [ ] **Step 6.7: Update ENGINE_ARCHITECTURE.md — add §15.6 and §15.7**

Append to section 15 (after mech-E §15.5):

```markdown
## 15.6 stables effect — `actionContext.zoneFilter / max` (Sprint 5b)

`shared/actions/effects/stables.ts` 接受 `actionContext` 上的两个可选字段：

- `zoneFilter?: 'pasture-1'`：限定可放 stable 的 tile 子集；`'pasture-1'` 表示仅 size=1 的 pasture 内 cells（A1 Shelter 用）
- `max?: number`：限定本次最多放几个 stable，会被 `buildStableFarmInteraction` 内的 `structuralMax` 取 min

`costOverride: Partial<Resource>` 早期已支持（`buildStableFarmInteraction` 第 2 参数），`zoneFilter / max` 通过 `options` 第 3 参数加入。`game-core.ts` stables 处理透传 `pending.actionContext` 到 helper。9 张其他 `actionId:'stables'` 卡（E89/C94/C2/B16/B89/A150/A89/A15）不传新字段时维持原行为。

### 调用约定

```ts
{
  type: 'leaf',
  actionId: 'stables',
  sourceCard: 'CARD_ID',
  actionContext: {
    max: 1,
    costOverride: {},
    zoneFilter: 'pasture-1',
  },
}
```

## 15.7 fencing entry-guard — `computeFenceFreeAvailable` hook (Sprint 5b)

`CardEffect` 接口新增可选 hook：

```ts
computeFenceFreeAvailable?: (state: GameState, player: PlayerState) => number
```

返回该卡当前能贡献的「免费 fence 上限」。`canStartFencing(state, player)` 在 `shared/actions/effects/fencing.ts` 遍历 `[...player.improvements, ...player.minorPlayed]`，累加每张卡的 free count 计入 `maxBuildable`，对齐 BGA `getMaxBuildableFences`-style 算法。如果 `maxBuildable >= minimumFenceSegments` 通过 entry-guard。

### 与 `computeFenceDiscount` 双轨

- **`computeFenceFreeAvailable(state, player)`**：entry-guard 阶段，返回上限（不要求 `ctx.newFenceEdges`）
- **`computeFenceDiscount(state, player, ctx)`**：实际 payment 阶段，按真实选边算 discount

E16 BriarHedge 同时提供两者；其他 fence-discount 卡（C16 / C88 / E74 等）按需贡献，不阻塞 5b。

### 签名变化

`canStartFencing` 第一参数从 `player` 改为 `state, player`。6 个 caller 全部同步：
- `fenceAction.canBeExecutedByPlayer` (fencing.ts:64)
- `B26_AgrarianFences.ts:116, 132`
- `B94_StockProtector.ts:51`
- `C88_CarpentersApprentice.ts:50`
- 单元测试 `fencing.test.ts:46, 57`
```

- [ ] **Step 6.8: Update card_desc_audit.md §5.7**

In §5.7 (the wide-scan rerun subsection), update the E16 mention to reflect 5b fix:

```markdown
- **E16 Briar Hedge**：~~🟡 simplified — `canStartFencing` 仍需 wood≥4，与折扣解耦~~ ✅ **Sprint 5b 已修**：`canStartFencing` 改签名 `(state, player)` 走 `computeFenceFreeAvailable` hook 累加 free fence 上限；E16 现在 0 wood + 有 border edge 即可进 fence action。
```

(Find the existing E16 line in §5.7 and replace.)

- [ ] **Step 6.9: Run lint + build to make sure no broken docs**

```bash
pnpm run lint 2>&1 | tail -10
pnpm run build 2>&1 | tail -10
```
Expected: lint exit 0, no new errors. build success.

- [ ] **Step 6.10: Run full fast test suite**

```bash
pnpm test:fast 2>&1 | tail -10
```
Expected: all 271+ test files pass; no regressions.

- [ ] **Step 6.11: Commit**

```bash
git add docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md docs/card_desc_audit.md
git commit -m "docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / card_desc_audit for sprint-5b"
```

---

## Final Validation

- [ ] **Step F.1: Inspect commit list**

```bash
git log --oneline origin/main..HEAD
```
Expected: 6 commits in order:
1. `fix(C23): drop occupationHand guard so empty-hand path still triggers fake lessons`
2. `fix(A38): change prereq from Wooden House to 5 Sheep; register handler`
3. `feat(stables): zoneFilter + max actionContext; fix(A1): use 1-size pasture only`
4. `fix(A22): add hasFarmerInReserve guard; document extraPlacement as deliberate divergence`
5. `feat(fencing): computeFenceFreeAvailable hook; fix(E16): entry-guard considers fence discount`
6. `docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / card_desc_audit for sprint-5b`

- [ ] **Step F.2: Final test run**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```
Expected: all green, 0 errors.

- [ ] **Step F.3: Hand off for push**

Report:
> "Sprint 5b implementation complete. 6 commits ready on `sprint-5b-tail-fixes` branch.
> Tests: fast PASS (271+ files). Lint: 0 errors.
> Push command (manual, after rebase if needed):
> ```bash
> cd /data00/home/xuxinhao.titan/raw/open-agricola
> git fetch origin main
> # If main moved: cd .worktree/sprint-5b-tail-fixes && git rebase origin/main
> git checkout main && git merge --ff-only sprint-5b-tail-fixes && git push origin main
> ```
> Then verify CI on https://github.com/titanxxh/open-agricola/actions."

---

## Spec Coverage Self-Check

- [x] §1 5 张卡 + 2 通用扩展 → Tasks 1-5
- [x] §2.1 C23 删守卫 → Task 1
- [x] §2.2 A38 prereq 5 Sheep + handler → Task 2
- [x] §2.3 A1 stables effect 扩展 + 1-size pasture → Task 3
- [x] §2.4 A22 hasFarmerInReserve guard + §2.5 doc → Task 4
- [x] §2.5 E16 fencing entry-guard hook → Task 5
- [x] §3 6 个 commit 粒度 → Tasks 1-6 各一 commit
- [x] §4 文档同步（4 docs）→ Task 6 全部覆盖
- [x] §5 测试策略（17 例 ~5 个文件）→ Tasks 1-5 各 step 内含 test-first
- [x] §6 风险点 — A1 stables 不允许 fallback inline → Task 3 步骤明确禁止
- [x] §7 验证 / DoD → Final Validation steps F.1-F.3
- [x] §8 工时 ~1.8d → 总工作量与 spec 一致（不写到 plan，但 task 数量级匹配）

---

## Notes for Implementer

1. **Test setup helpers**: This codebase has multiple test setup patterns (`createTestPlayer`, `new GameSession({ ... })`, `setupTestSession`). For each new test file, copy boilerplate from a recently-committed neighbor (e.g. `server/__tests__/A4_Baseboards-session.test.ts` for session tests, `shared/cards/__tests__/A151_Minstrel.test.ts` for unit tests). Don't invent new helpers.

2. **`getCardImpl(cardId)` import path**: Locate via `grep -rn 'export.*getCardImpl\|cardImpls\[' shared/cards/`. Use the canonical registry export.

3. **`actionContext` field naming**: existing convention may vary — `params.costOverride` or `actionContext.costOverride`. Always check existing callers (`grep -rn "costOverride" shared/cards/`) before deciding which field name to use; do not invent new ones.

4. **Pasture cells access**: `pasture.cells` may not be the actual field name — check `shared/game/types.ts` Pasture interface. Likely `pasture.tiles` or similar.

5. **`getAllPossibleEdges` for E16**: may not exist; iterate `(row 0..4) × (col 0..2) × (side 'top'|'right'|'bottom'|'left')` then filter out non-grid edges. See existing fence helpers for the pattern.

6. **`isBorderEdge` is already exported** from `shared/game/farm`.

7. **Don't invent main-path edits**: 0 changes to `shared/session/game-core.ts` outside the stables placement handler (Task 3 Step 3.3, ~5-line addition for actionContext透传). Don't touch `pay.ts` / `improvement.ts`.

8. **Plan adaptation**: if the actual code shape differs from this plan (e.g. `actionContext` doesn't have a `costOverride` field but `params` does, or `getCardImpl` is named `findCardImpl`), adapt to existing convention; don't force the plan's naming.
