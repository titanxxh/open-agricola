# Bonus.conditions / BonusChoice.conditions 评估补齐 Design

> **Sprint 5 mech-E follow-up**：把 `Bonus.conditions` / `BonusChoice.conditions` 字段在 `computeAllBuyableCombinations` 路径上真正评估（之前仅 `BonusModifier.conditions` 在 mech-E 修过外层 modifier filter）；并把 C13 WoodSlideHammer 从 BonusModifier 迁到 computeCosts hook 路径，验证统一路径与 modifier 路径行为等价。

**Goal**：消除 schema 陷阱（`Bonus.conditions` 字段存在但实现不评估），让未来卡可以直接通过 computeCosts hook 注入 `bonuses: [{conditions: ...}]` 而不必绕道 BonusModifier。

**Architecture**：保持卡牌闭环 + 通用扩展点。提取 `evaluateConditions(player, conditions)` 为 export；`computeAllBuyableCombinations` 在 bonus expand 循环过滤掉 conditions 不满足的 bonus / BonusChoice。construct 路径保留 room-payment.ts 自行按 roomCount 评估的特殊语义（minNumRooms 在 construct 含义 = "建房后达到 N 间"，不是 player-state）。

**Tech Stack**：TypeScript（shared/actions/helpers/、shared/cards/C/）+ vitest（单元 + session）+ pnpm。

**Worktree**：`.worktree/bonus-conditions-eval`（base main `2f87d5d8`）。

**总工时**：~1d（基础设施 ~0.4d / C13 迁移 ~0.3d / propagate cleanup ~0.1d / 文档 ~0.1d / 缓冲 ~0.1d）

---

## 0. 背景

### 0.1 现状（payment.ts:523-527 TODO）

| 路径 | 当前 conditions 评估 |
|---|---|
| **construct cost** → `room-payment.ts` `bonusAppliesToRoomCount`（line 86-105） | ✅ 每次 build 按 `roomCount` 评估（mech-E 之前就有） |
| **非-construct modifier** 路径 → `getModifiersForCostType` `bonusModifierConditionsApply`（payment.ts:430-448） | ✅ mech-E 修过：在 modifier 注入 ComplexCost 之前过滤 |
| **ComplexCost 直接内嵌 `bonuses: [{conditions}]`** → `computeAllBuyableCombinations`（payment.ts:569-594） | ❌ 完全不读 conditions 字段 — 直接当 unconditional bonus 应用 |

### 0.2 影响面（grep 实际使用）

| 卡 | 路径 | conditions 评估 |
|---|---|---|
| **A14 CarpentersHammer** | BonusModifier × 4，appliesTo: ['construct'] | ✅ room-payment.ts 按 roomCount 评估 |
| **C13 WoodSlideHammer** | BonusModifier × 1，appliesTo: ['renovation']，conditions: { houseTypeWood:1, minNumRooms:5 } | ✅ mech-E getModifiersForCostType 过滤 |
| **D95 SiteManager** | computeCosts listener 注入 ComplexCost.bonuses | ✅ 不带 conditions 字段（无 gap） |
| **Stub_BonusChoices** | 测试 stub | ✅ 不带 conditions 字段（无 gap） |

**当前没有任何真实卡触发 ComplexCost.bonuses 内嵌 conditions 的 gap**。这是**预防性 / schema 一致性** follow-up：types.ts 定义了 `Bonus.conditions` / `BonusChoice.conditions` 字段，但 `computeAllBuyableCombinations` 不评估，导致写卡的人会预期它生效却静默失败。

### 0.3 范围决定

- ✅ 把 `Bonus.conditions` / `BonusChoice.conditions` 字段在 `computeAllBuyableCombinations` 路径生效
- ✅ 把 C13 从 BonusModifier 迁到 computeCosts hook（验证统一路径等价）
- ✅ `applyCostModifiers` propagate 阶段停止写冗余 `conditions` 字段（modifier 已被前置过滤）
- ❌ 删除 `BonusModifier` 类型 — A14 的 construct/roomCount 维度无法迁
- ❌ 改写 A14 — construct path 的 roomCount-dependent conditions 由 room-payment 单独评估
- ❌ 改 `getModifiersForCostType` filter — 仍是有效的前置性能优化
- ❌ 引入新 conditions kind（如 minNumOccupations 等）— YAGNI

---

## 1. 总体结构

### 1.1 修改路径

```
Bonus.conditions / BonusChoice.conditions evaluation
  ├─ shared/actions/helpers/payment.ts
  │    ├─ 提取 evaluateConditions(player, conditions) export（与既有 bonusModifierConditionsApply 共用语义）
  │    ├─ getModifiersForCostType 内部仍调 evaluateConditions（替代旧名）
  │    ├─ computeAllBuyableCombinations bonus expand 循环加：
  │    │    if !evaluateConditions(player, bonus.conditions) → continue (整 bonus skip)
  │    │    candidates.filter(c => evaluateConditions(player, c.conditions))
  │    │    if candidates.length === 0 → continue
  │    └─ applyCostModifiers (line 491) 不再 propagate bonusMod.conditions 字段
  │       (filter 已通过 = 满足条件，写过去也是冗余)
  └─ shared/cards/C/C13_WoodSlideHammer.ts
       从 modifier: BonusModifier 迁到 computeCosts listener 注入
       bonuses: [{ discount: { stone: 2 }, optional: false,
                   conditions: { houseTypeWood: 1, minNumRooms: 5 },
                   sources: [CARD_ID] }]
```

### 1.2 行为不变性保证

| 卡 / 场景 | 当前行为 | 改后行为 |
|---|---|---|
| C13 (renovation, 5 wood-rooms) | mech-E filter 通过 → modifier 注入 → bonus 生效 | hook 注入 → computeAllBuyableCombinations evaluate conditions 通过 → bonus 生效 |
| C13 (renovation, 4 rooms) | filter 拒绝 → modifier 不注入 → bonus 不应用 | hook 注入 bonus（无前置过滤）→ evaluator 拒绝 → bonus 视为 noop（等价不应用） |
| C13 (renovation, 5 stone-rooms) | filter 拒绝（houseTypeWood 不满足）→ modifier 不注入 | hook 注入 → evaluator 拒绝 → noop |
| A14 CarpentersHammer | room-payment.ts 按 build-time roomCount 评估 ✅ | 完全不动 — 仍走 BonusModifier + room-payment 路径 |
| 既有 D95 / Stub_BonusChoices | bonus.conditions 字段未定义 → evaluator 看到 undefined → skip 评估 → 全部应用 | 同上（向后兼容） |
| BonusModifier 路径其他卡 | mech-E filter 仍生效 | mech-E filter 保留；propagate 阶段不再写冗余 conditions |

### 1.3 文件清单

| 位置 | 改动类型 |
|---|---|
| `shared/actions/helpers/payment.ts` | export `evaluateConditions`；computeAllBuyableCombinations 加 conditions 评估；applyCostModifiers stop propagating redundant conditions；删 line 523-527 TODO |
| `shared/cards/C/C13_WoodSlideHammer.ts` | rewrite — 从 modifier 改为 computeCosts listener |
| `shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts` (新) | 7 例单元测试 |
| `server/__tests__/C13_WoodSlideHammer-session.test.ts` | 既有 session 测试保持通过；可选补 2 case 覆盖 conditions 边界 |
| `shared/game/types.ts` | `Bonus.conditions` / `BonusChoice.conditions` 字段加 jsdoc |
| `docs/ENGINE_ARCHITECTURE.md` | cost modifier 章节补 ComplexCost.bonuses 路径 conditions 评估规则 |
| `docs/card_progress.md` | §2 changelog + §7 基础设施 |

---

## 2. 实施细节

### 2.1 提取 evaluateConditions 为 export

```ts
// shared/actions/helpers/payment.ts
// 把 line 430-448 的 bonusModifierConditionsApply 改名为 evaluateConditions 并 export
// （construct path 仍用 room-payment.ts:86 的 bonusAppliesToRoomCount，因为它带 roomCount 参数）

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

// getModifiersForCostType 调用处把 bonusModifierConditionsApply 替换为 evaluateConditions
```

### 2.2 computeAllBuyableCombinations 加 conditions 评估

把 line 569-594 的 bonus expand 循环改造：

```ts
for (const bonus of effectiveCost.bonuses ?? []) {
  // 1. Bonus 级 conditions：不满足 → 整个 bonus 当 noop（保留所有现有 paths 不变）
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

  // 如果所有 candidate 都被过滤掉，跳过（等价 conditional bonus 不应用）
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

### 2.3 边界 case 语义

| Case | 行为 |
|---|---|
| `bonus.conditions` 不满足 | 整 bonus 当 noop（continue），不污染 bonusPaths |
| `bonus.choices` 全 candidate.conditions 不满足 | 整 bonus 视为没法应用（continue）；optional bonus 的 "skip" path 不补（一开始就没 expand 过）— 与 BonusModifier filter 路径等价 |
| `conditions` undefined | evaluateConditions return true → 既有行为不变 |
| optional bonus + conditions 不满足 | continue（不应用）— optional 标志只在 conditions 通过的前提下才决定 "用还是不用" |

### 2.4 applyCostModifiers 停止冗余 propagate conditions

```ts
// payment.ts:485-492 改造
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
    // 删 conditions: bonusMod.conditions
  })
}
```

注：construct 路径走 room-payment 不调 applyCostModifiers 的这条 branch（room-payment 自己处理 modifier list）。所以这个改动只影响非-construct 路径 — 已被 filter 过滤通过的 modifier 不再有冗余 conditions 字段写到下游。

### 2.5 C13 WoodSlideHammer 迁移

```ts
// shared/cards/C/C13_WoodSlideHammer.ts (rewrite)
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C13_WoodSlideHammer'

const computeCostsListener: CardListenerRegistration = {
  id: 'C13-wood-slide-hammer-compute-costs',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],         // 1:1 映射 'renovation' cost type；以 codebase 实际 actionId 为准
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

export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Slide Hammer',
  // ...其他既有字段保持
  cost: { wood: 2 },           // 不再 modifier 字段
})

export const C13_WoodSlideHammer_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### 2.6 删 C13 旧 modifier 字段

`MinorImprovement` 构造器的 `modifier` 字段对 C13 不再需要。**注意**：如果 `MinorImprovement` 类型 `modifier` 是必填字段，需要改 optional（grep 确认；如果必填，改 optional 是正确的 schema 修复方向）。

`CardEffectRegistry` 通过 `modifier` 字段把 BonusModifier 推到 `player.activeModifiers` 数组——C13 删 modifier 后这条 propagate 路径自然不发生。runtime 行为：

```
之前：getModifiersForCostType('renovation') 含 C13 (filter 通过) → modifier 注入 → applyCostModifiers 写 bonus → 应用
之后：getModifiersForCostType('renovation') 不含 C13；computeCosts listener 跑 → 注入 bonus → computeAllBuyableCombinations evaluate conditions → 通过 → 应用
```

---

## 3. 测试策略

### 3.1 单元测试

`shared/actions/helpers/__tests__/bonus-conditions-eval.test.ts`：

| # | 用例 | 准备 | 断言 |
|---|---|---|---|
| 1 | bonus.conditions 满足 → 应用 discount | mock player rooms=5, houseType='wood'；ComplexCost.bonuses=[{discount:{stone:2}, conditions:{houseTypeWood:1,minNumRooms:5}, optional:false}] | computeAllBuyableCombinations 返回 solution 中 stone 付款减 2 |
| 2 | bonus.conditions 不满足（rooms=4）→ 不应用 | 同上但 rooms=4 | solution 中 stone 付款不减；bonus 视为 noop |
| 3 | bonus.conditions 不满足且 optional → 不应用且不影响其他 path | 加另一 optional bonus（不含 conditions）；conditional bonus 不满足 | conditional bonus skip；其他 bonus 正常 expand |
| 4 | BonusChoice.conditions 部分满足 → 仅满足的 choice 入选 | bonus.choices=[{discount:..., conditions:{houseTypeWood:1}}, {discount:..., conditions:{houseTypeStone:1}}], player.houseType='wood' | 只第一个 choice 入选 |
| 5 | 所有 BonusChoice.conditions 不满足 → bonus skip | 同上但 player.houseType='clay' | 整 bonus 视为 noop |
| 6 | bonus.conditions undefined → 既有行为不变（向后兼容） | 当前所有用 bonus 但无 conditions 的 cost | computeAllBuyableCombinations 输出与 baseline 一致 |
| 7 | applyCostModifiers 不再 propagate conditions（schema 一致性） | mock BonusModifier with conditions → applyCostModifiers | 输出 ComplexCost.bonuses[0].conditions === undefined |

### 3.2 C13 session 回归

`server/__tests__/C13_WoodSlideHammer-session.test.ts` —— 既有测试**保持通过**（行为等价回归）。补 2-3 case 覆盖 conditions 边界：

| # | 用例 | 准备 | 断言 |
|---|---|---|---|
| 1 | 5 间 wood 房 + renovate → stone 付 2（折扣应用） | p1 rooms=5, houseType='wood', C13 played, 触发 renovate | resourcesPaid stone=2（未折扣 4）；solution sources 含 'C13_WoodSlideHammer' |
| 2 | 4 间 wood 房 → renovate stone 付 4（无折扣，conditions 不满足） | p1 rooms=4, 同上 | resourcesPaid stone=4；sources 不含 C13 |
| 3 | 5 间 stone 房（已升级）→ renovate 无 stone 折扣（houseTypeWood 不满足） | p1 rooms=5, houseType='stone' | 无折扣 |

### 3.3 全量回归

| 测试 | 期望 |
|---|---|
| `pnpm test:fast` | 全绿 |
| `pnpm test:slow` 中所有依赖 BonusModifier 的卡 session 测试 (A14, C13, B130/B150 等) | 全绿（等价行为） |
| `pnpm run lint` / `pnpm run build` | 0 error，不引入新 warning |

### 3.4 反"假绿"机制

C13 case 1 和 case 2 必须先 red 再 green：
1. 先把 C13 的 modifier 字段删掉（runtime 折扣消失）
2. 跑既有 C13 session 测试 → 应该 fail（折扣未应用）
3. 写 computeCosts listener → 跑 → green
4. 这条红→绿链路证明 conditions 评估真生效，不是被 BGA-orderless modifier 路径"幸运"路过

---

## 4. 文档同步

| 文档 | 改动 |
|---|---|
| `docs/card_progress.md` §2 changelog | "2026-05-01 — Bonus.conditions / BonusChoice.conditions 在 ComplexCost.bonuses 路径生效；C13 WoodSlideHammer 迁移到 computeCosts hook 验证统一路径等价" |
| `docs/card_progress.md` §7 基础设施 | "evaluateConditions(player, conditions) 通用 helper — ComplexCost.bonuses 路径与 BonusModifier 路径共用；construct 路径仍由 room-payment 单独按 roomCount 评估" |
| `docs/master-plan.md` | mech-E 行末尾备注 "Bonus.conditions follow-up 已修"；不需要专门加 sprint 行 |
| `docs/ENGINE_ARCHITECTURE.md` | cost modifier 章节补：ComplexCost.bonuses 路径 conditions 评估规则 + 与 BonusModifier 路径等价关系 |
| `shared/game/types.ts` | `Bonus.conditions` / `BonusChoice.conditions` 字段加 jsdoc："Evaluated by computeAllBuyableCombinations against player state. For roomCount-dependent conditions in construct path, use BonusModifier instead — room-payment evaluates per build call." |
| `shared/actions/helpers/payment.ts:523-527` TODO | 删除（resolved） |

---

## 5. 风险点

| 风险 | 严重度 | 缓解 |
|---|---|---|
| C13 既有 session 测试可能依赖 `player.activeModifiers` 数组含 C13 modifier | 中 | 改测试断言对象到 `state.players[0].resources` / payment outcome 维度（更对齐 BGA），不断言中间数组 |
| `applyCostModifiers` 停止 propagate conditions 后，下游 `applyPaymentSolution` / `bonusUsed` 路径 sources 处理可能变化 | 低 | 单元测试覆盖；C13 session 测试中检查 sources 列表仍含 'C13_WoodSlideHammer'（来自 listener 注入的 bonus.sources） |
| MinorImprovement 类型 `modifier` 字段如果是必填 → C13 删字段编译报错 | 低 | grep MinorImprovement 类型；如果必填，改 optional（schema 修复，正确方向） |
| 现有 cost-modifier-coverage spec（2026-04-20）声明 conditions out-of-scope；现 spec 推翻它 | 低 | 在新 spec 引文老 spec，标明 mech-E 之后的演进路径已让 conditions 生效 |
| listener actions:['renovate-house'] 名字不匹配 codebase 实际 actionId | 低 | plan 阶段 grep 确认；可能是 'renovation' / 'renovate-house' / 'renovate' 之一 |

---

## 6. Definition of Done

1. 单元测试 7 例全绿
2. C13 session 测试（既有 + 补充 ≥3 case）全绿
3. `pnpm test:fast` + 受影响 slow project 子集全绿
4. `pnpm run lint`：0 error；不引入新 warning
5. `pnpm run build`：通过
6. 文档同步（card_progress / ENGINE_ARCHITECTURE / types.ts jsdoc）落实
7. push 后 GitHub Actions 全绿（CLAUDE.md push 后 CI 验证硬性要求）
8. payment.ts:523-527 TODO 已删除
9. C13 不再依赖 `player.activeModifiers`；通过 computeCosts listener 注入 bonus
