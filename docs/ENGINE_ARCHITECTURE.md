# Open Agricola 架构说明

> 本文档描述项目的目标主设计，并作为后续重构与实现的基线。
> 主路径以“WebSocket 房间对局 + 后端权威状态 + 前端被动订阅渲染”为准。
> HTTP 保留为启动、调试、运维、测试和兼容通道，不再作为多人对局的主要交互链路。

## 1. 设计目标

- 多人实时同步优先：多个浏览器窗口同时连接同一房间，所有玩家看到同一局游戏的最新状态。
- 后端权威状态：只有后端可以修改 `GameState`，前端不本地执行游戏规则，不本地提交最终状态。
- 单一领域实现：行动、引擎、卡牌、回合、收获、计分统一放在 `shared/`，前后端共用同一套领域模型。
- 命令驱动：前端只发送“我要做什么”，例如放置工人、确认选择、完成喂食；后端负责校验、执行、落状态、产生日志。
- 全量快照同步：同一房间内所有客户端收到相同的 `stateUpdate` 快照，以保证各端渲染一致。
- 弱客户端：前端负责视图、交互收集和本地临时 UI 状态，不负责规则裁定。

## 2. 总体拓扑

```text
浏览器窗口 p1 / p2 / observer
        │
        │ WebSocket /ws   ← 主链路
        ▼
server/room-manager.ts
  ├─ 房间路由
  ├─ 连接管理
  ├─ 玩家绑定
  └─ 广播 stateUpdate
        │
        ▼
server/game-session.ts
  ├─ 权威 GameState
  ├─ PendingAction
  ├─ Engine / HookDispatcher
  ├─ 历史快照 / undo
  └─ 结构化日志 / 结算
        │
        ▼
shared/
  ├─ engine/   节点树推进
  ├─ actions/  行动定义与效果
  ├─ logic/    回合、收获、计分、状态
  ├─ cards/    卡牌与扩展
  └─ game/     核心类型

HTTP /api/*
  ├─ 健康检查
  ├─ 房间列表 / 运维接口
  ├─ 新局 / 加载 / 调试
  └─ 补拉快照 / 测试辅助
```

## 3. 分层结构

```text
shared/ (前后端共用，零 React 依赖)
  ├─ engine/          引擎核心（节点树、推进、snapshot/restore）
  ├─ actions/         行动定义、效果、Hook、内部动作
  ├─ logic/           初始状态、回合推进、收获、计分、克隆
  ├─ cards/           卡牌定义、卡牌扩展、卡牌特效
  ├─ game/            GameState / PlayerState / Pending 等核心类型
  └─ i18n/            多语言文案键

server/ (后端运行时)
  ├─ index.ts         HTTP + WS 服务器装配入口
  ├─ room-manager.ts  房间管理、连接绑定、消息路由、广播
  ├─ game-session.ts  权威状态容器，命令执行中心
  ├─ game-router.ts   HTTP 兼容接口、调试接口、快照接口
  └─ *-validation.ts  纯规则校验模块

src/ (前端)
  ├─ app/             顶层容器，房间接入、玩家视角、页面编排
  ├─ hooks/           WS 连接、状态同步、临时选择状态、UI 编排
  ├─ services/        传输层封装（WS 为主，HTTP 为辅）
  ├─ components/      纯渲染组件
  └─ types/           UI 层临时类型
```

## 4. 核心设计原则

### 4.1 后端是唯一真相来源

- 任意一局游戏在任意时刻只存在一份可写的权威 `GameState`。
- 这份状态只存在于后端 `GameSession` 中。
- 前端接收到的是状态快照副本，用于渲染，不允许把本地状态当作真相回写。

### 4.2 同一房间只允许一条命令序列

- 一个房间对应一个 `GameSession`。
- 房间内所有玩家命令都被路由到同一个 `GameSession`。
- `GameSession` 负责串行处理命令，避免两个玩家同时写状态造成竞争。
- 如果后续命令执行引入异步逻辑，必须在 `room-manager` 层增加“单房间命令队列”，仍保持串行提交。

### 4.3 全量快照优先于增量 patch

- 首版多人同步优先选择“全量快照广播”，而不是复杂的 diff/patch。
- 原因是行动、卡牌、pending、日志、收获阶段都可能跨多个字段变化，全量快照更稳定，也更容易调试和回放。
- 客户端收到新快照后整体替换领域状态，只保留本地 UI 临时态。

#### 4.3.1 当前实现（Phase 1 + Phase 2 联调）

Phase 1 已实现全量快照同步，协议类型定义在 `shared/protocol/` 下：

- `shared/protocol/game.ts`：`GameSyncPayload`、`StateUpdateCause`、`StateUpdateEnvelope`
- `shared/protocol/ws.ts`：`ClientCommand`（含 `commitFarm`/`undoStep`/`undoAction`/`newGame`/`loadGame`/`devCreatePasture`）、`ServerEvent`、`RoomSummary`
- `shared/game/serialization.ts`：`serializeState()`、`rehydrateState()`、`SerializedGameState`

`room-manager.ts` 使用 `StateUpdateEnvelope`（含单调递增 `version` + `StateUpdateCause`）广播快照。前端通过 `GameTransport` 接口的 `onSnapshot` 回调接收。

Phase 2 前端联调已完成：
- `GameContainerApi` 通过 URL 参数 `?transport=ws` 切换 WS 模式。
- P1（`?player=p1&transport=ws`）自动创建房间并等待，P2（`?player=p2&transport=ws`）通过 `/api/rooms` 自动发现并加入。
- 房间满员后后端广播 `gameStarted`，前端自动进入游戏。
- `WsGameTransport` 的 `commitFarm`/`undoStep`/`undoAction`/`newGame`/`loadGame`/`devCreatePasture` 均走 WS，dev 操作不再 HTTP 降级。
- `newGame` 支持可选 `seed` 参数，HTTP `/api/game/new` 与 WS `newGame` 均支持；`GameSession` 构造函数接受 `number` 类型 seed。
- 双窗口实时同步验证通过（P1 操作后 P2 立即看到状态变化）。

#### 4.3.2 如果后续要支持 patch，同步协议应如何设计

如果后续房间规模、观战人数、日志长度或网络开销成为瓶颈，可以在“全量快照优先”的基础上升级为“`snapshot + patch` 混合同步协议”。

核心原则：

- `snapshot` 永远作为保底方案，`patch` 只是优化层，不是唯一同步手段。
- patch 只针对“可序列化的状态快照”计算，不能直接对服务端运行时对象做 patch。
- 同一个命令提交，只产生一个新版本号；该版本要么广播完整 `snapshot`，要么广播基于旧版本的 `patch`。
- 客户端 patch 应用失败时，必须立即回退到 `getState` 补拉完整快照。

建议新增“同步版本号”概念：

- 每个房间维护单调递增的 `version`。
- 每次命令成功提交后，`version += 1`。
- `version` 属于同步层元数据，不属于领域 `GameState` 本身。

推荐同时定义更新原因：

```ts
type StateUpdateCause = {
  kind:
    | 'createRoom'
    | 'joinRoom'
    | 'action'
    | 'choice'
    | 'reorg'
    | 'feed'
    | 'nextPlayer'
    | 'roundEnd'
    | 'undoStep'
    | 'undoAction'
    | 'resync'
  actorPlayerIndex?: number
  requestId?: string
}
```

推荐的混合同步 envelope：

```ts
type StateUpdateEnvelope =
  | {
      type: 'stateUpdate'
      roomId: string
      version: number
      sync: 'snapshot'
      state: SerializedGameState
      pending: PendingAction
      scores: Record<string, unknown> | null
      historyLength: number
      hasActionStartSnapshot: boolean
      cause: StateUpdateCause
      emittedAt: number
    }
  | {
      type: 'stateUpdate'
      roomId: string
      version: number
      baseVersion: number
      sync: 'patch'
      patch: JsonPatchOperation[]
      pending: PendingAction
      scores: Record<string, unknown> | null
      historyLength: number
      hasActionStartSnapshot: boolean
      cause: StateUpdateCause
      emittedAt: number
    }
```

其中：

- `version`：本次更新后的目标版本
- `baseVersion`：patch 所基于的旧版本
- `sync`：标记当前是完整快照还是增量 patch
- `cause`：说明这次更新由哪个命令触发，便于调试和埋点
- `pending` / `scores` / `historyLength`：即使使用 patch，也建议作为 top-level 字段始终带上，避免客户端再从 patch 里二次推断

#### 4.3.3 patch 的推荐生成方式

优先推荐两阶段做法：

1. 先把服务端运行时状态裁剪为 `SerializedGameState`
2. 再对“命令前快照”和“命令后快照”计算 patch

原因：

- 运行时对象里可能有函数、Engine snapshot、history 等不可传输字段
- 网络协议只关心前端真正要渲染的内容
- patch 生成逻辑会更稳定，也更容易做回放和测试

patch 格式有两种可选方案：

- 标准 `JSON Patch`（RFC 6902）：落地快，通用工具多，适合首版 patch 化
- 领域化 patch：如 `replacePlayer`、`setActionSpaceTaken`、`appendLog`、`setPending`，可读性更强，后续性能优化更好

建议策略：

- 第一阶段先上 `JSON Patch`
- 等后续发现热点路径，再把高频操作演进成领域 patch

#### 4.3.4 什么时候必须回退到 snapshot

即使支持 patch，下面这些场景仍建议直接广播完整快照：

- 玩家新加入房间
- 连接断开后重连
- 客户端显式 `getState`
- `newGame` / `loadGame`
- `undoStep` / `undoAction`
- 回合切换、收获结算、批量日志插入导致 patch 过大
- patch 构建失败
- 客户端本地版本号与服务端 `baseVersion` 不一致

#### 4.3.5 客户端应用 patch 的规则

客户端必须维护 `lastAppliedVersion`，并遵循以下规则：

1. 收到 `snapshot` 时，直接整体替换，并更新 `lastAppliedVersion = version`
2. 收到 `patch` 时，只有当 `lastAppliedVersion === baseVersion` 才允许应用
3. patch 应用成功后，更新 `lastAppliedVersion = version`
4. patch 应用失败、版本不连续、字段不合法时，立即发起 `getState`

这样设计的好处是：

- patch 可以做性能优化
- snapshot 仍然保证系统最终一致性
- 断线、乱序、版本跳跃都可以通过一次完整快照恢复

### 4.4 前端不做乐观提交

- 点击行动格后，前端只发送命令，不立即本地修改行动格占用、资源数量或 pending。
- 必须等待后端返回并广播 `stateUpdate` 后，前端再统一渲染。
- 这样可以避免双窗口视图不一致，也能避免本地“先改后回滚”的复杂恢复逻辑。

## 5. 关键运行时对象

### 5.1 Room

`Room` 表示一个多人对局容器，核心职责：

- 持有唯一 `GameSession`
- 维护当前连接的玩家列表
- 维护房间 ID、玩家上限、连接状态
- 负责把某个玩家发来的命令路由到该房间的 `GameSession`

建议结构：

```ts
type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
}
```

### 5.2 RoomPlayer

`RoomPlayer` 是房间内一个连接实例，不是领域里的 `PlayerState` 本体。它主要承载：

- WebSocket 连接对象
- 在该房间内的 `playerIndex`
- 显示名、连接状态
- 未来可扩展的重连 token / session token

### 5.3 GameSession

`GameSession` 是整个后端权威模型的核心，职责包括：

- 持有唯一 `GameState`
- 持有当前 `pending` 状态
- 持有 `Engine` 实例和运行上下文
- 执行所有命令式接口
- 维护 undo 历史
- 生成结构化日志
- 在游戏结束时计算分数

### 5.4 SessionResponse

`GameSession` 对外统一返回 `SessionResponse`：

```ts
type SessionResponse = {
  ok: boolean
  state: GameState
  pending: PendingAction
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: ScoreResult
  error?: string
}
```

这个结构同时适用于：

- WS 广播 `stateUpdate`
- HTTP 查询当前对局快照
- 调试/测试场景的结果回传

## 6. 后端权威状态如何维护

### 6.1 状态生命周期

每个房间创建时生成一个新的 `GameSession`：

1. 初始化 `GameState`
2. 注册行动定义、内部动作、Hook、卡牌扩展
3. 准备 `pending = none`
4. 等待玩家通过 WS 连接进入房间

从这一刻起，这局游戏的所有状态修改都必须经由 `GameSession` 暴露的方法，例如：

- `takeAction()`
- `resolveChoice()`
- `confirmAnimalReorg()`
- `confirmHarvestFeed()`
- `confirmNextPlayer()`
- `performRoundEnd()`
- `undoStep()`
- `undoAction()`

### 6.2 状态修改的唯一入口

主设计要求：

- `room-manager` 只负责路由消息，不直接修改游戏状态
- 前端永远不能直接提交最终状态对象
- 纯校验函数只能返回“是否合法”和“规范化结果”，不能直接写入 `GameSession`

换句话说，所有真正写状态的动作，都应当发生在 `GameSession` 的命令处理函数内部。

### 6.3 一次命令的标准执行过程

以“玩家放置一个工人”为例：

```text
客户端发送 action 命令
  → room-manager 根据 roomId / 连接上下文找到 Room
  → Room.session.takeAction(playerIndex, spaceId)
  → GameSession 校验当前玩家、行动开放性、行动格占用、卡牌 Hook
  → GameSession 推进 Engine
  → Engine 执行动作与连锁流程
  → GameSession 更新 pending / log / history / score
  → 返回 SessionResponse
  → room-manager 广播 stateUpdate 给房间所有连接
```

### 6.4 为什么必须由后端维护权威状态

这样做有五个直接收益：

1. 规则一致性。所有客户端都基于同一套服务器规则执行，不会出现某个浏览器本地逻辑过期。
2. 多人冲突可控。只有后端能判定当前轮到谁、行动位是否已被占据、收获阶段是否可确认。
3. undo 可实现。历史快照只保留在后端，回滚不会依赖任意一个客户端本地历史。
4. 日志可信。行动日志、卡牌日志、收获日志都来自同一次权威执行。
5. 观战/重连简单。任何客户端只要重新拉取当前快照，就能回到正确状态。

### 6.5 Pending 也属于权威状态的一部分

多人同步里，`pending` 不是前端 UI 状态，而是服务端规则状态。

例如：

- 玩家需要从多个选项中选择一个改良
- 玩家需要进行动物重整
- 收获阶段需要确认喂食
- 行动完成后需要确认下一玩家

这些都必须由后端决定，并作为 `pending` 广播给所有客户端。

广播后的表现是：

- 当前操作者看到可交互控件
- 其他玩家看到只读的等待态
- 所有人看到的是同一个 `pending` 语义，不存在“某端还在选择，另一端已经结束”的分叉

### 6.6 历史与撤销

`GameSession` 需要维护：

- 步级历史 `history`
- 整个行动起点快照 `actionStartSnapshot`
- 当前活跃行动、活跃玩家、引擎 snapshot

撤销逻辑必须完全在后端进行：

- `undoStep()`：恢复到上一步
- `undoAction()`：恢复到当前行动开始前

撤销成功后，同样通过 `stateUpdate` 广播给房间中的所有玩家窗口。

## 7. WebSocket 作为主交互链路

### 7.1 为什么 WebSocket 是主设计

多人农业对局不是“请求一次、刷新一次”的单人页面，而是：

- 同一局游戏有多个同时在线视图
- 每一步操作都要立刻同步给其他玩家
- 待确认阶段需要所有窗口同时感知
- 断线重连后要快速恢复

因此主交互链路应当是：

- 长连接
- 事件推送
- 服务端主动广播

WebSocket 比轮询 HTTP 更适合这个场景。

### 7.2 房间模型

推荐的房间流程如下：

1. 客户端连接 `ws://localhost:5175/ws`
2. 首位玩家发送 `createRoom`
3. 服务端创建 `Room` 和 `GameSession`
4. 其他玩家发送 `joinRoom`
5. 所有玩家加入后，服务端发送 `gameStarted`
6. 同时推送当前 `stateUpdate`

客户端消息：

```ts
{ type: 'createRoom', name?: string, maxPlayers?: number }
{ type: 'joinRoom', roomId: string, name?: string }
{ type: 'getState' }
{ type: 'action', spaceId: string }
{ type: 'choice', value: string }
{ type: 'reorg', zones: [...] }
{ type: 'feed', selections: [...] }
{ type: 'nextPlayer' }
{ type: 'roundEnd' }
{ type: 'undoStep' }
{ type: 'undoAction' }
```

服务端消息：

```ts
{ type: 'roomCreated', roomId: string, playerIndex: number }
{ type: 'roomJoined', roomId: string, playerIndex: number }
{ type: 'gameStarted' }
{ type: 'stateUpdate', state, pending, scores? }
{ type: 'playerDisconnected', playerIndex: number }
{ type: 'error', error: string }
```

### 7.3 广播模型

`room-manager` 在收到任何会改变状态的命令后，都遵循同一个流程：

1. 找到房间
2. 校验发送者已经绑定该房间
3. 调用 `room.session.<command>()`
4. 得到 `SessionResponse`
5. 将状态序列化为可传输快照
6. 广播给房间内所有连接

注意，“广播给房间所有连接”是这里最关键的设计点。

这意味着：

- 操作者自己的窗口，不再依赖请求返回值单独更新
- 其他玩家窗口，也不需要额外轮询
- 所有窗口都基于同一条 `stateUpdate` 完成更新

### 7.4 为什么广播同一份快照给所有玩家

因为同一个动作可能同时影响：

- 行动格占用
- 资源数量
- 出牌区
- 当前玩家索引
- round / harvest 阶段
- pending 选择
- 日志
- 分数

如果不同窗口各自推导这些变化，很容易产生分叉。
而广播同一份服务端快照，就能保证所有窗口总是收敛到同一个结果。

### 7.5 状态序列化边界

`GameState` 中的行动位定义包含函数，例如：

- `canBeExecutedByPlayer`
- `execute`
- `resolveChoice`
- `flow`

这些函数不能直接通过 WS 发送给前端。

因此服务端在广播前需要执行一次序列化裁剪：

- 去掉不可序列化的函数
- 保留行动位的静态信息、资源、占用状态
- 保留 `pending`、`scores`、`log`

前端收到快照后，再用本地模板重新 hydrate 成可渲染状态。

### 7.6 推荐的服务端通知格式

多人同步里，后端发给多个前端的消息，建议统一成“事件 envelope”。

原则：

- 房间级广播消息，尽量对房间内所有客户端保持完全一致
- 面向单个客户端的差异信息，只放在 `roomCreated` / `roomJoined` / `error` 这类单播消息里
- `stateUpdate` 必须是房间内共享视图，不按玩家裁剪

**已实现的服务端事件定义**（`shared/protocol/ws.ts`）：

```ts
type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error: string }
  | { type: 'roomCreated'; roomId: string; playerIndex: number }
  | { type: 'roomJoined'; roomId: string; playerIndex: number }
  | { type: 'gameStarted' }
  | { type: 'playerDisconnected'; playerIndex: number }
```

其中 `StateUpdateEnvelope` 即 `shared/protocol/game.ts` 中定义的全量快照广播消息。

其中最关键的是 `stateUpdate`：

- 它是多人同步的唯一权威更新事件
- 它要明确告诉客户端“这是完整快照还是 patch”
- 它要带上 `version`、`pending`、`scores`、undo 相关字段
- 它最好带 `cause`，方便前端调试“这次更新是谁触发的”

#### 7.6.1 snapshot 广播示例

```json
{
  "type": "stateUpdate",
  "roomId": "ab12cd",
  "version": 42,
  "sync": "snapshot",
  "state": {
    "round": 5,
    "currentPlayerIndex": 1,
    "players": [],
    "actionSpaces": [],
    "log": [],
    "roundActionOrder": [],
    "gameSeed": 123456,
    "availableMajorImprovements": [],
    "futureMeeples": [],
    "pendingFutureMeeples": [],
    "gameOver": false,
    "workPhaseObtainedResources": {}
  },
  "pending": { "type": "choice", "playerIndex": 1, "spaceId": "fishing", "options": [] },
  "scores": null,
  "historyLength": 3,
  "hasActionStartSnapshot": true,
  "cause": { "kind": "action", "actorPlayerIndex": 1, "requestId": "req-93" },
  "emittedAt": 1770000000000
}
```

#### 7.6.2 patch 广播示例

```json
{
  "type": "stateUpdate",
  "roomId": "ab12cd",
  "version": 43,
  "baseVersion": 42,
  "sync": "patch",
  "patch": [
    { "op": "replace", "path": "/currentPlayerIndex", "value": 0 },
    { "op": "replace", "path": "/players/1/resources/wood", "value": 2 },
    { "op": "replace", "path": "/actionSpaces/4/takenBy", "value": "p2" },
    { "op": "add", "path": "/log/0", "value": { "key": "log.action", "params": { "player": "P2" } } }
  ],
  "pending": { "type": "confirmNextPlayer", "nextPlayerIndex": 0 },
  "scores": null,
  "historyLength": 4,
  "hasActionStartSnapshot": true,
  "cause": { "kind": "choice", "actorPlayerIndex": 1, "requestId": "req-94" },
  "emittedAt": 1770000001000
}
```

### 7.7 广播与单播的边界

建议明确区分两类消息：

- 单播消息：只发给触发者，例如 `roomCreated`、`roomJoined`、请求级 `error`
- 广播消息：发给整个房间，例如 `gameStarted`、`stateUpdate`、`playerDisconnected`

尤其是 `stateUpdate`，必须保证：

- 同一个房间内所有客户端收到的是同一份更新内容
- 不要对不同玩家发送不同结构的“局部状态”
- 视角差异只在前端渲染时根据 `playerIndex` / `playerId` 解释

## 8. 前端如何接收并更新多个玩家界面

### 8.1 前端状态分成两类

前端需要区分两类状态：

1. 服务器快照状态
   - `state`
   - `pending`
   - `scores`
   - 连接状态

2. 本地 UI 临时状态
   - 鼠标 hover
   - 当前打开的面板
   - 圈地/房间/播种的临时选择
   - 当前输入框内容

规则是：

- 服务器快照状态只能被 `stateUpdate` 替换
- 本地 UI 临时状态可以自由管理，但不能被当作真实游戏状态

### 8.2 前端同步链路

推荐的前端更新流程：

```text
浏览器连接房间
  → 建立 WebSocket
  → 收到 roomJoined / gameStarted
  → 收到 stateUpdate
  → useGameSync 进行 hydrate
  → React store 整体替换 state/pending/scores
  → 页面重渲染
```

收到 `stateUpdate` 后，前端应该：

1. 用 `normalizeState()` 归一化领域状态
2. 用 `createActionSpaces()` 重新挂接本地行动模板
3. 用服务端返回的 `resources` / `takenBy` 覆盖模板运行时字段
4. 替换当前 store 中的 `state`、`pending`、`scores`

这是一个“整体替换”过程，而不是 field-by-field merge。

### 8.3 为什么要整体替换而不是局部 merge

因为一次行动可能触发：

- 主行动
- 卡牌 hook
- 后续选择
- 自动收获子阶段
- 回合结束
- 新回合开始

如果前端只局部 merge 某几个字段，会遗漏很多隐含变化。
整体替换更简单，也更接近“后端快照即真相”的模型。

### 8.4 多玩家窗口如何表现

假设开了两个浏览器窗口：

- `?player=p1`
- `?player=p2`

它们同时连接到同一个房间。

当玩家 1 点击行动格时：

1. p1 窗口发送 `action`
2. 后端更新权威状态
3. 后端广播 `stateUpdate`
4. p1、p2 同时收到同一份快照
5. 两个窗口都重新渲染

渲染结果会不同，但来源是同一份数据：

- p1 视角：如果轮到自己，显示可交互按钮
- p2 视角：同样收到新状态，但显示为只读等待

这正是“同一份状态，不同视角渲染”的关键。

### 8.5 当前操作者如何判断

前端是否允许交互，不应该看“我刚刚是不是点击了按钮”，而应该看：

- `state.currentPlayerIndex`
- `pending.type`
- `pending.playerIndex`
- 本地窗口绑定的 `playerIndex` / `playerId`

只有当服务器快照表明“现在轮到我，且当前 pending 也属于我”时，前端才启用操作控件。

### 8.6 收到远端更新后如何处理本地临时选择

例如玩家在圈地、房间建造、播种界面中本地选了一些格子，此时另一条服务器更新到达。

前端应该：

- 先完整替换服务器状态
- 然后检查本地临时选择是否仍合法
- 如果不再合法，则清空本地临时选择并提示用户重新选择

这可以避免用户基于过期快照继续操作。

### 8.7 断线重连

断线重连时，前端必须执行一次显式补同步：

```text
socket reconnect
  → 重新 joinRoom / 恢复房间上下文
  → 发送 getState
  → 收到最新 stateUpdate
  → 整体替换本地 store
```

设计要求是：

- 前端不要依赖本地缓存恢复权威状态
- 断线期间错过的所有事件，都以一次最新快照重新收敛

## 9. 典型流程示例

### 9.1 放置工人

```text
玩家 A 点击行动格
  → 前端发送 { type: 'action', spaceId }
  → room-manager 找到该玩家所在 Room
  → Room.session.takeAction(playerIndex, spaceId)
  → GameSession:
       - 校验轮次与占用
       - 推进引擎
       - 触发 Hook / 卡牌效果
       - 生成 pending 或结束行动
       - 写 log / history
  → 返回 SessionResponse
  → room-manager 广播 { type: 'stateUpdate', state, pending, scores? }
  → 所有玩家窗口收到后统一更新
```

### 9.2 选择分支

```text
玩家 A 的行动产生 choice pending
  → 后端广播 stateUpdate(pending=choice, playerIndex=A)
  → 所有窗口进入相同的等待状态
  → 只有 A 窗口展示可点击选项
  → A 发送 { type: 'choice', value }
  → GameSession.resolveChoice()
  → 后端再次广播最新 stateUpdate
  → 所有窗口同步收敛
```

### 9.3 动物重整 / 收获喂食

这些流程与普通 `choice` 相同，本质上都是“服务端持有 pending，客户端提交后续命令”。

区别只是 payload 更复杂，例如：

- `reorg` 发送区域分配方案
- `feed` 发送资源喂食方案

但它们仍然遵循同一个原则：

- 服务端校验
- 服务端落状态
- 服务端广播

## 10. HTTP 在新架构中的角色

HTTP 不再承担多人对局主链路，但仍然重要：

### 10.1 保留用途

- `GET /api/health`：健康检查
- `GET /api/rooms`：房间列表
- `GET /api/game/state`：补拉当前快照
- `POST /api/game/new`：创建新对局或测试重置
- `POST /api/game/load`：加载测试状态
- `POST /api/game/dev/*`：开发者调试与 E2E 场景布置

### 10.2 设计边界

- HTTP 兼容接口返回的结构应与 `SessionResponse` 保持一致
- HTTP 主要用于运维、测试、调试，不应成为多人实时交互的主要同步方式
- 如果保留 `validate` 接口，它必须是纯校验接口，不能直接写权威状态

## 11. 共享层在多人架构中的作用

`shared/` 是整个项目的一致性基础：

- `shared/engine/*`：定义行动 flow 如何推进
- `shared/actions/*`：定义主动作、内部动作和原子效果
- `shared/logic/*`：定义回合、收获、计分和状态工具
- `shared/cards/*`：定义卡牌、卡牌 Hook、卡牌效果
- `shared/game/types.ts`：定义 `GameState`、`PlayerState`、资源、日志、pending 等核心类型

后端真正执行规则时用的是这套共享逻辑。
前端渲染和 hydrate 时也依赖同一套类型与模板。

因此：

- 规则只写一次
- 行为语义只定义一次
- 测试可以围绕共享层直接构建

### 11.1 游戏状态的定义方式

游戏状态建议分成三层：

1. 领域状态 `GameState`
2. 网络传输状态 `SerializedGameState`
3. 会话私有运行时状态 `GameSessionRuntime`

它们的边界如下：

- `GameState`：表达一局游戏在规则意义上的真实状态
- `SerializedGameState`：表达前端真正需要渲染和同步的 JSON 快照
- `GameSessionRuntime`：后端执行命令时需要，但不应广播给前端的运行时信息

一个重要原则是：

- 同步版本号、历史快照、Engine snapshot、房间连接信息，不应该混进领域 `GameState`
- 它们属于同步层或会话层元数据

### 11.2 领域状态 `GameState`

按当前类型设计，`GameState` 至少应覆盖这些信息：

- 对局阶段：`round`、`currentPlayerIndex`、`gameOver`
- 玩家列表：`players`
- 行动区运行态：`actionSpaces`
- 游戏日志：`log`
- 轮次编排：`roundActionOrder`
- 大改良公共区：`availableMajorImprovements`
- 延迟获得家庭成员：`futureMeeples`、`pendingFutureMeeples`
- 工作阶段统计：`workPhaseObtainedResources`

其中 `ActionSpaceState` 表示行动格的可变运行时部分，至少包含：

```ts
type ActionSpaceState = {
  id: string
  resources: Resource
  takenBy: string | null
}
```

推荐结构：

```ts
type GameState = {
  round: number
  currentPlayerIndex: number
  players: PlayerState[]
  actionSpaces: ActionSpaceState[]
  log: LogEntry[]
  roundActionOrder: (string | null)[]
  gameSeed: number
  availableMajorImprovements: string[]
  futureMeeples: FutureMeeple[]
  pendingFutureMeeples: FutureMeepleRequest[]
  gameOver: boolean
  workPhaseObtainedResources: Record<string, Partial<Resource>>
}
```

这里有一个推荐的细化点：

- 运行时最好将 `ActionSpaceDefinition` 与 `ActionSpaceState` 分离
- 规则函数属于 definition
- `resources` / `takenBy` 属于 state

这样网络传输时就不需要再从“带函数的行动位对象”里剥离字段。

### 11.3 玩家状态 `PlayerState`

`PlayerState` 建议按领域语义分组理解：

- 身份信息：`id`、`name`、`color`
- 基础经营信息：`resources`、`familySize`、`workersAvailable`、`rooms`、`houseType`
- 农场版图：`fields`、`roomTiles`、`stableTiles`、`fenceSegments`、`pastures`
- 动物安置：`houseAnimalType`、`houseAnimalCount`、`stableAnimals`、`newbornCount`
- 已打出卡牌：`improvements`、`minorPlayed`、`occupationPlayed`、`playedCards`
- 手牌：`minorHand`、`occupationHand`
- 持续性效果：`majorEffects`、`activeModifiers`
- 卡牌局部状态：`cardStates`

这组结构需要满足两个要求：

- 足够完整，能独立描述一个玩家的完整农场状态
- 足够稳定，便于广播、补同步、录像和回放

### 11.4 网络传输状态 `SerializedGameState`

前端收到的不是完整运行时对象，而是“可序列化版本”的状态。

`SerializedGameState` 的设计要求：

- 完全 JSON 化
- 不包含函数
- 不包含 Engine snapshot
- 不包含服务端 undo history
- 不包含房间连接对象

推荐形式：

```ts
type SerializedActionSpace = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number
  players?: number[]
  gainPerRound: Partial<Resource>
  resources: Resource
  takenBy: string | null
}

type SerializedGameState = Omit<GameState, 'actionSpaces'> & {
  actionSpaces: SerializedActionSpace[]
}
```

如果某些字段只服务于后端恢复，例如 `roundStartSnapshot`，建议不要在每次 `stateUpdate` 中携带，而是保留在服务端。

### 11.5 `PendingAction` 与结构化日志

除了 `GameState` 本体，前端还依赖两类同步对象：

- `PendingAction`
- `LogEntry[]`

`PendingAction` 描述“当前还有什么后续命令必须完成”。
它不是前端临时 UI 状态，而是后端规则态。

推荐结构：

```ts
type PendingAction =
  | { type: 'none' }
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number; feedQueue?: { index: number; remaining: number }[] }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
```

`LogEntry` 则使用结构化方式存储：

- `key`：i18n key
- `params`：渲染参数

这样日志可以跨语言复用，也便于测试断言。

### 11.6 卡牌特殊效果，如何设计 Hook 点

卡牌特殊效果建议分成三层 Hook：

1. 行动生命周期 Hook
2. 回合/阶段型卡牌 Hook
3. 作用域过滤与排序规则

#### 11.6.1 行动生命周期 Hook

行动生命周期 Hook 负责拦截或扩展某个 action 的执行过程。

推荐沿用以下 phase：

- `isDoable`：改变行动是否可执行
- `computeReplace`：把一个行动替换成另一个行动
- `computeCosts`：调整支付成本
- `computeArgs`：追加选项、额外参数
- `before`：主动作执行前
- `during`：主动作执行中
- `immediatelyAfter`：主动作完成后立刻触发
- `after`：整个动作收尾阶段触发

推荐上下文：

```ts
type ActionHookContext = {
  state: GameState
  player: PlayerState
  space: ActionSpaceState
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
}
```

推荐返回值：

```ts
type ActionHookResult = {
  doable?: boolean
  actionId?: string
  extraOptions?: ActionChoiceOption[]
  followUpActions?: string[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  sourceCard?: string
  logKey?: string
  logParams?: Record<string, unknown>
}
```

这样可以覆盖常见卡牌能力：

- 改写行动可用性
- 折扣、替代支付
- 额外获得资源
- 添加跟随动作
- 注入额外选择

#### 11.6.2 回合/阶段型卡牌 Hook

有些卡牌效果不依赖某个 action，而依赖阶段事件。
这类效果建议用显式生命周期 Hook 表达，例如：

- `onBuy`
- `onRoundStart`
- `onHarvest`
- `onRoundEnd`
- `onReturnHome`

这类 Hook 应由 `GameSession` 在明确的阶段切点统一触发，而不是分散在前端页面或 HTTP 接口里。

#### 11.6.3 作用域与过滤

卡牌 Hook 不仅要看 action 和 phase，还要看“这个效果作用于谁”。

推荐支持三种 scope：

- `player`：只有持牌玩家自己的动作会触发
- `opponent`：只监听对手动作
- `any`：任意玩家动作都可触发

这样可以支持：

- 自己打出卡后自己的持续效果
- 对手动作触发自己的反应卡
- 全局被动效果

#### 11.6.4 Hook 的设计约束

为了避免卡牌系统失控，Hook 设计需要遵循这些约束：

- 卡牌特效尽量写在卡牌文件内部，不要把卡牌 ID 判断散落在核心路径
- Hook 必须在后端命令执行期间触发，不能放到前端补逻辑
- Hook 执行顺序必须稳定，建议按 `order` 再按 `id` 排序
- Hook 应尽量同步、确定性，不依赖浏览器状态
- Hook 需要能被单元测试直接调用或间接验证

#### 11.6.5 卡牌局部状态的保存

需要计数器、标记或临时上下文的卡牌，建议把局部状态放在：

```ts
player.cardStates[cardId]
```

例如：

- 卡上累积的木头、食物、动物
- 某张卡本回合是否已触发
- 某张卡的附加计数器

但对于“等待玩家下一步选择”的复杂卡牌交互，推荐再抽象一层显式 continuation，而不是长期依赖通用魔法字段。

例如可设计：

```ts
type CardContinuation = {
  cardId: string
  kind: 'choice' | 'delayedEffect'
  payload: Record<string, unknown>
}
```

然后把它并入服务端 `pending` 模型中，而不是让某张卡偷偷往共享槽位里塞临时数据。

#### 11.6.6 什么时候该新增 Hook 点

只有在下面几种情况下才应该新增新的 Hook 点：

- 现有 phase 无法准确表达语义
- 多张卡会复用这一扩展点
- 该扩展点能稳定地被测试和文档化

如果只是某一张卡的特殊分支，优先考虑：

- 复用现有 Hook
- 返回 `flow` 或 `followUpActions`
- 使用卡牌自己的局部状态

而不是立刻修改主路径或增加新的全局特殊判断

## 12. 建议的前端模块职责

为了让 WS 主路径更清晰，前端建议拆成三层：

### 12.1 房间连接层

职责：

- 建立/关闭 WebSocket
- create/join room
- 发送命令
- 接收 `stateUpdate`
- 处理重连与错误

可落在：

- `src/services/` 的 WS transport（`GameContainerApi` 内联 `useTransportSetup` 管理连接）

### 12.2 同步状态层

职责：

- 把服务端快照 hydrate 成前端可渲染状态
- 持有 `state` / `pending` / `scores`
- 在收到新快照时整体替换

可落在：

- `src/hooks/useGameSync.ts`

### 12.3 视图编排层

职责：

- 根据 `viewPlayerId` / `playerIndex` 计算当前窗口是否可交互
- 管理本地 UI 临时状态
- 决定何时展示选择条、开发面板、只读提示

可落在：

- `src/app/GameContainerApi.tsx`
- 或后续演进后的房间容器组件

## 13. 测试策略

新的主设计应当围绕“后端权威 + WS 广播”来测试。

### 13.1 测试分层原则

由于当前架构已经明确前后端分离，测试也应当按“系统边界”拆开，而不是把所有验证都堆到浏览器 UI 层。

建议分成三层：

1. 后端交互边界测试
2. 前端渲染测试
3. 多端联机 E2E 测试

其中最重要的一条是：

- 卡牌实现和游戏规则测试，应优先站在“后端交互边界”上测试
- 前端渲染是否正确、控件是否展示、文案是否可见，应作为独立测试维度处理

这样分层的原因是：

- 游戏规则的权威真相在后端
- `GameSession` / HTTP / WebSocket 命令链路才是状态真实变化的入口
- 前端主要负责显示与输入收集，不应该承担规则正确性的主要断言职责

### 13.2 后端交互边界测试

卡牌实现测试、行动逻辑测试、收获流程测试，应当尽量以“调用后端接口或命令，然后断言后端返回状态”为主。

具体模板与字段清单，见 `docs/CARD_TEST_TEMPLATE.md`。

也就是说，测试代码不需要先去操作 DOM，再从页面文字反推规则是否正确；而是应该：

1. 准备一个明确的后端初始状态
2. 调用后端交互接口，例如 `action`、`choice`、`reorg`、`feed`
3. 获取 `SessionResponse` 或 `stateUpdate`
4. 直接断言返回的 `state`、`pending`、`log`、`scores`

这种方式尤其适合卡牌实现测试，因为卡牌效果真正发生的位置在后端规则层，而不在前端组件层。

#### 13.2.1 为什么卡牌测试应优先放在后端边界

因为一张卡的正确性，本质上取决于下面这些后端结果是否正确：

- 资源有没有正确增减
- 行动是否被允许或替换
- 是否插入了正确的 follow-up action
- `pending` 是否进入了正确阶段
- 卡牌局部状态 `cardStates` 是否正确变化
- 日志是否记录了正确的 `key` 和 `params`

这些都属于后端领域状态，不需要经过前端渲染才能验证。

#### 13.2.2 推荐的卡牌测试写法

推荐的测试写法是“以接口作为驱动，以状态作为断言”：

```text
准备测试状态
  → 调用后端接口/命令
  → 获取新的 SessionResponse / stateUpdate
  → 断言 state.players / actionSpaces / pending / log
```

可选的驱动入口有两类：

- 直接调用 `GameSession` 方法：适合 server 层单测与集成测试
- 调用 `/api/game/*` 或 WebSocket 消息：适合协议边界测试与黑盒测试

推荐断言内容：

- `state.players[n].resources`
- `state.players[n].minorPlayed` / `occupationPlayed` / `improvements`
- `state.players[n].cardStates`
- `state.actionSpaces[*].takenBy` / `resources`
- `pending`
- `log`
- `scores`

#### 13.2.3 这样做的收益

- 测试更稳定，不依赖页面结构和 CSS
- 失败定位更快，可以直接看到是规则错了还是同步错了
- 同一套测试既可以覆盖 HTTP，也可以覆盖 WS 主设计
- 卡牌效果的断言更精确，不需要通过页面文案做间接判断

### 13.3 单元测试

- `shared/engine/__tests__/*`：引擎推进、选择节点、链式流程
- `shared/actions/__tests__/*`：原子动作、卡牌 Hook、支付与状态变化
- `shared/logic/__tests__/*`：回合、收获、计分、状态克隆
- `server/__tests__/*`：`GameSession` 命令行为、纯校验逻辑

### 13.4 前端渲染测试

前端测试应聚焦在“这份服务端状态被正确渲染了吗”，而不是重复验证游戏规则。

前端渲染测试建议覆盖：

- 当前玩家与非当前玩家的可交互/只读显示
- `pending` 对应的选择条、按钮、提示是否正确出现
- 日志面板、资源面板、农场面板是否正确展示给定状态
- 收到新的 `stateUpdate` 后页面是否正确刷新
- 断线、重连、加载中、错误提示等 UI 状态

前端渲染测试的输入应尽量使用：

- 伪造的 `stateUpdate` 消息
- 固定的 `GameApiResponse`
- 预构造的 `SerializedGameState`

而不是在前端测试里再从头跑一遍完整规则流程。

### 13.5 契约测试

新增重点：

- `room-manager` 多连接广播测试
- createRoom/joinRoom/getState/stateUpdate 协议测试
- 非当前玩家发送命令时的错误处理
- 断线后房间回收或保活策略测试

### 13.6 E2E 测试

必须补齐双浏览器窗口场景：

1. 打开 p1 和 p2 两个窗口
2. 两端加入同一房间
3. p1 执行动作
4. 验证 p2 自动收到状态更新
5. 验证 pending 在两个窗口中的展示一致
6. 验证只有正确玩家窗口可操作

E2E 的职责是验证“多人链路是否真正打通”，而不是替代所有卡牌逻辑测试。

因此推荐分工是：

- 卡牌和规则正确性：以后端交互边界测试为主
- 组件与视图正确性：以前端渲染测试为主
- 多端实时同步与关键主流程：以 E2E 为主

## 14. 当前结论

项目的主设计应明确为：

- `GameSession` 是单房间唯一权威状态容器
- `RoomManager` 是多人对局的连接与广播中枢
- `WebSocket stateUpdate` 是多人同步的主链路
- 前端以“订阅快照、整体替换、按视角渲染”为核心模型
- HTTP 退居辅助角色

用一句话概括：

> 后端负责裁定和持久真相，WebSocket 负责把这份真相推送到房间内的所有玩家界面，前端只负责基于同一份快照做视角化渲染与输入收集。
