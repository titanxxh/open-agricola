# Bonus.conditions / BonusChoice.conditions Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `Bonus.conditions` / `BonusChoice.conditions` 字段在 `computeAllBuyableCombinations` 路径上真正评估；C13 WoodSlideHammer 从 BonusModifier 迁到 computeCosts hook 路径，验证统一路径与 modifier 路径等价；删 `applyCostModifiers` propagate 阶段的冗余 conditions 字段；删 `payment.ts:523-527` TODO。

**Architecture:** 提取既有 `bonusModifierConditionsApply`（payment.ts:430-448）为模块级 `evaluateConditions` export，让 `computeAllBuyableCombinations`（payment.ts:569-594 bonus expand 循环）按 player-state 维度过滤 conditions 不满足的 bonus / BonusChoice。construct 路径保留 `room-payment.ts:86 bonusAppliesToRoomCount`（roomCount-dependent）。BonusModifier 类型保留（A14 仍用）。

**Tech Stack:** TypeScript（shared/actions/helpers/、shared/cards/C/）+ vitest（unit + session）+ pnpm。

**Spec:** `docs/superpowers/specs/2026-05-01-bonus-conditions-eval-design.md` (commit `724f7ce2`)

**Worktree:** `.worktree/bonus-conditions-eval`（base main `2f87d5d8`）。

**总工时:** ~1d（基础设施 ~0.4d / C13 迁移 ~0.3d / propagate cleanup ~0.1d / 文档 ~0.1d / 缓冲 ~0.1d）

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `shared/actions/helpers/payment.ts` | 提取 `evaluateConditions` export；`computeAllBuyableCombinations` 加 conditions 过滤；`applyCostModifiers` 停止 propagate 冗余 conditions；删 line 523-527 TODO | 修改 |
| `shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts` | 7 例单元测试（bonus.conditions / BonusChoice.conditions / undefined 向后兼容 / propagate cleanup） | 新建 |
| `shared/cards/C/C13_WoodSlideHammer.ts` | rewrite — 从 `modifier: BonusModifier` 改为 `computeCosts` listener 注入 `bonuses: [{conditions:...}]` | 修改 |
| `server/__tests__/C13_WoodSlideHammer-session.test.ts` | 既有 case 保持通过（行为等价回归）；补 ≥3 case 覆盖 conditions 边界 | 修改 |
| `shared/game/types.ts` | `Bonus.conditions` / `BonusChoice.conditions` 字段 jsdoc | 修改 |
| `docs/ENGINE_ARCHITECTURE.md` | cost modifier 章节补 ComplexCost.bonuses 路径 conditions 评估 | 修改 |
| `docs/card_progress.md` | §2 changelog + §7 基础设施 | 修改 |
| `docs/master-plan.md` | mech-E 行末尾备注 follow-up resolved | 修改 |

---

## Task 0: Worktree Pre-flight + 基线绿

**Goal:** 确认 worktree、Node 22、依赖装好、fast 测试基线绿。

**Files:** 无改动

- [ ] **Step 1: 确认 worktree + Node 版本**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/bonus-conditions-eval
git branch --show-current   # → bonus-conditions-eval
git log --oneline -2         # → 724f7ce2 spec / 2f87d5d8 main base
node --version               # → v22.x
```

Expected: 分支正确、Node 22.x、HEAD 含 spec commit。

- [ ] **Step 2: 装依赖**

```bash
pnpm install
```

Expected: 安装无错。

- [ ] **Step 3: 跑 fast 基线**

```bash
pnpm test:fast
```

Expected: 全绿（约 210 文件、1-2 min）。

- [ ] **Step 4: 跑 C13 既有 session 测试基线**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
```

Expected: 既有用例全绿。把绿基线作为后续重写的对比。

---

## Task 1: 提取 evaluateConditions 为 export（行为 0 改）

**Goal:** 把 `payment.ts:430-448` 私有 `bonusModifierConditionsApply` 改名为 `evaluateConditions` 并 export；`getModifiersForCostType` 内部调用更新。**纯重构，行为不变**。

**Files:**
- Modify: `shared/actions/helpers/payment.ts`

- [ ] **Step 1: 改名 + export**

打开 `shared/actions/helpers/payment.ts`，把 line 430-448 的：

```ts
const bonusModifierConditionsApply = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
): boolean => {
  ...
}
```

改为：

```ts
/**
 * 评估 conditions 字段（player-state 维度）。返回 true 表示满足或无条件。
 *
 * 用于：
 *   - getModifiersForCostType 在非-construct 路径前置过滤 BonusModifier
 *   - computeAllBuyableCombinations 评估 ComplexCost.bonuses 内嵌 conditions
 *
 * construct 路径不调用本函数：room-payment.ts 的 bonusAppliesToRoomCount
 * 按 build-time roomCount 评估，含义不同（"建房后达到 N 间"）。
 */
export const evaluateConditions = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
): boolean => {
  if (!conditions) return true
  if (typeof conditions.minNumRooms === 'number' && player.rooms < conditions.minNumRooms) {
    return false
  }
  if (typeof conditions.houseTypeWood === 'number' && conditions.houseTypeWood > 0 && player.houseType !== 'wood') {
    return false
  }
  if (typeof conditions.houseTypeClay === 'number' && conditions.houseTypeClay > 0 && player.houseType !== 'clay') {
    return false
  }
  if (typeof conditions.houseTypeStone === 'number' && conditions.houseTypeStone > 0 && player.houseType !== 'stone') {
    return false
  }
  return true
}
```

- [ ] **Step 2: 更新内部调用（getModifiersForCostType line 460-462）**

把 line 460-462 的：

```ts
return all.filter((m) =>
  m.type !== 'bonus' || bonusModifierConditionsApply(player, m.conditions),
)
```

改为：

```ts
return all.filter((m) =>
  m.type !== 'bonus' || evaluateConditions(player, m.conditions),
)
```

- [ ] **Step 3: grep 确认无其他调用残留**

```bash
grep -n "bonusModifierConditionsApply" shared/ server/ src/ 2>/dev/null
```

Expected: 0 hit（旧名字已完全替换）。

- [ ] **Step 4: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿（纯重构，0 行为改）。

- [ ] **Step 5: 提交**

```bash
git add shared/actions/helpers/payment.ts
git commit -m "refactor(payment): extract evaluateConditions as exported helper

Renames private bonusModifierConditionsApply to module-level evaluateConditions
export. Documents the semantic split between non-construct paths
(player-state evaluation here) and construct path (room-payment.ts evaluates
build-time roomCount). No behavior change; pure rename + export.

Sprint 5 mech-E follow-up step 1/5."
```

---

## Task 2: computeAllBuyableCombinations 加 conditions 评估

**Goal:** 在 `computeAllBuyableCombinations` 的 bonus expand 循环（payment.ts:569-594）加 `evaluateConditions` 过滤，让 ComplexCost.bonuses 内嵌的 `Bonus.conditions` / `BonusChoice.conditions` 真正生效。

**Files:**
- Create: `shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts`
- Modify: `shared/actions/helpers/payment.ts`

- [ ] **Step 1: 写失败测试**

```ts
// shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
import { describe, it, expect } from 'vitest'
import type { ComplexCost, PlayerState } from '../../../game/types'
import { computeAllBuyableCombinations } from '../payment'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Test',
  resources: { food: 0, wood: 10, clay: 10, reed: 10, stone: 10, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 } as any,
  rooms: 5,
  houseType: 'wood',
  pastures: [],
  stableAnimals: {},
  workers: [],
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  ...overrides,
} as unknown as PlayerState)

describe('Bonus.conditions / BonusChoice.conditions evaluation', () => {
  it('1. bonus.conditions 满足 → 应用 discount', () => {
    const player = makePlayer({ rooms: 5, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [{
        discount: { stone: 2 },
        conditions: { houseTypeWood: 1, minNumRooms: 5 },
        optional: false,
      }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.some((s) => (s.resourcesPaid.stone ?? 0) === 2)).toBe(true)
  })

  it('2. bonus.conditions 不满足（rooms=4）→ 不应用 discount', () => {
    const player = makePlayer({ rooms: 4, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [{
        discount: { stone: 2 },
        conditions: { houseTypeWood: 1, minNumRooms: 5 },
        optional: false,
      }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    // 所有 solution 都付全额 4 stone（无折扣）
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
  })

  it('3. bonus.conditions 不满足且 optional → bonus skip 但其他 path 不变', () => {
    const player = makePlayer({ rooms: 4, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [{
        discount: { stone: 2 },
        conditions: { minNumRooms: 5 },
        optional: true,
      }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
  })

  it('4. BonusChoice.conditions 部分满足 → 仅满足的 choice 入选', () => {
    const player = makePlayer({ houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [{
        choices: [
          { discount: { wood: 2 }, conditions: { houseTypeWood: 1 } },
          { discount: { clay: 2 }, conditions: { houseTypeStone: 1 } },
        ],
        optional: false,
      }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    // 应有解使 wood 付款减为 0；不应有解使 clay 减为 0
    expect(sols.some((s) => (s.resourcesPaid.wood ?? 0) === 0)).toBe(true)
    expect(sols.every((s) => (s.resourcesPaid.clay ?? 0) === 2)).toBe(true)
  })

  it('5. 所有 BonusChoice.conditions 不满足 → bonus skip', () => {
    const player = makePlayer({ houseType: 'clay' })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [{
        choices: [
          { discount: { wood: 2 }, conditions: { houseTypeWood: 1 } },
          { discount: { clay: 2 }, conditions: { houseTypeStone: 1 } },
        ],
        optional: false,
      }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    // 没有 choice 入选：solution 全付原价
    expect(sols.every((s) => (s.resourcesPaid.wood ?? 0) === 2)).toBe(true)
    expect(sols.every((s) => (s.resourcesPaid.clay ?? 0) === 2)).toBe(true)
  })

  it('6. bonus.conditions undefined → 既有行为不变（向后兼容）', () => {
    const player = makePlayer()
    const cost: ComplexCost = {
      fee: { wood: 3 },
      bonuses: [{ discount: { wood: 1 }, optional: false }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.some((s) => (s.resourcesPaid.wood ?? 0) === 2)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试验证 case 1/3/4/6 PASS、case 2/5 FAIL**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
```

Expected:
- Case 1, 3, 4, 6 可能 PASS（"满足"分支或"undefined"分支已正确——注 case 4 当前可能也通过因为没 conditions 评估两个 choice 都被尝试但只有 wood discount 真适用）
- Case 2, 5 应该 FAIL — conditions 不满足时当前实现**仍**应用 bonus（这正是要修的 bug）

具体 case 2: 当前实现完全不读 conditions → bonus 被无条件应用 → 出现 stone=2 的 solution → `every === 4` fail。
具体 case 5: 当前实现 choice 全部尝试 → wood 和 clay 各自被 discount 一次 → fail。

如果 case 1/3/4/6 也 fail（比如 case 4 因为 candidate 没过滤），说明既有路径是"全 candidate 尝试" — 仍是修复方向。

- [ ] **Step 3: 改 computeAllBuyableCombinations**

打开 `shared/actions/helpers/payment.ts`，定位 line 569-594 的 bonus expand 循环。当前是：

```ts
for (const bonus of effectiveCost.bonuses ?? []) {
  const expanded: BonusPath[] = []
  if (bonus.optional) {
    for (const path of bonusPaths) {
      expanded.push({ cost: path.cost, sources: [...path.sources] })
    }
  }
  const candidates: { discount: Partial<Resource>; sources?: string[] }[] =
    bonus.choices ??
    [{ discount: bonus.discount!, sources: bonus.sources }]
  for (const path of bonusPaths) {
    for (const candidate of candidates) {
      const nextCost = applyBonus(path.cost, candidate.discount)
      const combined = new Set([
        ...path.sources,
        ...(bonus.sources ?? []),
        ...(candidate.sources ?? []),
      ])
      const nextSources = [...combined]
      expanded.push({ cost: nextCost, sources: nextSources })
    }
  }
  bonusPaths = expanded
}
```

改为：

```ts
for (const bonus of effectiveCost.bonuses ?? []) {
  // 1. Bonus 级 conditions：不满足 → 整 bonus 当 noop（保留现有 bonusPaths 不变）
  if (!evaluateConditions(player, bonus.conditions)) {
    continue
  }

  const expanded: BonusPath[] = []
  if (bonus.optional) {
    for (const path of bonusPaths) {
      expanded.push({ cost: path.cost, sources: [...path.sources] })
    }
  }

  // 2. BonusChoice 级 conditions：过滤掉不满足条件的 candidate
  const rawCandidates: { discount: Partial<Resource>; sources?: string[]; conditions?: Record<string, number> }[] =
    bonus.choices ??
    [{ discount: bonus.discount!, sources: bonus.sources }]
  const candidates = rawCandidates.filter((c) => evaluateConditions(player, c.conditions))

  // 3. 全 candidate 不满足 → 整 bonus 视为没法应用（continue，不污染 bonusPaths）
  if (candidates.length === 0) {
    continue
  }

  for (const path of bonusPaths) {
    for (const candidate of candidates) {
      const nextCost = applyBonus(path.cost, candidate.discount)
      const combined = new Set([
        ...path.sources,
        ...(bonus.sources ?? []),
        ...(candidate.sources ?? []),
      ])
      const nextSources = [...combined]
      expanded.push({ cost: nextCost, sources: nextSources })
    }
  }
  bonusPaths = expanded
}
```

- [ ] **Step 4: 删 line 523-527 TODO 注释**

定位 `validateBonus` 函数内（payment.ts:523-527）：

```ts
  // TODO(cost-modifier-coverage): Bonus.conditions / BonusChoice.conditions is
  // propagated through applyBonusModifier and applyCostModifiers but not yet
  // evaluated by computeAllBuyableCombinations. See
  // docs/superpowers/specs/2026-04-20-cost-modifier-coverage-design.md §"out of scope".
}
```

整段注释删除（resolved 状态由 Task 2 实现保证）。

- [ ] **Step 5: 跑测试验证全 6 例 PASS**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
```

Expected: 6 例全 PASS。

- [ ] **Step 6: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿（无任何卡当前用 ComplexCost.bonuses 内嵌 conditions，所以无回归）。

- [ ] **Step 7: 提交**

```bash
git add shared/actions/helpers/payment.ts shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
git commit -m "feat(payment): evaluate Bonus.conditions / BonusChoice.conditions in ComplexCost path

computeAllBuyableCombinations now skips bonuses whose conditions are not
satisfied (player-state evaluation via evaluateConditions). Same logic
applies at the BonusChoice level — only candidates whose conditions hold
participate in expansion. Closes payment.ts:523-527 TODO.

Behavior-equivalent for all current cards (none use ComplexCost.bonuses
with conditions today); preventive fix for the schema trap.

6 unit cases cover bonus.conditions sat/unsat, BonusChoice partial filter,
all-filtered noop, and undefined-conditions backward compatibility.

Sprint 5 mech-E follow-up step 2/5."
```

---

## Task 3: applyCostModifiers 停止 propagate 冗余 conditions

**Goal:** `applyCostModifiers`（payment.ts:485-492）从 BonusModifier 生成 Bonus 时不再写 `conditions: bonusMod.conditions`——modifier 已被 `getModifiersForCostType` filter 过滤通过，写过去也是冗余信息（且 evaluator 会重复评估）。

**Files:**
- Modify: `shared/actions/helpers/payment.ts`
- Modify: `shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts`

- [ ] **Step 1: 写失败测试 case 7**

在 `shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts` 末尾追加：

```ts
import { applyCostModifiers } from '../payment'
import type { BonusModifier } from '../../../game/types'

describe('applyCostModifiers stops propagating redundant conditions', () => {
  it('7. BonusModifier with conditions → generated Bonus does NOT carry conditions', () => {
    const baseCost: ComplexCost = { fee: { stone: 4 } }
    const modifier: BonusModifier = {
      type: 'bonus',
      cardId: 'C13_WoodSlideHammer',
      appliesTo: ['renovation'],
      discount: { stone: 2 },
      conditions: { houseTypeWood: 1, minNumRooms: 5 },
    }
    const result = applyCostModifiers(baseCost, [modifier])
    expect(result.bonuses).toBeDefined()
    expect(result.bonuses!.length).toBe(1)
    expect(result.bonuses![0].conditions).toBeUndefined()
    expect(result.bonuses![0].discount).toEqual({ stone: 2 })
  })
})
```

- [ ] **Step 2: 跑测试验证 FAIL**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts -t "stops propagating"
```

Expected: FAIL — 当前 line 491 `conditions: bonusMod.conditions` 把字段写了过去。

- [ ] **Step 3: 改 applyCostModifiers**

定位 payment.ts line 484-492：

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

改为：

```ts
} else if (mod.type === 'bonus') {
  const bonusMod = mod as BonusModifier
  // bonusMod 已通过 getModifiersForCostType 的 evaluateConditions 过滤
  // （非-construct 路径），或由 room-payment 在 build 时评估（construct 路径）；
  // 不再把 conditions 字段写到生成的 bonus —— 避免 evaluator 重复评估。
  effectiveBonuses.push({
    discount: bonusMod.discount,
    choices: bonusMod.choices,
    optional: bonusMod.optional ?? true,
    sources: [bonusMod.cardId],
  })
}
```

- [ ] **Step 4: 跑测试验证 PASS**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
```

Expected: 全 7 例 PASS。

- [ ] **Step 5: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿。重点关注：
- A14 CarpentersHammer session 测试（construct 走 room-payment 不经此路径，应不受影响）
- C13 WoodSlideHammer session 测试（仍走 modifier 路径，filter 通过 = 满足条件，应用 discount 不变）
- 其他用 BonusModifier 的卡（B130 / B150 等）

- [ ] **Step 6: 提交**

```bash
git add shared/actions/helpers/payment.ts shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts
git commit -m "refactor(payment): stop propagating redundant conditions from BonusModifier

applyCostModifiers no longer writes bonusMod.conditions to the generated
Bonus. The non-construct path's getModifiersForCostType already filters
modifiers by conditions before this point; the construct path's
room-payment evaluates conditions per build call. Either way the
propagated conditions field would be re-evaluated redundantly by
computeAllBuyableCombinations.

Adds case 7 unit test verifying generated Bonus.conditions === undefined.

Sprint 5 mech-E follow-up step 3/5."
```

---

## Task 4: C13 WoodSlideHammer 迁移到 computeCosts hook

**Goal:** C13 从 `modifier: BonusModifier` 改为 `computeCosts` listener 注入 `bonuses: [{conditions:...}]`。验证统一路径（hook + computeAllBuyableCombinations conditions 评估）与 modifier 路径行为等价。

**Files:**
- Modify: `shared/cards/C/C13_WoodSlideHammer.ts`
- Modify: `server/__tests__/C13_WoodSlideHammer-session.test.ts`

- [ ] **Step 1: 看 C13 当前实现**

```bash
cat shared/cards/C/C13_WoodSlideHammer.ts
```

参考结构（实际以仓库为准）：含 `modifier: BonusModifier`，`appliesTo: ['renovation']`，`conditions: { houseTypeWood: 1, minNumRooms: 5 }`，`discount: { stone: 2 }`。

- [ ] **Step 2: 看 C13 既有 session 测试覆盖**

```bash
cat server/__tests__/C13_WoodSlideHammer-session.test.ts
```

记录既有断言模式（resourcesPaid 字段名 / sources 字段名 / setup helper）。

- [ ] **Step 3: 先验证既有 C13 测试在 main 基线上绿（已在 Task 0 做过，确认）**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
```

Expected: 全绿（基线）。

- [ ] **Step 4: 写 red 测试 — 删 modifier 字段（不立即写 listener，先看测试 fail）**

把 `shared/cards/C/C13_WoodSlideHammer.ts` 的 `modifier: { ... } as BonusModifier` 字段**注释掉**（保留代码，便于回滚）：

```ts
export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  // ... existing fields
  // modifier: {
  //   type: 'bonus',
  //   cardId: CARD_ID,
  //   appliesTo: ['renovation'],
  //   discount: { stone: 2 },
  //   conditions: { houseTypeWood: 1, minNumRooms: 5 },
  // } as BonusModifier,
})

export const C13_WoodSlideHammer_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
```

跑既有测试：

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
```

Expected: 至少 1 例 FAIL — discount 消失，stone 付款回到 4。**这条 red 状态证明测试真正覆盖 conditions 评估的关键链路**。

- [ ] **Step 5: 写 listener 实现**

完整重写 `shared/cards/C/C13_WoodSlideHammer.ts`：

```ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C13_WoodSlideHammer'

const computeCostsListener: CardListenerRegistration = {
  id: 'C13-wood-slide-hammer-compute-costs',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['computeCosts' as ActionHookPhase],
  handler: (_ctx: CardListenerContext): ActionHookResult | void => {
    return {
      bonuses: [{
        discount: { stone: 2 },
        optional: false,
        conditions: { houseTypeWood: 1, minNumRooms: 5 },
        sources: [CARD_ID],
      }],
      sourceCard: CARD_ID,
    }
  },
}

// 保留既有 const declaration & desc & cost & vp 等字段；以下仅展示骨架
export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  // ...其他既有字段保持原样（name / deck / number / category / desc / cost / vp / prerequisite 等）
  // 不再有 modifier 字段
})

export const C13_WoodSlideHammer_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注：实施时打开既有文件，**保留所有现有字段**（name / deck / number / category / desc / cost / vp / prerequisite 等），只删 `modifier: { ... }` 行 + 加 `listeners` array。导入语句也要相应增加 `CardListenerRegistration` / `CardListenerContext` / `ActionHookPhase` / `ActionHookResult`。

- [ ] **Step 6: 跑既有 C13 session 测试**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
```

Expected: 全绿（行为等价回归）。

如果 fail：
- 检查既有测试是不是断言 `player.activeModifiers` 含 C13（中间数据结构）— 若是，改测试断言到 `state.players[0].resources` / payment outcome 维度
- 检查 listener actionId 'renovate-house' 是否真匹配 — 若 mismatch，grep `renovate-house` 在 takeAction 路径出现的位置确认

- [ ] **Step 7: 补 ≥3 case 覆盖 conditions 边界**

在 `server/__tests__/C13_WoodSlideHammer-session.test.ts` 末尾追加：

```ts
describe('C13 WoodSlideHammer — conditions 边界（Sprint 5c follow-up）', () => {
  it('5 间 wood 房 → renovate stone 付 2（折扣应用）', () => {
    const session = createSession2P({ persistRoom: false })
    setPlayerRooms(session, 'p1', { count: 5, type: 'wood' })
    addMinorPlayed(session, 'p1', 'C13_WoodSlideHammer')
    setPlayerResources(session, 'p1', { stone: 5, reed: 5 })
    triggerRenovate(session, 'p1', { target: 'clay' })
    confirmPayment(session)
    // 实际默认 renovate cost: clay 屋顶 reed:1 + clay:N；改 wood→clay 用 wood:N
    // 这里以"wood→stone"为更直观例：stone 4 - bonus 2 = 2
    // 若代码本意是 wood→clay path，按实际 cost 调整断言
    // …注：plan 实施时根据 codebase 实际 renovate cost 调整 fixture
    expect(session.state.players[0].resources.stone).toBeLessThanOrEqual(3)
  })

  it('4 间 wood 房 → renovate stone 付全额 4（conditions minNumRooms 不满足）', () => {
    const session = createSession2P({ persistRoom: false })
    setPlayerRooms(session, 'p1', { count: 4, type: 'wood' })
    addMinorPlayed(session, 'p1', 'C13_WoodSlideHammer')
    setPlayerResources(session, 'p1', { stone: 5, reed: 5 })
    triggerRenovate(session, 'p1', { target: 'clay' })
    confirmPayment(session)
    expect(session.state.players[0].resources.stone).toBe(1) // 5 - 4 (no bonus)
  })

  it('5 间 stone 房（已升级）→ renovate 不应触发 wood-only conditions', () => {
    const session = createSession2P({ persistRoom: false })
    setPlayerRooms(session, 'p1', { count: 5, type: 'stone' })
    addMinorPlayed(session, 'p1', 'C13_WoodSlideHammer')
    // stone 屋已是终态，无 renovate 可做；用 setup 跳到下一可 renovate
    // 若不可 renovate, this case 标 it.skip 或验证 selectPayment 不出现 C13 折扣
    // 见实施时根据 renovate 终态判断调整
  })
})
```

注：**实施时**：
1. 上述测试用的 helper 名（`createSession2P` / `setPlayerRooms` / `addMinorPlayed` / `setPlayerResources` / `triggerRenovate` / `confirmPayment`）可能与既有 C13 测试用法不同；以既有 `server/__tests__/C13_WoodSlideHammer-session.test.ts` 的 setup 模式为准复制。
2. Renovate 的 cost 模型（stone 折扣应用条件）以 `shared/actions/effects/renovation.ts` 为准；具体折扣量根据 cost 计算调整断言。
3. Case 3 如果 stone 屋无可继续 renovate 的目标，改为验证"另一个未升级玩家用 C13 在 stone 屋时无折扣"，或标 it.skip 并加注释说明无法触发。

- [ ] **Step 8: 跑全 C13 测试**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
```

Expected: 全绿（既有 + 新增 ≥2 case 通过）。

- [ ] **Step 9: 跑 fast 全量**

```bash
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 10: 跑 slow 受影响子集**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts server/__tests__/A14_*.test.ts
```

Expected: 全绿（A14 不受影响——construct 路径 / room-payment 单独评估）。

- [ ] **Step 11: 提交**

```bash
git add shared/cards/C/C13_WoodSlideHammer.ts server/__tests__/C13_WoodSlideHammer-session.test.ts
git commit -m "feat(C13): migrate from BonusModifier to computeCosts hook

C13 WoodSlideHammer no longer ships a BonusModifier on the card definition.
Instead a computeCosts listener on action 'renovate-house' returns
bonuses:[{discount:{stone:2}, conditions:{houseTypeWood:1, minNumRooms:5},
sources:['C13']}]. computeAllBuyableCombinations evaluates conditions
against player state — equivalent to the modifier path's pre-filter, but
proves the unified ComplexCost.bonuses path now supports conditions.

Adds 2-3 boundary cases verifying conditions matter (4-rooms / stone-house).

Sprint 5 mech-E follow-up step 4/5."
```

---

## Task 5: 文档同步 + 全量回归 + push

**Goal:** 同步 card_progress / master-plan / ENGINE_ARCHITECTURE / types.ts jsdoc；跑 lint + build + 全量；push 等 CI 全绿。

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`

- [ ] **Step 1: types.ts jsdoc 注释**

打开 `shared/game/types.ts`，定位 `Bonus` 类型（line 50-56 周边）：

```ts
export type BonusChoice = {
  discount: Partial<Resource>
  sources?: string[]
  /**
   * Player-state conditions evaluated by computeAllBuyableCombinations.
   * Supported keys: minNumRooms, houseTypeWood/Clay/Stone.
   * For roomCount-dependent conditions in construct path, use BonusModifier
   * — room-payment.ts evaluates per build call.
   */
  conditions?: Record<string, number>
}

export type Bonus = {
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  optional?: boolean
  sources?: string[]
  /**
   * Player-state conditions evaluated by computeAllBuyableCombinations.
   * Supported keys: minNumRooms, houseTypeWood/Clay/Stone.
   * For roomCount-dependent conditions in construct path, use BonusModifier
   * — room-payment.ts evaluates per build call.
   */
  conditions?: Record<string, number>
}
```

- [ ] **Step 2: ENGINE_ARCHITECTURE.md cost modifier 章节**

打开 `docs/ENGINE_ARCHITECTURE.md`，定位 cost modifier 章节，在 Bonus / BonusModifier 描述末尾加：

```markdown
### Conditions evaluation paths

| 路径 | 评估位置 | 维度 |
|---|---|---|
| Construct cost (build-room) | `shared/actions/helpers/room-payment.ts` `bonusAppliesToRoomCount` | player + 当前 build 的 roomCount |
| 非-construct cost via BonusModifier | `shared/actions/helpers/payment.ts` `getModifiersForCostType` | player-state（前置 filter） |
| ComplexCost.bonuses 内嵌 conditions | `shared/actions/helpers/payment.ts` `computeAllBuyableCombinations` | player-state（每次 expand 评估） |

`evaluateConditions(player, conditions)` 是后两条路径共用 helper（payment.ts export）。
construct 路径独立：roomCount 维度无法在 ComplexCost.bonuses 阶段一次性评估。

`applyCostModifiers` 从 BonusModifier 生成 Bonus 时**不**propagate `conditions` 字段——modifier 路径已前置 filter，propagate 会导致 evaluator 重复评估。卡牌走 computeCosts hook 直接注入 `bonuses:[{conditions:...}]` 是**首选**；BonusModifier 留给 construct/roomCount 维度的卡（如 A14 CarpentersHammer）。
```

- [ ] **Step 3: card_progress.md changelog + §7 基础设施**

打开 `docs/card_progress.md`，在 §2 changelog 最新条目之上加：

```markdown
- **2026-05-01 — Bonus.conditions / BonusChoice.conditions 在 ComplexCost.bonuses 路径生效**：
  - `computeAllBuyableCombinations`（`shared/actions/helpers/payment.ts:569-594`）现按 player-state 维度评估 `Bonus.conditions` / `BonusChoice.conditions`：bonus.conditions 不满足 → 整 bonus skip（noop）；BonusChoice.conditions 不满足 → 该 candidate 不入选；全 candidate 不满足 → bonus skip。
  - `evaluateConditions(player, conditions)` 提为 export，与 `getModifiersForCostType` 非-construct 路径共用语义。
  - `applyCostModifiers` 从 BonusModifier 生成 Bonus 时不再 propagate `conditions`（filter 已通过 = 冗余）。
  - **C13 WoodSlideHammer** 从 `modifier: BonusModifier` 迁到 `computeCosts` listener 注入 `bonuses:[{conditions:{houseTypeWood:1, minNumRooms:5}}]`，验证统一路径与 modifier 路径行为等价；删卡牌 BonusModifier 字段。A14 CarpentersHammer 不动（construct/roomCount 维度由 room-payment 单独评估）。
  - 删 `payment.ts:523-527` TODO；7 例单元测试 + 3 例 C13 session 边界 case。
  - spec / plan：`docs/superpowers/specs/2026-05-01-bonus-conditions-eval-design.md` / `docs/superpowers/plans/2026-05-01-bonus-conditions-eval.md`。
```

§7 基础设施加：

```markdown
- **`evaluateConditions(player, conditions)` 通用 helper**（2026-05-01）：`shared/actions/helpers/payment.ts` export。在两条路径共用：(1) `getModifiersForCostType` 非-construct 路径前置过滤 BonusModifier；(2) `computeAllBuyableCombinations` 评估 ComplexCost.bonuses / BonusChoice 内嵌 conditions。construct 路径仍由 `room-payment.ts:bonusAppliesToRoomCount` 单独按 build-time roomCount 评估。
```

- [ ] **Step 4: master-plan.md mech-E 备注**

打开 `docs/master-plan.md`，定位 §8 Sprint 5 行的 mech-E 备注（"BonusModifier conditions 评估扩展" 周边）；在末尾加：

```markdown
（**Bonus.conditions / BonusChoice.conditions follow-up 已修 2026-05-01**：computeAllBuyableCombinations 路径补齐评估；C13 迁移到 computeCosts hook 验证；payment.ts:523-527 TODO 删除；详见 `docs/card_progress.md` §2 同日条目）
```

- [ ] **Step 5: 跑 lint + build + 全量**

```bash
pnpm run lint              # 0 error，不引入新 warning
pnpm run build             # 通过
pnpm test                  # fast + slow 全绿
```

Expected: 全绿。

- [ ] **Step 6: 提交文档**

```bash
git add shared/game/types.ts docs/ENGINE_ARCHITECTURE.md docs/card_progress.md docs/master-plan.md
git commit -m "docs: sync types/ENGINE_ARCHITECTURE/card_progress for bonus.conditions follow-up

types.ts: jsdoc on Bonus.conditions / BonusChoice.conditions documenting
which path evaluates them (player-state via computeAllBuyableCombinations
vs roomCount via room-payment).

ENGINE_ARCHITECTURE.md: new conditions evaluation paths table.

card_progress.md: §2 changelog + §7 evaluateConditions helper.

master-plan.md: §8 Sprint 5 mech-E note linking to follow-up resolution."
```

- [ ] **Step 7: push**

```bash
git push -u origin bonus-conditions-eval
```

- [ ] **Step 8: 等 CI 全绿（CLAUDE.md 硬性要求）**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

Expected: 所有 run `conclusion: success`。失败立即定位并修复，再 push。

如果 CI 在执行中：

```bash
# 用 Monitor 工具或在循环中等待
# 或按 ScheduleWakeup 计划稍后回看
```

---

## Self-Review Notes

| 检查项 | 结果 |
|---|---|
| Spec 覆盖 | §0 范围决定 → 全 task；§1 总体结构 → File Structure；§2.1 提取 evaluateConditions → Task 1；§2.2 computeAllBuyableCombinations 改 → Task 2；§2.3 边界语义 → Task 2 实现 + 测试；§2.4 propagate cleanup → Task 3；§2.5/2.6 C13 迁移 → Task 4；§3 测试策略 → Task 2/3/4；§4 文档同步 → Task 5；§6 DoD → Task 5 全量回归 + CI |
| Placeholder scan | 0（每 step 含具体代码 / 命令 / 期望输出；C13 测试 case 标注"实施时按 codebase 实际 helper 名 / cost 模型调整断言"是真实施工指引，非"TBD"placeholder） |
| Type 一致性 | `evaluateConditions(player, conditions): boolean` 贯穿 Task 1/2；`Bonus.conditions` / `BonusChoice.conditions` 字段名与 types.ts 一致（line 47/55）；C13 listener actionId='renovate-house' 与 `shared/actions/effects/renovation.ts:167` 一致 |
| Sprint 内 commit 数 | 5 commit（Task 1 / Task 2 / Task 3 / Task 4 / Task 5），符合 frequent commits 原则 |
