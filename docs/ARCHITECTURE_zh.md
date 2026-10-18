# Open Agricola 架构

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> 本文件是中文翻译镜像；[ARCHITECTURE.md](ARCHITECTURE.md) 是唯一权威版本。

> 当前 `main` 架构的 module 地图。每节说明一个 module 的职责、不变量和 seam，并指向承载细节的入口文件、ADR 和测试。卡牌行为以各卡的测试为准，设计决策见 [`docs/adr/`](adr/)。

---

## 1. 设计目标与不变量

主链路 = **WebSocket 房间对局 + 后端权威 + 前端被动渲染**；HTTP 用于启动、调试、运维、测试，以及版本化的 Game Context、Replay 和 Bug Report 产品接口。

不变量（违反即架构 bug）：

- **后端唯一 owner**：`GameSession`（`server/game/authoritative-session.ts`）是唯一服务端游戏命令入口并持有 `GameState`；具体修改由它驱动的 `GameCore` 和 action leaf 执行。
- **命令驱动**：前端只发"我要做什么"，后端校验、执行、落状态、产生日志后广播。
- **弱客户端**：前端只渲染、收集输入、管理本地 UI 临时态，不裁定规则，也不做乐观提交：等 `stateUpdate` 到达再改游戏 UI。
- **全量快照**：同房间所有客户端收到同一份 `stateUpdate`，前端不做局部 patch。
- **WS 游戏主链路**：`/ws` 收 `ClientCommand`，发 `StateUpdateEnvelope`。
- **InteractionState 是前端唯一交互真相**：`stateId ∈ {idle, wait, gameover}`；`wait` 下用 `request.kind` 分流。
- **单一领域实现**：行动 / 引擎 / 卡牌 / 回合 / 收获 / 计分统一放 `shared/`，前后端共用同一套领域模型。
- **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/` 由 ESLint `architecture/imports` 强制（CI error）；不引入循环依赖。
- **双 client bundle**：`client-app` 不引 `shared/{engine,session,actions,cards,custom-code,draft}`；sandbox 和 Worker 仅按 `scripts/architecture-policy.mjs` 中的精确入口及文件授权。
- **节点树是唯一状态机**："等什么"由 `engine.peekPendingEnvelope()` / pending host 派生。
- **flow 只经引擎 seam 进入**：`EngineStack.push` / `pop` 创建与离开嵌套 frame，`Engine.injectBeforeFlows()` 把 hook 与 anytime flow 插入当前 frame。不直接改 `pending`。
- **ActionFlow 对齐参考实现小代数**：卡牌 DSL 只暴露 `leaf / seq / parallel / xor / or` + metadata；runtime-only node 不进入卡牌 flow。
- **listener handler 不改 state**：listener / preview / doable 路径只 build flow 或返回结构化结果；状态修改必须落在 action leaf 执行阶段。
- **卡牌就地闭环**：卡牌在 `shared/cards/{Deck}/{Card}.ts` 内部完成；`shared/actions/effects/pay.ts` / `shared/actions/effects/improvement.ts` / `shared/session/session-core.ts` / `server/game/authoritative-session.ts` 等核心文件不为单卡修改。新增 Hook 点必须同时补测试和文档。
- **cardStates 局部状态**：持续计数 / 标记写 `player.cardStates[cardId]`；后续选择走显式 `pending` / continuation。
- **Supply token 也是支付资源**：fence / stable 这类玩家 supply 上限不能写死为 15 / 4；读取必须走 supply-token helper 或 payment resource pipeline。
- **Durable Room Commit**：成功且改变公开 Frame 或 Private Session Cursor 的命令，以及任何带 `durableTransition` 标记的响应，先原子写 Room snapshot + Replay Step，随后才按座位视角发送。
- **Replay 全局 Step**：多人同时提交仍占用连续 `stepNo`；自动结算属于最后触发输入，结果不得依赖到达顺序。
- **失败不扩散**：命令错误只回发起者；durable rejection 仍向其他座位发送已提交版本的无错快照。持久化失败冻结同一 Frame 并阻断 Room，不覆盖或继续推进。
- **30 Room 上限**：单实例统计普通 `waiting + playing` Room；只拒绝新建，不影响恢复。
- **历史 Viewer 不可变**：Room 锁定 schema/build，完成回放由 credentialless 只读 Viewer 读取，不执行历史规则代码。
- **测试默认 2 人游戏**：规则正确性站后端边界，不通过 DOM 反推规则。

---

## 2. 总体拓扑

```text
浏览器窗口 p1 / p2 / p3 / p4
        │
        │ WebSocket /ws            ← 主链路
        ▼
server/connection/ws-server.ts
  ├─ 连接生命周期 / auth
  ├─ 命令路由
  └─ 广播 StateUpdateEnvelope
        │
        ▼
server/game/{room.ts, room-registry.ts, lobby.ts}
        │
        ▼
server/game/authoritative-session.ts (GameSession extends GameCore)
  ├─ 唯一服务端游戏命令入口和 GameState owner
  ├─ 继承 GameCore（GameCore 持有 EngineStack）
  ├─ undo 历史 / 行动起点快照
  └─ 计算 InteractionState、scores
        │
        ├─→ shared/session/ (GameCore, phases/)
        ├─→ shared/engine/  (Engine, EngineStack, nodes/)
        ├─→ shared/actions/ (effects/, payment/, hooks)
        ├─→ shared/cards/   (deck A..E + major + community)
        └─→ shared/domain/  (PlayerBoard, farmyard, scoring, ...)
        │
        ▼
server/game/persistence/
  ├─ postgres-adapter.ts (DATABASE_URL)
  └─ memory-adapter.ts   (测试)
```

HTTP 入口 `server/game-router.ts`（`/api/*`）保留：健康检查 / 房间列表 / 快照补拉 / 测试夹具 / dev 调试 / sandbox 创建。

---

## 3. 三层结构与目录骨架

```
shared/        零 React，前后端 + sandbox 共用
├── contract/      协议层（GameState、InteractionState、ClientCommand、StateUpdateEnvelope）
├── engine/        节点树引擎 + EngineStack
├── session/       GameCore + phases/（setup, round, harvest, draft）
├── actions/       行动定义、effects/、payment/、Hook 系统
├── cards/         Card Source（按 deck A/B/C/D/E + major + community 分目录，单卡 meta + impl）
├── domain/        领域聚合层（PlayerBoard、farmyard、pasture、scoring、...）
├── draft/         simultaneous 卡牌选择
├── custom-code/   自定义卡牌 AST 校验
├── i18n/          多语 key
└── utils/         通用工具

server/        Node 进程（HTTP + WS + persistence + custom-code 隔离）
├── index.ts             装配 HTTP + WS + DB + 静态资源
├── connection/          WS 连接层（ws-server, room-router, broadcaster）
├── game/                Room、GameSession、Lobby、RoomRegistry
│   └── persistence/     sqlite / json / memory adapter
├── game-router.ts       HTTP /api/* 路由
├── auth.ts              GitHub OAuth
├── workshop.ts          Workshop / Sandbox 后端
├── workshop-pr/         Workshop PR 集成
├── custom-code/         自定义代码隔离执行（compiler, runtime, executor-worker）
├── payload-validation.ts  纯校验（不写状态）
└── db.ts                PostgreSQL 连接

client/        浏览器 React UI（双 bundle）
├── app/                 顶层路由 + 页面（GameContainerApi、LobbyPage、...）
├── components/          board/、interaction/、common/、header/
├── contexts/            AuthContext、LocaleContext
├── hooks/               useGameSync、useFarmSelection 等
├── services/            gameTransport、card-meta、rehydrate、llm/generation
├── sandbox/             Hot-seat 离线 client（独立 bundle）
└── types/、utils/、styles/、assets/、config.ts、main.tsx

e2e-tests/     Playwright 浏览器测试
```

ESLint 三层强制（`eslint.config.js`）：
- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card source、card generated catalog 和 per-card impl modules；UI metadata 必须走 `public/cards-manifest.json` + `client/services/card-meta`
- 特权入口和 Worker 文件精确列于 `scripts/architecture-policy.mjs`；普通页面和回放不保留规则运行时例外
- 统一解析后的 import 规则覆盖静态导入、重导出、字面量动态导入与 require，避免 flat config 覆盖
- violation = CI error

---

## 4. shared/contract/ — 协议层

本 module 集中存放前端、后端与沙盒共用的数据形状，不含规则代码。前端主 bundle 只能读取 `shared/contract/`、`shared/i18n/`、`shared/domain/` 和以 manifest 为后端的 `client/services/card-meta`。

### 4.1 关键文件

| 文件 | 内容 |
|---|---|
| `contract/types.ts` | `GameState`、`PlayerState`、`ActionSpace`、`Resource`、`InteractionState`、`InteractionRequest`、`ActionDefinition` |
| `contract/workshop.ts` | 工坊 Design Draft、Workspace 与生成候选的前后端协议 |
| `contract/protocol/ws.ts` | `ClientCommand`、`ServerEvent`、`RoomSummary` |
| `contract/protocol/game.ts` | `GameSyncPayload`、`StateUpdateEnvelope`、`StateUpdateCause`、`ActionDetailEffects` |
| `contract/cards.ts` | `CardDefinition`，公开卡牌形状 |
| `contract/prompt-keys.ts` | 作为 i18n 锚点的 `PromptKey` 枚举 |
| `contract/state-constants.ts` | 不含规则代码的行动格与版图常量 |
| `session/serialization.ts` | `SerializedGameState`、`serializeState`、`rehydrateState` |

### 4.2 GameState：领域真相

部分字段：

```ts
{
  round, currentPlayerIndex, gameOver,
  players: PlayerState[],
  actionSpaces: ActionSpaceState[],   // { id, resources, takenBy }
  log: LogEntry[],
  events: GameEvent[],
  nextEventSeq: number,
  publicEventArchive: PublicEventArchivePacket[],
  nextPublicEventArchivePacketSeq: number,
  roundActionOrder: (string|null)[],
  gameSeed: number | string,          // Explicit Seed | wide seed, never sent to viewers
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,
}
```

- `actionSpaces[*].takenBy` 是 `WorkerRef[]`。卡牌创建的联动占用附加 `synthetic: { kind: 'linked-occupancy', sourceCard, linkedWorkerId }`，清理时读取语义 metadata，不读其他卡的 ID。
- `spend-worker` 把卡上人员放到不可交互的 `card-worker:<sourceCard>` holder，由 `shared/domain/card-worker-space.ts` 的纯工厂创建。其 WorkerRef 在归家清理前都是放置事实，即使来源卡离开已打出区域也是如此；恢复时从代码重建 holder 定义，不接受存储的回调。
- `workPhaseObtainedResources`（归家后清空）和 `completedFeedingPhases` 是共享事实，卡牌读取它们，不各自维护计数。
- 放置事实是聚合值：`farm.animalMoved.newlyPlacedOnFarmyard` 统计新安置到实体农场区域的待安置动物（在所有者农场上带 `farmPosition` 的卡牌区域也算实体区域）；`addFarmyardSpaceState(..., eventSink)` 把向实体田地增加的货物记为 `resource.moved`；卡牌逻辑田地仍是独立位置。

**事件与日志。**

- `events` 是公开的结构化规则事件流。后端规则写 `GameEvent`；mapper 派生文本日志、通知、高亮、动画、审计与 Replay。`log` 是缓存，不是规则来源，只有具名缓存边界写入（`appendImmediateEvents()`、`GameCore.flushEngineLog()`），由 `pnpm run check:direct-session-log` 强制。
- 每个公开 `GameEvent['type']` 都登记在 `shared/events/event-mapping-policy.ts`，按消费者标记为已映射、条件映射或刻意静默。新增事件类型时同时补 policy、mapper fixture 和文档。`eventsToLogEntries()` 不写通用兜底行。
- `buildLogPresentationPlan()` 是 Action Log 关系的唯一来源（`rows`、`consumedEvents`、`suppressedEvents`）；客户端不从名字、数量或卡牌 ID 推断关系。
- `EventStore` 为每个新事件分配不透明的 `occurrenceId`，在快照、rebase、取消和投影中保持不变。派生日志行携带 `LogEntry.sourceEvent = { occurrenceId, rowIndex }`；缓存匹配使用它加日志 key，没有这些字段的旧记录保留按参数计数匹配。
- 购卡把 `PaymentInfo.publicPayment` 带入 `card.played.payment`，其 `paymentId` 与对应的 `resource.paid` 事件共享；免费打出携带显式空收据。
- `publicEventArchive` 是只追加的 metadata：`publicEvents.committed` 与 `publicEvents.canceled` 包，写入前校验。规则和 listener 从不读取它。运行时 `publicEventCancellations` 只是恢复响应的 metadata，与归档一样按视角过滤和重映射；重连与 `getState` 从不重放它们。
- 只有 `visibility: 'public'` 的事件进入 `GameState.events`。`privateEvents` 是按视角同步私有提示和手牌 / 选秀变化的层，从不进入 Replay 或规则。

**种子与视角投影。** Game Seed 只在服务端可见（[ADR 0020](adr/0020-game-seed-is-server-private-and-unguessable.md)）；`shared/utils/rng.ts` 负责宽种子与指定种子。`filterSerializedStateForPlayer` 对所有视角删除 `gameSeed`，并把每张未翻开的轮次卡返回为 `null`，包括 `roundActionOrder` 和安排在该卡上的货物的 `actionId`（卡牌效果可通过公开的 `action.revealed` 事件提前翻开）。实时同步、Bug Report 证据与 Replay 座位视角共用此投影。开发房间的 `dev-viewer` 同步保留轮次卡顺序，但仍删除种子；`debug` 是热座房间和开发房间未遮蔽读取用的完整状态。

**持久化形状。** `SerializedGameState` 是公开的网络与 Replay 表示，其 `engineStack` 永远为空。`PersistedSessionSnapshot` 保存权威 `state`、公开 `frame` 和服务端私有的 `sessionCursor`（引擎恢复数据、历史、暂定续行 metadata），后者从不发给任何视角。同步版本和连接不属于 `GameState`。

测试：`shared/events/__tests__/{event-mapping-policy,log-mapper}.test.ts`、`shared/session/__tests__/{serialization-filter,serialization-archive-projection}.test.ts`。

### 4.3 PlayerState 按职责划分

- 身份：`id`、`name`、`color`
- 经济：`resources`、`familySize`、`workersAvailable`、`rooms`、`houseType`
- 农场：含多个 `CropStack[]` 的 `fields`、`roomTiles`、`stableTiles`、`fenceSegments`、`pastures`、Farmers of the Moor 的 `farmTerrain`（顶层 `kind` 与可选 `covered`）、`farmyardExtensions`、`farmyardSpaceStates`
- 动物：`houseAnimals`（按房间位置安置）、`stableAnimals`、`newbornCount`
- 已打出卡牌：`improvements`、`minorPlayed`、`occupationPlayed`
- 手牌：`minorHand`、`occupationHand`
- 持续效果：`majorEffects`、`activeModifiers`
- Supply token：`supplyTokensConsumed` 记录永久消耗的围栏或马厩组件；剩余上限由 helper 计算
- 卡牌局部状态：`cardStates`（§8.3）
- 工人身份：`workers: Worker[]`，五个固定槽 `'1'..'5'`；`isActive` / `isNewborn` 描述永久家庭成员，可选 `supplyUse` 记录预留、待放置或临时放置的供应人物及其处置方式

`PlayerState.fields` 存放 Farmyard Field（底层作物堆在前）。面向卡牌的规则使用 Logical Field seam（§8.5）；只有几何与占用规则才请求 Farmyard Field。

### 4.4 ClientCommand

```ts
type ClientCommand = (
  | { type: 'auth'; token }
  | { type: 'createRoom'; maxPlayers?, name?, customCardIds?, enableCommunityDeck?,
      enableParentCards?, draftParents?, enableThroughTheSeasons?,
      enableFarmersOfTheMoor?, allowIncompleteFarmersOfTheMoorMinorDeal?,
      enableSnakeOpening?, draftMode?, draftPoolSize? }
  | { type: 'joinRoom'; roomId; intent?: 'join' | 'resume'; requestedPlayerIndex?; name? }
  | { type: 'dissolveRoom' }
  | { type: 'getState' }
  | { type: 'action'; spaceId }
  | { type: 'choice'; value; payload? }
  | { type: 'anytime'; actionId }
  | { type: 'commitSelection'; playerIndex; payload: {
      cancel?, positions?, cardIds?, resourceCounts?, resourceBatchExchange?,
      edges?, palisadeEdges?, extraWood?, rooms?, stables?, tile?, crops?
    } }
  | { type: 'roundEnd' }
  | { type: 'undoStep' } | { type: 'undoAction' }
  | { type: 'newGame'; seed? } | { type: 'loadGame'; state }
  | { type: 'devSetResources' | 'devSetRound' | 'devDrawCard' | 'devPlayCard' | 'devCreatePasture'; ... }
  | { type: 'draftSubmit'; playerId; pick }
) & { requestId? }
```

- `newGame.seed` 只在开发房间生效，其他房间忽略它并抽取宽种子。`loadGame` 与 `dev*` 命令在开发房间之外被拒绝。
- 没有单独的 `reorg`、`feed`、`nextPlayer` 或 `confirmPlayerSwitch` 命令：所有等待形态都经 `choice` 提交，`payload` 由 `InteractionRequest.kind` 决定。
- `commitSelection` 只用于结构化的定向选择（farm-position、occupation-hand、resource-quantity、resource-batch-exchange）。职业手牌选择必须是声明上限内无重复的手牌子集，在任何效果或随机观察之前校验。farm-position 可使用服务端校验的 `validPositionGroups`；携带 `sourceCard` / `cardFieldSlot` / `groupKey` 的位置按组计数，由后端规范化。
- Game Variant 开关（`enableParentCards` / `draftParents`、`enableThroughTheSeasons`、`enableFarmersOfTheMoor`、`enableSnakeOpening`）是 Room 选项，跨 `newGame` 与重启保留；`draftParents: false` 时直接给每位玩家一组父母，不进入 `parent-selection`。
- `customCardIds` 只在 `enableCommunityDeck: true` 时生效，且只接受已审核并上线的工坊卡（§11.6）。

### 4.5 ServerEvent 与 StateUpdateEnvelope

```ts
type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error; requestId? }
  | { type: 'authOk'; userId; username }
  | { type: 'roomCreated' | 'gameStarted'
      | 'playerJoined' | 'playerDisconnected' | 'roomDissolved'; ... }
  | { type: 'roomJoined'; roomId; playerIndex; status; players; maxPlayers }
  | { type: 'roomWaiting'; roomId; players; maxPlayers }

type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}

type GameSyncPayload = {
  state: SerializedGameState
  interaction: ClientInteractionState
  privateEvents?: PrivateGameEvent[]
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
  cardWarnings?: string[]
  customCardDefs?: CustomCardDef[]
}
```

- `stateUpdate`、`roomWaiting`、`gameStarted`、`playerJoined`、`playerDisconnected` 与 `roomDissolved` 是广播；`roomCreated`、`roomJoined`、`authOk` 与请求错误是单播。
- 每个广播都按连接的 `viewerPlayerId` 构造：目标玩家收到真实私有提示与 `privateEvents`，其他人收到 `private-prompt` 遮蔽。不带 `X-Viewer-Player` 的 HTTP 沙盒保留不过滤的开发流程；带上它时使用相同的视角过滤与座位守卫。
- `cardWarnings` 只出现在 HTTP 调试与沙盒 payload。HTTP 信封携带 `gameInstanceId`，加载状态后轮换；它既不是授权也不是模型输入。
- 托管写入携带 `commandContext`（scope、稳定命令 ID、Room ID、期望的已提交版本）；同时进行的选秀与父母选择共用一个 input-window ID。路由先解析持久回执再判断新鲜度，拒绝同一身份下内容不同的命令，并把结果随 Room transaction 持久化。回执只含结果标识与哈希，仅对其发起者可见。`requestId` 只关联一次交换。

### 4.6 InteractionState：前端渲染权威

```ts
type InteractionState =
  | { stateId: 'idle';  allowedCommands; anytimeActions }
  | { stateId: 'wait';  allowedCommands; anytimeActions;
      playerIndex; spaceId?; promptKey?; promptParams?; sourceCard?;
      request: InteractionRequest; ...accessor compatibility fields }
  | { stateId: 'gameover'; allowedCommands; anytimeActions; winners?; scores? }
```

`InteractionRequest` 是以 `kind` 区分的和类型：

| kind | Payload 形状 |
|---|---|
| `choice` | `{ options: ActionChoiceOption[], multiSelect?: { valuePrefix, minSelections, maxSelections } }` |
| `farm-select` | `{ farm: { farmType: 'plow'\|'sow'\|'fence'\|'room'\|'stable', selectable*..., maxSelections? }, options? }` |
| `selection` | `{ selection: { selectionType: 'farm-position'\|'occupation-hand', ... } }` |
| `animal-reorg` | `{ zones: InteractionAnimalReorgZone[] }` |
| `feed` | `{ remaining; foodUsed; feedQueue? }` |
| `confirm-next-player` | `{ nextPlayerIndex }` |
| `confirm-player-switch` | `{ fromPlayerIndex; toPlayerIndex }` |
| `card-draft` | `{ mode: 'simultaneous'; round; totalRounds; poolSize; seatOrder; pools; pendingPicks; kept }` |

前端按钮使用 `allowedCommands` 中的 `InteractionCommand`：

```text
takeAction | resolveChoice | commitSelection | takeAnytimeAction | undoStep | undoAction
```

- WebSocket `ClientCommand.type` 与 `InteractionCommand` 不一一对应；前端只按 `allowedCommands` 判断能做什么，在线命令规范化为 `choice`、`commitSelection`、`action` 等协议名。
- `shared/session/interaction-state-adapter.ts` 是服务端投影 seam。`GameCore.buildInteraction()` 传入当前状态、`EngineStack`、anytime、撤销与计分快照，以及一个 `projectPendingRequest(...)`；请求 payload 的构造都在它背后。`redactInteractionForViewer` 只消费已派生的 `InteractionState`。
- 每个新交互都显式暴露命令与选项，并由后端校验。改良选择值是裸 `cardId`；支付选项保留 `pay:*` 命名空间。不使用编码过的选择捷径，也不由前端裁定。
- 原生卡牌效果可实现 `CardEffect.projectInteractionRequest(state, player, request, actionId)`，这是限定于自身 pending 行动的纯查询。Session 以实际的 pending 所有者调用它，在展示、权威命令和单选推进之前刷新选项可用性与数量上限。它保留提示 metadata、已接受的决定、缓存的随机观察与进度，从不重跑执行、支付、抽牌或日志。
- `emit-choice` 的 `multiSelect` 提供独立候选，其值非空且不含逗号；客户端提交 `valuePrefix + values.join(',')`。通用校验在任何卡牌 hook 之前拒绝未知、禁用或重复的候选以及超出当前上下限的数量，结构化前缀准入也不能绕过它。`minSelections: 0` 允许空子集；多选总是需要显式确认。
- 关于接收者手牌中可见卡牌的私有选择可设置 `promptParams.cardId`；非接收者收到不含该 ID 的 `private-prompt`。前端从不读取 `cardStates`。

测试：`shared/engine/__tests__/pending-validation.test.ts`、`shared/session/__tests__/{interaction-state-adapter,interaction-command-policy}.test.ts`、`server/__tests__/rejected-pending-input.test.ts`。

### 4.7 ActionChoiceOption 与预览

```ts
type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ResourceExchangePreview | PaymentPreview | TextPreview
  descriptionPreview?: ActionDescription | ActionDescriptionGroup
}
```

Choice Preview 由共享的可执行规则计划派生（[ADR 0024](adr/0024-choice-previews-use-shared-rule-plans.md)）；卡牌不加展示回调。

- `effectPreview` 的类型包括 `resourceExchange`、`payment`、`text`、`resourceMovement`、`futureSchedule`、`futureOffers`、`actionSpace`、`cardScore` 和 `fieldContents`，完整集合见 `shared/contract/types.ts` 中的 `ChoiceEffectPreview` union。它们由纯查询 `ActionDefinition.previewEffect` 产生。未来请求与执行共用 `normalizeFutureSchedule`（目标过滤、前缀、条件、费用、房间类型）。`seq(pay, gain[, bonus-vp])` 的预览自动聚合，手写的 pay 与 gain leaf 也一样。
- `descriptionPreview` 递归描述 flow（`ChoiceDescriptionPreview`）：顺序、互斥与可兼选择、并行顺序、可选性和执行者。`Engine.describe()` 读取可执行 flow 而不推进；`Engine.describeFlow()` 描述独立计划；不透明的原生行动提供纯 `ActionDefinition.flowFactory`，执行也调用它。基础描述不含玩家 modifier，并保留所有条件分支；延后的数量在到期前保留其公式。
- 可见选项文字来自 `descriptionPreview` 与 `effectPreview`；`choiceLabelKey` 只用于语义覆盖。`special-effect` 从 `params.kind` 提供语义描述，纯展示同步不出现在描述中。
- 预览描述的是声明的效果，不保证未来条件成立。连续且相同的未来条目合并，其他条目按顺序分别显示。
- 当前交互选项使用 Interaction Player 与权威支付求解器，包括数量上限与替代支付来源。
- 农场格选择携带 `ActionChoiceOption.target`（执行者、逻辑田、位置、Card Field 槽）与 `targetCard`；客户端渲染这些事实并提交不透明的值。
- `collectScheduledEffectPreviews()` 把计划领取、offer、定时规则和义务投影为 `ScheduledEffectPreview`（轮次、阶段、来源、描述、重复次数）。分组只影响展示；按玩家过滤会去除隐藏来源与未翻开的行动身份；rehydrate 会剥离这些投影，它们在并入快照 Frame 前先经过 JSON 边界。

测试：`shared/actions/__tests__/future-schedule-preview.test.ts`、`server/__tests__/anytime-description-session.test.ts`。

### 4.8 LogEntry

`LogEntry { key, params, playerId? }` 携带 i18n key 与参数，按当前语言渲染。开局条目可带稳定的 `playerId`，座位显示名变化时按身份刷新。

---

## 5. shared/engine/ — 节点树引擎

节点树是唯一的状态机：引擎游标决定等待什么输入，不存在 `PendingAction` union。

### 5.1 文件

```text
shared/engine/
├── engine.ts              Engine 类
├── engine-stack.ts        EngineStack 子流程帧栈
├── engine-resolve.ts      resolveChoice 路径
├── engine-proceed.ts      step 与推进路径
├── dispatcher.ts          Hook 与 listener 分发
├── tree.ts                节点树构造
├── registry.ts            ActionDefinition 注册与查找
├── log-store.ts           缓冲日志
├── types.ts               EngineContext、EngineFrame、EngineStackCursor
└── nodes/
    ├── base.ts            BaseNode 与共享 metadata / pending 状态
    ├── action-node.ts     原子行动 leaf
    ├── sequence-node.ts
    ├── parallel-node.ts
    ├── xor-node.ts
    └── or-node.ts
```

### 5.2 节点类型

- 领域 `ActionFlow` 遵循参考实现的节点代数，只暴露 `leaf`、`seq`、`parallel`、`xor`、`or`。`optional`、`promptKey`、`sourceCard`、`choiceLabel*` 与 `targetPlayerId` 是 metadata，不是节点类型；运行时专用节点从不进入卡牌 flow。
- 运行时树有五种具体节点：`ActionNode`、`SequenceNode`、`ParallelNode`、`XorNode`、`OrNode`。跨玩家归属、可选状态、触发选择、listener 激活与 pending 状态通过节点 metadata、内部 leaf、pending envelope 和帧状态表达，不用包装节点。
- `targetPlayerId` 编译为目标子树上的 `ownerPlayerId`；显式指定的子节点 owner 优先。所有动态插入路径都携带当前有效 owner，游标持久化 owner，不从 `currentPlayerIndex` 推断。`injectBeforeFlows()` 只排出当前玩家拥有的节点，其他节点交回 Session driver。
- `XorNode` 保存 `selectedChildId` 并只走完该分支；被 OR/XOR 直接选中的 leaf 保存 `selectedBranchChoice`。该 leaf 未发出自身请求就完成时，其尾随反应以此为 `choice`；发出自身请求的 leaf 以提交的值完成。`ParallelNode(mode='trigger-select')` 实现反应选择（§7.7）；`resolveAfterSelection` 让它只选一次。
- 共享 metadata：`ownerPlayerId`；`optional` / `optionalActive` / `optionalPromptKey`（XOR 与 OR 保留直接的 `__skip__`）；`mandatory`，`afterHostCommit` 子节点与动态返回的 flow 递归继承，之后无法执行的 leaf 返回 mandatory-blocked，Session 进入只能撤销的 `engine-blocked`；`selectedChildId`；`pending: PendingEnvelope | null`。
- leaf 返回的每个请求都会打开 pending envelope，其选项来自 `interactionRequestChoices()`；提交后才执行完成反应。`InteractionRequest` 是协议形状，不是节点。
- `before` 反应 leaf 可返回按命名空间和来源组织的 `beforeHostContributions`；引擎通过 `continuationParentHostNodeId` 把它们写入尚未开始的宿主 `actionContext`。没有有效 before 宿主的贡献会失败，同一来源重复贡献时替换原条目。它们随宿主经历 pending、恢复与撤销，嵌套或另行授予的行动不继承它们。

### 5.3 Engine 公开 API

`Engine` 向 `GameCore` 暴露一个小 interface：

- `step(ctx)`：推进到下一个未解决的节点，遇到 pending 输入停止。
- `resolveChoice(value, ctx, payload?)`：提供玩家输入并继续。
- `peekPendingEnvelope()`：当前 `PendingEnvelope`，或 null。
- `peekPendingHost()`：承载该 envelope 的节点，用于查找 `sourceCard`、`actionContext` 与 owner。
- `injectBeforeFlows(flows, ctx?)`：插入 hook flow。
- `snapshot()` / `restore(snapshot)`：序列化与重建节点树，包括节点状态、pending envelope、owner、可选与触发 metadata。
- `hasPendingChoiceCompositeAncestor()`：供 anytime 处理判断是否处于分支祖先中。
- `describe()` / `describeFlow()`：纯描述（§4.7）。

`GameCore.engineDeps()` 与每次引擎 `proceed` 共用 `syncDynamicActionSpaces()`，为执行目录中缺少定义的棋盘格补注册；卡牌只通过公开机制创建格子，从不触碰 Session 注册表。缺少定义是内部不变量错误，会回滚权威命令。

测试：`shared/engine/__tests__/{engine,engine-flow,tree-selected-branch,restore-regressions,optional-node-context}.test.ts`。

### 5.4 EngineStack

`engine-stack.ts` 中的 `EngineStack` 持有 `EngineFrame[]`：

```ts
type EngineFrame = {
  engine: Engine
  source: SubFlowReason
  ownerPlayerIndex: number
  spaceId?: string
  stageResume?: StageResume
  reason: SubFlowReason
}
```

- API 为 `push`、`pop`、`current`、`depth`、`peekPendingEnvelope`、`peekPendingHost` 与 `toCursor`。`push` / `pop` 创建与离开嵌套 frame（子流程、确认、农场选择）；hook 与 anytime flow 通过 `Engine.injectBeforeFlows()` 进入当前 frame。任何代码都不直接修改 `pending`。
- `EngineStackCursor` 序列化到 `PersistedSessionSnapshot.sessionCursor.engineStackCursor`；公开与 Replay 的 `SerializedGameState.engineStack` 保持为空。
- 撤销历史保存整个栈的独立游标（每一帧、帧身份、原因、阶段续行、延迟切换与 resolve 边界）；`undoStep()` / `undoAction()` 重建它而不推进。
- `SubFlowKind` 为 `choice`、`animal-reorg`、`confirm-next-player`、`confirm-player-switch`、`feed`、`farm-select`、`selection` 或 `card-draft`。`post-reap-anytime` 等合成窗口同时出现在 `SubFlowReason` 与 `PendingSyntheticKind`。

测试：`shared/engine/__tests__/engine-stack.test.ts`。

---

## 6. shared/session/ — 会话层

`GameCore` 协调 `GameState`、`EngineStack`、历史、阶段推进、交互构造、撤销与响应。`phases/` 中的阶段函数是纯 helper，不是 mixin；所有协调都汇聚在 `GameCore`。

### 6.1 文件

```text
shared/session/
├── session-core.ts        GameCore 命令入口
├── serialization.ts       SerializedGameState 序列化
├── state-bootstrap.ts     初始状态构造
├── stats.ts               统计与日志
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

### 6.2 GameCore 入口

`GameCore` 持有 `state`、`engineStack`、带行动起点快照的步骤历史，以及终局计分缓存。`GameSession`（`server/game/authoritative-session.ts`）是薄包装，注入隔离的自定义卡执行器，并构造按视角过滤或调试用的 payload。对服务端暴露的命令：

```text
takeAction(playerIndex, spaceId)
takeSpecialAction(playerIndex, cardId, actionId, payload?)
takeAnytimeAction(playerIndex, actionId)
resolveChoice(playerIndex, value, payload?)
commitSelectionChoice(playerIndex, payload)
resolveOrdinaryCardDrawChoice(playerIndex, choiceId, keepCardId)
performRoundEnd()
loadState(raw)
undoStep() / undoAction()
```

### 6.3 统一的 SessionResponse

```ts
type SessionResponse = {
  ok: boolean
  state: GameState
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}
```

- Session 测试直接断言这一结构；WebSocket 路径通过 `GameSession.buildSyncPayload()` 序列化并按视角过滤。
- 每个修改命令都经过一个结算边界（[ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)）。输入拒绝恢复完整的命令检查点，包括历史与行动起点 metadata；已接受的必选阻塞保留其效果。仅凭 `ok:false` 或 `recoverable:true` 不能判定为拒绝。规则上合法但破坏守卫的命令保留其持久的暂定恢复与失败记忆；在受守卫范围内提交的非法输入两者都不获得。

测试：`server/__tests__/{authoritative-command-settlement,rejected-pending-input}.test.ts`。

### 6.4 轮转、额外回合与供应人物

**额外回合**（[ADR 0001](adr/0001-a92-adoptive-pull-model-extra-turn-hook.md)、[ADR 0008](adr/0008-node-parallel-reaction-dispatch.md)）：

- `contributeExtraTurn?: (state, player) => ActionFlow | void` 是 `CardEffect` hook，由 `shared/session/phases/round.ts` 的轮转显式消费，`runCardEffectHook` 不会执行它。
- `collectExtraTurnContributions()` 是唯一来源；`hasPendingExtraTurn()` 据此判断，`collectExtraTurnFlow()` 构造交互。三个门禁把待处理的额外回合视为资格：`nextSeatedPlayerIdx`、`roundWorkComplete` 与轮转跳过循环。
- `startPendingExtraTurnIfAny(core)` 是唯一注入路径，工作阶段入口、确认下一玩家的轮转、加载状态与撤销恢复共用，且只在当前座位的空栈中注入。带 `extraTurnBeforeWorkers: true` 的 provider 与普通放人及合法的沼泽特殊行动并列出现；其余 provider 在普通工人用完后才运行。供应类 provider 只有在普通工人用完后才能放弃；选择普通放人会保留之后的机会，除非该卡要求占用第一个回合，此时它在 `onEndTurn` 中消耗该机会。待处理的普通抽牌会推迟注入。
- 可重复的 provider 可定义 `countExtraTurns`。跳过与强制消耗按来源卡计入 `PlayerState` 字段，`countPendingExtraTurns()` 复用 provider 聚合，而不用玩家级计数器；只有在必须自动推进时，非交互回退才按稳定卡序消耗一个来源。
- `onBeforePlayerTurn` 返回 `{ skipTurn: true }` 时，轮转在该玩家回合开始前跳过他。
- Snake Opening（单座位时忽略）让每位玩家以 3 食物开局。第 1 轮中，`nextWorkRotationIdx()` 在工作轮转第一次要越过本轮工作顺序起点时反转，发出 `snakeOpening.reversed`，并在该工作阶段内保持反向；其他顺序使用正向 helper。

**供应人物：**

- 供应放人使用 `place-farmer` 加 `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`。执行时在显示目标前锁定一个有限的工人 ID；提交、事件、联动占用、移动与撤销都保留它。卡牌驱动的放人在当前 Turn Scope 中记录人员行动身份。
- `inactiveWorkersInSupply()` 排除预留、待放置、临时人物与已移除 token；`availableWorkers()` 包括召回的临时人物，而家庭人数、住房、喂食与计分只用永久成员。
- `returnSupplyWorkers()` 在所有 `onBeforeReturnHome` 之后、`onStartReturnHome` 之前执行，移除该 ID 的所有位置并按处置方式处理；被召回或移动的人物保留其处置方式，没有到期归还轮次的预留在归家后仍然保留。此前 `recordReturnHomePlacements()` 在 `__roundPlacement__` 中记录最终位置；归家效果读取 `getReturnHomePlacements()` 或 `getReturningPersonPlacements()`（排除合成占位与已移除人物），从不读实时占用。
- 预留与放置机会是两回事；预留卡在其声明的时机释放预留（例如在目标轮的 StartOfTurn 树中）。供应机会使用普通的当前步骤准入：已接受但没有合法目标的使用会阻塞，直到显式撤销，没有未来目标预检或退款。
- 额外住房到期时先清除其容量；住房不足时只永久移除稳定家庭顺序中的第一名活动成员（`removedFromSupply`、清除引用、发出 `to=removed` 的 `worker.returned`）。

测试：`server/__tests__/{supply-workers-session,snake-opening-session}.test.ts`。

### 6.5 Turn Scope 与行动执行作用域

轮转机会、Turn Scope 与行动执行作用域是三种独立的生命周期。“在你的回合”与“同一回合”读取 Turn Scope；“实际建造 / 犁 / 播了什么”读取当前行动的作用域或 transaction。

| 规则情形 | 轮转机会 | Turn Scope | 行动执行作用域 |
|---|---|---|---|
| 轮转选出的普通放人或沼泽特殊行动 | 消耗当前机会 | 开启新作用域 | 每个完整规则行动一个 |
| 贡献的额外回合 | 开启额外机会 | 开启新作用域 | 每个完整规则行动一个 |
| 经 `move-farmer-to-space` 的工人移动（每名移动的工人） | 无新机会 | 每名移动的工人开启新作用域 | 每个完整规则行动一个 |
| 仍属于当前回合的即时规则行动 | 无新机会 | 继承当前作用域 | 开启新作用域 |
| 不算回合的阶段或 anytime 规则行动 | 无新机会 | 无 | 开启新作用域 |
| 单纯的获得、支付、选择或 listener 激活 | 无新机会 | 若存在则继承 | 留在外层作用域 |

- Turn Scope 在放人、沼泽特殊行动或卡牌驱动的行动格使用之前开始，覆盖该回合的每个规则行动、尾随效果、必需的整理和回合结束 hook，之后清除，之后的处理不会再看到已完成回合的身份或起点快照。移动工人产生的回合把普通人员行动的触发身份传给这些 hook，并在选择下一名工人前关闭。
- 执行“在你的回合”效果需要 owner 的活动作用域；可执行性查询可以投影当前轮转玩家即将开启的作用域。
- 同一回合的多个规则行动共享 Turn Scope，各用独立的行动作用域。按行动的差值使用行动 transaction。
- 同一人物的 `jumpLeaf` 跳转与不放人的 `viaCardJump` 使用留在外围 Turn Scope（如有）中；只有 `move-farmer-to-space` 用 `turn-scope` begin / end 包住每次移动。
- `actionContext.trueAction` 只表示一个效果对 listener 而言是否算作执行了具名行动；它不开启回合，也不开启行动作用域。
- **人员放置序号**按 Work Placement Chronology 中的正常人员放置计数：同一工人移动不推进；正常放置临时或召回的人物会推进。`isCurrentActionSecondPersonPlacement()` 优先使用当前上下文的 `placedWorkerId`。

测试：`server/__tests__/{person-placement-order-session,move-farmer-before-placement-session}.test.ts`。

### 6.6 快照数据与可执行规则恢复

见 [ADR 0028](adr/0028-session-recovery-preserves-authoritative-snapshot-data.md)。新局创建负责初始发牌。加载或恢复 Session 时保留现有的空手牌、已存的卡牌身份、缺失的可选规则字段、动物安置与历史；从不重新发牌，非法的必需输入会被拒绝，而不是转成新局。`rehydrateState()` 只解码数据；所属 Core 随后重建已知的可执行定义与引擎游标，不替换捕获的数据。撤销、命令检查点、暂定检查点与进程恢复共用这一契约。

测试：`server/__tests__/session-recovery-data.test.ts`。

---

## 7. shared/actions/ — 行动定义与 Hook 系统

本 module 负责行动定义、卡牌 hook 与 listener 挂接的行动生命周期、支付、阶段 hook 和农场类提交。单卡规则留在卡牌文件里，只通过下面的 seam 接入本 module。

### 7.1 目录

```text
shared/actions/
├── index.ts               actionDefinitionLookup Map；自动发现基础行动与内部行动
├── flow.ts                ActionFlow：leaf、seq、parallel、xor、or 及可选 metadata
├── hooks.ts               Hook 注册与分发
├── hook-matrix.ts         buildHookMatrix() 优化矩阵
├── internal-actions.ts    mark-card-trigger 等内部引擎行动
├── effects/               基础行动，每个行动一个文件
│   └── internal/          内部 effect
├── factories/             行动工厂
├── helpers/               支付、动物、农场共享 helper
├── payment/               PaymentSolver 与执行器
└── __tests__/
```

### 7.2 `ActionDefinition`

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  rulesKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>
  canBeExecutedByPlayer?(state, player): boolean
  canBeOfferedByPlayer?(state, player): boolean
  originalActionCondition?(context): boolean
  isAlreadySatisfied?(context): boolean
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  flowFactory?(planningContext): ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

- `descriptionKey` 是印刷行动文字；`rulesKey` 是独立的本地化补充裁定，不影响合法性与执行。
- Hook 不属于 `ActionDefinition`。通用变体规则注册到当前 Core 的 `ActionHookRegistry`；卡牌反应用 Card Listener。
- `getBaseChoiceOptions` 是 opt-in 的选择管线：基础选项、注入 `computeChoiceCandidates`、按 `value` 去重、按 `costPreview.canExecute` 过滤。零候选失败，一个直接结算，两个及以上弹选择。它与 `execute() → choice → computeArgs.extraOptions` 路径互斥。
- `flowFactory` 是纯数据计划，执行与描述共用。
- `canBeOfferedByPlayer` 在显式可选 offer 中区分非支付资格与支付能力：有资格但付不起时选项仍可见、Accept 禁用；资格本身不授权执行。
- `originalActionCondition` 与 `isAlreadySatisfied` 见 §7.5.1–§7.5.2。

测试：`shared/engine/__tests__/engine-choice-candidates.test.ts`、`shared/actions/effects/__tests__/improvement-offer.test.ts`。

### 7.3 Effect 与内部行动

- `shared/actions/index.ts` 只导入顶层基础 effect 和 `effects/internal/` 来构造 `actionDefinitionLookup`。`scripts/check-effects-file-list.ts` 是顶层 effect 文件的唯一白名单，`shared/actions/effects/__tests__/architecture-guard.test.ts` 复用它。
- 每个行动一个文件。effect 文件不堆叠多卡逻辑：宿主行动子步骤用 `internalChildren`，内部 effect 放 `effects/internal/`，纯 helper 放 `shared/actions/helpers/`。
- listener 需要的状态修改若没有现成 leaf，就新增可复用的内部行动，不在 handler 里直接改（§7.7）。

通用内部行动及其契约：

| 行动 | 契约 |
|---|---|
| `collect` | 从累积格取物的唯一入口，部分领取和跨格领取通过 `actionContext: { spaceId?, resource?, amount? }`。卡牌提供的累积格声明 `gainPerRound`，货物存于 `ActionSpace.resources`。 |
| `gain` | 结算前先确定接收者。付款方出资的 gain 先校验完整转账再移动资源，事件保留付款方来源。显式资源参数与行动格配置的基础收益分开识别。 |
| `return-to-space` | 把货物返还到 `actionContext.targetSpaceId` 指定的格；支付与移动事件使用同一目标。 |
| `place-farmer-on-space` | 在固定目标上额外放一名工人，通常随后展开目标 flow；`params.executeTarget: false` 只放工人、不展开目标。`allowOccupied` 只放宽占用，不绕过封锁、轮次开放、可执行性或工人供应。卡牌不在 handler 里写 `ActionSpace.takenBy`。 |
| 无人物使用与固定目标跳转 | 卡牌可不放置、不消耗人物而执行完整行动格 flow（`place-farmer.actionContext.viaCardJump`），或把绑定工人跳转到固定目标（`jumpLeaf`）。查询与执行绑定同一工人；费用、否决、联动封锁和防递归仍生效。 |
| 授予的规则行动 | 卡牌授予规则行动时直接调用该行动；授予某行动不展开平时提供它的整个行动格。 |
| `pass-minor-card-to-left` | 把已打出的小改良移入左侧玩家手牌，清除其卡牌状态，发出公开 `card.passed` 与私有手牌变更。后续触发读取 `card.passed`。 |
| `individual-food-cost` | 职业的强制个人食物费用，独立于职业费用和 PaymentSolver：支付现有食物，缺口用乞讨补；缺粮时需显式确认；预览与结算读取实时库存。 |
| `take-from-card` | 先扣来源卡 counter，再把入库委托给 `gain`，因此 Gain reaction 能观察从卡上移出的货物。listener 只订阅二者之一。 |
| `special-effect` | listener 返回 leaf 的通用修改分发器：counter、flag、infobox、卡堆、supply token、农场格状态与标记领取。`claim-farmyard-goods-tokens` 按来源领取，可选附带已提交坐标。`countCardUse: false` 标记不应计为卡牌使用的整理操作。 |
| `receive` | 在一次 transaction 中为一名玩家结算到期的未来货物，见 §7.6。 |
| `activate-card` / `activate-card-effect` / `activate-extra-turn` | listener、阶段效果和额外回合 provider 的激活 leaf，见 §7.6–§7.7。 |
| `reap` | 普通收获与私人田间阶段收获，见 §7.6。 |

- 职业可用性、选择提交和直接 / 免费打出共用同一个前置门禁。改良费用预览与支付以授予的 `sourceCard` 或实体行动格 ID 作为 `actionCardId`。
- 选择类后续行动在 `actionContext` 中携带语义来源（例如 `extraCropPlacement`）；后续卡牌读取该标记，不读来源卡 ID。

测试：`shared/actions/effects/__tests__/{collect,gain,place-farmer-on-space,place-farmer-jump,take-from-card,special-effect,farmyard-goods-claim}.test.ts`、`server/__tests__/empty-accumulation-admission-session.test.ts`。

### 7.4 `payment/`

`PaymentSolver`（`solver.ts`）是支付的唯一生产入口：可负担方案、支付选项、选项解析、执行和结构化收据，以及费用预览、typed-flat 费用、房间支付、简单 trade 副作用和卡牌费用候选 helper。`payment/internal/*` 只供 payment 包及其算法测试（`shared/actions/payment/internal/__tests__`）使用；`shared/actions/payment/__tests__/import-boundary.test.ts` 禁止其他导入。外部测试使用 `PaymentSolver` 或 `shared/actions/payment/__tests__/test-helpers.ts`。

**统一的 `ComplexCost` 模型。** 建房、翻修、围栏、马厩、犁地、职业、大小改良和 `pay` leaf 都经 `computeAllBuyableCombinations` 枚举：

| 字段 | 含义 |
|---|---|
| `fees` | 每次行动的固定费用。`computeCosts.costs` 的差值并入 `fees[0]`；负总额 clamp 为 0，折扣不会退还其他资源。 |
| `unitFee` + `nb` | 单位费用乘数量（房间、翻修房间、围栏段、马厩）。 |
| `trades` | `from → to` 替代。`Trade.scope: 'action'` 每次行动对资源池转换一次；`'unit'` 对每个单位行运行候选闭包。`minCost` / `maxCost`、`replaceUpTo`、`groupMin` / `groupMax` 约束使用次数；每个单位 `TradeUsage` 记录实际替换量。 |
| `bonuses` | 每次行动的折扣或折扣选择。`optional` 增加不用折扣的分支；`capDiscountAtCost` 把可变折扣封顶在当前费用；`trackChoiceIndex` 记录 `bonusChoiceIndex`；只有 `choiceAffectsState` 让选择免于支配剪枝；`conditions` 按数量重新求值。 |
| `costResourceRemovals` | 已应用的删除 `{ resource, sourceCard, savedByFee }`。输入是卡牌的 `CostResourceRemovalModifier`（`type: 'remove-resource'`，属于 `CostModifier`，不是 `ComplexCost` 的 key）；`applyCostModifiers()` 在枚举前从所有费用中删除该资源并记录到这里，使枚举在后续折扣后仍保持删除并归属节省量。表达“不再需要 X”时用它，不用超大封顶折扣模拟。 |
| `paymentResourceProviders` | 由卡牌或 `computeCosts` hook 提供的仅支付虚拟资源：可用量、可覆盖资源、消耗来源。它们以自身 key 出现在 `resourcesPaid`，不进入成本行或 `PlayerState.resources`。 |
| `paymentBudget` | 最终 `resourcesPaid` 的上限；不提供资源，也不提前限制几何或单位数。 |
| `minimumResourcesPaid` | 最终 `resourcesPaid` 的下限，在支配剪枝前检查；准入与支付 child 共用。 |
| `resourceReserve` | 支付后某资源池保留的最低总量。`PaymentSolver` 在支配剪枝之后按它和 hook 的 `reserveResources` 过滤；只过滤方案。 |

**固定管线顺序**（领域规则，不是卡牌优先级）：基础候选（`fee`、`fees`、`unitFee`、动态 `getBaseCosts`）→ 结构性删资源 → 候选闭包 → action 级 trade → bonus → 卡牌提供的支付资源 → card → 可负担方案 → `paymentBudget` / `minimumResourcesPaid` 过滤 → 支配剪枝与排序 → `resourceReserve` / `reserveResources` 过滤。

- **候选闭包**（[ADR 0004](adr/0004-candidate-closure-replaces-cost-modifier-ordering.md)）：卡牌购买和职业费用先规范化为 Cost Candidate List，再对所有 `deriveCardCostCandidate` 转换求不动点并做强制饱和。结果与注册顺序无关；候选转换和 `TradeModifier` 都没有 `order` 字段。每个 resources + `originalFeeIndex` 组保留一条代表行。卡牌只声明单候选转换与 `cardCostCandidateMandatory`；动态基础费用来自 `CardImpl.getBaseCosts()`。静态消费者通过 `getPrintedImprovementCostCandidates()` 读取印刷候选。
- **两条费用路径**（[ADR 0003](adr/0003-card-purchase-compute-card-costs-candidates.md)）：大小改良与职业费用走候选管线；其他行动聚合 `computeCosts` 结果。候选 metadata（`sources`、`originalFeeIndex`、Cost Attribution）不进入 `PaymentSolution`。构建选项时（`describePaymentSolution()` / `describePaymentEffectPreview()`）在选择之前把 `sources` 并入每个选项的 `sourceCards`；`PaymentReceipt` 则把它们保留为 `candidateSources`，与 `costAttribution` 并列。
- **支配剪枝**在资源可行性过滤之后执行，豁免支付路径身份、影响状态的 bonus choice 和 card 支付。
- **Cost Attribution**：saved / paid 统计来自归因，不来自 pay leaf 的 `sourceCard`。行动 `computeCosts` 声明 `costAttribution`；宿主在真实执行后写入 clamp 后的前后差值。
- **支付选项身份**：选项值为 `<prefix>:<index>~<identity>`。即使重算后列表位置变化，也按身份结算；支付已不存在时可恢复地拒绝并保留菜单。
- **收据**：职业与改良提交保留所属宿主付款的准确资源、bonus 来源和返还卡；免费打出携带显式空收据。
- **Supply token 也是支付资源**：围栏和马厩像普通资源一样流经 `cost`、solver、`resourcesPaid` 和 `resource.paid`。支付只增加 `player.supplyTokensConsumed`。剩余容量通过 `getOwnOrdinaryFenceBuildLimit()`、`getOwnOrdinaryFenceReserveCount()` 或 `getAvailableStableSupplyCount()` 读取。
- **授予的费用优惠**：授予的翻修在自身 leaf 的 `actionContext.costBonuses` 中携带可序列化、有来源的 `Bonus[]`，按实时目标与 `computeCosts` 合并；不安装临时玩家 modifier。
- **校验**：`validateComplexCost` 在开发环境抛错，生产环境记录日志并降级为无方案。`validateTradeModifier`（单位 trade 不得带 `minNumRooms`，组上下限须一致）和 `validateBonus` 在任何环境都抛错。带 `costType` 的费用枚举会丢弃 `resourcesPaid` 含负值的分支；不带 `costType` 的 `ComplexCost` 不丢弃。
- **资源承诺**（[ADR 0019](adr/0019-resource-commitments-preserve-unsettled-trades.md)）在命令边界检查，不是预付，也不是 solver 预留。

测试：`shared/actions/payment/internal/__tests__/{candidate-closure,cost-modifier-permutation-probe,enumerate,cost-modifiers}.test.ts`、`shared/actions/payment/__tests__/{solver,card-purchase}.test.ts`、`shared/actions/effects/__tests__/{improvement-cost-candidates,pay-supply-token,renovation}.test.ts`。

### 7.5 Hook 系统

- 每个 `GameCore` 拥有自己的 `ActionHookRegistry`（`actionHooks`）。分发、可用性、费用预览和规则 helper 显式接收它，没有进程级默认值。上下文对象声明 `actionHooks`，只有无通用规则的纯调用才用 `undefined`。注册表是每个 Core 重建的运行时依赖，从不进入状态或游标。
- `CardRegistry` 也没有进程默认值：卡牌查找使用临时同步的 `withCtx` 绑定，嵌套调用和异常后恢复；未绑定环境的查找直接失败。自定义代码 adapter 在调用不可信代码前剥离 `actionHooks`。

```text
isDoable                 修改行动是否可执行
computeReplace           替换整个行动
computeCosts             调整费用，包括围栏与卡牌购买折扣
computeArgs              为 execute() 返回的选择追加选项
computeChoiceCandidates  向 opt-in 的 getBaseChoiceOptions 注入候选
computeExchanges         注入运行时 CardExchange
before / immediatelyAfter / after
anytime                  注册额外的 anytime 行动
```

- `ActionHookContext` 为 `{ actionHooks, state, player, space, actionId, phase, result?, choice?, doable? }`；执行期 `ActionMutationContext.eventSink` 记录事件。`ActionHookResult`（`shared/actions/hooks.ts`）为 `{ doable?, actionId?, extraData?, extraOptions?, extraExchanges?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard?, countCardUse?, labelKey?, labelParams?, decline?, alternativeFlow? }`。`extraExchanges` 注入运行时兑换，`countCardUse` 控制启用计数，`labelKey` / `labelParams` 为这次贡献命名；`computeReplace` 结果带 `decline` + `alternativeFlow` 时，该流程作为原行动旁的备选项提供，而不是替换原行动。顶层 `flow.sourceCard` 会复制给缺少来源的子 leaf。
- Card listener 默认只匹配已打出卡牌；只有显式 `zones` 才扫描手牌。匹配结果携带 `ownerCardId` / `ownerCardZone`。手牌 listener 同样保持纯函数，按视角序列化时隐藏从隐藏手牌派生的全部信息。
- Listener `scope` 为 `player`、`opponent` 或 `any`。匹配按 listener ID 枚举；尾随节点按 owner 分组（全局、当前玩家、其他玩家），组内按打出顺序稳定排序。反应 listener 进入 trigger-select；compute / query listener 确定性聚合。

**事件是规则事实的来源。** `EventStore` 为每个公开行动或内部 leaf 开启 transaction，只在成功时提交（失败、取消、回滚和跳过都不追加），按 `state.nextEventSeq` 重新编号，校验可见性、JSON 安全、大小与已知字段，并追加 `publicEvents.committed` 包。`state.log` 是事件 mapper 派生的 UI 缓存。Listener 读取 `transactionEvents` / `eventQuery`，资源事实不读未提交的全局 `state.events` 或 `context.result`。

- 农场修改事件（`farm.fieldPlowed`、`farm.roomBuilt`、`farm.stableBuilt`、`farm.fenceBuilt`）携带 `newlyUsedTiles`，在修改前后、尾随反应之前捕获。围栏提交还携带 `newlyEnclosedPastureTiles`。地形放置与封锁状态修改发出 `farm.spacesUsed`。计划领取的房间同样发出 `farm.roomBuilt`。
- 消费者通过 `getActionNewlyUsedTiles()` / `getNewlyEnclosedPastureTiles()` 从宿主捕获的 `actionEvents` 读取这些已提交事实并按玩家过滤；不从后来的几何重建差异，不保存行动前缓存，也不回退到更大的 Turn 范围。
- 印刷的围栏数量与触发只计算普通 `type='fence'` 段（`hasOrdinaryFenceBuiltEvent()`）。
- 动物兑换经 exchange / trade 路径扣减，使已安置动物保持同步。按 trade 的资源门槛使用 `immediatelyAfter.trade-applied` 与 `extraData.preResources`。

**触发帧。** 宿主行动提交时，引擎在任何 `afterHostCommitListeners` 修改之前冻结 `transactionEvents`、`actionEvents` 以及匹配到的尾随 listener 集合与顺序。延迟的续行复用这一帧，不重新匹配。`CardListenerContext.triggerSnapshot` 只存在于 `immediatelyAfter` / `after`，保存宿主提交时各玩家的 occupation / minor / major / improvement / played 列表；询问“这是第 N 张”的 listener 读取它，`check:card-impl-boundaries` 拒绝在这些阶段直接读取实时长度。激活时不再检查 owner 卡是否仍在原牌区。该帧随 `activate-card` 节点序列化。对返回 flow 的宿主的反应携带 `preservedTransactionEvents` / `preservedActionEvents`，后续每次提交都会扩展它们。

- 费用预览（`previewComputeCosts`）在查询纯度契约下求值 `computeCosts`，不克隆状态。

测试：`shared/engine/__tests__/{event-transaction,trigger-snapshot,hook-dispatch,continuation-event-scopes}.test.ts`、`shared/actions/effects/__tests__/farm-action-events.test.ts`、`shared/cards/__tests__/card-listener-zones.test.ts`。

#### 7.5.1 公开 `ActionNode` 执行顺序

`computeReplace → before → strict isDoable → computeCosts → execute → immediatelyAfter → after`

1. `computeReplace` 最先执行，此前 `actionContext.targetSpaceId` 已解析出 `context.space`。只改 `actionId` 时，后续所有阶段沿用新 ID。
2. 每个匹配的 `decline + alternativeFlow` 贡献一棵完整子树。`buildReplacementChoiceNode()` 在原行动的可选提示前插入普通 XOR，并设 `requiresExplicitChoice=true`，即使只有一个替换也等待玩家选择；原分支保留其可选性，提供菜单时任何分支的 `before` 都不执行。选中的分支重新进入本管线，跳过自身 producer 以及从外层替换继承的所有 producer 守卫；原分支携带 `checkedReplaceAction`，只有分发器解读它。`resolvedReplacement` 让决定跨恢复保持；放人或移动授予新机会时重置 producer 守卫。
3. `before` listener 编译为原 leaf 之前的 `activate-card` leaf，按 owner 进入 trigger-select。使用前资格在实际使用行动格时收集一次（`collectBeforePlacementFlows`、`collectBeforeActionSpaceUseFlows`）；`requiresNewPlacement` 排除工人移动。
4. Strict `isDoable` 读取真实 `before` 修改后的状态：基础 `canBeExecutedByPlayer`、费用预览、hook 与 listener 的 `isDoable`。失败时，只有已接受的必选续行可以通过 `isAlreadySatisfied` 按同一 transaction 中先前的事实结算，此时本体与尾随 listener 不执行。选项级 listener 同样过滤职业手牌选项，`reserveResources` 传入支付 leaf。
5. `computeCosts` 填充 `executionContext.costs`、`costTrades`、`costBonuses` 与 `paymentResourceProviders`。
6. 执行本体（`getBaseChoiceOptions` 或 `execute()`）；`resolveChoice` 继续前重新校验可执行性与费用。
7. `immediatelyAfter` 与 `after` 从冻结的触发帧执行（§7.5）。内部 `activate-card` 绕过本管线，把返回的 flow 交还引擎。

复合行动在展开前完成替换选择并保留延迟展开标记，子行动随后各自做替换决定（[ADR 0027](adr/0027-composite-actions-use-existing-replacement-selection.md)）。`EngineTree.insertBefore()` / `insertAfter()` 保留父级 OR/XOR 的选择。直接 `cancel` 受保护原子行动（`plow`、`sow`、`construct`、`stables`、`fence`、`reorganize`、`selection`）会被可恢复地拒绝；可选性来自 `optional` metadata 与 `__skip__`，撤销来自历史。

测试：`server/__tests__/action-replacement-session.test.ts`、`shared/engine/__tests__/engine-pipeline.test.ts`、`shared/actions/__tests__/flow-replacement-admission.test.ts`。

#### 7.5.2 当前步骤准入与 blocked 恢复

可用性与权威入口共用 `GameCore.applyIsDoableCheck()` 和 flow 准入 helper；普通放人与卡牌授予放人共用 `isPlacementActionDoableInFlowContext()`。见 [ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)。

- 当前原子步骤可执行，或适用的 `before` 能开始，行动即可开始；这不承诺能完成。SEQ 检查下一步，OR/XOR 检查任一分支入口。没有整条 flow 搜索；支付、动物容量和围栏几何仍是原子检查。
- 查询不消耗资源、激活、事件或私有游标，也不使用可用性缓存。
- `originalActionCondition` 是原分支的结构条件：空累积格不能被固定或附加收益重新开放，明确的替换仍有资格。
- 卡牌创建的行动格默认使用 Strict Action Entry；标准复合行动格显式 opt-in（[ADR 0018](adr/0018-future-schedule-and-authoritative-action-entry.md)）。
- 递归 key 包含已消费的替换 producer ID，同名替代可以推进，无进展的循环会终止。
- 已接受的根与必选续行把义务传到复合后代；显式可选节点在接受前仍可跳过。不可用的必选节点进入 `engine-blocked`，保留已发生的效果，等待 `undoStep` / `undoAction`。非法输入恢复命令检查点并保留交互；已发出菜单中过期的选项被可恢复地拒绝。
- 本体开始前，不可用的必选宿主只在合法 anytime 列表非空时提供 Continue 窗口；Continue 严格复查，不重放 `before`。

测试：`server/__tests__/{anytime-admission-session,empty-accumulation-admission-session,moor-admission-deep-session}.test.ts`。

#### 7.5.3 Pay-child 不变量

- `pay` 是内部结算 child。公开宿主行动负责业务修改、事件与完成。禁止的形态：`seq:[pay, apply-*]`、顶层 `apply-*` effect、`PlayerState` 支付草稿或任何跨行动支付槽。
- `beforeHostListeners`、`afterHostCommitListeners` 与 `afterHostListeners` 编码每个宿主的支付位置。翻修、改良、职业、建房、围栏和马厩的强制支付在尾随效果之前结算，反应不能花掉仍欠宿主的资源。
- 改良与职业的 `onBuy` 在 `afterHostCommitListeners` 中执行：支付完成、宿主提交卡牌、执行 `onBuy`，再进入尾随反应。一次性自身打出收益放在 `onBuy`；打出的卡不匹配自身的 `occupation` / `improvement` 尾随反应，但仍计入触发快照。“打出某卡后”的效果监听已提交的宿主，不监听其 `pay` child。
- `shared/actions/helpers/improvement-purchase-lifecycle.ts` 负责购买支付后的提交（返还卡、传牌、`card.played` / `card.passed`、手牌变更）。`params.allowedPurchases` 约束所有候选来源；`purchaseActionCardId` 把本次购买节点来源传入 `onBuy`；`playedFromHand` 在手牌变化前冻结。
- 必选的 `afterHostCommit` 续行及其返回或注入的一切保持必选；不可执行的后代进入 blocked，使用普通撤销。listener 上的 `mandatory: true` 即使没有触发菜单也会传播。
- `animal-reorg` 请求把整理交给 Session 子流程，宿主保留自己的反应：`before` 一次，子流程结束后 `immediatelyAfter` / `after` 各一次。
- `activate-card-effect` 从内部结果表读取 `paymentInfo`，执行 `onBuy` 或阶段 hook；阶段激活携带 owner、target 与阶段 metadata。

测试：`shared/actions/effects/__tests__/pay-child-context.test.ts`、`shared/engine/__tests__/internal-children.test.ts`、`server/__tests__/action-hook-continuations-session.test.ts`。

### 7.6 阶段 hook

```text
Preparation: onBeforeStartOfTurn -> advance round / action.revealed -> onAfterRevealAction -> onPreparation
  -> accumulate -> onRoundStart (StartOfTurn) -> onEndPreparation -> onBeforeWork -> onWorkStart -> work.started
Work:        PlaceFarmer -> atomic actions -> onEndTurn -> allWorkersUsed -> onAllWorkersPlaced
Return home: onBeforeReturnHome -> onStartReturnHome -> onReturnHome
Round end:   onRoundEnd -> onAfterRoundEnd
Harvest in rounds 4/7/9/11/13/14:
  onBeforeHarvest -> harvestPrepWindow -> onStartHarvest
  -> onStartHarvestFieldPhase -> onHarvestFieldPhase -> reap [dispatch 'reap'] -> reap reaction parallel
    -> onAfterReap -> onEndHarvestFieldPhase -> onHarvest
  -> postReapAnytimeWindow -> onStartHarvestFeedingPhase -> onHarvestFeedingPhase
    -> feed -> onEndHarvestFeedingPhase
  -> breed -> onEndHarvest -> onAfterHarvest
Before game end: after round 14 onAfterRoundEnd completes, without opening round-15 preparation,
  onBeforeEndGame -> preScoringWindow -> gameover
```

阶段 hook 返回 `ActionFlow`，通过 `EngineStack` 作为可恢复子流程运行。**Stage Dispatch**（[ADR 0008](adr/0008-node-parallel-reaction-dispatch.md)）是准备窗口、StartOfTurn、回合结束、收获前、收获田间阶段和终局前的共享模型：

- 每个窗口冻结玩家顺序（规则要求时从起始玩家标记顺时针），并在每名玩家进入时，按持牌、手牌启用的 hook 与纯 `stageEligibility` 查询捕获一棵固定的 `activate-card-effect` 来源树。来源发现从不按当前支付能力过滤。
- 单个来源直接展开；多个来源进入 `ParallelNode(mode='trigger-select')`。每次选择后，handler、支付与必选 / Pass 状态按实时克隆预览重算。已完成的来源不重放；窗口内打出的卡只参加后续窗口。
- 窗口上下文、玩家顺序与树游标保存在 `stageResume`；恢复时不重扫牌区，也不重读已变化的标记。旧的串行阶段保留 `resumeAfterCardId` 用于自身索引恢复。
- 嵌套可选分支保留兑换机会，不削弱必选根。`requiresExplicitChoice` 在实时兑换可能提供资金时保持购买选择开放。
- 阶段完成时，未安置动物先嵌套现有 `reorganize` flow，再恢复帧。
- 阶段子流程的私有事件保留到最外层响应。

各窗口的不变量：

- **准备阶段**：`onRoundStart` 即 StartOfTurn；`onBeforeStartOfTurn` 在轮次增加前执行并收到 `nextRound`；揭牌上下文保留实际 `actionId` / `roundSlot`。工作顺序（`roundFirstPlayerId`）在 StartOfTurn 之前冻结。`startFirstRoundAfterSetup()` 是新局的唯一入口：bootstrap 不提前累积，加载工作阶段状态也不重新准备。
- **StartOfTurn**：回合开始激活、计划领取、付款门控的 offer 和计划行动共用一棵玩家树。到期货物按玩家合并为一次 `receive`，保留各条目来源且不触发 Gain；`futureMeeple.resolved` 只在实际领取后提交。
- **未来计划**（[ADR 0018](adr/0018-future-schedule-and-authoritative-action-entry.md)）：Exact Future Target 保留目标轮，超出 `current round < target <= 14` 时丢弃；Future Prefix 保留仍存在的连续后缀。一次性的未来 offer 使用 `scheduled-offer` 行动与 `cardStates[cardId].extraData.scheduledOffers`，不用资源 token。卡牌排未来 token，不自写 `targetRound` 状态机。
- **回合结束**：普通轮转与卡牌驱动的 Turn 共用 `buildEndTurnReactionFlow()` 的同一棵冻结来源树；窗口完成时关闭 Turn Scope 一次。卡牌以既有 Turn 身份记录每 Turn 一次的凭据。
- **收获前**：在收获跳过生效前冻结玩家顺序；所有玩家都参与；顺序保存在 `stageResume.extra.beforeHarvestPlayerOrder`。
- **跳过整个收获**：待生效标记在所有 `onBeforeHarvest` 之后激活一次，该轮之后的每个收获步骤、阶段 hook 和 listener 都排除该玩家。
- **收获准备**：`harvestPrepWindow` 依据 `preHarvestGoodsWanted` / `preHarvestGoodsWantedBeforeReap` / `maySkipHarvestFieldPhase` metadata，只提供可支付、有次数限制且能产出所需货物的 Harvest 兑换。使用次数按来源和轮次记录。
- **收割**：`reap` 是内部行动。完整收获使用 `trigger: { phase: 'harvest' }`；私人田间阶段收割不写收获摘要。`computeHarvestCount()` 返回带 `sources` / `tags` / `scope` 的数量，只能通过 `registerHarvestCountModifier()` 修改。逐作物 `reap` 事件汇入一个 parallel flow，之后才进入 `onAfterReap`。
- **收割后 anytime**：按收获顺序、在计算喂食之前提供；每个 flow 后重建。
- **喂食**：`computeHarvestFeedingRequirement()` 只能通过 `registerHarvestFeedingRequirementModifier()` 修改。feed 请求携带权威兑换目录（§7.9）；`handleFeedResolved()` 在任何修改前校验完整的有序计划。
- **繁殖**：`getBreedThreshold()` 取已打出卡中最小的阈值；`computeHarvestBreedOrderPriority()` 只调整繁殖顺序。
- **收获摘要**是规则事实：`harvestReapSummary`（作物、位置、数量应用）与 `harvestBreedSummary`（安置后结算的新生动物）保留到 `onAfterHarvest`；卡牌通过 `getHarvestOutcome()` 组合它们。
- **终局前**：`onBeforeEndGame` 按 target 座位顺序与 `beforeEndGameScope` 分发；`handHooks` 不支持它。随后 `preScoringWindow` 逐玩家只提供 `preScoring: true` 的 anytime listener，结束后才写 `gameOver`。计分前花费使用显式 flow；Scoring Reserve 不扣真实资源。
- **`onBeforePlayerTurn`** 是唯一的 non-flow hook：只做 skip-control，返回 `{ skipTurn?: true } | void`，从不返回 `ActionFlow`，也不产生 pending。
- **定时规则**：`CardEffect.timedRules` 声明闭合的 `TimedRule` / `RuleBody`，由原生注册编译进既有 hook；`timed-rules.ts` 不查询运行时注册表。执行期公式来自 `rule-queries.ts`。

测试：`server/__tests__/{preparation-bga-session,before-harvest-reaction-dispatch-session,stage-animal-settlement-session,parallel-trigger-multi-session}.test.ts`、`server/__tests__/stage-hook-flow.test.ts`、`shared/actions/__tests__/future-meeples-entries.test.ts`。

### 7.7 Listener 纯度

`CardListenerRegistration.handler` 在分发、预览和可执行判断路径上是状态纯的 flow 构造器，对齐参考实现：反应收集只构造激活 leaf，状态修改发生在行动 leaf 中。

- handler 可以读取状态与事件，返回 `ActionHookResult`、`ActionFlow`、费用、可执行性或选项。每次修改，包括写自身 `cardStates[cardId]`，都是返回的 leaf（`gain`、`pay`、`special-effect`、`exchange` 或可复用的内部行动）。
- 分发从不为预算结果而执行 handler。listener 激活是普通内部 leaf（`activate-card`），携带 listener、卡牌、事件、owner 与触发玩家；`event.actionContext` 保留触发时的 `targetSpaceId`。
- **门禁**：所有会分发 listener 的 Vitest project 都安装 `shared/cards/__tests__/listener-purity-guard.ts`，为每次调用提供深层只读 Proxy，任何写入或返回实时引用都会失败。`pnpm run check:card-impl-boundaries` 静态拒绝所有已解析 handler 与 `deriveCardCostCandidate` 中对 context 的显式写入。没有豁免清单。
- **Trigger-select**（`ParallelNode`）负责 select、pass、mandatory 与 independent 语义，没有 listener 专用节点。结构暂不适用的 child 本轮隐藏，sibling 执行后重新评估；适用但付不起的 child 保持可见并禁用。`mandatory: true` 只在必选 child 适用且可执行时禁用 Pass。Card listener 的适用性只来自返回结果；阶段卡牌效果仍在克隆上预览。
- **before 可达性**：同一时机的多个 `before` listener 是由玩家排序的真实触发 flow，从不静态模拟。能让不可达行动变为可达的卡牌通过 scoped `isDoable` opt-in，并在 `skipBeforeTriggers` 下让开。Pass 门禁先用 `skipBeforeTriggers=true` 检查原行动，再只看通用替换回退。
- **合成分发**：`trade-applied` 与 `harvest-feed-conversion` 只执行确定性 `seq` / `parallel` flow 中的非可选 `special-effect` 与 `gain` leaf（`executeImmediateSpecialEffectFlows()`）；那里不支持支付或交互。
- **Owner 与切换**：owner 与触发玩家显式传递；跨玩家确认和撤销边界由运行时负责。`confirm-player-switch` 由交出控制的玩家提交，并建立撤销边界。
- **暂定续行**（[ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)）：每个修改命令都经过一个结算边界，带规范化身份与检查点；作用域、守卫、受保护观察和失败记忆保存在私有会话游标中。
- 不要给 `CardListenerRegistration` 增加 `order` 字段；稳定的回退顺序来自 `playOrderIndex`。

测试：`shared/cards/__tests__/listener-purity-guard.test.ts`、`shared/cards/__tests__/listener-purity-wave*.test.ts`、`server/__tests__/authoritative-command-settlement.test.ts`。

### 7.8 农场类提交

每种农场类型都在 `shared/actions/effects/` 下自己的 `ActionDefinition.resolveChoice` 中闭环：

- **房间**（`construct.ts`）：`room-payment.ts` 展开逐房间费用变体；印刷的“每间房”折扣使用 `scope:'unit'`。屋内动物按真实房间保存在 `houseAnimals`。
- **马厩 / 犁地**（`stables.ts`、`plow.ts`）：typed-flat 支付；马厩定价由默认价、`exactCost` 或 `costOverride` 与一次完整的农场选择查询得出单价。`plow.actionContext.allowedTiles` / `adjacencyPolicy` 只影响本次犁地。
- **围栏**（`fencing.ts`）：校验边、来源、连通性与区域；通过农场选择的 `computeCosts` pass 计算费用；把 trade、bonus、provider 与预算传入 `pay:fence:*`。`before` 贡献按来源写回宿主：木材折扣不增加实体，卡上围栏由玩家显式选择，只为本次新建的普通围栏消耗。
- **播种**（`sow.ts`）：没有支付组合。`maxSelections` 计算 Logical Field，`maxSeedSelections` 限制作物槽；行动作物许可与田地 owner 的许可取交集；`isUnconditionalSow` 保留显式限制。

首轮 payload 为 `fence: {edges, palisadeEdges, extraWood, fenceSources?}`、`room: {rooms}`、`stable: {stables}`、`plow: {tile}`、`sow: {crops}`，以 `{type:'choice', value:'confirm', payload}` 提交。第二轮支付把 payload 保存在 `pending.actionContext.farmPayload`。建房与围栏的入口可执行性会拒绝没有可达提交的状态。

#### 7.8.1 围栏段与 policy

- `FenceSegment.type`（普通围栏或 palisade）与 `FenceSegment.source`（谁的 token）相互独立。借用围栏是 `source.kind='borrowed'` 的普通段。
- 围栏主路径从不按卡牌 ID 或单卡开关分支。卡牌行为使用 `fencePolicy`：`allowedSegmentTypes`、`sourcePolicy`、`segmentBounds`、`newPastureBounds`、`newRegionBounds`、`pastureBounds`、`connectionPolicy`、`allowedNewRegionTiles`、`allowTerrainInNewRegions`、`suppressTerrainRegions`、`costPolicy`、`paymentBudget`、`cancelPolicy`、`preserveAnimalTotals`、`promptHintKey`。
- `sourcePolicy: { kind: 'borrowed', donorCaps }` 要求 `fenceSources` 覆盖每条新普通边；服务端按出借方实时库存重新 clamp 上限，并消耗出借方供应。
- `newPastureBounds` / `newRegionBounds` 限制新牧场或新区域的数量与总面积。`pastureBounds` 是另一项检查：`newPastures` 限制牧场数的净增量，`changedPastures` 限制新建或改形的牧场数，`newPastureSize` 限制其中每个牧场的面积。
- `segmentBounds.total` 合并限制普通围栏与 palisade。`canStartFencing` 用 `validateFenceSelection()` 预检至少一个合法提交，后者仍是最终原子校验。
- `costPolicy` 只设置本次行动的基础单价，`computeCosts.fence` 折扣仍生效。`paymentBudget` 只过滤最终支付，不限制几何。`promptHintKey` 只是文案。

测试：`shared/actions/__tests__/fencing.test.ts`、`shared/actions/effects/__tests__/{fence-resolveChoice,fencing-entry-guard,construct-resolveChoice,sow-permissions}.test.ts`。

### 7.9 Anytime 窗口策略

`shared/session/anytime-policy.ts` 的 `computeAnytimePolicy()` 在每次 `buildInteraction()` 时计算一次 card listener 的 anytime 可用性；客户端从不导入它。`GameCore.getAnytimePolicyInput()` 提供活动上下文、`stageResume`、请求类型与请求的 `anytimeWindow`。

- flow 或请求可声明 `{ allowed: true, blockedIds? }` 或 `{ allowed: false }`。声明只属于当前等待节点；父节点、兄弟节点和续行都不授予权限。
- 优先级：无上下文；供暖；engine-blocked；下一玩家确认（禁用 exchange）；玩家切换确认；动物整理；当前节点的显式窗口；默认的阶段 hook 链封锁；普通允许。metadata 不能覆盖前面的硬封锁；格式错误的窗口关闭。
- 三个消费者共享同一快照：`buildAnytimeEntries()` 过滤条目；`buildInteraction()` 只在允许且非空时暴露 `takeAnytimeAction`；`takeAnytimeAction()` 在注入前执行该策略。
- 卡牌条目共用当前步骤准入（§7.5.2）；根 `optional` 不能绕过，新行动使用自身的来源、参数、费用与执行者。
- 嵌套 anytime flow 插在当前 pending 树之前；父级以同一个 `PendingEnvelope` 返回。
- 重入：Anytime Ability 的 sequence 进行中时，该玩家在所有帧中都不能再进入同一条目。`allowAnytimeReentry` 只解除这一限制，目前只有系统 `exchange` 设置它。同一能力内的货物或目标选项共用其条目。
- 替代回合的 anytime 行动（`replacesTurn`）只在工作阶段空闲时可用，完整 flow 和回合结束 hook 结束后才轮转。
- 完成：必须等完整注入 sequence 结束的终结反应，用 `INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY` 标记最后一个 leaf，消费者同时要求该标记与引擎的注入标记。
- **兑换批次**：一次提交在任何支付前校验所有配方索引与次数，整批结算后再执行必要的动物整理。配方可在指定交互类型中禁用 anytime（`blockedAnytimeInteractionKinds`）；繁殖期间动物烹饪配方不可用。`bulk:` 这类紧凑选项值通过请求的 `structuredChoicePrefixes` 准入，从不靠行动 ID 特判。
- **喂食目录**：`feed` 请求以稳定的 `(sourceId, exchangeIndex)` 发布 `exchangeCatalog`；客户端只按它起草，提交时同时匹配原目录与实时重建的目录。
- 动物整理是系统子流程，从不作为 anytime 条目。工作阶段空闲回合与 `confirm-next-player` 是当前玩家的窗口；`confirm-player-switch` 与阶段 hook 链默认封锁，除非当前节点开启窗口。`computeResourceCommitments()` 的限制在命令边界执行（[ADR 0019](adr/0019-resource-commitments-preserve-unsettled-trades.md)）。

测试：`shared/session/__tests__/anytime-policy.test.ts`、`server/__tests__/{anytime-reentry-session,anytime-nested-pending,anytime-policy-negative,anytime-admission-session}.test.ts`。

---

## 8. shared/cards/ — Card Source 闭环

本 module 负责每张卡的唯一源文件，以及卡牌接入的通用 seam：hook 与 listener（§7）、局部状态、Card Field 和能力 metadata。卡牌能力留在它自己的文件里闭环。

### 8.1 Card Source 与投影

卡牌作者只维护一个 Card Source（[ADR 0002](adr/0002-card-source-manifest-projection.md)）：

```ts
export const CardName = defineOccupationCard({   // the constant shares the file name
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| 概念 | 形态 | 读者 |
|---|---|---|
| Card Source | `shared/cards/{A..E,M,major,community}/{Card}.ts`，包含 `meta` 与可选 `impl` | 服务端、沙盒和测试；主 client bundle 禁止引用 |
| Card Display | 由 Card Source `meta` 生成的 `public/cards-manifest.json` | 主 client bundle 通过 `client/services/card-meta` 读取 |
| Card Impl | Card Source `impl`，汇集到生成的 `ALL_CARD_IMPLS`（`shared/cards/register-all.ts`；大改良经 `major/runtime.generated.ts`）与 `CardRegistry` | 服务端和沙盒；主 client bundle 禁止引用 |

- `meta` 即 Card Definition：可序列化、前端可见、无运行时行为的字段。允许声明式规则字段（`cost`、`prerequisite`、`*Prerequisites`、`cardField`、`isCookery`、能力 metadata）；不允许 `modifier(s)`、`listeners`、`effect` 与 `prerequisiteCheck`。`desc` 与 `prerequisite` 是印刷文字；可本地化的 `rules` 是补充裁定，不影响运行时。静态条件用 `*Prerequisites`，动态条件用 `impl.prerequisiteCheck`。
- `impl` 包含 `modifiers`、`listeners`、`effect`、`prerequisiteCheck`、helper 调用与 `reaches`。构建器可以把 `reaches` 投影到 manifest 顶层，但不能放进 `meta`。
- `scripts/build-cards-manifest.ts` 用 TypeScript AST 静态提取 `meta`，运行时从不导入 Card Source；`meta` 只含 JSON 类字面量和同文件的简单常量。
- `definePlayerActionCard` 声明 `playerActionCardType`；发牌池与 UI 据此区分，不靠卡号或 i18n 猜测。
- 生产卡牌描述中的资源、动物、地形和分数通过 `ResourceText` token 渲染为图标；`__…__` 只标记精确的卡名、行动名和行动格名。`scripts/__tests__/card-description-icons.test.ts` 与 `card-description-double-underscore.test.ts` 负责门禁。
- 卡面、触发标签、日志预览和 Replay 共用 `client/components/common/cardText.ts`：每个名字或文字字段各自依次回退到规范翻译、`meta.locales[locale]`（跳过空值）、源 metadata，名字还接受旧的 `cards.<id>.name` 别名，卡牌自有的提示用 `{card:<id>}` 引用卡名。玩家名按 `client/utils/player-name.ts` 中的生成名来源处理（§12）。

测试：`shared/cards/__tests__/card-source-representatives.test.ts`、`scripts/check-generated-cards-sync.ts`。

### 8.2 生成目录与注册表

| 文件 | 职责 |
|---|---|
| `shared/cards/catalog.generated.ts` | 从 Card Source 生成：`catalogCardDefinitions`、卡牌列表（`minorImprovementCardsList`、`occupationCardsList`、`implemented*CardsList`）与 ID 列表 |
| `shared/cards/register-all.ts` | 生成的 `ALL_CARD_IMPLS`，即解析后的 Card Impl 映射（`scripts/generate-register-all.ts`） |
| `shared/cards/catalog.ts` | 目录 facade，例如不含社区卡的 `minorImprovementCards` / `occupationCards` |
| `shared/cards/active-registry.ts` | 临时同步的 `CardRegistry` 作用域；没有持久默认值 |
| `shared/cards/registry.ts` | 带 `loadByIds` 与 `unload` 的 `CardRegistry`，用于按房间加载 |
| `shared/cards/custom-registry.ts` | `CUSTOM_*` 卡在服务端与沙盒的运行时实现、会话上下文、效果、listener 与 modifier |
| `shared/cards/custom-card-metadata.ts` | 前端的 `CUSTOM_*` Card Display、美术 URL 与 O 编号 |

- 生产路径只通过生成目录与 `CardRegistry` 访问卡牌；测试可以导入单个 Card Source。Card Definition 是带 `kind: 'minor' | 'occupation' | 'playerAction' | 'major'` 的纯数据。
- 生成目录必须保持同步（`pnpm run check:generated-cards-sync`）；工坊 PR 生成基于已拉取的上游生成文件打补丁，从不读部署机本地的卡牌树。
- 大改良运行时源码只经 `major/runtime.generated.ts` 进入后端。
- 服务端与沙盒只注册自定义卡的运行时部分；主客户端只注册展示 metadata，从不导入自定义运行时注册表。

### 8.3 `cardStates` 中的局部状态

- 持续计数、一次性标记和局部状态放在 `player.cardStates[cardId]`，不放 `PlayerState` 顶层。卡牌打出前就需要的历史使用显式的手牌区 listener（§7.5），不用全局统计。
- 共享例外是多张卡和农场几何都依赖的事实：`player.farmyardSpaceStates`（封锁格、农场格与田地货物标记、非田作物格；放置锁与已用 / 未用状态分开）与 `player.farmyardExtensions`。
- 后续玩家选择是显式续行：卡牌返回的 flow 中由 leaf 发出请求，并在 `pending` envelope 中等待，从不使用隐藏的共享槽。
- 卡上工人使用 `shared/cards/helpers/card-held-workers.ts`；归家时释放。`family-growth` 可通过 `actionContext.holdNewbornOnCard` 把新生儿直接放到卡上。
- 只读的 UI 标记（`extraData.farmTerrainMarkers`）与跨玩家公开标记（`extraData.publicCardMarkers`，计入 `cardBonusVp`）由通用逻辑渲染。
- **可见性**（[ADR 0023](adr/0023-explicit-card-state-visibility-and-presentation.md)）：卡牌状态默认是内部的。原生 `presentation` 声明与 `getStatePresentation(player)` 把事实开放给公开 adapter；序列化记录规范化的 `cardStatePresentation`，rehydrate 时剥离。玩家私有的 `privateData` 属于存储它的玩家，而不是当前持有者。视角快照、事件、历史与座位视角 Replay 只暴露公开事实和观看者自己的私有数据，对卡牌所有者也是如此；权威状态、恢复、撤销、debug 完整状态与全开 Replay 保留原始状态。`card.stateChanged` 事件只带 key 不带值，投影也会去掉历史事件中的值，但不改写 Frame。
- `getRuleContributions(player)` 暴露只读的组件预留与空格减免；消费者合并不重复的来源、取整有限值、拒绝负数与非数字并封顶扣减。通用马厩发现与归还按 `sourceCardId` 分发，只有来源卡改变自身的建造状态。查询的输入与结果都与存储分离，原生卡与工坊卡相同。

测试：`server/__tests__/card-state-visibility-session.test.ts`。

### 8.4 `shared/cards/helpers/` 中的 helper

- `pay-gain-node.ts`：先付后得、付后追加行动、退回后获得的模板。
- `stage-effects.ts`：阶段效果标记，以及经现有兑换执行器的每卡一次可选收获兑换。
- `card-state.ts`、`round-placement.ts`：一次性状态、原始 Work Placement Chronology 与人员放置序号（§6.5）。
- `action-snapshot.ts`：活动 Turn Scope 身份与起点快照（§6.5）。
- `card-held-workers.ts`、`card-field.ts`：卡上工人（§8.3）与 Card Field（§8.5）。

### 8.5 Card Field 与 Logical Field seam

见 [ADR 0017](adr/0017-logical-field-ownership-boundary.md)。

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

- `makeCardFieldImpl(cardId, def, options?)` 注册 Card Field owner 并派生播种接入；卡牌只添加配置与可选的 `onReap` / `onCropRemoved` 回调。虚拟列由 `deriveVirtualTileCol(cardId, slotIdx)` 得出。
- 面向卡牌的 interface 有三个入口：`getLogicalFields(player)`（Farmyard Field 加上每张已打出 Card Field 的不可变投影，含空的固定槽）、`getFarmyardFields(player)`（几何、围栏、相邻与占用），以及带具名 `place`、`insertBottom`、`grow`、`remove` 与原子 `replace` 的 `mutateLogicalFields(state, player, options?)`，它先校验目标，再通过所属 adapter 写入。
- 存储接受所有合法田地货物。`allowedCrops` 是普通播种能力，不是存储 schema：`place` 默认执行该白名单，卡牌效果可显式绕过；播种与 `replace` 始终执行；`insertBottom` 在顶层之下加入规则授予的作物，不新增槽，也不受播种白名单限制。
- `fieldOperationFlow` 的 `move` 接受 `sourceCrops`；目标续行在保存位置或修改田地之前重新检查来源作物与数量、目标占用与 `allowedCrops`。
- Card Field 槽保存顶层 `{ crop, remaining }` 与可选的 `below` 层。普通收割每个有作物的槽取一个；额外与整田收获继续深入下层。
- Card Field 只有一个稳定的 Logical Field id 和一个 `groupKey`；槽保持稳定坐标。基础田地计分只计 Farmyard Field。
- `onReap` 只在收割时执行；`onCropRemoved` 在每次真实移除时执行。两者都在共享修改之后、按作物各执行一次，返回的 flow 并入普通 parallel 反应。selection 会先解决移除回调返回的 flow，再进入它的下一个父级续行。
- `reap` 是两种存储 owner 共用的唯一收割实现（§7.6）。多槽 Card Field 收割每个有作物的槽，但每个 Logical Field 与作物只计一次。
- `card-field.ts` 内部的底层 adapter 是唯一触碰 `PlayerState.fields` 的 Card Impl 代码；`check:card-impl-boundaries` 在其他生产卡牌与 helper 源码中拒绝任何名为 `fields` 的属性或下标访问，无论接收者是谁，没有白名单。

测试：`shared/cards/__tests__/{AB,CD,EM}-logical-field-boundary.test.ts`、`shared/actions/effects/__tests__/{reap,sow-permissions}.test.ts`。

### 8.6 命名、能力与边界

- 卡牌文件使用 `{Deck}_{Number}_{Name}.ts`，导出同名常量；`major/fireplace.ts` 这类大改良家族文件导出其中的每张实体卡。
- 卡牌能力留在自己的文件里。`shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts` 与 `server/game/authoritative-session.ts` 等核心文件从不为单卡修改；没有集中的卡牌效果注册表，也没有前端卡牌规则。
- 跨卡身份与能力查询使用类型化 metadata 和已打出卡 helper：`getPlayedCardDefinitions(player)`、`collectCardDefinitionsAs(player, type)` 与 `playerHasCardCapability(player, capability, { asType? })`，只读取已打出区域；`asType` 复用 `cardCountsAs` 处理双类型身份。已注册的能力 metadata（`shared/cards/helpers/card-type.ts` 中的 `CardCapability` union，例如 `fireplaceIdentity`、`joineryIdentity`、`blocksRenovation` 与 `animalHolder`）位于 `meta`，不增加前端行为。`ovenIdentity` 是 OA 的烤炉家族身份，不代表一定有烤面包兑换；升级卡可保留计分身份，并用 `firewoodBuildTrigger: false` 退出建造触发。
- `check:card-impl-boundaries` 属于 `pnpm run check:architecture`，拒绝生产 Card Source 在运行时读取其他非大改良卡的 ID。显式例外是 `Major_*`、`reaches`、`allowedPurchases` 与前置候选列表。
- 印刷文字点名其他卡牌时，卡牌可在 `reaches` 中声明 named printed target，只读取其公开事实（存在、owner、是否打出），从不读其私有状态；检查器例外只绑定一对精确的来源与目标。
- metadata 审计必须为新增的 metadata 字段补 fixture。

### 8.7 小改良传牌

`CardDefinition.passing?: boolean` 标记购买后传给下家的小改良。改良宿主通过内部 `pay` child 完成支付，再在 `completeInternalChildren` 中提交购买：卡进入下一玩家的 `minorHand`（不进 `minorPlayed`），不计入 `totalMinorBuilt`，不安装 modifier，发出 `card.passed` 而不是 `card.played`，`onBuy` 仍经 `afterHostCommitListeners` 中的 `activate-card-effect` 执行。“卡牌进场”反应自然跳过它。客户端为 `card.passed` 播放动画，mapper 派生 `log.cardPassed`。

---

## 9. shared/domain/ — 领域聚合层

派生视图与不变量检查放在这里。`PlayerState` 保持纯 JSON。玩家版图与农场查询（“这里能否犁地、播种或建造？”）经 `PlayerBoard`；其他领域谓词留在各自的聚合中，例如 `animal-zones.ts` 的 `canAccommodateAnimalTotals()`、`scoring-reserve.ts` 的 `canAddScoringReserve()` 与 `space.ts` 的 `canSpaceAcceptWorker()`。领域代码由主客户端、沙盒与服务端共用。

```text
shared/domain/
├── player-board.ts          PlayerBoard 与 playerBoard 工厂
├── farmyard.ts             农场规则校验与 normalizePlayerFarm
├── farmyard-interaction.ts farm-select 与 farm-position 的交互 payload 投影
├── farmyard-usage-core.ts  规范的已用 / 未用农场格
├── pasture.ts              派生的牧场面积、马厩数与基础容量
├── animal-zones.ts         动物区容量与容纳
├── animal-reorg.ts         动物重整自动补位
├── animal-payment.ts       动物支付顺序
├── animals.ts              动物模型
├── scoring.ts              计分与 PlayerScoreSummary
├── scoring-reserve.ts      终局 Scoring Reserve 的读取、汇总与计分副本扣减
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

**PlayerBoard。** `PlayerBoard(player, state)` 暴露 `farmyard`（`canPlow`、`canSow`、`canBuildFence`、`canBuildRoom`、`canBuildStable` 等校验与查询）、`farmInteraction`（派生 `farm-select` / `farm-position` payload）与 `animals`（区域容量与容纳）。前端的农场草稿只消费服务端 payload。

**农场。**

- 已用 / 未用格只从 `farmyard-usage-core.ts` 读取，包含扩展、地形、封锁格与派生的牧场格；`farmyard-usage.ts` 与 `farm.ts` 只是兼容 facade。卡牌从不手动数格子。房间、地形、田地、马厩与牧场格始终计为已用；`farmyardSpaceStates` 中的条目只有带 `blocksPlacement` 时才计入。
- 牧场持久化身份、格子与动物安置。`getPastureSize()`、`getPastureStableCount()` 与 `getFencedStableCount()` 派生其余信息；`getPastureViews()` 返回独立视图；序列化的 `size` / `stables` 只用于展示，加载时剥离。
- 农场与行动格来源使用 source / type metadata：`FenceSegment.type/source`、`WorkerRef.synthetic`、`ActionSpace.blockedBy`、supply token helper、跨人数的行动格类别 helper、预留标记与附件。基础行动定义按 2–6 人过滤；5/6 人专属格单独建模。
- Farmers of the Moor 地形（[ADR 0007](adr/0007-farmers-of-the-moor-variant-runtime.md)）是 `farmTerrain.kind` 的公开顶层，被覆盖的地形在 `covered`。地形变化走通用 selection leaf，在提交与效果执行时按实时占用重新校验；未来地形 token 复用 `futureMeeples` 条目。围起地形的相邻计算是纯 helper；一次性的相邻规则使用 `adjacencyPolicy` / `allowedTiles` / `fencePolicy`。不支持多层堆叠地形。
- Farmyard Extension 扩展共享几何；所有农场读取方都使用动态形状。

**动物。**

- 每个真实房间拥有容量为一的 Room Animal Holder（`house:<positionKey>`）；`PlayerState.houseAnimals` 是唯一可写的房间安置（[ADR 0026](adr/0026-each-room-is-an-animal-holder.md)）。`roomAnimalZones` 是加载时剥离的展示投影。占用组与 `occupiedZoneLimit`（普通房间 holder 共享上限一）通过纯查询 `shared/contract/animal-zone-occupancy.ts` 约束房间与卡牌区域中被占用的 holder 数。
- 无围栏马厩按农场位置保存 `{ animalType, animalCount }`（[ADR 0029](adr/0029-loose-stables-retain-animal-species-and-count.md)）；空马厩没有条目，但仍在 `stableTiles` 中。动物数量规则累加数量；占用格、存在性与不同物种规则保持各自语义。
- 每个“能否容纳”的问题都使用 `canAccommodateAnimalTotals()` 或 `canAccommodateAllAnimals()`，它们搜索合法的最终安置（允许之后的系统 `reorganize`），并遵守 `occupiedZoneLimit` 与必空组（`requiredEmptyZoneGroupIds`：每组至少一个被标记区域为空）。卡牌从不在局部测试单个区域。会永久降低 holder 容量的候选按支付后的容量过滤。
- `onComputeAnimalZones(player, zones, state)` 添加区域；`computePastureCapacityModifiers(player, state)` 按打出顺序先返回替换再返回叠加 modifier；`onComputeSharedAnimalZones()` 贡献 Hosted Card Animal Zone，存于卡牌 owner 的 `animalCountsByZone`，但按 `animalOwnerPlayerId`（繁殖时按 `breedingOwnerPlayerId`）结算。每个 holder 写入方都持久化 `cardId`、`ownerPlayerId` 与 `animalOwnerPlayerId`；改写与跨玩家扣减只触及当前 Animal Owner 的条目。`computeAnimalZones` 为缺少 `cardId` 的卡牌区域补上它。固定物种用 `allowedAnimalType`；`animalType` 只表示当前占用。
- 由农场位置承载的区域声明 `farmPosition`、`countsFarmyardSpaceAsUnused` 与 `displaySource: 'farm-position'`；客户端只在该位置渲染服务端提供的区域。
- `isHouseAnimalZone()` / `countHouseAnimals()` 包含标记了 `houseAnimalZone` 的区域；`blocksHouseAnimalZones` 会移除它们。
- 动物统计与消耗（`getAssignedAnimalsByType()`、`subtractAnimalsFromBoard()`）同时读写旧 holder 字段与 `animalCountsByZone`。支付顺序在 `animal-payment.ts`：先卡牌局部的 `consumeAnimalPayment()`，再农场与 holder，最后是标记 `capacityCounterKey` / `capacityLossOnPayment` 的计数型 holder。`animalPaymentPreference.prefer` 指定的具体卡牌计数器最先扣，并关闭计数型 holder 的回退。系统移除通过 `onAnimalRemoved()` 通知卡牌。
- 动物整理在修改前校验身份、物种、数量、混放、容量、库存、互斥上限与必空组；非法输入返回可恢复的 `log.reorganizeFail` 且不改变任何东西。省略的区域为空；少分配表示主动弃养。进入整理时，从停用或缩小的卡牌存储中移出的动物回到待安置状态，总数不减少。
- 动物重整自动补位（`prefillAnimalZones()`）固定合法的现有占用，尽量补入待安置动物，确认前不写入安置；`actionContext.prefill=false` 可关闭。
- 仅限农场动物的兑换（`CardExchange.fromFarmyard` / `Trade.fromFarmyard`）在兑换与有序喂食路径中都只能用当前已安置的动物支付；feed 请求发布已安置余额，同批喂食中刚获得的动物仍算未安置。
- 只有启用 Farmers of the Moor 时 `animalKeysForState()` 才加入马。繁殖与计分调整使用 `computeBreedableAnimalCount()` 与 `computeAnimalScoreAdjustment()`。
- 特殊马厩使用卡牌效果三件套 `getSpecialStablePositions`、`applySpecialStable` 与 `getBuiltSpecialStables`；核心马厩代码不导入任何卡牌。只有 `actionContext.farmHand === true`（农场扩建的建马厩 leaf）时才通过协议字段 `farmHandPositions` 提供它们。已建成的特殊马厩投影到 `SerializedPlayerState.specialStables`（rehydrate 时剥离）；没有卡牌接受的位置会让整批提交被可恢复地拒绝。

**计分。**

- `cardBonusVp` 是卡牌产生的非印刷分数的唯一类别，按 `cardId` / `cardType` 归因；卡牌自身的印刷分数留在 `cards`；公开卡牌标记可以计负分。每个奖励来源只进入该类别一次：通用计分已读取 `cardStates[cardId].counters.bonusVp`，因此把分数存进该计数器的卡牌不能再从 `computeBonusScore` 返回它们。旧的 `cardsBonus` / `cardStateBonusVp` / `cardBonus` 形状已删除。
- Scoring Reserve 是终局计分预留，不是支付，通过 `special-effect` 的 `record-scoring-reserve-bonus` 记录。`computeScores()` 在有费用奖励求解之前从计分副本中扣除每个已选预留，基于资源的大改良计分读取该副本，组合付不起时整组失效。

**大改良供应**（[ADR 0006](adr/0006-stack-aware-major-improvement-supply.md)、[ADR 0016](adr/0016-separate-supply-family-from-improvement-identity.md)）：变体模板生成真实卡牌 ID 的供应堆；版图只暴露每堆顶部。购买、归还与交换走供应 helper，生产读取使用供应查询 helper。升级身份使用 `*Identity` metadata，从不使用供应堆的 `familyId`。复制卡保留各自的具体 ID 作为来源与归因。底行规则使用 `isBottomRowMajorImprovement()` / `getAvailableBottomRowMajorImprovementIds()`。

测试：`shared/domain/__tests__/`、`shared/actions/__tests__/animals.test.ts`、`shared/actions/effects/__tests__/reorganize-engine.test.ts`。

---

## 10. 其他 shared/ 模块与游戏变体

### 10.1 `shared/draft/`

同时选牌的纯函数（`initDraftState`、`processSubmit`、`tryAdvanceRound`、`finalizeDraft`）；`createRoom` 用 `draftMode: 'simultaneous'` 与 `draftPoolSize: 7..10` 启用。启用 Farmers of the Moor 时，职业、FoM 小改良与已出版小改良分阶段选秀，FoM 小改良池从已实现的注册表派生，不足时拒绝开局，除非设置 `allowIncompleteFarmersOfTheMoorMinorDeal`；Community Deck 小改良只进入已出版部分。

### 10.2 游戏变体

Game Variant 改变一局游戏的设置、公开状态、行动格、阶段流程或计分；它不是卡牌来源，也不增加前端规则。

- **Parent Cards**（[ADR 0005](adr/0005-parent-cards-dedicated-expansion-runtime.md)）是 `shared/parents/*` 中的结构化数据，素材由 `public-assets.ref` 固定，与 Card Source 投影分离；选择、奖励与支线任务由后端权威裁定，并使用非公开种子。
- **Through the Seasons** 把四个季节格保留在版图上，只启用当前季节；其 modifier 注册在每个 Core 的 `ActionHookRegistry`，从不写玩家 `cardStates`。
- **Farmers of the Moor**（[ADR 0007](adr/0007-farmers-of-the-moor-variant-runtime.md)）通过 §9 的通用 seam 增加地形、扩展、马、供暖与自己的大改良供应。
- **Snake Opening** 只反转第 1 轮的工作轮转（§6.4）。

### 10.3 `shared/custom-code/`

工坊卡只通过已部署的 Workshop Capability Contract 准入（[ADR 0025](adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)）。

- `ast-validator.ts` 用 AST 校验自定义卡 TypeScript：只允许批准的导入，禁止被禁 API、网络与 I/O；`effect` 必须是对象字面量；listener phase 与 effect key 必须在契约白名单内。
- `sandbox-listener-actions.ts` 是 prompt、validator、服务端与浏览器 manifest 和文档同步（`pnpm run check:prompt-sync`）共用的唯一行动列表；GitHub 参考资料不能扩大它。
- `flow-admission.ts`、`contract-admission.ts` 与 `listener-result-validator.ts` 在进入引擎前拒绝契约之外的输出：未列出的行动、归属其他卡的节点与 listener、未开放的节点字段、类型错误的已开放字段与参数、未文档化的参数、类型错误的查询结果，以及写入其他卡或其他玩家的动物区。原生卡的 flow 不受检查。
- listener 返回 `costs` 时必须同时返回匹配的 `costAttribution`。沙盒约束记录在 [`docs/CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md)；运行时隔离位于 `server/custom-code/`（§11.4）。

测试：`shared/custom-code/__tests__/`、`server/__tests__/workshop-contract-*-session.test.ts`。

### 10.4 `shared/i18n/` 与 `shared/utils/`

`shared/i18n/` 存放 UI 文案 key 与资源；`PromptKey` 位于 `shared/contract/prompt-keys.ts`。`shared/utils/` 存放不含业务规则的通用 helper；`rng.ts` 负责指定种子的生成器与 HMAC-SHA256 宽种子流。

---

## 11. server/ — 后端权威

### 11.1 server/connection/ — WS 入口

```
server/connection/
├── ws-server.ts      new WebSocketServer({ server, path: '/ws' })
├── room-router.ts    根据 ClientCommand.type 路由到 GameSession / Lobby
└── broadcaster.ts    StateUpdateEnvelope 扇出
```

不变量：

- 一个 Room 只持有一个 `GameSession`；WS handler 通过 Room 和连接队列等待异步 `dispatch()` 完成。
- `room-router` 负责验证、座位授权和调用 `GameSession`，不直接写 `GameState`。
- `payload-validation.ts` 纯校验（`validateResourcePayload` / `validateSingleTilePayload` / `validateMultiTilePayload`），返合法/规范化结果，不写 `GameSession`。
- ADR-0022 将 ADR-0014 扩展到异步 PostgreSQL：Room 的 `ready | blocked` 门仍位于命令入口，队列连续覆盖授权、规则执行、提交和发布。保存重试使用同一份冻结转换，期间 Room 保持 blocked。
- 规则命令 `resp.ok=false` 且没有 `durableTransition` 标记时，只回发起连接，不增加 `roomVersion` 或 Replay Step。durable rejection 仍提交；其错误只回发起连接，其他座位收到同一已提交版本的无错快照（ADR 0015）。

### 11.2 server/game/ — Room + GameSession

```
server/game/
├── room.ts                    Room { id, session, players, maxPlayers, startedAt }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   大厅 / 房间列表 / 自动加入
├── room-persistence-checkpoint.ts  等待态 / 座位元数据异步写入和丢弃生命周期
├── authoritative-session.ts   GameSession extends GameCore — 命令执行中心
└── persistence/
    ├── room-persistence.ts    抽象接口
    ├── postgres-adapter.ts      PostgreSQL rooms.state_json
    └── memory-adapter.ts      测试注入
```

`RoomPlayer { ws, playerIndex, name, userId? }` 是连接实例，非领域 `PlayerState`。`GameSession` 是 `GameCore` 的薄服务端包装，只注入服务端 custom-code executor；连接绑定、广播和持久化不属于它。

开发槽位 `dev2` 至 `dev6` 通过 `development_room_slots` 指向永久对局身份。活动录制局在重启后保留身份；重开或显式重置退出旧局并分配带新 UUID 后缀的身份，已完成、过期和下架上下文不复活。开发局不因空闲过期。所有正式 Room 使用 PostgreSQL 并强制录制。普通房间全部玩家离线后，`waiting` 保留 30 分钟、`playing` 保留 7 天；恢复包含 `custom_card_ids` 和预留座位。重连可替换同一座位的旧连接。

非生产环境仅在调用方明确设置 `developmentSlot` 时解析槽位，transport 加入返回的永久身份。明确的 Context 链接与未完成命令回执仍指向原目标。开发账号的合成标签保留默认名字来源，不作为自定义账号名覆盖对局的本地化默认名字。

开发 Room 允许同一账号用不同连接打开所请求的不同座位。加入和恢复都保留显式请求的座位，同样适用于本地匿名连接、`context` 链接和带 UUID 后缀的开发局。传输层重连时发送显式请求或服务端已确认的座位，并随未完成命令保存确认信息，供页面重载恢复。在收到确认前，未指定的座位仍保持未指定；开发局恢复要求提供座位提示或账号唯一拥有的座位，匿名或有歧义的恢复会被拒绝，以免替换另一连接。普通 Room 恢复仍按登录账号的座位归属绑定，忽略客户端提供的座位提示。前端 `devMode` 标记不授予开发 Room 权限。

`room_players` 按 `(room_id, player_index)` 保存归属，使同一开发账号的多个座位都能经过重启恢复和结果归档保留。保存完整归属元数据时移除失效关系，未变化的归属及加入时间不更新。账号级 Context 和 Bug Report 查询以其拥有的最小座位编号作为确定的代表；大厅逐座位列出该账号参与的局。数据库迁移保留既有归属行、快照和开发槽位身份。

`roomId` 唯一标识一局游戏：`newGame` 先创建新 `GameSession` 和 UUID，再把在线座位、人数、custom cards、已持久化变体开关及所有连接引用切到新 Room 记录；旧 id 永不复用。首个 `waiting → playing` 转换写入不可变 `started_at`。只有权威 `gameOver` 会在单个 PostgreSQL 事务内写入 `game_results` / `game_result_players` 标量摘要并删除 `rooms.state_json`；TTL、解散、删号和未完成重开只删除可恢复快照，把永久 Game Context 置为 `expired`，不产生结果。归档写失败会回滚，最终全量状态继续保留用于恢复或重试。

`RoomPersistenceCheckpoint` 在创建、等待态和座位元数据写入成功后才确认。所有正式对局，包括 Workshop、热座和固定开发局，均强制录制。初始 Frame 与后续转换在同一 PostgreSQL 事务中提交 Room 状态、增量恢复记录、Replay Step 和终局结果，然后才发布。读取和元数据变化不推进权威版本。`newGame` 在同一事务中创建后继局并退出旧活动局，成功后才切换连接引用。

`room-queue.ts` 串行执行身份校验、规则、异步提交和发布。连接换房同时预留两边的 Room 队列及连接队列；断线、清理和管理端退出使用同一队列。关闭服务时停止接收新输入，释放待重试命令的等待者，等待已接受操作结束，再关闭数据库连接池。

存储重试成功后，等待者保留到异步发布结束。若发布失败，释放队列并关闭相关连接，让客户端恢复已提交的回执和快照；不重复执行可能已经部分完成的 Room 切换回调。已完赛但仍在线的局重开或退出时，校验 ownership 和持久终局 Step 版本，因为完赛已删除活动 Room 行。该例外仅用于退出生命周期，普通写入仍要求存在活动 Room 恢复数据。

停机导入器只清理能够确认未录制的活动局，线上启动不执行旧数据清理。等待局及任何带录制意图、构建身份、Replay 或结果记录的局都保留。录制数据缺失会阻止恢复，不会新建替代局或补造历史。独立 HTTP/browser 工坊沙盒继续可用。参见 [ADR-0022](adr/0022-distributed-room-recovery.md)。

`RoomDirectory` 通过 PostgreSQL 租约和单调递增的 owner epoch 分配应用进程。提交和发布都验证 owner 与预期 Room 版本。`POST /api/rooms/locate` 返回同源 `/nodes/<instanceId>/ws` 路由，`ingress.ts` 转发到私有实例。生产 Compose 在同一物理机的一个 app 容器内启动两个独立应用进程；本地开发默认一个，也支持两个。共享大厅 presence 和 HTTP 亲和路由维持房间接入与不承诺恢复的 Sandbox 访问。

写命令携带服务端签发的 scope、稳定命令身份、Room 身份和预期版本或同时输入窗口。`CommandStore` 登记内容指纹，并在 Room 转换的同一事务内提交结果；重复命令返回原 receipt。客户端记录待定命令，正常重连时重新定位 owner、查询 receipt、恢复原座位，并等待权威快照后开放新输入。重开只迁入在线座位，旧局离线玩家的预留不能使新局自动开始。

`InvalidationStore` 先提交卡牌 / 用户屏障、受影响 Room 的退役以及逐实例任务，再返回 operation identity。执行与发布均检查共享屏障。实例排空队列、释放 Room 和 Sandbox Worker 后确认任务；所需实例全部确认或丧失租约前，操作保持 pending。删号使用可续期的持久 claim，并保留外部 GitHub 清理 pending 契约；管理和设置界面按该契约展示完成。

**Issues #938–#940 的恢复约束：**活动恢复必须保留普通 Undo History 和嵌套暂定作用域的回退检查点。恢复权威会话及继续提交所需的 RoomCommitter 基准帧，必须独立于历史 Replay payload；可以核对 Replay head 元数据，但不能要求解码 Replay checkpoint 或 delta。参见 ADR-0011 §11 和 ADR-0015。

**Room 历史与恢复（Issues #947–#954）：** PostgreSQL 把不可变历史节点存入 `room_history_nodes`，把普通撤销和嵌套检查点的共享记录存入 `room_recovery_nodes`（保留原有恢复格式）。`shared/session/history-streams.ts` 捕获较小的核心主体和不可变分支，避免复制完整历史数组；`RoomHistoryStore` 在现有 Room/Replay 事务内只写新节点。写入失败不会把未提交 ID 加入持久缓存。查询失败原样传播以便存储重试；只有成功读取后的解码与完整性失败归为 `RoomHistoryCorruptionError`。引用缺失、校验和错误或原始 Frame Hash 不符均停止恢复。内存测试适配器保留逻辑完整快照。启动通过固定批次数量的查询加载 Room 自有历史和恢复记录。

**快照所有权（Issue #941）：** `serializeSessionSnapshot` 只捕获并冻结一次权威核心数据。独立的 `state` 与 `frame` 视图共享不可变的嵌套核心值和历史记录；玩家展示字段在当前 session 上下文中计算并单独复制。每次玩家序列化只计算一次动物区，供四个展示投影使用；结果只存在于本次调用，不跨查询或命令缓存。Frame 常量键、行动格执行字段的剥离及序列化键顺序保持不变。`rehydrateState` 在规范化或执行规则前复制较小的核心主体，也覆盖 Worker IPC 保留别名但移除对象冻结的情况，因此恢复后的规则写入不会改动任一已保存视图。

`RoomCommitter` 直接接收原生快照新捕获的 Frame，并单独复制终局 scores。Worker 快照仍由外部缓存，因此继续复制其较小的 Frame 主体，同时复用不可变历史。已提交的 diff 基准和失败重试保留这份捕获的 Frame 及编码 payload。PostgreSQL 写入内部 Room history 第 2 版：一份打包后的 `state`、相对于同一已保存 state 的结构差异 `frameDelta`，以及原始 Frame Hash。差异保留 Frame 的全部变化，包括派生值、常量、移除的执行字段、scores、未来字段及独立捕获的历史引用。第 1 版 `frameWithoutStreams` 记录仍可读取。这只改变 Room 存储；内存测试适配器、Worker IPC、Replay 保持原有逻辑快照格式。

打包后的最新快照、undo 和 checkpoint 主体，仅在完整封装比原始 JSON 更小时使用 level-1 gzip/base64 JSON 封装；历史节点记录不压缩。恢复记录的校验和覆盖实际编码文本，读取仍接受原始 JSON 主体。最新快照封装仅保留大厅轮到谁查询所需的 SQL 字段；恢复和本地重启工具均解码完整主体。编码不会展开已引用的历史。

恢复时将已保存的 Frame 差异应用于较小 state 主体的独立副本，拼接精确历史引用，再校验原始规范 Frame Hash；不读取 Replay payload，也不按当前规则重算。规则、Workshop、Worker IPC、Replay 和调试快照保留完整逻辑历史。Worker IPC 在原始 Frame 之外携带恢复身份目录，让记录、操作组和检查点身份跨消息保持一致。JSON 快照为每个序列化别名路径保存同一目录，让这些身份在重启后继续保留。普通撤销、命令回退、嵌套暂定作用域及 Protected Observation 保持既有行为；见 [ADR-0021](adr/0021-room-owned-history-branches-and-recovery-snapshots.md)。

WebSocket 的玩家快照包含 `historyWindow`：最近 **20 个完整操作组**、稳定记录 ID、绑定观察者的分支 ID，以及可选的旧页游标。`getHistory` / `historyPage` 复用活动座位授权（包括拒绝已被替换的连接），先对完整历史做 viewer 过滤，再分页，隐藏手牌事件与取消 payload 同样过滤。读取不写 Room，也不推进版本。HTTP、本地及调试 payload 保持完整。历史节点持久化独立于变化 head 的追加路径 `continuationId`：普通追加保留分支身份，分叉后继或取消改变它。旧页游标携带 head anchor，必须仍为当前流的祖先。客户端保留已加载页及滑出实时窗口的完整操作组，按 record ID 去重，并以稳定的 timeline round DOM key 保持阅读位置。重连漏收整个窗口时，保留原阅读范围，并暴露游标补齐中间缺口。用于识别回退的长度只描述 viewer 过滤后的流，不泄露隐藏记录数量。分叉、回退或观察者切换会清页；请求 scope 身份使切走再切回后的旧响应仍失效。分支失效的游标返回 `history_branch_changed`，触发新窗口读取。

观察者投影的新鲜度与分支身份分开：原本私密的手牌打出后，早期事件可能公开，既有 viewer 序号也可能重排，但不构成分叉。每条展示记录携带累计 `projectionHash`，`projectionHeads` 与分页游标锚定三条过滤后的流。哈希只编码可见记录身份与投影值，按身份绑定的参与者姓名归一化为玩家 ID；隐藏 payload 和隐藏记录数量不进入这些哈希。普通追加与改名保留既有前缀锚点。前缀变化返回 `history_projection_changed`；客户端刷新快照，自动重新获取原先已加载的范围，暂存新页直到达到原最旧操作组，而不是显示撤销提示或丢弃阅读范围。刷新 scope 拒绝过期分页响应，也处理补齐重连缺口时发现的投影不一致。事件时间线的 DOM / 选择 key 在有 `occurrenceId` 时使用它，包括取消 payload；旧记录沿用回退 key。历史补齐与实时 occurrence 反馈保持分离。这些计算锚点在持久化 Frame 之外，不重写 Replay 数据。目前计算仍遍历完整可见流，而非仅遍历选中的一页。记录身份独立于可复用事件序号。操作者及其他参与者姓名按稳定身份投影，改名不再重写原始历史参数。完赛 Replay 沿用归档参与者名与现有匿名化投影。在相同规则与运行时源码下，这些存储和展示改动保持 Replay schema、原始 Frame Hash 链及不可变 Viewer Build 不变。

原生 Session 的窗口化 Room envelope 将 Session 姓名投影延迟到最终的 Room 姓名投影；座位姓名缺失或为空白时，回退到 Session 姓名。完整或直接调用 Session 的 payload 及本地 payload 默认保留 Session 姓名投影；debug 保留原始历史姓名，Worker 预先生成的 payload 沿用既有投影路径。当前事件和已取消事件均无隐藏项时，archive 投影复用派生字段已经一致的非空 packet。输出数组仍是新数组，但共享的 packet 记录及嵌套字段必须只读使用，投影不保证深层所有权独立。每次调用都会重新计算可见性，不跨命令缓存。

### 11.3 Game Context、Replay 与 Bug Report

本节是跨任务实现契约。`room-committer.ts`、`replay-codec.ts`、七表迁移、PostgreSQL 原子写、Game Context resolver、活动局原座位恢复、公开 Replay/Anchor 读取与不可变 Replay Viewer 已落地；Bug Report 模块由后续任务补齐。

模块：

```
server/game/
├── room-committer.ts          Durable Room Commit 的唯一外部 seam
├── replay-codec.ts            canonical JSON、delta、gzip、Frame Hash
├── game-context-store.ts      lifecycle resolver
├── replay-store.ts            公开 manifest、Segment、Anchor read model
├── replay-viewer-build.ts     Viewer Build 完整性校验
└── persistence/
    └── postgres-adapter.ts      Room + Replay + Result 的原子事务
server/game-context-routes.ts  lifecycle resolver
server/replay-routes.ts        manifest、Segment、Anchor、Viewer/Asset 静态读取
server/bug-report-routes.ts    draft、GitHub connection、submit/status、audit
server/bug-report/
├── bug-report-store.ts        PostgreSQL draft/attempt/claim 状态机
└── github-issue-client.ts     GitHub App 唯一外部 adapter
```

`RoomCommitter` 是具体深模块，不增加单实现 interface 或 factory。它的外部 interface 只暴露一个提交操作，返回：

```ts
type RoomCommitResult =
  | { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }
  | { kind: 'unchanged' }
  | { kind: 'blocked'; error: string }
```

主链路：

```text
ClientCommand
  → room-router：验证座位与 payload
  → GameSession：内置卡同步产生 SessionResponse；可执行 Workshop 卡由会话 Worker 异步返回
  → RoomCommitter：序列化一次，原子写 Room snapshot + Replay Step
  → Broadcaster：提交成功后生成各座位遮蔽 envelope 并发送
```

- `resp.ok=false` 且没有 `durableTransition` 标记时，绕过提交并只回发起者。成功命令只有在公开 Frame Hash 与私有权威 session cursor 都未变化且没有 `durableTransition` 标记时才返回 `unchanged`；cursor-only 转换仍持久化 Room snapshot，并记录公开 Frame 可重复的 Step。`durableTransition` 强制记录 Step，包括保留回滚结果与失败记忆的 durable rejection（ADR 0015）；其错误只回提交 socket，其他玩家收到同一已提交版本的无错快照。重连和补拉不创建 Step。
- Replay Step 使用 Room 全局单调 `stepNo`，与 `roomVersion` 分离。多个玩家在同一交互阶段提交时仍串行占用连续 Step；最后一次提交触发的自动引擎结算包含在该 Step 内，规则结果不得依赖提交到达顺序。
- Step 0 在第一个互动命令前建立。classic deal 已包含在 Frame 中；互动 draft、Parent Selection 和显式多人提交从 Step 1 起记录。
- 终局 Frame 额外归档权威 `PlayerScoreSummary[]`；历史 Viewer 在 `gameOver` Step 复用只读 `ScoringPad` 展示分类、卡牌加分与总分。
- Replay Intent 由协议边界的穷尽 switch 白名单化；不保存 `requestId`、token、站点 `userId`、任意原始 WebSocket 消息或未校验 payload。
- 写失败冻结同一 Frame/Intent，Room 进入 blocked 并拒绝新游戏命令；按 1/2/5/10/30 秒、随后每 30 秒重试。暂停期间重连者等待，不读取未提交内存状态。幂等键相同但 Hash 不同永久阻断并报警。
- 单实例上限为 30 个普通内存 Room，`waiting` 与 `playing` 都计数，固定 dev Room 排除。可执行 Workshop Room 因“会话 Worker + 代码 Worker”双 Worker 形态另限 15 个；进程级 15 槽统一计算 WS Room、恢复 Room 与 HTTP sandbox 的 Worker 预留。房间 FIFO 覆盖会话执行直到 Durable Commit 完成，同一连接的换房 / 换座等待在途命令。达到上限只拒绝需要新增对应资源的 Room / `newGame`。内置卡房间不创建会话 Worker，也不增加房间分片、Redis 或外部队列。

完成 Replay 与 Bug Report 使用 ADR-0013 的公开/私有读取契约。GitHub 提交以 PostgreSQL draft、稳定 `submissionId`、attempt 行和原子 claim 实现可恢复执行；生产 GitHub App client 与测试 fake 是 true-external seam 的两个 adapter。

### 11.4 server/custom-code/ — 隔离执行

```
server/custom-code/
├── compiler.ts          TS → JS（ts-blank-space + esbuild）
├── runtime.ts           沙盒运行时
├── engine.ts            源码校验、编译与 manifest 提取
├── isolate-runner.ts    isolate-vm 隔离入口
├── executor-worker.ts   Worker Thread 入口
└── client.ts            主进程 → Worker Thread 同步调用客户端
```

主后端只保存 `compiled_code + code_manifest`。尚未内置的可执行 Workshop 卡在 HTTP sandbox 和 WS community room 中各自拥有一个 `CustomSessionExecutor`：整个 `GameSession` 命令进入专用 Worker，房间内按 FIFO 串行到 Durable Commit 完成，不同房间并行；同一连接的后续换房 / 换座命令也进入连接 FIFO，不能改变在途命令的 Room 或 replay actor。主线程只保留最后成功快照的无执行代码镜像，用于广播、持久化和座位校验；Worker 返回的快照通过无 settlement 的恢复路径进入该镜像，避免在缺少可执行卡注册时重新探测权威 continuation。Worker 内部继续由 `client.ts` 同步调用 isolated-vm，因此 `Atomics.wait()` 不会运行在 HTTP/WS event loop；每条命令前保留含 pending/undo history 的内存 checkpoint；hook 超时或新产生的 runtime warning（包括只读卡牌查询产生的 warning）都会恢复该 checkpoint，同时保留诊断 warning。Worker 崩溃或总超时则终止并从最后成功快照重建。已随源码发布并标记 `built_in=1` 的卡直接走内置实现，不创建该 Worker。浏览器本地 Workshop sandbox 的 Worker 与恢复流程不变。沙盒约束唯一真源 → `docs/CUSTOM_CARD_SANDBOX.md`（含 `prompt-sync:begin/end` 标记块，`pnpm run check:prompt-sync` 校验）。

### 11.5 HTTP 端点

`server/game-router.ts` + `server/index.ts`：

- `GET /api/health` 健康检查
- `GET /api/rooms` 房间列表
- `GET /api/game/state` 补拉当前快照
- `POST /api/game/new` 创建新对局或测试重置。除 `seed?: number` 外，接受与 WebSocket `createRoom` 相同的开局参数（玩家数、轮抽模式与池大小、社区扩展卡 `customCardIds`、各扩展开关），统一经 `server/game/game-setup-options.ts` 映射。这条是调试 / 测试路径——包括本地热座在内的产品对局都是权威房间
- `POST /api/game/load` 加载测试状态
- `POST /api/game/dev/*` 单机调试 / E2E 场景布置
- `POST /api/game/new-sandbox` 创建独立 `GameSession`，**不创建 WS 房间**
- `GET /cards-manifest.json` 主 bundle 启动时拉卡牌元数据
- `POST /api/auth/oauth/:provider/start?intent=link` 已认证的 GitHub / Google 绑定入口，返回带 PKCE S256 的 provider 授权 URL
- `GET /api/auth/oauth/:provider/callback` 登录/注册回调，或不依赖 cookie 的绑定交接：返回 `?page=settings`，短期 state/code（或取消）只进入 URL fragment
- `POST /api/auth/oauth/:provider/complete` 在原前端 cookie 分区完成绑定；先按当前站点用户和 provider 原子消费有效的绑定 state，再交换授权 code，不创建新的站点 session

`client/app/useAccountLinking.ts` 在提交前移除交接 fragment 字段，并保证 StrictMode effect 重放不重复提交；成功后刷新已绑定身份。错误保留在设置页，不再规范化为已登录首页。账号绑定不扩大 OAuth scope，也不使用 Issue Submission Connection 的 token 或加密密钥。

不变量：HTTP 仅运维 / 测试 / 调试，不是实时同步主路径；返回结构与 `SessionResponse` 一致；`validate` 接口纯校验，不写权威状态。WS 房间内 dev 命令优先走 `ClientCommand`。

Game Context、Replay 和 Bug Report 是产品读取/集成接口，不替代 WS 实时游戏同步：

```
GET    /api/v1/game-contexts/:roomId
GET    /api/v1/replays/:roomId/manifest
GET    /api/v1/replays/:roomId/segments/:checkpointStepNo
GET    /api/v1/replays/:roomId/anchors/:stepNo?frame=<sha256>
GET    /api/v1/game-contexts/:roomId/evidence/:stepNo?frame=<sha256>
GET    /replay-viewers/:viewerBuildId/*
GET    /replay-assets/:sha256
POST   /api/v1/game-contexts/:roomId/bug-reports
GET    /api/v1/bug-reports/:submissionId
PATCH  /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/submit
DELETE /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/evidence/inspect
GET    /api/v1/issue-submission-connection
DELETE /api/v1/issue-submission-connection
POST   /api/v1/issue-submission-connection/github/start
GET    /api/v1/issue-submission-connection/github/callback
POST   /api/v1/issue-submission-connection/github/complete
POST   /api/v1/github-app/webhook
```

公开 Replay API 返回版本化 JSON，不暴露 PostgreSQL gzip/BLOB 编码。Segment 每次最多展开一个 checkpoint 链并在服务端逐帧验 Hash；Anchor 必须精确匹配 `stepNo + frameHash`。completed、expired、removed resolver 与公开 Replay 在登录门外；active descriptor、恢复、Bug Report、临时证据和维护者取证分别执行 ADR-0013 的座位或管理员授权。外部错误继续使用 ADR-0013 的 `{ ok:false, code, lifecycle?, message }` 判别式结构。

### 11.6 工坊后端

`server/workshop.ts` 与 `server/workshop-pr/` 提供自定义卡上传、编译、沙盒与 PR 投递。完整产品流程见 [Platform design](PLATFORM_DESIGN.md)。

- 沙盒设置（`sandbox_settings`、`sandbox_cards`）持久化人数、牌组与变体开关；`POST /api/game/new-sandbox` 把它们传给 `createInitialState()`。
- 审核与发布是 `server/workshop-status.ts` 中的两个维度：审核 `unsubmitted / in_review / approved / stale / merged`，发布 `live`。卡牌绑定一个基于 `main`、打开且非草稿的 PR，并固定其 head 与 Design Draft。只有有 push 权限的审核者对精确 head 的真实批准才能批准一个版本；发布时重新查询 GitHub，要求 head、审核 SHA、批准 SHA 与固定版本一致。任何不一致、关闭、转为草稿、改变 base 或撤销批准都会让卡牌进入 `stale·offline`，处理 webhook 或发布时 GitHub 查询失败也是如此。绑定后立即刷新若暂时失败，则保留 `in_review` 绑定、清除同步时间，作者可通过 `refresh-pr-status` 重试。
- 合入 `main` 的 PR 让已批准的卡牌毕业为只读的 `merged`。在批准之前观察到的合入会被记录（`github_pr_status='merged'`），只有在有权限的精确 head 批准被核对后才毕业；合入其他 base 的 PR 进入 `stale·offline`。在线的已合入卡牌继续提供其审核快照直到发布，之后启动时 `markBuiltInMergedCards` 让内置定义接管。
- 真实 Room 中的 `customCardIds` 只接受已批准、已上线的卡，并使用其审核过的快照；作者自己未上线的卡会以指引拒绝创建，其他无法加载的 ID 静默过滤。未审核的代码只在工坊沙盒中运行，从不进入多人 `GameSession`。
- 作者 `unpublish` 让已有对局继续完成；管理员下架会结束每个嵌入该卡的 Room，不计分也不产生 Replay。
- 投稿使用一个仓库范围的 GitHub App；`workshop_submissions` 在远端写入前冻结操作身份与 Draft Version，分支发布使用 expected-head CAS，生成文件冲突会暂停投递。见 [GitHub App runbook](operations/github-oauth-app-setup.md)。
- 工坊草稿错误暴露 `shared/contract/workshop.ts` 中的类型化 `code`。

测试：`server/__tests__/{workshop-api,workshop-submissions}.test.ts`、`server/workshop-pr/__tests__/`。

### 11.7 数据库

`server/db.ts` 通过 `pg` 管理异步 PostgreSQL 连接。事务在跨 await 时持有同一连接，嵌套事务使用串行 savepoint。原生 PostgreSQL migration 在启动前通过 advisory lock 串行执行。产品运行不再保留 SQLite 或 JSON fallback。

`scripts/import-sqlite.ts` 读取已停写、结构版本为 33 的 SQLite，在私有副本上验证当前格式，将保留资源通过私有 S3 协议暂存；精确行/字节比较、Room-owned 恢复、Replay 链/Hash 和资源验证通过后，才提交应用数据。恢复 TEXT 与 Replay BYTEA 保留原始编码。只清理有充分证据的未录制活动局，已录制局损坏时阻断导入。`data_imports` 使导入失败的数据库无法启动接收写入。独立 erasure ledger 先合并应用，再做验证。`scripts/validate-backup.ts` 验证受控 PostgreSQL/S3 恢复；SQLite 仅作为一次性输入工具。

ADR-0014 使用下一可用迁移增加十张表；首个正式 Replay `schemaVersion=1`，不保留未上线实验格式：

| 表 | 所有事实 |
|---|---|
| `game_contexts` | 永久 `roomId`、`active/completed/expired/removed`、phase、`available/legacy_no_replay`、过期时间、Tombstone 原因 |
| `game_context_participants` | 活动房间删除前保存座位与站点用户关联；删号后外键置空，供保留证据投影匿名座位，证据清理后同步删除 |
| `game_replays` | `schemaVersion`、`viewerBuildId`、`gameBuildId`、recording/completed 状态、最新 Step、`missingPrefix`、自定义卡快照 |
| `game_replay_steps` | `roomId + stepNo`、`roomVersion`、`checkpointStepNo`、玩家座位、白名单 intent、payload kind/gzip、Frame Hash |
| `issue_submission_connections` | GitHub 数字用户 id、AES-256-GCM token/refresh token、nonce/tag、`keyId`、过期与撤销状态 |
| `account_deletion_requests` | 已提交删号请求、下一次外部清理时间和最后错误；账号先失效，GitHub 清理失败后由后台重试 |
| `github_grant_revocations` | 删除竞态或临时失败后待重试的加密 GitHub grant |
| `bug_reports` | 稳定 `submissionId`、Reporter 关联、Anchor、草稿、作者选择、交付状态、Issue 编号/URL、证据到期时间 |
| `bug_report_attempts` | 30 天交付/对账/限流尝试元数据；不保存 token、现象副本或原始 GitHub 响应 |
| `bug_report_evidence_audit` | 维护者、时间、Anchor、视角和非空理由，永久保留 |

继续复用：

- `rooms` / `room_players`：活动恢复 snapshot 与站点座位所有权。
- `game_results` / `game_result_players`：完成局标量结果、Replay Participant 显示名和内部用户关联。
- `oauth_states`：增加 Bug Report 的加密 PKCE verifier，复用短期 state/returnTo 生命周期。账号绑定使用独立的服务端专用 `account_pkce_verifier` 字段，十分钟内有效、消费后清除，无需新增部署密钥。

不增加 Replay Segment、Reported Evidence payload、quota counter 或 webhook delivery 表。Segment 由 `checkpointStepNo` 表达；`bug_reports.evidence_expires_at` 只在 Context 尚未完成时保护共享 Segment，正常完赛后改用永久 Replay Archive；额度和全站 20 次/分钟 GitHub 发送窗口从 report/attempt 行查询；撤销 webhook 操作本身幂等。

迁移必须幂等回填现有数据：`rooms` 生成 active `game_contexts`，`game_results` 生成 completed `game_contexts`，同一 `roomId` 同时存在时 completed 优先。上线前完成局标记 `legacy_no_replay`，不创建 `game_replays` header、Replay Frame、`schemaVersion` 或 `viewerBuildId`；completed descriptor 仍返回 Game Result Archive 摘要，只有 `replayStatus=available` 才返回 manifest 与 Segment。因此只有两个既有来源都不存在的 id 才返回 `unknown_context`。

### 11.8 GitHub 交付、安全与删除

- 创建 draft 时由服务端确认 Reporter 是 active `room_players` 或 completed `game_result_players` 中的原座位，并固定 `roomId + stepNo + frameHash`。现象 trim 后必须为 1–2000 个 Unicode 字符；不做语法或句号判断；每用户最多保留 5 个尚未丢弃且 Issue 编号未知的报告。
- `github-issue-client` 的 production adapter 只接受服务端固定 Repository ID / Installation ID，不接受客户端 owner、repo、labels 或 URL；所有 GitHub 请求使用 15 秒超时。marker 对账只接受由配置 GitHub App 创建、不早于对应交付尝试且唯一以预期 marker 结尾的 Issue。测试使用 fake adapter，覆盖成功、401、权限 403、限流 403/429、410/422、网络错误、5xx 和不确定结果对账。
- 本人提交使用加密的 GitHub App user token，并要求玩家确认 GitHub 公开作者身份无法由站点删号匿名化；报告持久化确认时的 GitHub 数字用户 id，排队和实际投递都拒绝静默切换账号，账号变化后必须重新确认。Hosted Issue Identity 使用不落盘的 installation token。连接失效绝不自动换作者。token/refresh token 使用 AES-256-GCM、每行独立 nonce/tag 和 `keyId`；PKCE verifier 同样加密且只活到 OAuth state 到期。每用户只保留一个 live Bug Report state；GitHub callback 只把 state/code 放进前端 URL fragment，前端回到原顶层上下文后用分区 session 调用 complete，服务端按当前站点用户消费 state 后才换取令牌。
- PostgreSQL executor 原子 claim 一个 `submissionId`。不确定响应先按正文稳定标记对账；重试和限流遵守 ADR-0012。客户端只轮询站内状态，不直接调用 GitHub。
- Bug Report 底栏请求带当前 `roomId` 的 connection status；只有该用户是原参与者且 Room 已存在 Replay Step 时才启用新建入口。完成局未登录时保留当前 Replay anchor 进入登录，已保存草稿在关联活动局过期或下架后仍可恢复或丢弃。等待局、未录制局和 legacy no-replay 局返回明确的 anchor unavailable，不伪装成非参与者。
- Issue 标题为清洗并截断的 `Game bug: <现象首行>`，正文不包含截图、日志、Frame payload、其他玩家身份或隐藏信息。创建、marker 对账、删号匿名化和 Issue webhook 共用固定公开目标 `titanxxh/open-agricola`。当提交身份无法设置标签时，该仓库的 `bug-report-triage.yml` workflow 为游戏内报告补上 `needs-triage`；通知使用 GitHub 原生 watching。
- 主动断开立即删除令牌。只有本地未提交草稿的账号可直接删除草稿和账号；存在连接、公开 Issue 或已进入交付的报告时，删号先持久化 `deletion_pending`、注销全部会话并禁用本地连接，再由同一 installation adapter 修改已知 Issue 正文；失败时后台按持久化状态重试。已放弃但曾提交且 Issue 编号未知的报告先按 marker 对账；GitHub `issues.deleted` webhook 使已删除 Issue 直接完成该项清理。GitHub 回包确认正文不再含站点用户 id 后才清除最终内部关联。
- 维护者全开 evidence 读取必须提供非空理由并写 `bug_report_evidence_audit`，审计行同时保存不受账号外键删除影响的维护者身份快照；每个维护者账号每小时最多读取 30 次。返回证据前复用当前 Participant tombstone 投影；上线前已过期且没有座位快照的证据按全部座位已匿名化处理。`server/game/replay-removal.ts` 在删除 payload、匿名化或清除 Result、把 Context 标记为 removed 前，先通过 ETag 条件写把整次操作追加到私有 S3 的 `erasure/ledger.json`。并发下架不会覆盖彼此的条目。账本独立于 PostgreSQL 备份，恢复时禁止用旧版本覆盖；启动和恢复工具校验并幂等应用账本，补录旧备份中新发现的违规引用，账本损坏时停止恢复。资源读取和上传也检查永久 Hash 禁用规则，防止数据库恢复后重新暴露或归档被下架内容。普通共享资源有持久引用时保留；违规资源先建立目录屏障，再执行删除。无关 Replay 元数据损坏不阻断 Tombstone，但无法证明未引用时保留普通资源。首版不做管理 UI。
- public resolver/manifest/Segment 使用独立 IP 读取额度和响应大小上限；active evidence、Bug Report 和维护者接口按账号限流。任何日志都不得输出 token、Frame payload、现象原文或原始 GitHub 响应。

### 11.9 部署、回滚与观测

PostgreSQL 保存平台数据和共享上传、引用目录。资源保存在私有 S3 bucket，应用镜像中的文件不作为资源真源：

```text
card-art/<filename>             Workshop 原始上传，公开 URL 不变
replay-viewers/<viewerBuildId>/ 不可变历史 Viewer 代码 Build
replay-assets/<sha256>          Replay Card Snapshot 内容资源
erasure/ledger.json             独立删除账本，禁止回退恢复
```

`server/storage/` 统一负责 S3 协议、暂存、引用、完整性校验和清理领取。写 S3 前先持久化上传意图，无引用新上传保留 24 小时。Workshop 草稿与不可变版本在自身 PostgreSQL 事务里维护资源引用。Replay 准备阶段先建立持久引用，冻结的初始提交再把它原子转换为 Replay 引用；准备引用只在明确退役后释放，或由共享清理确认不存在 Room、Replay、有效 owner、分配记录及未过期的待定命令后释放。到期 scope 和已放弃的分配记录定期清理，未知 scope 不会重新获得写入资格。清理执行者锁定资源行并领取删除任务，删除期间拒绝新增引用；领取到期后可由其他执行者接续。已发布 Viewer 的每个文件均保留持久引用。

本机 PostgreSQL 和支持 ARM64 的 S3 兼容服务使用持久 Docker 卷。`restart-local.sh` 生成不入库的本机凭据，构建并上传 Viewer 的原始 manifest 和文件，发布完成后启动应用。测试使用独立数据库、bucket 和每次唯一 schema/对象前缀。以后切换托管 S3 使用相同协议，但必须明确迁移并校验数据。

完整目标配置：

```
DATABASE_URL
S3_ENDPOINT
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
REPLAY_VIEWER_BUILD_ID
REPLAY_TRUST_PROXY
GAME_BUILD_ID
BUG_REPORTS_ENABLED
BUG_REPORT_GITHUB_APP_ID
BUG_REPORT_GITHUB_CLIENT_ID
BUG_REPORT_GITHUB_CLIENT_SECRET
BUG_REPORT_GITHUB_PRIVATE_KEY
BUG_REPORT_GITHUB_WEBHOOK_SECRET
BUG_REPORT_GITHUB_INSTALLATION_ID
BUG_REPORT_GITHUB_REPOSITORY_ID
BUG_REPORT_TOKEN_ENCRYPTION_KEYS
BUG_REPORT_TOKEN_ACTIVE_KEY_ID
```

Durable Room Commit 要求 PostgreSQL、共享资源、`REPLAY_VIEWER_BUILD_ID` 和 `GAME_BUILD_ID`，正式 Room 必须录制。创建时固定两个 Build ID 和自定义卡运行时快照；未发布卡仍要求玩家确认永久公开。Viewer Build ID 必须是完整 `manifest.json` 的 SHA-256，清单固定 `index.html` 入口及目录内每个文件的 SHA-256；Build 只保存 Viewer 代码、样式和卡牌 manifest，棋盘图、卡图和字体与主站使用同一素材仓 GitHub Pages 当前来源，不归档图片历史。构建时校验 Pages 部署版本/清单与 `public-assets.ref` 一致，运行时版本参数只是缓存键，不是历史快照。Replay CSP 允许图片站 Pages 路径的图片和字体，并保留旧 raw 图片仓路径的许可供已有房间的不可变 Viewer 使用；新构建仅使用 Pages URL。校验失败时拒绝创建。自定义卡图在 Step 0 前复制到内容寻址的 S3 对象，并把 Replay header 改写为不可变应用 URL。等待局在 Step 0 建立前拒绝游戏写入。未完成局过期和 Bug Report 证据保留沿用现有事务边界，小时级共享清理删除符合条件的无引用对象。录制前缀缺失时阻断恢复；明确未录制的活动局按 Game Context 生命周期删除，不制造替代前缀。

部署使用计划维护窗口：发布并校验 Viewer，迁移持久数据和资源，应用独立删除账本，验证目标版本恢复能力，再恢复应用流量。保留历史 Viewer 字节、现有公开 origin 和 OAuth 回调地址。只有对应的可选产品功能才要求 GitHub App 配置。部署命令见 `HOW_TO_DEPLOY.md`。

启用录制后，应用只能回滚到支持所有活动 Room `schemaVersion` 的 recorder-compatible 构建；不能回滚到功能上线前后端。Viewer Build 必须先存在，后端才能把其 id 锁进新 Room。缺少 Viewer、持久化不可写或 Room 数达到 30 时，readiness 进入 degraded 并拒绝新建 Room，不牺牲已有 Room。

首版不引入新的 metrics 后端。结构化日志和健康状态至少暴露：普通 Room 数、容量拒绝、Durable Room Commit latency/error/retry、blocked Room 数、Hash 冲突、Replay payload 大小/损坏、GitHub queue/attempt/rate-limit、缺失 Viewer Build。日志字段只含稳定 id 和数值，不含受保护 payload。

#### 平台运行观测

`server/observability/` 管理有界数值指标、采集、管理员网关和总览健康，不写规则状态。`Broadcaster` 在已有编码发送处按收件人计量一次；`stateUpdate` 回合取该包实际返回的状态，undo 和恢复也遵循此口径。回合为 `1`–`14`、`pregame`（draft/parent selection）、`postgame`（gameOver/playing 第 15 回合）、`none`、`unknown`。其他事件使用捕获的 Room/命令上下文。禁止把房间、账号、命令/请求身份、卡牌、payload 或异常文本作为标签。

命令单调时钟耗时覆盖解析后的 dispatch、队列等待、receipt/ownership 校验、Session 执行、持久化提交及本地发布。首次相关响应另行统计，pending receipt 不等于完成。提交仍然先持久化再发布，冻结重试语义不变。投影、JSON 编码和 `ws.send` 入队分别统计，嵌套阶段有重叠；入队不代表网络送达或前端渲染。指标失败不得改变游戏结果。默认进程指标覆盖 CPU、RSS/heap、事件循环延迟和 GC；Worker 墙钟耗时不等于 Worker CPU。

应用端口绑定 app 容器内 loopback，私有 Prometheus 通过 bearer 保护的入口发现和逐实例转发采集。稳定端口/slot 标签跨进程身份变化，PromQL 处理 counter reset，合并 histogram bucket 后再计算分位数。入口拥有全站基于租约/epoch 的房间汇总，并通过带过期时间的私有 presence 行对在线用户去重；应用进程提供本地连接、队列、Worker、持久化健康。采集仅更新运行 presence，不写游戏状态，不遍历快照/history 采集平台 gauge。

Grafana 仅访问 Prometheus 汇总。每个 `/ops/` 资源和查询重新校验当前站点 session 与 `ADMIN_USERS`。30 秒原子一次性交接安装 HttpOnly 看板 cookie，关联原始 session；删除、过期和权限变化在下一次请求生效。代理丢弃客户端凭据/身份头，传递可逆 ASCII 编码的站点用户名并强制 Viewer，仅允许 GET/HEAD 和只读数据源查询 POST。禁用 Grafana login token、匿名/basic 登录、公开看板、编辑和 Live；生产不发布私有服务端口。指标清单和新鲜度边界见[部署文档](HOW_TO_DEPLOY.md#operations-monitoring)。

浏览器按 10% 会话抽样上传有界、限速的命令 RTT、首快照就绪、快照到 React layout commit 耗时。每项起止使用同一浏览器单调时钟，不跨时钟相减，也不宣称测到浏览器 paint。样本仅含数值耗时、有界 kind/outcome 和回合，属于不可信观测输入。

---

## 12. client/ — 前端

### 12.1 客户端 bundle 边界

| Bundle | 入口 | 路径 | 约束 |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | 走 WS；`shared/*` 只准用 `contract` / `domain` / `i18n`，卡牌展示走 manifest-backed `card-meta` + `custom-card-metadata` |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | 懒加载 Workshop sandbox UI；规则仍由后端 sandbox 路径执行。权限仅适用于 `scripts/architecture-policy.mjs` 列出的精确入口和文件，不豁免整个目录 |
| `local-sandbox-worker` | `client/local-sandbox/worker.ts`（`new Worker(new URL(...))` 懒加载） | `client/local-sandbox/` | 工坊试玩 browser 模式的引擎 Worker。worker 侧四文件（worker / worker-core / browser-runtime / browser-executor）允许完整 `shared/*`（精确文件权限）；`local-transport` / `persistence` / `workshop-launch` 被主 bundle 引用，对 shared 仅 type-only import，保证引擎不进主 bundle |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | 无登录、Cookie、WS 或命令发送；只读取公开 Replay JSON，并复用归档时编译进去的显示过滤与棋盘投影 |

主 bundle 预算：`scripts/check-bundle-size.ts` strict（main ≤ 550KB raw / ≤ 170KB gzip）。

### 12.2 服务层 client/services/

- `gameTransport.ts` —— `WsGameTransport` 类管理 WebSocket 连接（不在 React Context；在 service 层）；URL 切换 `?transport=ws` / `?player=p1|p2` / `?room=devN`。
- `card-meta.ts` —— 启动时 `GET /cards-manifest.json` 运行时拉取卡牌元数据；`CUSTOM_*` overlay 只读 `shared/cards/custom-card-metadata.ts`。
- `rehydrate.ts` —— 轻量 rehydrator，跳过 `ActionSpace.onTaken` 回调，切断对 `shared/actions` / `shared/cards/catalog` 的依赖链。
- `llm/generation/` —— 浏览器拥有 `GenerationAttempt`、不可变请求构造、provider 工具协议、有界 GitHub 读取和完整源码结果。LLM 凭据只发往配置的 provider，游戏后端与 GitHub 均不接收。每次尝试解析 GitHub 当前 main，后续读取固定该 SHA；文件缺失返回工具错误，模型可改查同 SHA 的其他资料；网络或限流失败暂停，等待显式重试。`server/workshop-references.ts` 使用项目 GitHub 凭据，为已登录工坊用户读取最新 main 与固定 commit 的目录元数据；不接受任意 URL 或模型凭据。浏览器仍匿名读取固定 SHA 的源码正文并校验 blob 哈希，资料与站点发布独立。 PostgreSQL 在实例之间共享用户与全站读取额度、上游冷却期限，以及一小时内由 main 确认的 commit 授权，详见 Platform C1.2；初始化重试保留已确认的 SHA。
- `GET /api/workshop/sandbox-contract` 通过 `server/workshop-sandbox-contract.ts` 提供实际部署运行时的 hooks、actions、helper 正文、语义与内容标识，包括校验器要求的对象/数组字面量结构及内联 listener 函数，不提供参考资料包。简短生成 prompt 包含该契约；按需读取的 GitHub 文档与内置卡样例不能扩大它。`POST /api/workshop/cards/validate-code` 将校验绑定源码及沙盒标识。仅逐一通过验收的 provider/endpoint/model 组合可用。
- `WorkshopAbilityPanel` 通过草稿 reducer 应用结果：追加需求使用选中候选，试玩修复使用实际报错源码，原始费用与前置条件保留在固定输入中。编辑能力输入或切换模型配置会取消旧尝试，阻止迟到结果采用或继续修复。失败与手动编辑保留上一份有效候选。恢复只投影可见聊天和精简溯源，原始工具、reasoning、signature 记录仅留页面内存。完整请求、恢复及验收契约见 `docs/PLATFORM_DESIGN.md` 与 `docs/test/llm-card-gen.md`。

### 12.3 同步状态层

- `client/hooks/useGameSync.ts` —— hydrate 服务端快照，持有 `state` / `pending` / `interaction` / `scores`，**整体替换**。
- 收到 `stateUpdate` 处理顺序：`normalizeState()` → `createActionSpaces()` → 用服务端 `resources` / `takenBy` 覆盖模板字段 → 替换 store。
- 前端**不做乐观提交**：点完发命令，等 `stateUpdate` 到达再改 UI。
- 本地 UI 临时态（hover / 临时选择 / 输入框）独立管理；新快照到达后检查本地选择是否仍合法，不合法清空。
- 断线重连：`socket reconnect → joinRoom → roomJoined(status, players, maxPlayers)`；`waiting` 恢复等待页，`playing` 才继续 `getState → stateUpdate → 整体替换`。已连接玩家在 `newGame` 因缺席座位回到等待态时，服务端广播 `roomWaiting(roomId, players, maxPlayers)`，前端立即隐藏旧棋盘并恢复等待页。

### 12.4 视图编排

`client/app/GameContainerApi.tsx`（含内联 `useTransportSetup` 管理连接）+ `LobbyPage.tsx` + `PageRouter.tsx`。根据 `viewPlayerId` / `playerIndex` 计算窗口可交互性，管理本地临时态。

### 12.5 浏览器本地试玩沙盒（client/local-sandbox/）

`VITE_SANDBOX_EXECUTOR=browser` 时工坊试玩全程在浏览器运行，零服务器参与；缺省走服务端 `/api/game/new-sandbox`（原样保留）。

- 启动链路：`WorkshopPage` 组装 `LocalGameConfig`（卡 JSON + 源码 + 沙盒设置）写 sessionStorage → 嵌入 iframe 带 `?localSandbox=1` → `useTransportSetup` 创建 `LocalGameTransport`（实现 `GameTransport` 全部接口，与 HTTP/WS transport 同构接入 `useGameSync`）。
- 引擎 Worker：`LocalSandboxCore` 装配 shared `GameCore`（经 `registerCustomCardImpl` 注入 `registerBrowserBackedCustomCard`），卡代码走 shared AST 校验 + `ts.transpileModule` 本地编译（typescript 只进 worker chunk），`new Function` 直接同步调用；执行语义与服务端 isolated-vm executor 由 `server/__tests__/local-sandbox-parity.test.ts` 钉死等价。快照组装复用 `shared/session/sync-payload.ts`（与 `GameSession.buildSyncPayload` 同一函数），本地默认 `debug` 视角（与服务端 sandbox 匿名 HTTP 行为一致）。
- 死循环恢复：请求级超时（10s）→ `terminate()` → 重建 Worker → 从最后一份 persist 快照 `restore`（含 `engineStackCursor`，pending 交互存活）→ UI 提示回退。
- 持久化：IndexedDB 单槽 + debounce 落盘（`onPersist` 钩子），进入试玩时「继续上一局」恢复；schema 版本不符或损坏的存档静默清除（不维护旧存档兼容）。
- 已知边界：编辑器指定精确草稿版本（`exactVersionId`）的试玩暂仍走服务端 sandbox（卡数据不在工坊前端 state 中）。

`ActionBoard` 用 `getBoardPlayerCount(players)` 切 className `action-board--{n}p`：2P=830px，3P/4P=1000px。

### 12.5 contexts

- `AuthContext` —— 站点登录 session（密码 / GitHub / Google）；不保存 Bug Issue 写权限。
- `LocaleContext` —— 多语言切换。

### 12.6 ESLint 三层强制

`eslint.config.js` 关键规则：

- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card source、card generated catalog 和 per-card impl modules；UI metadata 必须走 `public/cards-manifest.json` + `client/services/card-meta`。
- 特权入口和 Worker 文件精确列于 `scripts/architecture-policy.mjs`；普通页面和回放不保留规则运行时例外。
- TypeScript 模块解析统一处理相对路径；非字面量依赖、生产代码导入被排除的源码、缺失根目录、语法错误和失效权限都会失败。模块 URL 必须指向已授权入口；Vite 闭包检查保留虚拟模块的依赖边。
- `package.json` 已声明 `sideEffects` 给 bundler tree-shaking 基线。
- violation = CI error。

### 12.7 Game Context、Replay Viewer 与 Bug Report seam

启动顺序改为：

```text
GameContextRouter
  ├─ active → AuthProvider → 现有 PageRouter / GameContainerApi + 可选只读 Anchor 抽屉
  ├─ completed → ReplayShell → credentialless Replay Viewer iframe
  ├─ expired + retained Anchor → credentialless 历史 Viewer 单帧证据
  ├─ expired → Expired Game Context 页面
  └─ removed → Replay Tombstone 页面
```

- `?context=<roomId>` 必须在当前卡牌 manifest 与全局登录门前解析。active 未登录时保留完整 returnTo；completed、expired、removed 不加载登录依赖。
- active 恢复继续使用现有 WebSocket，但 `joinRoom` 必须携带 `intent:'resume'`；服务端只按持久化站点 `userId → playerIndex` 恢复原座位。保存暂停时所有在线座位显示同一状态提示，新命令控件禁用。
- `ReplayShell` 校验 Replay header 与内容寻址 Viewer manifest，选择 `viewerBuildId`，并只在选定视角后创建 `credentialless`、`sandbox="allow-scripts"` iframe。历史 Viewer 是无登录、无 Cookie、无 WS、无 ClientCommand 的独立只读 bundle，直接读取公开 JSON Segment，并用当时编译的遮蔽逻辑切换 `p1…pN | open`。
- retained evidence 由父页面携带站点 Cookie 鉴权并按原座位投影，再把单帧及 Replay header 中的自定义卡快照通过 `postMessage` 交给校验过 `viewerBuildId` 的 credentialless 历史 Viewer；历史 Viewer 不自行读取鉴权接口。
- 直接打开 completed 且 URL 没有 perspective 时，任何 Frame 展示前先选座位或全开。桌面 auto 默认时间线优先双栏，手机 auto 默认棋盘优先；900px 是自动断点，手动布局写入 URL 并覆盖响应式默认。“本步证据”固定展示 Step、轮次、操作者、白名单 intent 和 Frame Hash。
- 播放默认停在 Step 0，提供播放/暂停、前后步、滑杆跳转和键盘控制；损坏 Segment 显示不可用区间并允许从下一 checkpoint 继续，不尝试静默修复。
- Bug Report 使用已定稿的三步引导式底栏：必填现象 → 自动上下文 → 作者身份。创建 GitHub OAuth 跳转前必须先保存 server draft；取消授权返回同一 `submissionId`，提交后通过 status endpoint 轮询。提交响应丢失时立即回读权威状态并恢复轮询，成功态禁止重复创建。
- active Reporter 从当前最新已提交 Step 建 Anchor；completed Reporter 必须是历史原参赛者，并从当前播放 Step 建 Anchor。公开 Issue 不嵌入 Frame、截图、日志或其他玩家隐藏信息。
- Issue Submission Connection 与 `AuthContext` 分离：报告底栏负责首次连接，Settings 只显示连接状态和断开操作；连接失效不得自动切换到 Hosted Issue Identity。

---

## 13. 测试策略

### 13.1 三层

| 层 | 目录 | 用途 | 是否在主 PR 必须通过 |
|---|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts` + `client/**/__tests__/*.test.ts` | 纯领域逻辑，造 mock state 调函数 | ✅（fast 项目） |
| Session | `server/__tests__/*.test.ts` | 直接实例化 `GameSession`，调 `takeAction` 等，断言 `resp.state` / `pending` / `interaction` / `ok` | ✅（slow 项目，按文件名 glob `[A-E][0-9]*-session.test.ts` 一卡一文件） |
| E2E | `e2e-tests/*.spec.ts` | Playwright 双窗口浏览器，验证多人链路 | 手动 / Workflow |

#### 后端展示投影

`serializeState` 为每位玩家生成 `lockedFarmTileKeys`、`playerPanelSummary` 和 `moorSpecialActionAvailability`。同步和持久化计算前均激活所属 Session 上下文。实时页面、本地 Worker 页面和回放只读这些快照字段；恢复权威 PlayerState 时剥离它们。纯视角遮蔽位于 `shared/projections/serialized-state.ts`，不依赖规则运行时。历史 Viewer 和 payload 保持不可变；新增字段为加法扩展，由新 Viewer 消费。

行动统一在 `shared/actions/index.ts` 装配；季节内部行动在构造时捕获完整解析器，保留基础、内部和 ad-hoc 行动的递归替换、alternative 和 before-flow 判断。主改元数据、gain 配置、页面导航和 LLM 流式调用分离为独立模块以消除反向导入。

#### 架构 fitness 覆盖矩阵

`pnpm run check:architecture` 执行架构脚本、契约类型检查、通过 `check:architecture-tests` 运行的现有契约测试，以及 strict 沙盒 prompt/文档同步检查。契约测试覆盖 effect、资源事实来源、事件映射、交互命令、Card Source、PromptKey、LLM prompt 渲染契约、CI 接线，以及 listener 纯度 guard（正负例加两人 Session）。这些测试保留既有 Vitest project 归属，也会在 `pnpm test` / `pnpm test:fast` 中运行。Bundle 体积预算仍在构建后单独检查；浏览器依赖隔离由架构入口自身保证。

架构检查必须尽可能简单。目的是拦住 agent 和开发者编写代码时常见的架构误用，不是防御刻意构造的绕过，也不证明任意 JavaScript 都安全。优先使用源码发现、文件清单、导入边界和小范围语法检查；报错应直接指向修法，维护成本应与实际防止的错误相称。运行时安全边界与行为测试各自承担独立职责。

旧日志与 effect 扫描器按以下范围实现：

- 复用 `scripts/source-files.ts` 发现并解析所有受支持扩展名。日志必需根 `shared`、`server`、`scripts` 必须存在且包含源码；缺根、空根、解析错误或不支持的文件系统条目应失败，不能显示为无违规。
- 沿用已有日志写入识别规则。每条具名生产例外记录原因，并要求实际命中这些规则识别出的写入；文件删除、函数改名、写入消失都使例外失效。命中只验证例外仍在使用，不证明函数全部行为合法。
- effect 清单只限制顶层生产文件，架构测试复用同一检查器；`internal/` 和测试目录不新增固定清单。
- 本次覆盖修复不增加符号或数据流引擎、复杂别名传播、回调或继承分析，也不枚举 `bind`/`call`/`apply`、动态导入等绕过方式。测试覆盖受支持的常规写法、仓库真实样例和扫描失败，不建设对抗性语言特性测试集。超出此约定的 review 意见，必须先说明仓库中具体、常见的使用场景，才能扩大检查范围。

| 约束 | 可执行覆盖 | 边界 |
|---|---|---|
| `shared` / `server` / `client` 物理分层 | ESLint `architecture/imports` error | 测试目录有显式豁免；只检查 import，不证明 runtime ownership。 |
| Card Source scope 与跨卡引用 | `pnpm run check:card-impl-boundaries` | TypeScript AST 检查生产 Card Source 文件及同文件卡牌 ID 字面量或顶层 const 别名。`Major_*`、`reaches`、购买候选和前置候选是显式例外；不追踪跨文件数据流。source scope 为空或不匹配时失败。 |
| 运行时循环依赖 | `pnpm run check:dependencies` | 所有运行时 SCC、自环和字面量动态导入环都会失败，不保留循环基线。显式 type-only 声明被擦除；verbatimModuleSyntax 下的行内 type specifier 仍加载模块。其他含源码的顶层目录报 `unclassified source root`，但 `git check-ignore` 判定为忽略的未跟踪目录（`.gitignore`、`.git/info/exclude`）除外；已跟踪目录始终计入。 |
| 浏览器与回放隔离 | `pnpm run check:browser-boundaries` | 同时检查两个生产入口的源码传递依赖和真实 Vite 模块图。元数据权限精确到文件并附原因；新增 Worker 入口、越权进入沙盒和入口证据缺失都会失败。 |
| 架构类型契约 | `pnpm run check:architecture-types` | `tsconfig.architecture.json` 对策略与检查器测试执行真正的 no-emit 类型检查，包括正反类型断言；Vitest 运行成功不等于类型通过。 |
| 扫描完整性 | direct session log、effect-file list、no-DSL、test-project coverage、Card Source 与 field-boundary 检查 | 根目录和语法必须有效；源码声明与全部已注册实现独立比对，支持 major 文件多声明。Parents 保持独立的元数据/运行时模型。 |
| trailing listener snapshot | `pnpm run check:card-impl-boundaries` | 从解析后的 `ALL_CARD_IMPLS` 枚举 handler，其 ID 必须覆盖所有声明了 `impl` 的生产 Card Source。`immediatelyAfter`、`after` 中直接读取 `improvements` / `minorPlayed` / `occupationPlayed` 长度会失败；非 trailing 读取和 membership 检查仍允许。门禁只解析实际 handler 函数体，不跟踪 helper 调用或派生值。runtime scope 为空、不完整或无法解析时失败；runtime 诊断只标识卡牌与 listener，不伪造原始源码行号。 |
| listener 状态纯净 | 所有会 dispatch listener 的 Vitest project 由 setup 安装的运行时 guard，加 `pnpm run check:card-impl-boundaries` | guard 用深层只读 Proxy（含属性描述符与 `eventQuery` 结果）包裹每次 `executeCardListener` / `invokeCardCostCandidateTransform` 调用以及每个已加载 Card Impl 的 listener 函数本身，任何写入或返回 live 引用都失败；只证明被执行的分支。静态扫描解析每个已解析 handler 与 cost-candidate transform，对根为 context 参数的显式写入失败，仅跟踪同函数别名。两者都不跟踪跨文件数据流，不声称全程序 mutation proof。契约测试：`shared/cards/__tests__/listener-purity-guard.test.ts`、`server/__tests__/listener-purity-gate-session.test.ts`。 |
| 生成目录与 Card Source 一致 | `pnpm run check:generated-cards-sync` | 结构化校验 source/catalog 相等，不硬编码卡牌数量。 |
| `GameSession` 持有服务端命令边界 | `CONTEXT.md`、ADR-0014、review、三层 import error | 这是 ownership，不表示只有一个源文件包含赋值；不声称完成 whole-program mutation proof。 |
| canonical 架构接线 | `pnpm run check:architecture` + `scripts/__tests__/ci-card-impl-boundaries.test.ts` | 两份 CI workflow 各调用一次 aggregator。公开仓库的 main PR/push 自动执行；私有期自动 job 跳过，仍要求可信本机全量 CI。保留手动触发。GitHub 必需检查按 `docs/operations/ci-checks.md` 中已验证的启用顺序配置。 |

`vitest.config` 分多个 fast 子 project（`fast-shared` / `fast-cards` / `fast-card-runtime` / `fast-client` / `fast-server` / `fast-scripts` / `fast-tests`）以及 `slow` / `llm`。`pnpm test:fast` 先运行 `check:test-project-coverage`，独立发现仓库测试文件，并确保每个文件恰好归属一个 fast、slow 或 LLM project。`pnpm test:fast` CI 默认；`pnpm test:slow` 单卡 session 测试；`pnpm run test:e2e` 需后端 + 前端在跑；`pnpm exec vitest run <file>` 单文件。

### 13.2 后端边界测试驱动入口

- 直接调 `GameSession` 方法（推荐）。
- 调 `/api/game/*` 或 WS 消息（黑盒契约）。
- 模板 → `docs/CARD_TEST_TEMPLATE.md`（默认 2 人游戏）。

推荐断言字段：

```
state.players[n].resources
state.players[n].minorPlayed / occupationPlayed / improvements
state.players[n].cardStates
state.actionSpaces[*].takenBy / resources
pending / interaction
log
scores
```

**不要把 DOM、按钮文案、页面结构作为规则正确性的主要断言依据**。前端渲染单独做 E2E。
