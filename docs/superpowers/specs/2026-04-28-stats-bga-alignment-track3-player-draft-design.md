# Stats × BGA 对齐 — Track 3：Player-level stats + Draft 牌历

Date: 2026-04-28
Status: Draft (awaiting plan)

## 背景与目标

BGA 在 `stats.inc.php` 注册 ~70 项玩家级 stats（座次/行动量/资源来源/转食物/收获/Draft 牌历）和 9 项表级 stats（资源出库峰值），通过 BGA 平台自带的"游戏内统计"和"赛后玩家页"展示。我们没有这套平台 UI，但 `client/components/board/ScoringPad.tsx` 已经实现 BGA 风格的赛后得分拆分弹窗（玩家×14 类 + 卡牌明细 + 总分）。本 Track 把 BGA 玩家级 stats 大部分对齐过来，赛后展示在 `ScoringPad` 新增的 Stats / Draft 两个 tab 上。

明确**不**做：
- 局中实时统计面板（视角是赛后复盘）
- 表级 9 项资源出库峰值（BGA 在自家 stats 里也标 `display: 'limited'`，复盘价值低，砍）
- 14 类得分拆分进 `PlayerStats`（已由 `computeScores()` 在结算时计算并由 `ScoringPad` 消费 `PlayerScoreSummary`，不冗余持久化）
- Per-card stats 6 类（见 Track 1 spec）

## 数据模型

`shared/game/types.ts`

```ts
export type DraftHistoryEntry = {
  cardId: string
  draftTurn: number       // 第几轮 draft 拿到（1..14）
  playedTurn?: number     // 实际打出的回合编号；未打出则 undefined
}

export type PlayerStats = {
  // 行为/座次
  placedFarmers: number
  firstPlayerCount: number
  totalRoomsBuilt: number
  totalMajorBuilt: number
  totalMinorBuilt: number
  totalOccupationBuilt: number
  // 收获
  harvestedGrain: number
  harvestedVegetable: number
  // 资源来源
  resourcesFromBoard: Partial<Resource>
  resourcesFromCards: Partial<Resource>
  // 转化
  resourcesConverted: Partial<Resource>     // 各资源被转食物的次数累计
  foodFromConversion: Partial<Resource>     // 各资源转出 food 总量按原资源拆分
  // Draft 牌历
  draftHistory: DraftHistoryEntry[]
  draftDiscarded: string[]                  // 弃掉的卡 ID，最多 6
}
```

挂载点：`PlayerState.stats: PlayerStats`（必选）。

初始化（`createInitialPlayerState` 类似入口）：
- `firstPlayerCount`：起始首家 = 1，其余玩家 = 0
- 其他数字字段 = 0
- 字典字段 = `{}`
- `draftHistory` / `draftDiscarded` = `[]`

`Resource` 类型不在本 spec 扩展（伪资源键扩展是 Track 1 的事；本 Track 内字典字段只用真实资源键）。

序列化：现有 `serializeState` / `rehydrateState` 自动覆盖（普通 JSON）。

## 写入点

新增 `shared/logic/stats.ts`，导出细粒度 helper：

```ts
incPlacedFarmers(player)
incFirstPlayer(player)
incRoomsBuilt(player, count)
incMajorBuilt(player) / incMinorBuilt(player)
incOccupationBuilt(player)
incHarvestedGrain(player, count) / incHarvestedVegetable(player, count)
addResourceFromBoard(player, resources)
addResourceFromCards(player, resources)
addResourceConverted(player, resource, count)
addFoodFromConversion(player, resource, foodAmount)
recordDraftPick(player, cardId, draftTurn)
recordDraftPlayed(player, cardId, currentTurn)
recordDraftDiscarded(player, cardId)
```

每个 helper 一行 in-place mutate。无 GameState 全局后置 hook。

| 字段 | 调用位置 |
|---|---|
| `placedFarmers` | `server/game-session.ts` PlaceFarmer 命令路径，每次放人 +1 |
| `firstPlayerCount` | `shared/logic/round.ts` 首家轮换处，新一年首家 +1（含起始首家初始化） |
| `totalRoomsBuilt` | construct effect 完成回调，按 rooms 数累加 |
| `totalMajorBuilt` / `totalMinorBuilt` | improvement effect 区分 major/minor 后各 +1 |
| `totalOccupationBuilt` | occupation effect 完成 +1 |
| `harvestedGrain` / `harvestedVegetable` | harvest reap 流程按 reap 出来的种子数累加 |
| `resourcesFromBoard` | gain effect / take-from-card 等，**当 `sourceCard` 不存在**（即来自行动格） |
| `resourcesFromCards` | 同上，**当 `sourceCard` 存在** |
| `resourcesConverted` | convert（烤面包/做菜/喂食）入口按消耗资源累加 |
| `foodFromConversion` | 同上，按产出 food 量按原资源拆 += foodOut |
| `draftHistory` | draft 阶段：玩家拿到一张牌 push entry；该牌从手牌打到 played 区时回写 `playedTurn` |
| `draftDiscarded` | pre-game 弃牌处 push cardId |

`board` vs `cards` 区分凭 effect context 中 `sourceCard` 字段是否存在（与 `pay-resources.ts:21` 的现有判定一致）。

写入点总数约 11 处，全部分散在已有 effect / 命令路径，不需要全局后置 hook。

## UI 改动

`client/components/board/ScoringPad.tsx` 加 tab 切换：

```
┌─ Scoring                  [Score] [Stats] [Draft]   [Close]
│
│ Score tab：现有内容（零改动）
│
│ Stats tab（新）：
│   按分组排列的 label/value 网格，每玩家一列
│   分组：行动统计 / 收获 / 资源来源 / 转食物
│   每行：StatRow { label, valuesByPlayer[], renderAs: 'number' | 'resources' }
│
│ Draft tab（新）：
│   每玩家一列，14 行 draftHistory 条目（"T1 ▸ A29 (played T3)"），
│   下方分隔线 + Discarded 区块（玩家若是首位被让位的弃牌玩家则非空）
└──
```

实现：

- Tab 切换：`useState<'score' | 'stats' | 'draft'>('score')`，三个 button 切换
- Stats tab 复用现有 `scoring-grid` 类与 `gridTemplateColumns` 计算逻辑，提取 `<StatsRow label values renderAs />` 子组件。资源行用 `<ResourceLine>`（已存在）渲染 `Partial<Resource>`，每个玩家独立一格
- Draft tab 用纯列表布局：`grid-template-columns: repeat(playerCount, 1fr)`，每列内一个 `<ul>`。卡牌名调 `getCardDisplayName(locale, type, cardId)`（已存在），`type` 通过 cardId 前缀（A/B/C/D/E + 数字段）→ occupation/minor/major 推断（实施时写一个 `inferCardType` helper）
- Props 扩展：`<ScoringPad>` 新增 `players: PlayerState[]` prop，从中读取 `player.id` / `player.name` / `player.stats`。`scores` 不变

i18n 新增 keys（中英对照）：

- `ui.scoringTabScore` / `ui.scoringTabStats` / `ui.scoringTabDraft` — tab 标题
- 行动组：`ui.statsPlacedFarmers` / `ui.statsFirstPlayerCount` / `ui.statsTotalRoomsBuilt` / `ui.statsTotalMajorBuilt` / `ui.statsTotalMinorBuilt` / `ui.statsTotalOccupationBuilt`
- 收获组：`ui.statsHarvestedGrain` / `ui.statsHarvestedVegetable`
- 资源来源组：`ui.statsResourcesFromBoard` / `ui.statsResourcesFromCards`
- 转食物组：`ui.statsResourcesConverted` / `ui.statsFoodFromConversion`
- Draft：`ui.draftHistoryHeader` / `ui.draftPlayedAt` / `ui.draftDiscarded`

触发时机：当前 ScoringPad 触发逻辑（`state.gameOver` 时由 `client/app/GameContainerApi.tsx:1137` 路径打开）不变。

## 测试策略

**Unit**（`shared/logic/__tests__/stats.test.ts` 新建）

- 13 个 helper 各一个或两个用例
- 字典字段：键不存在时初始化为 0 再累加
- `firstPlayerCount` 起始值场景：玩家 1 = 1，其余 = 0

**Session**（`server/__tests__/stats-tracking.test.ts` 新建）

直接驱动 `GameSession` 跑场景，断言 `resp.state.players[*].stats.*`。每个写入点至少一个用例：

| 场景 | 断言 |
|---|---|
| 放 5 次工人 | `placedFarmers === 5` |
| 跑 3 年首家轮换 | `firstPlayerCount` 累加正确（起始首家 = 1 + 当首次数）|
| 建 2 间木屋 + renovate 黏土 + 建 1 间黏土屋 | `totalRoomsBuilt === 3` |
| 玩 1 major + 1 minor + 2 occupation | major=1 / minor=1 / occupation=2 |
| 收获 3 块谷物田 + 1 块菜田 | grain=3, vegetable=1 |
| 走"伐木"格 + 玩"林业大师"产木头 | resourcesFromBoard.wood vs resourcesFromCards.wood 分别累加 |
| 喂食 2 grain → 2 food | resourcesConverted.grain=2, foodFromConversion.grain=2 |
| 烤面包 2 grain → 4 food | resourcesConverted.grain=2, foodFromConversion.grain=4 |
| 14 轮 draft 跑完 + 中途打出 3 张 | draftHistory.length=14，3 条带 playedTurn |
| Pre-game discard 6 张 | draftDiscarded.length=6 |

**Component**（`client/components/board/__tests__/ScoringPad.test.tsx` 扩展）

- 三 tab 切换可见性（默认 score tab）
- Stats tab 渲染 mock `PlayerStats` 全字段：数字字段、资源字典字段、空字典不渲染空行
- Draft tab：14 条 draftHistory 渲染、`playedTurn` 缺失时只显示 draft turn、Discarded 区块按数量条件渲染
- 中英两 locale 各跑一遍

**E2E** — 不做。

## 待实施时确认

1. `firstPlayerCount` 当首语义：BGA 是"每年成为首家 +1，含 round 1 起始首家"。本仓库 `round.ts` 中首家轮换的具体钩子位置实施时定。
2. `resourcesFromBoard` / `resourcesFromCards` 写入点的 `sourceCard` 判定面：grep 所有调 `addCardResourceGained` 的地方对照"是否所有"行动格→玩家资源"路径都走过这一支，确保 board 来源不被漏记。
3. Card type 推断（Draft tab 用）：占用前缀字典 A/B/C/D/E → occupation/minor/major 的对应关系实施时确认（参考 `getCardDisplayName` 的现有调用模式）。
4. ScoringPad 现有 `onClose` / `state.gameOver` 触发逻辑要不要在新 tab 也兜底"游戏未结束时打开仅看 Stats/Draft"——本 spec 默认沿用现有触发（gameOver-only），不放宽。

## 工作分解（建议 PR 切分）

1. **PR-1（数据模型 + helpers + unit）**：`PlayerStats` 类型 + 初始化 + `shared/logic/stats.ts` 全套 helper + unit 测试。无写入点改动，无 UI。
2. **PR-2（写入：行为/收获/转化）**：placedFarmers / firstPlayerCount / totalRoomsBuilt / totalMajor/Minor/OccupationBuilt / harvested* / resourcesConverted / foodFromConversion 的埋点 + 对应 session 测试。
3. **PR-3（写入：资源来源 + Draft 牌历）**：resourcesFromBoard / resourcesFromCards 区分 + draftHistory / draftDiscarded 写入 + session 测试。
4. **PR-4（UI）**：ScoringPad tab 切换 + Stats tab + Draft tab + i18n + component 测试。

PR-1 合并后 PR-2 / PR-3 / PR-4 可并行（PR-4 用 mock PlayerStats 测试，不阻塞）。
