# D1 — CardRegistry PR-3：清理 module-level shortcut 残留

**Sprint**: D1 (master-plan §D 主路径迁移之 1/3)
**Date**: 2026-05-02
**Worktree**: `.worktree/D1-card-registry`
**Status**: Design — pending implementation plan

## 1. 目标与范围

PR-1 / PR-2 已完成 `CardRegistry` 类与 `active-registry` 切换层。D1 完成 PR-3：清理三处 module-level shortcut 残留，让所有 effect / modifier / listener 查询走 per-session registry。同时把 majors 与其他卡的形态分歧（`MajorCardEffect` 把元数据塞进"effect"概念）拆开，统一到 `CardDefinition`（元数据）+ `CardEffect`（hook 行为）双层模型。

不在范围：

- D2（GameSession wrapper 删除）/ D3（HarvestFeedOption 协议收敛）
- 卡牌业务行为变化（D1 是纯重构）

## 2. 决策

| 维度 | 决策 |
|---|---|
| 范围 | **Scope-A**：清理 module-level shortcut，不动 `getMajorCardEffect` 之外的 catalog 数据 |
| modifier 注入 | **Inject-Sync**：catalog 卡定义里的 `modifier/modifiers` 字段保持不变，GameCore 构造时一次性派生进 registry |
| majors 注入 | **majors-Auto**（修订版）：majors 的 effect bundle 实际**只含元数据无 hook**，所以**不**写入 effectsByCard。`getMajorCardEffect` 的 44 处调用统一改读 `getCardDefinition` |
| 类型分层 | 保持 `CardDefinition` 与 `CardEffect` 类型分离；删除 `MajorCardEffect` 类型（历史遗留，把元数据塞进 effect 概念） |

## 3. 架构

### 3.1 改动清单

| 文件 | 改动 |
|---|---|
| `shared/cards/registry.ts` | `CardImpl.modifiers` 类型 `TradeLikeModifier[]` → `CostModifier[]`；`modifiersByCard` 同步；删 `TradeLikeModifier` 类型导出；新增 `syncModifiersFromCatalog(occupations, minors)` 方法 |
| `shared/cards/catalog.ts` | 新增统一入口 `getCardDefinition(id): CardDefinition \| undefined` — 内部依次查 occupation / minor / major catalog |
| `shared/cards/major/index.ts` | 删除 `getMajorCardEffect` 函数；`majorCardEffects` 数组改名 `majorCardDefinitions`，类型 `CardDefinition[]`；新增 `getMajorCard(id)` 仅供 `getCardDefinition` 内部使用 |
| `shared/cards/major/types.ts` | 删除 `MajorCardEffect` 类型导出 |
| `shared/cards/card-effects.ts:202` | 删除 `?? getMajorCardEffect(id)` fallback：`return getActiveCardRegistry()?.getEffect(id) ?? null` |
| `shared/cards/card-modifiers.ts` | 整文件简化为单行：`getActiveCardRegistry()?.getModifiers(cardId) ?? []`；删除对 catalog 的直查 |
| `shared/cards/custom-registry.ts::registerCard` | 新增把 `data.card.modifier/modifiers` 注入 `active.modifiersByCard` 的逻辑 |
| `shared/session/game-core.ts` 构造函数 | `loadByIds` 之后新增一句 `cardRegistry.syncModifiersFromCatalog(allOccupations, allMinors)` |
| `shared/cards/helpers/card-identity.ts::isMajorCard` | 改实现：`cardId.startsWith('Major_')` 替代 `getMajorCardEffect(id) !== undefined` |
| `shared/cards/__tests__/setup-register-all.ts` | 测试 setup 中默认 registry 也调用 `syncModifiersFromCatalog`，否则 unit test 里 `getCardModifiers` 会全部返回空 |

### 3.2 codemod（44 处）

`getMajorCardEffect(id)` → `getCardDefinition(id)`，分布于：

- `shared/logic/scoring.ts`（多处）
- `shared/actions/effects/exchange.ts`
- `shared/session/game-core.ts`（多处）
- `shared/cards/helpers/card-identity.ts`
- `shared/cards/card-effects.ts`（被本次删除的 fallback 内部使用，整段删除）

`tsc strict` 在 `getMajorCardEffect` 函数删除后会自动捕获任何漏改位置。

### 3.3 不动

- 200+ 卡定义文件（modifier 字段位置不变）
- `_impl` 文件结构（仍只装 listeners / effect / reaches）
- `majorCardDefinitions` 数组保留作为 catalog 数据源
- `MajorImprovement` 模板类等数据构造路径（majors/types.ts 仍 export 类）

## 4. 数据流

### 4.1 GameCore 构造（启动一次）

```
new GameCore(opts):
  1. cardRegistry = new CardRegistry()
  2. cardRegistry.loadByIds(cardPoolIds, ALL_CARD_IMPLS lookup)
        ↓ 写入 _impl.listeners → listenersByCard
        ↓ 写入 _impl.effect    → effectsByCard
  3. cardRegistry.syncModifiersFromCatalog(allOccupations, allMinors)
        ↓ 遍历 catalog occupation / minor 卡定义
        ↓ 把 card.modifier (单数) + card.modifiers (复数) 合并写入 modifiersByCard
        ↓ majors 不参与（无 modifier 字段、无 hook）
  4. setActiveCardRegistry(cardRegistry)
```

`syncModifiersFromCatalog` 内部：

```ts
syncModifiersFromCatalog(
  occupations: readonly CardDefinition[],
  minors: readonly CardDefinition[],
) {
  for (const card of [...occupations, ...minors]) {
    const mods = [
      ...(card.modifiers ?? []),
      ...(card.modifier ? [card.modifier] : []),
    ]
    if (mods.length > 0) this.modifiersByCard.set(card.id, mods)
  }
}
```

### 4.2 运行时查询

```
getCardEffect('A93_BedMaker')
  → active.getEffect(id) ← _impl.effect
  → 返回 hook bundle ✅

getCardEffect('Major_Fireplace1')
  → active.getEffect(id)
  → undefined（majors 无 hook，未注入 effectsByCard）
  → return null ✅

getCardDefinition('Major_Fireplace1')         ← 新统一入口
  → catalog.getMajorCard(id)
  → 返回 CardDefinition（含 cost/vp/isCookery/exchanges/...）✅

getCardModifiers('A28_ForestSchool')
  → active.getModifiers(id)
  → modifiersByCard.get(id) ← syncModifiersFromCatalog 写入
  → 返回 [trade modifier] ✅

getRegisteredCardListeners()
  → active.getAllListeners()（PR-2 已迁完）
```

### 4.3 自定义工坊卡（custom-registry）

```
custom-registry.registerCard(data)
  现有：active.addListener / setEffect 注入 listeners + effect
  新增：if (data.card.modifier || data.card.modifiers)
          把它们合并写入 active.modifiersByCard
```

custom card 与内置卡走完全相同的查询路径。

### 4.4 元数据/行为分层 final

| 查询 | 入口 | 数据源 | 类型 |
|---|---|---|---|
| 卡定义元数据 | `getCardDefinition(id)` | catalog | `CardDefinition` |
| 卡 hook 行为 | `getCardEffect(id)` | active.effectsByCard | `CardEffect \| null` |
| 卡 listener 行为 | `getRegisteredCardListeners()` / `getListenerById(id)` | active.listenersByCard | `CardListenerRegistration[]` |
| 卡 modifier | `getCardModifiers(id)` | active.modifiersByCard（构造时从 catalog 派生） | `CostModifier[]` |

## 5. 错误处理

### 5.1 active === null

| 函数 | 行为 |
|---|---|
| `getCardEffect(id)` | 返回 `null`（沿用现有 `?? null`） |
| `getCardModifiers(id)` | 返回 `[]`（沿用现有 `?? []`） |
| `getRegisteredCardListeners()` | 返回 `[]`（PR-2 已实现） |
| `getCardDefinition(id)` | **不依赖 active**，直查 catalog；catalog 为 module-level 常量，永远可用 |

`shared/cards/__tests__/setup-register-all.ts` 必须补一句 `cardRegistry.syncModifiersFromCatalog(allOccupations, allMinors)`，否则不构造 GameSession 直接调 helper 的 unit test 里 `getCardModifiers` 全部返回空。

### 5.2 同一 cardId 在 catalog + _impl 都声明 modifiers

当前所有 200+ `_impl` 文件都没有 modifiers 字段（grep 0 命中），不会冲突。

未来防御：`loadImpl` 写入 + `syncModifiersFromCatalog` 派生**走同一 Map**，按调用顺序后写入覆盖前者。GameCore 构造顺序固定为 loadImpl 先、sync 后，**catalog 数据覆盖 _impl 数据**。如果未来要让 _impl 显式 override catalog，需要颠倒构造顺序——D1 不引入新策略，写测试断言"sync 在 load 之后"即可。

### 5.3 syncModifiersFromCatalog 输入异常

| 情形 | 行为 |
|---|---|
| `card.modifier` 与 `card.modifiers` 均 undefined | 跳过，不写入 |
| 同时存在 | 合并：`[...modifiers, modifier]`（对齐当前 `card-modifiers.ts` 的合并逻辑） |
| `card.modifiers` 是空数组 | 跳过 |
| catalog 内 cardId 重复 | 命名空间约束：occupation/minor/major 通过 prefix 区分（A/B/C/D/E + 编号 vs Major_*），不可能重复。如真发生，后写入覆盖前者 |

### 5.4 codemod 漏改

`getMajorCardEffect` 函数删除后，tsc 会报 `Cannot find name`，是天然 verifier。

### 5.5 isMajorCard 边界

```ts
export const isMajorCard = (cardId: string): boolean => cardId.startsWith('Major_')
```

- 所有 majors 当前都用 `Major_` 前缀（fireplace1.id = 'Major_Fireplace1' 等）
- custom workshop card 不会用 `Major_` 前缀（前端工坊不允许创建 majors）
- 未来若新增 majors，需保持命名约定

## 6. 测试

### 6.1 新增单元测试

**`shared/cards/__tests__/registry-sync.test.ts`**：

- `syncModifiersFromCatalog` 写入 occupation.modifier (单数)
- `syncModifiersFromCatalog` 写入 minor.modifiers (复数)
- modifier (单数) 和 modifiers (复数) 同时存在时合并
- 无 modifier 字段的卡被跳过
- majors 不参与（即使经过 sync，`getModifiers('Major_Fireplace1')` 仍是 `[]`）

**`shared/cards/__tests__/get-card-definition.test.ts`**：

- 返回 occupation / minor / major 的 CardDefinition
- majors 返回的 definition 含 `isCookery / vp / exchanges` 等元数据
- 未知 id 返回 undefined

### 6.2 现有测试回归

D1 是纯重构，业务零变化。

| 测试 | 用途 |
|---|---|
| `pnpm test:fast` | ~1900 测试，registry 加载链 + 元数据查询面 |
| `pnpm exec vitest run --project slow` | 254 个单卡 session 测试，覆盖 modifier 卡的实战行为（A28/A14/A123/A143/A165/B15/B145/C13/C56/...） |
| `pnpm run lint` | tsc 抓 codemod 漏改 |

### 6.3 不需要新增

- e2e（前端调用面零变化，前端不读 `getCardEffect / getMajorCardEffect / getCardModifiers`）
- 新 session 测试（业务行为零变化）

### 6.4 codemod 验证

两个 gate：
1. tsc 抓漏改
2. 全量测试回归确认行为不变

### 6.5 手动验证

启动 `./restart-intranet.sh`，2 人 dev 房间：
- 装 A28 ForestSchool，触发 occupation 行动，观察 modifier 生效（wood→food 替代）
- 触发 harvest，feed UI 列出 fireplace anytime exchanges（验证 majors 元数据查询路径）

## 7. DoD

- `getMajorCardEffect` 函数已删除（grep 0）
- `MajorCardEffect` 类型已删除（grep 0）
- `getCardDefinition` 是 catalog 元数据的唯一入口
- `getCardEffect` 单一路径（无 fallback），仅查 active.effectsByCard
- `getCardModifiers` 单行实现，仅读 active.modifiersByCard
- `card-modifiers.ts` 不再 import `getOccupationCard / getMinorImprovementCard`
- 所有现有测试 fast / slow / lint 全绿
- 新增 registry-sync.test.ts / get-card-definition.test.ts 通过
- master-plan.md §8 加 D1 行

## 8. 风险

| 风险 | 缓解 |
|---|---|
| 44 处 codemod 漏改 | tsc strict 抓；删除 `getMajorCardEffect` 函数本身作为天然 verifier |
| 测试 setup 漏调 syncModifiersFromCatalog 导致 unit test 全 modifier 返空 | 显式新增此步骤，写一个测试断言它确实在 setup 中被调用 |
| custom-registry 注入 modifier 路径未覆盖 | 新增 unit test：custom card 注册后 `getCardModifiers(id)` 能读到 |
| `MajorImprovement` 模板类与新 `CardDefinition` 类型不一致导致 majors 数据不能被 `getCardDefinition` 返回 | majors/types.ts 已经把 MajorImprovement extends CardDefinition（或 fields 对齐），如有不齐则在本 sprint 内对齐字段 |
| 行为漂移（majors 元数据查询路径改变后某 hook 调用方读到 undefined） | 254 个单卡 session 测试 + 1900+ fast 测试覆盖；任何漂移会被现有测试抓 |
