# 卡牌测试模板

## 1. 目的

本文档用于约定 Open Agricola 中“新增或修改一张卡牌实现”时的标准测试写法。

核心原则：

- 游戏逻辑测试优先站在前后端交互边界上做
- 测试代码优先通过调用后端接口或后端命令驱动流程
- 断言以服务端返回的 `state`、`pending`、`log`、`scores` 为主
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
- 会引入 `pending`、follow-up action、额外选择、延迟效果的卡

不适用于：

- 纯样式改动
- 纯文案翻译改动
- 与卡牌无关的通用 UI 组件测试
- **Workshop / AI Designer 自定义卡的"LLM 生成代码能否跑通"测试** —— 那套独立框架见 `docs/test/llm-card-gen.md`

## 3. 测试分层约定

每张卡至少应考虑三层测试，但主次不同。

### 3.1 后端交互边界测试

这是卡牌实现的主测试层。

目标：

- 验证后端规则是否正确执行
- 验证服务端状态变更是否符合预期
- 验证 `pending`、`log`、卡牌局部状态是否正确

驱动方式：

- 直接调用 `GameSession`
- 或调用 `/api/game/*`
- 或通过 WebSocket 发送命令消息

断言对象：

- `state`
- `pending`
- `log`
- `scores`

### 3.2 前端渲染测试

这是辅助测试层。

目标：

- 验证某份服务端状态被正确渲染
- 验证按钮是否可见、控件是否禁用、日志是否显示

输入：

- 固定 `stateUpdate`
- 固定 `GameApiResponse`
- 固定 `SerializedGameState`

### 3.3 E2E 测试

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
- 是否会产生 `pending`
- 是否会修改 `cardStates`

### 4.2 测试目标

至少写清楚：

- 这张卡的正向效果是什么
- 这张卡在什么前置条件下会触发
- 这张卡在什么情况下不应触发
- 这张卡是否会写日志
- 这张卡是否会改变后续 action / flow / pending

### 4.3 初始状态准备

测试说明里必须明确：

- 从一局新的 2 人游戏开始
- 当前测试玩家是谁
- 当前回合是多少
- 玩家拥有哪些资源
- 玩家已经打出了哪些卡
- 玩家手里还有哪些卡
- 行动格占用情况
- 农场版图状态
- 是否需要预先设置 `cardStates`

### 4.4 同时机多卡反应

如果卡牌属于 action reaction listener、harvest field stage card-effect、before-end card-effect 或 extra-turn provider，且同一时机可能与另一张卡同时触发，测试必须覆盖 `trigger-select`：

- 构造至少两张同一时机可触发的卡
- 断言 pending / interaction 展示的是可选择的来源卡，而不是直接按打出区顺序执行
- 分别选择不同来源卡，断言后续 flow、状态、日志和剩余 trigger 的重算符合预期
- 覆盖 `undoStep` 或 `undoAction` 后重新派生同一 trigger-select 的场景

## 5. 推荐的后端入口清单

卡牌测试优先使用后端边界驱动。当前架构下没有任何可用的 HTTP API（除 `/api/auth/*` 与极少量只读端点外）；所有规则相关的命令都走 WebSocket 或者直接调 `GameSession` / `RoomManager` 方法。

### 5.1 三种推荐驱动方式

按从轻到重排序：

1. **直接 `new GameSession(seed?, customCards?)` + 调方法**（绝大多数 `server/__tests__/*.test.ts` 的写法）
   - 不经网络，跑得最快；最适合"卡牌效果是否触发、状态怎么变"这类断言
   - 入口方法见 §5.3
2. **`server/test-utils/createTestRoomManager()` 起一个内存 `RoomManager`**
   - 当需要验证多窗口同步、`stateUpdate` 广播、断线重连时使用
   - 收发的就是真实 `ClientCommand` / `ServerEvent`
3. **Playwright E2E（`e2e-tests/*.spec.ts`）**
   - 仅在需要验证浏览器 UI 主路径或多窗口同步时用；规则断言不放在这层

### 5.2 状态准备方式

不要假设存在 `POST /api/game/dev/*`。当前可用的状态预设方式有：

- **`GameSession.loadGame(state)`** —— 直接灌入一份手工构造的 `SerializedGameState`（`shared/game/serialization.ts`）；测试里最常用
- **WS `devSetResources` / `devSetRound` / `devDrawCard` / `devPlayCard` / `devCreatePasture`** —— 在 dev 房间里按需调整
- **直接在 GameSession 实例上 mutate**（仅限单测，不要在跨网络场景使用）：
  - 改 `session.state.players[i].resources`
  - `session.state.players[i].minorPlayed.push(CARD_ID)`
  - `session.state.actionSpaces[k].takenBy.push({ playerId, workerId })`
- **`shared/test-utils/*` helper**（如 `playMinorImprovementForTest`、`giveCardToHandForTest`）—— 用于让"卡牌已经打出 / 已经在手"成立

### 5.3 GameSession 主入口（最常用）

| 方法 | 对应的 `interaction.allowedCommands` 名 | 对应 WS `type` | 用途 |
|---|---|---|---|
| `takeAction(playerIndex, spaceId)` | `takeAction` | `action` | 放工人 / 触发主行动 |
| `takeAnytimeAction(playerIndex, actionId)` | `takeAnytimeAction` | `anytime` | 触发 anytime 卡牌效果 |
| `resolveChoice(playerIndex, value)` | `resolveChoice` | `choice` | 在 `interaction.stateId === 'choice'` 时回应 |
| `commitSelectionChoice(playerIndex, payload)` | `commitSelection` | `commitSelection` | 围栏 / 房间 / 马厩 / 犁地 / 播种 / farm-position / occupation-hand / resource selection 提交 |
| `performRoundEnd()` | — | `roundEnd` | 推进回合（一般由引擎自动触发） |
| `undoStep()` / `undoAction()` | `undoStep` / `undoAction` | `undoStep` / `undoAction` | 单步 / 整动作回退 |

> **协议名 vs 引擎名**：WS `ClientCommand.type` 与 `interaction.allowedCommands` 字符串并不完全相同（详见 `ARCHITECTURE.md §7.2`）。测试里如果直接调 `GameSession`，用左一列；如果走 WS，用右一列。

### 5.4 WebSocket 命令（若走 RoomManager 路径）

以 `shared/protocol/ws.ts` 中 `ClientCommand` 定义为准。常用：

- `createRoom` / `joinRoom` / `dissolveRoom`
- `getState`
- `action` / `choice` / `anytime`
- `roundEnd`
- `commitSelection`
- `undoStep` / `undoAction`
- `newGame` / `loadGame`
- `devSetResources` / `devSetRound` / `devDrawCard` / `devPlayCard` / `devCreatePasture`

服务端事件（`ServerEvent`）主要看 `stateUpdate`（包含 `state` / `pending` / `interaction` / `log` / `scores` 等），其它握手事件不在卡牌规则断言的关心范围内。

## 6. 每一步必须断言哪些字段

对于卡牌测试，建议每次关键交互后都断言下面几类字段。

### 6.1 玩家状态

- `state.players[n].resources`
- `state.players[n].minorPlayed` / `occupationPlayed` / `improvements`
- `getPlayedCardKeys(state.players[n])`（聚合上述三类）
- `state.players[n].cardStates[CARD_ID]?.{ flags, counts, extraData, ... }`
- `state.players[n].workers`（Worker 身份模型，每个槽含 `id` / `isActive` / `isNewborn`）
- `familySize(player)` / `workersAvailable(state, player)` / `workersAtHome(state, player)`（`shared/game/player.ts` helper，**不是字段**——直接读 `player.workers` 数组得到的是含 supply slot 的全部槽位，必须走 helper 才能得到游戏意义上的"家庭人数 / 在家可用人数"）
- `state.players[n].fields` / `pastures` / `stableTiles` / `roomTiles`
- `state.players[n].fences`（**`FenceSegment[]` 数组**，2026-04-17 由数值字段升级）
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

旧版 `PendingAction` 顶层字段已经被拆成 `pending` + `interaction` 两层，断言时优先看 `interaction`：

- `pending.type`：`none` / `choice` / `confirmNextPlayer` / `confirmPlayerSwitch` 等粗粒度阶段
- `pending.playerIndex`：当前需要响应交互的玩家
- `pending.sourceCard`：（2026-04-19 新增）触发本次 choice/farmSelect/selection 的来源卡 id；前端 `InteractionBar` 据此显示"由 {card} 触发"
- `interaction.stateId`：细粒度——`idle` / `choice` / `farmSelect` / `selection` / `animalReorg` / `harvestFeed` / `confirmNextPlayer` / `confirmPlayerSwitch`
- `interaction.allowedCommands`：当前 player 允许调用的引擎命令名白名单（不在白名单里的会被拒）
- `interaction.options`（choice 模式）：候选项数组，每项含 `value` / `labelKey` / `effectPreview?` / `sourceCard?`
- `interaction.farmSelect`（farmSelect 模式）：farmType + payload schema
- `interaction.selection`（selection 模式）：`selectionKind` / `positionFilter` / `selectableTiles`
- `interaction.promptKey` / `promptParams`：i18n key 与参数

### 6.4 日志与分数

- `log[0].key`
- `log[0].params`
- 是否新增了目标日志（避免误触发别的 listener 也写了日志）
- `scores`（`server/game-session.ts` 的 `getScores()` / `getFinalScores()`）

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
- 是否产生 `pending`：是 / 否（若是，说明 `interaction.stateId` 走的是 `choice` / `farmSelect` / `selection` 哪一种）
- 是否写 `cardStates`：是 / 否（若是，列出 `flags` / `counts` / `extraData` 的 key）
- 是否声明 `handHooks`：是 / 否（在手牌时也触发的 hook 列表，目前仅 E96 Elder 用到）
- 是否需要透传 `sourceCard`：是 / 否（卡牌触发的 choice/farmSelect/selection 都应在 pending/interaction 里带 sourceCard）

### B. 测试目标

- 验证 `EXPECTED_PRIMARY_EFFECT`
- 验证 `EXPECTED_NEGATIVE_CASE`
- 验证 `EXPECTED_LOG_BEHAVIOR`
- 验证 `EXPECTED_PENDING_BEHAVIOR`

### C. 初始状态准备

#### C.1 开局

1. `const session = new GameSession(seed)`（默认 2 人；如需 3/4 人传 `customCards` 之外的初始配置或用 `createSessionForRoom(maxPlayers)`）
2. 确认 `session.state.players.length === expectedPlayerCount`

#### C.2 设置当前玩家 / 推进到目标阶段

1. 推 `state.currentPlayerIndex = X`，或者用 `takeAction` 把无关玩家先消耗掉
2. 如需直接跳到指定回合：`state.round = R`，再按需调一次 `performRoundEnd()` 让阶段一致

#### C.3 设置资源

直接 mutate `state.players[X].resources`，例如：

```ts
state.players[0].resources = {
  wood: 0, clay: 0, reed: 0, stone: 0,
  food: 0, grain: 0, vegetable: 0,
  sheep: 0, boar: 0, cattle: 0,
}
```

如果走 RoomManager / WS，则发 `devSetResources` 命令。

#### C.4 设置卡牌

- 单测：`state.players[X].minorPlayed.push(CARD_ID)` 或 `occupationPlayed.push(...)` / `improvements.push(...)`
- 如果需要触发 `onBuy`，用 `playMinorImprovementForTest` 之类 helper 或者通过 `takeAction` 走真实路径
- 走 WS：`devPlayCard` / `devDrawCard`

#### C.5 设置版图 / 行动格 / 特殊前置条件

按需要补充：

- 行动格占用：`state.actionSpaces[k].takenBy.push({ playerIndex: X, workerId: state.players[X].workers[i].id })`
- 圈地 / 田地 / 马厩 / 房间：直接 mutate `pastures` / `fields` / `stableTiles` / `roomTiles`，或调 `commitSelectionChoice` 走真实路径
- 预置 `cardStates`：`state.players[X].cardStates[CARD_ID] = { flags: {...}, counts: {...}, extraData: {...} }`
- 预设回合 / 阶段：`state.round = R` + `performRoundEnd()`

#### C.6 Reading global `completedFeedingPhases` in tests

`state.completedFeedingPhases` 是全局收获计数（A148_Woolgrower / B086_TruffleSearcher 等"按已完成 feeding +1 容量"卡牌从此字段读取）。Session 测试无需跑完整收获 phase；直接在 setup 阶段覆盖即可：

```ts
const session = new GameSession(SEED)
const core = (session as unknown as { core: { state: GameState } }).core
core.state.completedFeedingPhases = 3   // 模拟玩家已经经历 3 次收获
core.state.players[0].minorPlayed.push('A148_Woolgrower')
// 之后 onComputeAnimalZones(player, zones, state) 读到 cap = 3
```

如果测试要验证"feeding phase 真正 +1"，跑完整收获 phase（`runHarvestPhase` 或多次 `confirmHarvestFeed`）后断言 `core.state.completedFeedingPhases` 单调递增。

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
- `resp.pending` / `resp.interaction`
- `resp.log`

#### D.2 步骤 2：如果产生选择，则提交 choice / farmSelect / selection

按 `interaction.stateId` 调对应方法：

```ts
// stateId === 'choice'
session.resolveChoice(X, 'CHOICE_VALUE')

// farm-select / selection / resource selection
session.commitSelectionChoice(X, { edges: [...] })
session.commitSelectionChoice(X, { tile: { row, col } })
session.commitSelectionChoice(X, { positions: [{ row, col }, ...] })
```

断言：

- `interaction.stateId` 是否回到 `idle` 或进入下一个交互状态
- `state.players[X].resources` / `cardStates`
- `log`

#### D.3 步骤 3：动物重整 / 喂食 / 下一玩家确认 / 回合结束

按需调用：

- `confirmAnimalReorg(X, zones)`
- `confirmHarvestFeed(X, selections)`
- `confirmNextPlayer()`
- `confirmPlayerSwitch()`
- `performRoundEnd()`（一般引擎自动触发，测试里手动调用主要用于断言"回合结束 hook 是否触发"）

每一步都要记录：

- 请求参数
- 响应中的 `pending` / `interaction`
- 响应中的关键状态变化
- 新增日志

### E. 必须断言的状态变化

请逐项写清：

- 哪个玩家的哪些资源变化
- 哪个行动格状态变化
- 是否新增 / 移除某张卡
- `cardStates[cardId]` 如何变化
- `pending` 如何变化
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
- 如果有 `pending`，对应控件是否正确显示

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
2. `resp.pending`
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
  - 卡牌本身的核心规则单测（直接调 effect / listener，或断言卡定义元数据）

- `server/__tests__/CARD_ID-session.test.ts`
  - 站在 `GameSession` 边界的集成测试（**主战场**——目前 `server/__tests__/` 下绝大多数卡牌测试都是这种命名）

- `e2e-tests/CARD_ID.spec.ts`
  - Playwright，只在需要验证真实 UI / 多窗口同步时增加（如 `e2e-tests/C022_BasketChair.spec.ts`）

并不是每张卡都必须三层都写满，但至少要满足：

- 规则正确性有后端边界测试
- 复杂 UI 交互有渲染或 E2E 覆盖

## 10. 一个最小示例

下面给一个最小化模板示例，实际写测试说明时请把占位符替换成真实内容。

```ts
// server/__tests__/CXX_SomeCard-session.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'

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
    expect(resp.interaction.stateId === 'idle' || resp.interaction.stateId === 'confirmNextPlayer').toBe(true)
    expect(resp.log[0].key).toBe('EXPECTED_LOG_KEY')
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

本模板是 `docs/ARCHITECTURE.md` 中“测试分层策略”的具体落地版本。

对应关系如下：

- 架构文档负责说明测试原则
- 本文档负责说明每张卡该如何写测试说明与测试用例

如果两者冲突，以架构文档中的系统边界原则为准，再更新本文档模板。
