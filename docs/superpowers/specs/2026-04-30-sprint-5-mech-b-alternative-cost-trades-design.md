# Sprint 5 机制 B：alternative-cost OR trades — 3 张卡接入设计

**日期**: 2026-04-30
**Sprint**: 5（机制 B 子项）
**涉及卡**: A4 Baseboards / D83 Pigswill / D117 WoodExpert（B155 / C13 推到 follow-up）
**Worktree**: `.worktree/sprint-5-mech-b-alternative-cost-trades`

## 1. 背景与 scope 收敛

机制 B 最初设想为"建 alternative-cost trade 基础设施"+"5 张卡接入"。探索后发现：

- **基础设施已经 100% 完成**：
  - `ComplexCost.fees: Partial<Resource>[]`（OR-ed alt 付法，`shared/game/types.ts:81-87`）
  - `Trade { from, to, max?, source?, sourceId? }`（trade 模型，types.ts:36-42）
  - `card.altCosts?: Partial<Resource>[]` 字段（cards/types.ts:25,88,129）
  - `computeCosts` hook 已收集 `result.trades` 进 `ComplexCost.trades`（pay-helpers.ts:86-99）
  - `computeAllBuyableCombinations` 枚举所有 fee × trade × bonus 组合生成 `PaymentSolution[]`（pay.ts:496+）
  - `resolvePaymentSolutionSelection` 多 solution 时弹 choice prompt 让玩家选（pay-helpers.ts:564+）
  - 已有 8+ 张卡用 altCosts：E30 / B43 / B44 / B46 / B65 / C44 / C65 等
- **5 张卡里只有 3 张属于 alt-cost 范畴**：
  - A4 / D83 / D117 — 接入即可
  - **B155 ArtTeacher** 推到 follow-up：需要"虚拟资源 source"机制（FOOD_TRAVEL 类），是独立机制扩展
  - **C13 WoodSlideHammer** 推到 follow-up：是 renovation discount bug（onPlayerComputeCostsRenovation 派生），跟 alt-cost 无关

最终 spec scope = **3 张卡接入现有基础设施**，~0.5 day。

## 2. 设计目标

- **A4 Baseboards / D83 Pigswill**：cost 字段从单一 `{food:2, grain:1}`（强制同时付）改为 `altCosts: [{food:2}, {grain:1}]`（OR 付法），对齐 BGA `costs=[[FOOD=>2],[GRAIN=>1]]`
- **D117 WoodExpert**：computeCosts handler 从 `{costs: {wood:-2, food:1}}`（强制替换）改为 `{trades: [{from:{food:1}, to:{wood:2}, max:1, source:CARD_ID}]}`（玩家可选用 / 不用），对齐 BGA `onPlayerComputeCardCosts` 给 trades 派生
- **0 主路径改动 / 0 新基础设施 / 0 hook 系统扩展**

## 3. 核心实现

### 3.1 A4 Baseboards

文件：`shared/cards/A/A4_Baseboards.ts`

```ts
export const A4_Baseboards = new MinorImprovement({
  id: CARD_ID,
  name: 'Baseboards',
  deck: 'A',
  number: 4,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],   // ← 替换 cost
  passing: true,
})
```

**关键改动**：删除 `cost: { food: 2, grain: 1 }`，加 `altCosts: [{food:2}, {grain:1}]`。`cost` 字段在 `cards/types.ts` 是 optional，删掉无影响。

参考已有同模式卡：`B43_Chophouse.ts:37 altCosts: [{ wood: 2 }, { clay: 2 }]`（无 cost 字段）。

`A4_Baseboards_impl.effect.onBuy` 路径不变（继续给 wood）。

### 3.2 D83 Pigswill

文件：`shared/cards/D/D83_Pigswill.ts`

```ts
export const D83_Pigswill = new MinorImprovement({
  id: CARD_ID,
  name: 'Pigswill',
  deck: 'D',
  number: 83,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Fencing__ action space, you also get 1 <PIG>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],   // ← BGA: costs=[[FOOD=>2],[GRAIN=>1]]
  newSet: true,
})
```

跟 A4 同模板。`D83_Pigswill_impl.listeners`（fencing 触发 +1 pig）路径不变。

### 3.3 D117 WoodExpert

文件：`shared/cards/D/D117_WoodExpert.ts`

```ts
const computeCostsListener: CardListenerRegistration = {
  id: 'D117-wood-expert-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId) return
    const woodInCost = getImprovementWoodCost(context.cardId)
    if (woodInCost <= 0) return

    // 改为返回 trade 而非 costs 强 patch — 让 pay 主路径生成多 PaymentSolution，玩家选
    // BGA "Each improvement costs you up to 2 wood less, if you pay 1 food instead"
    // 模型为单 trade { from: 1 food, to: 2 wood, max: 1 }
    return {
      trades: [{
        from: { food: 1 },
        to: { wood: 2 },
        max: 1,
        source: CARD_ID,
        sourceId: CARD_ID,
      }],
    }
  },
}
```

**关键改动**：从 `return { costs: { wood: -woodDiscount, food: 1 } }` 改为 `return { trades: [...] }`。

`pay-helpers.ts:86-99` 的 `resolveCardCostWithModifiers` 把 `result.trades` collect 进 `ComplexCost.trades`；后续 `computeAllBuyableCombinations` 的 `generateTradeCombinations` 枚举 "用 trade 0 次 / 1 次" 两种 solution；多于 1 时玩家弹 choice 选哪条付。

**`max: 1` 边界**：当目标 minor 的 wood 成本只有 1（如 B27 Toolbox cost wood:1）时，trade 用 1 次会让 wood -2 但只有 1 wood 要付 → 实际花 0 wood + 1 food，这等价 BGA "wood -= 2 capped at 0"。`generateTradeCombinations` 的 capping 已实现（pay.ts 内）。

**altCosts 同样生效**：D117 handler 不只看 `card.cost?.wood`，也扫 `card.altCosts: [...]` 找含 wood 的 alt（如 B43_Chophouse altCosts:[{wood:2}, {clay:2}]）。修法：扩展 `getImprovementWoodCost` helper：

```ts
const getImprovementWoodCost = (cardId: string): number => {
  const minor = getMinorImprovementCard(cardId)
  if (minor) {
    if (minor.cost?.wood && minor.cost.wood > 0) return minor.cost.wood
    if (minor.altCosts) {
      return Math.max(0, ...minor.altCosts.map(c => c.wood ?? 0))
    }
    return 0
  }
  const major = getMajorCardEffect(cardId)
  if (major) {
    const costs = Array.isArray(major.cost) ? major.cost : [major.cost ?? {}]
    return costs.reduce((m, c) => Math.max(m, (c as Record<string, number>).wood ?? 0), 0)
  }
  return 0
}
```

回到 D117 handler：检查 `getImprovementWoodCost(cardId) > 0` 决定是否注册 trade。pay 主路径的 `computeAllBuyableCombinations` 在 `generateTradeCombinations` 里**对每条 fee 独立枚举 trade combo**：含 wood 的 fee 自动派生 wood→food 替代 solution，不含 wood 的 fee 不受影响。所以单条 trade `{from food:1, to wood:2, max:1}` 注册即可，无需为不同 alt 生成多条 trade。

**`max: 1` 边界**：当目标 minor 的 wood 成本只有 1（如 B27 Toolbox cost wood:1）时，trade 用 1 次会让 wood -2 但只有 1 wood 要付 → 实际花 0 wood + 1 food，这等价 BGA "wood -= 2 capped at 0"。`generateTradeCombinations` 的 capping 已实现（pay.ts 内）。

### 3.4 关键不变量

- **`altCosts` 字段无需 cost 字段一同存在**：参考 B43 / B65 / E30 等 8+ 张已有卡（多数只声明 altCosts，无 cost）
- **`card.altCosts` 自动驱动 `ComplexCost.fees`**：B75_WoodWorkshop.ts:77-78 已确认存在 `{ fees: improvement.altCosts }` 转换路径；不需要本 spec 添加新转换逻辑
- **D117 改 trades 后玩家可拒绝**：与原 patch 行为不同 — 这是修复 bug（BGA "if you pay 1 food instead" 是可选的，不是强制）
- **D117 trade 与 BGA 派生 trade 形态等价但不完全相同**：BGA 是迭代 `costs.trades` 给每条加派生 trade（针对每条 trade 生成 wood→food 派生）。我们的 hook 直接 push 一条 `{from food:1, to wood:2}` trade。在我们的 ComplexCost.trades 模型下，`generateTradeCombinations` 会把这条 trade 应用到 fee 上 — 等价于"在原付法上加一次 wood→food 替代"。语义结果一致

## 4. 测试策略

### 4.1 A4 Baseboards session 测试

文件：`server/__tests__/A4_Baseboards-session.test.ts`（如已存在加场景；不存在则新建，参考 D74 / B27 模板）。

setup：玩家 minorHand 含 A4，配合 lessons-4 / lessons / improvement-any 等买 minor 路径。

- **场景 1 单 solution（only food）**：food=2, grain=0 → 玩家选 minor:A4 → 自动付 food（无 choice prompt）→ onBuy 给 wood
- **场景 2 单 solution（only grain）**：food=0, grain=1 → 自动付 grain
- **场景 3 多 solution**：food=2, grain=1 → 选 minor:A4 → **pending=choice (selectPayment)** → 玩家选 grain solution → grain=0 / food=2 / 收益正确
- **场景 4 都付不起**：food=1, grain=0 → A4 不在 buyable minor 列表（已有 buyability 检查走 altCosts 任一可付）

### 4.2 D83 Pigswill session 测试

文件：`server/__tests__/D83_Pigswill-session.test.ts`（同 A4 模板）。

- 场景 1-4 与 A4 等价
- 额外验证：D83 fencing listener 不受 cost 字段改变影响（不变 — 现有 fencing space 测试无回归）

### 4.3 D117 WoodExpert session 测试

文件：`server/__tests__/D117_WoodExpert-session.test.ts`（如已存在加场景；不存在则新建）。

setup：玩家 occupationHand 含 D117 + 一个 wood-cost minor（如 cost wood:2 的 minor in minorHand），通过 lessons-4 打出 D117（onBuy gain 2 wood），后续买该 minor 时验证 trade 选项。

- **场景 1 双 solution**：D117 played + minor cost wood:2，玩家 food=10 wood=2 → 买该 minor → pending=choice：solution A (wood:2) / solution B (wood:0 + food:1)
- **场景 2 only trade affordable**：food=10 wood=0 → 自动选 solution B
- **场景 3 only base affordable**：food=0 wood=2 → 自动选 solution A
- **场景 4 wood=1 cost minor**：minor cost wood:1 → trade max=1 但 wood 只需 1 → 玩家可选 (wood:1) 或 (wood:0 + food:1)
- **场景 5 大 minor cost wood:5**：trade 最多换 2 wood → solution A (wood:5) / solution B (wood:3 + food:1)
- **场景 6 altCosts 含 wood 的 minor**：买 B43_Chophouse（altCosts:[{wood:2}, {clay:2}]）→ 应弹 choice：solution A (wood:2) / solution B (wood:0 + food:1) / solution C (clay:2) — 三个，玩家选；clay alt 不受 trade 影响

### 4.4 fast / slow 项目分配

- 3 个 session 测试 → `slow`（沿用单卡 session 测试惯例）
- 不需要新单元测试（基础设施单测已经覆盖）

### 4.5 已有卡回归

- B43 / B44 / B46 / B65 / C44 / C65 / E30 等已用 altCosts 的卡的现有 session 测试应该自动通过
- 8+ 张已有 altCosts 卡的测试不动；只新加 A4 / D83 / D117

## 5. 范围与排除项

### 5.1 范围内

- 3 张卡定义 / listener 修改：A4 / D83 / D117
- 3 个 session 测试文件（每张一个，含 4-5 场景）
- 文档同步：card_progress.md §2.0 / §2.3 / §8、master-plan.md §8

### 5.2 明确排除（推到 follow-up）

- **B155 ArtTeacher**：需要"虚拟资源 source"机制（FOOD_TRAVEL 类），让 trade 能表示"用 Traveling Players 累积格的 food 替代玩家自己的 food"。pay 执行时 trade source 决定从 supply 扣还是从 TP space 扣。这是独立机制扩展，不在本 spec 范围
- **C13 WoodSlideHammer**：是 renovation discount bug（BGA `onPlayerComputeCostsRenovation` 给 stone -2 discount），跟 alt-cost 无关；应作为单独单卡修
- **`altCosts` + `cost` 字段共存的语义**：现有路径只看 altCosts 或 cost 之一，本 spec 不引入复合声明
- **trade 多次使用同一资源**：D117 trade max=1，不涉及 max ≥ 2 场景；如未来卡需要 max=N，已由 `generateTradeCombinations` 支持，不需本 spec 验证

### 5.3 风险点

| 假设 | 验证方式 |
|---|---|
| `card.altCosts` 自动驱动 `ComplexCost.fees`（无需 cost 字段） | grep `altCosts` 路径（已确认 B75_WoodWorkshop:77-78 用 `{ fees: improvement.altCosts }`）；session 测试场景 1-2 自动验证 |
| `cost` 字段从 cards/types.ts 删除时类型 / lint / runtime 都接受 optional | TypeScript build；现有 8+ 张 altCosts 无 cost 卡是先例 |
| D117 trade `{from food:1, to wood:2, max:1}` 在原 cost wood=1 时正确 cap | 看 `generateTradeCombinations` 实现；session 测试场景 4 |
| pay 主路径在多 PaymentSolution 时弹 choice 而非 auto-select 最优 | `resolvePaymentSolutionSelection` 已实现（pay-helpers.ts:578-595），多 solution 必弹 choice |
| computeCosts hook collect trades 路径在 D117 改后仍工作 | session 测试场景 1 直接验证 |
| 玩家 UI 弹 choice 时显示的 labelKey / labelParams（trade source）正确 | `describePaymentSolution` / `buildPaymentChoiceResult` 已实现 i18n key；session 测试断言 pending.options 含 expected value |

## 6. 文档同步

### 6.1 `docs/card_progress.md`

- §2.0 加一行：`2026-04-30 Sprint 5 mech-B — A4 Baseboards / D83 Pigswill / D117 WoodExpert 接入现有 alt-cost 基础设施。A4 / D83 改用 altCosts 字段；D117 改 computeCosts 返回 trades 而非强制 patch。基础设施 100% 已存在，本批纯单卡接入。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md`
- §2.3 把 A4 / D83 从 "Sprint 1 PR-1B 注脚 转 Sprint 5"列表中标 ✅
- §2.4 D117 从"行为偏差 - 强制 patch"标 ✅ Sprint 5 mech-B
- §7 基础设施段：alt-cost 基础设施段（如已有）补一句"3 张卡接入：A4/D83 用 altCosts 声明、D117 用 computeCosts trade hook"
- §8 时间线加新行（实现数 / Tier 数变化按 §1 总览实际算）

### 6.2 `docs/master-plan.md` §8

- Sprint 5 行 "partially done (12/28; PR-5 + mech-A + mech-D)" 更新为 "partially done (15/28; PR-5 + mech-A + mech-D + mech-B)"
- 实际工时加注："~0.5 day (PR-5) + ~2 day (mech-A) + ~0.5 day (mech-D) + ~0.5 day (mech-B)"
- PR/Commit 列加：`sprint-5-mech-b-alternative-cost-trades` 分支或 PR 号

### 6.3 不需要改 ENGINE_ARCHITECTURE.md

机制 B 不引入新架构概念（基础设施已存在），无文档同步。

## 7. 提交粒度

- commit 1: `refactor(A4)`: replace cost with altCosts (BGA OR-ed payment) + session tests
- commit 2: `refactor(D83)`: replace cost with altCosts + session tests
- commit 3: `refactor(D117)`: computeCosts returns trades instead of cost patch + session tests
- commit 4: `docs`: card_progress / master-plan sync

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build`，全绿才下一步。push 到 main 走 fast-forward（仿机制 A 模式，由人工最后执行）。
