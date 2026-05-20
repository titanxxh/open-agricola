# Open Agricola 架构

> 唯一真源。描述当前 `main` 已落地的架构。
> 本文档替换历史的 `ENGINE_ARCHITECTURE.md` 与 `ENGINE_NEW_ARCHITECTURE.md`。

---

## 1. 设计目标与不变量

主链路 = **WebSocket 房间对局 + 后端权威 + 前端被动渲染**；HTTP 退化为启动 / 调试 / 运维 / 测试通道。

不变量（违反即架构 bug）：

- **后端唯一写入者**：只有 `GameSession`（`server/game/authoritative-session.ts`）能修改 `GameState`。
- **全量快照**：同房间所有客户端收到同一份 `stateUpdate`，前端不做局部 patch。
- **弱客户端**：前端只渲染、收集输入、管理本地 UI 临时态，不裁定规则。
- **命令驱动**：前端只发"我要做什么"，后端校验、执行、落状态、产生日志后广播。
- **单一领域实现**：行动 / 引擎 / 卡牌 / 回合 / 收获 / 计分统一放 `shared/`，前后端共用同一套领域模型。
- **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/` 由 ESLint `no-restricted-imports` 强制（CI error）。
- **卡牌就地闭环**：卡牌特效写在卡牌文件内部，不向核心路径扩散。

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
  ├─ 命令执行中心（唯一写入 GameState）
  ├─ 持有 SessionCore + EngineStack
  ├─ undo 历史 / 行动起点快照
  └─ 计算 InteractionState、scores
        │
        ├─→ shared/session/ (SessionCore, phases/)
        ├─→ shared/engine/  (Engine, EngineStack, nodes/)
        ├─→ shared/actions/ (effects/, payment/, hooks)
        ├─→ shared/cards/   (deck A..E + major + community)
        └─→ shared/domain/  (PlayerBoard, farmyard, scoring, ...)
        │
        ▼
server/game/persistence/
  ├─ sqlite-adapter.ts   (PERSIST_ROOMS=sqlite，默认，data/open-agricola.db)
  ├─ json-adapter.ts     (PERSIST_ROOMS=json，output/<roomId>.json)
  └─ memory-adapter.ts   (测试)
```

HTTP 入口 `server/game-router.ts`（`/api/*`）保留：健康检查 / 房间列表 / 快照补拉 / 测试夹具 / dev 调试 / sandbox 创建。

---

## 3. 三层结构与目录骨架

```
shared/        零 React，前后端 + sandbox 共用
├── contract/      协议层（GameState、InteractionState、ClientCommand、StateUpdateEnvelope）
├── engine/        节点树引擎 + EngineStack
├── session/       SessionCore + phases/（setup, round, harvest, draft）
├── actions/       行动定义、effects/、payment/、Hook 系统
├── cards/         卡牌实现（按 deck A/B/C/D/E + major + community 分目录）
├── cards-display/ 卡牌展示数据（id/name/desc/cost/cardType/deck —— 主 bundle 引用）
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
└── db.ts                SQLite 连接

client/        浏览器 React UI（双 bundle）
├── app/                 顶层路由 + 页面（GameContainerApi、LobbyPage、...）
├── components/          board/、interaction/、common/、header/
├── contexts/            AuthContext、LocaleContext
├── hooks/               useGameSync、useFarmSelection 等
├── services/            gameTransport、card-meta、rehydrate、llmPrompts
├── sandbox/             Hot-seat 离线 client（独立 bundle）
└── types/、utils/、styles/、assets/、config.ts、main.tsx

e2e-tests/     Playwright 浏览器测试
```

ESLint 三层强制（`eslint.config.js`）：
- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card catalog/bootstrap/register-all 和 per-card impl modules；UI metadata 必须走 `shared/cards-display/**` 或 `client/services/card-meta`
- `client/sandbox/**` 全开
- 附加 `no-restricted-syntax` 禁动态 `import('shared/session/...')` / `import('shared/engine/...')` / card impl-bootstrap 字面量绕过
- violation = CI error

---

## 4. shared/contract/ — 协议层

**唯一作用**：把"前后端 + sandbox 都要看到的形状"集中到这里。前端主 bundle 只读 `shared/contract/` + `shared/cards-display/` + `shared/i18n/` + `shared/domain/`，其余不进 bundle。

### 4.1 关键文件

| 文件 | 内容 |
|---|---|
| `contract/types.ts` | `GameState` / `PlayerState` / `ActionSpace` / `Resource` / `InteractionState` / `InteractionRequest` / `ActionDefinition` |
| `contract/protocol/ws.ts` | `ClientCommand` / `ServerEvent` / `RoomSummary` |
| `contract/protocol/game.ts` | `GameSyncPayload` / `StateUpdateEnvelope` / `StateUpdateCause` / `ActionDetailEffects` |
| `contract/cards.ts` | `CardDefinition`（卡牌外形） |
| `contract/prompt-keys.ts` | `PromptKey` 枚举（i18n 锚） |
| `contract/state-constants.ts` | 行动格 / 棋盘常量（前端常量层，无规则代码） |
| `session/serialization.ts` | `SerializedGameState` + `serializeState` / `rehydrateState` |

### 4.2 GameState（领域真相）

字段（节选）：
```ts
{
  round, currentPlayerIndex, gameOver,
  players: PlayerState[],
  actionSpaces: ActionSpaceState[],   // { id, resources, takenBy }
  log: LogEntry[],
  events: GameEvent[],
  nextEventSeq: number,
  roundActionOrder: (string|null)[],
  gameSeed: number,
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,    // 已完成的收获 feeding phase 数；A148/B86 等卡读取
}
```

`workPhaseObtainedResources` 服务于"前一工作阶段获得资源"类卡（A53 等），回家阶段结算后清空。

`completedFeedingPhases` 在 `shared/session/phases/harvest.ts` 的 feeding phase 结束时 `+= 1`，等价于 BGA Globals 同款全局计数；A148/B86 等"按已完成收获 +1 容量"卡牌从此字段读取，避免再走 per-card post-play counter。

`events` 是公共结构化规则事件流，位于 `GameState.log` 下层。后端规则执行时先写 `GameEvent`，再由 mapper 派生 UI log、动画提示、审计报告和未来 replay；`log` 仍是当前可见文字日志，不作为规则来源。`nextEventSeq` 是持久化事件序号游标，`normalizeState` 会丢弃不符合公开事件 envelope/schema/json/size guard 的旧事件并从最大 `seq` 继续。

首版只允许 `visibility: 'public'` 的规则事件进入 `GameState.events`。私有 prompt、手牌、draft、living-hand 等 per-recipient 信息不写入公共事件流，仍通过现有 snapshot/privacy/pending 通道处理；未来如需 replay 私有视角，应新增独立的私有事件通道，而不是把私有 payload 塞进公共事件。

`SerializedGameState` 是 `GameState` 的 JSON 网络/持久化形态，额外携带 `engineStack: EngineStackCursor` 便于跨进程恢复引擎光标。同步版本号 / 历史 / 房间连接 **不进** `GameState`。

### 4.3 PlayerState（按职责分组）

- 身份：`id` / `name` / `color`
- 经营：`resources` / `familySize` / `workersAvailable` / `rooms` / `houseType`
- 农场：`fields`（多堆 `CropStack[]`）/ `roomTiles` / `stableTiles` / `fenceSegments` / `pastures`
- 动物：`houseAnimalType` / `houseAnimalCount` / `stableAnimals` / `newbornCount`
- 出牌：`improvements` / `minorPlayed` / `occupationPlayed`
- 手牌：`minorHand` / `occupationHand`
- 持续效果：`majorEffects` / `activeModifiers`
- **卡牌局部状态**：`cardStates`（见 §8.3）
- **工人身份**：`workers: Worker[]`，固定 5 槽 id `'1'..'5'`，`isActive` / `isNewborn` 标记

`Field.stacks: CropStack[]`：底堆在 `[0]`，顶堆在末尾。Sow 必须空田（`fieldIsEmpty`）；Reap 只收顶堆，`remaining===0` 时 pop；混合田同时计入 grain 田与 veg 田。所有访问走 `shared/domain/field.ts` helper。

### 4.4 ClientCommand（已收敛）

```ts
type ClientCommand = (
  | { type: 'auth'; token }
  | { type: 'createRoom'; maxPlayers?, name?, customCardIds?, enableCommunityDeck?, draftMode?, draftPoolSize? }
  | { type: 'joinRoom'; roomId; requestedPlayerIndex?; name? }
  | { type: 'dissolveRoom' }
  | { type: 'getState' }
  | { type: 'action'; spaceId }              // 放置工人 / 启动 anytime
  | { type: 'choice'; value; payload? }       // 统一的"选择"命令（含 farm/选格/分支）
  | { type: 'anytime'; actionId }
  | { type: 'commitSelection'; playerIndex; payload: { positions?, cardIds? } }
  | { type: 'roundEnd' }
  | { type: 'undoStep' } | { type: 'undoAction' }
  | { type: 'newGame'; seed? } | { type: 'loadGame'; state }
  | { type: 'devSetResources' | 'devSetRound' | 'devDrawCard' | 'devPlayCard' | 'devCreatePasture'; ... }
  | { type: 'draftSubmit'; playerId; pick }
) & { requestId? }
```

注意：

- 没有独立的 `reorg` / `feed` / `nextPlayer` / `confirmPlayerSwitch` / `commitFarm` 命令。这些等待形态全部归并到 `choice` 命令，由 `payload` 携带具体形状（按 `InteractionRequest.kind` 决定）。
- `commitSelection` 只为 farm-position / occupation-hand 两种定向选择保留单独入口。

### 4.5 ServerEvent / StateUpdateEnvelope

```ts
type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error; requestId? }
  | { type: 'authOk'; userId; username }
  | { type: 'roomCreated' | 'roomJoined' | 'gameStarted'
      | 'playerJoined' | 'playerDisconnected' | 'roomDissolved'; ... }

type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number             // 单调递增
  sync: 'snapshot'            // 当前只走全量快照
  cause: StateUpdateCause     // 'action'|'choice'|'anytime'|'reorg'|'feed'|'undo'|'dev'|'reconnect'|'draftSubmit'
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}

type GameSyncPayload = {
  state: SerializedGameState
  interaction: InteractionState
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
  customCardDefs?: CustomCardDef[]
}
```

**广播 vs 单播**：`stateUpdate` / `gameStarted` / `playerJoined` / `playerDisconnected` / `roomDissolved` 广播；`roomCreated` / `roomJoined` / `authOk` / 请求级 `error` 单播。

### 4.6 InteractionState — 前端唯一渲染真相

```ts
type InteractionState =
  | { stateId: 'idle';  allowedCommands; anytimeActions }
  | { stateId: 'wait';  allowedCommands; anytimeActions;
      playerIndex; spaceId?; promptKey?; promptParams?; sourceCard?;
      request: InteractionRequest; ...accessor 兼容字段 }
  | { stateId: 'gameover'; allowedCommands; anytimeActions; winners?; scores? }
```

`InteractionRequest` sum type（`kind` 字段是 discriminator）：

| kind | payload 形状 |
|---|---|
| `choice` | `{ options: ActionChoiceOption[] }` |
| `farm-select` | `{ farm: { farmType: 'plow'\|'sow'\|'fence'\|'room'\|'stable', selectable*..., maxSelections? }, options? }` |
| `selection` | `{ selection: { selectionType: 'farm-position'\|'occupation-hand', ... } }` |
| `animal-reorg` | `{ zones: InteractionAnimalReorgZone[] }` |
| `feed` | `{ remaining; foodUsed; feedQueue? }` |
| `confirm-next-player` | `{ nextPlayerIndex }` |
| `confirm-player-switch` | `{ fromPlayerIndex; toPlayerIndex }` |
| `card-draft` | `{ mode: 'simultaneous'; round; totalRounds; poolSize; seatOrder; pools; pendingPicks; kept }` |

`InteractionCommand`（前端按 `allowedCommands` 决定 UI 启用的按钮）：
```
takeAction | resolveChoice | commitFarm | commitSelection | takeAnytimeAction | undoStep | undoAction
```

注意 WS 协议名（`ClientCommand.type`）与 `InteractionCommand` 不完全同名：前端"现在能做什么"以 `allowedCommands` 为准；线上 WS 命令名归一到 `choice` / `commitSelection` / `action` 等。

### 4.7 ActionChoiceOption + previews

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

`effectPreview` 三类（`resourceExchange` / `payment` / `text`）。引擎对 `seq(pay-resources, gain[, bonus-vp])` option 自动聚合 preview；卡牌手写 `payLeaf+gainLeaf` 也能拿到 preview。生产点：`shared/cards/helpers/pay-gain-node.ts`、`shared/actions/effects/pay-helpers.ts`、`shared/actions/effects/exchange.ts`。

`descriptionPreview` 是 BGA-style 递归 ActionFlow 描述：leaf 使用 `ActionDefinition.nameKey` + leaf `effectPreview`，组合节点按类型拼接子描述（`SeqNode: ', '` / `XorNode: ' / '` / `OrNode: ' + '` / `ParallelNode: ' | '`）。前端优先渲染 `descriptionPreview`，这样普通 leaf、pay/gain 组合、嵌套 XOR/SEQ 都由引擎自动生成 option 文案。`pay-gain-node` 等通用 helper **不再**为机械 pay/gain 默认塞 `choiceLabelKey: 'ui.interactionResourceExchange'`；选项可见文案以 `descriptionPreview`（及 `effectPreview`）为准。`choiceLabelKey` / `choiceLabelParams` 仅用于**语义覆盖**（例如字段/数量选择、`ui.interactionUseCard`、`ui.interactionSeedResearcher` 等），不要为纯资源交换重复 i18n。纯状态同步 leaf（如 `special-effect.set-infobox`）不进入描述。

### 4.8 LogEntry

`LogEntry { key, params }` —— 结构化 i18n key + 渲染参数。前端按 locale 渲染。

---

## 5. shared/engine/ — 节点树引擎

**节点树是唯一状态机**。`GameSession` 不再持有 `PendingAction` union，"等什么"从引擎光标派生。

### 5.1 文件清单

```
shared/engine/
├── engine.ts              Engine 类
├── engine-stack.ts        EngineStack：子流程帧栈
├── engine-resolve.ts      resolveChoice 路径
├── engine-proceed.ts      step / 推进路径
├── dispatcher.ts          hook listener 调度
├── tree.ts                节点树构建
├── registry.ts            ActionDefinition 注册查找
├── log-store.ts           日志缓冲
├── types.ts               EngineContext / EngineFrame / EngineStackCursor
└── nodes/                 节点类型实现
    ├── base.ts            BaseNode 基类 + 共享 metadata/pending
    ├── action-node.ts     原子 action leaf
    ├── sequence-node.ts
    ├── parallel-node.ts
    ├── xor-node.ts
    └── or-node.ts
```

### 5.2 节点类型

**架构决策（2026-05-13）：领域层 `ActionFlow` 对齐 BGA node algebra，只保留 `leaf / seq / parallel / xor / or`。** `optional`、`promptKey`、`sourceCard`、`choiceLabel*`、`targetPlayerId` 是节点 metadata，不是新的领域节点类型。卡牌和 listener 只能构造这个小集合；新规则不应向 `ActionFlow` 暴露 runtime-only node。

**架构决策（2026-05-14）：runtime engine tree 也收敛到五种具体 node：`ActionNode / SequenceNode / ParallelNode / XorNode / OrNode`。** 跨玩家 owner、optional、trigger selection、listener activation、pending 都不再由额外 wrapper node 表达，而是由 node metadata、internal action leaf、pending envelope 和 frame state 表达。

`targetPlayerId` 表示"这个普通 flow node 在另一个玩家视角下执行"。编译到 runtime engine 时，它会转成目标 subtree 的 `ownerPlayerId` metadata；child 如果显式带自己的 owner，则保留 child owner。Session 顶层 flow builder 和动态插入路径（hook / listener / action `result.flow` / resolveChoice follow-up）都必须带上当前 effective owner，让后续 sibling 能回到 frame/ancestor owner。cursor restore 持久化 node owner metadata，不依赖全局 `currentPlayerIndex` 重新推断 owner。

当前 runtime node 类型：

- `ActionNode`：BGA `LeafNode(action)` 等价物；以 `actionId` + `params` 调 `ActionDefinition.execute`。
- `SequenceNode` / `ParallelNode` / `OrNode` / `XorNode`：组合节点，对应 BGA `SEQ` / `PARALLEL` / `OR` / `XOR`。`ParallelNode(mode='trigger-select')` 承接多 listener select/pass/mandatory 语义。

共享 runtime metadata：

- `ownerPlayerId`：跨玩家执行 owner；继承自 ancestor/frame，child explicit owner 优先。
- `optional` / `optionalActive` / `optionalPromptKey`：optional accept/skip 状态；`xor` / `or` 保留直接 `__skip__` 选项。
- `mandatory`：已选择 / 已接受的强制 continuation 会同时标记 host node 和 descendant `ActionNode`；后续 leaf 不可执行时返回 mandatory blocked，session 转成 `engine-blocked`（undo-only），避免只执行 composite 的前半段。
- `pending: PendingEnvelope | null`：等待输入的数据 envelope。`InteractionRequest` 是 WS/session protocol，不是 tree node。leaf request、`xor` / `or`、optional、trigger-select parallel 和 synthetic confirm/feed/farm-select 都通过 pending envelope 暂停并 cursor-restore。

listener activation 是 internal action leaf：`ActionNode(actionId='activate-card')`，params 携 `{ listenerId, cardId, phase, actionId, event, ownerPlayerId, triggerPlayerId }`。它 bypass 普通 public action pipeline，只执行 listener body 并把返回 flow / follow-up actions 插入 engine。

`BaseNode` 提供共享 metadata / pending / cursor round-trip；具体 traversal 由 `EngineTree` 和五种 node 实现。

### 5.3 Engine 公共 API

`Engine` class 暴露给 `SessionCore` 的接口（小集合）：

- `step(ctx)` —— 推进到下一个 unresolved 节点；遇到 node pending 暂停，返回 envelope。
- `resolveChoice(value, ctx, payload?)` —— 提供玩家选择，继续推进。
- `peekPendingEnvelope()` —— 返回当前等待的 `PendingEnvelope`（或 null）。
- `peekPendingHost()` —— 返回托管该 pending envelope 的 node（用于 sourceCard / actionContext / owner 反查）。
- `injectBeforeFlows(flows, ctx?)` —— hook 注入子流程。
- `snapshot()` / `restore(snapshot)` —— 序列化与重建节点树（含 `nodeStates`、pending envelope、owner/optional/trigger metadata）。
- `hasPendingChoiceCompositeAncestor()` —— 用于 anytime 判断是否处在分支祖先内。

### 5.4 EngineStack（子流程栈）

`EngineStack`（`engine-stack.ts`）持有 `EngineFrame[]`：

```ts
type EngineFrame = {
  engine: Engine
  source: SubFlowReason     // 'topAction' | 'hook' | 'anytime' | 'animal-reorg' | 'harvest-feed' | ...
  ownerPlayerIndex: number
  spaceId?: string
  stageResume?: StageResume  // hook 完成后回调钩子
  reason: SubFlowReason
}
```

API：`push / pop / current / depth / peekPendingEnvelope / peekPendingHost / toCursor`。

`EngineStackCursor` 序列化成 `SerializedGameState.engineStack`，恢复路径：`engine.snapshot()` → 各 concrete node cursor restore 重建节点树并定位 pending host / traversal state。

`SubFlowKind` ∈ { `choice` / `animal-reorg` / `confirm-next-player` / `confirm-player-switch` / `feed` / `farm-select` / `selection` / `card-draft` }。

---

## 6. shared/session/ — 会话层

### 6.1 文件清单

```
shared/session/
├── session-core.ts        SessionCore（命令执行入口，~3400 行）
├── round.ts               回合推进
├── serialization.ts       SerializedGameState 序列化
├── state-bootstrap.ts     初始 state 构造
├── stats.ts               统计/日志
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

`shared/session/phases/` 是按阶段拆分的纯函数集合（`startBreedPhase` / `continueAfterFeed` / `startNewRound` 等），不是 mixin / trait class。逻辑都在 `SessionCore` 主 class 上汇合。

### 6.2 SessionCore 入口

`SessionCore` 持有：

- `state: GameState`
- `engineStack: EngineStack`
- 历史栈（步级 history + 行动起点 `actionStartSnapshot`）
- 终局计分缓存

命令方法（被 `GameSession` / `authoritative-session.ts` 包装后导出给 server）：

```
takeAction(spaceId, playerIndex)
takeAnytimeAction(actionId, playerIndex)
resolveChoice(playerIndex, value, payload?)
commitSelectionChoice(playerIndex, payload)
confirmAnimalReorg(zones)            // 前端归并到 'choice'，但 session 内部仍走专用入口
confirmHarvestFeed(selections)
confirmNextPlayer() / confirmPlayerSwitch()
performRoundEnd()
undoStep() / undoAction()
```

`SessionCore` 是 `GameSession` 的领域引擎；`GameSession`（`server/game/authoritative-session.ts`）在外层加：连接绑定、广播、SQLite 持久化触发、devtool hook、终局判定。两者都不直接管理 WS 连接 —— 那由 `server/connection/` 完成。

### 6.3 统一返回 SessionResponse

```ts
type SessionResponse = {
  ok: boolean
  state: SerializedGameState
  pending: ...        // 兼容字段（仅 server-side 内部 + 测试断言用）
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[] | null
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}
```

WS 广播、HTTP 查询、单测断言同一结构。`pending` 字段已不是前端真相（`InteractionState` 取代），但为 undo 历史与会话内部保留。

---

## 7. shared/actions/ — 行动定义与 Hook 系统

### 7.1 目录

```
shared/actions/
├── index.ts               actionDefinitionLookup Map（27 base + internal 共发现）
├── flow.ts                ActionFlow 节点表达式（leaf / seq / parallel / xor / or + optional metadata）
├── hooks.ts               Hook 注册 + 调度
├── hook-matrix.ts         buildHookMatrix() 优化矩阵
├── internal-actions.ts    引擎内部辅助 action（mark-card-trigger 等）
├── effects/               74 个 base action 实现（一文件一 action）
│   └── internal/          14 个内部 effect
├── factories/             行动工厂
├── helpers/               支付、动物、农场等共享 helper
├── payment/               PaymentSolver 与执行器
└── __tests__/
```

### 7.2 ActionDefinition

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>
  canBeExecutedByPlayer?(state, player): boolean
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

Hook 不进 `ActionDefinition`，由 `hooks.ts` 显式注册（卡牌文件内部）。

`getBaseChoiceOptions` opt-in 选项流：base + `computeChoiceCandidates` 注入 → 按 `value` 去重 → `costPreview.canExecute` 过滤 → 0 候选 fail / 1 直跳 `resolveChoice` / ≥2 标准 prompt。当前消费者：`renovate-house` + `A87_Conservator`。与传统 `execute()→choice→computeArgs.extraOptions` 路径互斥。

### 7.3 effects/ 自动发现

`shared/actions/index.ts` 硬编码导入 base + internal effect 文件，构建 `actionDefinitionLookup`。每个文件一个 action。**禁止在单 effect 文件里堆叠多卡逻辑**（CLAUDE.md 明令）。

`collect` 是 accumulation-space partial-take 的统一入口，接受可选 `actionContext: { spaceId?, resource?, amount? }`。`spaceId` 用于指向非当前 action space（卡牌效果触发的偷取场景）；`resource` + `amount` 用于 partial-take（不全取空一格）。旧的 `take-from-space` internal action 已删除并迁移到 `collect`，相关 i18n key 一并清理。

### 7.4 payment/

`shared/actions/payment/`：

- `solver.ts` —— `computeAllBuyableCombinations` / `keepOnlyOptimals` / `sortPaymentSolutions`
- `executor.ts` —— `payResources` / `executePaymentSolution`
- `modifiers.ts` —— `computeCosts` hook 集成
- `adapters/room.ts` —— 房间费用变体（每间房不同形状）
- `cache.ts` —— solution cache

对外通过 `pay-helpers.ts` / `room-payment.ts` 暴露统一入口。卡牌购买费用走 `computeCosts` phase + `actions: ['improvement-any']` 区分行动空间费用 vs 卡牌购买费用。

**统一 cost 模型（`ComplexCost`）**：construct / renovation / fencing / plow / occupation / minor / major / pay leaf 全部走同一条 `computeAllBuyableCombinations` 管线。`ComplexCost` 字段语义：

- `fees: Partial<Resource>[]` —— per-action 总固定费用。Renovation 的 `computeCosts` 总成本 delta（D154_ChimneySweep `{stone:-2}`、D121_ClayPlasterer `{clay:-(rooms-1)}`、D81_RoofLadder `{reed:-1}`）写入 `fees[0]`。负值在 `enumerate` 内部 `mergeResources(fees[0], unitFee*nb)` 后 clamp 到 0，避免对 unrelated resource 退款。
- `unitFee: Partial<Resource>` + `nb: number` —— per-unit × 数量。Construct 的每间房 `{wood: rooms_cost, reed: 1_per_pile_or_room}`、renovation 的 `{[material]: 1}`、fencing 的 `{wood: 1}` 都落在 `unitFee`，`nb` 是行动同时处理的单位数（建房间数 / fence 段数）。enumerate 先对每个 unit cost row 生成有序替换后的可选行，再组合成总成本。
- `trades: Trade[]` —— 资源替换选项（`from → to`），由 `TradeModifier` 经 `applyCostModifiers` 注入。`Trade.scope: 'action' | 'unit'` 控制替换位置：scope:'action' 在玩家资源池上做 per-action 转换；scope:'unit' 按 `order` 作用在每个 unit cost row 上。`replaceUpTo` 支持 B145_BrushwoodCollector 这类“把当前行里 1 或 2 reed 都替换成 1 wood”的 BGA `addCost` 形态。
- `bonuses: Bonus[]` —— per-action 折扣 / 多选折扣（`{discount}` 单一折扣；`{choices: BonusChoice[]}` 多选）。`Bonus.optional` 决定 enumerate 是否生成"不应用 bonus"分支。
- `bonuses[].conditions?: Record<string, number>` —— `applyCostModifiers` 把 BonusModifier.conditions 透传到生成的 Bonus，enumerate 用 `evaluateConditions(player, conditions, nb)` 重新评估 nb-aware 约束（如 C13_WoodSlideHammer `minNumRooms: 5`）。

**两层 condition 评估**（`cost-modifiers.ts`）：

- `evaluateStaticConditions(player, conditions)` —— 仅依赖 player 当前状态的静态判定（`houseTypeWood/Clay/Stone`）。
- `evaluateConditions(player, conditions, nb)` —— 在 static 之上再判定 nb-aware 约束（`minNumRooms`）。enumerate 在生成 payment 分支和 bonus 应用时调用。
- `getModifiersForCostType(player, costType)` —— 只用 static-only filter（`evaluateStaticConditions`），不再读 `player.rooms`。nb-aware 决策延后到 enumerate，确保 construct 的 `nb=rooms-to-build` 和 renovation 的 `nb=player.rooms` 都能正确驱动 `minNumRooms` gate。

**`Trade.scope`**：

| scope | 应用位置 | max 默认 | 典型用例 |
|---|---|---|---|
| `action` | 玩家资源池（每个 trade 独立到 `max`） | `?? 1` | A28_ForestSchool（lessons cost）、A88_HedgeKeeper（fencing 全部 3 段一次换）、E60_WorkingGloves（grouped exchange，未来加 groupMax）|
| `unit` | 每个 unit cost row，按 `order` 有序展开 | `?? 1`（每个 row）| A123_FrameBuilder（每间房一次 wood-for-clay/stone）、D15_ClaySupports（每间房 wood-for-{clay,reed}）、B145_BrushwoodCollector construct 分支（每间房 wood-for-reed）|

scope:'unit' MUST NOT 携带 `conditions.minNumRooms`（per-unit 没有 min-unit 阈值）；`validateTradeModifier` 在 `applyCostModifiers` 入口处强制此不变量。

**Validation**：

- `validateComplexCost(cost)` —— dev 抛错 + prod 降级为 "no affordable solutions"。检查 `nb` 与 `cards` 互斥、`scope:'unit'` trade 必须配合 `nb`。
- `validateTradeModifier(modifier)` —— 拒绝 scope:'unit' + minNumRooms 组合。
- `validateBonus(bonus)` —— 恰好一个 `discount` 或 `choices`、`choices` 非空。

**Renovation 对齐**（`shared/actions/effects/renovation.ts`）：`buildRenovationPlan` 直接返回 `ComplexCost`（`fees:[{reed:1}], unitFee:{[material]:1}, nb:player.rooms`）。`computeCosts` hook 的 `costs` 通过 `mergeRenovationCost` 落到 `fees[0]`；负 delta（D154 等）在 enumerate baseFee 合并后 clamp。`canAffordTypedFlatCost` / `payTypedFlatCost` / `payTypedFlatCostDetailed`（`typed-flat.ts`）接受 `Partial<Resource> | ComplexCost`，统一走 `computeAllBuyableCombinations` 单管线（之前的 `resolveSimpleTradeAdjustedCost` 已删除）。

D15_ClaySupports clay→reed trade 仅当 `houseTypeClay > 0` 时生效；A123_FrameBuilder 的 construct 拆成两个 `scope:'unit'` TradeModifier（wood→clay / wood→stone），用 `houseTypeClay` / `houseTypeStone` 锁定方向；B145_BrushwoodCollector construct 用 `replaceUpTo` 覆盖 1/2 reed 行。renovation 仍走 BonusModifier（单次 per-action 互斥选择，BGA 等价）。

### 7.5 Hook 系统：行动生命周期 phase（11 个）

```
isDoable                 改变行动可执行性
computeReplace           整张行动替换
computeCosts             调整成本（围栏折扣 / 卡牌购买折扣等）
computeArgs              追加 execute() 已返 choice 的额外选项
computeChoiceCandidates  针对 opt-in getBaseChoiceOptions 注入候选
computeExchanges         注入运行时 CardExchange
before / during / immediatelyAfter / after
anytime                  额外注册的 anytime 行动
```

`ActionHookContext { state, player, space, actionId, phase, result?, choice?, doable? }`。`ActionMutationContext` 在执行期额外携带 `eventSink`，action/effect 通过它记录当前事务的 `DraftGameEvent`；`result.extraData` 携执行元数据（如 fence 的 `newPastures` / `newEdges`）。

事件事务由 engine 的 `EventStore` 管理：public action / internal leaf 开始时建立 frame，action 成功推进后补齐 `schemaVersion/id/seq/round/phase/visibility` 并提交到 `state.events`，失败、取消、rollback 或 optional skip 不追加事件。提交时会按当前 `state.nextEventSeq` 重新定序，避免父 action pending 期间其他子流程先提交事件后产生重复 `seq`。提交前会校验公开性、JSON 安全、大小上限和已知 event type/字段；恢复 pending/engine snapshot 时也会校验事务内事件，避免把未完成 frame 的非法事件写回。

卡牌 listener 通过 `CardListenerContext.transactionEvents` 和 `eventQuery` 读取当前 action frame 的事件。普通 listener 看到的是已经 emit 的当前 frame 事件；`trade-applied` 这类合成 listener 可以读取当前 exchange 的 `DraftGameEvent`，但不能依赖尚未提交的全局 `state.events`。listener handler 仍必须是 state-pure flow builder，状态修改只能通过返回 flow/leaf 进入 engine。

`ActionHookResult { doable?, actionId?, extraOptions?, followUpActions?, flow?, costs?, sourceCard? }`。规则事实写入 `GameState.events`，不要再为单卡补日志字段。

当前事件覆盖已包括资源主干（collect/gain/pay/exchange）、农场主干（sow/plow/construct/stables/fencing/reap/breed/reorganize）、worker 放置/返家/新生儿、round/work/return-home/harvest phase、action reveal/accumulate、future meeple 以及 `special-effect` mutation 分支。`state.log` 作为 UI 缓存保留，由事件 mapper 和 session cache writer 派生；业务代码不再通过旧日志字段记录规则事实。

`sourceCard` 兜底：`ActionHookResult.flow` 顶层 `sourceCard` 递归补到缺失 child leaf；组合 pending / leaf request 写入 `PendingEnvelope.sourceCard`，`SessionCore` 透传到 `interaction`。

### 7.5.1 Public ActionNode 执行顺序

普通 public action leaf 进入 engine 后按以下顺序处理：

1. `computeReplace` 最先运行，早于 `isDoable` / `computeCosts` / `before`。`HookDispatcher.applyComputeReplace()` 先跑 action hook replacement，再跑匹配的 card listener `phase='computeReplace'`。
2. 如果 `computeReplace` 只替换 `actionId`，后续所有阶段都使用替换后的 `actionId` 继续。
3. 如果 `computeReplace` 返回 `decline + alternativeFlow`，当前 leaf 立即 resolve；engine 在其后插入一个 `xor(replacement branches..., original fallback)`，本轮返回。此时 original action 的 `before` listener 尚未运行。
4. 玩家选择 replacement 分支后，分支中的每个 leaf 都作为普通 action 重新进入本流水线。replacement 分支 leaf 只携带 `skipComputeReplaceListenerIds` 跳过产生该 replacement 的 listener，不携带 `checkedReplaceAction`，因此真实替代行动仍会触发普通 `before` / `during` / `after` listener。original fallback leaf 携带 `checkedReplaceAction=true`，表示该 root action 已经检查过 replacement。
5. 没有 decline replacement 后，engine 执行 `isDoable`：base `canBeExecutedByPlayer` → costPreview → action hook `isDoable` → card listener `isDoable`。
6. 然后执行 `computeCosts`，把费用覆盖写入本次 `executionContext.costs`。
7. 然后才执行 `before` card listener dispatch。匹配到的 listener 被编译成 internal `activate-card` leaf，并插入在原 action leaf 前面；`dispatchMode: 'select'` 的同组 listener 会包成 `ParallelNode(mode='trigger-select')` 让玩家选择顺序。no-op listener 在 trigger-select 评估时直接 resolve，不制造 pass-only pending；结构适用但当前不可支付的 listener 仍显示为 disabled。
8. 所有 `before` leaf 完成后，原 action leaf 恢复执行；`beforePhaseResolved` 防止同一个 action leaf 第二次插入同一批 before listener。
9. 随后执行 action 本体：`getBaseChoiceOptions` opt-in path 先走 `computeChoiceCandidates`，否则走 `ActionDefinition.execute()`。`execute()` 返回 request 时创建 pending；无 request 时继续 `during` / `immediatelyAfter` / `after`。
10. `activate-card` 是 internal leaf，绕过上述 public action 流水线：只执行指定 listener body，并把 listener 返回的 `flow` / `followUpActions` 交回 engine 插入执行。

作用域 scope：`player` / `opponent` / `any`。card listener 匹配层按 listener id 确定性枚举；phase trailing node 构建层再按 owner 分组（global → active player → 其他玩家），组内按 legacy `order` 降序、卡牌 play order、匹配序稳定排序。需要玩家决定同组 trigger 顺序时，用 `dispatchMode: 'select'` 进入 trigger-select，而不是依赖隐式排序表达规则选择。

### 7.6 阶段型 Hook（按触发顺序）

```
回合开始: onBeforeStartOfTurn → onRoundStart
工作:    PlaceFarmer → 各原子行动 → onEndTurn → allWorkersUsed → onAllWorkersPlaced
回家:    onBeforeReturnHome → onStartReturnHome → onReturnHome
回合结束: onRoundEnd → onAfterRoundEnd
收获 (4/7/9/11/13/14):
  onBeforeHarvest → onStartHarvest
  → onStartHarvestFieldPhase → onHarvestFieldPhase → reap [dispatch 'reap']
    → onAfterReap → onEndHarvestFieldPhase
  → onStartHarvestFeedingPhase → onBeforeFeed → onHarvestFeedingPhase
    → feed → onEndHarvestFeedingPhase → onAfterFeed
  → breed → onEndHarvest → onAfterHarvest
```

所有 reap 走 `dispatchReapListener(state, player, crop, amount)` 派发 `'reap'` 合成事件。`onAllWorkersPlaced` 在所有人本轮工人放完且 `performRoundEnd` 之前触发；`place-farmer` 的 `params.fromSupply` 模式可在该阶段把 supply worker 标 active 后立即放置。

阶段 hook 已可返回 `ActionFlow`（`continueStageHook` / `continueAllWorkersPlacedHooks`），用于"hook 触发子流程"统一走 `EngineStack.push`。

### 7.7 Listener activation purity + BGA 对齐

**架构决策（2026-05-13）：`CardListenerRegistration.handler` 在 listener dispatch / preview / doable 路径中必须是 state-pure flow builder。** 它可以读取 `GameState` / `PlayerState` / event，返回 `ActionHookResult`、`ActionFlow`、`costs`、`doable`、`extraOptions` 等结构化结果；不能直接修改 `GameState`、`PlayerState`、`ActionSpace`、`player.cardStates`、资源、农场格、日志或 pending。

当前 no-peek worktree 已把 `buildPhaseTrailingNodes` 改为不执行 handler；这只是 Phase 1 安全切口。后续设计不能再依赖 dispatch-time handler peek 或一次性 `preComputedResult`。

BGA 参考语义：

- `PlayerCards::getReaction($event)` 只收集 listening cards 并生成 `ACTIVATE_CARD` leaf，不执行卡牌 listener body。
- `ActivateCard::getFlow()` 在 leaf 真正推进时调用卡牌方法得到 flow；`isDoable()` / `isIndependent()` / `getDescription()` 也可能重建 flow，因此 listener 方法必须可重复调用且无副作用。
- 真正的状态修改放在 action / `SPECIAL_EFFECT` leaf 里执行，而不是放在 reaction 构建阶段。

OA 对齐规则：

- 需要改资源、动物、农场、`cardStates` 或 log 的 listener，必须返回 leaf / seq flow，让 `gain`、`pay`、`special-effect`、`exchange` 等 action 执行状态修改。
- 如果缺通用 mutation leaf，新增可复用 internal action；不要在单卡 handler 内直接 mutate，也不要在核心路径加单卡分支。
- `effect.onBuy` 等非-listener 执行路径可保留现状；但一旦被 listener / preview / doable 复用，也必须遵守 state-pure flow builder 语义。
- dispatch 阶段不得通过执行 handler 来制造一次性 `preComputedResult` 语义；可以收集 registration metadata、构造 activation leaf、或做纯 `isDoable` / preview 查询。
- listener activation 是普通 internal leaf：`leaf actionId='activate-card'`，params 携 `{ listenerId, cardId, event, ownerPlayerId, triggerPlayerId }`。它 bypass public action pipeline，不跑普通 action hooks / cost / generic log；listener 返回的 `flow` / `followUpActions` 仍回到 engine 统一执行。
- owner 与 trigger player 必须显式进入 event / params。opponent scope 触发时，activation 以 owner 为执行玩家；跨玩家 UI 确认和 undo boundary 由 runtime 处理，目标上不暴露为卡牌 flow primitive。

**2026-05-13 Wave 1 落地规则：listener handler 不再承担"先改状态再返回 flow"的桥接职责。** 对于本轮已迁移的 B48 / E103 / C148 / A144 / D82 / D27，handler 只读取当前状态并返回可重放 flow 或纯查询结果：

- 卡上计数、flag、infobox、stack pop、major swap 等状态修改统一走 `special-effect` leaf；本轮补齐 `set-counter`、`pop-card-stack-top`、`swap-improvement-with-board`。
- 跨玩家奖励用 `gain` leaf 的 `recipientPlayerId` / `payerId`，不要在 handler 内直接改 trigger player 资源。
- optional accept/decline 语义必须由 flow 表达。典型例子：D27 Retraining 先执行 `set-flag false`，再把 `swap-improvement-with-board` 放入 optional child；decline 只清 flag，不预留 / 回滚公共 major 池。
- 只影响可达性或费用的 listener 应返回纯 `doable` / `costs` / `bonuses`。典型例子：D82 Hunting Trophy 通过 `space.id` scoped `isDoable` + `computeCosts` 建模 farm/house redevelopment，不再用 before/after flag 或 `activeModifiers` 临时桥。

**2026-05-13 Wave2a 合成 dispatch 边界：`trade-applied` / `reap` 这类没有完整 engine 的 listener dispatch，只通过 immediate-special-effect helper 执行确定性的状态同步叶子。** 该 helper 只遍历非 optional 的 `special-effect` leaf，以及确定性的 `seq` / `parallel` flow；刻意跳过 `gain`、`pay`、interactive、optional、`or` / `xor`、跨 owner targeted flow。需要更丰富合成 listener 效果时，必须接入真实 engine flow 路径，而不是扩展这个 helper；这样 Wave2a 的 cardState-only 合成 listener 能保持 pure handler，同时不重新引入 dispatch-time handler mutation。

**2026-05-13 Wave2b/c 落地规则：listener 内的 cardState / structural mutation 也必须通过 action leaf 执行。** 本轮把 A68 / A73 / A92 / B18 / B34 / B76 / C48 / C53 / C88 / C93 / C130 / C150 / D36 / D56 / D74 / D158 / E53 / E74 / E85 / E148 的剩余 handler mutation 迁出：

- `special-effect` 扩展为 listener-purity 的通用 mutation dispatcher：`clear-pending-fence-bonus`、`remove-future-meeples`、`promote-first-newborn`、`add-resource-to-space`、`build-stable-on-first-empty-tile`。
- B18 这类 future-meeple 写入走 lazy flow；after-pay listener 不再立即 queue。
- C93 / C130 对 action space 的资源写入返回 `special-effect.add-resource-to-space`，额外放人仍保持 optional。
- E148 opponent-scope listener 用 owner-targeted `special-effect` 更新 reserved action spaces / stable；"无空地但需要移除 marker" 这种无收益状态同步可返回 `countCardUse: false`，避免把纯清理计入卡牌 used stats。
- `countCardUse: false` 只用于 listener 结果需要执行 housekeeping flow、但不应被视为卡牌效果触发的场景；不要用它隐藏真实收益或玩家选择。

**多 listener 同 phase 触发**采用 BGA-style PARALLEL trigger selection：

- Phase 1 过渡期：handler 尚未全 pure，dispatch 不执行 handler 来判断 interactivity；使用显式静态 `dispatchMode: 'select'` 标出需要玩家选择触发顺序的 listener，其余保持 serial。
- 不翻转 `mandatory` 默认值；`mandatory: true` 只影响 `ParallelNode(mode='trigger-select')`：当前结构适用且可执行的 mandatory child 会让 `__pass__` disabled，避免 guaranteed effect 被静默跳过。结构 no-op child 会在评估时直接 resolve，不制造只有 `__pass__` 的 pending；当前结构适用但暂时不可支付的 child 仍展示为 disabled，让玩家知道 trigger 存在。
- 目标形态：同 owner、同 phase 下，mandatory 或纯自动 trigger 可按确定性顺序自动结算；多个 optional / interactive trigger 同时可用时，必须显式给卡主玩家选择触发顺序，并允许 pass 跳过剩余 optional trigger。
- generic `ParallelNode` 负责 select/pass/mandatory/independent 语义；不再引入 listener-trigger 专用 runtime node。
- 不为 `CardListenerRegistration` 引入 / 复活 `order` 排序字段；默认执行顺序来自 `playOrderIndex`（occupation < minor < improvement，数组 index）。需要玩家选择时用 parallel trigger selection 显式化。

**2026-05-14 bake / trigger-select rule:** `bake-bread` is non-empty by default. Optional bake opportunities must be expressed by outer `optional` flow metadata. `ParallelNode(mode='trigger-select')` displays structurally applicable trigger options, including currently unaffordable options as disabled; disabled choices are server-rejected and remain unresolved. For before-action trigger-select, `__pass__` is disabled only when skipping remaining triggers would leave the action continuation impossible and at least one currently enabled trigger can make the action layer prove the continuation directly complete or reachable through the remaining select before-chain. The engine asks generic continuation guards and does not import bake-bread / D66 / oven rules; bake-specific direct continuation and before-chain reachability live in the action/card layer. Compact structured choice values such as `bulk:` are allowed through `InteractionRequest.kind === 'choice'` metadata (`structuredChoicePrefixes`), not by engine action-id special cases.

**2026-05-15 replacement-aware trigger pass:** before-action trigger-select 的 pass gate 不能只看 base action `canBeExecutedByPlayer`，也不能套完整 `applyIsDoable`，否则会把同批 before unlocker 自己当成可跳过依据。当前规则是：先用 `skipBeforeTriggers=true` 检查原 action 是否能直接继续；失败时只允许通用 `computeReplace` fallback 参与 continuation 判断，并在可启动性预览里用 `checkedReplaceAction=true` 避免 replacement 递归。这覆盖 B26 Agrarian Fences 这类"跳过 D66 后仍可继续 fencing replacement"的路径，同时不在 engine 中硬编码卡牌 id。`computeReplace` decline 返回的 alternative flow 如果顶层是 `xor`，引擎会展开其 children 作为 replacement 分支，再追加 original action 分支；运行时 replacement 分支 leaf 不携带 `checkedReplaceAction`，只携带 `skipComputeReplaceListenerIds` 来跳过产生该 replacement 的 listener，因此真实替代分支里的 sow / bake 仍能触发普通 before / after listener。original fallback 分支继续携带 `checkedReplaceAction=true`，保持旧的"已检查 replacement"语义。

### 7.8 farm-type 提交

5 种 farmType 全在各自 ActionDef.resolveChoice 内闭环（`shared/actions/effects/`）：

- **room** (`construct.ts`)：`room-payment.ts` 展开"每间房"费用变体；多解时二轮 `pay:room:*` prompt finalize。
- **stable / plow** (`stables.ts` / `plow.ts`)：typed flat payment 解析。
- **fence** (`fencing.ts`)：校验选边/连通/封闭区域，得 `newEdges` 后计算 wood（考虑 `freeFences` / `extraWood` / fence-cost-unification 的 `collectComputeCostsForFarmChoice` Pass #2）；多解 `pay:fence:*` 二轮 prompt。
- **sow** (`sow.ts`)：validate + finalize（无 payment combo），含 extra-field card effect（`getPermittedExtraSowableFields` + `handleSowExtraField`）。

farmType 第一轮 payload 形态：`fence: {edges, palisadeEdges, extraWood}` / `room: {rooms}` / `stable: {stables}` / `plow: {tile}` / `sow: {crops}`。WS `{type:'choice', value:'confirm', payload}` 经 `resolveChoice` 透传；二轮时由 `extraData.actionContextWrite: {farmPayload}` 持久化到 `pending.actionContext.farmPayload`，二轮 prompt 解析时 ActionDef 从 `ctx.actionContext.farmPayload` 读回。

---

## Anytime Window Policy

The set of card-listener anytime actions available in a given pending is computed once per `buildInteraction()` via `computeAnytimePolicy()` (`shared/session/anytime-policy.ts`). The helper is **server-only** — `client/` never imports it.

Inputs (derived by `GameCore.getAnytimePolicyInput()` using the same node + composite fallback as `buildInteraction`):

- `hasActiveContext` — `getActiveInteractionContext()` non-null
- `stageResume` — current frame's `stageResume`
- `interactionKind` — `node?.request?.kind ?? composite?.request?.kind`
- `promptKey` — `node?.promptKey ?? composite?.promptKey`

Output: `{ allowed: false, reason }` or `{ allowed: true, blockedIds }`. The rules are priority-ordered (first match wins): no-context → feed-locked → `confirm-next-player` allowed with `exchange` blocked → `confirm-player-switch` blocked → animal-reorg → exchange/bake-bread promptKey → stage-hook-chain default block → everything else allowed with no blocks.

Three consumers share this snapshot:

1. `buildAnytimeEntries()` — filters the auto-discovered registry + card-listener entries; returns `[]` if `!allowed`, otherwise removes any entry whose id is in `blockedIds`.
2. `buildInteraction()` — derives `'takeAnytimeAction'` inclusion in `allowedCommands` strictly from `allowed && entries.length > 0`, keeping the UI and server views synchronised.
3. `phases/round.ts::takeAnytimeAction()` — server-entry enforcement before any anytime injection. Additional guards (gameOver, draft phase, active-owner mismatch) sit at the function entry; the policy itself only sees pending-shape inputs.

Nested anytime flows are injected ahead of the current pending tree. Parent pending state remains on its original pending host as a `PendingEnvelope`; when the nested flow resolves, `EngineStack` resumes the parent frame and `buildInteraction()` surfaces the parent envelope again instead of going idle.

OA-vs-BGA design notes:

- Reorganize is a system-driven sub-flow in OA (not a player-triggerable anytime) — the policy never produces a `'reorganize'` entry to filter.
- `feed` pending is locked in OA because `executeFeedingLogic()` freezes `remaining`/`foodUsed` into the InteractionRequest. BGA allows nested anytime in its `ST_HARVEST_FEED` flow because its predecessor is the `EXCHANGE` state, which has no fixed budget.
- Idle work-phase turns and `confirm-next-player` are acting-player anytime windows: legal anytime actions remain available before a worker is placed and before control passes to the next player. In `confirm-next-player`, `exchange` stays blocked to avoid recursive generic exchange prompts. `confirm-player-switch` remains blocked because it is a system-controlled cross-player transition inside another flow.
- `stageResume`-bearing harvest stage hook chains default to blocked to preserve the "system-driven hook chains do not yield to player anytime" invariant; the explicit allow-list (`animal-reorg`, exchange/bake-bread promptKey) overrides this.

---

## 8. shared/cards/ + shared/cards-display/ — 卡牌闭环

### 8.1 双产物：display vs impl

| 目录 | 形态 | 谁能 import |
|---|---|---|
| `shared/cards-display/{A..E,major,community}/` | 纯数据：`id` / `nameKey` / `descKey` / `imageId` / `costSpec` / `cardType` / `deck` / `prerequisiteSpec` | 主 client bundle ✅ + sandbox ✅ + server ✅ |
| `shared/cards/{A..E,major,community}/` | hook 注册 + effect 函数 | sandbox + server（主 client bundle 禁止） |

主 bundle 启动时 `GET /cards-manifest.json` 拉运行时元数据（`client/services/card-meta.ts`），切断对 `shared/cards/catalog` 的依赖链。

Card lookup bootstrap：`shared/cards-display/types.ts` 的 registered lookup 默认可为空，client 不安装 catalog lookup；server/test runtime 通过 `shared/cards/install-catalog-lookups.ts` 显式安装。client 需要卡牌 metadata 时使用 `client/services/card-meta` 的 manifest-backed lookup。

### 8.2 注册表

| 文件 | 作用 |
|---|---|
| `shared/cards/catalog.ts` | `minorImprovementCards` / `occupationCards` 聚合 |
| `shared/cards/active-registry.ts` | `CardRegistry` 单例 |
| `shared/cards/registry.ts` | `CardRegistry` 类（loadByIds / unload） |
| `shared/cards/custom-registry.ts` | `CUSTOM_*` 前缀自定义卡牌 |
| `shared/cards-display/_lookup.ts` | 主 bundle 用 lookup 表 |

`CardRegistry.loadByIds(ids, lookup)` / `unload(id)` 支持按房间动态装卡。

### 8.3 cardStates 局部状态

- 持续计数 / 单次标记 / 局部状态写入 `player.cardStates[cardId]`，不污染 `PlayerState` 顶层字段。
- 复杂"等待玩家下一步选择"的卡牌交互抽显式 continuation 走 `pending` / `EngineStack.push`，不偷塞共享槽位。
- 推荐结构：`{ cardId, kind:'choice'|'delayedEffect', payload }`。
- 卡牌可在 `cardStates[cardId].extraData.heldWorkerId` 持有 worker（既不在 takenBy 也不在家）；`shared/cards/helpers/card-held-workers.ts` 提供 `holdWorkerOnCard` / `getWorkerHeldOnCard` / `releaseWorkerFromCard` / `getCardHeldWorkerIds`；`returnHome` 阶段统一释放。

### 8.4 helpers 糖衣层（`shared/cards/helpers/`）

- `pay-gain-node.ts` —— "支付后得收益 / 支付后追加行动 / 返还到当前格再得"模板
- `stage-effects.ts` —— 阶段型 card-effects 标记 / 即时支付 / bonus VP / 单次收获兑换
- `card-state.ts` / `round-placement.ts` —— 一次性卡牌 `flagged/extraData` + 本轮放人顺序
- `action-snapshot.ts` —— 单次行动起点快照（A74 等复用）
- `card-held-workers.ts` —— 见 §8.3
- `card-field.ts` —— "卡牌即田"声明式工厂，详见 §8.5

### 8.5 cardField 通用扩展点

声明式"卡牌作为田"配置，定义在 `CardDefinition.cardField`：

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

`shared/cards/helpers/card-field.ts:makeCardFieldImpl(cardId, def, options?)` 是工厂，按
`def` 派生 `onComputeSowableFields` / `onSowExtraField` / `onHarvestFieldPhase` / `sow-isDoable`
listener。单卡只声明配置 + 可选 `onReap` 回调处理副作用，文件行数贴近甚至少于 BGA。

虚拟 tile col 由
`deriveVirtualTileCol(cardId, slotIdx) = deckOrdinal*1000 + cardNumber + slotIdx`
派生，跨 deck 不冲突；同 deck 邻号 capacity 占位需 audit（当前 11 张卡 capacity≤3，安全余量充足）。

副作用 `onReap` 回调签名：

```ts
onReap?: (ctx: {
  state: GameState
  player: PlayerState
  crop: ExtraSowableCrop
  /** 该卡上该 crop 经本次扣减后总 remaining === 0 */
  isLast: boolean
}) => ActionFlow | void
```

多 crop 各调一次回调；返回多个 flow 时基建用 `seq` 包装。对齐 BGA `$this->field = true`
+ `getFieldDetails()` + `onPlayerAfterReap` 语义。

**Harvest reap log 时序**：`harvestReapSummary` 初始化已从 `continueHarvestReap` 提前到
`continueHarvestFieldStart`，基建在 `onHarvestFieldPhase` 内累加 `summary.resources[crop]`，
让 `log.harvestReapDetail` 同时包含普通 field 与 cardField 产出（之前 cardField 累加发生在
summary 初始化前会被丢弃）。

当前迁移到该 helper 的 11 张卡：B68 / D75 / E80 / D25 / E72 / C70 / E68 / E69 / E70 /
B113 / B141。

### 8.6 命名 & 约束

- 卡牌文件 `{Deck}_{Number}_{Name}.ts`（例 `A123_FrameBuilder.ts`），导出常量名同卡牌名。
- 卡牌能力**尽量在卡牌文件内部闭环**，不能扩散到 `pay.ts` / `improvement.ts` / `game-session.ts` 等核心文件。
- 优先用 Hook 系统、`CardDefinition` 通用字段（`cost` / `reward` / `prerequisite`）、`cardStates`。
- 禁止：核心文件内针对单卡的 `if-else`；集中式卡牌效果注册表；前端硬编码卡牌特定规则。

---

## 9. shared/domain/ — 领域聚合层

派生视图 + 不变量校验集中处。`PlayerState` 仍是 JSON 可序列化纯数据，所有"我能不能 X"集中到 `PlayerBoard`。

```
shared/domain/
├── player-board.ts    PlayerBoard（playerBoard 工厂）
├── farmyard.ts        农场布局 / normalizePlayerFarm
├── pasture.ts         围栏验证 / computePasturesFromFences
├── animal-zones.ts    动物分区容量（getTotalAnimalCapacity / getPastureCapacity）
├── animals.ts         动物模型
├── scoring.ts         计分 / PlayerScoreSummary
├── farm.ts、field.ts、space.ts
└── index.ts
```

`PlayerBoard(player, state)` 暴露：`countAnimals` / `pasturesWithCapacity` / `emptyFences` / `hasRoomFor` / `canPlow` / `canBuildFence` / `scoringBreakdown`，私有 `invariant_animalsInPastureOrStable`。

域聚合可被三方共用（主 client + sandbox + server），属于 `[A]` 主 bundle 安全层。

`onComputeAnimalZones` card-effect 签名：`(player: PlayerState, zones: AnimalZone[], state: GameState) => AnimalZone[] | void`。第三个 `state` 入参用于读取全局字段（典型场景：A148_Woolgrower / B86_TruffleSearcher 读 `state.completedFeedingPhases` 计入容量），避免每张卡再走 per-card post-play counter。新增 `onComputeAnimalZones` 卡牌可忽略 `state`（使用 `_state` 占位）。

---

## 10. 其他 shared/ 模块

### 10.1 shared/draft/

`draft-manager.ts` —— 纯函数 simultaneous 卡牌选择：`initDraftState` / `processSubmit` / `tryAdvanceRound` / `finalizeDraft`。`types.ts` 定义 `DraftState` / `DraftPool` / `DraftPickPayload`。`createRoom` 时 `draftMode: 'simultaneous'` + `draftPoolSize: 7..10` 启用。

### 10.2 shared/i18n/

UI 文案 key 与多语言资源；`PromptKey` 在 `shared/contract/prompt-keys.ts` 集中定义。

### 10.3 shared/custom-code/

`ast-validator.ts` —— 用户自定义卡牌 TypeScript 源码 AST 校验（白名单 import / 禁用 API / 网络与 IO 隔离）。运行期隔离在 `server/custom-code/`。

### 10.4 shared/utils/

通用工具（深拷贝、ID、math 等），无业务规则。

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

- 房间内同房间一个 `GameSession`，命令串行处理。
- `room-router` 只路由不写状态。
- `payload-validation.ts` 纯校验（`validateResourcePayload` / `validateSingleTilePayload` / `validateMultiTilePayload`），返合法/规范化结果，不写 `GameSession`。
- 单房间命令队列：异步入口必须排队，避免乱序写入。

### 11.2 server/game/ — Room + GameSession

```
server/game/
├── room.ts                    Room { id, session: GameSession, players: RoomPlayer[], maxPlayers }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   大厅 / 房间列表 / 自动加入
├── authoritative-session.ts   GameSession extends GameCore — 命令执行中心
└── persistence/
    ├── room-persistence.ts    抽象接口
    ├── sqlite-adapter.ts      data/open-agricola.db / rooms.state_json
    ├── json-adapter.ts        output/<roomId>.json
    └── memory-adapter.ts      测试注入
```

`RoomPlayer { ws, playerIndex, displayName, connectionState, reconnectToken... }` —— 连接实例，非领域 `PlayerState`。

`GameSession` 在 `SessionCore` 之上加：连接绑定、广播、持久化触发、devtool hook、终局判定；签名 `createSessionForRoom(stateOrSeed?, customCardDbIds, requestUserId, playerCount?)`。

固定持久化 dev 房：`dev2` / `dev3` / `dev4`，对应 2/3/4 人。`PERSIST_ROOMS=sqlite`（默认） / `json` 切换 adapter。普通 SQLite 房间："空房先保留、TTL 后回收"，启动恢复覆盖 `waiting` 与 `playing`，`custom_card_ids` 一并恢复。允许同座位重连替换旧连接。

### 11.3 server/custom-code/ — 隔离执行

```
server/custom-code/
├── compiler.ts          TS → JS（ts-blank-space + esbuild）
├── runtime.ts           沙盒运行时
├── engine.ts            hook / phase / scope 校验 + 调度
├── isolate-runner.ts    isolate-vm 隔离入口
├── executor-worker.ts   worker / sidecar 入口
└── client.ts            主进程 → executor 的 RPC 客户端
```

主后端只保存 `compiled_code + code_manifest`；运行时 RPC 调用同机 `custom-code-executor` sidecar。沙盒约束唯一真源 → `docs/CUSTOM_CARD_SANDBOX.md`（含 `prompt-sync:begin/end` 标记块，`pnpm run check:prompt-sync` 校验）。

### 11.4 HTTP 端点（调试通道）

`server/game-router.ts` + `server/index.ts`：

- `GET /api/health` 健康检查
- `GET /api/rooms` 房间列表
- `GET /api/game/state` 补拉当前快照
- `POST /api/game/new` 创建新对局或测试重置（支持 `seed?: number`）
- `POST /api/game/load` 加载测试状态
- `POST /api/game/dev/*` 单机调试 / E2E 场景布置
- `POST /api/game/new-sandbox` 创建独立 `GameSession`，**不创建 WS 房间**
- `GET /cards-manifest.json` 主 bundle 启动时拉卡牌元数据

不变量：HTTP 仅运维 / 测试 / 调试，不是实时同步主路径；返回结构与 `SessionResponse` 一致；`validate` 接口纯校验，不写权威状态。WS 房间内 dev 命令优先走 `ClientCommand`。

### 11.5 server/workshop.ts + server/workshop-pr/

Workshop / Sandbox 后端（自定义卡上传、编译、PR 集成）。沙盒配置由 SQLite 表 `sandbox_settings` / `sandbox_cards` 持久化；`playerCount` / `deckIds` / `customCardIds` 在 `createInitialState()` 统一处理。

### 11.6 数据库

`server/db.ts` —— SQLite 连接（`better-sqlite3`，按 Node 22 ABI 编译）。表：`rooms` / `users` / `sandbox_settings` / `sandbox_cards` / `custom_cards` / `pr_proposals` 等。

---

## 12. client/ — 前端

### 12.1 双 bundle 边界

| Bundle | 入口 | 路径 | 约束 |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | 走 WS；`shared/*` 只准用 `contract` / `domain` / `cards-display` / `i18n` |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | 浏览器内直接 `new SessionCore(...)` 跑完整 in-process 引擎；可 import 任意 `shared/*`（含 `engine` / `session` / `actions` / `cards` / `custom-code` / `draft`） |

主 bundle 预算：`scripts/check-bundle-size.ts` strict（main ≤ 550KB raw / ≤ 170KB gzip）。

### 12.2 服务层 client/services/

- `gameTransport.ts` —— `WsGameTransport` 类管理 WebSocket 连接（不在 React Context；在 service 层）；URL 切换 `?transport=ws` / `?player=p1|p2` / `?room=devN`。
- `card-meta.ts` —— 启动时 `GET /cards-manifest.json` 运行时拉取卡牌元数据。
- `rehydrate.ts` —— 轻量 rehydrator，跳过 `ActionSpace.onTaken` 回调，切断对 `shared/actions` / `shared/cards/catalog` 的依赖链。
- `llmPrompts.ts` —— LLM 辅助生成 / 校验。

### 12.3 同步状态层

- `client/hooks/useGameSync.ts` —— hydrate 服务端快照，持有 `state` / `pending` / `interaction` / `scores`，**整体替换**。
- 收到 `stateUpdate` 处理顺序：`normalizeState()` → `createActionSpaces()` → 用服务端 `resources` / `takenBy` 覆盖模板字段 → 替换 store。
- 前端**不做乐观提交**：点完发命令，等 `stateUpdate` 到达再改 UI。
- 本地 UI 临时态（hover / 临时选择 / 输入框）独立管理；新快照到达后检查本地选择是否仍合法，不合法清空。
- 断线重连：`socket reconnect → joinRoom → getState → stateUpdate → 整体替换`，前端不依赖本地缓存恢复。

### 12.4 视图编排

`client/app/GameContainerApi.tsx`（含内联 `useTransportSetup` 管理连接）+ `LobbyPage.tsx` + `PageRouter.tsx`。根据 `viewPlayerId` / `playerIndex` 计算窗口可交互性，管理本地临时态。

`ActionBoard` 用 `getBoardPlayerCount(players)` 切 className `action-board--{n}p`：2P=830px，3P/4P=1000px。

### 12.5 contexts

- `AuthContext` —— GitHub OAuth 登录状态。
- `LocaleContext` —— 多语言切换。

### 12.6 ESLint 三层强制

`eslint.config.js` 关键规则：

- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card catalog/bootstrap/register-all 和 per-card impl modules；UI metadata 必须走 `shared/cards-display/**` 或 `client/services/card-meta`。
- `client/sandbox/**` 全开。
- `no-restricted-syntax` 禁动态字符串 `import('shared/session/...')` / `import('shared/engine/...')` / card impl-bootstrap 字面量绕过。
- `package.json` 已声明 `sideEffects` 给 bundler tree-shaking 基线。
- violation = CI error。

---

## 13. 测试策略

### 13.1 三层

| 层 | 目录 | 用途 | 是否在主 PR 必须通过 |
|---|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts` + `client/**/__tests__/*.test.ts` | 纯领域逻辑，造 mock state 调函数 | ✅（fast 项目） |
| Session | `server/__tests__/*.test.ts` | 直接实例化 `GameSession`，调 `takeAction` 等，断言 `resp.state` / `pending` / `interaction` / `ok` | ✅（slow 项目，按文件名 glob `[A-E][0-9]*-session.test.ts` 一卡一文件） |
| E2E | `e2e-tests/*.spec.ts` | Playwright 双窗口浏览器，验证多人链路 | 手动 / Workflow |

`vitest.config` 分多个 fast 子 project（`fast-shared` / `fast-cards` / `fast-card-runtime` / `fast-client` / `fast-server` / `fast-scripts` / `fast-tests`）以及 `slow` / `llm`。`pnpm test:fast` 先运行 `check:test-project-coverage`，确保新 fast projects 覆盖旧 fast 文件集合且没有重复。`pnpm test:fast` CI 默认；`pnpm test:slow` 单卡 session 测试；`pnpm run test:e2e` 需后端 + 前端在跑；`pnpm exec vitest run <file>` 单文件。

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

### 13.3 工程命令

```bash
pnpm install                # canvas 需要系统库 libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
./restart-intranet.sh       # 本地开发 / 运行 / 测试统一入口（绝对路径启动 tsx + vite，避免跨 worktree pkill 误伤）
pnpm test                   # vitest 全量（fast + slow）
pnpm test:fast              # 只跑 fast project（CI 默认）
pnpm test:slow              # 只跑 slow project（单卡 session 测试）
pnpm run test:e2e           # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run <file> # 单文件
pnpm run lint               # ESLint（error 必须清零）
pnpm run build              # tsc + vite build
```

本地开发统一 Node.js 22；`better-sqlite3` 等原生依赖按 Node ABI 编译。

---

## 14. 关键不变量速查

1. **后端权威**：规则在 `shared/` + `server/`；前端不裁定。
2. **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/`；ESLint CI error 强制。
3. **双 client bundle**：`client-app` 不引 `shared/{engine,session,actions,cards,custom-code,draft}`；`client/sandbox` 全开。
4. **WS 主链路**：`/ws` 收 `ClientCommand`，发 `StateUpdateEnvelope`；HTTP 仅调试。
5. **InteractionState 是前端唯一真相**：`stateId ∈ {idle, wait, gameover}`；`wait` 下用 `request.kind` 分流。
6. **节点树是唯一状态机**：`PendingAction` union 已消除；"等什么"由 `engine.peekPendingEnvelope()` / pending host 派生。
7. **EngineStack.push / pop**：hook / anytime / 嵌套子流程唯一注入路径，不直接改 `pending`。
8. **卡牌就地闭环**：`shared/cards/{Deck}/{Card}.ts` 内部完成；不改 `pay.ts` / `improvement.ts` / `game-session.ts` 等核心文件。新增 Hook 点必须同时补测试和文档。
9. **cardStates 局部状态**：持续计数 / 标记写 `player.cardStates[cardId]`；后续选择走显式 `pending` / continuation。
10. **不引入循环依赖**。
11. **不为单卡改主路径**。
12. **测试默认 2 人游戏**；规则正确性站后端边界，不通过 DOM 反推规则。
13. **前端不做乐观提交**：等 `stateUpdate` 到达再改 UI。
14. **ActionFlow 对齐 BGA 小代数**：卡牌 DSL 只暴露 `leaf / seq / parallel / xor / or` + metadata；runtime-only node 不进入卡牌 flow。
15. **listener handler 不改 state**：listener / preview / doable 路径只 build flow 或返回结构化结果；状态修改必须落在 action leaf 执行阶段。

---

## 15. 文档导航

| Topic | Doc |
|---|---|
| 卡牌测试模板 | `docs/CARD_TEST_TEMPLATE.md` |
| 卡牌实现现状 / 描述对齐 / 计划 | `docs/card_implementation_status.md` |
| 平台 / Workshop | `docs/PLATFORM_DESIGN.md` |
| 部署 | `docs/HOW_TO_DEPLOY.md` |
| 自定义卡沙盒约束 | `docs/CUSTOM_CARD_SANDBOX.md` |
| CI 检查 | `docs/operations/ci-checks.md` |
| GitHub OAuth | `docs/operations/github-oauth-app-setup.md` |
| 已知卡牌架构债务 | `docs/card_implementation_status.md` |
