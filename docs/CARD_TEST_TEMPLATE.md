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

## 5. 推荐的后端接口清单

卡牌测试优先使用后端边界驱动。

### 5.1 初始化与准备

- `POST /api/game/new`
  - 新开一局 2 人游戏

- `GET /api/game/state`
  - 获取当前完整快照

- `POST /api/game/load`
  - 加载预构造测试状态

### 5.2 开发者辅助接口

- `POST /api/game/dev/play-card`
  - 快速把指定卡放入玩家已打出区

- `POST /api/game/dev/set-current-player`
  - 设置当前玩家

- `POST /api/game/dev/set-resources`
  - 设置玩家资源

- `POST /api/game/dev/set-space-taken`
  - 设置行动格占用状态

- `POST /api/game/dev/create-pasture`
  - 快速创建圈地相关前置条件

### 5.3 主交互接口

- `POST /api/game/action`
  - 放置工人

- `POST /api/game/choice`
  - 提交选择

- `POST /api/game/reorg`
  - 提交动物重整方案

- `POST /api/game/feed`
  - 提交喂食方案

- `POST /api/game/next-player`
  - 确认下一玩家

- `POST /api/game/round-end`
  - 回合结束

### 5.4 WebSocket 命令

如果测试目标是多人同步主路径，则使用：

- `createRoom`
- `joinRoom`
- `getState`
- `action`
- `choice`
- `reorg`
- `feed`
- `nextPlayer`
- `roundEnd`

## 6. 每一步必须断言哪些字段

对于卡牌测试，建议每次关键交互后都断言下面几类字段。

### 6.1 玩家状态

- `state.players[n].resources`
- `state.players[n].minorPlayed`
- `state.players[n].occupationPlayed`
- `state.players[n].improvements`
- `state.players[n].playedCards`
- `state.players[n].cardStates`
- `state.players[n].workersAvailable`
- `state.players[n].fields`
- `state.players[n].pastures`
- `state.players[n].stableTiles`
- `state.players[n].roomTiles`

### 6.2 全局状态

- `state.currentPlayerIndex`
- `state.round`
- `state.gameOver`
- `state.availableMajorImprovements`
- `state.actionSpaces[*].takenBy`
- `state.actionSpaces[*].resources`

### 6.3 交互状态

- `pending.type`
- `pending.playerIndex`
- `pending.spaceId`
- `pending.options`
- `pending.promptKey`

### 6.4 日志与分数

- `log[0].key`
- `log[0].params`
- 是否新增了目标日志
- `scores`

## 7. 卡牌测试模板

下面这份模板是每张卡测试说明都应该遵循的结构。

---

## 卡牌测试说明模板

### A. 卡牌信息

- `cardId`: `CARD_ID`
- 名称：`CARD_NAME`
- 类型：职业 / 小改良 / 大改良附带效果
- 触发时机：`TRIGGER_TIMING`
- 生效范围：自己 / 对手 / 任意玩家
- 是否产生 `pending`：是 / 否
- 是否写 `cardStates`：是 / 否

### B. 测试目标

- 验证 `EXPECTED_PRIMARY_EFFECT`
- 验证 `EXPECTED_NEGATIVE_CASE`
- 验证 `EXPECTED_LOG_BEHAVIOR`
- 验证 `EXPECTED_PENDING_BEHAVIOR`

### C. 初始状态准备

#### C.1 开局

1. 调用 `POST /api/game/new`
2. 确认当前为 2 人游戏

#### C.2 设置测试玩家

1. 调用 `POST /api/game/dev/set-current-player`
2. 指定 `playerIndex = X`

#### C.3 设置资源

1. 调用 `POST /api/game/dev/set-resources`
2. 设定：
   - `wood`
   - `clay`
   - `reed`
   - `stone`
   - `food`
   - `grain`
   - `vegetable`
   - 动物资源

#### C.4 设置卡牌

1. 调用 `POST /api/game/dev/play-card`
2. 将 `CARD_ID` 放入目标玩家已打出区
3. 如果还需要其他前置卡，也在这里一并设置

#### C.5 设置版图 / 行动格 / 特殊前置条件

按需要补充：

- 行动格是否被占据
- 玩家是否已有圈地 / 田地 / 马厩 / 房间
- 是否需要手动预置 `cardStates`
- 是否需要预设某个回合或阶段

### D. 测试步骤

#### D.1 步骤 1：触发主动作

- 调用接口：`POST /api/game/action`
- 请求体：`{ playerIndex: X, spaceId: 'ACTION_ID' }`

断言：

- `state.players[X].resources`
- `state.players[X].cardStates`
- `state.actionSpaces[*].takenBy`
- `pending`
- `log`

#### D.2 步骤 2：如果产生选择，则提交 choice

- 调用接口：`POST /api/game/choice`
- 请求体：`{ playerIndex: X, value: 'CHOICE_VALUE' }`

断言：

- `pending.type` 是否回到 `none` 或进入下一个阶段
- `state.players[X].resources`
- `state.players[X].cardStates`
- `log`

#### D.3 步骤 3：如果产生动物重整 / 喂食 / 下一玩家确认，则继续提交后续命令

按需调用：

- `POST /api/game/reorg`
- `POST /api/game/feed`
- `POST /api/game/next-player`
- `POST /api/game/round-end`

每一步都要记录：

- 请求参数
- 响应中的 `pending`
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

建议每张卡至少考虑下面几类测试文件：

- `shared/cards/__tests__/CARD_ID.test.ts`
  - 卡牌本身的核心规则测试

- `server/__tests__/CARD_ID.integration.test.ts`
  - 站在 `GameSession` 或 API 边界的集成测试

- `e2e-tests/CARD_ID.spec.ts`
  - 只在需要验证真实 UI / 多窗口同步时增加

并不是每张卡都必须三层都写满，但至少要满足：

- 规则正确性有后端边界测试
- 复杂 UI 交互有渲染或 E2E 覆盖

## 10. 一个最小示例

下面给一个最小化模板示例，实际写测试说明时请把占位符替换成真实内容。

```md
## CXX_SomeCard 测试说明

### 卡牌信息
- `cardId`: `CXX_SomeCard`
- 类型：小改良
- 触发时机：执行 `fishing` 后
- 是否产生 `pending`：否
- 是否写 `cardStates`：是

### 初始状态准备
1. `POST /api/game/new`
2. `POST /api/game/dev/set-current-player` -> `playerIndex: 0`
3. `POST /api/game/dev/set-resources` -> `playerIndex: 0, resources: { wood: 0, food: 0 }`
4. `POST /api/game/dev/play-card` -> `playerIndex: 0, cardId: 'CXX_SomeCard'`

### 步骤 1：执行 fishing
1. `POST /api/game/action` -> `{ playerIndex: 0, spaceId: 'fishing' }`

### 步骤 1 断言
- `resp.ok === true`
- `resp.state.players[0].resources.food === EXPECTED_FOOD`
- `resp.state.players[0].cardStates.CXX_SomeCard` 存在
- `resp.pending.type === 'confirmNextPlayer'`
- `resp.state.log[0].key === 'EXPECTED_LOG_KEY'`

### 负向测试
1. 不打出该卡
2. 再次执行 `fishing`
3. 断言不会产生额外效果
```

## 11. 与架构文档的关系

本模板是 `docs/ENGINE_ARCHITECTURE.md` 中“测试分层策略”的具体落地版本。

对应关系如下：

- 架构文档负责说明测试原则
- 本文档负责说明每张卡该如何写测试说明与测试用例

如果两者冲突，以架构文档中的系统边界原则为准，再更新本文档模板。
