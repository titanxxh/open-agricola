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
- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/{engine,session,actions,cards,custom-code,draft}/**`
- `client/sandbox/**` 全开
- 附加 `no-restricted-syntax` 禁动态 `import('shared/session/...')` 字面量绕过
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
  roundActionOrder: (string|null)[],
  gameSeed: number,
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
}
```

`workPhaseObtainedResources` 服务于"前一工作阶段获得资源"类卡（A53 等），回家阶段结算后清空。

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

### 4.7 ActionChoiceOption + effectPreview

```ts
type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ResourceExchangePreview | PaymentPreview | TextPreview
}
```

`effectPreview` 三类（`resourceExchange` / `payment` / `text`）。引擎对 `seq(pay-resources, gain[, bonus-vp])` option 自动聚合 preview；卡牌手写 `payLeaf+gainLeaf` 也能拿到 preview。生产点：`shared/cards/helpers/pay-gain-node.ts`、`shared/actions/effects/pay-helpers.ts`、`shared/actions/effects/exchange.ts`。

### 4.8 LogEntry

`LogEntry { key, params }` —— 结构化 i18n key + 渲染参数。前端按 locale 渲染。

---

## 5. shared/engine/ — 节点树引擎

**节点树是唯一状态机**。`GameSession` 不再持有 `PendingAction` union，"等什么"从引擎光标派生。

### 5.1 文件清单

```
shared/engine/
├── engine.ts              Engine 类（~430 行）
├── engine-stack.ts        EngineStack：子流程帧栈
├── engine-resolve.ts      resolveChoice 路径
├── engine-proceed.ts      step / 推进路径
├── dispatcher.ts          hook listener 调度
├── tree.ts                节点树构建
├── registry.ts            ActionDefinition 注册查找
├── log-store.ts           日志缓冲
├── types.ts               EngineContext / EngineFrame / EngineStackCursor
└── nodes/                 节点类型实现
    ├── abstract-node.ts   AbstractNode 基类
    ├── leaf-node.ts       原子动作叶子
    ├── interaction-node.ts 单一"等输入"叶子
    ├── seq-node.ts、parallel-node.ts、xor-node.ts、or-node.ts、optional-node.ts
    ├── choice-node.ts、player-switch-node.ts、activate-card-node.ts
    └── ...
```

### 5.2 节点类型

- `LeafNode`：原子 action（`gain` / `pay-resources` / `place-farmer` / `bake-bread` / ...）；以 `actionId` + `params` 调 `ActionDefinition.execute`。
- `InteractionNode`：唯一"等待玩家输入"的叶子；带 `request: InteractionRequest`、`promptKey`、`promptParams`、`sourceCard`。新等待形态 = 加 `InteractionRequest` 新 kind，不加新节点类型。
- 组合节点：`SeqNode`（顺序）/ `ParallelNode`（并行）/ `OrNode`（任选其一）/ `XorNode`（互斥分支）/ `OptionalNode`（可选）/ `ChoiceNode`（前向分支）。
- 控制节点：`PlayerSwitchNode`（切换活跃玩家，跨人 hook 用）/ `ActivateCardNode`（hook 触发，按 listener 注入）。

`AbstractNode` 提供：`isDoable / isAutomatic / resolve / parent / children / push / replace / isResolved / getNextUnresolved / toCursor / fromCursor`。

### 5.3 Engine 公共 API

`Engine` class 暴露给 `SessionCore` 的接口（小集合）：

- `step(ctx)` —— 推进到下一个 unresolved 节点；遇到 `InteractionNode` 暂停，返回 envelope。
- `resolveChoice(value, ctx, payload?)` —— 提供玩家选择，继续推进。
- `peekInteraction()` —— 返回当前等待的 `InteractionNode`（或 null）。
- `peekInteractionHost()` —— 返回托管该 interaction 的最近 host 节点（用于 sourceCard / actionContext 反查）。
- `peekPendingChoiceFromComposite()` —— 从 OrNode/XorNode/OptionalNode 派生待选项。
- `injectInteraction(node)` / `injectBeforeFlows(flows, ctx?)` —— hook 与 anytime 注入子流程。
- `snapshot()` / `restore(snapshot)` —— 序列化与重建节点树（含 `nodeStates`、`choiceData`、`pendingActionId`）。
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

API：`push / pop / current / depth / peekInteraction / toCursor`。

`EngineStackCursor` 序列化成 `SerializedGameState.engineStack`，恢复路径：`engine.snapshot()` → `AbstractNode.fromCursor()` 重建节点树并定位光标。

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
├── flow.ts                ActionFlow 节点表达式（leaf / seq / parallel / xor / or / optional / choice）
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

### 7.4 payment/

`shared/actions/payment/`：

- `solver.ts` —— `computeAllBuyableCombinations` / `keepOnlyOptimals` / `sortPaymentSolutions`
- `executor.ts` —— `payResources` / `executePaymentSolution`
- `modifiers.ts` —— `computeCosts` hook 集成
- `adapters/room.ts` —— 房间费用变体（每间房不同形状）
- `cache.ts` —— solution cache

对外通过 `pay-helpers.ts` / `room-payment.ts` 暴露统一入口。卡牌购买费用走 `computeCosts` phase + `actions: ['improvement-any']` 区分行动空间费用 vs 卡牌购买费用。

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

`ActionHookContext { state, player, space, actionId, phase, result?, choice?, doable? }`。`result.extraData` 携执行元数据（如 fence 的 `newPastures` / `newEdges`）。

`ActionHookResult { doable?, actionId?, extraOptions?, followUpActions?, flow?, costs?, sourceCard?, logKey?, logParams? }`。

`sourceCard` 兜底：`ActionHookResult.flow` 顶层 `sourceCard` 递归补到缺失 child leaf；`OptionalNode` / `OrNode` / `XorNode` / `ChoiceNode` 写入 `pendingChoiceContext.sourceCard`，`authoritative-session.ts` 透传到 `interaction`。

作用域 scope：`player` / `opponent` / `any`。同 phase 内按 `order` → `id` 排序，同步、确定性。

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

### 7.7 ActivateCardNode + PlayerSwitchNode + ParallelTriggerNode

- 当 `HookDispatcher.getMatchingListeners()` 找到匹配 listener，引擎在 dispatch 阶段（`buildPhaseTrailingNodes` 内）调用 `executeCardListener` **peek 一次** 拿到 `ActionHookResult`，存到 `ActivateCardNode.preComputedResult`。推进到 `ActivateCardNode` 时若有 `preComputedResult` 直接复用（不重跑 handler）；若无（legacy 路径）才 fall back 到 lazy 调 listener。
- 当 owner ≠ 当前行动玩家（opponent scope），dispatch 自动在该 owner 的 trigger 组前后插 `PlayerSwitchNode`。`PlayerSwitchNode` 暂停时通过 `confirm-player-switch` interaction 等玩家确认；`undoBoundary` 标记 undo 不能跨切人。
- **多 listener 同 phase 触发**（BGA-style PARALLEL trigger selection）：
  - dispatch 阶段静态分析每个 listener 的 flow（`shared/engine/flow-interactivity.ts`：`xor` / `optional` / `altCosts payLeaf` / 含 `interactionRequest` 的 leaf → `interactive`；纯 `gain` / 单路径 `pay` / 全 auto seq → `auto`）。
  - 同 owner 内分组：mandatory + optional auto 直接串行 `ActivateCardNode`；optional interactive 包成 `ParallelTriggerNode`。
  - `ParallelTriggerNode.step()` 在 children 未 resolved 且 `selectedChildId === null` 时 emit `kind: 'select-trigger'` InteractionRequest，给卡主玩家选触发顺序（含 `__pass__` 一次性跳过剩余）。玩家选 cardId → `chooseCard` 设 `selectedChildId` → 引擎下一轮 `tree.nextUnresolved` 找到选中 child activate。child 完整结算后（含嵌套子触发的递归 ParallelTriggerNode）`selectedChildId` 自动清空 → 下一轮 step 重新 emit。全部 children resolved 或 `passAll` → 节点 resolved。
  - `order` 字段已删除（曾经 4 张卡的 `order: 10` hack 全 cleanup）；执行顺序由 `playOrderIndex`（occupation < minor < improvement，数组 index）决定。

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

Output: `{ allowed: false, reason }` or `{ allowed: true, blockedIds }`. The seven rules are priority-ordered (first match wins): no-context → feed-locked → confirm-window → animal-reorg → exchange/bake-bread promptKey → stage-hook-chain default block → everything else allowed with no blocks.

Three consumers share this snapshot:

1. `buildAnytimeEntries()` — filters the auto-discovered registry + card-listener entries; returns `[]` if `!allowed`, otherwise removes any entry whose id is in `blockedIds`.
2. `buildInteraction()` — derives `'takeAnytimeAction'` inclusion in `allowedCommands` strictly from `allowed && entries.length > 0`, keeping the UI and server views synchronised.
3. `phases/round.ts::takeAnytimeAction()` — server-entry enforcement before any anytime injection. Additional guards (gameOver, draft phase, active-owner mismatch) sit at the function entry; the policy itself only sees pending-shape inputs.

OA-vs-BGA design notes:

- Reorganize is a system-driven sub-flow in OA (not a player-triggerable anytime) — the policy never produces a `'reorganize'` entry to filter.
- `feed` pending is locked in OA because `executeFeedingLogic()` freezes `remaining`/`foodUsed` into the InteractionRequest. BGA allows nested anytime in its `ST_HARVEST_FEED` flow because its predecessor is the `EXCHANGE` state, which has no fixed budget.
- `stageResume`-bearing harvest stage hook chains default to blocked to preserve the "system-driven hook chains do not yield to player anytime" invariant; the explicit allow-list (`animal-reorg`, exchange/bake-bread promptKey) overrides this.

---

## 8. shared/cards/ + shared/cards-display/ — 卡牌闭环

### 8.1 双产物：display vs impl

| 目录 | 形态 | 谁能 import |
|---|---|---|
| `shared/cards-display/{A..E,major,community}/` | 纯数据：`id` / `nameKey` / `descKey` / `imageId` / `costSpec` / `cardType` / `deck` / `prerequisiteSpec` | 主 client bundle ✅ + sandbox ✅ + server ✅ |
| `shared/cards/{A..E,major,community}/` | hook 注册 + effect 函数 | sandbox + server（主 client bundle 禁止） |

主 bundle 启动时 `GET /cards-manifest.json` 拉运行时元数据（`client/services/card-meta.ts`），切断对 `shared/cards/catalog` 的依赖链。

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

### 8.5 命名 & 约束

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

- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/{engine,session,actions,cards,custom-code,draft}/**`。
- `client/sandbox/**` 全开。
- `no-restricted-syntax` 禁动态字符串 `import('shared/session/...')` 字面量绕过。
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

`vitest.config` 分 fast / slow / llm 三个 project。`pnpm test:fast` CI 默认；`pnpm test:slow` 单卡 session 测试；`pnpm run test:e2e` 需后端 + 前端在跑；`pnpm exec vitest run <file>` 单文件。

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
6. **节点树是唯一状态机**：`PendingAction` union 已消除；"等什么"由 `engine.peekInteraction()` 派生。
7. **EngineStack.push / pop**：hook / anytime / 嵌套子流程唯一注入路径，不直接改 `pending`。
8. **卡牌就地闭环**：`shared/cards/{Deck}/{Card}.ts` 内部完成；不改 `pay.ts` / `improvement.ts` / `game-session.ts` 等核心文件。新增 Hook 点必须同时补测试和文档。
9. **cardStates 局部状态**：持续计数 / 标记写 `player.cardStates[cardId]`；后续选择走显式 `pending` / continuation。
10. **不引入循环依赖**。
11. **不为单卡改主路径**。
12. **测试默认 2 人游戏**；规则正确性站后端边界，不通过 DOM 反推规则。
13. **前端不做乐观提交**：等 `stateUpdate` 到达再改 UI。

---

## 15. 文档导航

| Topic | Doc |
|---|---|
| 卡牌测试模板 | `docs/CARD_TEST_TEMPLATE.md` |
| 卡牌实现进度 | `docs/card_progress.md` |
| 卡牌描述对齐 | `docs/card_desc_audit.md` |
| 主计划 / Sprint 排期 | `docs/master-plan.md` |
| 平台 / Workshop | `docs/PLATFORM_DESIGN.md` |
| 部署 | `docs/HOW_TO_DEPLOY.md` |
| 自定义卡沙盒约束 | `docs/CUSTOM_CARD_SANDBOX.md` |
| CI 检查 | `docs/operations/ci-checks.md` |
| GitHub OAuth | `docs/operations/github-oauth-app-setup.md` |
| 已知坏味道 | `docs/bad-smell.md` |
