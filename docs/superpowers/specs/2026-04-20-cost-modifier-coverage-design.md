# Cost Modifier Coverage & Bonus.choices Capability

日期：2026-04-20
分支：`cost-modifier-coverage`

## 背景

调研 BGA 的 `orderComputeCardCosts` 机制后确认：我们的 pay 系统已有 `ComplexCost { fee, fees, trades, bonuses, cards }` 结构，和 BGA 基本对齐。但存在三处缺口：

1. **`Bonus.choices` 能力缺失**：BGA 的 `addBonusChoices`（A123 FrameBuilder / E123 ResourceHoarder 等）表达"互斥折扣组，至多选一"。我们的 `Bonus` 只能表达单一 discount。
2. **多 cost-modifier 卡叠加场景零测试**：E109 + Stonecutter、A143 + B95、A123 + Stonecutter、D15 + Stonecutter 等组合，当前没有任何 session 级或单元级测试覆盖"多卡生效时玩家看到的支付选择是否正确"。
3. **`resolveCardCostWithModifiers` 无单元测试**：hook 链汇入 ComplexCost 的合并逻辑只被间接覆盖。

同时发现两个小问题：
- **A123_FrameBuilder 当前实现与 BGA 语义不一致**：我们用 4 个独立 `max:1` trade，允许同一 renovation 中同时触发 clay 替换和 stone 替换；BGA 是互斥选一。
- **E109 的 `order: -10`**：在当前纯 delta 加法架构下无实际作用（加法交换律），是照搬 BGA 思路时留下的冗余。

## 两条 cost-modifier 路径（现状）

本仓库当前存在两条独立路径，本轮 **不合并**（单独 PR 处理）：

| 路径 | 形态 | 代表卡 |
|---|---|---|
| **Path A**（hook）| `registerCardListener` + `phase: 'computeCosts'` + `actions: [...]` | E109, A27, D95, D15, C95, B65, E130 |
| **Path B**（activeModifiers）| 卡定义 `modifiers: CostModifier[]` + 运行时 push 到 `player.activeModifiers` | A88, A14, A143, A16, A123, A28, B15, B145, C13, C14, C56, C122, D82, D88 |

两条路径最终都汇入 `computeAllBuyableCombinations`，它穷举所有合法支付组合。BGA 没有这种分叉——它用统一的 per-phase hook 系统。合并是独立改造，本轮明确 out-of-scope。

## 范围

### 做

1. **新增 `Bonus.choices` 能力**，两条路径都支持
2. **`computeAllBuyableCombinations` 的 choices 展开逻辑**
3. **A123_FrameBuilder 迁移**：从 trades 改为 bonus.choices，对齐 BGA 语义
4. **E109 清理**：移除 `order: -10`
5. **`ActionHookRegistration.order` 字段 JSDoc** 说明 computeCosts 场景下的加法交换律保护
6. **L1/L2/L3 三层测试**（单元 / stub / session）覆盖多卡 cost-modifier 交互

### 不做

1. Path A / Path B 合并（独立 PR）
2. 新增 `computeCostsConstruct / Renovation / Fencing` 等细分 phase（和合并一起）
3. `Bonus.conditions`（如 `minNumRooms`）测试补齐
4. 其它 cost-modifier 卡的实现重写（本轮补测试，不改实现，除 A123 外）
5. UI 层 payment choice 视觉呈现验证（规则测试不走 DOM，遵 CLAUDE.md）

## 类型改动

`shared/game/types.ts`：

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

### 不变式

- `discount` 与 `choices` 恰有一个存在（两者都有或都无 → 运行时 throw）
- `choices` 为非空数组
- `choices[i].discount` 非空

这是开发期校验，不是玩家输入校验；违反直接 `throw new Error(...)`。

### `optional` 语义

| 模式 | 行为 |
|---|---|
| `discount` only，`optional: false` | 必须应用 |
| `discount` only，`optional: true` | 展开"用 / 不用"两种组合 |
| `choices`，`optional: false` | 必须选一个 choice（均不可用则该路径无解） |
| `choices`，`optional: true` | 展开"跳过 + 每个 choice"种组合 |

### `conditions` 合并规则

`BonusChoice.conditions` 优先，覆盖 `Bonus.conditions`（直接替换不合并）。

## 展开逻辑（`pay.ts::computeAllBuyableCombinations`）

当前 bonus 展开（伪码）：

```
for each bonus:
  prev = combinations
  combinations = optional ? prev : []
  for each comb in prev:
    if canApply(comb, bonus):
      push(comb + bonus.discount)
```

扩展为：

```
for each bonus:
  prev = combinations
  combinations = optional ? prev : []
  candidates = bonus.choices ?? [bonus.asImplicitChoice()]
  for each comb in prev:
    for each choice in candidates:
      if canApply(comb, choice):
        push(comb + choice.discount)
```

Path A（`pay-helpers.ts::resolveCardCostWithModifiers`）无需改动：hook 返回的 `Bonus`（含 choices）直接进入 `collectedBonuses`，由新版展开逻辑识别。

Path B（`pay.ts::applyCostModifiers`）：`BonusModifier.choices` 映射到对应 `Bonus.choices`。

## A123_FrameBuilder 迁移

### 之前（4 trades）

```ts
modifiers: [
  { type: 'trade', cardId, appliesTo: ['construct'],  from: { wood: 1 }, to: { clay: 2 },  max: 1 },
  { type: 'trade', cardId, appliesTo: ['construct'],  from: { wood: 1 }, to: { stone: 2 }, max: 1 },
  { type: 'trade', cardId, appliesTo: ['renovation'], from: { wood: 1 }, to: { clay: 2 },  max: 1 },
  { type: 'trade', cardId, appliesTo: ['renovation'], from: { wood: 1 }, to: { stone: 2 }, max: 1 },
]
```

### 之后（2 bonus.choices）

```ts
modifiers: [
  {
    type: 'bonus',
    cardId: CARD_ID,
    appliesTo: ['construct'],
    optional: true,
    choices: [
      { discount: { wood: 1, clay: -2 },  sources: [CARD_ID] },
      { discount: { wood: 1, stone: -2 }, sources: [CARD_ID] },
    ],
  },
  {
    type: 'bonus',
    cardId: CARD_ID,
    appliesTo: ['renovation'],
    optional: true,
    choices: [
      { discount: { wood: 1, clay: -2 },  sources: [CARD_ID] },
      { discount: { wood: 1, stone: -2 }, sources: [CARD_ID] },
    ],
  },
]
```

### 行为变化（刻意不同）

旧实现：同一 construct/renovation action 中，可以**同时**触发 clay 替换和 stone 替换（例如 4 clay + 4 stone + 2 wood → 换成 2 wood 支付）。

新实现：至多触发一次（clay 或 stone 二选一），对齐 BGA `addBonusChoices` 的互斥语义。

**登记到** `docs/card_progress.md` §4「刻意不同 / 与 BGA 偏离的原因」：
> A123 FrameBuilder（2026-04-20）: renovation/construct 中同一次 action 至多触发一次资源替换（从 "clay 替换 + stone 替换" 改为"二选一"），对齐 BGA `addBonusChoices` 的互斥语义。

## E109_BraidMaker 清理

`shared/cards/E/E109_BraidMaker.ts`：

```diff
  const computeCostsListener: CardListenerRegistration = {
    id: 'E109-braid-maker-compute-costs-basket',
    cardIds: [CARD_ID],
    phases: ['computeCosts' as ActionHookPhase],
    actions: ['improvement-any', 'minor-improvement'],
-   order: -10,
    handler: ...
  }
```

同时更新注释，去掉"`order: -10` ensures this runs before ..."段，改说明"所有 computeCosts hook 都是 delta 累积，顺序无关"。

## `ActionHookRegistration.order` 文档

`shared/actions/hooks.ts`：

```ts
/**
 * Sort order for hook execution within a phase (ascending). Lower runs first.
 *
 * NOTE: for the `computeCosts` phase, hook results return deltas that are
 * summed by `applyCostOverride` (addition is commutative), `trades` are
 * pushed to ComplexCost.trades, and `bonuses` are pushed to ComplexCost.bonuses.
 * Neither `trades` nor `bonuses` push order affects the final payment solutions
 * because `computeAllBuyableCombinations` enumerates all combinations
 * regardless of insertion order. So order has NO effect in computeCosts.
 *
 * Order is preserved for future phases that may need strict ordering.
 */
order?: number
```

## 测试策略

### L1：单元层（`pay.test.ts` 增补）

在 `describe('computeAllBuyableCombinations')` 中加：

- `bonus.choices` + `optional: true`：组合数 = 现有组合 × (choices.length + 1)
- `bonus.choices` + `optional: false`：组合数 = 现有组合 × choices.length（不含跳过）
- `bonus.choices` 中某 choice 使组合产生负资源 → 被 `canApplyBonus` 过滤
- `bonus.choices` + `conditions`（`minNumRooms`）：choice 级 conditions 生效；choice 条件优先于 bonus 条件
- 多个 choices bonus 叠加 → 笛卡尔积
- `choices` + 普通 `discount` bonus 混合
- `choices` + `trades`：trades 先展开，choices 后展开
- `discount` 与 `choices` 同时存在 → `expect(() => ...).toThrow()`
- `BonusModifier.choices` 通过 `applyCostModifiers` 正确映射到 `Bonus.choices`

### L1 扩展：`resolveCardCostWithModifiers.test.ts`（新建）

`shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts`：

- 单 hook 返回 `{ costs: {...} }`：累积到 fee
- 多 hook 返回 `{ costs: {...} }`：delta 累积（验证顺序无关：两种 hook 顺序产出相同 ComplexCost）
- Hook 返回 `{ trades: [...] }`：push 到 ComplexCost.trades
- Hook 返回 `{ bonuses: [...] }`：push 到 ComplexCost.bonuses
- Hook 返回 `{ bonuses: [{ choices: [...] }] }`：choices 保留到 ComplexCost.bonuses
- 混合返回（costs + trades + bonuses）：三者都进入最终 ComplexCost
- 无 hook 匹配：返回原 baseCost（简单 Resource 而非 ComplexCost）

### L2：stub 层

**新建夹具**：

- `shared/cards/__stubs__/Stub_BonusChoices.ts`（Path A，hook 返回 bonus.choices）
- `shared/cards/__stubs__/Stub_BonusChoiceModifier.ts`（Path B，BonusModifier.choices）

**新建测试**：`shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts`

- 单卡 Path A choices：枚举预期支付组合
- 单卡 Path B choices modifier：同
- Path A choices + Path A 普通 bonus：叠加
- Path A choices + Path B choices：两路径都展开
- Path A choices + Path B 普通 trade：trade 配方 × choices 展开

### L3：session 层

| 新建测试文件 | 场景 | 关键断言 |
|---|---|---|
| `server/__tests__/A143_Stonecutter-session.test.ts` | 打出 Stonecutter，买 Major | 所有 major cost 的 stone -1 |
| `server/__tests__/A143_B95_stacking-session.test.ts` | Stonecutter + MasterBricklayer 叠加 | stone cost 正确累积（-1 + -N rooms） |
| `server/__tests__/A123_FrameBuilder-session.test.ts` | renovation 场景含 BGA 语义回归用例 | `pending.options` 展开 choices；迁移回归：4 clay + 4 stone + 2 wood → 只省一次 wood |
| `server/__tests__/D15_A143_stacking-session.test.ts` | D15 ClaySupports + Stonecutter 造 clay 房 | trades 两种配方，每种叠加 Stonecutter bonus |

补充：

- `server/__tests__/E109_BraidMaker-session.test.ts`：补"正向用例（仅 E109）"、"E109 + Stonecutter 叠加买 Basket"

### 断言原则

- `state`, `pending`, `log`, `scores`
- `pending.options.length`, `options.map(o => o.effectPreview)`
- 不断言 DOM / 按钮文案

## 交付物（提交粒度）

**Commit 1** — `feat(pay): support Bonus.choices for mutually-exclusive discounts`

- `shared/game/types.ts`：`BonusChoice`、`Bonus.choices`、`BonusModifier.choices`
- `shared/actions/effects/pay.ts`：`computeAllBuyableCombinations` 展开 + 不变式；`applyCostModifiers` 映射
- `shared/actions/effects/__tests__/pay.test.ts`：补 choices 单元测试

**Commit 2** — `test(pay): multi-card cost-modifier interaction coverage`

- `shared/actions/effects/__tests__/resolveCardCostWithModifiers.test.ts`
- `shared/cards/__stubs__/Stub_BonusChoices.ts`
- `shared/cards/__stubs__/Stub_BonusChoiceModifier.ts`
- `shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts`

**Commit 3** — `refactor(A123): migrate FrameBuilder to bonus.choices to match BGA semantics`

- `shared/cards/A/A123_FrameBuilder.ts`
- `server/__tests__/A123_FrameBuilder-session.test.ts`（新建，含迁移回归）
- `docs/card_progress.md` §4

**Commit 4** — `test(session): multi-card stacking for cost modifiers`

- `server/__tests__/A143_Stonecutter-session.test.ts`
- `server/__tests__/A143_B95_stacking-session.test.ts`
- `server/__tests__/D15_A143_stacking-session.test.ts`
- `server/__tests__/E109_BraidMaker-session.test.ts`（扩充）

**Commit 5** — `chore(hooks): clarify order semantics, drop no-op E109 order`

- `shared/actions/hooks.ts`：JSDoc
- `shared/cards/E/E109_BraidMaker.ts`：移除 `order: -10`

## 文档同步（CLAUDE.md 硬性要求）

- `docs/card_progress.md`：
  - §2 当前轮次：加一行（2026-04-20，A123/E109，"pay 系统 bonus.choices 能力扩展 + 多卡叠加测试覆盖 + A123 BGA 语义对齐"）
  - §4 刻意不同：登记 A123 语义变化
  - §7 基础设施：登记 `Bonus.choices` 能力
  - §8 时间线：加新批次
- `docs/ENGINE_ARCHITECTURE.md`：**不需要**更新（choices 是 ComplexCost 细化，非协议扩展点）
- 本 spec：`docs/superpowers/specs/2026-04-20-cost-modifier-coverage-design.md`

## 验证动作

- 每个 commit 跑 `pnpm test`
- 全部 commit 后跑 `pnpm run lint` + `pnpm run build`
- 不需要重启 UI（无 UI 改动）
- push 后等 GitHub Actions pass（CLAUDE.md 硬性）

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| A123 迁移改变玩家观察到的行为（同时替换 clay+stone 不再可用）| 在 `docs/card_progress.md` §4 明确登记；session 测试专门覆盖"4 clay + 4 stone + 2 wood"回归用例；BGA 语义是权威，对齐方向正确 |
| bonus.choices 展开组合爆炸（choices × trades × 其它 bonuses 笛卡尔积）| `keepOnlyOptimals` / 缓存已处理；bonus 数量在卡牌层面天然受限（现实中最多 2-3 张 cost modifier 卡同时生效） |
| `solutionCache` 键不稳定 | `BonusChoice` 是纯 JSON 结构，`JSON.stringify` 保持稳定；无需改 makeCacheKey |
| Path A 和 Path B 的 choices 在 `canApplyBonus` 逻辑中路径略有差异 | 统一通过 `canApplyBonus(comb, choice)` 判定；单元测试覆盖两路径的等价性 |

## Follow-ups（后续独立 PR）

1. 合并 Path A + Path B（引入 per-phase hook names 对齐 BGA：`computeCostsConstruct / Renovation / Fencing / ...`）
2. 补 `Bonus.conditions`（`minNumRooms` 等）的单元测试
3. B95_MasterBricklayer / C27_Blueprint 等 cost-modifier 卡的 session 测试（本轮 A143/B95 叠加测试已间接覆盖部分）
