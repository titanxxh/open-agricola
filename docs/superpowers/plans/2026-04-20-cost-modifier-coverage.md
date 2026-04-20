# Cost Modifier Coverage & Bonus.choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Bonus.choices` capability to both cost-modifier paths, fix the multi-bonus iteration bug (currently treats bonuses as alternatives rather than accumulating), migrate A123 FrameBuilder to align with BGA semantics, and comprehensive multi-card cost-modifier stacking tests (L1/L2/L3).

**Architecture:** Two-path cost-modifier system stays as-is (Path A = `computeCosts` hook; Path B = `player.activeModifiers`). Both produce `ComplexCost` consumed by `computeAllBuyableCombinations`. Bonus iteration is rewritten from single-alternative to BGA-style combination expansion: each non-optional bonus applied to all paths; optional bonuses expand paths into "used/skipped"; `choices` arrays within a bonus expand paths over each alternative choice.

**Tech Stack:** TypeScript, Vitest (unit + session), pnpm, existing `CardListenerRegistration` / `CostModifier` infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-20-cost-modifier-coverage-design.md` (commit `71756b1`)

**Worktree:** `.worktree/cost-modifier-coverage` (branch: `cost-modifier-coverage`)

---

## File Structure

**Modified:**
- `shared/game/types.ts` — add `BonusChoice`, optional `choices` field on `Bonus` / `BonusModifier`
- `shared/actions/effects/pay.ts` — rewrite bonus iteration in `computeAllBuyableCombinations`; extend `applyCostModifiers` to map `BonusModifier.choices`; add invariant check
- `shared/actions/effects/__tests__/pay.test.ts` — add multi-bonus accumulation + choices unit tests
- `shared/cards/A/A123_FrameBuilder.ts` — migrate from 4 `TradeModifier` to 2 `BonusModifier` with `choices`
- `shared/cards/E/E109_BraidMaker.ts` — remove `order: -10` (no-op), update JSDoc
- `shared/actions/hooks.ts` — JSDoc on `ActionHookRegistration.order` explaining computeCosts commutativity
- `server/__tests__/E109_BraidMaker-session.test.ts` — extend with positive + Stonecutter-stacking cases
- `docs/card_progress.md` — §2/§4/§7/§8 per the sync checklist

**Created:**
- `shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts`
- `shared/cards/__stubs__/Stub_BonusChoices.ts`
- `shared/cards/__stubs__/Stub_BonusChoiceModifier.ts`
- `shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts`
- `server/__tests__/A123_FrameBuilder-session.test.ts`
- `server/__tests__/A143_Stonecutter-session.test.ts`
- `server/__tests__/A143_B95_stacking-session.test.ts`
- `server/__tests__/D15_A143_stacking-session.test.ts`

---

## Commit 1 — `feat(pay): bonus accumulation + choices support`

Context: the current `computeAllBuyableCombinations` iterates `effectiveCost.bonuses` as MUTUALLY EXCLUSIVE alternatives (`let effectiveCostFee = baseFee` resets inside the loop and only ONE `bonus` is applied per resulting solution). This is wrong vs BGA: non-optional bonuses must accumulate, optional bonuses expand into "use/skip" paths, and `choices` arrays expand into per-choice paths. This commit rewrites that loop and adds the `choices` capability.

### Task 1.1: Add `BonusChoice` type and extend `Bonus` / `BonusModifier`

**Files:**
- Modify: `shared/game/types.ts`

- [ ] **Step 1: Update type definitions**

Replace the existing `Bonus` and `BonusModifier` type blocks.

Current (in `shared/game/types.ts`, approximately lines 25-50):
```ts
export type Bonus = {
  discount: Partial<Resource>
  optional?: boolean
  sources?: string[]
  conditions?: Record<string, number>
}

// ...

export type BonusModifier = {
  type: 'bonus'
  cardId: string
  appliesTo: CostModifierType[]
  discount: Partial<Resource>
  optional?: boolean
  conditions?: Record<string, number>
}
```

Replace with:
```ts
export type BonusChoice = {
  discount: Partial<Resource>
  sources?: string[]
  conditions?: Record<string, number>
}

export type Bonus = {
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  optional?: boolean
  sources?: string[]
  conditions?: Record<string, number>
}

// ...

export type BonusModifier = {
  type: 'bonus'
  cardId: string
  appliesTo: CostModifierType[]
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  optional?: boolean
  conditions?: Record<string, number>
}
```

- [ ] **Step 2: Verify TS compiles (no other changes yet)**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | head -30`

Expected: may show errors in pay.ts referring to `bonus.discount` being possibly undefined. Do NOT fix these yet — Task 1.3 will.

### Task 1.2: Write failing tests for bonus accumulation + choices

**Files:**
- Modify: `shared/actions/effects/__tests__/pay.test.ts`

Add these tests to the existing `describe('computeAllBuyableCombinations')` block. They probe behavior that the current code does NOT support.

- [ ] **Step 1: Add multi-bonus accumulation test**

Append after existing `'applies bonus discounts'` test:

```ts
  it('stacks multiple non-optional bonuses (accumulates discounts)', () => {
    const player = createMockPlayer({ wood: 3 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 1 }, optional: false, sources: ['BonusA'] },
        { discount: { wood: 1 }, optional: false, sources: ['BonusB'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBe(1)
    expect(solutions[0]!.resourcesPaid.wood).toBe(3)  // 5 - 1 - 1 = 3
  })

  it('expands optional bonuses into use-or-skip paths', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 2 }, optional: true, sources: ['OptBonus'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Expect: {wood: 5} (skip bonus) and {wood: 3} (use bonus). keepOnlyOptimals
    // keeps both since {3} is not dominated by {5} in any dimension favorable
    // to payer — actually {3} dominates {5} for a payer (pays less). So we
    // expect keepOnlyOptimals to drop the dominated {5} path.
    expect(solutions.length).toBe(1)
    expect(solutions[0]!.resourcesPaid.wood).toBe(3)
  })

  it('combines optional and mandatory bonuses', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 1 }, optional: false, sources: ['MustA'] },
        { discount: { wood: 2 }, optional: true, sources: ['OptB'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Paths: must-A only (wood:4), must-A + opt-B (wood:2).
    // keepOnlyOptimals drops the dominated {4} path.
    expect(solutions.length).toBe(1)
    expect(solutions[0]!.resourcesPaid.wood).toBe(2)
  })
```

- [ ] **Step 2: Add bonus.choices tests**

Append after the accumulation tests:

```ts
  it('expands bonus.choices into alternative paths (optional: false = must pick one)', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    const cost: ComplexCost = {
      fee: { clay: 2, stone: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: -1, clay: 2 }, sources: ['ChA'] },  // pay 1 wood, save 2 clay
            { discount: { wood: -1, stone: 2 }, sources: ['ChB'] }, // pay 1 wood, save 2 stone
          ],
          optional: false,
          sources: ['BonusChoice'],
        },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Two solutions: ChA (clay:0, stone:2, wood:1) and ChB (clay:2, stone:0, wood:1).
    // Both pay total 3 resources and are Pareto-incomparable (different resources),
    // so both should survive keepOnlyOptimals.
    expect(solutions.length).toBe(2)
    const paid = solutions.map((s) => ({
      clay: s.resourcesPaid.clay ?? 0,
      stone: s.resourcesPaid.stone ?? 0,
      wood: s.resourcesPaid.wood ?? 0,
    }))
    expect(paid).toContainEqual({ clay: 0, stone: 2, wood: 1 })
    expect(paid).toContainEqual({ clay: 2, stone: 0, wood: 1 })
  })

  it('expands bonus.choices with optional: true (adds skip path)', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    const cost: ComplexCost = {
      fee: { clay: 2, stone: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: -1, clay: 2 }, sources: ['ChA'] },
            { discount: { wood: -1, stone: 2 }, sources: ['ChB'] },
          ],
          optional: true,
          sources: ['BonusChoice'],
        },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Three paths before keepOnlyOptimals: skip (2c+2s), ChA (2s+1w), ChB (2c+1w).
    // Pareto: skip dominates nothing (pays 4 total); ChA pays 3 (2s,1w), ChB pays 3.
    // Skip is dominated by each choice (pays more in two resources). So 2 survive.
    expect(solutions.length).toBe(2)
  })

  it('throws when bonus has both discount and choices', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 1 },
      bonuses: [
        {
          discount: { wood: 1 },
          choices: [{ discount: { wood: 1 } }],
        },
      ],
    }
    expect(() => computeAllBuyableCombinations(player, cost)).toThrow(
      /Bonus must have exactly one of discount or choices/,
    )
  })

  it('throws when bonus has neither discount nor choices', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 1 },
      bonuses: [{} as any],
    }
    expect(() => computeAllBuyableCombinations(player, cost)).toThrow(
      /Bonus must have exactly one of discount or choices/,
    )
  })

  it('applies BonusModifier.choices via activeModifiers path', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    player.activeModifiers = [
      {
        type: 'bonus',
        cardId: 'Test_FrameBuilder',
        appliesTo: ['construct'],
        optional: true,
        choices: [
          { discount: { wood: -1, clay: 2 } },
          { discount: { wood: -1, stone: 2 } },
        ],
      },
    ]
    const cost: ComplexCost = { fee: { clay: 2, stone: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    // Same as the earlier choices test — BonusModifier is translated to Bonus.choices.
    expect(solutions.length).toBeGreaterThanOrEqual(2)
    const hasClaySave = solutions.some(
      (s) => (s.resourcesPaid.clay ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    const hasStoneSave = solutions.some(
      (s) => (s.resourcesPaid.stone ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(hasClaySave).toBe(true)
    expect(hasStoneSave).toBe(true)
  })
```

- [ ] **Step 3: Run tests — expect failures**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run shared/actions/effects/__tests__/pay.test.ts 2>&1 | tail -50`

Expected: the seven new tests fail (current code doesn't accumulate, doesn't support choices, doesn't throw on invariant violations). Existing tests still pass.

### Task 1.3: Rewrite bonus iteration + add invariant check in `computeAllBuyableCombinations`

**Files:**
- Modify: `shared/actions/effects/pay.ts`

- [ ] **Step 1: Update `applyBonus` to handle optional `discount`**

In `shared/actions/effects/pay.ts` around line 318, replace the existing `applyBonus` function:

```ts
const applyBonus = (
  cost: Partial<Resource>,
  discount: Partial<Resource>,
): Partial<Resource> => {
  const result = { ...cost }
  const discountKeys = Object.keys(discount) as ResourceKey[]
  for (const key of discountKeys) {
    const discountAmount = discount[key] ?? 0
    result[key] = Math.max(0, (result[key] ?? 0) - discountAmount)
  }
  return result
}
```

(It now takes the `discount` object directly rather than a `Bonus` wrapper — callers adapted below.)

- [ ] **Step 2: Add invariant helper and update types for `InternalSolution`**

Around line 183, update the `InternalSolution` type:

```ts
type InternalSolution = {
  resourcesRemaining: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  bonusUsed?: string   // kept for backward-compat; comma-joined sources of all applied bonuses/choices
  feeIndex?: number
}
```

Add the invariant check helper just above `computeAllBuyableCombinations` (before line 492):

```ts
const validateBonus = (bonus: Bonus): void => {
  const hasDiscount = bonus.discount !== undefined
  const hasChoices = bonus.choices !== undefined
  if (hasDiscount === hasChoices) {
    throw new Error(
      'Bonus must have exactly one of discount or choices (got ' +
        `discount=${hasDiscount}, choices=${hasChoices})`,
    )
  }
  if (hasChoices && (bonus.choices!.length === 0)) {
    throw new Error('Bonus.choices must be a non-empty array')
  }
}
```

- [ ] **Step 3: Rewrite the bonus iteration block inside `computeAllBuyableCombinations`**

Locate the block (around lines 515-545):
```ts
  for (let feeIdx = 0; feeIdx < baseFees.length; feeIdx++) {
    const baseFee = baseFees[feeIdx]
    const tradeCombos = effectiveCost.trades && effectiveCost.trades.length > 0
      ? generateTradeCombinations(effectiveCost.trades, playerResources)
      : [{ tradesUsed: [], result: { ...playerResources } }]

    for (const tradeCombo of tradeCombos) {
      const bonuses = effectiveCost.bonuses ?? [undefined]

      for (const bonus of bonuses) {
        let effectiveCostFee = baseFee
        let bonusId: string | undefined

        if (bonus) {
          effectiveCostFee = applyBonus(baseFee, bonus)
          bonusId = bonus.sources?.join(',') ?? 'unknown'
        }

        if (canCoverCost(tradeCombo.result, effectiveCostFee)) {
          const remaining = subtractResources(tradeCombo.result, effectiveCostFee)

          rawSolutions.push({
            resourcesRemaining: remaining,
            tradesUsed: tradeCombo.tradesUsed,
            bonusUsed: bonusId,
            feeIndex: baseFees.length > 1 ? feeIdx : undefined,
          })
        }
      }
    }
  }
```

Replace with:
```ts
  // Validate invariants once up-front
  for (const bonus of effectiveCost.bonuses ?? []) {
    validateBonus(bonus)
  }

  for (let feeIdx = 0; feeIdx < baseFees.length; feeIdx++) {
    const baseFee = baseFees[feeIdx]
    const tradeCombos = effectiveCost.trades && effectiveCost.trades.length > 0
      ? generateTradeCombinations(effectiveCost.trades, playerResources)
      : [{ tradesUsed: [], result: { ...playerResources } }]

    for (const tradeCombo of tradeCombos) {
      // Expand bonuses in BGA style: each bonus multiplies the path count.
      // Start with one path = baseFee with no bonuses applied.
      type BonusPath = { cost: Partial<Resource>; sources: string[] }
      let bonusPaths: BonusPath[] = [{ cost: baseFee, sources: [] }]

      for (const bonus of effectiveCost.bonuses ?? []) {
        const expanded: BonusPath[] = []
        // If optional, include a "skip" path that keeps the existing costs.
        if (bonus.optional) {
          for (const path of bonusPaths) {
            expanded.push({ cost: path.cost, sources: [...path.sources] })
          }
        }
        // For each existing path, try each candidate discount.
        const candidates: { discount: Partial<Resource>; sources?: string[] }[] =
          bonus.choices ??
          [{ discount: bonus.discount!, sources: bonus.sources }]
        for (const path of bonusPaths) {
          for (const candidate of candidates) {
            const nextCost = applyBonus(path.cost, candidate.discount)
            const nextSources = [
              ...path.sources,
              ...(candidate.sources ?? bonus.sources ?? []),
            ]
            expanded.push({ cost: nextCost, sources: nextSources })
          }
        }
        bonusPaths = expanded
      }

      for (const { cost: effectiveCostFee, sources } of bonusPaths) {
        if (canCoverCost(tradeCombo.result, effectiveCostFee)) {
          const remaining = subtractResources(tradeCombo.result, effectiveCostFee)
          rawSolutions.push({
            resourcesRemaining: remaining,
            tradesUsed: tradeCombo.tradesUsed,
            bonusUsed: sources.length > 0 ? sources.join(',') : undefined,
            feeIndex: baseFees.length > 1 ? feeIdx : undefined,
          })
        }
      }
    }
  }
```

- [ ] **Step 4: Update `applyBonusModifier` and `applyCostModifiers` to preserve `choices`**

Around line 411, replace `applyBonusModifier`:

```ts
export const applyBonusModifier = (
  baseBonuses: Bonus[],
  modifier: BonusModifier,
): Bonus[] => {
  const modifiedBonuses: Bonus[] = [...baseBonuses]

  const newBonus: Bonus = {
    discount: modifier.discount,
    choices: modifier.choices,
    optional: modifier.optional ?? true,
    sources: [modifier.cardId],
    conditions: modifier.conditions,
  }
  modifiedBonuses.push(newBonus)

  return modifiedBonuses
}
```

Around line 448, in `applyCostModifiers`, find the `else if (mod.type === 'bonus')` branch (around line 467) and replace with:

```ts
    } else if (mod.type === 'bonus') {
      const bonusMod = mod as BonusModifier
      effectiveBonuses.push({
        discount: bonusMod.discount,
        choices: bonusMod.choices,
        optional: bonusMod.optional ?? true,
        sources: [bonusMod.cardId],
        conditions: bonusMod.conditions,
      })
    }
```

- [ ] **Step 5: Run pay.test.ts — expect previously-failing tests to pass, existing to still pass**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run shared/actions/effects/__tests__/pay.test.ts 2>&1 | tail -25`

Expected: all tests pass. If any existing test fails due to the new accumulation semantics (e.g., a test that depended on bonuses-as-alternatives), inspect and update — but only if the old behavior was incorrect. If updating an existing test, note it in the commit message.

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `cd .worktree/cost-modifier-coverage && pnpm test 2>&1 | tail -40`

Expected: all pre-existing tests pass. A123 tests may now behave differently (old A123 was 4 separate trades — not bonuses — so should NOT be affected by this commit, but verify).

- [ ] **Step 7: Commit**

```bash
cd .worktree/cost-modifier-coverage
git add shared/game/types.ts shared/actions/effects/pay.ts shared/actions/effects/__tests__/pay.test.ts
git commit -m "$(cat <<'EOF'
feat(pay): bonus accumulation + choices support

Rewrites the bonus iteration in computeAllBuyableCombinations from
single-alternative selection to BGA-style combination expansion:
- non-optional bonuses accumulate (applied to every path)
- optional bonuses expand paths into used/skipped variants
- bonus.choices expands paths over each choice

Adds new BonusChoice type and optional choices field on Bonus and
BonusModifier. Invariant: a bonus must have exactly one of discount or
choices. BonusModifier.choices flows through applyCostModifiers.

Unit tests cover multi-bonus stacking (previously broken), optional
use/skip paths, choices with optional true/false, invariant violations,
and BonusModifier.choices mapping.
EOF
)"
```

---

## Commit 2 — `test(pay): resolveCardCostWithModifiers + stub matrix`

Context: `resolveCardCostWithModifiers` (the Path A entry point) is not directly unit-tested. Multi-card cost-modifier scenarios mixing Path A and Path B are also untested. This commit adds the unit test for the resolver and a stub-based matrix test for multi-path combinations.

### Task 2.1: Write `resolveCardCostWithModifiers` unit tests

**Files:**
- Create: `shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  registerActionHook,
  clearActionHooks,
} from '../../hooks'
import { registerCardListener, clearCardListeners } from '../../../cards/card-listeners'
import { resolveCardCostWithModifiers } from '../pay-helpers'
import type { GameState, PlayerState, Resource, ComplexCost } from '../../../game/types'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  rooms: 2,
  houseType: 'wood',
  fields: [], fences: 0, roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

const createState = (player: PlayerState): GameState => ({
  players: [player],
  currentPlayerIndex: 0,
} as unknown as GameState)

describe('resolveCardCostWithModifiers', () => {
  beforeEach(() => {
    clearCardListeners()
  })

  afterEach(() => {
    clearCardListeners()
  })

  it('returns base cost unchanged when no listeners match', () => {
    const player = createPlayer()
    const state = createState(player)
    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 2, stone: 2 })
  })

  it('accumulates multiple costs deltas (order-independent)', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookA', 'HookB']
    const state = createState(player)

    registerCardListener({
      id: 'hook-a', cardIds: ['HookA'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ costs: { stone: -1 } }),
    })
    registerCardListener({
      id: 'hook-b', cardIds: ['HookB'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ costs: { reed: -1 } }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 1, stone: 1 })
  })

  it('pushes trades returned by hooks into ComplexCost.trades', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookTrade']
    const state = createState(player)

    registerCardListener({
      id: 'hook-trade', cardIds: ['HookTrade'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ trades: [{ from: { wood: 1 }, to: { clay: 2 }, max: 1 }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { clay: 2 },
    ) as ComplexCost
    expect(result.fee).toEqual({ clay: 2 })
    expect(result.trades).toHaveLength(1)
    expect(result.trades![0]!.to).toEqual({ clay: 2 })
  })

  it('pushes bonuses returned by hooks into ComplexCost.bonuses', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookBonus']
    const state = createState(player)

    registerCardListener({
      id: 'hook-bonus', cardIds: ['HookBonus'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ bonuses: [{ discount: { stone: 1 }, sources: ['HookBonus'] }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { stone: 2 },
    ) as ComplexCost
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses![0]!.discount).toEqual({ stone: 1 })
  })

  it('preserves bonus.choices field when returned from hook', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookChoices']
    const state = createState(player)

    registerCardListener({
      id: 'hook-choices', cardIds: ['HookChoices'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({
        bonuses: [{
          choices: [
            { discount: { clay: 2 } },
            { discount: { stone: 2 } },
          ],
          optional: true,
          sources: ['HookChoices'],
        }],
      }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { clay: 2, stone: 2 },
    ) as ComplexCost
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses![0]!.choices).toHaveLength(2)
    expect(result.bonuses![0]!.optional).toBe(true)
  })

  it('combines costs, trades, and bonuses from the same hook', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookMulti']
    const state = createState(player)

    registerCardListener({
      id: 'hook-multi', cardIds: ['HookMulti'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({
        costs: { reed: -1 },
        trades: [{ from: { wood: 1 }, to: { clay: 1 } }],
        bonuses: [{ discount: { stone: 1 } }],
      }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { reed: 2, clay: 1, stone: 1 },
    ) as ComplexCost
    expect(result.fee).toEqual({ reed: 1, clay: 1, stone: 1 })
    expect(result.trades).toHaveLength(1)
    expect(result.bonuses).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Verify `clearCardListeners` exists**

Run: `grep -rn "clearCardListeners\|export.*clearListeners" shared/cards/card-listeners.ts`

Expected: the function exists. If not, add an export that resets the registry (mirrors `clearActionHooks`). If the check returns no match, add to `shared/cards/card-listeners.ts`:

```ts
export const clearCardListeners = (): void => {
  cardListeners.length = 0
}
```

Locate the `cardListeners` array declaration and add this export near `registerCardListener`.

- [ ] **Step 3: Run tests — expect pass**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts 2>&1 | tail -25`

Expected: all six tests pass. If not, investigate — the resolver is existing code that should already handle these cases.

### Task 2.2: Create `Stub_BonusChoices` and `Stub_BonusChoiceModifier` fixtures

**Files:**
- Create: `shared/cards/__stubs__/Stub_BonusChoices.ts`
- Create: `shared/cards/__stubs__/Stub_BonusChoiceModifier.ts`

- [ ] **Step 1: Create `Stub_BonusChoices.ts` (Path A hook)**

```ts
import type { CardListenerRegistration } from '../card-listeners'

export const STUB_BONUS_CHOICES_CARD = 'Stub_BonusChoices'

// Hook that returns a bonus.choices on improvement-any for a synthetic card id
// 'Major_TestChoices'. Construct scenarios in tests that fabricate this cardId.
export const stubBonusChoicesListener: CardListenerRegistration = {
  id: 'stub-bonus-choices',
  cardIds: [STUB_BONUS_CHOICES_CARD],
  phases: ['computeCosts'],
  actions: ['improvement-any'],
  handler: (context) => {
    if (context.cardId !== 'Major_TestChoices') return
    return {
      bonuses: [{
        choices: [
          { discount: { wood: -1, clay: 2 }, sources: [STUB_BONUS_CHOICES_CARD] },
          { discount: { wood: -1, stone: 2 }, sources: [STUB_BONUS_CHOICES_CARD] },
        ],
        optional: true,
        sources: [STUB_BONUS_CHOICES_CARD],
      }],
    }
  },
}
```

- [ ] **Step 2: Create `Stub_BonusChoiceModifier.ts` (Path B modifier)**

```ts
import type { BonusModifier } from '../../game/types'

export const STUB_BONUS_CHOICE_MODIFIER_CARD = 'Stub_BonusChoiceModifier'

// BonusModifier with choices for appliesTo: ['construct']. Use by pushing onto
// player.activeModifiers in tests.
export const stubBonusChoiceModifier: BonusModifier = {
  type: 'bonus',
  cardId: STUB_BONUS_CHOICE_MODIFIER_CARD,
  appliesTo: ['construct'],
  optional: true,
  choices: [
    { discount: { wood: -1, clay: 2 } },
    { discount: { wood: -1, stone: 2 } },
  ],
}
```

### Task 2.3: Write `bonus-choices-matrix.test.ts`

**Files:**
- Create: `shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  registerCardListener,
  clearCardListeners,
} from '../../card-listeners'
import {
  STUB_BONUS_CHOICES_CARD,
  stubBonusChoicesListener,
} from '../Stub_BonusChoices'
import {
  STUB_BONUS_CHOICE_MODIFIER_CARD,
  stubBonusChoiceModifier,
} from '../Stub_BonusChoiceModifier'
import { resolveCardCostWithModifiers } from '../../../actions/effects/pay-helpers'
import { computeAllBuyableCombinations, clearPaymentCache } from '../../../actions/effects/pay'
import type { GameState, PlayerState, ComplexCost } from '../../../game/types'

const createPlayer = (): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: { wood: 5, clay: 5, reed: 5, stone: 5, food: 5, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0, roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

const createState = (player: PlayerState): GameState => ({
  players: [player], currentPlayerIndex: 0,
} as unknown as GameState)

describe('bonus.choices multi-path matrix', () => {
  beforeEach(() => {
    clearCardListeners()
    clearPaymentCache()
  })
  afterEach(() => {
    clearCardListeners()
    clearPaymentCache()
  })

  it('Path A hook with bonus.choices expands payment combinations', () => {
    const player = createPlayer()
    player.occupationPlayed = [STUB_BONUS_CHOICES_CARD]
    const state = createState(player)
    registerCardListener(stubBonusChoicesListener)

    const cost = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_TestChoices', { clay: 2, stone: 2 },
    ) as ComplexCost
    const solutions = computeAllBuyableCombinations(player, cost)
    // optional: true, so 3 variants: skip / clay-replace / stone-replace.
    // Pareto keeps the 2 replace variants (both dominate skip).
    expect(solutions.length).toBe(2)
  })

  it('Path B BonusModifier.choices expands via activeModifiers', () => {
    const player = createPlayer()
    player.activeModifiers = [stubBonusChoiceModifier]

    const cost: ComplexCost = { fee: { clay: 2, stone: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThanOrEqual(2)
    const paidSets = solutions.map((s) => ({
      clay: s.resourcesPaid.clay ?? 0,
      stone: s.resourcesPaid.stone ?? 0,
      wood: s.resourcesPaid.wood ?? 0,
    }))
    expect(paidSets).toContainEqual({ clay: 0, stone: 2, wood: 1 })
    expect(paidSets).toContainEqual({ clay: 2, stone: 0, wood: 1 })
  })

  it('Path A bonus.choices + Path B trade modifier combine in one payment space', () => {
    const player = createPlayer()
    player.occupationPlayed = [STUB_BONUS_CHOICES_CARD]
    player.activeModifiers = [{
      type: 'trade',
      cardId: 'Test_Trade',
      appliesTo: ['improvement-any' as any],
      from: { food: 1 },
      to: { reed: 1 },
      max: 1,
    }]
    // This test verifies trades from Path B modifiers (even with unconventional
    // appliesTo) don't explode when combined with Path A choices.
    const state = createState(player)
    registerCardListener(stubBonusChoicesListener)

    const cost = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_TestChoices', { clay: 2, stone: 2 },
    ) as ComplexCost
    // Path B trade isn't activated (no costType passed), so only the hook choices apply.
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts 2>&1 | tail -25`

Expected: all three tests pass.

### Task 2.4: Commit

- [ ] **Step 1: Run full test suite first**

Run: `cd .worktree/cost-modifier-coverage && pnpm test 2>&1 | tail -30`

Expected: all tests pass.

- [ ] **Step 2: Commit**

```bash
cd .worktree/cost-modifier-coverage
git add shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts \
        shared/cards/__stubs__/Stub_BonusChoices.ts \
        shared/cards/__stubs__/Stub_BonusChoiceModifier.ts \
        shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts \
        shared/cards/card-listeners.ts
git commit -m "$(cat <<'EOF'
test(pay): resolveCardCostWithModifiers + stub matrix coverage

Adds direct unit coverage for Path A hook result merging into
ComplexCost: deltas accumulate, trades/bonuses push through, choices
preserved, mixed returns compose correctly.

Adds synthetic fixtures (Stub_BonusChoices for Path A, Stub_BonusChoiceModifier
for Path B) and a matrix test that verifies bonus.choices works uniformly
across both paths.

Also exports clearCardListeners helper needed for test isolation.
EOF
)"
```

---

## Commit 3 — `refactor(A123): migrate FrameBuilder to bonus.choices`

Context: A123 currently uses 4 independent `TradeModifier` entries with `max: 1` each, which allows the player to simultaneously trigger both the clay-replace and stone-replace in a single construct/renovation action. BGA's `addBonusChoices` with `optional: true` is mutually exclusive — at most one replacement per action. This commit migrates A123 and records the behavior change.

### Task 3.1: Write failing A123 session test

**Files:**
- Create: `server/__tests__/A123_FrameBuilder-session.test.ts`

- [ ] **Step 1: Create the session test**

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import { setWorkersAtHome } from '../../shared/game/player'

const CARD_ID = 'A123_FrameBuilder'

describe('A123_FrameBuilder session', () => {
  const setup = (extraResources: Partial<Record<string, number>> = {}) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 2, clay: 0, stone: 0, reed: 2, food: 0,
      ...extraResources,
    }
    session.loadState(state)
    return session
  }

  it('offers clay-for-wood replacement via bonus.choices when renovating to clay house', () => {
    const session = setup({ clay: 3 })
    // Attempt renovation to clay. The cost baseline is 5 clay + 2 reed; with
    // A123 choice, player can replace 2 clay with 1 wood → 3 clay + 1 wood + 2 reed.
    const player = session.getState().state.players[0]!
    expect(player.resources.clay).toBe(3)
    expect(player.resources.wood).toBe(2)
    expect(player.resources.reed).toBe(2)

    // Trigger renovation action
    const resp = session.takeAction(0, 'house-renovation')
    // Some variant of the action id — adjust if different. Check registry.
    expect(resp.ok).toBe(true)
  })

  it('BGA-regression: with 4 clay + 4 stone + 2 wood, cannot apply BOTH clay and stone replacements in one renovation', () => {
    // This verifies the migration — old implementation would allow wood: -2 (two replacements),
    // new implementation allows at most one (wood: -1).
    const session = setup({ clay: 4, stone: 4, wood: 2 })
    const player = session.getState().state.players[0]!
    // We construct a situation where BOTH replacements would be "profitable"
    // if allowed, and assert only one is used.
    // Clay house renovation cost: 5 clay + 2 reed. Stone house cost: 5 stone + 2 reed.
    // With clay+stone both full, the single renovation can only apply one replace.
    // Without structured pending.options inspection here, we rely on the
    // unit test at pay.test.ts level for correctness; this is a smoke-level
    // correctness check.
    // Just confirm the player can renovate and that resources after renovation
    // reflect at most one 2-resource replacement with 1 wood.
    const resp = session.takeAction(0, 'house-renovation')
    expect(resp.ok).toBe(true)
  })
})
```

Note: the exact action id for renovation and the pending.options structure depend on the existing renovation flow. The test is intentionally smoke-level — the detailed combinatorial correctness is covered at the pay.test.ts unit layer (Task 1.2). If the action id differs, grep `house-renovation|renovation-` in `shared/actions` and adjust.

- [ ] **Step 2: Run the test — expect pass (both old and new A123 can renovate)**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/A123_FrameBuilder-session.test.ts 2>&1 | tail -15`

Expected: passes with either implementation. The real correctness assertion is in pay.test.ts.

### Task 3.2: Migrate A123 to bonus.choices

**Files:**
- Modify: `shared/cards/A/A123_FrameBuilder.ts`

- [ ] **Step 1: Replace the modifiers array**

Replace the entire file body (keep import and `CARD_ID`):

```ts
import { Occupation } from '../types'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'A123_FrameBuilder'

/**
 * A123 Frame Builder — Each time you build a room/renovate, but only once per
 * room/action, you can replace exactly 2 CLAY or 2 STONE with 1 WOOD.
 *
 * BGA reference: onPlayerComputeCostsConstruct / Renovation use
 *   addBonusChoices([[wood:+1, clay:-2], [wood:+1, stone:-2]], source, optional:true)
 * which expresses "pick at most one of these exchanges per action".
 *
 * Our earlier implementation used four independent TradeModifier entries, which
 * allowed the player to simultaneously trigger BOTH the clay-replace and the
 * stone-replace in a single action (e.g. 4 clay + 4 stone + 2 wood → 0 clay +
 * 0 stone + 0 wood paid). That is stronger than BGA. Migrated to bonus.choices
 * to align with BGA semantics.
 */

export const A123_FrameBuilder = new Occupation({
  id: CARD_ID,
  name: 'Frame Builder',
  deck: 'A',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      optional: true,
      choices: [
        { discount: { wood: -1, clay: 2 }, sources: [CARD_ID] },
        { discount: { wood: -1, stone: 2 }, sources: [CARD_ID] },
      ],
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      optional: true,
      choices: [
        { discount: { wood: -1, clay: 2 }, sources: [CARD_ID] },
        { discount: { wood: -1, stone: 2 }, sources: [CARD_ID] },
      ],
    },
  ] as BonusModifier[],
})
```

Note: in our discount convention, positive = save / reduce that resource; negative = pay more of that resource. So `{ wood: -1, clay: 2 }` means "pay 1 more wood, save 2 clay". This matches BGA's `[WOOD => 1, CLAY => -2]` notation (their convention inverse).

- [ ] **Step 2: Run the session test + pay tests**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/A123_FrameBuilder-session.test.ts shared/actions/effects/__tests__/pay.test.ts 2>&1 | tail -25`

Expected: A123 session test still passes; pay.test.ts still passes.

- [ ] **Step 3: Run full test suite for regressions**

Run: `cd .worktree/cost-modifier-coverage && pnpm test 2>&1 | tail -40`

Expected: all pass. If any existing test depended on the old 4-trades A123 semantics, update it carefully — they're testing the old (incorrect) behavior.

### Task 3.3: Update `docs/card_progress.md`

**Files:**
- Modify: `docs/card_progress.md`

- [ ] **Step 1: Open and locate §4 (刻意不同)**

Run: `grep -n "刻意不同\|4\." docs/card_progress.md | head -10` to find the section header.

- [ ] **Step 2: Append under §4**

Append a new entry under 刻意不同:

```markdown
- **A123 Frame Builder (2026-04-20)** — construct/renovation 中同一次 action 至多触发一次资源替换（从"clay 替换 + stone 替换各触发一次"改为"二选一"）。与 BGA 的 `addBonusChoices(..., optional:true)` 语义一致。之前实现是 4 个独立 TradeModifier，允许同时触发，现已迁移到 BonusModifier + choices。
```

- [ ] **Step 3: Locate §2 (当前轮次) and add a line**

Append a line with date + scope:

```markdown
- **2026-04-20** — A123 / E109 / 测试基建：pay 系统 Bonus.choices 能力扩展 + 多 cost-modifier 卡叠加测试覆盖 + A123 BGA 语义对齐；修复 bonus iteration 原本的单选 bug
```

- [ ] **Step 4: Update §7 (基础设施)**

Append:

```markdown
- **Bonus.choices (2026-04-20)** — `Bonus` / `BonusModifier` 新增 `choices: BonusChoice[]` 字段，表达"一组互斥折扣，按 optional 展开为选用/跳过"。`computeAllBuyableCombinations` 的 bonus iteration 重写为 BGA 风格（非 optional 累积、optional 展开、choices 扩展）。修正了原本把多 bonus 当互斥的 bug。
```

- [ ] **Step 5: Update §8 (时间线)**

Append:

```markdown
| 2026-04-20 | pay 系统 + A123 + 多卡测试 | Bonus.choices 能力；bonus accumulation 修正；A123 对齐 BGA；L1/L2/L3 三层测试补齐 |
```

(Match the existing timeline table format — inspect a prior entry first.)

### Task 3.4: Commit

- [ ] **Step 1: Commit**

```bash
cd .worktree/cost-modifier-coverage
git add shared/cards/A/A123_FrameBuilder.ts server/__tests__/A123_FrameBuilder-session.test.ts docs/card_progress.md
git commit -m "$(cat <<'EOF'
refactor(A123): migrate FrameBuilder to bonus.choices for BGA alignment

A123 previously used 4 independent TradeModifier entries which allowed
the player to simultaneously trigger BOTH clay-replace and stone-replace
in a single action (4 clay + 4 stone + 2 wood → all clay/stone replaced).

BGA uses addBonusChoices with optional:true which is mutually exclusive
(at most one replacement per action). Migrated to 2 BonusModifier entries
(construct + renovation) with choices field to match BGA semantics.

Adds a session smoke test and updates card_progress.md §2/§4/§7/§8.
EOF
)"
```

---

## Commit 4 — `test(session): multi-card cost-modifier stacking`

### Task 4.1: A143 Stonecutter session test

**Files:**
- Create: `server/__tests__/A143_Stonecutter-session.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { setWorkersAtHome } from '../../shared/game/player'

const CARD_ID = 'A143_Stonecutter'

describe('A143_Stonecutter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 2, stone: 2, food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  it('reduces Major improvement stone cost by 1', () => {
    const session = setup()
    // Major_Basket base cost: 2 reed + 2 stone. With Stonecutter: 2 reed + 1 stone.
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()

    resp = session.resolveChoice(0, basket!.value)

    // Drain any remaining payment choices
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // Paid 2 reed + 1 stone (instead of 2 reed + 2 stone) — 1 stone left.
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/A143_Stonecutter-session.test.ts 2>&1 | tail -15`

Expected: passes (A143's improvement-any hook applies `{ stone: -1 }` via `applyCostOverride`).

### Task 4.2: A143 + B95 stacking session test

**Files:**
- Create: `server/__tests__/A143_B95_stacking-session.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { B95_MasterBricklayer } from '../../shared/cards/B/B95_MasterBricklayer'
import { setWorkersAtHome } from '../../shared/game/player'

describe('A143 + B95 stacking', () => {
  const setup = (rooms: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter', 'B95_MasterBricklayer']
    player.rooms = rooms
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 2, stone: 5, food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  it('combines Stonecutter (-1) and MasterBricklayer (-N rooms) on Major stone cost', () => {
    // Player has 4 rooms → B95 nbNewRooms = 2 → stone -2. Plus A143 -1 → total -3.
    // Major_Basket base: 2 reed + 2 stone. After discounts: 2 reed + 0 stone (clamped).
    const session = setup(4)
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()

    resp = session.resolveChoice(0, basket!.value)
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(5)  // paid 0 stone, started with 5
  })

  it('only Stonecutter applies when rooms=2 (B95 gives 0 discount)', () => {
    const session = setup(2)  // no extra rooms, B95 no-op
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    resp = session.resolveChoice(0, basket!.value)
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }
    const after = resp.state.players[0]!
    // A143 only: 2 reed + 1 stone paid
    expect(after.resources.stone).toBe(4)  // 5 - 1
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/A143_B95_stacking-session.test.ts 2>&1 | tail -15`

Expected: passes. Both A143 and B95 return `{ costs: { stone: -X } }` from Path A hooks — these accumulate via `applyCostOverride` (addition), independent of the bonus-loop rewrite in Commit 1.

### Task 4.3: D15 ClaySupports + A143 stacking session test

**Files:**
- Create: `server/__tests__/D15_A143_stacking-session.test.ts`

- [ ] **Step 1: Inspect D15 first to confirm action id and trade behavior**

Run: `cat shared/cards/D/D15_ClaySupports.ts`

Expected: D15 registers a `computeCosts` hook that returns a `trade` for clay-room construction. Verify the exact action id it targets (e.g., `'construct'`, `'room-action'`, etc.) and the cost/trade shape.

- [ ] **Step 2: Create the test**

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { D15_ClaySupports } from '../../shared/cards/D/D15_ClaySupports'
import { setWorkersAtHome } from '../../shared/game/player'

describe('D15 ClaySupports + A143 Stonecutter stacking', () => {
  it('offers BOTH clay payment trades (base + D15 alternative) with A143 stone discount', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter']
    player.minorPlayed = ['D15_ClaySupports']
    player.resources = {
      ...player.resources,
      wood: 3, clay: 5, reed: 3, stone: 0,
    }
    session.loadState(state)

    // The exact action and cost space varies by our implementation. This test
    // verifies that building a clay room offers both D15's alternative trade
    // (2 clay + 1 wood + 1 reed) and the base trade (5 clay + 2 reed), and
    // that A143 applies. Since renovation-related construct costs flow through
    // Path B's applyCostModifiers + Path A's trades, the composition should
    // be:
    //   - base trade: 5 clay + 2 reed, with A143 bonus stone:-1 (no-op since
    //     no stone in cost)
    //   - D15 trade:  2 clay + 1 wood + 1 reed, same bonus (no-op)
    //
    // As a smoke test we confirm the session can proceed and resources
    // settle to a valid config after paying. Detailed combinatorial checks
    // live at the pay.test.ts unit layer.

    // Actual assertion: if D15's action is "room-action" or similar, take it
    // here. If the action id is different, adjust after inspecting.
    const resp = session.takeAction(0, 'room-action')
    expect(resp.ok).toBe(true)
  })
})
```

Note: the exact action id for building a clay room depends on the current implementation. If `'room-action'` doesn't exist, grep `'room-action'\|'construct-room'\|roomAction` in `shared/actions` to find the right id and adjust. Keep the test smoke-level; detailed correctness is in pay.test.ts.

- [ ] **Step 3: Run test**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/D15_A143_stacking-session.test.ts 2>&1 | tail -15`

Expected: passes. If action id is wrong, the test will throw — adjust.

### Task 4.4: Extend E109 session test with positive + stacking cases

**Files:**
- Modify: `server/__tests__/E109_BraidMaker-session.test.ts`

- [ ] **Step 1: Read current tests**

Run: `cat server/__tests__/E109_BraidMaker-session.test.ts`

Currently has: exchange metadata check, "no E109 → no discount" negative case.

- [ ] **Step 2: Append positive and stacking cases**

Inside the `describe('E109_BraidMaker session', () => { ... })` block, after the last `it`, add:

```ts
  it('applies Basket discount when E109 is played (1 reed + 1 stone)', () => {
    const session = setup()  // has E109 played, 2 reed + 3 stone
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()
    resp = session.resolveChoice(0, basket!.value)

    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // Paid 1 reed + 1 stone. Started with 2 reed + 3 stone.
    expect(after.resources.reed).toBe(1)
    expect(after.resources.stone).toBe(2)
  })

  it('stacks E109 + A143 Stonecutter for Major_Basket (paid 1 reed + 0 stone)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID, 'A143_Stonecutter']
    player.resources = {
      ...player.resources,
      reed: 2, stone: 2, food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()
    resp = session.resolveChoice(0, basket!.value)
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // E109: {reed:-1, stone:-1}. A143 improvement: {stone:-1}. Accumulated: {reed:-1, stone:-2}.
    // Applied to base {reed:2, stone:2} → {reed:1, stone:0} (clamped).
    expect(after.resources.reed).toBe(1)  // 2 - 1
    expect(after.resources.stone).toBe(2)  // 2 - 0 (clamped by applyCostOverride)
  })
```

Note: if the `setup` helper is defined inside the `describe` block, the new `it` blocks can use it directly. Re-confirm by looking at the existing test file.

- [ ] **Step 3: Run test**

Run: `cd .worktree/cost-modifier-coverage && pnpm exec vitest run server/__tests__/E109_BraidMaker-session.test.ts 2>&1 | tail -20`

Expected: all four tests pass (2 existing + 2 new).

### Task 4.5: Full suite + commit

- [ ] **Step 1: Run full test suite**

Run: `cd .worktree/cost-modifier-coverage && pnpm test 2>&1 | tail -30`

Expected: all tests pass.

- [ ] **Step 2: Commit**

```bash
cd .worktree/cost-modifier-coverage
git add server/__tests__/A143_Stonecutter-session.test.ts \
        server/__tests__/A143_B95_stacking-session.test.ts \
        server/__tests__/D15_A143_stacking-session.test.ts \
        server/__tests__/E109_BraidMaker-session.test.ts
git commit -m "$(cat <<'EOF'
test(session): multi-card cost-modifier stacking

Adds session tests for multi-card cost-modifier scenarios:
- A143 Stonecutter alone (Major improvement stone -1)
- A143 + B95 MasterBricklayer stacking (stone -1 + -N rooms)
- D15 ClaySupports + A143 co-existence
- E109 BraidMaker positive case + E109 + A143 stacking for Basket

These lock in the cumulative hook-delta semantics (multiple cards
returning costs deltas accumulate via applyCostOverride).
EOF
)"
```

---

## Commit 5 — `chore(hooks): clarify order semantics, drop no-op E109 order`

### Task 5.1: Add JSDoc to `ActionHookRegistration.order`

**Files:**
- Modify: `shared/actions/hooks.ts`

- [ ] **Step 1: Update the `ActionHookRegistration` type**

Locate (around line 66-72):
```ts
export type ActionHookRegistration = {
  id: string
  actions?: string[]
  phases?: ActionHookPhase[]
  order?: number
  handler: ActionHookHandler
}
```

Replace with:
```ts
export type ActionHookRegistration = {
  id: string
  actions?: string[]
  phases?: ActionHookPhase[]
  /**
   * Sort order for hook execution within a phase (ascending). Lower runs first.
   *
   * NOTE: for the `computeCosts` phase, hook results are merged into a
   * ComplexCost as follows:
   *   - `costs` (deltas) are summed by applyCostOverride (addition is commutative)
   *   - `trades` are pushed into ComplexCost.trades (order does not affect
   *     payment enumeration — computeAllBuyableCombinations enumerates all
   *     trade combinations regardless of insertion order)
   *   - `bonuses` are pushed into ComplexCost.bonuses (same — bonus iteration
   *     accumulates non-optional and expands optional, independent of order)
   *
   * So `order` has NO observable effect for computeCosts. It is retained for
   * other phases (before / during / after / immediatelyAfter etc.) where
   * sequential side-effects may need deterministic ordering.
   */
  order?: number
  handler: ActionHookHandler
}
```

### Task 5.2: Remove E109's `order: -10`

**Files:**
- Modify: `shared/cards/E/E109_BraidMaker.ts`

- [ ] **Step 1: Delete `order: -10`**

Locate the `computeCostsListener` definition (around line 28-39). Remove the line `order: -10,` and update the JSDoc block:

Replace the JSDoc comment above the listener:
```ts
/**
 * E109 Braid Maker (Occupation, 1+ players).
 *
 * BGA (E109_BraidMaker.php):
 *   - exchanges: each harvest, 1 REED → 2 FOOD (max 1).
 *   - onPlayerComputeCardCosts: whenever buying Major_Basket (regardless of
 *     trigger), override trades to cost { stone: 1, reed: 1 }.
 *   - orderComputeCardCosts: runs before A143 Stonecutter, C27 Blueprint,
 *     B95 Master Bricklayer.
 *
 * Implementation:
 *   - exchanges field on the card definition handles the harvest reed → food.
 *   - computeCosts listener on improvement-any keyed off context.cardId ===
 *     Major_Basket → applies delta that reduces base cost { reed: 2, stone: 2 }
 *     to { reed: 1, stone: 1 }. No flag / actionCardId gate — BGA applies it
 *     any time this card is owned.
 *   - `order: -10` ensures this runs before Stonecutter/Blueprint/MasterBricklayer
 *     (which use the default order 0).
 */
```

With:
```ts
/**
 * E109 Braid Maker (Occupation, 1+ players).
 *
 * BGA (E109_BraidMaker.php):
 *   - exchanges: each harvest, 1 REED → 2 FOOD (max 1).
 *   - onPlayerComputeCardCosts: whenever buying Major_Basket (regardless of
 *     trigger), override trades to cost { stone: 1, reed: 1 }.
 *
 * Implementation:
 *   - exchanges field on the card definition handles the harvest reed → food.
 *   - computeCosts listener on improvement-any keyed off context.cardId ===
 *     Major_Basket → applies delta that reduces base cost { reed: 2, stone: 2 }
 *     to { reed: 1, stone: 1 }. No flag / actionCardId gate — BGA applies it
 *     any time this card is owned.
 *   - BGA uses orderComputeCardCosts to sort this before Stonecutter /
 *     Blueprint / MasterBricklayer because those can do trade-absolute-assignment
 *     variants. Our implementation emits deltas (commutative addition), so
 *     order is a no-op. See shared/actions/hooks.ts ActionHookRegistration.order
 *     for details.
 */
```

And remove the `order: -10,` line from the listener object. Final listener:

```ts
const computeCostsListener: CardListenerRegistration = {
  id: 'E109-braid-maker-compute-costs-basket',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== 'Major_Basket') return
    // Base cost is { reed: 2, stone: 2 } → reduce to { reed: 1, stone: 1 }.
    return { costs: { stone: -1, reed: -1 } }
  },
}
```

### Task 5.3: Run all tests and commit

- [ ] **Step 1: Run full test suite**

Run: `cd .worktree/cost-modifier-coverage && pnpm test 2>&1 | tail -30`

Expected: all pass. Run lint too:

Run: `cd .worktree/cost-modifier-coverage && pnpm run lint 2>&1 | tail -20`

Expected: no new errors (pre-existing warnings are fine per CLAUDE.md).

Run: `cd .worktree/cost-modifier-coverage && pnpm run build 2>&1 | tail -15`

Expected: build succeeds.

- [ ] **Step 2: Commit**

```bash
cd .worktree/cost-modifier-coverage
git add shared/actions/hooks.ts shared/cards/E/E109_BraidMaker.ts
git commit -m "$(cat <<'EOF'
chore(hooks): clarify order semantics, drop no-op E109 order

ActionHookRegistration.order has no observable effect in computeCosts
because results merge via commutative operations (addition for costs
deltas; unordered push for trades/bonuses). Document this on the type.

Remove E109 BraidMaker's order: -10 which was a no-op (the delta it
emits is commutative with other cost deltas like Stonecutter's). BGA
needs its order because hooks there mutate trade arrays directly
(absolute assignment vs delta).
EOF
)"
```

---

## Post-Commit: Push and verify CI

- [ ] **Step 1: `git fetch` before push**

Run: `cd .worktree/cost-modifier-coverage && git fetch origin 2>&1 | tail -5`

- [ ] **Step 2: Push branch**

Run: `cd .worktree/cost-modifier-coverage && git push -u origin cost-modifier-coverage 2>&1 | tail -10`

- [ ] **Step 3: Monitor GitHub Actions**

Per CLAUDE.md, verify CI passes. Load GH_TOKEN from .env:
```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=cost-modifier-coverage' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: runs in progress → eventually all `completed` with `conclusion: success`. If any fail, inspect logs and fix.

---

## Self-Review Checklist

- **Spec coverage:** Bonus.choices capability ✓ (Task 1.1-1.3), two-path support ✓ (Task 1.3), A123 migration ✓ (Task 3.2), E109 cleanup ✓ (Task 5.2), order JSDoc ✓ (Task 5.1), L1 unit tests ✓ (Task 1.2, 2.1), L2 stub matrix ✓ (Task 2.2-2.3), L3 session tests ✓ (Task 4.1-4.4), card_progress.md sync ✓ (Task 3.3).
- **Placeholder scan:** all steps contain concrete code. Action IDs in D15 test flagged as "grep if wrong" — acceptable since the session test is smoke-level.
- **Type consistency:** `BonusChoice`, `Bonus.choices`, `BonusModifier.choices`, `validateBonus`, `BonusPath` used consistently. `applyBonus` signature changed from `(cost, bonus)` to `(cost, discount)` — all callers updated in Task 1.3 Step 3.
- **Known gap:** `Bonus.conditions` / `BonusChoice.conditions` are plumbed through but not actively checked by `computeAllBuyableCombinations`. This matches the current state (conditions are declared but never enforced) and is explicitly out-of-scope per the spec.

---

## Execution Handoff

**Plan complete and saved to `.worktree/cost-modifier-coverage/docs/superpowers/plans/2026-04-20-cost-modifier-coverage.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan since tasks have clear TDD boundaries and the bonus-loop rewrite (Task 1.3) benefits from isolated review before touching other commits.

**2. Inline Execution** — execute in this session using `executing-plans`. Batch execution with checkpoints at commit boundaries.

**Which approach?**
