# D3 — HarvestFeedOption 统一走 sourceId + exchangeIndex

**Sprint**: D3 (master-plan §D 主路径迁移之 3/3)
**Date**: 2026-05-02
**Worktree**: `.worktree/D3-harvest-exchange`
**Status**: Design — pending implementation plan

## 1. 目标与范围

把 `client/app/hooks/use-harvest-flow.ts::HarvestFeedOption` 的双轨制（`resourceKey/food` legacy + `exchangeIndex` 新路径）收敛为单一路径：所有 harvest feed selection 都通过 `sourceId + exchangeIndex` 引用统一形态的 `CardExchange`。

不在范围：

- 收获以外的窗口（bake-bread / anytime cookery 主动触发）。
- `Trade` / `applyTradeSideEffect` 内部模型。
- 其它 sprint 的 D1 (CardRegistry PR-3) / D2 (GameSession wrapper)。

## 2. 决策

| 维度 | 决策 |
|---|---|
| 数据来源统一 | **B**：所有 harvest feed option 都来自 `CardExchange`（含合成的 basic conversion） |
| harvest 阶段允许的 trigger | **B-1**：`triggers ∈ {harvest, anytime}` |
| 基础转化形态 | **Basic-A**：合成虚拟 sourceId `__basic__`，注册两条 exchange |
| anytime 是否过滤 isCookery | **不过滤**：所有 anytime 卡的 exchange 都参与 |
| harvest feed UI 是否过滤非食物 anytime | **Filter-A**：全量显示，不过滤 |
| 服务端 trigger 校验 | **不校验**：服务端只按 sourceId+index 查 exchange，按玩家持有 from 资源做可用性裁定 |
| 实施粒度 | **S-1**：单 PR 一次性收敛，无中间双轨态 |

## 3. 架构

### 3.1 新增文件

`shared/cards/basic-conversion.ts`：

```ts
export const BASIC_CONVERSION_SOURCE_ID = '__basic__'

export const basicConversionExchanges: readonly CardExchange[] = [
  { from: { grain: 1 },     to: { food: 1 }, triggers: ['anytime'], sourceId: BASIC_CONVERSION_SOURCE_ID },
  { from: { vegetable: 1 }, to: { food: 1 }, triggers: ['anytime'], sourceId: BASIC_CONVERSION_SOURCE_ID },
]

export const getBasicConversionExchange = (idx: number): CardExchange | undefined =>
  basicConversionExchanges[idx]
```

不挂到 player 状态、不计入 cards 注册表，仅作为内置常量供 `buildHarvestFeedOptions` 与 `confirmHarvestFeed` lookup 使用。

### 3.2 改动文件

| 文件 | 改动 |
|---|---|
| `client/app/hooks/use-harvest-flow.ts` | 重写 `buildHarvestFeedOptions`：删硬编码 `cookingSources` 表 + 删 `resourceKey/food` 字段；扫描 basic + improvements + minorPlayed + occupationPlayed，过滤 `triggers ∈ {harvest, anytime}` |
| `client/app/GameContainerApi.tsx` | UI counter 上限（line 879-892, 935, 1542-1556）：从 `option.resourceKey` 单 key → 基于 `option.from` map 的多 key 余量计算 |
| `shared/session/game-core.ts` | `confirmHarvestFeed`：删 legacy `(resourceKey, food)` 单 key 分支（line 2292-2301, 2377-2394）；删 trigger='harvest' 校验；新增 `sourceId === '__basic__'` lookup 分支 |
| `shared/protocol/ws.ts` + `client/services/gameTransport.ts` | selection 形态删 `resourceKey/food`，仅留 `{ count, sourceName?, sourceId, exchangeIndex }` |
| `server/payload-validation.ts` | 同步删字段校验，新增 `sourceId`（非空字符串）+ `exchangeIndex`（整数 ≥ 0）校验 |

### 3.3 测试 codemod

- `server/__tests__/harvest-session.test.ts`
- `server/__tests__/C59_SchnappsDistillery-session.test.ts`
- `server/__tests__/C105_BasketCarrier-session.test.ts`
- `server/__tests__/E153_StoneSculptor-session.test.ts`

把 `{ resourceKey: 'grain', count: N, food: 1 }` 改成 `{ sourceId: '__basic__', exchangeIndex: 0, count: N }`；卡牌相关 selection 已带 sourceId+exchangeIndex 的，仅删 resourceKey/food 残留。

## 4. 数据流

### 4.1 Option 构建（client `buildHarvestFeedOptions`）

输出 `HarvestFeedOption[]`，单条形态：

```ts
{
  id: string             // `${sourceId}-ex${idx}`
  sourceName: string
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
}
```

构建顺序（保证列表稳定）：

1. **Basic conversion** — 仅当玩家对应资源 ≥1 时进列表
2. **Improvements (含 majors)** — `triggers ∈ {harvest, anytime}`
3. **Minors** — 同上
4. **Occupations** — 同上

可用性过滤：每条 option 入列表前检查 `every k in from: player.resources[k] ≥ from[k]`，否则不显示。

### 4.2 UI counter 上限

调整一个 option 的 count 时，需保证：

```
∀ key k:  Σ (option.from[k] * count[option])  ≤  player.resources[k]
```

即跨所有 option，对每个 from key 累加消耗 ≤ 玩家持有。实现方式：扫所有 options 与当前 counts，求每 key 全局已分配；对正在调整的 option，求每个 from key 剩余 / from[k] 的 floor 最小值。

### 4.3 Confirm 路径

1. Client 发 `selections: { sourceId, exchangeIndex, count, sourceName? }[]`
2. Server `confirmHarvestFeed`：
   - 对每条 selection，`lookupExchange(player, sourceId, exchangeIndex)`：
     - sourceId === `__basic__` → `getBasicConversionExchange(idx)`
     - 其它 → 已有 `lookupCard` 路径（improvements / minorPlayed / occupationPlayed） → `card.exchanges[idx]`
   - 不校验 trigger
   - 应用 per-source `max` cap（已有逻辑）
   - 按 from/to 双向应用资源（已有逻辑）
   - 应用 sideEffect（已有逻辑）
3. 计算 `totalFood`，`begging = max(0, remaining - totalFood)`
4. 推进 feedQueue 或进入 breed phase

## 5. 错误处理

### 5.1 Server

| 场景 | 行为 |
|---|---|
| `pending.type !== 'harvestFeed'` 或 playerIndex 不匹配 | `respond(false, 'no pending feed')`（沿用） |
| `lookupExchange` 找不到（sourceId 拼错 / index 越界） | 跳过该 selection，不记 log |
| from 资源不足 | `times = min(times, floor(have / from[k]))` scale-down（沿用）；scale 后 `times <= 0` 跳过 |
| 缺口 | `begging` 累加（沿用） |

### 5.2 Payload

新 schema：

- `sourceId`: 非空字符串
- `exchangeIndex`: 整数 ≥ 0
- `count`: 整数 ≥ 0
- `sourceName`: optional 字符串

非法 payload 协议层拒收。

### 5.3 Client

| 场景 | 行为 |
|---|---|
| `option.from[k]` 与玩家持有都为 0 | option 不进列表（构建时过滤） |
| counter 上限 = 0 | `+` 按钮 disable（沿用） |
| 列表 key 漂移（feed 期间 cardStates 变化） | `harvestFeedKeyRef` 比对 `optionIds.join('|')` 重置 counts（沿用，id 已含 sourceId+idx 维度） |

D3 不引入新错误路径。所有"如果 X 不一致"的答案都按现有 fallback / scale-down / 静默丢弃模型。

## 6. 测试

### 6.1 Session 测试 codemod

见 §3.3。所有 4 个文件统一改成 sourceId+exchangeIndex 形态。

### 6.2 Session 测试新增（`harvest-session.test.ts` 内）

| 用例 | 准备 | 断言 |
|---|---|---|
| anytime exchange 在 feed 阶段使用 | p1 装 D60 LargePottery（clay→food, anytime），有 clay | exchangeIndex 转换 → food 增加 / clay 扣除 / log.harvestFeedConvert 记录 |
| non-cookery anytime 也能用 | p1 装 B104 SheepWalker（sheep→stone, anytime），有 sheep | sheep 扣 / stone 加 / `totalFood` 不变 / 缺口走 begging |
| basic conversion 走 sourceId='__basic__' | p1 有 grain，无任何卡 | `{ sourceId:'__basic__', exchangeIndex:0, count:1 }` → grain -1 / food +1 |

### 6.3 Playwright e2e（新增 `e2e-tests/D3-harvest-feed-options.spec.ts`）

| 用例 | 准备 | 断言 |
|---|---|---|
| basic conversion 显示与提交 | dev 2 人房，p1 `grain=2, vegetable=1, food=0`，跳 round 4 触发 harvest，feedPending 缺 3 food | UI 列表含两条 basic；点 grain +2、vegetable +1；summary 显示 food=3 / grain=0 / vegetable=0；提交后 server 应用、log 出现 `log.harvestFeedConvert` |
| anytime non-cookery 出现 + counter 多 key 上限 | p1 装 B104 SheepWalker（sheep=2, stone=0）+ 缺食 | UI 列表含 SheepWalker 三条；对 sheep→stone +1、sheep→boar +1 后，sheep 配额已用尽，**两个共享 sheep 的 `+` 按钮都 disable**（覆盖到 sheep→vegetable 也 disable） |
| harvest trigger + basic 混合提交 | p1 装 C59 SchnappsDistillery（vegetable→5food, max=1）+ grain=2，缺食 5 | 选 SchnappsDistillery 1 + basic grain 1 提交；server 应用，p1 food += 6；后续 round breed 阶段正常进入 |

实现注意：

- `?devMode=1` 进 dev panel 调资源 / 持有卡
- 用 `e2e-tests/fixtures.ts` 封装"准备 harvest pending"
- 断言对象：UI 节点（feed list 行）+ 后端 state（dev panel state inspector 或 wait + 重新拉视图断言资源数）

### 6.4 回归

- `pnpm test:fast`（保持 1900+ 全绿）
- `pnpm exec vitest run --project slow`（保持 1375 全绿）
- `pnpm run lint`（0 error）
- `pnpm exec playwright test e2e-tests/harvest.spec.ts e2e-tests/D3-harvest-feed-options.spec.ts`

### 6.5 手动验证

启动 `./restart-intranet.sh`，开 2 人 dev 房间，触发 harvest：

- harvest feed 列表：basic conversion 两条 + 持有的 isCookery 卡 + harvest trigger 卡
- counter 上限正确（多 key）
- 提交后 server 处理无误，log/begging/breed 推进正常

## 7. DoD

- `grep -rn "resourceKey\|food" client/app/hooks/use-harvest-flow.ts` 仅剩 `Resource` 类型引用，无字段语义残留
- `shared/protocol/ws.ts` / `client/services/gameTransport.ts` 的 harvest feed selection 类型只剩 `{ count, sourceName?, sourceId, exchangeIndex }`
- `shared/session/game-core.ts::confirmHarvestFeed` 单一路径（无 legacy 单 key 分支）
- 所有测试通过（fast + slow + lint + 涉及的 e2e）

## 8. 风险

| 风险 | 缓解 |
|---|---|
| `__basic__` sourceId 与未来卡牌 ID 冲突 | 用双下划线前后缀，与现有 cardId 命名风格（`A123_FrameBuilder` / `Major_Fireplace1`）正交 |
| anytime non-food trade 在 feed UI 出现造成困惑 | Filter-A 是用户决策；通过 e2e 测试覆盖 SheepWalker 用例确保行为可预测 |
| UI counter 多 key 上限计算 bug | e2e 用例 2 专门覆盖共享资源 disable；开发期手动 dev 模式回放 |
| Codemod 改 4 个测试可能漏字段 | tsc strict + 类型层删 resourceKey/food 字段后会编译失败 → 强制覆盖所有调用点 |
