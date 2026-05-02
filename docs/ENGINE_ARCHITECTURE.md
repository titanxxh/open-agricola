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
server/game/room-manager.ts
  ├─ 房间路由
  ├─ 连接管理
  ├─ 玩家绑定
  └─ 广播 stateUpdate
        │
        ▼
server/game/authoritative-session.ts
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

server/custom-code/ 隔离执行链（同机/sidecar）
  ├─ 玩家代码校验 / 编译
  ├─ effect/listener manifest 提取
  └─ 自定义代码隔离执行

HTTP /api/*
  ├─ 健康检查
  ├─ 房间列表 / 运维接口
  ├─ 新局 / 加载 / 调试
  ├─ 补拉快照 / 测试辅助
  └─ Sandbox hot-seat 启动
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
  ├─ index.ts                         HTTP + WS 服务器装配入口
  ├─ game/
  │   ├─ room-manager.ts              房间管理、连接绑定、消息路由、广播
  │   └─ authoritative-session.ts     权威状态容器，命令执行中心（原 game-session.ts）
  ├─ game-router.ts                   HTTP 兼容接口、调试接口、快照接口
  ├─ custom-code/                     自定义代码执行链集中目录
  │   ├─ compiler.ts                  TypeScript → JS 编译
  │   ├─ runtime.ts                   沙盒运行时容器
  │   ├─ engine.ts                    hook / phase / scope 校验与调度
  │   ├─ isolate-runner.ts            隔离执行入口
  │   ├─ executor-worker.ts           worker/sidecar 入口
  │   └─ client.ts                    主进程 → executor 的 RPC 客户端
  └─ *-validation.ts                  纯规则校验模块

client/ (前端，原 src/)
  ├─ app/             顶层容器，房间接入、玩家视角、页面编排
  ├─ hooks/           WS 连接、状态同步、临时选择状态、UI 编排
  ├─ services/        传输层封装（WS 为主，HTTP 为辅）
  ├─ components/      纯渲染组件
  └─ types/           UI 层临时类型
```

> 三层边界（`shared/` / `server/` / `client/`）从 PR-3 起已由 ESLint `no-restricted-imports` 以 **warn** 级别强制：`shared/` 不得引用 `server/` 或 `client/`，`server/` 不得引用 `client/`，`client/` 不得引用 `server/`。`package.json` 已声明 `sideEffects`，为 bundler 提供 tree-shaking 基线。

注：卡牌的“职业 / 小改良”类型归属以 `shared/cards/catalog.ts` 中对应注册表为准；例如 `A92_AdoptiveParents` 当前应属于职业卡注册表，而不是小改良注册表。

### 3.1 Sandbox Hot-seat 与自定义代码隔离

- Workshop 的 sandbox 已固定为单浏览器 hot-seat 模式：由 HTTP `/api/game/new-sandbox` 创建独立 `GameSession`，不创建 WS 房间，也不复用房间 `maxPlayers` 语义。
- Sandbox 配置（玩家人数、A/B/C/D/E 默认牌组、自定义卡列表）由 `server/workshop.ts` + SQLite `sandbox_settings` / `sandbox_cards` 持久化；再次进入“我的沙盒”时沿用上次配置。
- Sandbox 开局会把 `playerCount`、`deckIds`、`customCardIds` 下沉到 `createInitialState()`，因此人数、默认命名、基础牌组过滤都由领域层统一生成。
- 自定义 `effect_code` 不再被主后端动态 `import()` 或直接执行。主后端只保存 `compiled_code + code_manifest`，运行时注册代理 hook / listener，并通过内部 RPC 调用同机 `custom-code-executor` sidecar 返回纯数据结果。
- **沙盒内可用的 hook / phase / scope / actionId、AST 禁用清单、`PlayerState` 字段口径、`cardStates` 写入位置等约束，全部以 [`docs/CUSTOM_CARD_SANDBOX.md`](./CUSTOM_CARD_SANDBOX.md) 为唯一真源。** 该文件含若干 `prompt-sync:begin/end` 标记块，通过 `pnpm run check:prompt-sync` 与 `shared/cards/card-effects.ts` / `server/custom-code/engine.ts` / `shared/custom-code/ast-validator.ts` 自动同源校验。Workshop AI Designer 系统提示词（`client/services/llmPrompts.ts`）必须与之一致，CI 兜底。

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
- `WsGameTransport` 的 `commitFarm`/`undoStep`/`undoAction`/`newGame`/`loadGame`/`devDrawCard`/`devPlayCard`/`devCreatePasture` 均走 WS，dev 操作不再 HTTP 降级。
- `GameContainerApi` / `FarmBoard` 现在会把 `sow` 交互拆成“真实农场格”与“off-board extra-sow tray”两类目标；像 `E68_CherryOrchard` 这类虚拟田仍完全由服务端 `interaction.farm.selectableFields` 驱动，前端只负责渲染与提交坐标。
- `newGame` 支持可选 `seed` 参数，HTTP `/api/game/new` 与 WS `newGame` 均支持；`GameSession` 构造函数接受 `number` 类型 seed。
- 双窗口实时同步验证通过（P1 操作后 P2 立即看到状态变化）。
- **固定持久化 dev 房（dev2 / dev3 / dev4）**：后端启动时硬编码三间常驻房间，房间 ID 与人数一一对应（`dev2`=2 人、`dev3`=3 人、`dev4`=4 人），分别独立持久化、各自存活于跨重启之间。默认按 `PERSIST_ROOMS=sqlite` 写入 `data/open-agricola.db` 的 `rooms.state_json`；若显式设为 `json` 则写 `PERSISTED_ROOMS_DIR/<roomId>.json`（默认 `output/dev2.json` 等）。每次房间状态变更都会立刻写回；这些房间在无人连接时也不销毁、也不可被 `dissolveRoom`。前端使用 `?transport=ws&room=devN&player=pK` 进入对应房间，`p1..pN` 会映射为固定座位并通过 `joinRoom(roomId, requestedPlayerIndex)` 入座，服务端对这三间房允许同座位重连替换旧连接。对应地，`./restart-intranet.sh` 默认会打印三间房的链接，可用 `--players N` 突出某一间。早期版本中遗留的单一 `dev` 房与 `.persisted-room.json` / `PERSISTENT_ROOM_ID` 环境变量已不再支持，启动时会自动从 SQLite 中清理旧的 `dev` 行（json 文件会备份成 `<roomId>.json.legacy.bak` 后删除）。
- **`playerCount` 在房间恢复链路上一致透传**：`createSessionForRoom(stateOrSeed?, customCardDbIds, requestUserId, playerCount?)` 对外多了一个可选 `playerCount` 参数；只有当 `stateOrSeed` 为 `undefined` 或 number seed（即将构造全新 state）时才把它放进 `GameSession.initialStateOptions.playerCount`，避免覆盖 serialized state 已经编码的人数。`loadRoomFromState`、`restoreRoomFromSqliteRow`（针对 `state_json IS NULL` 的行）以及 WS `newGame` 命令都会把 `room.maxPlayers` 透传下去——这样像 `dev4` 这种 `max_players=4` 但 `state_json=NULL` 的持久化房，重启后第一次构造也会按 4 人初始化（包含 4 人 action board 的 17 个空间），而不是退化成 2 人。
- `./restart-intranet.sh` 现在直接使用当前仓库的绝对路径二进制启动 `tsx` / `vite`，并按同样的绝对路径匹配旧进程，避免跨 clone/worktree 的全局 `pkill` 误伤。
- 普通 SQLite 房间同样遵循“空房先保留、TTL 后回收”的策略：连接全部断开时不会立刻从内存删掉，而是保留分享链接可重连的窗口期。服务端启动恢复范围也覆盖 `waiting` 与 `playing` 房间，因此等待中的房间不会再因为后端重启直接丢失。恢复与重开都会继续带上房间记录里的 `custom_card_ids`。

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
- 当前实现还会同步携带 `interaction`：它比 `pending` 更贴近 BGA 的状态 args，包含 `stateId`、`allowedCommands`、`anytimeActions` 与服务端白名单目标；前端主消费对象已切到它，`pending` 主要保留给兼容层与 undo 历史。

#### 4.3.2 当前交互协议（BGA 风格）

当前 `GameSyncPayload` / `SessionResponse` 同时包含两层交互信息：

- `pending`：后端规则状态与历史兼容层。
- `interaction`：前端渲染层的唯一真相，携带：
  - `stateId`
  - `allowedCommands`
  - `anytimeActions`
  - `choice` / `farmSelect` / `selection` 的 `sourceCard`（当交互由某张卡触发时，前端可统一显示“由某卡触发”）
  - `choice.options[].sourceCard`（当同一个 pending 里混入多张卡注入的 option 时，来源卡归属下沉到 option 级）
  - `choice.options[].effectPreview`（按钮主文案用的结构化效果预览；当前覆盖 `resourceExchange` / `payment` / `text`）
  - `farmSelect` 的 `selectableTiles` / `selectableEdges` / `selectableFields`（对 `sow`，`selectableFields` 允许包含 off-board 虚拟田位、每格独立 `allowedCrops` 与 `sourceCard`）

协议层规则：

- 存在未完成交互时，普通 `takeAction` 会被拒绝。
- 只有 `allowedCommands` 中声明的命令可以继续推进。
- `anytime` 不再覆盖当前 pending，而是通过引擎根前插 flow 执行，结束后回到原未完成节点。

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
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
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

- `takeAction()` / `takeAnytimeAction()`
- `resolveChoice()`
- `commitFarmChoice()` / `commitSelectionChoice()`（farmSelect / selection 提交入口）
- `confirmAnimalReorg()` / `confirmHarvestFeed()`
- `confirmNextPlayer()` / `confirmPlayerSwitch()`
- `performRoundEnd()`
- `undoStep()` / `undoAction()`

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

1. 客户端连接 `ws://<host>:5175/ws`
2. 首位玩家发送 `createRoom`
3. 服务端创建 `Room` 和 `GameSession`
4. 其他玩家发送 `joinRoom`
5. 所有玩家加入后，服务端发送 `gameStarted`
6. 同时推送当前 `stateUpdate`

客户端消息（实际以 `shared/protocol/ws.ts` 中 `ClientCommand` 为准；这里列出主路径常用项）：

```ts
{ type: 'createRoom', name?: string, maxPlayers?: number, customCardIds?: string[] }
{ type: 'joinRoom', roomId: string, requestedPlayerIndex?: number, name?: string }
{ type: 'dissolveRoom' }
{ type: 'getState' }
{ type: 'action', spaceId: string }
{ type: 'choice', value: string }
{ type: 'anytime', actionId: string }
{ type: 'reorg', zones: [...] }
{ type: 'feed', selections: [...] }
{ type: 'nextPlayer' }
{ type: 'confirmPlayerSwitch' }
{ type: 'roundEnd' }
{ type: 'commitFarm', playerIndex, farmType: 'fence'|'room'|'stable'|'plow'|'sow', payload }
{ type: 'commitSelection', playerIndex, payload: { positions: [...] } }
{ type: 'undoStep' } | { type: 'undoAction' }
{ type: 'newGame', seed?: number } | { type: 'loadGame', state: SerializedGameState }
{ type: 'devSetResources' | 'devSetRound' | 'devDrawCard' | 'devPlayCard' | 'devCreatePasture', ... }
```

> **协议名 vs 引擎名（容易踩坑）**：WS 协议字段 `type` 用的是 `action` / `choice` / `reorg` / `feed` / `nextPlayer` / `anytime` 这一套；而 `interaction.allowedCommands` 白名单里出现的是引擎语义名：`takeAction` / `resolveChoice` / `confirmReorg` / `confirmFeed` / `confirmNextPlayer` / `takeAnytimeAction`。它们是同一个意图的两层视角——`room-manager` 收到 WS 消息后调用 `GameSession.takeAction()` / `resolveChoice()` / `takeAnytimeAction()` / `confirmNextPlayer()` 等同名方法。前端在判断"现在能做什么"时，应当读 `interaction.allowedCommands`（引擎名）而不是直接复用 WS `type`，否则会和服务端 `commitFarm` 一类的合并指令对不上号。

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

补充说明：`renovation` 成本语义与 BGA 对齐，基础翻修费用按“一次性 `Reed` fee + 按房间数重复的 `Clay/Stone` trade”建模，而不是把 `Reed` 也按房间数倍增。

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
- `POST /api/game/dev/*`：HTTP 单机调试与 E2E 场景布置；WS 房间内的开发者工具命令应优先走房间级 `ClientCommand`

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

`workPhaseObtainedResources` 用于记录某玩家在当前工作阶段通过 `gain` / `collect` / `take-from-card` / `anytime-exchange` 等动作获得的建材总量；该统计在回家阶段结算完毕后清空，供 `A53_Claypipe` 这类“preceding work phase”卡牌复用。

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
- 农场版图：`fields`（`Field.stacks: CropStack[]`，见下方说明）、`roomTiles`、`stableTiles`、`fenceSegments`、`pastures`
- 动物安置：`houseAnimalType`、`houseAnimalCount`、`stableAnimals`、`newbornCount`
- 已打出卡牌：`improvements`、`minorPlayed`、`occupationPlayed`

前端或测试如果需要“带类型前缀的已打出卡牌 key 列表”，应通过
`getPlayedCardKeys(player)` 从上述 canonical arrays 现算，而不是再维护
冗余的 `playedCards` 字段。
- 手牌：`minorHand`、`occupationHand`
- 持续性效果：`majorEffects`、`activeModifiers`
- 卡牌局部状态：`cardStates`

这组结构需要满足两个要求：

- 足够完整，能独立描述一个玩家的完整农场状态
- 足够稳定，便于广播、补同步、录像和回放

#### 11.3.1 Field 多堆模型（`CropStack`）

每块 `Field` 持有 `stacks: CropStack[]`，数组顺序即视觉从底到顶（`stacks[0]` 是最底堆、`stacks[stacks.length-1]` 是最顶堆）。`CropStack` 形如 `{ kind: 'grain' | 'vegetable', kind-specific remaining: number }`。核心语义：

- **Sow 仍要求空田**（`fieldIsEmpty(f)`，即 `stacks.length === 0`）——播种不会叠加到已有堆上。
- **Reap 只收顶堆**。每次收获把顶堆 `remaining -= 1`；当 `remaining === 0` 时 pop，下一次收获才会暴露下一堆（底堆）。
- **Scoring / prereq 用 `fieldHasCrop(f, kind)`**——只要任一 stack 是目标作物即算该田含该作物。混合田（同时含谷和菜）同时计入谷田和菜田。
- **底堆插入是单卡专属动作**。目前只有 A113 Heresy Teacher 会在触发时对满足条件的田 `unshift` 一个 `{ kind: 'vegetable', remaining: 1 }` 到底堆；因此它的 veg 会等到顶堆 grain 被 reap 清空后才能被收。

所有 Field 访问统一走 `shared/game/field.ts` 里的 helper（`fieldIsEmpty` / `fieldTopStack` / `fieldBottomStack` / `fieldHasCrop` / `fieldTotalRemaining` / `fieldPopIfDepleted` / `fieldDecrementTop` / `fieldFindStackOfKind` / `countFieldsWithCrop` / `countEmptyFields`），避免卡牌直接触碰 `stacks` 原数组。`rehydrateState` 对旧形状 `{ crop, remaining }` 会做一次迁移。

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

`SerializedActionSpace.players?: number[]` 是 BGA 行动格的“人数变体白名单”：例如 `Resource Market`（4 人版）、`Hollow`（4 人版）、`Lessons-3`（3 人版）等空间只有当 `players.length` 落在该数组里才会进入 `state.actionSpaces`。`createActionSpaces(playerCount?)`（`shared/logic/state.ts`）按 `players` 字段过滤模板：

- 2P：10 个主行动格
- 3P：14 个（含 3P 专属 `hollow` / `resource-market` / `lessons-3`）
- 4P：16 个（含 4P 专属 hollow/resource-market/lessons-4）

7 张通用格在卡定义里显式带 `players: [2, 3, 4]`。`shared/actions/index.ts` 的 `getAvailableActions(playerCount)` 与 `shared/game/serialization.ts` 的 `rehydrateState`、`shared/logic/state.ts` 的 `normalizeState` 都从 `state.players?.length` 推导出当前人数，再调用 `createActionSpaces`，所以即使 `state_json` 缺字段，也会按 `players.length` 重新构造正确的 action board。前端 `ActionBoard` 通过 `getBoardPlayerCount(players)` 推 2/3/4 并切换 `action-board--{n}p` className 与底图（2P=830px、3P/4P=1000px 加边栏）。

### 11.4.1 Worker 身份模型（2026-04-17）

- `PlayerState.workers: Worker[]`（固定 5 槽，id `'1'..'5'`）是 worker 身份的唯一真相源；`isActive` / `isNewborn` 两个布尔标记状态。
- 聚合数字通过 `shared/game/player.ts` 的 helper 按需计算：`familySize(p)`、`newbornCount(p)`、`workersAvailable(state, p)`、`smallestAvailableWorker(state, p)`、`findFirstNewborn(p)`、`activateSmallestInactive(p)`。
- `ActionSpace.takenBy: WorkerRef[]`，按放置顺序记录；`takenBy.length` 即"格上有几个人"（含新生儿）。
- Family Growth 会把新生儿的 WorkerRef 也 push 到 FG 格的 takenBy（匹配 BGA "新生儿坐 FG 格" 语义），但不调用 `recordRoundPlacement`。
- `__roundPlacement__` 现在记录 `{spaceId, workerId}[]`；`getRoundPlacementOrder(p)` 仍返回 `string[]` 保留向后兼容，`getRoundPlacementDetails(p)` 返回结构化列表。
- A92 AdoptiveParents 精准定位新生儿（`findFirstNewborn`），从所在 space 的 takenBy 移除对应 WorkerRef 并把该 worker 的 `isNewborn` 翻为 false。
- 送工人回家路径（D150 GodlySpouse / D93 SheepInspector / E3 TeaTime）通过 `removeWorkerRef(space, playerId, workerId)` 按 workerId 精确移除，保留其他占位者。

**Card-held workers（2026-04-19）**：卡牌可通过 `player.cardStates[cardId].extraData.heldWorkerId` 持有一个工人。持有态工人既不出现在任何 `ActionSpace.takenBy`（未占用行动格），也不在家（`workersAvailable` 的计算中会排除此类工人，`workersAtHome` 等价于"既未在格又未被卡持有"）。回家阶段，`GameSession.returnHome` 在清空各行动格 `takenBy` 之后，以 for 循环遍历每个玩家的所有 `cardStates` key，对每个 `cardId` 调用 `releaseWorkerFromCard(p, cardId)` 释放卡持有工人，使其回到"可用于下一轮"的活跃状态（无单独的 releaseAll 辅助函数）。工具函数在 `shared/cards/helpers/card-held-workers.ts`：`holdWorkerOnCard(player, cardId, workerId): void` / `getWorkerHeldOnCard(player, cardId): string | undefined` / `releaseWorkerFromCard(player, cardId): string | undefined` / `getCardHeldWorkerIds(player): Set<string>`。首个消费者：C22 BasketChair。

### 11.5 `PendingAction` 与结构化日志

除了 `GameState` 本体，前端还依赖两类同步对象：

- `PendingAction`
- `LogEntry[]`

`PendingAction` 描述“当前还有什么后续命令必须完成”。
它不是前端临时 UI 状态，而是后端规则态。

推荐结构（与 `shared/game/types.ts` 中 `PendingAction` 一致）：

```ts
type PendingAction =
  | { type: 'none' }
  | {
      type: 'choice'
      playerIndex: number
      spaceId: string
      options: ActionChoiceOption[]
      promptKey?: string
      promptParams?: Record<string, unknown>
      costOverride?: Partial<Resource>
      sourceCard?: string
      actionContext?: Record<string, unknown>
    }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | {
      type: 'harvestFeed'
      playerIndex: number
      remaining: number
      foodUsed: number
      feedQueue?: { index: number; remaining: number; foodUsed: number }[]
    }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
  | { type: 'confirmPlayerSwitch'; fromPlayerIndex: number; toPlayerIndex: number }
```

`confirmPlayerSwitch` 是 `PlayerSwitchNode`（见 §11.6.2b）暂停引擎时使用的 pending：当卡牌效果需要从 owner 视角执行（opponent scope），引擎会在切换前后各插入一个 `PlayerSwitchNode`，前端展示确认 UI，确认后 `GameSession.confirmPlayerSwitch()` 切换活跃玩家并继续推进引擎；该 pending 同时会标记 `undoBoundary`（undo 不能跨越此边界）。

此外，`shared/protocol/game.ts` 的 `InteractionState` 在协议层把 pending 拆得更细，`stateId` 涵盖 `idle / choice / farmSelect / selection / animalReorg / harvestFeed / confirmNextPlayer / confirmPlayerSwitch`。`farmSelect` / `selection` 不在 `PendingAction` 类型里单列（服务端把它们也归在 `pending.type === 'choice'` + `actionContext` 元数据里），但前端通过 `interaction` 直接消费这两个分支。

其中 `ActionChoiceOption` 目前约定为：

```ts
type ChoiceEffectPreview =
  | {
      kind: 'resourceExchange'
      resourcesPaid?: Partial<Resource>
      resourcesGained?: Partial<Resource>
      bonusVp?: number
    }
  | {
      kind: 'payment'
      resourcesPaid?: Partial<Resource>
      cardUsed?: string
    }
  | {
      kind: 'text'
      text: string
    }

type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ChoiceEffectPreview
}
```

协议约束：

- `pending.sourceCard` / `interaction.sourceCard` 表示“整个当前交互的统一来源”；一旦一个 pending 内混入多张卡各自注入的 option，不能只靠这一层。
- `options[].sourceCard` 是 option 级 canonical carrier，`computeArgs` / `computeChoiceCandidates` / card-owned direct choice 都应在这里补齐来源卡。
- `options[].effectPreview` 只负责“按钮主文案的真实效果”，不替代 `labelKey`；当前前端采用 `hybrid_dual`：主文案看 preview，次文案仍显示动作类型，顶部副标题继续显示触发卡。
- 当前 preview 生产点：
  - `shared/cards/helpers/pay-gain-node.ts`
  - `shared/actions/effects/pay-helpers.ts`
  - `shared/actions/effects/exchange.ts`
  - 引擎对 `seq(pay-resources, gain[, bonus-vp])` 的 option 会做一次轻量聚合，因此像 `D161_CabbageBuyer` 这类手写 `payLeaf + gainLeaf` 组合也能拿到 `resourceExchange` preview。

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

对于由多个子动作组成的行动格，当前实现补充了两条重要约束：顶层 `or` / `xor` 行动格，以及一批“顶层语义等于必选 child”的安全 `seq` 行动格，`canBeExecutedByPlayer` 可以由 `flow` 递归合成，而不是在行动卡文件里再手写一份平行条件；递归到 `leaf` 时，应继续复用子 action 自身的 `isDoable` / `computeReplace` 判定，并继续应用该子 action 的相关 hooks / CardListener。这样像 `grain-utilization` 里的 `sow`、`farm-expansion` 里的 `construct` / `stables`、`major-improvement` 里的 `improvement-any`，以及被卡牌放宽或替代的子行动，都能在行动格开放性与实际执行阶段保持一致。

对于改良/行动卡的出牌，本轮又补了一层与 BGA 更接近的统一校验：`minor-improvement` 与 `improvement-any` 在构造候选项和真正提交购买时，都会复用同一个 prerequisite helper。当前 helper 已覆盖结构化字段 `occupationPrerequisites` / `improvementPrerequisites`，以及一批常见文本 prerequisite（如 `2 Fields`、`2 Major Improvements`、`Cooking Improvement`、`1 Baking Improvement`）。这样 `E81_AlchemistsLab`、`A84_Silage` 这类卡不会再只在卡面上“声明前提”，而是会真正影响服务端判定。

推荐沿用以下 phase：

- `isDoable`：改变行动是否可执行
- `computeReplace`：把一个行动替换成另一个行动
- `computeCosts`：调整支付成本
- `computeFenceDiscount`：围栏支付时由各卡牌返回免费 fence segment 数（聚合器 `collectFenceDiscount(state, player, ctx)`，`shared/cards/card-effects.ts`）；当前消费者：E16 BriarHedge（每条 border edge 折扣 1 wood，最多 4）
- `computeArgs`：追加选项、额外参数（针对 `execute()` 已经返回 `choice` 的传统路径）
- `computeChoiceCandidates`：针对 opt-in `getBaseChoiceOptions` 的 action，注入额外候选目标（见 §11.6.3）
- `before`：主动作执行前
- `during`：主动作执行中
- `immediatelyAfter`：主动作完成后立刻触发
- `after`：整个动作收尾阶段触发

补充说明：对于 `resolveChoice()` 型 action，`choice` 现在也会继续透传到后续 `ActivateCardNode` 事件上下文，因此像 `B151_LittlePeasant` 这种依赖“本次到底打出了哪张职业”的 after listener，可以通过统一引擎链路结算，而不需要在主路径额外写分支。

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

其中 `result` 不只是 `ok/fail/choice` 的类型标签，也允许携带额外执行上下文。例如 `commitFarmChoice('fence')` 会把本次新建 pasture 的 delta 透传成 `result.extraData.newPastures/newEdges`，这样 `ImmediatelyAfter(Fencing)` / `After(Fencing)` listener 可以直接按“本次新增围栏结果”判断，而不是回头从整张农场快照里猜增量。

推荐返回值：

```ts
type ActionHookResult = {
  doable?: boolean
  actionId?: string
  extraOptions?: ActionChoiceOption[]
  followUpActions?: FollowUpAction[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  sourceCard?: string
  logKey?: string
  logParams?: Record<string, unknown>
}
```

这里的 `sourceCard` 现在不仅是日志/提示用元数据，也被视为 flow/follow-up/source option 的兜底来源：

- 对 `ActionHookResult.flow`，引擎会在插入节点前递归把顶层 `sourceCard` 补到缺失的 child leaf，但不会覆盖 child 自己显式写的 `sourceCard`。
- 对 `followUpActions`，统一推荐对象形式 `{ actionId, sourceCard }`；若 listener 顶层有 `sourceCard` 且 follow-up 仍是字符串，引擎会做兜底转换。
- 对 `OptionalNode` / `OrNode` / `XorNode` / `ChoiceNode` 的 choice 构建路径，引擎会把统一来源写入 `pendingChoiceContext.sourceCard`，供 `server/game/authoritative-session.ts` 透传到 `pending` / `interaction`。

这样可以覆盖常见卡牌能力：

- 改写行动可用性
- 折扣、替代支付
- 额外获得资源
- 添加跟随动作
- 注入额外选择

#### 11.6.2 `getBaseChoiceOptions` opt-in 选项流（与 `computeChoiceCandidates`）

某些行动天生就是“同一 actionId、不同分支”的形态——典型如 `renovate-house` 既可以走 wood→clay/clay→stone 的标准路径，也可以在 A87 Conservator 在场时多一个 wood→stone 的直跳分支。早期实现把"额外分支"放在 top-level XOR（通过 `computeReplace.decline + alternativeFlow`）里，结果界面上会出现 `House Redevelopment` 与 `Renovate directly to stone (Conservator)` 两个并列的顶层按钮，而不是进入翻修后再选目标。

为此引入 opt-in 的"选项流"：

- `ActionDefinition` 新增 `getBaseChoiceOptions?: (ctx) => ActionChoiceOption[]` 与 `choicePromptKey?: string`、`noChoiceLogKey?: string`。当这些字段存在时，引擎在 `ActionNode` dispatch 阶段会跳过 `execute()`，改走"选项流"：
  1. `baseOpts = action.getBaseChoiceOptions(ctx)`
  2. `extraOpts` 来自 `computeChoiceCandidates` phase 上 listener 返回的 `extraOptions`
  3. 按 `value` 去重（base 优先），得到合并候选列表
  4. 对每个候选，引擎用 `params.selectedOption = value` 临时探测 `costPreview.canExecute(ctx, override)` 来过滤不可负担项
  5. 0 候选 → `{ type: 'fail', logKey: action.noChoiceLogKey ?? 'log.action' }`
  6. 1 候选 → 直接调 `action.resolveChoice(ctx, value)`（UI 不弹 prompt）
  7. ≥2 候选 → 走标准 `choice` prompt，玩家选完后 `params.selectedOption` 自动注入到 `resolveChoice` 的 `executionContext.params` 里

- 这条路径与传统 `execute() → 'choice' → computeArgs.extraOptions` 是互斥的：当 action 声明了 `getBaseChoiceOptions`，引擎不再合并 `computeArgs.extraOptions` 到结果里，避免重复注入。Action 作者要么用旧路径（`execute()` 自己返回 choice，listener 用 `computeArgs` 追加），要么用新路径（`getBaseChoiceOptions` + `computeChoiceCandidates`），不要混用。

- 选项流让"添加额外目标"成为标准卡牌扩展形式，配套机制比 `computeReplace.decline + alternativeFlow` 更轻：
  - 不会在顶层多塞 XOR 节点，UI 永远是同一个 action 名 + 一个内部目标 prompt。
  - listener 只关心"加哪些选项"，affordability 由引擎统一通过 cost preview 过滤。
  - 1 候选自动短路，避免单选 prompt 干扰（例如非 A87 wood 玩家点 renovate 立即翻修到 clay，而不是被询问"你想翻修到什么？"）。

- 当前使用此机制的卡牌：
  - `renovate-house`（基础 action）声明 `getBaseChoiceOptions` 输出 `clay` 或 `stone`；
  - `A87_Conservator` 用 `computeChoiceCandidates` 在 wood 房屋时注入 `stone` 候选，并保留 `isDoable` listener 救回"只买得起 stone、买不起 clay"场景的入口可见性。

##### 子动作 leaf-flush 日志（`emitLeafActionDetail`）

当一个 action 作为 SEQ 子节点出现（例如 `house-redevelopment` 把 `renovate-house` 与可选的 `improvement-any` 包成 SEQ），整段 SEQ 完成才 emit 单条 `log.actionDetail` 会带来两个问题：(a) 玩家在被问"打不打 improvement"时还看不到刚刚翻修的结果与花费；(b) 整段聚合的 detailParts 把多个子动作的资源 delta 揉在一起，难以区分。

为此 `ActionDefinition` 上提供了 opt-in 字段：

```ts
emitLeafActionDetail?: boolean
```

声明此字段后，当该 action 作为非顶层 leaf 完成（即 engine 返回 `{ type: 'ok', actionId }` 且 `actionId !== activeSpaceId`）时，`GameSession` 会立刻：

1. 用 `actionStartPlayerSnapshot` 与当前玩家状态的 delta 构造 `detailParts`
2. 减去自上次 flush 以来已经被 `log.cardEffectGain` / `log.cardEffectPay` 单独记账的资源（避免与卡牌效果日志重复）
3. 若仍有非空 gains/costs/effects，emit 一条 `log.actionDetail`，`action` 字段使用 leaf 自身的 `nameKey`（例如 `actions.renovate-house.name`）
4. 把 `actionStartPlayerSnapshot` 推进到当前状态

后续 SEQ 内的其他 leaf 与 finalize 时的最终聚合都基于这个新 baseline 计算 delta，因此不会重复记账。

约束：
- 触发条件中已自动跳过 `actionId === activeSpaceId`（顶层 wrapper 不应被当成"子 leaf"），以及 `loggedImprovementThisAction` / `usedBakeBreadThisAction`（这些已经有专用 log 路径）。
- 对带有自身 `logKey` 的 action 结果（如 `{ type: 'ok', logKey: 'log.sow' }`）也跳过 leaf-flush，避免与 action 自带日志重复。
- 当前使用此机制的 action：`renovate-house`。

#### 11.6.3 回合/阶段型卡牌 Hook

有些卡牌效果不依赖某个 action，而依赖阶段事件。
这类效果建议用显式生命周期 Hook 表达，例如：

- `onBuy`
- `onRoundStart`
- `onHarvest`
- `onRoundEnd`
- `onEndTurn`
- `onAllWorkersPlaced`
- `onReturnHome`

完整的阶段型 Hook 清单（按触发顺序）：

```text
回合开始:
  onBeforeStartOfTurn → onRoundStart

工作阶段:
  PlaceFarmer → 各原子行动 → onEndTurn
  → allWorkersUsed → onAllWorkersPlaced

回家阶段:
  onBeforeReturnHome → onStartReturnHome → onReturnHome

回合结束:
  onRoundEnd → onAfterRoundEnd

收获阶段（仅收获轮 4/7/9/11/13/14）:
  onBeforeHarvest → onStartHarvest
  → onStartHarvestFieldPhase → onHarvestFieldPhase → reap [dispatch 'reap' listener] → onAfterReap → onEndHarvestFieldPhase
  → onStartHarvestFeedingPhase → onBeforeFeed → onHarvestFeedingPhase → feed → onEndHarvestFeedingPhase → onAfterFeed
  → breed → onEndHarvest → onAfterHarvest

Base reap 和额外 reap 卡（D25、C70、E69、E70、E68、E72）在产出作物后统一调用 `dispatchReapListener(state, player, crop, amount)`，分发 `'reap'` 合成 action 事件。Card listener 可通过 `registerCardListener({actions: ['reap'], phases: ['immediatelyAfter']})` 订阅；`extraData` 包含 `{ crop: 'grain'|'vegetable', amount: number }`。

当前服务端收获结算按起始玩家开始、沿座位顺序推进 `reap / feed / breed` 三个子阶段；`harvestFeed` pending 会额外携带 `foodUsed`，前端据此展示喂养交换中心与进度摘要，并在玩家确认时把实际转换资源提交回权威 `GameSession`。
```

这类 Hook 应由 `GameSession` 在明确的阶段切点统一触发，而不是分散在前端页面或 HTTP 接口里。
当前实现里，`onBeforeHarvest`、`onAfterReap`、`onHarvest`、`onEndTurn`、`onAllWorkersPlaced`、`onEndHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn` 均已升级为可返回 `ActionFlow` 的阶段 flow：`GameSession` 会为它们创建与普通行动相同的 `Engine`，并维护阶段级 resume cursor（见 `continueStageHook` / `continueAllWorkersPlacedHooks`），因此可选支付、可选得分、动物重组等都能在阶段推进中暂停后恢复，而不是只能即时修改状态。对 `onAfterReap`，服务端会在 `reap` 后暂存本次收获摘要，供 `A64_BarleyMill`、`C120_AgriculturalLabourer`、`A106_SlurrySpreader` 这类“按本次实际收割田地数/是否收到最后一份作物结算”的卡牌读取；对 `onEndHarvest`，服务端会在 breeding 后暂存本次 newborn 摘要，供 `C71_SlurrySpreader`、`D115_FodderPlanter` 这类“按本次繁殖结果追加动作/限制 sow 次数”的卡牌读取；对 `onBeforeStartOfTurn`，`E93_Motivator` 这类“回合开始前插入一次可选额外放人”的效果也复用同一阶段 flow。`onAllWorkersPlaced` 在“所有人本轮在家工人都用完之后、`performRoundEnd` 之前”触发，首个消费者是 `E125 DelayedWayfarer`（本轮所有人放完后从 supply 激活一个 worker，对齐 BGA 时序）；`place-farmer` 为此新增了 `params.fromSupply` 模式，可在该阶段把 supply worker 标记为 active 后立刻放置。

#### 11.6.2a ActivateCardNode 架构

行动生命周期 Hook 中，`CardListener` 的执行采用延迟节点模式：

1. 在 `before`/`during`/`immediatelyAfter`/`after` 阶段，`HookDispatcher` 调用 `getMatchingListeners()` 获取匹配的监听器列表，但不立即执行 handler。
2. 引擎为每个匹配的监听器创建 `ActivateCardNode`（`shared/engine/nodes.ts`），插入引擎树。
3. 当引擎推进到 `ActivateCardNode` 时，执行 `executeCardListener()`；如果 handler 返回 `flow`，通过 `buildFlowNode` 将其插入引擎树继续执行。
4. 如果 `ActivateCardNode` 对应的卡牌持有者与当前行动玩家不同（opponent scope），引擎自动在 flow 前后插入 `PlayerSwitchNode`。

为减少单卡重复流程代码，`shared/cards/helpers/` 现在承接一层 BGA 风格糖衣：

- `pay-gain-node.ts`：封装支付后得收益、支付后追加行动、返还到当前格后再得收益
- `stage-effects.ts`：统一阶段型 `card-effects` 的标记、即时支付、bonus VP、单次收获兑换
- `card-state.ts` / `round-placement.ts`：统一一次性卡牌的 `flagged/extraData` 与“本轮放人顺序”运行时状态
- `action-snapshot.ts`：统一单次行动起点快照，让 `A74_StableTree` 这类“同一行动里先做 A 再买卡”的 onBuy 卡可以直接复用
- `mark-card-trigger` 内部 action：把阶段型触发计数从单卡 imperative 代码收敛到通用 flow leaf
- `flow` leaf 自定义 choice label：允许卡牌直接返回带文案的 `xor/or` 分支，而不必回退到旧的 `card-choice` 中转写法
- `resolveChoice()` 现在会把分支叶子的 `params` 一并透传到 action 执行上下文，避免 `xor/or` 叶子参数在真实执行时丢失

目标是让卡牌文件尽量只描述“触发条件 + 业务参数”，而不是反复手写临时标记、旧式 choice 中转和支付样板。

```text
ActionNode(collect)
  ├─ proceed → after phase
  │   getMatchingListeners → [C75_Firewood(after/improvement)]
  │   buildActivateCardNodes → [ActivateCardNode(C75)]
  │   insert into tree
  └─ proceed → ActivateCardNode(C75)
      executeCardListener → flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } }
      buildFlowNode → ActionNode(gain)
      insert into tree → proceed
```

#### 11.6.2b PlayerSwitchNode

当 `ActivateCardNode` 发现卡牌持有者（`ownerPlayerId`）与当前执行玩家不同时，自动在 flow 前后插入 `PlayerSwitchNode`：

```text
PlayerSwitchNode(→ p2)
  └─ flowNode (卡牌效果)
PlayerSwitchNode(→ p1)
```

引擎推进到 `PlayerSwitchNode` 时返回 `{ type: 'playerSwitch', targetPlayerId }` 给 `GameSession`。`GameSession` 设置 `pending = { type: 'confirmPlayerSwitch' }`，并标记 `undoBoundary`（undo 不能跨越此边界）。前端展示确认 UI，确认后 `GameSession.confirmPlayerSwitch()` 切换活跃玩家并继续推进引擎。

#### 11.6.2c 卡牌购买费用折扣

卡牌购买费用的折扣（如 E130_Overachiever）统一使用 `computeCosts` 阶段，通过 `actions` 字段（如 `'improvement-any'`）区分是行动空间费用还是卡牌购买费用。`resolveCardCostWithModifiers()` 在 `pay-helpers.ts` 中收集匹配的 listener 返回值并应用到卡牌基础费用上。

```ts
// E130_Overachiever: improvement-any 折扣 1 wood
{
  phases: ['computeCosts'],
  actions: ['improvement-any'],
  handler: (context) => ({ costs: { wood: -1 } })
}
```

#### 11.6.2d costOverride 机制

引擎在 `computeCosts` 阶段计算的成本修改结果通过 `engine.getLastComputedCosts()` 暴露给 `GameSession`。当引擎步骤产生 `choice` pending 时，`costOverride` 被附加到 `pending.costOverride`，传递给 `commitFarmChoice()`。除 `costOverride` 外，`ActionExecutionResult.extraData` 也承担“稳定可供 listener 读取的结算元数据”职责，例如 `improvement-any` 购买完成后的 `improvementPayment`（`A41_VegetableSlicer` 用它区分 Fireplace → Cooking Hearth 升级），以及 `commitFarmChoice()` 返回的若干 farm delta。

在 `commitFarmChoice` 中：
- `room` 路径：先用 `shared/actions/effects/room-payment.ts` 展开“每间房”的费用变体，再按已选房间数合成为总成本；若存在多个可行支付解，会先转成统一的 `prompt.selectPayment` pending，待玩家选定后再真正落房与扣费
- `stable` / `plow` 路径：改为复用 typed flat payment 解析；即使当前多数情况下仍只有单一支付法，也不再各自手写 `canPayResources/payResources`，后续若接入 trade / bonus modifier 可直接复用同一套 payment choice 协议
- `fence` 路径：先校验选边/连通/封闭区域，并在得到 `newEdges` 后计算最终 payable wood（考虑 `freeFences`、`extraWood`，以及从 `override.wood` 提取出来的额外折扣）；`fencing` 类型的 `TradeModifier` 可走 `computeAllBuyableCombinations`（与 BGA 一致，例如 `A88_HedgeKeeper` 使用空 `from`、`to: { wood: 1 }`、`max: 3` 表示至多三段围栏免木）；`pay-helpers` 对同类 modifier 在 typed flat 的 direct 路径上会先尝试等价的「虚拟抵扣」，仅在 trade 仍无收益时才回退原始 `baseCost`，以保证 `canAffordTypedFlatCost` / `payTypedFlatCost` 与组合支付结果一致。若存在多个围栏支付解，同样先进入统一的 `prompt.selectPayment` 再落围栏
- payment option 文案：`prompt.selectPayment` 中若方案带 `cardUsed`（如 `returnCards`），文案层会优先把 card id 映射为可读卡名，避免直接显示 `Major_*` 这类内部标识

#### 11.6.2e gain params（参数化资源获取）

卡牌效果中"获得资源"统一走 `gain` 原子行动。通过 `params` 字段指定要获得的资源类型和数量：

```ts
// C75_Firewood: after/improvement 获得 1 wood
flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } }
```

`gain` 行动的 `execute` 方法优先使用 `context.params` 中的资源定义。`params` 在 `ActionFlow` 和 `ActionNode` 上均有定义，引擎在 `buildFlowNode` 时传递给 `ActionNode` 构造器。

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

### 12.4 客户端 bundle 边界（PR-4 懒加载落地）

为巩固“前端仅作展示层”的约束，主 bundle **不得**静态 import `shared/cards/register-all` 或 `shared/cards/catalog`。卡牌元数据（`id` / `nameKey` / `cost` / `reward` / `victoryPoints` / `minPlayers` / `reaches` 等）在应用启动时通过 `GET /cards-manifest.json` 经 `client/services/card-meta.ts` 运行时拉取，所有 UI 查询卡牌只面向这份轻量元数据缓存。

客户端收到后端快照后走 `client/services/rehydrate.ts` 这个**轻量 rehydrator**，而不是 `shared/game/serialization.rehydrateState`——因为客户端永远不会执行 `ActionSpace.onTaken` 回调，跳过回调重建这一步即可切断对 `shared/actions` 与 `shared/cards/catalog` 的依赖链。原始 `rehydrateState` 仍保留给服务端使用。

`shared/logic/state.ts` 已拆出 `state-constants.ts`，客户端只引用常量层，不拖 `shared/logic` 里对 actions/catalog 的依赖。`CardRegistry` 新增 `loadByIds(ids, lookup)` 与 `unload(id)`，为后续 draft/按房间动态装卡的玩法（PR-5）打下基础。主 bundle 预算由 `scripts/check-bundle-size.ts` 默认 strict 守护（main ≤ 550KB raw / ≤ 170KB gzip），落地时实际 ~472KB raw / ~143KB gzip。

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

## 14. Draft Phase（PR-5）

开局可选进入 card draft 阶段（lobby 选 `draftMode: 'simultaneous'`，`poolSize: 7..10`）。

- `GameState.phase: 'draft' | 'playing'`（新）、`GameState.draft: DraftState | null`（新）。默认 `'playing'` / `null`，对既有房间零破坏。
- `DraftManager`（`shared/draft/draft-manager.ts`）独立于主引擎，纯函数实现：`initDraftState`、`processSubmit`、`tryAdvanceRound`、`finalizeDraft`。
- 并行玩家提交：每个玩家调用 `GameSession.submitDraftPick(pid, pick)`，server 等全员提交后原子推进一轮（kept += pick，pools 顺时针旋转，round++）。不使用 `PlayerSwitchNode`，也不走 `Engine.step`——draft 与主引擎解耦。
- 7 轮后 `finalizeDraft` 把 kept 灌回 `player.occupationHand` / `player.minorHand`，`phase` 切到 `'playing'`，主引擎走 round 1。
- 协议：`ClientCommand.draftSubmit`（WS 与 HTTP `/api/game/draft-submit` 两条路径）；UI 侧用 `PendingAction.cardDraft` 携带当前池与已提交状态。
- 持久化：`phase` / `draft` 通过现有 `serializeState` 自动 passthrough；SQLite / JSON 房间存档无 schema 改动。
- 隐私：PR-6 已落地 per-connection 视角过滤（见 §15）。issue #7 已关闭，对手池与对手手牌对非 viewer 会被替换为 `'?'` 占位。
- Bundle 影响：draft 相关的 UI（`DraftOverlay` / `DraftPoolRow` / `DraftHistoryPanel`）随 main bundle 发货，落地后 main 为 ~477KB raw / ~145KB gzip，仍在预算内（550KB raw / 170KB gzip）。

## 15. Hand Privacy & Seat Binding（PR-6）

协议层安全加固：之前版本会把所有玩家的 `occupationHand` / `minorHand` 以及 draft `pools` 广播给房间里的全部连接，任何客户端都能直接读到对手的卡牌 ID。同时 WS 命令信任 `msg.playerIndex` / `msg.playerId`，认证用户可以冒充其他玩家发出指令。PR-6 在不改变"后端权威 + 完整快照"模型的前提下，加上 **per-viewer 状态过滤** 与 **seat binding** 两道护栏（issue #7 已在 PR-6 修复）。

### State filter（手牌 / draft 池视角化）

- `serializeStateForPlayer(state, viewerPlayerId)`（`shared/game/serialization.ts`）— 在 `serializeState` 基础上，对 **非 viewer** 的字段做长度保留替换：
  - `player.occupationHand` → 同等长度的 `['?', '?', ...]`
  - `player.minorHand` → 同等长度的 `['?', '?', ...]`
  - `draft.pools[otherPid]` → 同等长度的 `['?', '?', ...]`
  - viewer 自己的手牌 / 池保持真实 ID，方便前端渲染与操作。
- 长度保留是刻意的：前端仍可按位置画牌背、计算"对手有几张"，也保留了未来做 patch/diff 的兼容性。
- 持久化（JSON / SQLite）仍然写 **未过滤的 authoritative state**，filter 只发生在"向某个具体 viewer 发送"这一步。

### 广播层：per-connection envelope

- `broadcastState`（`server/room-manager.ts`）对每个连接都用 **自己座位绑定的 `playerId`** 构造独立的 `StateUpdateEnvelope`，而不是一个 envelope 广播给所有 socket。
- 观察者（未绑定座位的连接）收到的是完全过滤版（所有手牌 / 池都是 `'?'`），防止"旁观" = "信息泄漏"。
- 代价：广播时多了一次 per-connection `serializeStateForPlayer` 调用，但 filter 本身只遍历手牌数组与 draft pool 数组，常数开销，测试里未观察到性能回退。

### HTTP `/api/game/*` 的 opt-in filter

- HTTP 层默认信任（单人 dev 沙箱场景，看到所有手牌是期望行为）。
- 真正进入多人模式时，前端可以带 `X-Viewer-Player: <playerId>` header：
  - 服务端会走 `serializeStateForPlayer` 过滤响应
  - 同时对写操作做 **seat binding 校验**：认证用户请求里的 `playerIndex` / `playerId` 必须与 header 中的 viewer 一致，否则返回 403
- 不设置 header 就不校验，保留 dev / 测试路径的自由度。

### WS 命令 seat binding

- 所有需要指定 "谁在操作" 的 WS 命令都校验 `msg.playerIndex` / `msg.playerId` 是否等于 **连接绑定的座位**：
  - `action`、`choice`、`anytime`、`commitFarm`、`commitSelection`、`reorg`、`feed`
  - `devSetResources`、`devDrawCard`、`devPlayCard`
  - `draftSubmit`
- 校验不通过时返回 `seat mismatch` 错误，不改 state。`assertOwnSeat` / `assertOwnPlayerId` 是共用断言。
- 观察者连接（无座位）发任何写命令都会被拒绝。

### 测试覆盖

- `shared/game/__tests__/serialization-filter.test.ts` — 9 个
- `server/__tests__/privacy-broadcast.test.ts` — 4 个
- `server/__tests__/privacy-http.test.ts` — 10 个
- `server/__tests__/ws-seat-binding.test.ts` — 7 个
- 共 30 个新测试覆盖 filter 对齐、viewer 对称性、seat mismatch 拒绝、观察者隔离等场景。

## 15.1 place-farmer jump mode (Sprint 5 mech-A)

支持卡牌让玩家"借同一 farmer 跳到第二个 action space"的机制（BGA `useActionSpaceNode($space, $farmer)`）。

### 协议

卡牌 listener 返回 jump leaf（`shared/cards/helpers/jump-leaf.ts` 的 `jumpLeaf()`）：

```ts
{
  type: 'leaf',
  actionId: 'place-farmer',
  expandFlow: true,
  sourceCard: 'B130_FullPeasant',
  actionContext: {
    viaCardJump: true,
    sourceCard: 'B130_FullPeasant',
    workerId: '1',
    targetSpaceId: 'fencing',
  },
}
```

### effect 行为（`shared/actions/effects/place-farmer.ts`）

`actionContext.viaCardJump === true` 进入 jump 分支：

1. 反查 fromSpace（含 `(playerId, workerId)` 的格子）
2. `computeAllowedPlacementSpaces` 二次校验 `targetSpaceId` 可达
3. mutate `actionContext.jumpChain = [...prev, sourceCard]`
4. `removeWorkerRef(from)` + `addWorkerRef(target)` + `recordRoundPlacement`
5. `incPlacedFarmers(player)`
6. 返回 `{ type:'flow', flow:{ type:'leaf', actionId: targetSpaceId, expandFlow: true, sourceCard, actionContext } }`。engine 在 `buildFlowNode` 看到 `expandFlow: true` 时，把这个 leaf 展开成 `registry.get(targetSpaceId).flow` 的节点子树（与 `createEngine(actionId)` 路径对齐），outer `actionContext` / `sourceCard` 通过 `engine.mergeContextIntoFlow` 透传到所有内嵌 leaves（深拷贝，inner 已有字段优先）。target action 没有 `flow` 时（grain-seeds / day-laborer / traveling-players）自动 fallback 到 `ActionNode(actionId)` 路径

### 防递归

`actionContext.jumpChain` 累加经过的 sourceCard。listener 自检 `isJumpChainContains(context, CARD_ID)`（`shared/cards/helpers/jump-leaf.ts`）。防 A→A 自跳与 A→B→A 任意长度间接循环。

### per-action 簿记不重置

`actionToken` / `actionStartPlayerSnapshot` / `_activeActionBonusSources` / `cardEffectDeltasSinceFlush` 都不动 — jump 是同 action 延续。

### 引擎扩展点：`ActionFlow` leaf `expandFlow`

为支持 jump（以及未来类似"借同一 leaf dispatch 进 target action 完整 flow"的机制），engine 给 `ActionFlow` leaf 加了可选 `expandFlow: boolean`。语义：

- `expandFlow: true` 且 `registry.get(actionId).flow` 存在 → engine `buildFlowNode` 把 leaf 替换成 `action.flow` 的节点子树
- `expandFlow: true` 但 action 无 `flow` → fallback 到原 `ActionNode(actionId)` 路径（plain leaf actions）
- `expandFlow` 缺省 / `false` → 走原 `ActionNode` 路径，所有现有 leaf 行为不变

实现细节：`engine.mergeContextIntoFlow` 递归遍历 inner flow，把 outer leaf 的 `actionContext` 和 `sourceCard` 注入到每个内嵌 leaf；merge 用 inner 优先（inner 已有的字段不被 outer 覆盖），并整体深拷贝（`action.flow` 是 module-level 常量，不允许污染）。

### 不在范围

- farmer 移动动画（前端 TODO）
- `countAsUse` 行为模型（未来卡需要时再补）
- server 重启时 jump 中途 pending 的恢复（架构层议题，非 jump 特有）
- Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / 直接 stub computeReplace parity）需要 codebase 扩展运行时 unregister API；简单场景已在本 sprint 由 A129 自跳测试 + B150 → major-improvement 间接覆盖

### 使用此机制的卡

A129 Swagman / B130 FullPeasant / B150 LargeScaleFarmer / B152 JuniorArtist。

## 15.2 exchange action 与 actionContext.tradeIds (Sprint 5 mech-C)

`shared/actions/effects/exchange.ts` 的 anytime exchange action（id 原 `'anytime-exchange'`，2026-04-30 重命名为 `'exchange'`，去前缀对齐 `reorganize`）接受 `actionContext.tradeIds?: string[]` 限定显示哪些 trade。

### 协议

```ts
{
  type: 'leaf',
  actionId: 'exchange',
  sourceCard: 'CARD_ID',
  actionContext: { tradeIds: ['CARD_ID'] },
}
```

`execute({ player, actionContext })` 内：

1. 调 `buildExchangeOptions(player)` 拿到玩家所有可用 trade 的选项（每个选项的 `option.sourceCard = trade.sourceId`）。
2. 若 `actionContext.tradeIds` 存在且非空，过滤为只保留 `option.sourceCard ∈ tradeIds` 的项；`'cancel'` 选项总是保留，让玩家能拒绝。
3. 若 filter 后只剩 `cancel`（无任何可换 trade），返回 `{ type: 'fail', logKey: 'log.actionNoExchange' }` 不弹 prompt。
4. 否则返回 `{ type: 'choice', options: filtered }`。

### 注册

trade 通过 `cookeryTrades: Record<cardId, Trade[]>` 全局注册，每条 `Trade` 带 `sourceId` 标识 source 卡。`getPlayerCookeryTrades(player)` 与 `hasAffordableCookeryTrade(player)` 同时遍历 `[...player.improvements, ...player.minorPlayed]`：让 minor 卡（如 E53 BoarSpear）也能 contribute trade，而不仅限于 major-improvement-based cookers。

### 用例

- **玩家主动触发 anytime exchange action**（不传 `actionContext.tradeIds`）：所有持有源卡的 trade 都可见——历史 cookery exchange 行为，零变化。
- **卡 listener 触发 exchange leaf with `tradeIds=[CARD_ID]`**：仅显示该卡的 trade，避免污染玩家平时主动 exchange 的全部选项。E53 BoarSpear 是首个消费者：obtain（`gain` / `collect` / `receive`）after phase 检测到 `result.resourcesGained.boar > 0` 且非 breeding phase 时，弹 SEQ optional → exchange leaf with `tradeIds=['E53_BoarSpear']`，玩家只看到 boar→4food 这一条 trade。

### 与 E85 MasterTanner 的天然联动

E85 监听 exchange action 的 before/after phase；E53 触发的 exchange leaf 走同一个 dispatch 路径，所以 E53 转 boar→food 时 E85 自动看到 boar diff 并按规则 push food 到自己的 stack。两卡解耦，仅通过统一的 exchange action / cookeryTrades 注册表交互。
## 15.3 viaCardJump worker-less variant (Sprint 5 mech-E)

`shared/actions/effects/place-farmer.ts` 的 viaCardJump 分支接受 `workerId` optional。当未传时（worker-less 模式）：

- 跳过 `removeWorkerRef` / `addWorkerRef` / `recordRoundPlacement` / `incPlacedFarmers`
- 跳过 `computeAllowedPlacementSpaces` 校验（调用方负责验证 target 空间合法）
- 仍累加 `actionContext.jumpChain` + 返回 `{type:'flow', flow}`，flow 为 target action 的 `expandFlow` leaf
- cascade dispatch（match place-farmer after listener）照常跑

`jumpLeaf()` helper 同步：`workerId` 字段从必填改为 optional；`actionContext.workerId` 仅在传入时落地。

**用例**：A151 Minstrel 在 returning home phase 触发，没 farmer 在手可借。worker-less 模式让 engine 跑指定空间的完整 flow（如 sheep-market 的 accumulation 自动清零、grain-utilization 的 OR(sow, bake-bread)、major-improvement 的 improvement-any、fencing 的 fence flow），第三方卡 listener 也照常 fire。

**不在范围**：worker-less 模式不修改任何 stats（placedFarmers / familySize / workersAvailable 都不动），也不写 round-placement 历史。这是 BGA `useActionSpaceNode` 的真实语义——"使用空间的完整效果，不是落子"。

### 使用此机制的卡

A151 Minstrel（returning home phase 触发，仅当唯一一个 stage-1 空间未占用）。

## 15.4 gain action 三合一 (Sprint 5 mech-E)

`shared/actions/effects/gain.ts` 的 `gain` action 接受三个可选参数控制 dispatch：

- `recipientPlayerId?: string` — 单一收件人；默认 `context.player.id`
- `recipientMode?: 'self' | 'others'` — `'others'` 表示"所有其他玩家 each"
- `payerId?: string` — 同时扣 payer 资源（用于"对手 pay 给 owner"语义；clamp 在 0）

历史上这三种 dispatch 是 3 个独立 effect（`gain` / `gain-trigger-player` / `gain-other-players`），2026-04-30 Sprint 5 mech-E 合并；后两个 effect 文件已删除。`gain` 的 logKey 按 `recipientMode` 选择：`others` 走 `log.cardEffectOtherPlayersGain`，其它走 `log.cardEffectGain`。

调用方约定：

```ts
{ type: 'leaf', actionId: 'gain', params: { food: 1, recipientMode: 'others' }, sourceCard: ... }
{ type: 'leaf', actionId: 'gain', params: { grain: 1, recipientPlayerId: triggerId }, sourceCard: ... }
{ type: 'leaf', actionId: 'gain', params: { food: 1, recipientPlayerId: ownerId, payerId: triggerId }, sourceCard: ... }
```

`addCardResourceGained` / `addResourcesFromCards` / `trackWorkPhaseBuildingResources` 按 recipient 是否为 source player 分流。

## 15.5 BonusModifier conditions 评估扩展 (Sprint 5 mech-E)

`shared/actions/effects/pay.ts` 的 `getModifiersForCostType` 在非-construct cost type（renovation / improvement / fencing / stables / plow / occupation）按 BonusModifier `conditions` 字段实时过滤。支持的 conditions key：

- `minNumRooms: number` — 评估为 `player.rooms < N` 不通过
- `houseTypeWood / houseTypeClay / houseTypeStone: 1` — 评估为 `player.houseType !== expected` 不通过

construct 路径不变（仍由 `room-payment.ts` 的 `bonusAppliesToRoomCount` 在每次 build 调用时按 `roomCount`（含本次 build）评估，因为 `minNumRooms` 在 construct 上下文是"本次 build 至少 N 个房间"）。

**Follow-up resolved (2026-05-01)**：`Bonus.conditions` / `BonusChoice.conditions`（ComplexCost 路径内嵌字段）现也在 `computeAllBuyableCombinations` 评估（`shared/actions/helpers/payment.ts`）。`payment.ts:523-527` TODO 已删。

**用例**：C13 WoodSlideHammer 持 `conditions: { houseTypeWood: 1, minNumRooms: 5 }`：木屋且 ≥5 间时 stone:2 折扣激活；renovate 后 houseType 变 clay/stone，modifier 自动失效（无需手动从 `activeModifiers` 移除）。

### 15.5.1 Conditions 评估路径分工

| 路径 | 评估位置 | 维度 |
|---|---|---|
| Construct cost (build-room) | `shared/actions/helpers/room-payment.ts` `bonusAppliesToRoomCount` | player + 当前 build 的 `roomCount`（含本次 build） |
| 非-construct cost via `BonusModifier` | `shared/actions/helpers/payment.ts` `getModifiersForCostType` | player-state（前置 filter） |
| `ComplexCost.bonuses` 内嵌 `Bonus.conditions` / `BonusChoice.conditions` | `shared/actions/helpers/payment.ts` `computeAllBuyableCombinations` | player-state（每次 expand 评估） |

`evaluateConditions(player, conditions)` 是后两条路径共用 helper（`payment.ts` export）。construct 路径独立：`roomCount` 维度无法在 `ComplexCost.bonuses` 阶段一次性评估。

`applyCostModifiers` 从 `BonusModifier` 生成 `Bonus` 时**不**propagate `conditions` 字段——modifier 路径已前置 filter，propagate 会导致 evaluator 重复评估。卡牌注入 `bonuses` 用 conditions 时直接写在 ComplexCost 上即可（spec 路径），无需走 modifier。

**已知限制**：renovate-house / engine-driven action 路径下 `computeCosts` listener 返回 `bonuses:[...]` 不会被引擎消费——引擎仅汇总 `costs` (cost delta) 字段并通过 `executionContext.costs` 透传给 action.execute。需要按 player-state conditions 折扣的卡当前应继续用 `BonusModifier` (card definition 上的 `modifier` 字段)，由 `getModifiersForCostType` 路径前置评估 conditions。

## 15.6 stables effect — `actionContext.zoneFilter / max` (Sprint 5b)

`shared/actions/effects/stables.ts` 接受 `actionContext` 上的两个可选字段：

- `zoneFilter?: 'pasture-1'`：限定可放 stable 的 tile 子集；`'pasture-1'` 表示仅 size=1 的 pasture 内 cells（A1 Shelter 用）
- `max?: number`：限定本次最多放几个 stable，会被 `buildStableFarmInteraction` 内的 `structuralMax` 取 min

`costOverride: Partial<Resource>` 早期已支持（`buildStableFarmInteraction` 第 2 参数），`zoneFilter / max` 通过 `options` 第 3 参数加入。`game-core.ts buildStableInteraction` 透传 `pending.actionContext` 到 helper。9 张其他 `actionId:'stables'` 卡（E89/C94/C2/B16/B89/A150/A89/A15）不传新字段时维持原行为。

### 调用约定

```ts
{
  type: 'leaf',
  actionId: 'stables',
  sourceCard: 'CARD_ID',
  optional: true,
  actionContext: {
    max: 1,
    costOverride: { wood: -99 },  // negative delta → final wood cost = 0
    zoneFilter: 'pasture-1',
  },
}
```

## 15.7 fencing entry-guard — `computeFenceFreeAvailable` hook (Sprint 5b)

`CardEffect` 接口新增可选 hook：

```ts
computeFenceFreeAvailable?: (state: GameState, player: PlayerState) => number
```

返回该卡当前能贡献的「免费 fence 上限」。`canStartFencing(state, player)` 在 `shared/actions/effects/fencing.ts` 遍历 `[...player.improvements, ...player.minorPlayed]`，累加每张卡的 free count 计入 `maxBuildable`，对齐 BGA `getMaxBuildableFences`-style 算法：当 `wood + free >= minimumFenceSegments(=4)` 通过 entry-guard。

### 与 `computeFenceDiscount` 双轨

- **`computeFenceFreeAvailable(state, player)`**：entry-guard 阶段，返回上限（不要求 `ctx.newFenceEdges`）
- **`computeFenceDiscount(state, player, ctx)`**：实际 payment 阶段，按真实选边算 discount

E16 BriarHedge 同时提供两者；其他 fence-discount 卡（C16 / C88 / E74 等）按需贡献，不阻塞 5b。

### 签名变化

`canStartFencing` 第一参数从 `player` 改为 `state, player`。6 个 caller 全部同步：
- `fenceAction.canBeExecutedByPlayer` (fencing.ts:64)
- `B26_AgrarianFences.ts:116, 132`
- `B94_StockProtector.ts:51`
- `C88_CarpentersApprentice.ts:50`
- 单元测试 `fencing.test.ts`

## 15.8 Cookery Exchange Metadata-Driven (Sprint 6a)

All cookery trades live in card metadata (`exchanges: CardExchange[]`), not a central registry table. `CardExchange.triggers: ExchangeWindow[]` controls which window the trade appears in:

- `'anytime'` — visible in anytime exchange action (e.g. Major Fireplace1/2 / CookingHearth1/2 / A60 / B32 / D59 / D25)
- `'harvest'` — visible only in harvest feeding phase prompt (e.g. C59 / C105 / D62 / D108 / C109 / E109)
- `'bake-bread'` — visible only in bake-bread action (e.g. E63 / E64 / D64 / Fireplace.grain entry)
- `[]` (empty) — not visible in any window; only listener-triggered (E53 BoarSpear in BGA spec; legacy `'anytime'` retained in our impl)

**Helpers** (`shared/actions/effects/exchange.ts`):
- `getExchangesInWindow(player, window)` — scans played cards' metadata, returns `Trade[]` matching that window
- `getExchangesByTradeIds(player, ids)` — force-include by sourceId regardless of triggers (for listener-driven invocations)

**Sprint 6b cleanup (2026-04-30):** legacy `trigger?: ExchangeWindow` field + `exchangeTriggers()` compat helper removed. All cards now use `triggers: ExchangeWindow[]` directly; see §15.15.

**Removed:** Hardcoded `cookeryTrades` table in `shared/actions/effects/exchange.ts:220-248`; hardcoded `'Major_Fireplace' / 'Major_CookingHearth'` ID prefix detection in `hasHarvestCooking` (now `hasAnyHarvestExchange` walks metadata).

## 15.9 Harvest Exchange Selector Generalization (Sprint 6a)

`shared/session/game-core.ts` `confirmHarvestFeed` selection schema:

```ts
{
  resourceKey?: keyof Resource     // legacy single-resource forward-trade matcher
  count: number
  food?: number                    // legacy
  sourceId?: string
  exchangeIndex?: number           // NEW: pointer into card.exchanges[]
}
```

When `exchangeIndex` is provided, the consumer applies the underlying CardExchange bidirectionally — subtract `from`, add `to` — supporting reverse trades (food → resources) and multi-key trades. When omitted, the consumer falls back to legacy `(resourceKey, food)` matching for forward-trade prompts. `gameTransport.confirmFeed` / `ws.ts feed` selection types updated accordingly.

`buildHarvestFeedOptions` (client) now surfaces every harvest-window exchange with `exchangeIndex` + full `from` / `to`. Affordability gate: every `from` resource must be available.

Feed-queue entry condition relaxed: players holding any harvest exchange enter the prompt even when `remaining = 0`, so reverse trades (e.g. C105 spending bonus food) are reachable after feeding is satisfied.

First consumer: C105 BasketCarrier (`{ from: { food: 2 }, to: { wood: 1, reed: 1, grain: 1 } }`).

## 15.10 family-growth Action Unification (Sprint 6a)

Merged `wishChildrenAction` (id `'wish-children-growth'`) and `growFamilyWithoutRoomAction` (id `'grow-family-without-room'`) into single `familyGrowthAction` (id `'family-growth'`). Routed through `actionContext.skipRoomCheck: boolean`:

- standard `wish-children` space: `actionContext.skipRoomCheck` undefined (default false; require freeRoom)
- urgent `urgent-wish-children` space: `actionContext.skipRoomCheck = true` (no room required)

BGA-aligned: BGA also uses single `WISHCHILDREN` action (urgent variant via `actionCardType`).

Migration: 13+ caller sites updated — 2 spaces (wish-children + urgent-wish-children) + 5 listener cards (E113 Godmother / E92 FieldDoctor / E130 Overachiever / E151 DeliveryNurse / D150 GodlySpouse) + 7 dispatch cards (E22 GuestRoom / C24 BedintheGrainField / C92 AutumnMother / C127 Lover / B127 Seducer / D21 Recruitment / D92 ChildOmbudsman). Legacy `actionId` aliases (`wishChildrenAction` / `growFamilyWithoutRoomAction`) and i18n keys retained as wrapper exports for compatibility.

## 15.11 special-effect Mutation Dispatcher (Sprint 6a)

`shared/actions/effects/special-effect.ts` upgraded from no-op stub to discriminated-union dispatcher with 4 mutation kinds:

```ts
type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }
```

**Use case:** card SEQ children that must mutate `cardStates` only when the player accepts the optional path. Example (D92 ChildOmbudsman):

```ts
{
  type: 'seq',
  optional: true,
  children: [
    { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: 'negativeScore', amount: 2 } },
    { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
  ],
}
```

**Rationale:** previous pattern of `writeCardExtraData(...current + delta)` directly inside `listener.handler` violates "engine sees all mutations" — engine cannot distinguish accepted vs declined SEQ-optional. Routing through the leaf ensures the mutation only fires when the engine actually executes the child.

(Cleanup of existing 4 cards still using direct mutation — E149 / E38 / D134 / C104 — landed in Sprint 6b; see §15.13.)

## 15.12 Ad-Hoc Action Registry (Sprint 6b)

`shared/actions/effects/internal/registry.ts` provides per-card `ActionDefinition` registration. Cards that need a single-card-specific action call `registerAdHocAction(def)` at module load time. ID convention: `'card_<CARD_ID>_<short-name>'`.

Integration: `getActionDefinition(actionId)` in `shared/actions/index.ts` falls back to `getAdHocAction(actionId)` when the static lookup misses. This keeps single-card actions out of the static `internal-actions.ts` import list, preserving the "card encapsulation" principle (CLAUDE.md: 卡牌特殊性能在卡牌文件内部闭包).

**Constraints:**

- ID must start with `'card_'` (enforced; throws on register otherwise).
- Duplicate registration throws (catches accidental double-load).
- LLM workshop sandbox does NOT expose ad-hoc actions: `card_*` actionIds are blocked by `shared/custom-code/ast-validator.ts` actionId allowlist (no entry added).

**Use cases (Sprint 6b inlines 4 single-card effects):** E112 GrainThief (`card_E112_GrainThief_protect`) / E73 Scythe (`card_E73_Scythe_harvest-field`) / B146 Illusionist (`card_B146_Illusionist_discard-from-hand`) / C69 LandConsolidation (`card_C69_LandConsolidation_swap`).

## 15.13 special-effect targetPlayerId Routing + bonus-vp parity (Sprint 6b)

`actionContext.targetPlayerId?: string` extends `special-effect` execute to mutate a specific player (default: `context.player` = actor). Used when a card listener's owner ≠ actor and the mutation should land on the owner. `bonus-vp` learns the same routing for parity.

Example: D134 OysterEater listens to **all** players' fishing place-farmer; the cardStates `skipNextPlacement` and `bonusVp` counter must increment on the **owner** (card-holder), not the actor. The listener emits:

```ts
{
  type: 'seq',
  children: [
    { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
      actionContext: { targetPlayerId: ownerPlayerId } },
    { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID,
      actionContext: { targetPlayerId: ownerPlayerId } },
  ],
}
```

If `targetPlayerId` is unset or the player ID is not found in state, mutation falls back to `context.player`.

**Listener-mutate prohibition (Sprint 6b):** listener handlers and `action.execute` MUST NOT call `writeCardExtraData / setCardFlag / writeCardInfobox` directly; mutations must travel as `special-effect` (or equivalent) leaves so the engine drives replay / SEQ-optional accept-decline / partial-log emission. Sprint 6b cleanup landed for E149 MidnightFencer, E38 RodCollection, D134 OysterEater, C104 Collector. D92 ChildOmbudsman was already compliant from 6a.

## 15.14 Helper Directory Split (Sprint 6b)

`shared/actions/helpers/` (new) holds non-`ActionDefinition` modules previously misplaced in `shared/actions/effects/`:

- `pay-helpers.ts` / `cost-preview.ts` / `room-payment.ts` (pay infrastructure)
- `placement-availability.ts` / `placement-constants.ts` (placement rules)
- `selection-effect-registry.ts` (UI selection registry)
- `feed-family.ts` (harvest helper)

`effects/` is now reserved for `ActionDefinition` exports. File count: 63 → 45 (close to BGA's 22 + necessary engine extensions).

## 15.14.1 effects/ Layout: BGA-aligned root + internal/ (2026-05-01)

`shared/actions/effects/` 顶层只放与 BGA `modules/php/Actions/` 一一对应或紧密相关的 `ActionDefinition`（21 个）；其它"我们额外扩展、BGA Actions/ 中无对应"的 effect 一律放到 `effects/internal/` 子目录（14 个）。

- **顶层 18 个 BGA 一一对应**（22 个减去 `pay` / `receive` / `place-future-meeples` / `place-meeples-from-supply`，外加 `wish-children` 改名为 `family-growth`）：`activate-card / collect / construct / exchange / family-growth / fencing / first-player / gain / improvement / occupation / place-farmer / plow / reap / renovation / reorganize / sow / special-effect / stables`。
- **顶层 3 个半特殊扩展**（语义紧贴 BGA pay / collect / scoring，且自身导出 `ActionDefinition`，不下沉）：`pay-resources / bake-bread / bonus-vp`。
- **`internal/` 14 个**：`build-farmhand-room / emit-choice / future-meeples / move-farmer-to-space / pop-card-stack / push-to-card-stack / recall-placed-worker / reserve-fence-bonus / return-to-space / selection / spend-worker / store-on-card / take-from-card / take-from-space`。`recall-placed-worker` 接受 `workerId` 直接召回 / 不带时进入 choice 模式，并支持 `flagSourceCard` / `logCardTrigger` / `noOpIfMissing` / `targetCardHold` 装饰；`return-first-worker-home` 已合并入此 action（2026-05-02）。同步 helper `cards/helpers/recall-worker.ts:recallWorkerById` 供 onBuy 等同步路径直接调用，不必走 leaf。
- **`registry` (`registerAdHocAction`)** 不是 effect，2026-05-01 已外迁到 `helpers/ad-hoc-action-registry.ts`。

### BGA 对应位但本仓库不实装为 effect 的（实际逻辑由其它路径承担）

| BGA `Actions/*.php` | 我们对应位置 |
|---|---|
| `Pay.php`（836 行 ST_PAY 状态节点） | 算法层 `helpers/payment.ts` + leaf 层 `effects/pay-resources.ts`（节点树拆分） |
| `Receive.php`（接收资源） | 直接走 `effects/gain.ts`（`gainResources / gainAction`），未单独建 receive effect |
| `PlaceFutureMeeples.php`（130 行） | future-meeple 队列由 `effects/internal/future-meeples.ts` 承担（`futureMeeplesAction` + `queueFutureMeeples / resolveFutureMeepleRequests`） |
| `PlaceMeeplesFromSupply.php`（147 行） | family-growth 后激活 worker 直接 inline 在 `effects/family-growth.ts` 内用 `activateSmallestInactive` |
| `WishChildren.php` | 我们重命名为 `effects/family-growth.ts`（actionId `family-growth`；Sprint 6a 已统一 wish-children-growth + grow-family-without-room → family-growth），文件名跟着 actionId |

历史上 receive / place-future-meeples / place-meeples-from-supply 的 .ts 文件曾以"未实装桩"形式存在，2026-05-01 死代码扫描后删除。

新增 effect 时按以下决策：(a) 文件是否导出 `ActionDefinition` → 否则放 `helpers/`（见 §15.18）；(b) 是否对应 BGA `modules/php/Actions/` 中的 PHP action 文件 → 是则放顶层；(c) 否则放 `effects/internal/`。`registerAdHocAction` 返回的 `card_*` 前缀 ad-hoc action 不进 effects/ 目录，直接由卡文件本地构造并注册。

## 15.15 CardExchange.triggers Array (Sprint 6b)

`CardExchange.trigger?: ExchangeWindow` (legacy singular) and the `exchangeTriggers()` compat helper deleted. Only `triggers?: ExchangeWindow[]` remains. 18 carry-over cards from 6a migrated to array form. Empty array = listener-only (visible only via `actionContext.tradeIds`); E53 BoarSpear adopts this. `CanBeExecutedByPlayerContext` now carries `actionContext?: Record<string, unknown>` (engine.ts pass-through), so `anytimeExchangeAction.canBeExecutedByPlayer` can see listener-driven `tradeIds` and avoid spurious "no doable trade" early-resolves.

## 15.16 OptionalNode 自动 lift over OrNode/XorNode (2026-05-01)

`OptionalNode` 包 `OrNode`/`XorNode` 时，引擎不再走"做/不做 → 选哪个"两步交互，而是自动展平成"N 个分支 + skip"一步选择。

- **proceed**：`OptionalNode` 的 child 是 `OrNode`/`XorNode` 时，立刻 `active=true` 并返回 `ok`，让 `nextUnresolved` 直接进入子节点；
- **proceed (OrNode/XorNode)**：当父节点是 `OptionalNode` 时，options 列表末尾追加 `{ value: '__skip__', labelKey: 'ui.interactionOptionalSkip' }`；options 为空时同时 resolve 父 `OptionalNode`；
- **resolveChoice (OrNode/XorNode)**：当 choice === `__skip__` 且父节点是 `OptionalNode` 时，调 `resolveSubtree(node)` 把 OrNode/XorNode 整棵子树标 resolved，再 resolve 父 `OptionalNode`。

效果：卡牌侧可以用 `{ type: 'xor', optional: true, children: [...] }` / `{ type: 'or', optional: true, children: [...] }` 表达"N 选 1 或不做"，不必再用 `OrNode + 末尾 noop decline leaf` 的 workaround。`leaf + optional: true` 行为不变，仍是单 ActionNode 的"做/不做"双选项。

`shared/actions/effects/noop.ts` 已删除——卡牌不应再依赖 `actionId: 'noop'` 占位 leaf。Decline / Skip 文案统一走 `ui.interactionOptionalSkip`。

## 15.18 effects/ vs helpers/ 职责边界（2026-05-01）

`shared/actions/` 下两个目录承担不同角色，文件归属严格按下面标准判断。

### effects/ — 游戏原子动作

**判断标准（必须全部满足）**：

- 文件导出 `ActionDefinition`（含 `id` / `nameKey` / `execute` / 可选 `resolveChoice`）
- `id` 是节点树 leaf 可 dispatch 的 actionId
- 引擎走 hooks（`before` / `during` / `after` / `immediatelyAfter` /
  `computeCosts` / `computeArgs` / `computeReplace` / `isDoable`）能拦截
- 卡牌可以通过 `actions: [<id>]` listener 监听这个动作

**子目录划分**（见 §15.14.1）：

- `effects/<file>.ts`（顶层）：与 BGA `modules/php/Actions/` 一一对应或语义紧贴的 24 个动作
- `effects/internal/<file>.ts`：因节点树模型需要而扩展的 14 个 effect（如 `future-meeples` / `pop-card-stack` 等；BGA 对应位置由 PHP 状态机 transition 或内部方法承担，不暴露为独立 Action 类）

### helpers/ — 共享算法 / 状态库

**判断标准（任一即可）**：

- 不导出 `ActionDefinition`，纯函数 / 纯类型
- 被多个 effect 或卡牌内部 import 复用
- 不在 ActionFlow 节点树里 dispatch，不能被 hooks 拦截

**典型成员**：

- `payment.ts`（826 行支付算法库；`payResources / canPayResources / computeAllBuyableCombinations / executePaymentSolution / applyCostModifiers / returnCardToBoard` 等；被 22 张卡 + 4 个 effect + 引擎 dispatcher 直接消费）
- `pay-helpers.ts` / `cost-preview.ts` / `room-payment.ts`（pay 路径的 cost preview / room 专属支付）
- `placement-availability.ts` / `placement-constants.ts`（落子可达性算法）
- `selection-effect-registry.ts`（卡牌驱动 selection 的 handler 注册表）
- `feed-family.ts`（收获喂食算法）
- `animal-zones.ts`（牧场 / 房屋 / 棚圈动物分布与容量计算；被 11 张卡 + card-effects 中枢消费）
  > 2026-05-01 Sprint 5c：`breed-animals.ts` 已删除；繁殖统一走 `effects/breed.ts`（exports `breed()` core / `breedAction` / `breedLeaf`）。harvest 通过跨玩家 SEQ([PlayerSwitch + breedLeaf('harvest')]) 经 engine；A165 PigBreeder 用 `effect.onAfterRoundEnd` 返回 `breedLeaf(CARD_ID, ['boar'])`。breedAction.execute 在繁殖发生时 return `{type:'animalReorg'}` 让 game-core 自动设 pending，engine `after` phase listener 自然 fire 给 onBreed-aware 卡。
- `ad-hoc-action-registry.ts`（卡内私有 actionId 的运行时注册器；4 张卡用 `card_*` 前缀注册自己的私有 action）

### 对应 BGA 的对照

BGA `Pay.php` 是 PHP 状态机节点（state `ST_PAY`，836 行），同时承担"算法 + 状态调度"两层语义。我们的节点树模型把这两层语义拆开：

- **算法层** → `helpers/payment.ts`（不可 dispatch / 不可 listen）
- **leaf 层** → `effects/pay-resources.ts`（可在 ActionFlow 中显式 `pay X 再 do Y`，可被 listener 监听 / hook 拦截）

### 误入纠正规则

如果 `effects/` 下的文件不满足 effect 标准（典型：纯算法库、纯类型、纯 helper），必须外迁到 `helpers/`。本仓库 2026-05-01 第二轮重构外迁的 4 个文件：

- `effects/pay.ts` → `helpers/payment.ts`
- `effects/animals.ts` → `helpers/animal-zones.ts`
- `effects/breed-animals.ts` → `helpers/breed-animals.ts`
- `effects/internal/registry.ts` → `helpers/ad-hoc-action-registry.ts`

新增 effect 前必须自查：是否有 `ActionDefinition` export？是否能在节点树 dispatch？是否能挂 listener？任何一条不成立，写到 `helpers/`，不要污染 `effects/`。

## 15.19 Trade.sideEffect 数据驱动 dispatcher (Sprint 5c / 6d / 6e)

`Trade` 类型可选 `sideEffect?: TradeSideEffect` 字段，把"应用此 trade 时除了改 player 资源外还需要做的副作用"以数据形式声明。当前变体：

```ts
type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }       // Sprint 5c
  | { type: 'bonusVp'; amount: number }                                   // Sprint 6d
  | { type: 'pushExtraDataValue';                                         // Sprint 6e
      sourceCard: string; key: string; value: string }
```

`shared/actions/helpers/payment.ts` 的 `applyTradeSideEffect(state, player, eff, times, sourceCard)` switch dispatcher：

- `drainSpace`：把指定 `actionSpaces.id` 上的指定资源减 `times`（clamp 到 0）。
- `bonusVp`：在 `cardStates[sourceCard].extraData.bonusVpEarned += amount * times` 累加（owner 维度统计）。`computeBonusScore` 读该字段算分。
- `pushExtraDataValue` (Sprint 6e)：idempotent string-list push to `cardStates[sourceCard].extraData[key]`. 用于 C62 CookeryExtension 记录刚被消费的 cookery id，后续 `computeExchanges` listener invocation 会 filter 掉已 used 的 cookery；`times <= 0` noop。Generic — 任何需要"this source-tagged action consumed once" 语义的卡都可复用。

dispatch 入口三处覆盖 work / anytime / harvest 三条 trade 应用路径：

- `executePaymentSolution`（work / payment 路径，Sprint 5c）
- `exchange.resolveExchangeChoice`（anytime 路径，Sprint 6d）
- `game-core.confirmHarvestFeed`（harvest 路径，Sprint 6d）— bidirectional resource apply 之后 dispatch

`payTypedFlatCost` / `payCardPreviewCost` / `executeResolvedTypedFlatPayment` 三个 wrapper 透传可选 `state` 参数；新增 effect 类型只需在 `applyTradeSideEffect` switch 加 case + 在 `TradeSideEffect` union 加 variant。

`shared/cards/types.ts` `CardExchange.sideEffect?: TradeSideEffect`，`exchangeToTrade` 透传到 Trade，让 metadata-driven exchange 卡（E153 StoneSculptor `triggers:['harvest'] + sideEffect:bonusVp`）能直接声明无须 listener mutate。

落地用例：B155 ArtTeacher computeCosts listener `drainSpace('traveling-players','food')`；E153 StoneSculptor harvest exchange `bonusVp` +1。

## 15.20 onAfterRoundEnd hook (CardEffect) (Sprint 5c)

`CardEffectHook` 联合（`shared/cards/card-effects.ts`）已含 `'onAfterRoundEnd'`；`CardEffect.onAfterRoundEnd?: FlowEffectHandler`。`runCardEffectHook` 通过 generic handler 派发，return value 是 `ActionFlow | void`。

在 `game-core.ts` 中：

- `finalizeRound` → `continueAfterRoundEnd` → `continueStageHook('onAfterRoundEnd', ...)`
- `continueStageHook` 调 `runCardEffectHook(state, player, cardId, hook)`，若 effect 返回 ActionFlow 则 `startStageFlow(flow, 'onAfterRoundEnd', ...)`
- `resumeStageFlow` 的 `'onAfterRoundEnd'` case 完成后回到 `continueAfterRoundEnd` 继续下一卡 / 玩家
- engine 跑 leaf 时若 leaf return `{type:'animalReorg'}`（如 `breedAction`），game-core line 1738 自动设 `pending = animalReorg`

落地用例：A165 PigBreeder `effect.onAfterRoundEnd`：检查 `state.round===12 + boar≥2 + free capacity > 0`，return `breedLeaf(CARD_ID, ['boar'])`。

## 15.21 hasPassFieldAndBreed helper + harvest field/breeding skip (Sprint 6d)

`game-core.hasPassFieldAndBreed(player)` 扫 `player.cardStates` 找 `extraData.passFieldAndBreedRound === state.round` 标记，flag 是 round-scoped、自然失效，无需主动清。

harvest 主路径两个入口前置 filter：

- `continueHarvestReap` 在 forEach 内 skip flagged player 的 reap（不改 stage hook 触发；只跳过 reap 资源动作）
- `continueAfterFeedingPhase` 在构造 breed-leaf flow 之前 filter `harvestOrder` by `!hasPassFieldAndBreed`

stage hook（`onHarvestFieldPhase` / `onAfterReap` / `onEndHarvestFieldPhase` / `onEndHarvestFeedingPhase`）继续 fire，对其他卡监听不破坏。

落地用例：E58 LunchtimeBeer `effect.onStartHarvest` 返 optional SEQ `[gainLeaf({food:1}), special-effect set-extra-data]`，accept 时由 `special-effect` dispatcher 写 `cardStates.E58.extraData.passFieldAndBreedRound = state.round`，本回合 reap+breed 跳过。

## 15.22 collectComputeChoiceCandidates helper + minor-improvement listener candidate injection (Sprint 6d)

`shared/cards/card-listeners.ts` 新增 `collectComputeChoiceCandidates(state, player, actionId)` helper：跑 `computeChoiceCandidates` phase listeners 收集所有 `extraOptions`，与 engine 内 `maybeBuildChoiceCandidates`（用于 OrNode/XorNode）共用同一 phase，但提供给 `execute()`-driven action 显式调用。

`minor-improvement.execute` 在 `buildPlayableMinorOptions` 之后调它合并候选，再用新内联 helper `canAffordInjectedImprovement` 做 affordability 过滤（识别 `major:` / `minor:` 前缀以及裸 id fallback）；`canBeExecutedByPlayer` 也 probe 注入候选让 action 在仅注入候选时仍可达；`resolveChoice` 改用 `playImprovement('any')` 自动处理 minor/major 双类型。

落地用例：D131 CraftsmanshipPromoter listener on `actions:['minor-improvement']` 注入 5 张 BGA bottom-row major 候选（`Major_ClayOven` / `Major_StoneOven` / `Major_Joinery` / `Major_Pottery` / `Major_Basket`，列表来源 BGA `Improvement.php:112-119`）— 让 minor-improvement action 在该卡持有者侧扩出 major 选项，无需新建专属 action。

## 15.23 computeExchanges listener phase + extraExchanges result (Sprint 6e)

A new `ActionHookPhase` value `'computeExchanges'` lets cards inject runtime-derived `CardExchange` entries into the exchange pool without modifying the metadata-driven scan. Sister phase to `computeChoiceCandidates` (§15.22).

`ActionHookResult.extraExchanges?: CardExchange[]` 携带 listener 的贡献。

`shared/cards/card-listeners.ts` 暴露 collector：

```ts
export const collectComputeExchanges = (
  state: GameState,
  player: PlayerState,
  window: string,           // 'anytime' | 'harvest' | 'bake-bread' | ...
): Trade[] => { /* runs computeExchanges listeners, converts each
                   extraExchanges entry through exchangeToTrade */ }
```

`shared/actions/effects/exchange.ts:getExchangesInWindow(player, window, state?)` 在 metadata 扫描结果之后 append `collectComputeExchanges(state, player, window)`。Old call sites（多为 unit tests，传 bare player 不带 state）继续看到 metadata-only pool —— 与今日行为完全一致。

Listener 作者在 handler 里通过读 `ctx.extraData.window`（collector 注入）做 window filter；不需要 `actions:[...]` filter（exchange 不是 action-scoped 的）。

落地用例：C62 CookeryExtension listener body filter `window === 'harvest'`，扫 `getPlayerCookeryCards(player)`，drop 已经在 `cardStates.C62.usedCookeryIds` 内的 cookery，doubles 合法 1-from anytime entry 的 food output（vegetable / sheep / boar / cattle），emits `CardExchange[]` 携带 `Trade.sideEffect.pushExtraDataValue` 让消费时把 cookery id 推入 used 列表。

## 16. 当前结论

项目的主设计应明确为：

- `GameSession` 是单房间唯一权威状态容器
- `RoomManager` 是多人对局的连接与广播中枢
- `WebSocket stateUpdate` 是多人同步的主链路
- 前端以“订阅快照、整体替换、按视角渲染”为核心模型
- HTTP 退居辅助角色

用一句话概括：

> 后端负责裁定和持久真相，WebSocket 负责把这份真相推送到房间内的所有玩家界面，前端只负责基于同一份快照做视角化渲染与输入收集。
