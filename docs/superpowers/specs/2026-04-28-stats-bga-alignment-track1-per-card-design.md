# Stats × BGA 对齐 — Track 1：Per-card stats + Infobox

Date: 2026-04-28
Status: Draft (awaiting plan)

## 背景与目标

BGA 在每张已打出的玩家卡上挂一个 6 类字段字典 (`used` / `gain*` / `paid*` / `saved*` / `receivedPayment*` / `paidToOthers*`)，玩家放大卡牌时弹出 "Card Statistics" 区块。我们当前 (`shared/cards/helpers/card-state.ts:94+`) 仅持久 `paid` / `gained` 两类，前端 (`client/components/board/FarmBoard.tsx:440-484`) tooltip 也只渲染这两段。本 Track 把 per-card 字段补齐到 6 类、把已存在但无人写入的 `cardStates[id].infobox` 角标用上。

不在本 spec 范围：玩家级聚合 stats (`PlayerStats`)、Draft 牌历、得分拆分页 — 见 Track 3 spec。

## 数据模型

`shared/game/types.ts`

```ts
export type CardResourceStats = {
  used: number
  gained: Partial<Resource>          // 资源量 + 伪资源键（occupation/field/roomWood/roomClay/roomStone/stable）
  paid: Partial<Resource>
  saved: Partial<Resource>
  receivedPayment: Partial<Resource>
  paidToOthers: Partial<Resource>
}
```

`Resource` 类型扩展 6 个伪资源键：`occupation`、`field`、`roomWood`、`roomClay`、`roomStone`、`stable`。仅 `gained` 字段会写入这些键（值是次数，不是资源量），目的是让 BGA 风格的 "Plows: 2"、"Built: 1 stone room" 等特殊文案共用同一存储槽。其它 stats 字段值在伪资源键上恒为空。

存储位置仍是 `cardStates[cardId].extraData.resourceStats` (key `'resourceStats'`)，序列化沿用 GameState 全量同步。

`infobox` (`CardState.infobox: string | undefined`) 已存在，前端 (`client/components/common/PlayerCard.tsx:281`) 已渲染 `<div className="card-infobox">{infobox}</div>`，本 spec 不改 schema。

## 写入点

`shared/cards/helpers/card-state.ts` 新增 helper：

- `incCardUsed(player, cardId)`
- `addCardResourceSaved(player, cardId, resources)`
- `addCardResourceReceivedPayment(player, cardId, resources)`
- `addCardResourcePaidToOthers(player, cardId, resources)`

现有 `addCardResourcePaid` / `addCardResourceGained` 不变。`Resource` 类型扩展后，`gained` 写入伪资源键也走 `addCardResourceGained`。

新增中心 helper `recordPaymentStats(player, solution: PaymentSolution)`：根据 `PaymentSolution.tradesUsed` / `bonusUsed` 分摊 `paid` / `saved` 到对应来源卡。算法：

```
for tradeUse of solution.tradesUsed:
  if tradeUse.trade.sourceId is a card id:
    saved[res] += count * trade.from[res]   // 因这张卡省下的资源
    paid[res]  += count * trade.to[res]      // 实际改付的资源
for bonusSourceCard of parsed solution.bonusUsed:
  saved[res] += bonus 减免量
```

| 字段 | 调用位置 | 触发 |
|---|---|---|
| `used` | `shared/engine/engine.ts` 中 `ActivateCardNode` 完成执行的回调（一处） | listener fire +1 |
| `gained.<resource>` | 现有 `addCardResourceGained` 调用点不变（gain.ts、take-from-card.ts、pop-card-stack.ts、gain-other-players.ts、helpers/card-gain.ts、helpers/stage-effects.ts） | 沿用 |
| `gained.occupation` | `shared/actions/effects/play-occupation.ts`（或等价入口）末尾，sourceCard 存在时累加 1 | 打出 occupation |
| `gained.field` | plow effect 末尾 | 完成一次开垦 |
| `gained.roomWood` / `roomClay` / `roomStone` | construct effect 完成后按建造数累加，按当前房屋类型选 key | 建造房间 |
| `gained.stable` | 围栏/建畜舍 effect 完成后累加 | 建畜舍 |
| `paid.<res>` | `pay-resources.ts` 重写 sourceCard 路径 — 改为调用 `recordPaymentStats(player, solution)`，不再直接累加总 cost | 任意带 sourceCard 的支付 |
| `saved.<res>` | 同上，`recordPaymentStats` 内一次性算完 | 同上 |
| `receivedPayment` / `paidToOthers` | 玩家间转账入口（grep `payResourceTo` / 类似），按 `ctxArgs.to` 与付款方关系分流 | 跨玩家支付 |

`infobox` 写入：实施前盘点已实现的"进度型"卡（其 hook 已经在 `cardStates[id].counters.*` 累加计数）。候选清单（不锁死）：D36 BreedRegistry、A53 Claypipe、C148 MudWallower、E27 PiggyBank、E74 AshTrees、E86 PenBuilder、A25 Bassinet（清空 infobox 用例）。每张目标卡在其 `during` / `after` hook 末尾调 `writeCardInfobox(player, cardId, "${n} / ${cap}")`。具体清单在实施时定。

### 已确认前置依赖

`PaymentSolution` 结构 (`shared/actions/effects/pay-helpers.ts`) 已包含 `resourcesPaid` / `bonusUsed` / `tradesUsed`，`Trade.sourceId` 标记折扣来源卡，`collectPaymentSolutionSources(solution)` 已能列出参与支付的来源卡。`saved` / `paid` 的归属计算不依赖任何缺失的基础设施。

## UI 改动

**Tooltip**（`client/components/board/FarmBoard.tsx:440-484`）

新增 `client/components/common/cardStatsFormat.ts`：

```ts
export type CardStatLine = {
  key: string                  // 用于 React key
  labelKey: string             // i18n 文案 key
  value?: number               // used / 单值
  resources?: Partial<Resource> // 资源行
}

export const formatCardStatsLines(
  stats: CardResourceStats | undefined,
  cardId: string,
  locale: Locale,
): CardStatLine[]
```

按 BGA 顺序输出条目：`used → gained(resources) → gained(occupation/field) → gained(rooms+stable) → receivedPayment → paid → paidToOthers → saved`。空段不输出。

文案沿用项目现有"标签 + 资源行"风格，不照搬 BGA 行末数字风格。新增 i18n keys（中英两份）：

- `ui.cardStats.used` — "使用次数 / Used"
- `ui.cardStats.gained` — "获得 / Gained"（已有 `cardStatsGained`，重命名或新增）
- `ui.cardStats.gainedOccupation` — "出牌职业次数 / Occupations played"
- `ui.cardStats.gainedField` — "开垦次数 / Plows"
- `ui.cardStats.builtRoom` — "建房间数 / Rooms built"
- `ui.cardStats.builtStable` — "建畜舍数 / Stables built"
- `ui.cardStats.receivedFrom` — "他人支付 / Received from others"
- `ui.cardStats.paid` — "支付 / Paid"（已有 `cardStatsPaid`，重命名或新增）
- `ui.cardStats.paidToOthers` — "支付给他人 / Paid to others"
- `ui.cardStats.saved` — "节省 / Saved"

旧 i18n keys (`cardStatsPaid` / `cardStatsGained`) 保留作 fallback。

JSX 侧 `played-card-stats-tooltip` 改为遍历 `formatCardStatsLines` 输出，按 `value` / `resources` 字段类型选渲染分支（数字 vs `<ResourceLine>`）。

**Infobox** — 无 UI 代码改动。仅按需要微调 `client/styles/card-sprite.css:241+` 的 `.card-infobox` 样式（字号、对比度），实施时视觉评估再定。

## 测试策略

**Unit**

- `shared/cards/helpers/__tests__/card-state.test.ts`（扩展）：4 个新 helper × 多键累加场景
- `shared/cards/helpers/__tests__/payment-stats.test.ts`（新建）：`recordPaymentStats` 给定 mock `PaymentSolution`（trades + bonuses 组合）算出 saved / paid 拆分
- `client/components/common/__tests__/cardStatsFormat.test.ts`（新建）：6 类字段全覆盖、伪资源特殊文案、空字段过滤、中英两 locale

**Session**（`server/__tests__/`，每张卡一个或扩展现有）

| 用例 | 断言字段 |
|---|---|
| 触发型卡（如 D138_PetLover 或同等已实现卡）调 `takeAction` | `cardStates[id].extraData.resourceStats.used === 1` |
| B129_Seatmate 等已有 cardstats 测试 | `gained.<res>` 累加 |
| 一次 plow + 一次 occupation 完成 | `gained.field === 1`、`gained.occupation === 1`（归到对应 sourceCard） |
| C16_FieldFences 折扣建栅栏 | 对应 `saved.wood > 0` |
| C88_CarpentersApprentice 折扣建畜舍 | `saved.wood > 0` |
| 玩家间转账已实现实例（grep 出来后再选） | `receivedPayment` / `paidToOthers` 双向写入 |

**E2E** — 不做。

## 待实施时确认

1. 玩家间支付路径：grep `payResourceTo` / 玩家间 transfer 入口，列出当前已实现实例。若实例为零，本 spec 仍保留 helper 实现，但 session 测试该用例可暂跳过并在 spec 注脚标记。
2. Infobox 候选卡清单：实施时盘点 `cardStates[*].counters` 实际累积的卡，按"是否有进度上限"过滤；实施 PR 列出最终清单。
3. `Resource` 扩展 6 个伪资源键后，全仓库使用 `Resource` / `Partial<Resource>` 的地方需检查是否有"遍历所有 Resource 键并按真实资源处理"的逻辑（如 ResourceLine、payResources）。若有，需在那一侧过滤伪资源键。这是实施时第一步要做的影响面扫描。

## 工作分解（建议 PR 切分）

1. **PR-1（基础）**：`Resource` 扩展伪资源键 + `CardResourceStats` 扩展到 6 字段 + 4 个新 helper + `recordPaymentStats` + 全套 unit 测试。无写入点改动，类型安全先到位。
2. **PR-2（写入）**：`used` / `gained.occupation/field/room/stable` / `pay-resources.ts` 重写 / 玩家间转账写入 + session 测试。
3. **PR-3（UI）**：`formatCardStatsLines` + tooltip JSX + i18n + cardStatsFormat 单测。
4. **PR-4（infobox）**：选定的进度型卡逐个补 `writeCardInfobox` 调用 + 视觉验证。

PR-1 合并后 PR-2 / PR-3 可并行。PR-4 与 PR-2 / PR-3 完全独立。
