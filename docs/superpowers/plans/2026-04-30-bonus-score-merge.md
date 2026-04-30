# Bonus Scoring 求解器化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc `scoringPriority` + `ctx.reserved` bonus scoring with a Pareto-optimal solver that enumerates costed-card level combinations.

**Architecture:** 5 "costed" bonus cards (A136 / C99 / C133 / E132 / D132) declare `BonusScoreLevel[]` candidates via new `computeCostedBonus` hook; solver enumerates Cartesian product, filters infeasible combos, picks max-score. 50 "free" bonus cards keep `(state, player, ctx) => number`. Solver subtracts cost from `player.resources` on commit so D60 LargePottery + Major-card scoring read the final remaining value directly. Removes `computePostScore` / `scoringPriority` / `reserved` fields entirely.

**Tech Stack:** TypeScript, vitest, Node 22. Spec at `docs/superpowers/specs/2026-04-30-bonus-score-merge-design.md`.

---

## File Structure

**Create:**
- `shared/logic/scoring-bonus-solver.ts` — `solveBonusScoring()` + helpers (`canAfford`, `addResources`, `subtractResources`)
- `shared/logic/__tests__/scoring-bonus-solver.test.ts` — unit tests for solver
- `shared/cards/helpers/pareto-bonus.ts` — `paretoOptimal()` helper used by C99

**Modify:**
- `shared/cards/card-effects.ts` — interface change: drop `computePostScore` / `scoringPriority` / `ScoringContext.reserved`; add `BonusScoreLevel` / `computeCostedBonus` / `BonusScoringContext`
- `shared/logic/scoring.ts` — replace `collectBonusScores` call with solver; Major scoring reads `player.resources` directly; drop postScore loop
- 5 costed cards: `A136 DrudgeryReeve`, `C133 Soldier`, `E132 VeggieLover`, `C99 GardenDesigner`, `D132 HideFarmer`
- 4 ex-postScore cards: `E159 OldMiser`, `D100 LordoftheManor`, `C31 WritingChamber`, `C135 Constable`
- `D60 LargePottery` — drop `ctx.reserved` read

**Influence-zone cleanup:**
- `client/services/llmPrompts.ts`
- `shared/custom-code/__tests__/ast-validator.test.ts`
- `scripts/audit-card-architecture.ts`
- `docs/CUSTOM_CARD_SANDBOX.md`
- `docs/card_progress.md` (§2.0 changelog + §3 infra entry)

---

## Phase A — Solver Foundation

### Task 1: Add `BonusScoreLevel` type + `computeCostedBonus` field (compile-stays-green)

**Files:**
- Modify: `shared/cards/card-effects.ts`

- [ ] **Step 1: Add `BonusScoreLevel` type and `BonusScoringContext`**

In `shared/cards/card-effects.ts`, add directly above `export type ScoringContext`:

```typescript
export type BonusScoreLevel = {
  /** Resource cost of selecting this level (subtracted from player.resources on commit). */
  cost: Partial<Resource>
  /** VP awarded for this level. */
  score: number
}

export type BonusScoringContext = {
  /** Snapshot of standard categories (fields/pastures/.../cards/cardsBonus).
   *  Read-only — bonus cards must not mutate. */
  categories: readonly ScoreCategoryResult[]
}

export type CostedBonusHandler = (
  state: GameState,
  player: PlayerState,
  ctx: BonusScoringContext,
) => BonusScoreLevel[]
```

Keep existing `ScoringContext` and `BonusScoreHandler` for now (deleted in Task 16).

- [ ] **Step 2: Add `computeCostedBonus` to `CardEffect`**

In `CardEffect` type (around line 159), after `computeBonusScore`:

```typescript
computeBonusScore?: BonusScoreHandler
computeCostedBonus?: CostedBonusHandler   // ← NEW
computePostScore?: (state: GameState, player: PlayerState, categories: ScoreCategoryResult[]) => number
```

- [ ] **Step 3: Add `'computeCostedBonus'` to `CardEffectField` union and `cardEffectHooks` array**

In `CardEffectField` (line 48):

```typescript
export type CardEffectField = CardEffectHook
  | 'resolveChoice'
  | 'computeBonusScore' | 'computePostScore' | 'computeSharedPostScore' | 'computeCostedBonus'
  | 'computeExtraRoomCapacity'
  | 'onComputeAnimalZones' | 'onComputeSowableFields' | 'onSowExtraField'
  | 'computeLockedFarmTiles' | 'computeFenceDiscount'
```

In `cardEffectHooks` array (line 55), add after `'computeSharedPostScore'`:

```typescript
  'computeBonusScore',
  'computePostScore',
  'computeSharedPostScore',
  'computeCostedBonus',   // ← NEW
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm run build 2>&1 | tail -20`
Expected: build succeeds, no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/cards/card-effects.ts
git commit -m "feat(scoring): add BonusScoreLevel type and computeCostedBonus hook scaffold"
```

---

### Task 2: Stub `solveBonusScoring()` + unit-test scaffold

**Files:**
- Create: `shared/logic/scoring-bonus-solver.ts`
- Create: `shared/logic/__tests__/scoring-bonus-solver.test.ts`

- [ ] **Step 1: Create solver stub**

Create `shared/logic/scoring-bonus-solver.ts`:

```typescript
import type { GameState, PlayerState, Resource } from '../game/types'
import type {
  BonusScoreLevel,
  BonusScoringContext,
  BonusScoreHandler,
  CostedBonusHandler,
} from '../cards/card-effects'

export type SolverInput = {
  state: GameState
  player: PlayerState
  ctx: BonusScoringContext
  freeHandlers: { cardId: string; handler: BonusScoreHandler }[]
  costedHandlers: { cardId: string; handler: CostedBonusHandler }[]
}

export type SolverEntry = {
  cardId: string
  score: number
  cost: Partial<Resource>
}

export type SolverResult = {
  entries: SolverEntry[]
  totalScore: number
  totalCost: Partial<Resource>
}

export function solveBonusScoring(input: SolverInput): SolverResult {
  // Stub — replaced in Task 3
  return { entries: [], totalScore: 0, totalCost: {} }
}
```

- [ ] **Step 2: Write failing unit tests**

Create `shared/logic/__tests__/scoring-bonus-solver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { solveBonusScoring } from '../scoring-bonus-solver'
import type { GameState, PlayerState } from '../../game/types'
import type { BonusScoringContext } from '../../cards/card-effects'

const makePlayer = (resources: Partial<PlayerState['resources']> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: {
    food: 0, wood: 0, clay: 0, stone: 0, reed: 0,
    grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0,
    ...resources,
  },
} as PlayerState)

const makeState = (): GameState => ({ players: [], round: 14 } as GameState)
const ctx: BonusScoringContext = { categories: [] }

describe('solveBonusScoring', () => {
  it('returns 0 score for empty input', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer(),
      ctx,
      freeHandlers: [],
      costedHandlers: [],
    })
    expect(result.totalScore).toBe(0)
    expect(result.totalCost).toEqual({})
    expect(result.entries).toEqual([])
  })

  it('sums pure free bonus scores', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer(),
      ctx,
      freeHandlers: [
        { cardId: 'A38', handler: () => 3 },
        { cardId: 'A101', handler: () => 2 },
      ],
      costedHandlers: [],
    })
    expect(result.totalScore).toBe(5)
    expect(result.entries).toEqual([
      { cardId: 'A38', score: 3, cost: {} },
      { cardId: 'A101', score: 2, cost: {} },
    ])
  })

  it('picks max costed level for single card with full resources', () => {
    // A136 pattern: 0/1/2/3 sets → 0/1/3/5 VP
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 3, clay: 3, stone: 3, reed: 3 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
            { cost: { wood: 3, clay: 3, stone: 3, reed: 3 }, score: 5 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(5)
    expect(result.totalCost).toEqual({ wood: 3, clay: 3, stone: 3, reed: 3 })
  })

  it('picks lower level when resources insufficient', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 1, clay: 1, stone: 1, reed: 1 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(1)
    expect(result.totalCost).toEqual({ wood: 1, clay: 1, stone: 1, reed: 1 })
  })

  it('coordinates two costed cards competing for shared resource', () => {
    // A136 (W,C,S,R sets, 1/3/5 VP) + C133 (W,S pairs, 1 VP each)
    // player has W=2, C=2, S=2, R=2
    // Best: A136 takes 2 sets (cost 2W2C2S2R, +3 VP), C133 takes 0 → total 3
    // Alt: A136 takes 1 set (cost 1W1C1S1R, +1 VP), C133 takes 1 pair (cost 1W1S, +1 VP) → total 2
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 2, clay: 2, stone: 2, reed: 2 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
        {
          cardId: 'C133',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, stone: 1 }, score: 1 },
            { cost: { wood: 2, stone: 2 }, score: 2 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(3)
  })

  it('lets free card see remaining resources after costed commit (D60 pattern)', () => {
    // Player has clay=4. A136 takes K sets (cost K clay among others).
    // D60 free reads remaining clay: clay>=3 → +1 VP, clay>=5 → +2, clay>=6 → +3, clay>=7 → +4.
    // Best: A136 takes 0 (no clay loss), D60 sees clay=4 → +1; total +1
    // Or: A136 takes 1 (clay=3), D60 sees clay=3 → +1; total +1+1 = 2
    // Or: A136 takes 2 (clay=2), D60 sees clay=2 → 0; total +3
    // Best is A136=2 + D60=0 → 3.
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 4, clay: 4, stone: 4, reed: 4 }),
      ctx,
      freeHandlers: [
        {
          cardId: 'D60',
          handler: (_s, p) => {
            const c = p.resources.clay
            if (c >= 7) return 4
            if (c >= 6) return 3
            if (c >= 5) return 2
            if (c >= 3) return 1
            return 0
          },
        },
      ],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
            { cost: { wood: 3, clay: 3, stone: 3, reed: 3 }, score: 5 },
          ],
        },
      ],
    })
    // A136=3 sets cost 3W3C3S3R (clay=4-3=1) → +5 VP, D60 sees clay=1 → 0; total 5
    // A136=4 sets impossible (only 4 clay/wood... but reed=4 limits, max 4 sets, but level only goes to 3). max 3 sets → +5+0=5
    expect(result.totalScore).toBe(5)
  })

  it('mutates player.resources on commit', () => {
    const player = makePlayer({ wood: 3, clay: 3, stone: 3, reed: 3 })
    solveBonusScoring({
      state: makeState(),
      player,
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
      ],
    })
    expect(player.resources.wood).toBe(1)
    expect(player.resources.clay).toBe(1)
    expect(player.resources.stone).toBe(1)
    expect(player.resources.reed).toBe(1)
  })
})
```

- [ ] **Step 3: Run unit tests — verify they fail**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring-bonus-solver.test.ts 2>&1 | tail -30`
Expected: tests fail (stub returns 0/empty for all inputs).

- [ ] **Step 4: Commit**

```bash
git add shared/logic/scoring-bonus-solver.ts shared/logic/__tests__/scoring-bonus-solver.test.ts
git commit -m "test(scoring): solver unit tests (red) + stub"
```

---

### Task 3: Implement `solveBonusScoring()` (turn red→green)

**Files:**
- Modify: `shared/logic/scoring-bonus-solver.ts`

- [ ] **Step 1: Replace stub with real implementation**

Replace the stub `solveBonusScoring` with full Cartesian-product solver:

```typescript
import type { GameState, PlayerState, Resource } from '../game/types'
import type {
  BonusScoreLevel,
  BonusScoringContext,
  BonusScoreHandler,
  CostedBonusHandler,
} from '../cards/card-effects'

export type SolverInput = {
  state: GameState
  player: PlayerState
  ctx: BonusScoringContext
  freeHandlers: { cardId: string; handler: BonusScoreHandler }[]
  costedHandlers: { cardId: string; handler: CostedBonusHandler }[]
}

export type SolverEntry = {
  cardId: string
  score: number
  cost: Partial<Resource>
}

export type SolverResult = {
  entries: SolverEntry[]
  totalScore: number
  totalCost: Partial<Resource>
}

const RESOURCE_KEYS: (keyof Resource)[] = [
  'food', 'wood', 'clay', 'stone', 'reed',
  'grain', 'vegetable',
  'sheep', 'boar', 'cattle', 'begging',
]

function canAfford(have: Partial<Resource>, need: Partial<Resource>): boolean {
  for (const k of RESOURCE_KEYS) {
    if ((have[k] ?? 0) < (need[k] ?? 0)) return false
  }
  return true
}

function addResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const k of RESOURCE_KEYS) {
    const v = b[k]
    if (v !== undefined && v !== 0) out[k] = (out[k] ?? 0) + v
  }
  return out
}

function subtractResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const k of RESOURCE_KEYS) {
    const v = b[k]
    if (v !== undefined && v !== 0) out[k] = Math.max(0, (out[k] ?? 0) - v)
  }
  return out
}

export function solveBonusScoring(input: SolverInput): SolverResult {
  const { state, player, ctx, freeHandlers, costedHandlers } = input
  const playerResourcesSnapshot: Partial<Resource> = { ...player.resources }

  // 1. Collect levels per costed card (call handlers once on snapshot state)
  const allLevels: { cardId: string; levels: BonusScoreLevel[] }[] = costedHandlers.map(({ cardId, handler }) => {
    let levels: BonusScoreLevel[]
    try {
      levels = handler(state, player, ctx)
    } catch {
      levels = [{ cost: {}, score: 0 }]
    }
    if (levels.length === 0) levels = [{ cost: {}, score: 0 }]
    return { cardId, levels }
  })

  // 2. Enumerate Cartesian product, track best
  let bestScore = -Infinity
  let bestCombo: { cardId: string; level: BonusScoreLevel }[] = []
  let bestCost: Partial<Resource> = {}

  function recurse(idx: number, accCombo: { cardId: string; level: BonusScoreLevel }[], accCost: Partial<Resource>) {
    if (idx === allLevels.length) {
      if (!canAfford(playerResourcesSnapshot, accCost)) return
      const remaining = subtractResources(playerResourcesSnapshot, accCost)
      const playerClone = { ...player, resources: { ...player.resources, ...remaining } } as PlayerState
      const costedScore = accCombo.reduce((sum, { level }) => sum + level.score, 0)
      let freeScore = 0
      for (const { handler } of freeHandlers) {
        try {
          freeScore += handler(state, playerClone, ctx)
        } catch {
          // skip throwing handler in scoring; aligns with current collectBonusScores
        }
      }
      const total = costedScore + freeScore
      if (total > bestScore) {
        bestScore = total
        bestCombo = [...accCombo]
        bestCost = { ...accCost }
      }
      return
    }
    for (const level of allLevels[idx].levels) {
      const nextCost = addResources(accCost, level.cost)
      if (!canAfford(playerResourcesSnapshot, nextCost)) continue
      accCombo.push({ cardId: allLevels[idx].cardId, level })
      recurse(idx + 1, accCombo, nextCost)
      accCombo.pop()
    }
  }
  recurse(0, [], {})

  // Edge: if every combination was infeasible (shouldn't happen since {cost:{},score:0} fits)
  if (bestScore === -Infinity) {
    bestScore = 0
    bestCombo = []
    bestCost = {}
  }

  // 3. Commit: mutate player.resources
  for (const k of RESOURCE_KEYS) {
    const c = bestCost[k] ?? 0
    if (c > 0) {
      player.resources[k] = (player.resources[k] ?? 0) - c
    }
  }

  // 4. Build entries — re-call free handlers on committed state for entry log
  const freeEntries: SolverEntry[] = freeHandlers.map(({ cardId, handler }) => {
    let score = 0
    try {
      score = handler(state, player, ctx)
    } catch {
      score = 0
    }
    return { cardId, score, cost: {} }
  })
  const costedEntries: SolverEntry[] = bestCombo.map(({ cardId, level }) => ({
    cardId,
    score: level.score,
    cost: level.cost,
  }))

  return {
    entries: [...freeEntries, ...costedEntries],
    totalScore: bestScore,
    totalCost: bestCost,
  }
}
```

- [ ] **Step 2: Run unit tests — verify they pass**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring-bonus-solver.test.ts 2>&1 | tail -20`
Expected: all tests pass.

- [ ] **Step 3: Run full type check**

Run: `pnpm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add shared/logic/scoring-bonus-solver.ts
git commit -m "feat(scoring): implement Pareto-optimal bonus scoring solver"
```

---

## Phase B — Wire solver into scoring.ts

### Task 4: Replace `collectBonusScores` call + Major scoring read

**Files:**
- Modify: `shared/logic/scoring.ts`

- [ ] **Step 1: Add solver import + categories snapshot**

In `shared/logic/scoring.ts` line 7, add import:

```typescript
import { collectBonusScores, getCardEffect } from '../cards/card-effects'
import { solveBonusScoring } from './scoring-bonus-solver'
import type { BonusScoringContext } from '../cards/card-effects'
```

(Keep `collectBonusScores` import for now — removed in Task 16 along with the function itself.)

- [ ] **Step 2: Replace `collectBonusScores` call with solver**

Find lines 262-264:

```typescript
    // Collect bonus scores first — they reserve resources that Major improvements must deduct
    const bonusScoreResult = collectBonusScores(state, player)
    const reserved = bonusScoreResult.reserved
```

Replace with:

```typescript
    // Solve bonus scoring (free + costed). Solver mutates player.resources -= bestCost,
    // so subsequent Major scoring + downstream reads see the post-solve remaining values.
    const categoriesSnapshot = [...categories] as readonly typeof categories[number][]
    const bonusCtx: BonusScoringContext = { categories: categoriesSnapshot }
    const allCardsForBonus = [
      ...player.improvements,
      ...player.minorPlayed,
      ...player.occupationPlayed,
    ]
    const freeHandlers = allCardsForBonus
      .map((cardId) => ({ cardId, effect: getCardEffect(cardId) }))
      .filter((x): x is { cardId: string; effect: NonNullable<ReturnType<typeof getCardEffect>> } =>
        !!x.effect?.computeBonusScore,
      )
      .map(({ cardId, effect }) => ({ cardId, handler: effect.computeBonusScore! }))
    const costedHandlers = allCardsForBonus
      .map((cardId) => ({ cardId, effect: getCardEffect(cardId) }))
      .filter((x): x is { cardId: string; effect: NonNullable<ReturnType<typeof getCardEffect>> } =>
        !!x.effect?.computeCostedBonus,
      )
      .map(({ cardId, effect }) => ({ cardId, handler: effect.computeCostedBonus! }))
    const bonusScoreResult = solveBonusScoring({
      state,
      player,
      ctx: bonusCtx,
      freeHandlers,
      costedHandlers,
    })
```

- [ ] **Step 3: Update Major scoring to read `player.resources` directly**

Find lines 268-288 (Major scoring loop). Change line 273-277:

```typescript
      if (card.scoring) {
        const resourceCount = Math.max(
          0,
          (player.resources[card.scoring.resource] ?? 0) -
            (reserved[card.scoring.resource] ?? 0),
        )
```

Replace with:

```typescript
      if (card.scoring) {
        const resourceCount = Math.max(0, player.resources[card.scoring.resource] ?? 0)
```

(Solver has already subtracted; no `reserved` needed.)

- [ ] **Step 4: Update cardStateBonusVp loop to use solver entries**

Find lines around 313-326 (cardStateBonusVp accumulation). The line:

```typescript
    for (const entry of bonusScoreResult.entries) {
      cardStateBonusVp += entry.score
    }
```

stays unchanged — `solveBonusScoring` returns entries with the same shape `{ cardId, score, cost }`, score field is what's used.

- [ ] **Step 5: Drop postScore loop**

Find lines 345-354:

```typescript
    // Post-scoring card hooks
    const allCards = [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
    let postScoreVp = 0
    for (const cardId of allCards) {
      const effect = getCardEffect(cardId)
      if (effect?.computePostScore) {
        postScoreVp += effect.computePostScore(state, player, categories)
      }
    }
    applyPostScoreAdjustment(categories, postScoreVp)
```

Delete entirely (5 cards using computePostScore migrate to computeBonusScore in later tasks).

- [ ] **Step 6: Run existing scoring tests**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring.test.ts shared/cards/__tests__/D60_LargePottery.test.ts server/__tests__/D60_LargePottery-reserved.test.ts server/__tests__/E132_VeggieLover-session.test.ts 2>&1 | tail -30`
Expected: tests may fail because cards (A136/C133/E132/C99/D132/D100/C31/C135/E159) still use old hooks. **This is OK** — they'll be migrated in Phase C/D.

Note any new failures vs pre-task baseline.

- [ ] **Step 7: Commit**

```bash
git add shared/logic/scoring.ts
git commit -m "refactor(scoring): wire solver into scoring.ts; Major scoring reads player.resources directly"
```

---

## Phase C — Migrate 5 costed cards to `computeCostedBonus`

### Task 5: A136 DrudgeryReeve

**Files:**
- Modify: `shared/cards/A/A136_DrudgeryReeve.ts`

- [ ] **Step 1: Replace `computeBonusScore` with `computeCostedBonus`**

Replace the entire `effect` object body (lines 27-50). Final file:

```typescript
import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'A136_DrudgeryReeve'

const WOOD_BY_REMAINING: number[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4]
const BONUS_BY_SETS: number[] = [0, 1, 3, 5]

export const A136_DrudgeryReeve = new Occupation({
  id: CARD_ID,
  name: "Drudgery Reeve",
  deck: "A",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
  cost: {},
  players: "3+",
  extraVp: true,
})

export const A136_DrudgeryReeve_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, _player) => {
      const remainingTurns = 14 - state.round
      const wood = WOOD_BY_REMAINING[remainingTurns] ?? (remainingTurns >= 9 ? 4 : 0)
      if (wood > 0) {
        return gainLeaf(CARD_ID, { wood })
      }
    },
    computeCostedBonus: (_state, player, _ctx) => {
      const wood = player.resources.wood ?? 0
      const clay = player.resources.clay ?? 0
      const stone = player.resources.stone ?? 0
      const reed = player.resources.reed ?? 0
      const maxSets = Math.max(0, Math.min(wood, clay, stone, reed, 3))
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxSets; k++) {
        levels.push({
          cost: k === 0 ? {} : { wood: k, clay: k, stone: k, reed: k },
          score: BONUS_BY_SETS[k] ?? 0,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

Note: `scoringPriority: 0` and `computeBonusScore` are deleted.

- [ ] **Step 2: Run A136 session tests**

Run: `pnpm exec vitest run server/__tests__ 2>&1 | grep -iE "A136|drudg" | head -20`
Expected: existing A136 tests pass with new implementation (max-set semantics preserved).

If no A136 dedicated test exists, verify via:
```bash
pnpm exec vitest run shared/logic/__tests__/scoring.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add shared/cards/A/A136_DrudgeryReeve.ts
git commit -m "refactor(A136): migrate DrudgeryReeve to computeCostedBonus"
```

---

### Task 6: C133 Soldier

**Files:**
- Modify: `shared/cards/C/C133_Soldier.ts`

- [ ] **Step 1: Replace handler**

Read current file, then replace the impl. Final shape:

```typescript
import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'C133_Soldier'

export const C133_Soldier = new Occupation({
  id: CARD_ID,
  name: 'Soldier',
  deck: 'C',
  number: 133,
  category: 'POINTS_PROVIDER',
  desc: ['During scoring, each player gets 1 bonus <SCORE> for each pair of <WOOD> and <STONE> they have.'],
  cost: {},
  players: '4+',
  extraVp: true,
})

export const C133_Soldier_impl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player, _ctx) => {
      const wood = player.resources.wood ?? 0
      const stone = player.resources.stone ?? 0
      const maxPairs = Math.max(0, Math.min(wood, stone))
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxPairs; k++) {
        levels.push({
          cost: k === 0 ? {} : { wood: k, stone: k },
          score: k,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

Verify the existing card's other fields (`name`, `desc`, `players`, `extraVp`) match by reading the file before replacing — keep their exact values.

- [ ] **Step 2: Run C133 tests**

Run: `pnpm exec vitest run server/__tests__ shared/cards/__tests__ 2>&1 | grep -iE "C133|soldier" | head -10`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/C/C133_Soldier.ts
git commit -m "refactor(C133): migrate Soldier to computeCostedBonus"
```

---

### Task 7: E132 VeggieLover

**Files:**
- Modify: `shared/cards/E/E132_VeggieLover.ts`

- [ ] **Step 1: Replace handler**

Read existing file first to preserve metadata. Replace `effect` object's scoring hook:

```typescript
computeCostedBonus: (_state, player, _ctx) => {
  const grain = player.resources.grain ?? 0
  const veg = player.resources.vegetable ?? 0
  const maxStacks = Math.max(0, Math.min(grain, veg, 3))
  const BONUS_BY_STACKS = [0, 2, 4, 6]
  const levels: BonusScoreLevel[] = []
  for (let k = 0; k <= maxStacks; k++) {
    levels.push({
      cost: k === 0 ? {} : { grain: k, vegetable: k },
      score: BONUS_BY_STACKS[k] ?? 0,
    })
  }
  return levels
},
```

Add `import type { BonusScoreLevel } from '../card-effects'` at the top. Delete old `computeBonusScore` and any `scoringPriority`. Keep all other fields intact.

- [ ] **Step 2: Run E132 session tests**

Run: `pnpm exec vitest run server/__tests__/E132_VeggieLover-session.test.ts 2>&1 | tail -20`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/E/E132_VeggieLover.ts
git commit -m "refactor(E132): migrate VeggieLover to computeCostedBonus"
```

---

### Task 8: C99 GardenDesigner + paretoOptimal helper

**Files:**
- Create: `shared/cards/helpers/pareto-bonus.ts`
- Modify: `shared/cards/C/C99_GardenDesigner.ts`

- [ ] **Step 1: Create paretoOptimal helper**

Create `shared/cards/helpers/pareto-bonus.ts`:

```typescript
import type { Resource } from '../../game/types'
import type { BonusScoreLevel } from '../card-effects'

/**
 * Single-card Pareto pruning. For levels with the same cost vector, keep the
 * one with the highest score. Used by costed bonus cards (e.g. C99) that
 * generate many candidates from a constructive enumeration.
 */
export function paretoOptimal(levels: BonusScoreLevel[]): BonusScoreLevel[] {
  const key = (cost: Partial<Resource>) => JSON.stringify(cost)
  const best = new Map<string, BonusScoreLevel>()
  for (const lv of levels) {
    const k = key(lv.cost)
    const ex = best.get(k)
    if (!ex || lv.score > ex.score) best.set(k, lv)
  }
  return [...best.values()]
}
```

- [ ] **Step 2: Add unit test for `paretoOptimal`**

Append to `shared/logic/__tests__/scoring-bonus-solver.test.ts`:

```typescript
import { paretoOptimal } from '../../cards/helpers/pareto-bonus'

describe('paretoOptimal', () => {
  it('keeps max-score level per cost vector', () => {
    const result = paretoOptimal([
      { cost: { food: 1 }, score: 1 },
      { cost: { food: 1 }, score: 2 },
      { cost: { food: 4 }, score: 2 },
      { cost: { food: 4 }, score: 1 },
    ])
    expect(result).toHaveLength(2)
    expect(result.find(l => l.cost.food === 1)?.score).toBe(2)
    expect(result.find(l => l.cost.food === 4)?.score).toBe(2)
  })
})
```

- [ ] **Step 3: Run pareto helper test**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring-bonus-solver.test.ts 2>&1 | tail -15`
Expected: all tests pass including new `paretoOptimal`.

- [ ] **Step 4: Migrate C99**

Replace C99 effect hook:

```typescript
import { Occupation } from '../types'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { paretoOptimal } from '../helpers/pareto-bonus'

const CARD_ID = 'C99_GardenDesigner'

export const C99_GardenDesigner = new Occupation({
  id: 'C99_GardenDesigner',
  name: 'Garden Designer',
  deck: 'C',
  number: 99,
  category: 'POINTS_PROVIDER',
  desc: ['At the start of scoring, you can place <FOOD> in empty fields. You get 1/2/3 bonus <SCORE> for each field in which you place 1/4/7 <FOOD>.'],
  cost: {},
  players: '1+',
})

export const C99_GardenDesigner_impl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player, _ctx) => {
      const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
      if (emptyFields === 0) return [{ cost: {}, score: 0 }]
      const food = player.resources.food ?? 0
      const raw: BonusScoreLevel[] = []
      for (let n7 = 0; n7 <= emptyFields; n7++) {
        for (let n4 = 0; n4 + n7 <= emptyFields; n4++) {
          for (let n1 = 0; n1 + n4 + n7 <= emptyFields; n1++) {
            const foodCost = 7 * n7 + 4 * n4 + 1 * n1
            if (foodCost > food) continue
            const score = 3 * n7 + 2 * n4 + 1 * n1
            raw.push({ cost: foodCost === 0 ? {} : { food: foodCost }, score })
          }
        }
      }
      return paretoOptimal(raw)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 5: Run C99 + scoring tests**

Run: `pnpm exec vitest run server/__tests__ shared/cards/__tests__ shared/logic/__tests__ 2>&1 | grep -iE "C99|garden|solver|pareto" | head -10`
Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add shared/cards/helpers/pareto-bonus.ts shared/cards/C/C99_GardenDesigner.ts shared/logic/__tests__/scoring-bonus-solver.test.ts
git commit -m "refactor(C99): migrate GardenDesigner to computeCostedBonus + paretoOptimal helper"
```

---

### Task 9: D132 HideFarmer (postScore → costed)

**Files:**
- Modify: `shared/cards/D/D132_HideFarmer.ts`

- [ ] **Step 1: Replace handler**

Final file:

```typescript
import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'D132_HideFarmer'

export const D132_HideFarmer = new Occupation({
  id: CARD_ID,
  name: 'Hide Farmer',
  deck: 'D',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: ['During scoring, you can pay 1 <FOOD> each for any number of unused farmyard spaces. You do not lose points for these spaces.'],
  cost: {},
  players: '3+',
})

export const D132_HideFarmer_impl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, _player, ctx) => {
      const emptyCat = ctx.categories.find((c) => c.key === 'empty')
      if (!emptyCat || emptyCat.total >= 0) return [{ cost: {}, score: 0 }]
      const penalty = Math.abs(emptyCat.total)
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= penalty; k++) {
        levels.push({
          cost: k === 0 ? {} : { food: k },
          score: k,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

(Old `computePostScore` removed.)

- [ ] **Step 2: Run D132 session tests**

Run: `pnpm exec vitest run server/__tests__/D132_HideFarmer-session.test.ts 2>&1 | tail -20`
Expected: pass. If existing session test predates this migration and uses `computePostScore`-specific assertions, update them to assert post-solver behavior (food deducted, +K VP).

- [ ] **Step 3: Commit**

```bash
git add shared/cards/D/D132_HideFarmer.ts server/__tests__/D132_HideFarmer-session.test.ts 2>/dev/null
git commit -m "refactor(D132): migrate HideFarmer from computePostScore to computeCostedBonus"
```

---

## Phase D — Migrate 4 ex-postScore free cards + D60

### Task 10: E159 OldMiser

**Files:**
- Modify: `shared/cards/E/E159_OldMiser.ts`

- [ ] **Step 1: Replace `computePostScore` with `computeBonusScore`**

Final effect:

```typescript
import { Occupation } from '../types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E159_OldMiser'

export const E159_OldMiser = new Occupation({
  id: CARD_ID,
  name: 'Old Miser',
  deck: 'E',
  number: 159,
  category: 'FOOD',
  desc: ['In the feeding phase of each harvest, each of your people requires 1 less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
  players: '4+',
})

export const E159_OldMiser_impl = {
  effect: {
    id: CARD_ID,
    onBeforeFeed: (_state, player) => {
      player.resources.food += familySize(player)
    },
    computeBonusScore: (_state, player) => -familySize(player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: Run E159 session tests**

Run: `pnpm exec vitest run server/__tests__/E159_OldMiser-session.test.ts 2>&1 | tail -20`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/E/E159_OldMiser.ts
git commit -m "refactor(E159): migrate OldMiser to computeBonusScore (free)"
```

---

### Task 11: D100 LordoftheManor

**Files:**
- Modify: `shared/cards/D/D100_LordoftheManor.ts`

- [ ] **Step 1: Replace handler**

Final effect:

```typescript
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D100_LordoftheManor'

export const D100_LordoftheManor = new Occupation({
  id: CARD_ID,
  name: 'Lord of the Manor',
  deck: 'D',
  number: 100,
  category: 'POINTS_PROVIDER',
  desc: ['During scoring, you get 1 bonus <SCORE> for each scoring category in which you score the maximum 4 points. (The bonus point is also awarded for 4 fenced stables.)'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const D100_LordoftheManor_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, _player, ctx) => {
      const standardCategories = ['fields', 'pastures', 'grains', 'vegetables', 'sheeps', 'boars', 'cattles']
      return ctx.categories.filter(
        (cat) => standardCategories.includes(cat.key) && cat.total >= 4,
      ).length
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: Run scoring tests with D100 fixture**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring.test.ts 2>&1 | grep -iE "D100|manor|fail" | head -10`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/D/D100_LordoftheManor.ts
git commit -m "refactor(D100): migrate LordoftheManor to computeBonusScore (free)"
```

---

### Task 12: C31 WritingChamber

**Files:**
- Modify: `shared/cards/C/C31_WritingChamber.ts`

- [ ] **Step 1: Replace handler**

Final effect:

```typescript
import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C31_WritingChamber'

export const C31_WritingChamber = new MinorImprovement({
  id: CARD_ID,
  name: 'Writing Chamber',
  deck: 'C',
  number: 31,
  category: 'POINTS_PROVIDER',
  desc: ['During scoring, you get a number of bonus <SCORE> equal to the total of negative points you have, to a maximum of 7 <SCORE>.'],
  cost: { wood: 2 },
})

export const C31_WritingChamber_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, _player, ctx) => {
      const negativeTotal = ctx.categories.reduce(
        (sum, cat) => sum + Math.min(0, cat.total),
        0,
      )
      return Math.min(7, Math.abs(negativeTotal))
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: Run scoring tests**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring.test.ts 2>&1 | tail -10`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/C/C31_WritingChamber.ts
git commit -m "refactor(C31): migrate WritingChamber to computeBonusScore (free)"
```

---

### Task 13: C135 Constable

**Files:**
- Modify: `shared/cards/C/C135_Constable.ts`

- [ ] **Step 1: Replace handler**

Final effect:

```typescript
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C135_Constable'

export const C135_Constable = new Occupation({
  id: CARD_ID,
  name: 'Constable',
  deck: 'C',
  number: 135,
  category: 'POINTS_PROVIDER',
  desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with no negative points in any scoring line gets 3 bonus <SCORE>.'],
  cost: {},
  players: '3+',
})

export const C135_Constable_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, _player, ctx) => {
      return ctx.categories.some((cat) => cat.total < 0) ? 0 : 3
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: Run scoring tests**

Run: `pnpm exec vitest run shared/logic/__tests__/scoring.test.ts 2>&1 | tail -10`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/C/C135_Constable.ts
git commit -m "refactor(C135): migrate Constable to computeBonusScore (free)"
```

---

### Task 14: D60 LargePottery — drop `ctx.reserved` read

**Files:**
- Modify: `shared/cards/D/D60_LargePottery.ts`

- [ ] **Step 1: Replace handler — read `player.resources` directly**

Find the `computeBonusScore` block (around lines 52-60) and replace:

```typescript
  computeBonusScore: (_state, player, _ctx) => {
    // Solver has already subtracted any costed-bonus reservations from
    // player.resources, so this read is the post-solve remaining clay.
    const clay = player.resources.clay ?? 0
    if (clay >= 7) return 4
    if (clay >= 6) return 3
    if (clay >= 5) return 2
    if (clay >= 3) return 1
    return 0
  },
```

- [ ] **Step 2: Run D60 tests**

Run: `pnpm exec vitest run shared/cards/__tests__/D60_LargePottery.test.ts server/__tests__/D60_LargePottery-reserved.test.ts 2>&1 | tail -20`
Expected: pass. If `D60_LargePottery-reserved.test.ts` was asserting `ctx.reserved` semantics, the test should be updated to assert "after A136 takes K sets, D60 sees clay - K" through the solver path (i.e., write a session test with both cards present).

- [ ] **Step 3: Commit**

```bash
git add shared/cards/D/D60_LargePottery.ts
git commit -m "refactor(D60): drop ctx.reserved read; rely on solver-committed player.resources"
```

---

### Task 15: Run full test suite mid-flight

**Files:**
- (none modified)

- [ ] **Step 1: Run fast test suite**

Run: `pnpm test:fast 2>&1 | tail -30`
Expected: pass. **Goal**: confirm all 5 costed migrations + 4 free migrations + D60 land green before deletion phase.

If any failures, investigate per-card before proceeding to Task 16.

- [ ] **Step 2: Commit (if any test fixes were needed inline)**

If you needed to update any test assertions to match new semantics:
```bash
git add <updated test files>
git commit -m "test: align bonus-scoring tests with solver semantics"
```

---

## Phase E — Delete deprecated fields + influence-zone cleanup

### Task 16: Delete `computePostScore`, `scoringPriority`, `ScoringContext.reserved`, `collectBonusScores`

**Files:**
- Modify: `shared/cards/card-effects.ts`
- Modify: `shared/logic/scoring.ts`

- [ ] **Step 1: Drop `computePostScore` from `CardEffectField` and `cardEffectHooks`**

In `shared/cards/card-effects.ts`, remove `'computePostScore'` from:

```typescript
export type CardEffectField = CardEffectHook
  | 'resolveChoice'
  | 'computeBonusScore' | 'computeSharedPostScore' | 'computeCostedBonus'   // ← removed 'computePostScore'
  | 'computeExtraRoomCapacity'
  | 'onComputeAnimalZones' | 'onComputeSowableFields' | 'onSowExtraField'
  | 'computeLockedFarmTiles' | 'computeFenceDiscount'
```

And from `cardEffectHooks` array, remove the `'computePostScore'` line.

- [ ] **Step 2: Drop `computePostScore` from `CardEffect`**

Around line 160, delete:

```typescript
computePostScore?: (state: GameState, player: PlayerState, categories: ScoreCategoryResult[]) => number
```

- [ ] **Step 3: Drop `scoringPriority` from `CardEffect`**

Around line 128, delete:

```typescript
/** Lower values run first in computeBonusScore ordering (default: 100). */
scoringPriority?: number
```

Also delete the comment block above `ScoringContext` (lines 105-112) referencing `scoringPriority`.

- [ ] **Step 4: Drop `ScoringContext` (rename to `BonusScoringContext`)**

Lines 113-118 currently:

```typescript
export type ScoringContext = {
  reserved: Partial<Resource>
}

export type BonusScoreHandler = (state: GameState, player: PlayerState, ctx: ScoringContext) => number
```

Replace with:

```typescript
export type BonusScoreHandler = (state: GameState, player: PlayerState, ctx: BonusScoringContext) => number
```

(The `BonusScoringContext` was added in Task 1 and stays.)

- [ ] **Step 5: Drop `collectBonusScores` function and `BonusScoreResult` type**

Lines 348-392, delete the entire `BonusScoreResult` type + `collectBonusScores` function (the solver replaces it).

Also remove the import in `shared/logic/scoring.ts`:

```diff
- import { collectBonusScores, getCardEffect } from '../cards/card-effects'
+ import { getCardEffect } from '../cards/card-effects'
```

- [ ] **Step 6: Drop `applyPostScoreAdjustment` if unused**

In `shared/logic/scoring.ts`, search for remaining usage:

```bash
grep -n "applyPostScoreAdjustment" shared/logic/scoring.ts
```

If line 379 is the only remaining usage (sharedPostScore loop), keep the function but it should still apply there. If 379 is still in use, leave it. If not, delete the function definition (line 111).

- [ ] **Step 7: Run full type check + fast tests**

Run: `pnpm run build 2>&1 | tail -20`
Expected: build succeeds.

Run: `pnpm test:fast 2>&1 | tail -20`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add shared/cards/card-effects.ts shared/logic/scoring.ts
git commit -m "refactor(scoring): delete computePostScore, scoringPriority, ScoringContext.reserved, collectBonusScores"
```

---

### Task 17: Influence-zone cleanup

**Files:**
- Modify: `client/services/llmPrompts.ts`
- Modify: `shared/custom-code/__tests__/ast-validator.test.ts`
- Modify: `scripts/audit-card-architecture.ts`
- Modify: `docs/CUSTOM_CARD_SANDBOX.md`

- [ ] **Step 1: Update `client/services/llmPrompts.ts`**

Find line 137:

```
| computePostScore | `(state, player, categories) => number` | 终局后续加分 |
```

Replace this line with:

```
| computeBonusScore | `(state, player, ctx) => number` | 终局加分（可读 ctx.categories） |
| computeCostedBonus | `(state, player, ctx) => BonusScoreLevel[]` | 终局花资源换 VP（求解器枚举最优组合） |
```

Also search for any older `ctx.reserved` / `scoringPriority` references nearby and remove them.

- [ ] **Step 2: Update `ast-validator.test.ts`**

Find line 69-74 (`it('accepts handHooks and scoringPriority as meta fields'`):

Either:
- Rename test to `'accepts handHooks as meta field'` and remove the `scoringPriority` assertion line, OR
- Replace `scoringPriority` reference with another existing meta field (e.g., the test still validates the meta-field gate).

Read the test, do the minimal change.

- [ ] **Step 3: Update `docs/CUSTOM_CARD_SANDBOX.md`**

Around line 170, in the hook list:

```
- `computePostScore`
```

Remove that bullet. Add (if missing):

```
- `computeCostedBonus`
```

Around line 182, the `scoringPriority` mention:

```
额外允许的 meta 字段（不在 `cardEffectHooks` 数组中，但 AST validator 放行）：`id`、`handHooks`、`scoringPriority`。
```

Change to:

```
额外允许的 meta 字段（不在 `cardEffectHooks` 数组中，但 AST validator 放行）：`id`、`handHooks`。
```

Around line 189-190, the table rows referencing `computeBonusScore` (with `ctx.reserved`) and `computePostScore`:

Replace those rows with:

```
| `computeBonusScore`                          | `(state, player, ctx) => number`（ctx.categories 只读） | 终局加分（free bonus；求解器收集后并入 cardStateBonusVp） |
| `computeCostedBonus`                         | `(state, player, ctx) => BonusScoreLevel[]`            | 终局花资源换 VP（声明 levels，求解器枚举最优组合） |
```

Around line 567 in the changelog, append a 2026-04-30 entry:

```
| 2026-04-30 | 双轨 scoring hook 重构：删除 `computePostScore` / `scoringPriority` / `ctx.reserved`；新增 `computeCostedBonus` 走 Pareto 求解器。详见 `docs/superpowers/specs/2026-04-30-bonus-score-merge-design.md`。 |
```

- [ ] **Step 4: Update `scripts/audit-card-architecture.ts`**

Search for any `computePostScore` / `scoringPriority` / `ctx.reserved` keyword detection in the audit script:

```bash
grep -n "computePostScore\|scoringPriority\|ctx\.reserved" scripts/audit-card-architecture.ts
```

If found, remove or update to detect the new fields. If not found, no change needed.

- [ ] **Step 5: Run prompt-sync + reaches checks**

Run: `pnpm run check:prompt-sync 2>&1 | tail -10`
Expected: pass.

Run: `pnpm run check:reaches 2>&1 | tail -10`
Expected: pass.

Run: `pnpm run lint 2>&1 | tail -10`
Expected: errors=0 (warnings OK).

- [ ] **Step 6: Commit**

```bash
git add client/services/llmPrompts.ts shared/custom-code/__tests__/ast-validator.test.ts docs/CUSTOM_CARD_SANDBOX.md scripts/audit-card-architecture.ts
git commit -m "chore: clean up influence zones for scoringPriority/computePostScore removal"
```

---

## Phase F — Documentation sync

### Task 18: Update `docs/card_progress.md` §2.0 + §3

**Files:**
- Modify: `docs/card_progress.md`

- [ ] **Step 1: Add §2.0 changelog entry**

In `docs/card_progress.md`, find the §2.0 block (around line 47). Add at the top of the changelog list (after the `> 任何卡牌相关 commit 必须...` line):

```markdown
- **2026-04-30 — Bonus scoring hook 双轨合并到求解器架构**：删除 `CardEffect.computePostScore` / `CardEffect.scoringPriority` / `ScoringContext.reserved` 三个字段；新增 `computeCostedBonus: (state, player, ctx) => BonusScoreLevel[]` hook + `solveBonusScoring()` Pareto 求解器（`shared/logic/scoring-bonus-solver.ts`）。5 张 costed bonus 卡（A136 / C133 / E132 / C99 / D132）改为申报 levels[]，求解器枚举笛卡尔积找最优组合后扣 `player.resources`。50 张 free bonus 卡（含 4 张迁入：D100 / C31 / C135 / E159；以及 D60 LargePottery 删除 ctx.reserved 改读 player.resources）保持单值返回 `(state, player, ctx) => number`。`computeSharedPostScore` 不动（跨玩家分数调整，签名不同）。spec / plan：`docs/superpowers/specs/2026-04-30-bonus-score-merge-design.md` / `docs/superpowers/plans/2026-04-30-bonus-score-merge.md`。
```

- [ ] **Step 2: Add §3 infrastructure entry**

Find §3 "基础设施清单" (around line 351). Add new row:

```markdown
| **`solveBonusScoring`**（2026-04-30） | ✅ | `shared/logic/scoring-bonus-solver.ts`：Pareto 最优求解器，枚举 costed bonus 卡的 levels 笛卡尔积，commit 最优组合到 `player.resources`。替代 `collectBonusScores` + `scoringPriority` 协调。消费者：A136 / C133 / E132 / C99 / D132 通过 `computeCostedBonus`；D60 / Major scoring / 50 张 free bonus 通过 `computeBonusScore` 读 commit 后 `player.resources`。 |
```

- [ ] **Step 3: Run lint on docs**

Run: `pnpm run lint 2>&1 | grep -i "card_progress\|markdown" | tail -5`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add docs/card_progress.md
git commit -m "docs(card_progress): record 2026-04-30 bonus-scoring solver refactor"
```

---

## Phase G — Verification

### Task 19: Full test suite + push + CI

**Files:**
- (none modified — verification only)

- [ ] **Step 1: Run lint + build + fast tests + check:reaches + check:prompt-sync**

```bash
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm test:fast 2>&1 | tail -10
pnpm run check:reaches 2>&1 | tail -5
pnpm run check:prompt-sync 2>&1 | tail -5
```

All five must pass (lint errors=0; warnings OK).

- [ ] **Step 2: Run slow test suite (optional but recommended)**

```bash
pnpm test:slow 2>&1 | tail -10
```

- [ ] **Step 3: Push branch**

```bash
git push -u origin worktree-engineering-debt-bonus-score-solver 2>&1 | tail -5
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "refactor(scoring): merge computePostScore into computeBonusScore via Pareto solver" --body "$(cat <<'EOF'
## Summary

- Merge `computePostScore` into `computeBonusScore` (free bonus)
- Add `computeCostedBonus` hook for cards that spend resources for VP
- Replace ad-hoc `scoringPriority` + `ctx.reserved` with Pareto-optimal solver enumerating costed-card level combinations
- Delete `computePostScore`, `scoringPriority`, `ScoringContext.reserved`, `collectBonusScores`

5 costed cards migrated: A136 DrudgeryReeve, C133 Soldier, E132 VeggieLover, C99 GardenDesigner, D132 HideFarmer.
4 ex-postScore cards migrated to `computeBonusScore`: D100 LordoftheManor, C31 WritingChamber, C135 Constable, E159 OldMiser.
D60 LargePottery now reads `player.resources` directly (solver has committed).

## Test plan
- [ ] solver unit tests pass (`shared/logic/__tests__/scoring-bonus-solver.test.ts`)
- [ ] paretoOptimal helper tests pass
- [ ] all 5 costed card session tests pass
- [ ] all 4 ex-postScore card tests pass
- [ ] D60 LargePottery test passes
- [ ] full fast test suite green
- [ ] check:reaches green
- [ ] check:prompt-sync green
- [ ] lint errors=0

Spec: `docs/superpowers/specs/2026-04-30-bonus-score-merge-design.md`
Plan: `docs/superpowers/plans/2026-04-30-bonus-score-merge.md`
EOF
)"
```

- [ ] **Step 5: Wait for CI**

Use `curl + GH_TOKEN` to poll CI run for the new commit. Reference past CI runtime (~8 min). On failure: investigate via `gh run view <RUN_ID> --log-failed` (or curl logs API), fix, re-push, repeat.

- [ ] **Step 6: Merge to main once CI green**

```bash
gh pr merge --rebase --delete-branch
```

- [ ] **Step 7: Update master-plan.md**

After merge, in `docs/master-plan.md` §0 "未达 §0 对齐 BGA 完成"列表中删除 "双轨重构（computePostScore vs computeBonusScore）未做"那一行。

```bash
git checkout main
git pull
# edit docs/master-plan.md to remove the line
git add docs/master-plan.md
git commit -m "docs(master-plan): close out bonus-score-merge engineering debt"
git push origin main
```

---

## Implementation notes

- **Backward compat**: None needed — this is internal API only. Custom card sandbox docs updated in Task 17.
- **Performance**: Solver Cartesian product ≤ ~50K combinations per player; well under 100ms / scoring call.
- **Failure mode**: If solver produces lower score than current greedy in any test scenario, **investigate before fixing** — the solver is mathematically Pareto-optimal, so a regression means a level declaration is wrong (e.g., missing the `{cost:{}, score:0}` "skip" level).
- **TDD discipline**: each card migration commits separately so bisect works if a regression appears post-merge.
- **Test wiring**: `_ctx` underscore-prefix in 47 unchanged free cards is fine — they don't read `ctx`. The compile path keeps them green.
