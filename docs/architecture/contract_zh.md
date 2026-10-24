# shared/contract/ — 协议层

[English](contract.md) | [中文](contract_zh.md)

> 本文件是中文翻译镜像；[contract.md](contract.md) 是唯一权威版本。

本 module 集中存放前端、后端与沙盒共用的数据形状，不含规则代码。前端主 bundle 只能读取 `shared/contract/`、`shared/i18n/`、`shared/domain/` 和以 manifest 为后端的 `client/services/card-meta`。

## 关键文件

| 文件 | 内容 |
|---|---|
| `contract/types.ts` | `GameState`、`PlayerState`、`ActionSpace`、`Resource`、`InteractionState`、`InteractionRequest`、`ActionDefinition` |
| `contract/workshop.ts` | 工坊 Design Draft、Workspace 与生成候选的前后端协议 |
| `contract/protocol/ws.ts` | `ClientCommand`、`ServerEvent`、`RoomSummary` |
| `contract/protocol/game.ts` | `GameSyncPayload`、`StateUpdateEnvelope`、`StateUpdateCause`、`ActionDetailEffects` |
| `contract/cards.ts` | `CardDefinition`，公开卡牌形状 |
| `contract/prompt-keys.ts` | 作为 i18n 锚点的 `PromptKey` 枚举 |
| `contract/state-constants.ts` | 不含规则代码的行动格与版图常量 |
| `contract/seasonal-adjustments.ts` | 类型明确的季节身份与有符号的实际结算调整 |
| `session/serialization.ts` | `SerializedGameState`、`serializeState`、`rehydrateState` |

## GameState：领域真相

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
- 结算事件以类型明确的 `SeasonalAdjustment` 单独记录季节事实，不写卡牌统计。`action.accumulated.resources` 保留净增量；受影响的事件另保留 `normalResources` 与实际、有符号的季节差值，包括最终为零的结算。原事件只生成一条含说明的日志；notification 和资源动画仍只使用净资源。见 [ADR 0034](../adr/0034-seasonal-adjustments-belong-to-settlement-events.md)。
- `buildLogPresentationPlan()` 是 Action Log 关系的唯一来源（`rows`、`consumedEvents`、`suppressedEvents`）；客户端不从名字、数量或卡牌 ID 推断关系。喂食转换行消费对应的兑换事实。围栏建造通过共用 `paymentId` 消费其实际付款，把建造数、付款及季节调整保留在同一行；不从相邻事实猜补缺失付款。
- `EventStore` 为每个新事件分配不透明的 `occurrenceId`，在快照、rebase、取消和投影中保持不变。派生日志行携带 `LogEntry.sourceEvent = { occurrenceId, rowIndex }`；缓存匹配使用它加日志 key，没有这些字段的旧记录保留按参数计数匹配。
- 购卡把 `PaymentInfo.publicPayment` 带入 `card.played.payment`，其 `paymentId` 与对应的 `resource.paid` 事件共享；免费打出携带显式空收据。
- 季节赠送在原有 `resource.moved` 或 `farm.stableBuilt` 结果及派生的 `ActionDetailParts` 上携带 `seasonalGrant: { season }`。实际数量取自所属事实；展示不从当前季节反推来源，也不把季节当成卡牌。
- 季节费用解释属于 `resource.paid.seasonalAdjustments` 及公开收据，有符号的实际成本变化随 `ActionDetailParts` 或原购买行传递（[ADR 0034](../adr/0034-seasonal-adjustments-belong-to-settlement-events.md)）。只有选中的成本候选为购买提供调整。mapper 和客户端保留最终支付为零的事实，不猜补旧历史归因，也不把季节写入卡牌统计。测试：`server/__tests__/{seasonal-fence-payment,seasonal-major-payment}-session.test.ts`、`client/components/board/__tests__/seasonal-payment-log.test.tsx`。
- `farm.animalBred.animals` 记录实际新生数量，与后续整理、烹饪或释放分开。非收获出生从记录的季节或卡牌来源生成一条结果日志；正常收获出生保留现有汇总行。出生事件身份同时确定日志关联，在撤销、恢复及 Replay 中保持一致。
- `harvest.heated.seasonalWaiver` 在玩家的供暖结算事实中冻结季节、正常需求和实际豁免需求。豁免不增加支付或生病事实；正常需求为零时不声称存在季节收益。
- typed-flat 犁地通过 `farm.fieldPlowed.payment` 结算，不另产生 `resource.paid`。收据把实际资源与季节费用调整带入同一操作明细，与田地数量共同展示。测试：`server/__tests__/seasonal-plow-payment-session.test.ts`、`client/components/board/__tests__/seasonal-plow-log.test.tsx`。
- `publicEventArchive` 是只追加的 metadata：`publicEvents.committed` 与 `publicEvents.canceled` 包，写入前校验。规则和 listener 从不读取它。运行时 `publicEventCancellations` 只是恢复响应的 metadata，与归档一样按视角过滤和重映射；重连与 `getState` 从不重放它们。
- 只有 `visibility: 'public'` 的事件进入 `GameState.events`。`privateEvents` 是按视角同步私有提示和手牌 / 选秀变化的层，从不进入 Replay 或规则。

**种子与视角投影。** Game Seed 只在服务端可见（[ADR 0020](../adr/0020-game-seed-is-server-private-and-unguessable.md)）；`shared/utils/rng.ts` 负责宽种子与指定种子。`filterSerializedStateForPlayer` 对所有视角删除 `gameSeed`，并把每张未翻开的轮次卡返回为 `null`，包括 `roundActionOrder` 和安排在该卡上的货物的 `actionId`（卡牌效果可通过公开的 `action.revealed` 事件提前翻开）。实时同步、Bug Report 证据与 Replay 座位视角共用此投影。开发房间的 `dev-viewer` 同步保留轮次卡顺序，但仍删除种子；`debug` 是热座房间和开发房间未遮蔽读取用的完整状态。

**持久化形状。** `SerializedGameState` 是公开的网络与 Replay 表示，其 `engineStack` 永远为空。`PersistedSessionSnapshot` 保存权威 `state`、公开 `frame` 和服务端私有的 `sessionCursor`（引擎恢复数据、历史、暂定续行 metadata），后者从不发给任何视角。同步版本和连接不属于 `GameState`。

测试：`shared/events/__tests__/{event-mapping-policy,log-mapper}.test.ts`、`shared/session/__tests__/{serialization-filter,serialization-archive-projection}.test.ts`。

## PlayerState 按职责划分

- 身份：`id`、`name`、`color`
- 经济：`resources`、`familySize`、`workersAvailable`、`rooms`、`houseType`
- 农场：含多个 `CropStack[]` 的 `fields`、`roomTiles`、`stableTiles`、`fenceSegments`、`pastures`、Farmers of the Moor 的 `farmTerrain`（顶层 `kind` 与可选 `covered`）、`farmyardExtensions`、`farmyardSpaceStates`
- 动物：`houseAnimals`（按房间位置安置）、`stableAnimals`、`newbornCount`
- 已打出卡牌：`improvements`、`minorPlayed`、`occupationPlayed`
- 手牌：`minorHand`、`occupationHand`
- 持续效果：`majorEffects`、`activeModifiers`
- Supply token：`supplyTokensConsumed` 记录永久消耗的围栏或马厩组件；剩余上限由 helper 计算
- 卡牌局部状态：`cardStates`（[cardStates 中的局部状态](cards_zh.md#cardstates-中的局部状态)）
- 工人身份：`workers: Worker[]`，五个固定槽 `'1'..'5'`；`isActive` / `isNewborn` 描述永久家庭成员，可选 `supplyUse` 记录预留、待放置或临时放置的供应人物及其处置方式

`PlayerState.fields` 存放 Farmyard Field（底层作物堆在前）。面向卡牌的规则使用 Logical Field seam（[Card Field 与 Logical Field seam](cards_zh.md#card-field-与-logical-field-seam)）；只有几何与占用规则才请求 Farmyard Field。

## ClientCommand

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
- `commitSelection` 只用于结构化的定向选择：`interactionSubmitChannel()`（`shared/session/interaction-command-policy.ts`）把 `farm-select`、`selection`（farm-position、occupation-hand）、`resource-quantity-select` 与 `resource-batch-exchange-select` 路由到它。职业手牌选择必须是声明上限内无重复的手牌子集，在任何效果或随机观察之前校验。farm-position 可使用服务端校验的 `validPositionGroups`；携带 `sourceCard` / `cardFieldSlot` / `groupKey` 的位置按组计数，由后端规范化。
- Game Variant 开关（`enableParentCards` / `draftParents`、`enableThroughTheSeasons`、`enableFarmersOfTheMoor`、`enableSnakeOpening`）是 Room 选项，跨 `newGame` 与重启保留；`draftParents: false` 时直接给每位玩家一组父母，不进入 `parent-selection`。
- `customCardIds` 只在 `enableCommunityDeck: true` 时生效，且只接受已审核并上线的工坊卡（[工坊后端](server_zh.md#工坊后端)）。

## ServerEvent 与 StateUpdateEnvelope

`setPlayerColor { color }` 是需认证、记入命令账本的候场命令，不接受客户端指定座位。它只修改调用者颜色，持久化后才发布，不生成 Replay Step。

候场事件携带权威玩家状态中的 `playerColors`；名单包含 `connected`，玩家断线后仍显示其保留座位和姓名。

```ts
type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error; requestId? }
  | { type: 'authOk'; userId; username }
  | { type: 'roomCreated' | 'gameStarted'
      | 'playerJoined' | 'playerDisconnected' | 'roomDissolved'; ... }
  | { type: 'roomJoined'; roomId; playerIndex; status; players; maxPlayers; playerColors }
  | { type: 'roomWaiting'; roomId; players; maxPlayers; playerColors }

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

## InteractionState：前端渲染权威

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

## ActionChoiceOption 与预览

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

Choice Preview 由共享的可执行规则计划派生（[ADR 0024](../adr/0024-choice-previews-use-shared-rule-plans.md)）；卡牌不加展示回调。

- `effectPreview` 的类型包括 `resourceExchange`、`payment`、`text`、`resourceMovement`、`futureSchedule`、`futureOffers`、`actionSpace`、`cardScore` 和 `fieldContents`，完整集合见 `shared/contract/types.ts` 中的 `ChoiceEffectPreview` union。它们由纯查询 `ActionDefinition.previewEffect` 产生。未来请求与执行共用 `normalizeFutureSchedule`（目标过滤、前缀、条件、费用、房间类型）。`seq(pay, gain[, bonus-vp])` 的预览自动聚合，手写的 pay 与 gain leaf 也一样。
- `descriptionPreview` 递归描述 flow（`ChoiceDescriptionPreview`）：顺序、互斥与可兼选择、并行顺序、可选性和执行者。`Engine.describe()` 读取可执行 flow 而不推进；`Engine.describeFlow()` 描述独立计划；不透明的原生行动提供纯 `ActionDefinition.flowFactory`，执行也调用它。基础描述不含玩家 modifier，并保留所有条件分支；延后的数量在到期前保留其公式。
- 可见选项文字来自 `descriptionPreview` 与 `effectPreview`；`choiceLabelKey` 只用于语义覆盖。`special-effect` 从 `params.kind` 提供语义描述，纯展示同步不出现在描述中。
- 预览描述的是声明的效果，不保证未来条件成立。连续且相同的未来条目合并，其他条目按顺序分别显示。
- 当前交互选项使用 Interaction Player 与权威支付求解器，包括数量上限与替代支付来源。
- 农场格选择携带 `ActionChoiceOption.target`（执行者、逻辑田、位置、Card Field 槽）与 `targetCard`；客户端渲染这些事实并提交不透明的值。
- `collectScheduledEffectPreviews()` 把计划领取、offer、定时规则和义务投影为 `ScheduledEffectPreview`（轮次、阶段、来源、描述、重复次数）。分组只影响展示；按玩家过滤会去除隐藏来源与未翻开的行动身份；rehydrate 会剥离这些投影，它们在并入快照 Frame 前先经过 JSON 边界。

测试：`shared/actions/__tests__/future-schedule-preview.test.ts`、`server/__tests__/anytime-description-session.test.ts`。

## LogEntry

`LogEntry { key, params, playerId? }` 携带 i18n key 与参数，按当前语言渲染。开局条目可带稳定的 `playerId`，座位显示名变化时按身份刷新。

