# 卡牌测试模板

[English](CARD_TEST_TEMPLATE.md) | [中文](CARD_TEST_TEMPLATE_zh.md)

> 本文件是中文翻译镜像；[CARD_TEST_TEMPLATE.md](CARD_TEST_TEMPLATE.md) 是唯一权威版本。

## 1. 目的

本文档用于约定 Open Agricola 中“新增或修改一张卡牌实现”时的标准测试写法。

核心原则：

- 机械规则用静态门禁，简单即时效果用直接行为测试，高风险流程站在 `GameSession` 边界测试
- 测试必须断言真实行为，不验证导出存在或对象形状
- Session 断言以服务端返回的 `state`、`interaction`、`state.log`、`scores` 为主
- 前端渲染、控件展示、界面截图，单独作为渲染测试或 E2E 测试处理

换句话说：

- 卡牌效果是否正确，主要看后端状态有没有正确变化
- 页面有没有正确显示，主要看前端渲染测试和 E2E

## 2. 适用范围

该模板适用于：

- 职业卡
- 小改良卡
- 大改良附带的卡牌效果
- 行动触发型被动卡
- 回合阶段触发型卡
- 会引入等待交互、follow-up action、额外选择、延迟效果的卡

不适用于：

- 纯样式改动
- 纯文案翻译改动
- 与卡牌无关的通用 UI 组件测试
- **Workshop / AI Designer 自定义卡的"LLM 生成代码能否跑通"测试** —— 那套独立框架见 `docs/test/llm-card-gen.md`

## 3. 测试分层约定

选择能证明规则的最小测试层，禁止统一生成只验证导出、定义存在或对象形状的 smoke test。

### 3.1 静态门禁

可机械判断、无需运行游戏的约束放在 CI 静态门禁。例如 listener 返回 `costs` 时必须在同一对象中提供 `costAttribution`。门禁不替代卡牌行为测试。

### 3.2 直接行为测试

简单即时效果可以直接调用卡牌公开的 effect / listener，断言返回的 `ActionFlow`、资源 delta、来源卡和不触发分支。仅当效果不经过支付求解、选择 / pending、阶段延迟、跨玩家或多步 flow 时使用。

### 3.3 Session 测试

支付、选择 / pending、延迟效果、跨玩家、多步 flow，以及依赖实际 action candidate / payment pipeline 的卡牌必须使用 `GameSession`。直接调用 `takeAction()`、`resolveChoice()`、`commitSelectionChoice()` 等公开命令，断言：

- `state`
- `interaction`
- `state.log`
- `scores`

### 3.4 前端渲染测试

这是辅助测试层。

目标：

- 验证某份服务端状态被正确渲染
- 验证按钮是否可见、控件是否禁用、日志是否显示

输入：

- 固定 `stateUpdate`
- 固定 `GameApiResponse`
- 固定 `SerializedGameState`

### 3.5 E2E 测试

这是链路验证层。

目标：

- 验证浏览器界面与多人实时同步主路径真的打通
- 验证关键交互在真实页面中可以完成

说明：

- E2E 不应承担主要规则断言职责
- E2E 重点验证“能不能操作”和“多个窗口是否同步”

## 4. 每张卡必须提供的测试信息

当你为一张卡编写测试说明时，必须明确写出下面这些信息。

### 4.1 基本信息

- `cardId`
- 卡牌名称
- 卡牌类型：职业 / 小改良 / 大改良附带效果
- 触发时机
- 生效对象：自己 / 对手 / 任意玩家
- 是否会产生等待交互
- 是否会修改 `cardStates`

### 4.2 测试目标

至少写清楚：

- 这张卡的正向效果是什么
- 这张卡在什么前置条件下会触发
- 这张卡在什么情况下不应触发
- 这张卡是否会写日志
- 这张卡是否会改变后续 action / flow / interaction
- 选择静态门禁、直接行为测试或 Session 测试中的哪一层，以及原因

### 4.3 初始状态准备

选择 Session 测试时，测试说明必须明确：

- 从一局新的 2 人游戏开始
- 当前测试玩家是谁
- 当前回合是多少
- 玩家拥有哪些资源
- 玩家已经打出了哪些卡
- 玩家手里还有哪些卡
- 行动格占用情况
- 农场版图状态
- 是否需要预先设置 `cardStates`

Session 测试必须在首次行动前显式固定所有玩家的 `minorHand` 和
`occupationHand`。与手牌无关时使用 `['__test_placeholder__']`；不要使用空数组，
因为 `normalizeState` 会重新发牌。测试需要的目标卡应在固定背景手牌后单独加入。

### 4.4 同时机多卡反应

如果卡牌属于 action reaction listener、harvest field stage card-effect、before-end card-effect 或 extra-turn provider，且同一时机可能与另一张卡同时触发，测试必须覆盖 `trigger-select`：

- 构造至少两张同一时机可触发的卡
- 断言 `interaction` 展示的是可选择的来源卡，而不是直接按打出区顺序执行
- 分别选择不同来源卡，断言后续 flow、状态、日志和剩余 trigger 的重算符合预期
- 覆盖 `undoStep` 或 `undoAction` 后重新派生同一 trigger-select 的场景

## 5. 推荐的后端入口清单

Session 卡牌测试优先使用后端边界驱动。房间规则主链路走 WebSocket；HTTP `game-router` 只用于 dev / sandbox / 测试辅助；Session 测试直接调用 `GameSession`。

### 5.1 三种推荐驱动方式

按从轻到重排序：

1. **直接 `new GameSession(stateOrSeed?, customCards?, initialStateOptions?)` + 调方法**（绝大多数 `server/__tests__/*.test.ts` 的写法）
   - 不经网络，跑得最快；最适合"卡牌效果是否触发、状态怎么变"这类断言
   - 入口方法见 §5.3
2. **通过 `server/connection/room-router.ts` 驱动内存房间**
   - 当需要验证多窗口同步、`stateUpdate` 广播、断线重连时使用
   - 复用 `server/connection/__tests__/room-router.test.ts` 的 `RoomRegistry`、`Broadcaster`、内存 persistence 与 `dispatch` 组合
3. **Playwright E2E（`e2e-tests/*.spec.ts`）**
   - 仅在需要验证浏览器 UI 主路径或多窗口同步时用；规则断言不放在这层

### 5.2 状态准备方式

不要假设存在 `POST /api/game/dev/*`。当前可用的状态预设方式有：

- **`GameSession.loadState(state)`** —— 加载一份 `SerializedGameState`（`shared/session/serialization.ts`）
- **WS `devSetResources` / `devSetRound` / `devDrawCard` / `devPlayCard` / `devCreatePasture`** —— 在 dev 房间里按需调整
- **直接在 GameSession 实例上 mutate**（仅限单测，不要在跨网络场景使用）：
  - 改 `session.state.players[i].resources`
  - `session.state.players[i].minorPlayed.push(CARD_ID)`
  - `session.state.actionSpaces[k].takenBy.push({ playerId, workerId })`

### 5.3 GameSession 主入口（最常用）

| 方法 | 对应的 `interaction.allowedCommands` 名 | 对应 WS `type` | 用途 |
|---|---|---|---|
| `takeAction(playerIndex, spaceId)` | `takeAction` | `action` | 放工人 / 触发主行动 |
| `takeAnytimeAction(playerIndex, actionId)` | `takeAnytimeAction` | `anytime` | 触发 anytime 卡牌效果 |
| `resolveChoice(playerIndex, value, payload?)` | `resolveChoice` | `choice` | 回应 `interaction.stateId === 'wait'` 下的 choice / confirm / feed / animal-reorg |
| `commitSelectionChoice(playerIndex, payload)` | `commitSelection` | `commitSelection` | 围栏 / 房间 / 马厩 / 犁地 / 播种 / farm-position / occupation-hand / resource selection 提交 |
| `performRoundEnd()` | — | `roundEnd` | 推进回合（一般由引擎自动触发） |
| `undoStep()` / `undoAction()` | `undoStep` / `undoAction` | `undoStep` / `undoAction` | 单步 / 整动作回退 |

> **协议名 vs 引擎名**：WS `ClientCommand.type` 与 `interaction.allowedCommands` 字符串并不完全相同（详见 `ARCHITECTURE_zh.md §7.2`）。测试里如果直接调 `GameSession`，用左一列；如果走 WS，用右一列。

### 5.4 WebSocket 命令（若走房间路径）

以 `shared/contract/protocol/ws.ts` 中 `ClientCommand` 定义为准。常用：

- `createRoom` / `joinRoom` / `dissolveRoom`
- `getState`
- `action` / `choice` / `anytime`
- `roundEnd`
- `commitSelection`
- `undoStep` / `undoAction`
- `newGame` / `loadGame`
- `devSetResources` / `devSetRound` / `devDrawCard` / `devPlayCard` / `devCreatePasture`

服务端事件（`ServerEvent`）主要看 `stateUpdate.payload`（包含 `state` / `interaction` / `scores` 等；日志在 `state.log`），其它握手事件不在卡牌规则断言的关心范围内。

## 6. 每一步必须断言哪些字段

对于卡牌测试，建议每次关键交互后都断言下面几类字段。

### 6.1 玩家状态

- `state.players[n].resources`
- `state.players[n].minorPlayed` / `occupationPlayed` / `improvements`
- `getPlayedCardKeys(state.players[n])`（聚合上述三类）
- `state.players[n].cardStates[CARD_ID]?.{ flagged, counters, extraData, stack, ... }`
- `state.players[n].workers`（Worker 身份模型，每个槽含 `id` / `isActive` / `isNewborn`）
- `familySize(player)` / `workersAvailable(state, player)` / `workersAtHome(state, player)`（`shared/domain/player.ts` helper，**不是字段**——直接读 `player.workers` 数组得到的是含 supply slot 的全部槽位，必须走 helper 才能得到游戏意义上的"家庭人数 / 在家可用人数"）
- `state.players[n].fields` / `pastures` / `stableTiles` / `roomTiles`
- `state.players[n].fenceSegments`（`FenceSegment[]` 数组）
- `getFenceCount(player)` / `getPalisadeCount(player)`（fence 计数 helper）
- `countFields(player)` / `countOccupations(player)`（聚合自有 + 卡牌虚拟身份；用于 prereq）
- `countPeopleOnSpace(state, spaceId)`（`shared/cards/helpers/space-occupancy.ts`，A25 等卡用到）

### 6.2 全局状态

- `state.currentPlayerIndex`
- `state.round`
- `state.gameOver`
- `state.availableMajorImprovements`
- `state.actionSpaces[*].takenBy`（**`WorkerRef[]`**——元素是 `{ playerId, workerId }`，不是单个 playerId）
- `state.actionSpaces[*].resources`
- `state.actionSpaces[*].players`（行动格的人数过滤，`createActionSpaces(playerCount?)` 按此字段筛）

### 6.3 交互状态

`InteractionState` 是前端交互真相：

- `interaction.stateId`：`idle` / `wait` / `gameover`
- `interaction.playerIndex`（`wait`）：当前需要响应的玩家
- `interaction.sourceCard`（`wait`）：触发本次交互的来源卡 id
- `interaction.request.kind`（`wait`）：`choice` / `farm-select` / `selection` / `animal-reorg` / `feed` / `confirm-next-player` / `confirm-player-switch` 等具体请求
- `interaction.allowedCommands`：当前 player 允许调用的引擎命令名白名单（不在白名单里的会被拒）
- `interaction.request.options`（choice 模式）：候选项数组
- `interaction.request.farm`（farm-select 模式）：farmType + payload schema
- `interaction.request.selection`（selection 模式）：选择类型与候选项
- `interaction.promptKey` / `promptParams`：i18n key 与参数

### 6.4 日志与分数

- `log[0].key`
- `log[0].params`
- 是否新增了目标日志（避免误触发别的 listener 也写了日志）
- `resp.scores`（WS 路径为 `stateUpdate.payload.scores`）

## 7. 卡牌测试模板

下面这份模板是每张卡测试说明都应该遵循的结构。

---

## 卡牌测试说明模板

### A. 卡牌信息

- `cardId`: `CARD_ID`
- 名称：`CARD_NAME`
- 类型：职业 / 小改良 / 大改良附带效果
- 触发时机：`TRIGGER_TIMING`（hook phase 或 listener `actions` + `phases`）
- 生效范围：自己 / 对手 / 任意玩家（对应 `registerCardListener` 的 `scope`）
- 是否产生等待交互：是 / 否（若是，说明 `interaction.request.kind`）
- 是否写 `cardStates`：是 / 否（若是，列出 `flagged` / `counters` / `extraData` / `stack` 的 key）
- 是否声明 `handHooks`：是 / 否（在手牌时也触发的 hook 列表，目前仅 E96 Elder 用到）
- 是否需要透传 `sourceCard`：是 / 否（卡牌触发的 choice / farm-select / selection 应在 `interaction` 里带 `sourceCard`）

### B. 测试目标

- 验证 `EXPECTED_PRIMARY_EFFECT`
- 验证 `EXPECTED_NEGATIVE_CASE`
- 验证 `EXPECTED_LOG_BEHAVIOR`
- 验证 `EXPECTED_PENDING_BEHAVIOR`

### C. 初始状态准备

#### C.1 开局

1. `const session = new GameSession(seed)`（默认 2 人；如需 3/4 人使用 `new GameSession(seed, undefined, { playerCount })`）
2. 确认 `session.state.players.length === expectedPlayerCount`

#### C.2 设置当前玩家 / 推进到目标阶段

1. 推 `state.currentPlayerIndex = X`，或者用 `takeAction` 把无关玩家先消耗掉
2. 如需直接跳到指定回合：`state.round = R`，再按需调一次 `performRoundEnd()` 让阶段一致

#### C.3 设置资源

直接 mutate `state.players[X].resources`，例如：

```ts
state.players[0].resources = {
  ...state.players[0].resources,
  food: 0,
}
```

如果走 WS，则发 `devSetResources` 命令。

#### C.4 设置卡牌

- 单测：`state.players[X].minorPlayed.push(CARD_ID)` 或 `occupationPlayed.push(...)` / `improvements.push(...)`
- 如果需要触发 `onBuy`，通过 `takeAction` 走真实购买路径
- 走 WS：`devPlayCard` / `devDrawCard`

#### C.5 设置版图 / 行动格 / 特殊前置条件

按需要补充：

- 行动格占用：`state.actionSpaces[k].takenBy.push({ playerId: state.players[X].id, workerId: state.players[X].workers[i].id })`
- 圈地 / 田地 / 马厩 / 房间：直接 mutate `pastures` / `fields` / `stableTiles` / `roomTiles`，或调 `commitSelectionChoice` 走真实路径
- 预置 `cardStates`：`state.players[X].cardStates[CARD_ID] = { flagged: true, counters: {...}, extraData: {...} }`
- 预设回合 / 阶段：`state.round = R` + `performRoundEnd()`

#### C.6 Reading global `completedFeedingPhases` in tests

`state.completedFeedingPhases` 是全局收获计数（A148_Woolgrower / B086_TruffleSearcher 等"按已完成 feeding +1 容量"卡牌从此字段读取）。Session 测试无需跑完整收获 phase；直接在 setup 阶段覆盖即可：

```ts
const session = new GameSession(SEED)
session.state.completedFeedingPhases = 3
session.state.players[0].occupationPlayed.push('A148_Woolgrower')
// 之后 onComputeAnimalZones(player, zones, state) 读到 cap = 3
```

如果测试要验证"feeding phase 真正 +1"，通过 `performRoundEnd()` 和后续 `resolveChoice()` 跑完整收获流程，再断言 `session.state.completedFeedingPhases` 单调递增。

### D. 测试步骤

#### D.1 步骤 1：触发主动作

```ts
const resp = session.takeAction(X, 'ACTION_ID')
```

断言：

- `resp.ok === true` （或对负向用例断言 `false` + `resp.error`）
- `resp.state.players[X].resources`
- `resp.state.players[X].cardStates[CARD_ID]`
- `resp.state.actionSpaces[*].takenBy`
- `resp.interaction`
- `resp.state.log`

#### D.2 步骤 2：如果产生等待交互，则按 request kind 提交

先断言 `interaction.stateId === 'wait'`，再按 `interaction.request.kind` 调对应方法：

- `choice`：`session.resolveChoice(X, 'CHOICE_VALUE')`
- `animal-reorg`：`session.resolveChoice(X, 'confirm', interaction.request.zones)`
- `feed`：`session.resolveChoice(X, 'confirm', { selections: [...] })`
- `confirm-next-player`：`session.resolveChoice(interaction.request.nextPlayerIndex, 'confirm')`
- `confirm-player-switch`：`session.resolveChoice(interaction.request.toPlayerIndex, 'confirm')`
- `farm-select` / `selection`：`session.commitSelectionChoice(X, payload)`

断言：

- `interaction.stateId` 是否回到 `idle` 或进入下一个 `wait`
- `state.players[X].resources` / `cardStates`
- `state.log`

#### D.3 步骤 3：回合结束

按需调用：

- `performRoundEnd()`（一般引擎自动触发，测试里手动调用主要用于断言"回合结束 hook 是否触发"）

每一步都要记录：

- 请求参数
- 响应中的 `interaction`
- 响应中的关键状态变化
- 新增日志

### E. 必须断言的状态变化

请逐项写清：

- 哪个玩家的哪些资源变化
- 哪个行动格状态变化
- 是否新增 / 移除某张卡
- `cardStates[cardId]` 如何变化
- `interaction` 如何变化
- `log` 增加了哪些条目

### F. 日志断言

至少断言：

- 日志 `key`
- 日志 `params`
- 是否包含 `cardId`
- 是否包含资源变化
- 是否出现不应该出现的日志

### G. 负向测试

至少补充一个负向测试：

- 前置条件不足时，不应触发卡牌效果
- 错误玩家操作时，状态不应变化
- 选择非法值时，应返回错误或保持原状态
- 行动不匹配时，不应触发该卡

### H. 渲染测试

这一部分单独处理，不与规则测试混在一起。

应验证：

- 前端是否展示正确的按钮 / 提示 / 日志
- 当前玩家与非当前玩家是否正确区分为可交互 / 只读
- 如果有 `wait` interaction，对应控件是否正确显示

### I. E2E 测试

如果该卡会影响多人同步主路径，还要补一条 E2E：

1. 两个窗口加入同一房间
2. 玩家 A 触发该卡效果
3. 玩家 B 自动收到最新状态
4. 两端界面一致显示变化结果

---

## 8. 推荐的断言顺序

每一步推荐按下面顺序断言：

1. `resp.ok`
2. `resp.interaction`
3. `resp.state.currentPlayerIndex`
4. `resp.state.players[targetPlayerIndex]`
5. `resp.state.actionSpaces`
6. `resp.state.log[0]`
7. `resp.scores`

这样做的好处是：

- 先确认命令成功与否
- 再确认交互阶段是否正确
- 再确认状态变化
- 最后确认日志和分数等附加结果

## 9. 推荐的测试文件拆分

建议每张卡至少考虑下面几类测试文件（命名以仓库现状为准）：

- `shared/cards/__tests__/CARD_ID.test.ts`
  - 简单即时效果的直接行为测试；直接调公开 effect / listener 并断言真实 flow / delta，不写定义存在性 smoke

- `server/__tests__/CARD_ID-session.test.ts`
  - 支付、选择 / pending、延迟、跨玩家和多步 flow 的 `GameSession` 集成测试

- `e2e-tests/CARD_ID.spec.ts`
  - Playwright，只在需要验证真实 UI / 多窗口同步时增加（如 `e2e-tests/C22_BasketChair.spec.ts`）

并不是每张卡都必须三层都写满，但至少要满足：

- 规则正确性由直接行为或 Session 测试覆盖，机械规则另有静态门禁
- 复杂 UI 交互有渲染或 E2E 覆盖

## 10. 一个最小示例

下面给一个最小化模板示例，实际写测试说明时请把占位符替换成真实内容。

```ts
// server/__tests__/CXX_SomeCard-session.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'

describe('CXX_SomeCard', () => {
  it('在 fishing 后给玩家额外 1 食物', () => {
    const session = new GameSession(42)
    const state = session.state
    state.currentPlayerIndex = 0
    state.players[0].resources.wood = 0
    state.players[0].resources.food = 0
    state.players[0].minorPlayed.push('CXX_SomeCard')

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.food).toBe(EXPECTED_FOOD)
    expect(resp.state.players[0].cardStates.CXX_SomeCard).toBeDefined()
    expect(['idle', 'wait']).toContain(resp.interaction.stateId)
    expect(resp.state.log[0].key).toBe('EXPECTED_LOG_KEY')
  })

  it('未打出该卡时 fishing 不触发额外效果（负向）', () => {
    const session = new GameSession(42)
    const state = session.state
    state.currentPlayerIndex = 0
    state.players[0].resources.food = 0

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.food).toBe(BASE_FISHING_FOOD)
  })
})
```

## 11. 与架构文档的关系

本模板是 `docs/ARCHITECTURE_zh.md` 中“测试分层策略”的具体落地版本。

对应关系如下：

- 架构文档负责说明测试原则
- 本文档负责说明每张卡该如何写测试说明与测试用例

如果两者冲突，以架构文档中的系统边界原则为准，再更新本文档模板。
