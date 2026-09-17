# Open Agricola 架构

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> 本文件是中文翻译镜像；[ARCHITECTURE.md](ARCHITECTURE.md) 是唯一权威版本。

> 以下为当前 `main` 已落地架构的中文翻译。
> 本文档替换历史的 `ENGINE_ARCHITECTURE.md` 与 `ENGINE_NEW_ARCHITECTURE.md`。

---

## 1. 设计目标与不变量

主链路 = **WebSocket 房间对局 + 后端权威 + 前端被动渲染**；HTTP 退化为启动 / 调试 / 运维 / 测试通道。

不变量（违反即架构 bug）：

- **后端唯一 owner**：`GameSession`（`server/game/authoritative-session.ts`）是唯一服务端游戏命令入口并持有 `GameState`；具体修改由它驱动的 `GameCore` 和 action leaf 执行。
- **全量快照**：同房间所有客户端收到同一份 `stateUpdate`，前端不做局部 patch。
- **弱客户端**：前端只渲染、收集输入、管理本地 UI 临时态，不裁定规则。
- **命令驱动**：前端只发"我要做什么"，后端校验、执行、落状态、产生日志后广播。
- **单一领域实现**：行动 / 引擎 / 卡牌 / 回合 / 收获 / 计分统一放 `shared/`，前后端共用同一套领域模型。
- **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/` 由 ESLint `architecture/imports` 强制（CI error）。
- **卡牌就地闭环**：卡牌特效写在卡牌文件内部，不向核心路径扩散。
- **Supply token 也是支付资源**：fence / stable 这类玩家 supply 上限不能写死为 15 / 4；读取必须走 supply-token helper 或 payment resource pipeline。

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
- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card source、card generated catalog 和 per-card impl modules；UI metadata 必须走 `public/cards-manifest.json` + `client/services/card-meta`
- 特权入口和 Worker 文件精确列于 `scripts/architecture-policy.mjs`；普通页面和回放不保留规则运行时例外
- 统一解析后的 import 规则覆盖静态导入、重导出、字面量动态导入与 require，避免 flat config 覆盖
- violation = CI error

---

## 4. shared/contract/ — 协议层

**唯一作用**：把"前后端 + sandbox 都要看到的形状"集中到这里。前端主 bundle 只读 `shared/contract/` + `shared/i18n/` + `shared/domain/` 和 manifest-backed `client/services/card-meta`，其余不进 bundle。

### 4.1 关键文件

| 文件 | 内容 |
|---|---|
| `contract/types.ts` | `GameState` / `PlayerState` / `ActionSpace` / `Resource` / `InteractionState` / `InteractionRequest` / `ActionDefinition` |
| `contract/workshop.ts` | Workshop Design Draft、Workspace 与生成候选的前后端协议 |
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
  publicEventArchive: PublicEventArchivePacket[],
  nextPublicEventArchivePacketSeq: number,
  roundActionOrder: (string|null)[],
  gameSeed: number,
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,    // 已完成的收获 feeding phase 数；A148/B86 等卡读取
}
```

`actionSpaces[*].takenBy` 是 `WorkerRef[]`。普通 ref 只包含 `playerId` / `workerId`；卡牌创建的联动占格可额外写 `synthetic: { kind: 'linked-occupancy', sourceCard, linkedWorkerId }`，让后续清理按行动格 state 上的语义 metadata 判断，而不是跨读外卡 id。

`workPhaseObtainedResources` 服务于"前一工作阶段获得资源"类卡（A53 等），回家阶段结算后清空。

`completedFeedingPhases` 在 `shared/session/phases/harvest.ts` 的 feeding phase 结束时 `+= 1`，等价于 参考实现 Globals 同款全局计数；A148/B86 等"按已完成收获 +1 容量"卡牌从此字段读取，避免再走 per-card post-play counter。

`events` 是公共结构化规则事件流，位于 `GameState.log` 下层。后端规则执行时先写 `GameEvent`，再由 mapper 派生 UI log、动画提示、审计报告和未来 replay；`log` 仍是当前可见文字日志，不作为规则来源。`GameState.log` 是由 public events 派生出来的 UI 缓存。规则代码不直接写 `state.log`；允许的写入点只有命名 cache writer：`appendImmediateEvents()` 的 mapper 结果，以及 `GameCore.flushEngineLog()` 从 engine `LogStore` 刷出的 mapper 结果。`pnpm run check:direct-session-log` 守住这个边界。客户端还会按 `seq` 增量消费部分 public events，转成本地 transient notification、action/farm/fence highlight 和 resource animation；首次 snapshot 只初始化 cursor，不回放历史事件。该 cue 层只服务 UI 反馈，不作为规则来源。旧 action-result detail 也通过 `action.detailLogged` 这类公开事件进入 mapper，而不是直接把规则事实写进 `state.log`。`nextEventSeq` 是持久化事件序号游标，`normalizeState` 会丢弃不符合公开事件 envelope/schema/json/size guard 的旧事件并从最大 `seq` 继续。

`farm.animalMoved.newlyPlacedOnFarmyard` 记录待安置动物实际进入实体农场区域的数量。重组提交按区域比较数量，用所有已有区域的减少量抵扣农场区域的增加量，再截断至零；旧动物搬迁优先占用农场增加量，剩余才算新动物。仅存入纯牌上区域或旧动物换区不计。通过 `farmPosition` 绑定动物所有者农场格的 card zone（如 Home Wood、Horse Trough）仍算实体农场区域。它是聚合放置事实，不引入动物个体身份。`addFarmyardSpaceState(..., eventSink)` 将货物的正增量发为到实体田格的 `resource.moved`；逻辑卡牌田仍是独立位置。

每个 public `GameEvent['type']` 都必须列入 `shared/events/event-mapping-policy.ts`。该 policy 记录 Action Log、public notification、board/farm highlight、resource animation 和 replay 是否 mapped、conditionally mapped 或 intentionally silent。`eventsToLogEntries()` 不向 `GameState.log` 写 generic fallback rows；replay-only summaries 保留在客户端 timeline layer。新增 event type 时，同一个 PR 必须同时补 policy、mapper fixtures 和文档。

`buildLogPresentationPlan()` 是 Action Log 展示关系的单一来源：`rows` 表示可见日志，`consumedEvents` 表示已被更丰富日志吸收的事件，`suppressedEvents` 表示按事件自身语义明确不生成 Action Log 行的事件。客户端 timeline 只按这些结构化 event ref 过滤，不得通过玩家名、资源数量、卡牌 id 或跨 archive packet 猜测事件对应关系。纯普通资源的 `futureMeeple.resolved` 由后续 `resource.moved(reason='receive')` 展示实际入账，因此进入 `suppressedEvents`；带房间或 field/stable/forest/moor 独立效果的结算仍保留独立日志。

`publicEventArchive` 是 append-only 的公共事件 archive metadata。`publicEvents.committed` packet 记录每次提交的 public event ids/seqs；`publicEvents.canceled` packet 记录 undo 或 provisional scope rollback 取消的 event ids/seqs 和完整 public event payload，供后续 replay/archive UI 使用。archive 写入会先校验 live archive 的 packetSeq/cursor 不变量，并拒绝 private / malformed / non-json / oversized payload；若异常腐败事件导致 canceled packet 写入失败，runtime cancellation 仍返回，但不会持久化非法 archive payload；若 live archive 不变量已损坏，本次恢复不落地。规则层和卡牌监听仍只读当前 `GameState.events` / 当前 transaction events，不读 archive。

客户端 Action Log 以只读 replay timeline 消费 `publicEventArchive`。UI 用 `publicEventArchive` 加当前 `events` 重建 active、canceled、missing 行；canceled 行保留 canceled packet payload 并用删除线渲染。选择 replay 行只生成带 `replay:` 前缀 id 的本地 notification、highlight 和 resource animation cue，不修改 `GameState`、不发送游戏命令，也不推进 live public-event cursor。

Undo 与 provisional scope rollback 的 runtime `publicEventCancellations` 是同步响应 metadata，不写入 `GameState.events`，也只出现在当前恢复 response。恢复如果移除了已提交 public events，HTTP/WS payload 会带 `publicEventCancellations`，客户端用它清理当前 transient public feedback 并把 public event cursor 对齐到恢复后的 snapshot；普通 reconnect/getState 不重放旧 cancellation。持久化取消历史保存在 `publicEventArchive` 的 `publicEvents.canceled` packet。进入 per-viewer payload 前，runtime cancellation 必须与同一 viewer 的 `publicEventArchive` 使用同一套隐藏事件过滤和 seq remap。

首版只允许 `visibility: 'public'` 的规则事件进入 `GameState.events`。私有 prompt、手牌、draft、living-hand 等 per-recipient 信息不写入公共事件流，仍通过 snapshot/privacy/pending 通道处理。`privateEvents` 是独立的 per-viewer 同步附加层：只描述当前快照中目标玩家可见的私有提示和私有手牌/draft 更新（例如 `private.promptShown`、`private.handChanged`、`private.draftUpdated`），由客户端消费为短暂 UI 通知，不进入公共 replay 事件流，也不作为规则来源。卡牌效果导致的手牌变化通过 runtime-only response buffer 发出 `private.handChanged`，不写入 `ActionExecutionResult`、engine snapshot/history 或 `GameState.events`。

`SerializedGameState` 是 `GameState` 的公共网络与 Replay 形态，其中 `engineStack` 始终为空。`PersistedSessionSnapshot` 分开保存权威 `state`、公共 `frame` 和服务端私有 `sessionCursor`；私有 cursor 包含跨进程恢复所需的 Engine 数据、history 和 provisional continuation 元数据，绝不进入玩家或旁观者 payload。交互请求走独立的 viewer-safe pending 协议，避免其他玩家的 choice 数据泄漏。同步版本号和房间连接 **不进** `GameState`。

### 4.3 PlayerState（按职责分组）

- 身份：`id` / `name` / `color`
- 经营：`resources` / `familySize` / `workersAvailable` / `rooms` / `houseType`
- 农场：`fields`（多堆 `CropStack[]`）/ `roomTiles` / `stableTiles` / `fenceSegments` / `pastures` / FoM `farmTerrain`（top `kind` + optional `covered`）/ `farmyardExtensions` / `farmyardSpaceStates`
- 动物：`houseAnimalType` / `houseAnimalCount` / `stableAnimals` / `newbornCount`
- 出牌：`improvements` / `minorPlayed` / `occupationPlayed`
- 手牌：`minorHand` / `occupationHand`
- 持续效果：`majorEffects` / `activeModifiers`
- Supply token：`supplyTokensConsumed` 记录被永久消耗的 fence / stable 组件；可用上限由 helper 动态计算
- **卡牌局部状态**：`cardStates`（见 §8.3）
- **工人身份**：`workers: Worker[]`，固定 5 槽 id `'1'..'5'`。`isActive` / `isNewborn` 表示永久家庭成员；可选的 `supplyUse` 记录供应人物的预留、待放置或临时放置状态、来源、归还轮次，以及退回供应或永久移除的处置。

`PlayerState.fields` 是 Farmyard Field 的私有存储。卡牌规则使用 §8.5 的 Logical Field 边界；只有几何与版图占位规则才显式请求 Farmyard Field。`Field.stacks: CropStack[]` 的底堆在 `[0]`，顶堆在末尾。

### 4.4 ClientCommand（已收敛）

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
  | { type: 'action'; spaceId }              // 放置工人 / 启动 anytime
  | { type: 'choice'; value; payload? }       // 统一的"选择"命令（含 farm/选格/分支）
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

注意：

- 没有独立的 `reorg` / `feed` / `nextPlayer` / `confirmPlayerSwitch` 命令。这些等待形态全部归并到 `choice` 命令，由 `payload` 携带具体形状（按 `InteractionRequest.kind` 决定）。
- `commitSelection` 只为 farm-position / occupation-hand / resource-quantity / resource-batch-exchange 这类带结构化 payload 的定向选择保留单独入口。farm-position 可通过 `validPositionGroups` 表达服务端校验的合法坐标组合，例如 FoM Farmyard Extension 的相邻二格选择。可选位置还可携带 `sourceCard`、`cardFieldSlot` 与 `groupKey`：选择上限按不同 group 计数，服务端在执行效果前把同组提交规范化为一个位置；前端把卡牌来源的虚拟位置渲染到已打出卡牌的对应槽上，而不扩张农场网格。
- `enableParentCards: true` 启用父母牌；同时传 `draftParents: false` 时直接为每位玩家发一对父母牌，不进入 `parent-selection`。该选择保存在房间元数据中，`newGame` 与后端重启后继续沿用。
- `enableSnakeOpening: true` 启用 Snake Opening（蛇形开局）Game Variant（对齐 BGA "Snake opening"）。协议缺省 `false`，由 Lobby 建房表单缺省勾选；单人局 `createInitialState` 忽略该开关。启用后每名玩家开局 3 食物，`GameState.snakeOpening = { reversed: false }`；第 1 回合工作阶段轮转首次要绕过 `roundFirstPlayerId` 时反转为反向 Round Work Order，追加 `snakeOpening.reversed` 事件，并从刚行动的座位含本人开始反向寻找下一位，直到本回合结束；`continueAfterBeforeWork` 在每次工作阶段开始时重置 `reversed`。房间元数据、`game_results`、`sandbox_settings` 与 `newGame` 按其他变体开关同样持久化。
- Workshop 卡采用**二维状态**（PRD #634，`server/workshop-status.ts`）：review 轴 `unsubmitted / in_review / approved / stale / merged` × 上线轴 `live`。提交审核时 `enterReview` 原子取得唯一 PR URL 绑定，把 PR head 固定为 `review_commit_sha`，并把同一份 Design Draft 固定为 `review_version_id`；同一卡分支只复用仍为 open、非 draft 且 base=`main` 的 PR。已关闭或已合并的 PR 永久保留为历史，重新提交时创建新 PR；open 但 draft 或 base 不再是 `main` 的 PR 会先关闭，再创建合格 PR。绑定完成后立即补查当前 GraphQL 快照，覆盖审批 webhook 先于本地绑定到达的竞态；补查暂时失败仍保留成功绑定并清空同步时间，作者可通过 `refresh-pr-status` 立即重试同一套协调。GraphQL 快照中的有效 approved review 必须匹配当前 head 且 reviewer 可 push；若 PR 的 `authorAssociation=OWNER` 且没有 `CHANGES_REQUESTED`，provider 生成绑定同一 head 的 owner approval，因为 GitHub 不允许 PR 作者 self-approve。两者都由 `approveReviewedVersion` 把固定版本置为 `approved_version_id`。作者 publish 时再次即时查询 GraphQL，并要求 head SHA、review SHA、`approved_commit_sha` 及固定版本映射全部一致后才置 live。GitHub 当前 head 不同、PR 关闭/转 draft/改离 `main`、有效审批被 dismissed 或 `CHANGES_REQUESTED` 都转为 `stale·offline`；可能乱序的 `synchronize`、dismissed 和资格变更事件先重读当前 GraphQL 快照，已 merge PR 的迟到 review 事件保留同 head 绑定，comment-only review 保持原状态。未绑定或绑定歧义的 Workshop PR 事件不请求 GitHub；异步快照只在查询前后的 review binding（含 lifecycle 与单调更新时间）未变时事务提交，publish 同样要求查询前后的 live-state token 未变；GraphQL 不可用时记录 delivery 并保守转为 `stale·offline`。delivery id 由 `github_webhook_events` 幂等去重；webhook 只负责失效与推进，publish 定论不依赖缓存。旧单列 `status`（draft/published）已由 migration v26 移除，存量卡一刀切回 `unsubmitted·offline`（#632）。
- `customCardIds` 只有在真实房间同时传入 `enableCommunityDeck: true` 时才会生效；未启用时服务端忽略这些 id，且房间不保存对应自定义卡元数据。启用后仍只接受 **live（approved 且已上线）** 的 workshop 卡，运行的是被审的 `approved_version_id` 快照（`loadLiveDraft`）；未过审卡的自定义代码只能在 workshop sandbox（`POST /api/game/new-sandbox` + 浏览器本地 executor）里由作者本人试玩，绝不进实时同步主链路。真实房间创建（`createRoom`）与房间恢复（`loadCustomCardsFromDb`）都走 `loadCustomCards(..., { liveOnly: true })`，加载时按 id 逐个裁定：
  - 请求者**自己**的非 live 卡 → 置 `hasNotLive`，`handleCreateRoom` 直接报错拒绝建房（引导作者走 review → publish）。
  - 其余无法加载的 id（**他人**的非 live 卡、未认证请求、id 不存在）→ 静默从卡池过滤，房间仍照常创建，只是不含这些卡。之所以不对他人卡报错，是为了不泄露"某 id 是否为某人草稿卡"的存在性。
  - 无论哪种情形，未过审代码都不会被加载进 `GameSession` 的 executor——安全边界一致，差异仅在给作者本人的错误反馈。
- 旧的 replay-snapshot 同意往返（`confirmReplayCardSnapshotPublic` / `REPLAY_CARD_SNAPSHOT_CONSENT_REQUIRED`）已移除——非 live 卡不再进真实房间，该机制失去存在理由。
- 毕业切轨（#642）：review PR 合入 `main`（webhook `closed+merged` 且 base=`main`）→ 卡转 `merged` 终态（工坊只读，`unpublish`/编辑均拒绝）；改离 `main` 后 merge 不毕业，视同未 merge 关闭转 `stale·offline`。merge 事件先于审批到达时持久化 merge 事实（`github_pr_status='merged'`），审批 webhook 或 `refresh-pr-status` 读到 approved MERGED 快照（head 在 merge 后冻结、SHA 绑定仍可验）时补毕业并即时对账 built_in。live 的 merged 卡在发版空窗期继续供给被审快照，服务启动时对照内置注册表（`markBuiltInMergedCards`）置 `built_in=1` 后由内置卡定义接管、工坊快照退役。
- 下架双轨（#631/#641）：作者 `unpublish` 温和（存量对局用嵌入快照跑完，仅挡新房间）；管理员 `POST /api/admin/cards/:id/takedown` 为 kill switch——强制卡 `stale·offline` 并经 `lobby.endRoomsUsingCard` 终止所有嵌入该卡的进行中房间（广播 `roomDissolved reason:'card_takedown'`，对局不计分、不产 completed replay，半截录制行被清除）。GitHub review dismissed 不自动杀局，只走温和失效。

### 4.5 ServerEvent / StateUpdateEnvelope

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
  version: number             // 单调递增
  sync: 'snapshot'            // 当前只走全量快照
  cause: StateUpdateCause     // 'action'|'choice'|'anytime'|'reorg'|'feed'|'undo'|'dev'|'reconnect'|'draftSubmit'
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
  cardWarnings?: string[]          // 仅 HTTP debug/sandbox
  customCardDefs?: CustomCardDef[]
}
```

**广播 vs 单播**：`stateUpdate` / `roomWaiting` / `gameStarted` / `playerJoined` / `playerDisconnected` / `roomDissolved` 广播；`roomCreated` / `roomJoined` / `authOk` / 请求级 `error` 单播。WS 广播会按连接对应的 `viewerPlayerId` 构造 per-viewer payload：目标玩家收到真实私有 prompt 和 `privateEvents`，其他玩家收到 `private-prompt` redaction。HTTP sandbox 默认无 `X-Viewer-Player` 时保持未过滤多座位开发流；带 `X-Viewer-Player` 时使用同一套 viewer 过滤和 seat guard。`cardWarnings` 只进入 HTTP debug/sandbox payload，用于把该局运行期自定义卡异常送回工坊确认门禁，不向 WS viewer 广播。

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
takeAction | resolveChoice | commitSelection | takeAnytimeAction | undoStep | undoAction
```

注意 WS 协议名（`ClientCommand.type`）与 `InteractionCommand` 不完全同名：前端"现在能做什么"以 `allowedCommands` 为准；线上 WS 命令名归一到 `choice` / `commitSelection` / `action` 等。

`shared/session/interaction-state-adapter.ts` 是 `InteractionState` 的服务端投影边界。`GameCore.buildInteraction()` 只传入当前 `GameState` / `EngineStack`、anytime/undo/score 快照和一个 `projectPendingRequest(PendingInteractionProjectionInput)`；具体 animal-reorg zone、farm-select、selection payload 的构造被收敛在该 projection request builder 后面，不作为多个闭包散落到 adapter 输入。viewer redaction (`redactInteractionForViewer`) 消费已经派生好的 `InteractionState`，不参与 pending/request 派生。

当私有选择围绕接收者手牌中已可见的某张牌时，生产方可以设置 `promptParams.cardId`。Interaction Presentation 会把该牌名本地化到提示文案中，并高亮对应手牌；非接收者只收到不含 `promptParams` 的 `private-prompt`。

原生卡牌效果可实现 `CardEffect.projectInteractionRequest(state, player, request, actionId)`，派生当前选项可用性或资源数量上限。回调是仅作用于本卡 pending action 的纯查询，必须保留提示元数据、已接受决策、缓存的随机观察与执行进度。Session 在展示、权威命令及单选推进前，按有效 pending owner（含跨玩家响应）刷新活动 pending request 及其 choices；提交校验、嵌套 anytime 返回、撤销与存档恢复使用同一刷新结果。投影不得重跑行动执行、支付、抽牌、日志或未来必需流程；各卡保留已有的隐藏/禁用选项及自动推进策略。

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

`descriptionPreview` 是 递归 ActionFlow 描述：leaf 使用 `ActionDefinition.nameKey` + leaf `effectPreview`，组合节点按类型拼接子描述（`SeqNode: ', '` / `XorNode: ' / '` / `OrNode: ' + '` / `ParallelNode: ' | '`）。前端优先渲染 `descriptionPreview`，这样普通 leaf、pay/gain 组合、嵌套 XOR/SEQ 都由引擎自动生成 option 文案。`pay-gain-node` 等通用 helper **不再**为机械 pay/gain 默认塞 `choiceLabelKey: 'ui.interactionResourceExchange'`；选项可见文案以 `descriptionPreview`（及 `effectPreview`）为准。`choiceLabelKey` / `choiceLabelParams` 仅用于**语义覆盖**（例如字段/数量选择、`ui.interactionUseCard`、`ui.interactionSeedResearcher` 等），不要为纯资源交换重复 i18n。`special-effect` 根据 `params.kind` 提供自己的语义描述，避免把内部状态同步暴露成泛化的 “Card Effect”；纯展示同步如 `set-infobox` 不进入描述。

### 4.8 LogEntry

`LogEntry { key, params, playerId? }` —— 结构化 i18n key + 渲染参数。前端按 locale 渲染；新局 bootstrap 日志可携带稳定 `playerId`，WS 应用席位显示名时按身份刷新缓存，不按可能重复的显示文本匹配。

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

**架构决策（2026-05-13）：领域层 `ActionFlow` 对齐 the reference node algebra，只保留 `leaf / seq / parallel / xor / or`。** `optional`、`promptKey`、`sourceCard`、`choiceLabel*`、`targetPlayerId` 是节点 metadata，不是新的领域节点类型。卡牌和 listener 只能构造这个小集合；新规则不应向 `ActionFlow` 暴露 runtime-only node。

**架构决策（2026-05-14）：runtime engine tree 也收敛到五种具体 node：`ActionNode / SequenceNode / ParallelNode / XorNode / OrNode`。** 跨玩家 owner、optional、trigger selection、listener activation、pending 都不再由额外 wrapper node 表达，而是由 node metadata、internal action leaf、pending envelope 和 frame state 表达。

`targetPlayerId` 表示"这个普通 flow node 在另一个玩家视角下执行"。编译到 runtime engine 时，它会转成目标 subtree 的 `ownerPlayerId` metadata；child 如果显式带自己的 owner，则保留 child owner。Session 顶层 flow builder 和动态插入路径（hook / listener / action `result.flow` / resolveChoice follow-up）都必须带上当前 effective owner，让后续 sibling 能回到 frame/ancestor owner。cursor restore 持久化 node owner metadata，不依赖全局 `currentPlayerIndex` 重新推断 owner。

当前 runtime node 类型：

- `ActionNode`：参考实现 `LeafNode(action)` 等价物；以 `actionId` + `params` 调 `ActionDefinition.execute`。
- `SequenceNode` / `ParallelNode` / `OrNode` / `XorNode`：组合节点，对应 参考实现 `SEQ` / `PARALLEL` / `OR` / `XOR`。`XorNode` 在玩家选择复合分支后记录 `selectedChildId`，后续 traversal 只推进该分支直到完成，避免 `xor(seq(...))` 在第一个 leaf 成功后提前结束。`ParallelNode(mode='trigger-select')` 承接 参考实现 `NODE_PARALLEL` 风格的多 reaction select/pass/mandatory 语义，用于 action listener、阶段 card-effect activation 和 extra-turn provider selection。

共享 runtime metadata：

- `ownerPlayerId`：跨玩家执行 owner；继承自 ancestor/frame，child explicit owner 优先。
- `optional` / `optionalActive` / `optionalPromptKey`：optional accept/skip 状态；`xor` / `or` 保留直接 `__skip__` 选项。
- `mandatory`：已选择 / 已接受的强制 continuation 会同时标记 host node 和 descendant `ActionNode`；internal `afterHostCommit` child，以及 mandatory node 动态返回或注入的每层 flow，都会递归继承该标记。后续 leaf 不可执行时返回 mandatory blocked，session 转成 `engine-blocked`（undo-only），不能静默完成部分 continuation。
- `selectedChildId`：`XorNode` 和 trigger-select `ParallelNode` 的运行态选择指针，会进入 cursor restore；用于让已选择的 composite branch / provider flow 在 pending、undo、WS restore 后继续从同一分支推进。
- `resolveAfterSelection`：trigger-select 的 one-shot 变体，选中的 child 执行完后直接 resolve parent；用于 extra-turn provider selection，避免选择一个 provider 后继续展示同层其他 provider。
- `pending: PendingEnvelope | null`：等待输入的数据 envelope。`InteractionRequest` 是 WS/session protocol，不是 tree node。leaf request、`xor` / `or`、optional、trigger-select parallel 和 synthetic confirm/feed/farm-select 都通过 pending envelope 暂停并 cursor-restore。

listener activation 是 internal action leaf：`ActionNode(actionId='activate-card')`，params 携 `{ listenerId, cardId, phase, actionId, event, ownerPlayerId, ownerCardZone, triggerPlayerId }`。`event` 保留触发 action 的 `actionContext`（包括 `targetSpaceId`），activation 执行时用该 context 解析 listener 的真实 `space`。它 bypass 普通 public action pipeline，只执行 listener body 并把返回 flow / follow-up actions 插入 engine。

`BaseNode` 提供共享 metadata / pending / cursor round-trip；具体 traversal 由 `EngineTree` 和五种 node 实现。

### 5.3 Engine 公共 API

`Engine` class 暴露给 `GameCore` 的接口（小集合）：

- `step(ctx)` —— 推进到下一个 unresolved 节点；遇到 node pending 暂停，返回 envelope。
- `resolveChoice(value, ctx, payload?)` —— 提供玩家选择，继续推进。
- `peekPendingEnvelope()` —— 返回当前等待的 `PendingEnvelope`（或 null）。
- `peekPendingHost()` —— 返回托管该 pending envelope 的 node（用于 sourceCard / actionContext / owner 反查）。
- `injectBeforeFlows(flows, ctx?)` —— hook 注入子流程。
- `snapshot()` / `restore(snapshot)` —— 序列化与重建节点树（含 `nodeStates`、pending envelope、owner/optional/trigger metadata）。
- `hasPendingChoiceCompositeAncestor()` —— 用于 anytime 判断是否处在分支祖先内。

卡牌提供的 anytime 入口在共享列表构建处使用 `evaluateFlowDoable()`；命令校验及收获 / 计分前窗口读取同一列表。探测只忽略根节点的 optional 标记，使用新 flow 自己的来源、参数和行动上下文。准入仍只检查当前步骤，保留合法 before / replacement，以及先获得资源再支付后续费用的路径。带记账前缀的复合 flow 仍保留已有卡牌前置检查。不可用的直接调用在修改 history 或引擎前拒绝。从空闲状态发起或注入等待中引擎的已接受 anytime flow 及其必需后续节点都带 mandatory 义务；失败时保留被中断的宿主（如有），使用已有 blocked / 显式 undo 规则。内部 optional 选择仍可跳过。监听器、行动、替换及选择动态返回的 flow 和 follow-up action 会继承父上下文的 injected-anytime 来源标记，不继承 completion 标记或无关行动参数。Listener activation event 除来源和行动上下文外也保留宿主行动参数，确保触发器预览和执行使用与准入一致的翻修目标。

如果接受某个 anytime 会消耗持有者当前工作阶段的回合，而不是插入另一个行动，该 listener 必须声明 `replacesTurn: true`。这种入口只在工作阶段的 idle 交互中提供；Session 在注入 flow 前建立普通 Turn Scope 与行动快照，结算完成后沿用人员行动相同的回合结束 hook 和玩家轮转。活动行动、阶段 flow 或嵌套 anytime 窗口内不得提供回合替代。E062 Sour Dough 是参考实现。

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

`EngineStackCursor` 序列化到 `PersistedSessionSnapshot.sessionCursor.engineStackCursor`。恢复路径为 `engine.snapshot()` → 各 concrete node cursor restore 重建节点树并定位 pending host / traversal state；公共和 Replay 使用的 `SerializedGameState.engineStack` 始终为空。

收获后窗口在 `SubFlowReason` 和 `PendingSyntheticKind` 中都使用 `post-reap-anytime`，因此 Session 能区分它的根 choice 与嵌套卡牌 choice，而不需要单卡分支。

`SubFlowKind` ∈ { `choice` / `animal-reorg` / `confirm-next-player` / `confirm-player-switch` / `feed` / `farm-select` / `selection` / `card-draft` }。

---

## 6. shared/session/ — 会话层

### 6.1 文件清单

```
shared/session/
├── session-core.ts        GameCore（命令执行入口）
├── serialization.ts       SerializedGameState 序列化
├── state-bootstrap.ts     初始 state 构造
├── stats.ts               统计/日志
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

`shared/session/phases/` 是按阶段拆分的纯函数集合（`startBreedPhase` / `continueAfterFeed` / `startNewRound` 等），不是 mixin / trait class。逻辑都在 `GameCore` 主 class 上汇合。

### 6.2 GameCore 入口

`GameCore` 持有：

- `state: GameState`
- `engineStack: EngineStack`
- 历史栈（步级 history + 行动起点 `actionStartSnapshot`）
- 终局计分缓存

命令方法（被 `GameSession` / `authoritative-session.ts` 包装后导出给 server）：

```
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

`GameCore` 是领域引擎；`GameSession`（`server/game/authoritative-session.ts`）是薄包装，只注入隔离的自定义卡执行器，并生成按 viewer 裁剪或 debug 模式的同步 payload。连接、广播与持久化由 `server/connection/` 和 `server/game/` 管理。

### 6.3 统一返回 SessionResponse

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

单测直接断言该结构；WS 由 `GameSession.buildSyncPayload()` 序列化并按 viewer 裁剪后广播。`InteractionState` 是前端交互真相。

---

### 6.4 round.ts 额外回合轮转扩展点（contributeExtraTurn / hasPendingExtraTurn）

A092_AdoptiveParents 引入轮转层额外回合机制（#203+#204）。provider 默认在普通工人耗尽后生效；声明 `extraTurnBeforeWorkers: true` 的 provider 也能在正常轮转中与普通放人并列选择。完成任一选择都只占一次 turn，随后轮到下一位有资格的玩家。

- `contributeExtraTurn?: (state, player) => ActionFlow | void`：`CardEffect` 上的 hook，可用时返回本卡 provider 的 ActionFlow，否则 `void`。它**不**经 `runCardEffectHook` 自动执行，而是被 `shared/session/phases/round.ts` 的轮转 gating **主动消费**。
- `collectExtraTurnContributions(state, player)` 是单一真相源：同一轮转点枚举所有 provider，`hasPendingExtraTurn(state, player)` 只判断是否存在 provider，`collectExtraTurnFlow(state, player)` 把 provider 编译成真实交互。单 provider 直接展开，多个 provider 进入 one-shot `ParallelNode(mode='trigger-select')`，每个 child 是 internal `activate-extra-turn` leaf；玩家先选来源卡，选中后才展开该卡自己的 flow。provider flow 可以继续包含 `xor(seq(...))` 这类嵌套交互，选中分支必须完整 drain 后才算 provider 完成。
- 多次机会卡可配内部 adjunct `countExtraTurns`，让 mandatory skip-turn / forced consume 只消费一个 extra-turn opportunity。剩余机会按来源卡计算：`_extraTurnSkipCountsByCard` 和 `_extraTurnConsumedCountsByCard` 记录每张卡已跳过 / 已强制消费次数；`countPendingExtraTurns(state, player)` 与 `consumePendingExtraTurns(state, player)` 复用 provider 聚合，不再使用玩家级全局 counter。无交互 skip fallback 只在必须自动前进时按稳定卡牌顺序消费一个 source。
- round.ts 三处 gating：选下一活跃玩家（`workersAvailable(state, p) > 0 || hasPendingExtraTurn(state, p)`，`nextSeatedPlayerIdx`）、round-work 完成谓词（全员 `workersAvailable <= 0 && !hasPendingExtraTurn`，`roundWorkComplete`）、轮转 skip 循环（0-worker 玩家若 `hasPendingExtraTurn` 则停轮以便注入 flow）。都把"有 pending extra turn"的玩家视为仍有资格、不提前跳过。
- `startPendingExtraTurnIfAny(core)` 是唯一注入入口，由 work 阶段开始、确认下一玩家、载入状态和撤销恢复共用；仅在当前座位的 engine stack 为空时注入。有普通工人时，符合条件的 provider 与普通放人、合法 Moor 特别行动并列；没有普通工人时沿用单 provider 或一次性来源选择。供应机会只有在普通工人耗尽后才能放弃；选择普通放人保留后续机会，但要求本轮首个回合的卡除外。此类卡通过既有 `onEndTurn` hook 消耗资格，包括没有放置人物的 Moor 特别行动。
- A92 provider 表现为 XOR[use, forfeit]；选择 Forfeit 即退出本轮后续，仍使用原有 newborn 生命周期。M057 选中后进入 Moor 特别行动卡牌与版图选择 flow，保留普通特别行动的 before / after listener。

`skipTurn`（例如 D134_OysterEater 返回 `{ skipTurn: true }`）在 turn 开始前跳过当前玩家；`contributeExtraTurn` 让仍有机会的 provider 留在轮转中，`extraTurnBeforeWorkers` 允许在普通工人耗尽前选择。术语见 `CONTEXT.md` 的 *Extra Turn / Forfeit*。

供应放置通过 `place-farmer` 的 `actionContext.workerSource: { kind: 'supply', disposition, workerId? }` 声明。执行时先锁定一个有限人物 ID，再展示目标；提交、目标行动、事件、联动占位、移动和撤销始终沿用该 ID。目标行动使用正常行动语义并计入放人统计；卡牌放置在既有 Turn Scope 中记录人物行动身份，使回合结束 hook 收到与普通放人相同的 trigger。

卡牌只使用行动格而不放置人物时，通过 `place-farmer` 携带 `actionContext.viaCardJump: true`、`targetSpaceId` 且不提供 `workerId`。这个 worker-less 分支不要求或修改人物，不产生 `worker.placed`，也不增加放人统计。卡牌必须先用 `isActionDoableInFlowContext()` 校验目标；执行阶段再展开目标行动的普通 flow，使 replacement、费用、listener 和提交校验保持权威。A151 Minstrel 在普通人物全部放出后的归家阶段使用该路径。

`inactiveWorkersInSupply()` 排除预留、待放置、临时人物和已永久移除的组件。`availableWorkers()` 包含被召回版图外的临时人物，但家庭人数、住房、喂养和人物分仍只读取永久成员。`returnSupplyWorkers()` 在全部 `onBeforeReturnHome` 之后、`onStartReturnHome` 之前清理同一 ID 的所有位置，并执行原处置；召回和移动不改变该处置。已归还的人物立即可用于增员；没有到期归还轮次的预留跨归家保留，由卡牌在指定时机释放或解锁。清理前，`recordReturnHomePlacements()` 将全部归家前移动结束后的最终版图位置存入既有的玩家 `__roundPlacement__` 记录。归家占位效果通过 `getReturnHomePlacements()` 读取该快照，不再读取实时占位；已归还的供应人物仍被计入，刚清空的格子也不会错误产生归家机会。每条记录保留供应人物的处置：占位判断仍包含已移除人物的历史位置，而 `getReturningPersonPlacements()` 排除合成占位及 `remove-from-game`。Swimming Class、Curator、Seed Researcher、Night-School Student 使用归还人物视图；Turnip Farmer、Minstrel、Bohemian、Food Distributor 使用归家开始时的占位。快照随 pending 序列化和 undo 恢复，由 `resetRoundPlacements()` 在下一轮清除；实时 WorkerRef 仍是放置真源。Curator 按不同归家人物 ID 计数，并通过 `gainPerRound` 识别已取空的累积格。既有 blocked / anytime / undo 与 Protected Observation 边界保持不变。

已确认的供应人物模型区分预留与放置机会。D022 在目标轮的 `onBeforeStartOfTurn` 释放预留 ID，早于未来资源结算和全部 `onRoundStart` 效果；使用 D022 前，增员或另一供应效果可以先消耗该人物。D022 实际使用时需要重新找到可用供应人物并锁定其 ID。将原人物一直预留到使用或拒绝，会违反已接受规则和最后一个人物的 Session 回归。

供应机会沿用其他强制流程的当前步骤准入，不保证前面的支付或效果完成后仍有合法目标：E022 接受使用后若无合法目标，已扣卡上粮、使用标记和待放人物保留在 `engine-blocked`，直到显式 undo 恢复。B022 唯一供应人物被另一张卡预留时，同样沿用强制 blocked / undo 边界；不能跳过放置义务来保留打牌获得的两食物。不为这些 provider 增加后续目标预检或自动退款。普通抽牌选择未完成时禁止注入额外回合；最后一次选牌完成后恢复机会菜单。依据：[已确认模型](https://github.com/titanxxh/open-agricola/issues/841#issuecomment-5582219668)和 [Session 验收方案](https://github.com/titanxxh/open-agricola/issues/842#issuecomment-5582333821)。

### 6.5 回合作用域与行动执行作用域

轮转机会、Turn Scope 和行动执行作用域是三种独立的生命周期。卡面写“在你的回合”或“同一回合”的卡牌读取 Turn Scope；判断实际建造、耕地、播种或其他变化的卡牌读取当前行动作用域或 transaction 结果。

| 规则情形 | 轮转机会 | Turn Scope | 行动执行作用域 |
|---|---|---|---|
| 轮转选中的普通放工或沼泽特殊行动 | 消耗当前机会 | 新建作用域 | 每个完整 Rule Action 新建一个作用域 |
| 卡牌贡献的 Extra Turn | 新增一次机会 | 新建作用域 | 每个完整 Rule Action 新建一个作用域 |
| D051 Archway，或 E010 Straw Hat 移动的每个 worker | 不新增机会 | 每个移动的 worker 新建作用域 | 每个完整 Rule Action 新建一个作用域 |
| 仍属于当前 Turn 的立即 Rule Action | 不新增机会 | 沿用当前作用域 | 新建作用域 |
| 不算 Turn 的阶段或 anytime Rule Action，例如 Iron Hoe | 不新增机会 | 无 | 新建作用域 |
| 单独的 gain、payment、choice 或 listener activation | 不新增机会 | 若存在则沿用作用域 | 不新建作用域，留在外围作用域内 |

Turn Scope 在人员放置、沼泽特殊行动或等价的卡牌行动格使用开始前建立，并持续覆盖该 Turn 的全部 Rule Action、后置效果、必要的动物重整与回合结束 hook，随后清除。D051 Archway 和 E010 Straw Hat 的每次移动都会把普通人员行动的触发身份传给这些回合结束 hook。D051 在目标行动格及其 hook 完整结算后关闭 Turn Scope；E010 在开始下一个 worker 的选择前关闭上一个 Turn Scope。idle 或后续阶段流程绝不能读到已完成 Turn 遗留的身份或起点快照。

行动执行作用域在单个 Rule Action 的生命周期开始前建立，并持续覆盖它的 pending 选择、continuation、listener 和后置效果。同一 Turn 内的多个 Rule Action 使用不同的行动作用域，但共用 Turn Scope。按行动计算 delta 的消费者读取 action transaction，而不是 Turn 起点快照。

`actionContext.trueAction` 与这三种生命周期相互独立。它只表示某个效果是否算作执行其命名行动，供 action listener 判断；它既不创建 Turn，也不能替代行动执行作用域。一次免费建造可以使用 `trueAction: false`，同时仍把实际建造 delta 暴露给通用的“当你建造时”规则。

## 7. shared/actions/ — 行动定义与 Hook 系统

### 7.1 目录

```
shared/actions/
├── index.ts               actionDefinitionLookup Map（27 base + internal 共发现）
├── flow.ts                ActionFlow 节点表达式（leaf / seq / parallel / xor / or + optional metadata）
├── hooks.ts               Hook 注册 + 调度
├── hook-matrix.ts         buildHookMatrix() 优化矩阵
├── internal-actions.ts    引擎内部辅助 action（mark-card-trigger 等）
├── effects/               base action 实现（一文件一 action）
│   └── internal/          内部 effect
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
  rulesKey?: string
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

`descriptionKey` 保留行动格印刷文本。可选的 `rulesKey` 指向独立本地化的补充裁定或实现限制，不影响行动合法性或执行。

Hook 不进 `ActionDefinition`，由 `hooks.ts` 显式注册（卡牌文件内部）。

`getBaseChoiceOptions` opt-in 选项流：base + `computeChoiceCandidates` 注入 → 按 `value` 去重 → `costPreview.canExecute` 过滤 → 0 候选 fail / 1 直跳 `resolveChoice` / ≥2 标准 prompt。当前消费者：`renovate-house` + `A087_Conservator`。与传统 `execute()→choice→computeArgs.extraOptions` 路径互斥。`renovate-house` 的 card-authored exact/free cost 通过 `actionContext.exactCost` 表达，和 construct / stables / plow 的 参考实现 `formatCost` 语义一致。 普通叶子和 OR/XOR 内选中的叶子共用此管线，包括按 selectedOption 重算费用；Silage 的粮食来源选择也复用该入口。

### 7.3 effects/ 自动发现

`scripts/check-effects-file-list.ts` 是 top-level production effects allow-list 的单一来源；`shared/actions/effects/__tests__/architecture-guard.test.ts` 复用它，并继续守住 action id allow-list。`shared/actions/index.ts` 只导入 top-level base effects 和 `effects/internal/` 内部 effects，构建 `actionDefinitionLookup`。**禁止新增 top-level effect 文件来堆叠多卡逻辑**；需要 host action 子步骤时使用 `internalChildren` 或把内部 effect 放在 `shared/actions/effects/internal/`，纯 helper 放在 `shared/actions/helpers/`。

`collect` 是 accumulation-space partial-take 的统一入口，接受可选 `actionContext: { spaceId?, resource?, amount? }`。`spaceId` 用于指向非当前 action space（卡牌效果触发的偷取场景）；`resource` + `amount` 用于 partial-take（不全取空一格）。旧的 `take-from-space` internal action 已删除并迁移到 `collect`，相关 i18n key 一并清理。卡牌提供的行动格如果本身是累积格，必须声明 `gainPerRound`，把累积资源存入 `ActionSpace.resources`，并使用标准 `collect` flow，使 collect listener 与事件语义保持一致。

`place-farmer-on-space` 是指定目标额外放人的 internal action。它从当前 owner 家里取可用工人放到 `params.spaceId`，然后默认返回目标 action 的 `expandFlow` leaf；`params.allowOccupied` 只跳过 occupied 检查，不跳过 linked block / round availability / action executability / worker supply。需要 piggyback 或固定目标连锁放人的卡牌应使用该 internal action，不要在 listener handler 内直接改 `ActionSpace.takenBy`。

`pass-minor-card-to-left` 是跨玩家传递已打出小改良的 internal action。它从当前玩家的 `minorPlayed` / `improvements` 移除目标卡，清理该卡在原玩家的 `cardStates`，把卡加入左手玩家 `minorHand`，发送 `card.passed` public event 和目标玩家私有 `cardEffectHandChanged`；后续触发条件应消费 `card.passed` provenance，不直接扫描手牌差异。

额外加作物的 follow-up selection 通过 `actionContext.extraCropPlacement` 表达 provenance；pending / anytime 构造必须从 `contextSnapshot.actionContext` 传递该 marker，后续卡牌只读语义 marker，不判断创建 pending 的 sourceCard id。

`gain` 先解析所有接收者。由付款方出资时，必须足额支付单人数量乘以接收人数；失败不改变任一方资源，事件来源保留付款方。其余来源先取显式 `actionContext.sourceLocation`，卡牌发放保留卡牌来源，普通行动格发放标记行动格。`return-to-space` 可通过 `actionContext.targetSpaceId` 指定其他实时行动格；付款及移动事件使用同一目标。

职业可用性、选择提交及直接／免费打出统一调用卡牌前置检查。改善费用预览和付款一致地使用授予者 `sourceCard` 或实体行动格 ID 作为 `actionCardId`；私有手牌展示仅使用真实 source card。卡内折扣由此可辨别行动来源，同时不会把行动格 ID 当作私有卡牌。

### 7.4 payment/

`shared/actions/payment/`：

- `solver.ts` —— 生产支付生命周期和支付相关 facade 入口：计算可支付方案、判断可支付性、构造支付选择、解析玩家选择、执行支付并返回结构化 receipt；preview-cost、typed-flat、room payment、simple resource/trade side effect、card cost candidate helper 也从这里进入。
- `internal/enumerate.ts` —— `computeAllBuyableCombinations` / `keepOnlyOptimals`（资源可行性过滤后的严格支配剪枝；豁免 feeIdentity / 有状态副作用的 bonus choice / card 支付；卡牌提供的支付资源按自身 key 参与比较，ADR 0004 Amendment）/ `sortPaymentSolutions`
- `internal/execute.ts` —— `payResources` / `executePaymentSolution`
- `internal/cost-modifiers.ts` / `internal/preview-cost.ts` —— `computeCosts` hook 集成与 card-purchase cost preview glue
- `internal/room-payment.ts` / `internal/typed-flat.ts` —— 房间 / typed flat cost 兼容 helper
- `internal/cache.ts` —— solution cache

生产 effect / helper / card runtime 默认通过 `PaymentSolver` 进入支付生命周期或支付相关 facade；外部测试使用 `PaymentSolver` 或 `shared/actions/payment/__tests__/test-helpers.ts`，只有 `shared/actions/payment/internal/__tests__` 保留算法白盒测试；`payment/internal/*` 只供 payment package 内部和算法聚焦测试使用，边界测试禁止生产代码和非 payment 内部测试直接 import。卡牌购买费用走 `computeCosts` phase + `actions: ['improvement']` 区分行动空间费用 vs 卡牌购买费用。

**统一 cost 模型（`ComplexCost`）**：construct / renovation / fencing / plow / occupation / minor / major / pay leaf 全部走同一条 `computeAllBuyableCombinations` 管线。`ComplexCost` 字段语义：

- `fees: Partial<Resource>[]` —— per-action 总固定费用。`computeCosts` 返回的 raw `costs` 总成本 delta 写入 `fees[0]`；有来源的 参考实现 `addBonus` / `addBonusChoices` 优先表达为 `bonuses`，有来源且保留原始候选的 参考实现 `addCost` 优先表达为 `trades`。负值在 `enumerate` 内部 `mergeResources(fees[0], unitFee*nb)` 后 clamp 到 0，避免对 unrelated resource 退款。
- `unitFee: Partial<Resource>` + `nb: number` —— per-unit × 数量。Construct 的每间房 `{wood: rooms_cost, reed: 1_per_pile_or_room}`、renovation 的 `{[material]: 1}`、fencing 的 `{wood: 1}` 都落在 `unitFee`，`nb` 是行动同时处理的单位数（建房间数 / fence 段数）。enumerate 先对每个 unit cost row 生成有序替换后的可选行，再组合成总成本。
- typed flat fencing / stables 支付若传入单一 `{fee:{wood:N}}`，enumerate 会在套用 costType modifiers 前规范化为单位成本：fencing 为 `{unitFee:{wood:1}, nb:N}`，stables 为 `{fee:{wood:N%2}, unitFee:{wood:2}, nb:floor(N/2)}`。stable farm-choice 的可支付性和结算会保留 `{unitFee, nb}`，再追加 payload-aware `computeCosts` trades、bonuses 和 providers。这样 A16/C56 这类参考实现 `addCost` per-unit alternative 仍能先生成 cost row，再被 D88 这类 bonus choice 继续替换。
- `trades: Trade[]` —— 资源替换选项（`from → to`），由 `TradeModifier` 或 `computeCosts` listener 注入。`Trade.scope: 'action' | 'unit'` 控制替换位置：scope:'action' 在玩家资源池上做 per-action 转换；scope:'unit' 经候选闭包作用在每个 unit cost row 上（无顺序字段，可达行集合与 trade 注册顺序无关）。`minCost` / `maxCost` 限定可替换的 cost row，`replaceUpTo` 替换不超过声明目标的当前可用量，`groupMin` / `groupMax` 限定所有 row 合计使用次数。每个 unit-scoped `TradeUsage` 会保留实际移除和加入的资源，使部分 `replaceUpTo` 的费用归因精确反映实际值。`from:{}` + `to:{resource:n}` 表达保留原始行并追加 sourced 折扣候选；C88 用相等的 group bounds 强制恰好折扣对应数量的 stable row。
- `bonuses: Bonus[]` —— per-action 折扣 / 多选折扣（`{discount}` 单一折扣；`{choices: BonusChoice[]}` 多选）。`Bonus.optional` 决定 enumerate 是否生成"不应用 bonus"分支。
- `CostResourceRemovalModifier` —— `type:'remove-resource'` 在枚举前从 `fee` / `fees` / `unitFee` 结构化删除指定资源键，并在 `costResourceRemovals` 保留约束来源和各费用路径的实际减免量；用于 C014 这类“不再需要某资源”的规则。该约束会在每次后置 bonus 后再次应用，因此 E123 不能使用已删除费用，D013 等成本 bonus 也不能把该资源重新加入；最终减免通过 `PaymentSolution.bonusReductions` 写入 Cost Attribution。
- `paymentResourceProviders` —— 卡牌 / hook 提供的虚拟支付资源。provider 在卡牌内部声明稳定 key、可用量、可覆盖的真实成本资源以及执行时的消费来源；它不写入 `fee` / `fees` / `PlayerState.resources`，只在 `PaymentSolution.resourcesPaid` 中以自身 key 出现，并由 executor 消耗来源状态。
- `paymentBudget` —— 对最终 `PaymentSolution.resourcesPaid` 的资源上限过滤。它不提供资源、不改变成本候选，也不提前限制几何/单位数量；必须在 trades / bonuses / paymentResourceProviders / cards 都生成最终支付方案后检查。
- `minimumResourcesPaid`：最终 `PaymentSolution.resourcesPaid` 的下限，在替代支付、折扣之后、最优方案裁剪之前校验。改善流程通过 `actionContext.minimumResourcesPaid` 传入；候选准入和支付子节点复用同一个受约束预览。
- `resourceReserve` —— 支付后声明的资源池总量必须至少保留指定数量。它只过滤最终支付方案，不改变成本候选或支付执行。
- `Bonus.capDiscountAtCost` —— 把可变折扣封顶到当前正费用，但仍是后置 bonus；“不再需要某资源”必须使用 `CostResourceRemovalModifier`，不能用任意大 capped discount 模拟。普通 bonus choice 必须能完整应用折扣，不能靠 clamp 产生 no-op 或部分折扣。
- `Bonus.trackChoiceIndex` —— 默认记录 multi-choice 的 `bonusChoiceIndex`，表示玩家选了第几个 choice；它本身不是 dominance pruning 的豁免理由。
- `Bonus.choiceAffectsState` —— 标记该 choice identity 会被 after-pay 等 listener 消费并改变状态；只有这类方案禁止互相 dominance pruning。E123 需要该标记，B145/D88 这类无状态 replacement 不需要。
- `bonuses[].conditions?: Record<string, number>` —— `applyCostModifiers` 把 BonusModifier.conditions 透传到生成的 Bonus，enumerate 用 `evaluateConditions(player, conditions, nb)` 重新评估 nb-aware 约束（如 C013_WoodSlideHammer `minNumRooms: 5`）。

**Card-purchase ComputeCardCosts candidate pipeline（候选闭包，ADR 0004）**：major / minor improvement 购买成本在进入 payment solver 前先规范化成 Cost Candidate List，再对全部 `deriveCardCostCandidate` 转换求候选闭包（`candidate-closure.ts` `closeCandidates()`）：不动点枚举 + Mandatory Saturation 过滤，结果与 listener 注册顺序 / 命名无关（`CardListenerRegistration.order` 已删除，禁止重新引入顺序字段）。卡牌只声明单候选转换（candidate → candidate(s) | null）和 `cardCostCandidateMandatory` 标志：optional（参考实现 "can pay instead"）天然保留原候选；mandatory（参考实现 "costs less" / 替换语义）经饱和过滤隐藏仍可被强制转换的行。fixed-price 卡是"不依赖输入的 optional / mandatory 转换"，闭包去重后只产出一行，无需任何先行声明。折扣 clamp 到 0 后资源键从 candidate 资源 map 中省略。Candidate metadata 只记录 `sources` / `originalFeeIndex` / Cost Attribution（dedupe key 中 sources 视为无序集合）；闭包输出后每个 resources + originalFeeIndex 组只保留一条代表行（sources 最少 → key 字典序，ADR 0004 Amendment），支付选定后由 improvement payment glue 写入 option `sourceCards`、`resource.paid.bonusSources` 和 Card Resource Stats（单候选行默认使用 index 0 metadata）。

**统一管线阶段顺序（固定领域规则，非卡牌偏序）**：基础候选（fee/fees/unitFee + getBaseCosts 动态候选）→ cost-type modifier 的结构化资源删除 → 候选闭包（card-purchase deriveCardCostCandidate / unit-trade 转换）→ action-scope trades 组合枚举 → bonuses（含 capped / choices，必须最后求值，因折扣以最终成本为上界）→ card-provided payment resources 覆盖成本 → cards → 生成可支付方案 → paymentBudget 过滤最终实付资源 → Pareto + 排序。

**两层 condition 评估**（`cost-modifiers.ts`）：

- `evaluateStaticConditions(player, conditions)` —— 仅依赖 player 当前状态的静态判定（`houseTypeWood/Clay/Stone`）。
- `evaluateConditions(player, conditions, nb)` —— 在 static 之上再判定 nb-aware 约束（`minNumRooms`）。enumerate 在生成 payment 分支和 bonus 应用时调用。
- `getModifiersForCostType(player, costType)` —— 只用 static-only filter（`evaluateStaticConditions`），不再读 `player.rooms`。nb-aware 决策延后到 enumerate，确保 construct 的 `nb=rooms-to-build` 和 renovation 的 `nb=player.rooms` 都能正确驱动 `minNumRooms` gate。

**`Trade.scope`**：

| scope | 应用位置 | max 默认 | 典型用例 |
|---|---|---|---|
| `action` | 玩家资源池（每个 trade 独立到 `max`） | `?? 1` | A028_ForestSchool（lessons cost）、A088_HedgeKeeper（fencing 全部 3 段一次换）、E060_WorkingGloves（grouped exchange，未来加 groupMax）|
| `unit` | 每个 unit cost row，经候选闭包展开（无顺序字段） | `?? 1`（每个 row）| A123_FrameBuilder（每间房一次 wood-for-clay/stone）、A016_RammedClay（每段 fence clay-for-wood）、C056_FeedFence（至多一座纯木 stable）、C088_CarpentersApprentice（恰好折扣指定数量的 stable）|

scope:'unit' MUST NOT 携带 `conditions.minNumRooms`（per-unit 没有 min-unit 阈值）；`validateTradeModifier` 在 `applyCostModifiers` 入口处强制此不变量。

**Validation**：

- `validateComplexCost(cost)` —— dev 抛错 + prod 降级为 "no affordable solutions"。检查 `nb` 与 `cards` 互斥、`scope:'unit'` trade 必须配合 `nb`。
- `validateTradeModifier(modifier)` —— 拒绝 scope:'unit' + minNumRooms 组合及非法 grouped-use bounds。
- `validateBonus(bonus)` —— 恰好一个 `discount` 或 `choices`、`choices` 非空。
- typed cost payment solution 后处理会丢弃任何 `resourcesPaid` 出现负数的分支；参考实现 `addCost` alternative 不能表现为“多造资源再退款”的 surplus 组合。

**Renovation 对齐**（`shared/actions/effects/renovation.ts`）：`buildRenovationPlan` 直接返回 `ComplexCost`（`fees:[{reed:1}], unitFee:{[material]:1}, nb:player.rooms`）。`computeCosts` hook 的 `costs` 通过 `mergeRenovationCost` 落到 `fees[0]`；`trades` / `bonuses` / `paymentResourceProviders` 经 `executionContext.costTrades` / `costBonuses` / `paymentResourceProviders` 追加到本次 payment child。`canAffordTypedFlatCost` / `payTypedFlatCost` / `payTypedFlatCostDetailed`（`typed-flat.ts`）接受 `Partial<Resource> | ComplexCost`，统一走 `computeAllBuyableCombinations` 单管线（之前的 `resolveSimpleTradeAdjustedCost` 已删除）。

D015_ClaySupports clay→reed trade 仅当 `houseTypeClay > 0` 时生效；A123_FrameBuilder 的 construct 拆成两个 `scope:'unit'` TradeModifier（wood→clay / wood→stone），用 `houseTypeClay` / `houseTypeStone` 锁定方向；B145_BrushwoodCollector construct 用 `replaceUpTo` 覆盖 1/2 reed 行。Renovation 的 mandatory 折扣走 `Bonus.optional=false`；B128_Plumber 等 target-sensitive listener 从 `params.selectedOption` 读取本次目标材质后返回 sourced mandatory bonus choices。

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

事件事务由 engine 的 `EventStore` 管理：public action / internal leaf 开始时建立 frame，action 成功推进后补齐 `schemaVersion/id/seq/round/phase/visibility` 并提交到 `state.events`，同时追加 `publicEvents.committed` archive packet；失败、取消、rollback 或 optional skip 不追加事件。提交时会按当前 `state.nextEventSeq` 重新定序，避免父 action pending 期间其他子流程先提交事件后产生重复 `seq`。提交前会校验公开性、JSON 安全、大小上限和已知 event type/字段；恢复 pending/engine snapshot 时也会校验事务内事件，避免把未完成 frame 的非法事件写回。

卡牌 listener 通过 `CardListenerContext.transactionEvents` 和 `eventQuery` 读取当前 action frame 的事件。普通 listener 看到的是已经 emit 的当前 frame 事件；`trade-applied` 这类合成 listener 可以读取当前 exchange 的 `DraftGameEvent`，但不能依赖尚未提交的全局 `state.events`。listener handler 必须是 state-pure flow builder；包括本卡 `cardStates[cardId]` 在内的所有状态修改都通过返回 flow/leaf 进入 engine。trigger-select preview 在克隆 state/player 上执行 card listener，并且只根据返回结果判定该 activation 是否可选；listener 写 preview clone 属于纯度违规（见 §7.7 listener 纯度门禁）。只有 stage card-effect handler 仍可通过可检测的 clone 修改建立适用性。真实写入只在玩家选择 activation 后发生。

通用 `ActionNode('place-farmer')` 启动时不会分发卡牌 `before` listener，因为此时目标行动格尚未确定。目标选定后，所有放人路径都会以该目标作为 `context.space`，同时分发 `before / <target-space-id>` 和 `before / place-farmer`，对同时匹配两个身份的 listener 去重，然后展开目标 action flow 并级联目标放人的 `after` listener。普通顶层放人、可选目标或固定目标的额外放人、以及卡牌跳转共用这个目标已知边界。因此 A174 这类监听扩展行动格 ID 的卡牌和 D090 这类监听放人生命周期的卡牌会看到相同的目标行动格上下文。

**架构决策（2026-05-29）：trailing trigger frame 必须固定在 host action 成功触发时。** `during` / `immediatelyAfter` / `after` 这类 trailing phases 的 listener 可能被编译成稍后执行的 `activate-card` leaf；执行前还可能先跑 `afterHostCommitListeners` / `onBuy` flow，并继续打出职业或改良。为避免 listener handler 在真正执行时读到 later live state，engine 在 host action commit 后、任何 `afterHostCommitListeners` 修改 state 前，捕获一个 trigger frame：当前 `transactionEvents` / `actionEvents`，以及本次 `during` / `immediatelyAfter` / `after` 的 matched card listener set 与顺序。若 host action 经过 deferred continuation，continuation 必须复用这个 trigger frame，不得按 later state 重新匹配 listener 或重排 listener。v1 trigger frame 只约束 card listener，不冻结 action hook results；当前生产路径没有 trailing action hook 注册，后续如有需求再为 action hook 单独扩展。

`CardListenerContext.triggerSnapshot` 保存触发时只读事实，只在 successful action 后的 trailing phases 提供：`during` / `immediatelyAfter` / `after`。`before`、`isDoable`、`computeCosts`、`computeArgs`、`computeChoiceCandidates`、`computeReplace`、`anytime`、`computeExchanges` 不提供 snapshot，继续读取 live state。第一阶段保存每个玩家的 card type 列表快照和由列表长度派生的 count：`occupation`、`minor`、`major`、`improvement`、`played`。列表来源固定为 host action commit 后的现有 card type 语义：`occupation/minor/major` 都使用 `collectCardsAs(player, type)`，`major` 包含 `alsoCountsAs: ['major']` 的已打出 minor；`improvement` 是 `minor` 与 `major` 类型列表的 unique union，`played` 是 `occupation` / `minor` / `major` 类型列表的 unique union，dual-type card 不重复计数。列表顺序沿用 `collectCardsAs`：按 `player.improvements` → `player.minorPlayed` → `player.occupationPlayed` 扫描，unique union 保留第一次出现顺序，不额外排序。`card.played` 事件只用于判断当前 action 是否真的打出了 card 及其类型/id，不用于推导历史数量。snapshot helper 在没有 `triggerSnapshot` 时可 fallback 到 live player，但这只用于直接调用 listener 的单元测试、旧 helper 调用或非 trailing phase 兼容；engine 正常执行 `during` / `immediatelyAfter` / `after` 时必须提供 snapshot。`CardListenerContext.player` / `ownerPlayer` 仍是 live 输入；返回 flow 只在 action leaf 执行时修改状态。按“第 N 张职业 / 第 N 张改良 / 职业数与改良数是否相等”判断的 listener 必须通过 trigger snapshot helper 读取数量，不能直接读 live `context.player.*Played.length`。`check:card-impl-boundaries` 会守住这个约束：trailing listener 中直接读取 live played-count 报错，非 trailing phase 不受该 snapshot guard 约束；membership 判断如 `context.player.*Played.includes(...)` 不因 snapshot guard 禁止，具体外卡 id 由跨卡 id guard 处理。后续若出现新的触发时事实需求，再扩展 `triggerSnapshot`，不引入完整 `PlayerState` 克隆。

matched card listener set 冻结后，activation 前不重新检查 owner card 是否仍在原 zone。触发资格由 trigger-time 判定；listener body 读取 live `ownerPlayer` / `effectPlayer`，返回的 flow 再把收益、pending 和状态写入路由到正确玩家。

trigger frame 必须随 trailing `activate-card` node 持久化：`ActivateCardActionParams` 携带 `triggerSnapshot`，`transactionEvents` / `actionEvents` / `triggerSnapshot` 随 node cursor 序列化与恢复。pending 恢复后继续使用 cursor 中的 trigger frame，禁止从恢复后的 live state 重算 snapshot、重新匹配 listener 或重排 listener。该约束必须有 cursor roundtrip 测试覆盖。

卡牌不得用宿主 `onBuy` flow 补偿另一个 trailing listener 的数量判断。E97 这类“onBuy 继续打职业”的卡只表达自己的额外 action；E89 / D42 这类按第几张职业触发的效果必须留在自己的 listener 中，通过 trigger snapshot 读触发时数量。

`ActionHookResult { doable?, actionId?, extraOptions?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard? }`。`computeCosts` 返回的 `costs` / `trades` / `bonuses` / `paymentResourceProviders` 会通过 `applyComputeCostResults()` 进入本次 `executionContext.costs` / `costTrades` / `costBonuses` / `paymentResourceProviders`；construct / renovation / fencing payment 会把它们附加到 `ComplexCost` 后再枚举。farm-choice commit pass 使用 `collectFarmChoiceCostAdjustments()` 保留 farm-payload-aware `costs` / `trades` / `bonuses` / `paymentResourceProviders` / `costAttribution`，其中 fence settlement 会把 payment adjustment 一并传给 typed payment。`costAttribution` 服务 action-path `computeCosts` 的 Card Resource Stats 归因；listener 声明 source card 与成本 delta，construct / fencing / stables / plow host action 在真实执行后按 before/after 成本差和 clamp 写入 saved / paid。construct 实际产生非零 saved / paid 时，还会把对应 source id 投影到 internal pay 的 candidate metadata，进而写入 `resource.paid.bonusSources` / action detail；它只表示该卡参与了成本变化，不表示整笔 action payment 属于该卡。`reserveResources` 用于让选项级 `isDoable` 声明“本次 payment 结算后仍需保留的真实资源下限”，由 host action 传给 internal `pay` child 过滤 payment solutions；规则事实写入 `GameState.events`，不要再为单卡补日志字段。

当前事件覆盖已包括资源主干（collect/gain/pay/exchange）、农场主干（sow/plow/construct/stables/fencing/reap/breed/reorganize）、worker 放置/返家/新生儿、round/work/return-home/harvest phase、action reveal/accumulate、future meeple、legacy action detail 以及 `special-effect` mutation 分支。`state.log` 作为 UI 缓存保留，由事件 mapper 和 session cache writer 派生；业务代码不再通过旧日志字段记录规则事实。

`sourceCard` 兜底：`ActionHookResult.flow` 顶层 `sourceCard` 递归补到缺失 child leaf；组合 pending / leaf request 写入 `PendingEnvelope.sourceCard`，`GameCore` 透传到 `interaction`。

### 7.5.1 Public ActionNode 执行顺序

普通 public action leaf 进入 engine 后按以下顺序处理：`computeReplace -> before -> strict isDoable -> computeCosts -> execute -> during -> immediatelyAfter -> after`。

Direct `cancel` 不是 protected atomic action 的成功路径。`plow` / `sow` / `construct` / `stables` / `fence` / `reorganize` / internal `selection` 的 direct `cancel` 会在 option validation、`resolveChoice` 和 hooks 之前被 recoverable reject，pending 保持 active，因此不会触发 `before` / `during` / `immediatelyAfter` / `after`。Optionality 由父级 ActionFlow optional metadata 和 `__skip__` 表达；undo / 参考实现 `actRestart` 类回退走 history rollback。`construct` / `fence` 的 entry doability 必须先排除无 reachable room / 无 legal fence commit 的真实 state，避免 confirm-only pending 没有正常提交路径。`exchange` 与 `bake-bread` 暂按各自 legacy 窗口保留例外语义。

1. `computeReplace` 最先运行，早于 `before` / strict `isDoable` / `computeCosts`。执行前先用 `actionContext.targetSpaceId` 把 `context.space` 解析为目标行动格，因此 replacement 与后续所有 phase 看到同一目标格，而不是外层 flow 的 host space。`HookDispatcher.applyComputeReplace()` 先跑 action hook replacement，再跑匹配的 card listener `phase='computeReplace'`。
2. 如果 `computeReplace` 只替换 `actionId`，后续所有阶段都使用替换后的 `actionId` 继续。
3. 每个返回 `decline + alternativeFlow` 的 listener 按 ID 确定顺序贡献一棵完整子树。`buildReplacementChoiceNode()` 分别检查各分支的当前步骤准入，在原行动的可选提示前插入普通 XOR；保留内部 XOR、owner、来源、提示、目标格和行动身份。运行时 XOR 记录 `replacementOriginalNodeId`，并在 `replacementSourceCards` 中独立保存各替代来源，不覆盖内部 leaf 的来源；choice request 标注 `requiresExplicitChoice=true`，因此唯一替代也等待玩家输入。原分支显示“不替换”，保留原有可选性。展示菜单时不运行任何分支的 `before`。
4. 玩家选择 replacement 分支后，分支中的每个 leaf 都作为普通 action 重新进入本流水线。该分支只携带继承的 `skipComputeReplaceListenerIds` 与产生本分支的 listener ID，因此 nested action 仍可被其他 replacement listener 替代；它不携带 `checkedReplaceAction`，普通 `before` / `during` / `after` listener 继续运行。original fallback leaf 携带 `checkedReplaceAction=true`，dispatcher 把它仅作为 replacement bookkeeping 并统一跳过 replacement 计算；其他 phase 不得把该标记解释为行动语义或据此屏蔽普通 listener。
5. 没有 decline replacement 后，engine 先执行 `before` card listener dispatch。匹配到的 reaction listener 被编译成 internal `activate-card` leaf，并插入在原 action leaf 前面；同一 card owner / phase 下的多个 reaction listener 默认包成 `ParallelNode(mode='trigger-select')`，由 owner 选择顺序。跨 owner 的同一时机 reaction 会拆成各 owner 自己的 activation/prompt。trigger-select 评估时，结构暂不适用的 child 本轮不显示且不永久 resolve，后续 sibling 执行后会重新评估；结构适用但当前不可支付的 listener 仍显示为 disabled。对没有 `cardIds`、靠 `context.sourceCard` 守卫的全局 listener，activation metadata 会继承本次 event 的 `sourceCard` 作为展示/选择卡牌 id，避免退到 listener id。
6. 一个 leaf 的替换选择完成后，`resolvedReplacement` 在运行 `before` 前固定其 action ID 和来源；该 leaf 或其内部 pending 恢复时不重新计算替换，并仅在最终可执行性校验中携带 `checkedReplaceAction=true`，排除仅用于替代准入的 `isDoable` 回退，不改变普通执行及 pending payload 的上下文。当前步骤准入、mandatory continuation 探测和 before-trigger pass gate 使用同一个已固定行动与来源；后来才可用的替代不能作为跳过 enabling before 或为不可支付 host 建立 guard 的依据。`beforePhaseResolved` 防止重复执行 before activation。这些运行时字段随 clone 和私有 cursor 保存恢复；新行动节点独立计算自己的替换。
7. 然后执行 strict `isDoable`：base `canBeExecutedByPlayer` → costPreview → action hook `isDoable` → card listener `isDoable`。这一步必须读取 `before` 已真实修改后的 state；如果仍不可达，不能继续原 action。只有已接受的 mandatory continuation 此时可用 `ActionDefinition.isAlreadySatisfied` 查询当前 transaction events；此时 `before` 已完成，命中后该 leaf 直接完成，不执行 action 本体，也不派发 `during` / `immediatelyAfter` / `after`。新 action 和 optional action 不使用这个出口。
   `occupation` 的手牌选项构建与 forged choice 校验也会用 `choice=<occupationId>` 跑选项级 `isDoable` card listener；这用于 B93 这类“打出后必须支付 onBuy 最低后续成本”的前置过滤。listener 返回的 `reserveResources` 会继续传入 occupation payment leaf，确保后续必付成本不能被职业付款选项提前花掉。
8. 然后执行 `computeCosts`，把费用覆盖 / sourced trades / bonus choices / payment resource providers 写入本次 `executionContext.costs` / `costTrades` / `costBonuses` / `paymentResourceProviders`。因此 before unlocker / resource gain / exchange 可以先改变真实 state，再影响后续 strict doable 与费用枚举。
9. 随后执行 action 本体：`getBaseChoiceOptions` opt-in path 先走 `computeChoiceCandidates`，否则走 `ActionDefinition.execute()`；`resolveChoice` continuation 保留已选行动，重新验证当前可执行性和成本，先完成 pending 选择，再继续 host internal children / trailing phases。`execute()` 或 `resolveChoice()` 返回 request 时创建 pending；无 request 时继续 `during` / `immediatelyAfter` / `after`。
10. `during` / `immediatelyAfter` / `after` 是 host action 成功后的 trailing phases；它们的 trigger frame 在 host commit 后立即固定。`beforeHostListeners` settlement 必须先完成，`afterHostCommitListeners` 在 host commit 后、trailing phases 的 activation 真正执行前运行，`afterHostListeners` settlement 则故意保留在 参考实现 slot 中，等 host `after` 之后再运行。
11. `activate-card` 是 internal leaf，绕过上述 public action 流水线：只执行指定 listener body，并把 listener 返回的 `flow` / `followUpActions` 交回 engine 插入执行。

作用域 scope：`player` / `opponent` / `any`。card listener 匹配层按 listener id 确定性枚举；phase trailing node 构建层再按 owner 分组（global → active player → 其他玩家），每个 owner 组内按卡牌 play order 与匹配序稳定排序，并由该 owner 执行 activation/prompt。reaction listener 默认进入 trigger-select；compute / query listener 仍按确定性顺序聚合，不产生玩家选择。

Card listener 区域默认只匹配已打出卡：`zones` 省略等价于 `['played']`，扫描 `improvements` / `minorPlayed` / `occupationPlayed`。只有显式声明 `zones: ['hand']` 或 `zones: ['hand', 'played']` 的 listener 才会扫描 `minorHand` / `occupationHand`。匹配结果携带 `ownerCardId` 与 `ownerCardZone`，并通过 `activate-card` params、trigger-select preview、`executeCardListener()` 透传给 handler；handler 不应自行重扫手牌/已打出数组来推断 owner 区域。

手牌 listener 只用于“卡牌存在于手牌时就必须监听历史”的卡牌局部规则。它仍必须遵守 state-pure flow builder 约束：只读当前 transaction events / state，状态更新通过返回 flow 落到本卡 `cardStates[cardId]`。当该卡仍在手牌中时，per-viewer serialization 必须对非 owner 隐藏对应 `cardStates[cardId]`、以该手牌卡为 source 的 public events、由这些事件派生的 log entry、过滤后的 event/archive seq cursor、runtime `publicEventCancellations` 和按手牌 id keyed 的 `cardAvailability`，避免从局部历史或可打出性元数据反推隐藏手牌。禁止为了单卡历史需求新增 `PlayerState.stats` / `GameState` 顶层全局 stat；没有该卡的对局不应为该卡维护额外历史。

### 7.5.2 当前步骤准入、before 与 blocked 恢复

行动格可用性与权威入口共用 `GameCore.applyIsDoableCheck()` 和 flow 准入 helper。原子判断携带 params、sourceCard、actionContext、owner、目标行动格、实际费用修正与替代行动信息。当前步骤可执行，或适用的 before 可以开始，就允许尝试；不保证整条流程能够完成。SEQ 检查下一步，OR/XOR 检查是否有分支可以开始。显式 veto 和放人限制仍然有效。查询不消费资源、触发、事件或私有 cursor。

引擎在状态变化后重新评估 before 候选，每次 activation 只消费一次。已接受的根行动和必选续行会向复合后代传播义务。选中分支不能返回父选择以逃过未履行的义务；明确 optional 节点在接受前仍可跳过。必选叶节点或复合节点不可执行时产生 `engine-blocked`；普通失败保留先前效果，等待玩家显式 `undoStep` 或 `undoAction`。无效结构化提交恢复命令检查点并保留原交互。

必选宿主在执行本体前仍不可行时，仅当当前合法 anytime 列表非空才提供“继续”窗口，包括没有触发任何 before listener 的情况；不分析相关性或未来是否成功。Anytime 执行后回到同一窗口；继续按钮严格重验宿主，不重复 before。继续失败或最初没有 anytime 时进入 blocked。原有阶段与 provisional guard 仍然有效。已提供的分支在选择前变得不可行时，也进入同一窗口。受保护观察在命令结算时还会检查未来必选步骤和必选选择，包括观察后动态返回的续行；未接受的可选分支不属于义务。Pending 与 before 单次消费状态随 engine cursor 序列化，撤销使用既有命令和 Rule Action 历史。

不再有通用整流程搜索、确定性输入适配器或普通 completion scope。支付求解、动物容量和围栏几何仍属于原子规则检查。只有不存在特殊围栏 policy，且所有匹配的围栏费用 listener 都声明 `monotoneFenceCost` 时，围栏候选才可剪掉付不起费用的严格超集。跨玩家恢复、Protected Observation 门禁和保留同一已揭示选择的 fallback 继续遵守 ADR 0015 的 provisional 语义。

### 7.5.3 Pay child 架构不变量

`pay` 是 internal settlement child；public host action 负责业务 mutation、事件事实和 completion。不要把业务 mutation 放回 `pay`，也不要用 `seq:[pay, apply-*]` 或顶层 `apply-*` effect 表达同一件事。

`beforeHostListeners` / `afterHostCommitListeners` / `afterHostListeners` 是 host action 在 参考实现 pay slot 上的显式差异：

- `renovation` / `improvement` / `occupation` / `construct` / `fencing` / `stables` 在 `beforeHostListeners` 或主 action 内先完成 mandatory payment，再进入 trailing effects。
- `improvement` / `occupation` 的 `onBuy` 使用 `afterHostCommitListeners`：先完成 mandatory payment，再由 host `completeInternalChildren` 提交卡牌，随后触发 onBuy，最后才进入 host `during` / `immediatelyAfter` / `after`。
- `stables` 保持 `farm.stableBuilt -> resource.paid(stables) -> after-stables effects`：农场 mutation 仍是 host action 的事实，但 mandatory payment 会在 reaction 花费这些资源前结算。
- `fencing` 明确是 `beforeHostListeners`，避免 `A034_Loppers` 这类 after-fencing 效果先于 mandatory fence pay 结算而饿死支付。
- mandatory 传播不改变 fencing 结算顺序：先校验合法布局，再结算支付，最后提交权威 fence；不得因此允许 `seq:[pay, apply-*]`。

禁止的形态：

- `seq:[pay, apply-*]`。
- 顶层 `apply-*` effect 文件。
- `PlayerState` payment scratchpad 或跨 action 临时支付槽位。

`activate-card-effect` 是 internal child，用 `paymentInfoFrom` 从 internal result map 读取 `paymentInfo`，再执行 `onBuy` 等 card-effect hook；`afterHostCommit` activation 是 mandatory，其返回 flow 会递归继承该义务。阶段 reaction dispatcher 也使用该 child 执行 harvest field / before-end card-effect activation。stage activation 可携带 `ownerPlayerId` / `targetPlayerId` / stage hook metadata，并在 `ParallelNode(mode='trigger-select')` preview 中用 cloned state/player 评估 applicable / doable / mandatory pass。flow-returning handler 返回 flow 即视为可执行；direct-mutation void handler 若在 clone 上产生变更，也视为可执行，但真实 mutation 只在玩家选择该 activation 后落地。choice flow 的真实 max / options 由后续 action leaf 再按 live state 生成或校验。trigger-select pass gate 以 preview 后的结果为准：显式 mandatory 或 enabled non-before non-optional result 会禁用 pass，root `flow.optional === true` 可允许 pass；before-end stage activation 继续以 `beforeEndGameMandatory` 为准，即使该 activation 是 no-flow direct mutation；`before` trigger 继续由原 action continuation 判定 pass 是否可用。`onBuy` 的 `paymentInfo` 路径不读取 stage target metadata。`occupation-gate` 是 no-op internal gate，只给需要先展示/执行其他节点、但 OR 分支可执行性仍必须按 occupation 判断的 flow 使用。卡牌购买的 onBuy / 多卡业务继续留在 card-effect 或 host action completion 中，不要塞回 top-level effect。

`PaymentResourceMap` 覆盖真实资源、supply token 和卡牌提供的虚拟支付资源：`fence` / `stable` 与 `wood` / `food` 一样进入 `cost`、`payLeaf`、payment solver、`resourcesPaid`、`PaymentInfo` 和 `resource.paid`；虚拟支付资源不进入 `cost`，但会在 `PaymentSolution.resourcesPaid` / payment choice label 中以稳定 key 出现。支付 supply token 时只增加 `player.supplyTokensConsumed`，不修改已建 `fenceSegments` / `stableTiles`；所有“还能建多少 fence / stable”的读取必须走 `getOwnOrdinaryFenceBuildLimit()` / `getOwnOrdinaryFenceReserveCount()` / `getAvailableStableSupplyCount()`，不能再使用固定 15 / 4 上限。

声明 `mandatory: true` 的 listener，即使是唯一激活项、没有触发菜单，也会将强制义务传入其返回流程。无法足额转账时进入可撤销的阻塞，不会结束行动。

### 7.6 阶段型 Hook（按触发顺序）

```
回合开始: onBeforeStartOfTurn → futureMeepleReceives → futureActionAnytimeWindow → futureMeepleActions → onBeforeWork → onRoundStart
工作:    PlaceFarmer → 各原子行动 → onEndTurn → allWorkersUsed → onAllWorkersPlaced
回家:    onBeforeReturnHome → onStartReturnHome → onReturnHome
回合结束: onRoundEnd → onAfterRoundEnd
收获 (4/7/9/11/13/14):
  onBeforeHarvest → harvestPrepWindow → onStartHarvest
  → onStartHarvestFieldPhase → onHarvestFieldPhase → reap [dispatch 'reap'] → reap reaction parallel
    → onAfterReap → onEndHarvestFieldPhase → onHarvest
  → postReapAnytimeWindow → onStartHarvestFeedingPhase → onHarvestFeedingPhase
    → feed → onEndHarvestFeedingPhase
  → breed → onEndHarvest → onAfterHarvest
终局前:  round 14 的 onAfterRoundEnd 完成并递增到 round 15 后，onBeforeEndGame → preScoringWindow → gameover
```

跳过整个收获只在全部 `onBeforeHarvest` hook 完成后、`harvestPrepWindow` 前激活一次。待生效的卡牌状态标记会被消费为本轮标记；标记生效期间，该玩家不参与收获准备、收田、收田后 anytime、喂食与供暖、繁殖、收获阶段 hook，也不触发由该玩家卡牌拥有的 listener。`onBeforeHarvest` 仍在排除前正常结算，阶段转入 `preparation` 后普通 `onRoundEnd` 恢复执行。E58 这类只跳过田地和繁殖的效果继续使用独立的窄机制。

`onBeforeHarvest` 完成后，`harvestPrepWindow` 在任何 `onStartHarvest` / field-phase 卡牌结算前按座次遍历玩家。已打出的卡可声明 `preHarvestGoodsWanted`；准备窗口会把所有已打出消费者的需求汇总，再和当前存量及必然收割量比较。若卡牌在普通收割前就消费该资源，则改为声明 `preHarvestGoodsWantedBeforeReap`；当前存量必须独立覆盖汇总后的收割前需求，田里的作物不计入。E58 这类可以选择跳过田地阶段的卡牌声明 `maySkipHarvestFieldPhase`；其可能发生的收割不会被任何消费者视为必然。没有有用且可支付的限次 `harvest` exchange 的玩家直接跳过。harvest exchange 的使用次数按来源和轮次记录，因此这里使用后，后续喂食窗口只能使用剩余额度。当前由 A61/C29/C54/C98/C110/D70/E110 声明粮食或木材需求，提供者从 exchange metadata 发现，不维护卡牌 ID 清单。

普通 Harvest 收获用 `reap(..., { trigger: { phase: 'harvest' } })` 移除田里作物，事件层统一记录 `reason: 'reap'`。每块田先通过 `computeHarvestCount(state, player, field)` 得到本次普通 reap 要移动的 crop 数量、`sources`、`tags` 和 `scope`；单卡只能通过 `registerHarvestCountModifier(cardId, modifier)` 增减 `delta`、设置 `override`、追加语义 `tags` 或把 `scope` 升为 `field`，不要在 `reap` 主路径添加单卡分支。默认 `top-stack` scope 只收原始顶堆，只有 E73 这类 full-field 能用 `field` scope 跨堆。`HarvestReapSummary.harvestedCrops` 按 field/crop 记录实际收获数量与来源；`HarvestReapSummary.harvestedPositions` 记录当前完整 Harvest 中实际收割过的每块 Logical Field：普通田使用农场坐标，Card Field 使用规范虚拟坐标；私人 reap 与没有产出作物的田不进入。`HarvestReapSummary.harvestCountApplications` 按 field/crop/scope 记录每次 harvest count 应用的 `count`、`sources`、`tags` 和 `scope`，包括 E112 这类 supply-instead-of-field 的零收获应用。后续卡牌若要判断“本次收获规则实际怎么作用”，必须读取 applications，不要反查外卡 `cardStates`。A112/D72 这类额外收获选择门槛通过 `registerHarvestSelectionThresholdModifier()` / `computeHarvestSelectionThreshold()` 扩展；helper 只接收当前 `state/player/field/sourceCard/baseThreshold`，由注册 modifier 返回更低阈值来源，调用方不读取具体外卡 id。`grainFields` / `vegetableFields` 仍按收获过的田数计数，不按 crop amount 计数。每种 crop 收获后走 `dispatchReapListener(state, player, crop, amount, ..., { trigger, sourceCard })` 派发 `'reap'` 合成事件；listener 返回的 flow 不在 dispatch 阶段执行，而是收集进普通 `parallel` stage flow，全部完成后再进入 `onAfterReap`。

`onHarvest` 完成后、喂食阶段开始前，`postReapAnytimeWindow` 按 Harvest 顺序遍历玩家。只有 `buildAnytimeEntries()` 找到当前可执行的 registry action 或卡牌 listener flow 时，才建立可跳过的 synthetic choice；完成一次 anytime flow 后按实时状态重建同一玩家的能力，没有剩余能力时自动推进，Pass 则显式推进。所有玩家完成后，`executeFeedingLogic()` 才冻结 `remaining` / `foodUsed`，因此窗口内资源变化会进入喂食计算，同时真实 `feed` / `heating` pending 仍保持锁定。

喂食需求通过 `computeHarvestFeedingRequirement(state, player)` 计算，默认公式是 `familySize * 2 - newbornCount`；E30/E159 这类只改变所需食物数量的卡通过 `registerHarvestFeedingRequirementModifier(cardId, modifier)` 扩展公式，不新增 `BeforeFeed` / `AfterFeed` 阶段 hook，也不在喂食主路径写单卡分支。

喂食草稿会列出所有仍有次数的 `harvest` exchange，即使它按初始资源暂时不可支付，因为前一个已选交换可能产出其输入。前端按选择顺序推演选择；`handleFeedResolved()` 用权威资源和各来源剩余次数重放提交的 `(sourceId, exchangeIndex, count)` 有序计划，只有完整计划合法时才统一落地，拒绝时状态和喂食交互都保持不变。`CardExchange.fromFarmyard` / `Trade.fromFarmyard` 将动物输入限制为当前已安置的动物；后端在 feed request 中随来源次数上限发布按物种划分的 `placedAnimals`；草稿投影与有序校验都会为每笔动物支付扣减这个余额，不把同批次刚获得的动物视为已安置。

Harvest outcome summary 是本次 Harvest 的事实，不是中间日志缓存。`harvestReapSummary` 在 field phase 累计本次实际 reaped crops；`harvestBreedSummary.resources`、`animalTypes`、`animalCount` 在繁殖对应的重排确认后结算为成功安置的新生动物。`harvestBreedPlacement` 在等待期间记录安置最低数量与动物余额，包含修改后的父母阈值及寄养繁殖归属。动物支付会降低最低数量，直到该物种耗尽才失去新生动物；随后获得的动物会增加最低数量，不能恢复已耗尽的新生动物。嵌套重排使用同一记录排除弃掉的新生动物，原始繁殖重排确认后释放记录。弃掉的新生动物不计入，弃掉旧动物本身也不抹除已安置的新生动物。两份 summary 必须保留到 `onEndHarvest` / `onAfterHarvest` 全部完成后再清理，供 E134 这类“本次 harvest 后处理”读取实际收获/繁殖结果。不新增 `state.harvestOutcomeSummary` 顶层状态；卡牌通过 `getHarvestOutcome(state, playerId)` 从现有两份 summary 组合读取 outcome。Breed phase 通过 `getBreedThreshold(state, player, animalType, { sourceCard })` 计算每种动物的繁殖阈值，默认 2；helper 只枚举已打出卡的 `CardImpl.effect.computeBreedThreshold`，同一 animal type 多个 modifier 取最小 threshold。需要调整本次 harvest breed 处理顺序的卡牌使用 `CardImpl.effect.computeHarvestBreedOrderPriority(state, player)`，默认 0，数字越大越晚，priority 相同保持 harvest order；该 hook 只作用于 breeding phase。E84 只在 `sourceCard === 'harvest'` 时返回 sheep threshold=1，让 1 sheep + capacity 直接在 harvest breed 中产生 newborn sheep，并写入 `harvestBreedSummary.resources.sheep`。卡牌不得用具体卡牌 id、live animal count 或 virtual resource 推导 newborn 事实；breeding modifier 的影响必须先体现在 `harvestBreedSummary.resources` 中，再由后续卡牌消费。

`reap` 是可由 ActionFlow/internal 执行的内部 action；私人田地收获通过 `trigger: { phase: 'private-field-phase', cardId: sourceCard }` 进入同一 action，不启动完整 Harvest：先收获普通田，再收获 Card Field，并跳过 Harvest summary 写入；普通田和 Card Field 的 `immediatelyAfter.reap` 反应同样合并成普通 `parallel` flow。

`onAllWorkersPlaced` 在所有玩家耗尽普通放人和正常轮转 provider 后、归家前执行。每名玩家的 activation 复用 `ParallelNode(mode='trigger-select')`，可自行选择同时发生的收尾效果顺序。供应放置使用 §6.4 的有限人物身份和统一清理，不激活永久家庭成员。

阶段 hook 已可返回 `ActionFlow`（`continueStageHook` / `continueAllWorkersPlacedHooks`），用于"hook 触发子流程"统一走 `EngineStack.push`。future meeple 在 round-start 分三步结算：`futureMeepleReceives` 先把到期普通资源按 player 合并成一个内部 `receive` action transaction，`resource.moved.reason='receive'` 且每个 entry 保留自己的 `sourceCardId`，因此 Receive listener 会触发一次，Gain listener 不会被隐式触发；`futureActionAnytimeWindow` 再只遍历拥有到期 action token 的玩家，没有当前可执行标准 `exchange` 的玩家直接跳过，每个嵌套 flow 后都按实时状态重算该兑换。卡牌来源的 anytime 能力不进入该窗口，避免为未来回合安排的效果赶在当前轮 `onRoundStart` 前触发；最后 `futureMeepleActions` 才构造行动可行性并由 `applyFutureMeeples` 消费 token，把 `field` 转成 optional `plow`、`stable` 转成 optional 免费 `stables`。entry 可携带 `actionContext`，因此 D91 这类付费行动可以使用 receive transaction 或兑换窗口刚获得的资源。下一轮会在 `onBeforeStartOfTurn` 前从实时起始玩家标记冻结 `roundFirstPlayerId`；随后先用 `onBeforeWork` 结算卡面写明"工作阶段开始前"的卡牌。此时转移标记会立即生效，但只影响下一轮的冻结结果。这些 flow 全部完成后，再进入作为现有工作阶段开始时点的普通 `onRoundStart`；工作阶段入口和 E56 Roman Pot 等顺序消费者均从冻结 ID 派生循环顺序。若 before-work placement 已用完该玩家的工人而其他玩家仍可行动，入口会沿同一冻结顺序推进到首个可行动玩家；若实际的 before-work placement 用完所有玩家的工人，则立即进入正常的 all-workers-placed 级联，而没有实际放人的空轮仍保持 idle。两个 stage 恢复时都不会重复 round-start 初始化。

Before-Harvest 窗口会在激活 Harvest skip 前，根据 Start Player Marker 冻结顺时针玩家顺序；即使玩家将跳过本次 Harvest，也仍参与该窗口。每名玩家只结算自己的当前适用 `onBeforeHarvest` activation：单卡直接展开，多卡进入 `ParallelNode(mode='trigger-select')`。每次选择后都在克隆的实时状态上重新判断 applicability 与 mandatory/pass；选择 optional activation 后即视为承诺执行，不再弹出第二次 optional 确认。冻结顺序和当前 offset 保存在 `stageResume.extra.beforeHarvestPlayerOrder`，序列化恢复时不会重新读取已经变化的起始玩家标记。handler 必须返回可重放 flow，真实状态修改只能放在 action leaf。

Harvest field 三个阶段 hook（`onStartHarvestFieldPhase` / `onHarvestFieldPhase` / `onEndHarvestFieldPhase`）按玩家顺序进入；每个玩家进入该 hook 时先把该玩家全部可触发 card-effect 编译成 `activate-card-effect` activation，再以 `ParallelNode(mode='trigger-select')` 交给 engine；普通 `reap` 仍在 `onHarvestFieldPhase` reactions 完成后发生。`onBeforePlayerTurn` 是 non-flow skip-control exception：只在 labor turn 入口同步返回 `{ skipTurn?: true } | void`，不返回 `ActionFlow`、不走 `continueStageHook`、不产生 pending。`onBeforeEndGame?: FlowEffectHandler` 是终局计分前的阶段 hook：round 14 结束后启动 Before-End Player Dispatch，按 target player 座次构造 `activate-card-effect` activation。默认 `beforeEndGameScope='owner'`；`beforeEndGameScope='allPlayers'` 的已打出卡可在每个 target step 触发，`handHooks` 不支持 `onBeforeEndGame`；同一 target step 内多个 activation 默认进入 trigger-select，`beforeEndGameMandatory` 决定 pass gate。hook flow 可以产生 pending，并通过 `stageResume.hook='onBeforeEndGame'` 恢复到下一个 target player。

全部 before-end target 完成后，`preScoringWindow` 按座次遍历玩家，只查询标记了 `preScoring: true` 的 `anytime` listener。当前没有可用 marked flow 的玩家直接跳过，不产生空交互；否则用 optional XOR 展示可用卡牌 flow。完成一次 flow 后按实时状态重建同一玩家窗口，Pass 才推进下一玩家，因此 `onBeforeEndGame` 刚获得的资源仍可消费。anytime listener 可声明 `blockedAnytimeInteractionKinds`；构建入口和命令重检时，若当前 pending request 属于其中一种 kind，就不会暴露该能力。所有玩家 Pass 或没有可用 marked flow 后，才写入 `gameOver` 并进入 `gameover` interaction。

阶段 hook 子流程产生 privateEvents 时，嵌套 `respond()` 不得提前 drain 外层 response buffer；`stageResume` 恢复阶段需要把私有事件保留到最外层响应统一发送。

阶段 hook 子流程可能移除正在结算的卡牌（例如传牌）。`stageResume` 除 numeric `cardIndex` 外还保存 `resumeAfterCardId`；恢复时若该卡仍在 played-card 列表中，从它之后继续，若已被移除，则从旧 index 前一位继续，避免跳过原本紧随其后的同阶段 hook。

未来回合的一次性 optional offer 不应塞进 `futureMeeples` 资源 token。`scheduled-offer` internal action 读取 `player.cardStates[cardId].extraData.scheduledOffers`，offer 记录 `dueRound`、`kind`、cost、目标 special action 或 animal、`consumed` / `consumedRound`；`onRoundStart` 通过 `scheduledOffersRoundStartFlow()` 把到期 offer 交给 engine。执行时先消费 token，再按当前状态决定是否弹 choice；拒绝、资源不足或目标不可执行都不会保留 token。M056 通过该 action 复用 Cut Peat special action card 的可用性、费用、market / opponent face-up 和翻面规则；M131 通过同一模型购买预约动物后显式进入 `reorganize`。

### 7.7 Listener activation purity + 参考实现对齐

**架构决策（2026-05-13）：`CardListenerRegistration.handler` 在 listener dispatch / preview / doable 路径中必须是 state-pure flow builder。** 它可以读取 `GameState` / `PlayerState` / event，返回 `ActionHookResult`、`ActionFlow`、`costs`、`doable`、`extraOptions` 等结构化结果；不能直接修改 `GameState`、`PlayerState`、`ActionSpace`、`player.cardStates`、资源、农场格、日志或 pending。

当前 no-peek worktree 已把 `buildPhaseTrailingNodes` 改为不执行 handler；这只是 Phase 1 安全切口。后续设计不能再依赖 dispatch-time handler peek 或一次性 `preComputedResult`。

参考语义：

- `PlayerCards::getReaction($event)` 只收集 listening cards 并生成 `ACTIVATE_CARD` leaf，不执行卡牌 listener body。
- `ActivateCard::getFlow()` 在 leaf 真正推进时调用卡牌方法得到 flow；`isDoable()` / `isIndependent()` / `getDescription()` 也可能重建 flow，因此 listener 方法必须可重复调用且无副作用。
- 真正的状态修改放在 action / `SPECIAL_EFFECT` leaf 里执行，而不是放在 reaction 构建阶段。

OA 对齐规则：

- 需要改资源、动物、农场、`cardStates` 或 log 的 listener，必须返回 leaf / seq flow，让 `gain`、`pay`、`special-effect`、`exchange` 等 action 执行状态修改。
- 如果缺通用 mutation leaf，新增可复用 internal action；不要在单卡 handler 内直接 mutate，也不要在核心路径加单卡分支。
- `effect.onBuy` 等非-listener 执行路径可保留现状；但一旦被 listener / preview / doable 复用，也必须遵守 state-pure flow builder 语义。
- stage card-effect handler 在 trigger-select preview 中用 cloned state/player 运行；返回 flow 或 clone 上可检测的 direct mutation 都可用于 applicable / doable 判定，纯资源 preview 读取该 activation 的执行玩家资源与 supply token，真实 mutation 只能在 activation leaf 被选择后落地。
- dispatch 阶段不得通过执行 handler 来制造一次性 `preComputedResult` 语义；可以收集 registration metadata、构造 activation leaf、或做纯 `isDoable` / preview 查询。
- listener activation 是普通 internal leaf：`leaf actionId='activate-card'`，params 携 `{ listenerId, cardId, event, ownerPlayerId, triggerPlayerId }`。`event.actionContext` 必须保留触发 leaf 的 target context，尤其是 card-granted placement / jump / wrapper action 写入的 `targetSpaceId`，避免 listener 在执行时回落到外层 frame space。它 bypass public action pipeline，不跑普通 action hooks / cost / generic log；listener 返回的 `flow` / `followUpActions` 仍回到 engine 统一执行。
- owner 与 trigger player 必须显式进入 event / params。opponent scope 触发时，activation 以 owner 为执行玩家；跨玩家 UI 确认和 undo boundary 由 runtime 处理，目标上不暴露为卡牌 flow primitive。
- `confirm-player-switch` 由 `fromPlayerIndex` 持有并提交：离开控制权的玩家显式确认把控制权交给 `toPlayerIndex`。确认后必须立刻写入 undo boundary。目标玩家随后进入跨玩家 prompt 时，`allowedCommands` 不暴露 `undoStep` / `undoAction`，`SessionResponse.historyLength` / `hasActionStartSnapshot` 表示当前可执行的 undo 能力，而不是内部 raw history。目标玩家后续作出选择后，undo 最多回到切换后的 prompt，不能跨回触发玩家的行动状态。已完成的 frame 会跳过已耗尽的嵌套返回点并直接切回 frame owner；只有后续交互确实以某个中间响应玩家为目标时才会再次切给该玩家。`animal-reorg` 这类直接跨玩家响应 frame 没有独立的切换确认，因此 pending 期间直接阻止 undo，并持久化 `undoBoundaryOnResolve`；每次提交响应本身都是 boundary，不能恢复触发玩家的状态或重新打开跨玩家 prompt。

**2026-05-13 Wave 1 落地规则：listener handler 不再承担"先改状态再返回 flow"的桥接职责。** 对于本轮已迁移的 B48 / E103 / C148 / A144 / D82 / D27，handler 只读取当前状态并返回可重放 flow 或纯查询结果：

- 卡上计数、flag、infobox、stack pop、major swap 等状态修改统一走 `special-effect` leaf；本轮补齐 `set-counter`、`pop-card-stack-top`、`swap-improvement-with-board`。
- 跨玩家奖励用 `gain` leaf 的 `recipientPlayerId` / `payerId`，不要在 handler 内直接改 trigger player 资源。
- optional accept/decline 语义必须由 flow 表达。典型例子：D27 Retraining 先执行 `set-flag false`，再把 `swap-improvement-with-board` 放入 optional child；decline 只清 flag，不预留 / 回滚公共 major 池。
- 只影响可达性或费用的 listener 应返回纯 `doable` / `costs` / `bonuses`。典型例子：D82 Hunting Trophy 通过 `space.id` scoped `isDoable` + `computeCosts` 建模 farm/house redevelopment，不再用 before/after flag 或 `activeModifiers` 临时桥。

**2026-05-13 Wave2a 合成 dispatch 边界：`trade-applied` / `harvest-feed-conversion` / `future-meeple-resolved` 这类没有完整 engine 的 listener dispatch，只通过 immediate-special-effect helper 执行确定性的状态同步叶子。** 该 helper 只遍历非 optional 的 `special-effect` leaf，以及确定性的 `seq` / `parallel` flow；刻意跳过 `gain`、`pay`、interactive、optional、`or` / `xor`、跨 owner targeted flow。需要更丰富合成 listener 效果时，必须接入真实 engine flow 路径，而不是扩展这个 helper；这样 Wave2a 的 cardState-only 合成 listener 能保持 pure handler，同时不重新引入 dispatch-time handler mutation。`reap` 已接入真实 engine flow 路径，由 Harvest / `reap` private trigger 收集 listener flow 并推进普通 `parallel`；round-start future resource entries 也已接入真实 `receive` action 路径；`harvest-feed-conversion` 只把已提交的 `harvest.feedConverted` 事件放进 listener `transactionEvents`，不合成 `resource.exchanged`；`future-meeple-resolved` 只把已提交的 `futureMeeple.resolved` 事件按目标玩家分组放进 listener `transactionEvents`。这些 synthetic dispatch 都不包含任何单卡分支。

**2026-05-13 Wave2b/c 落地规则：listener 内的 cardState / structural mutation 也必须通过 action leaf 执行。** 本轮把 A68 / A73 / A92 / B18 / B34 / B76 / C48 / C53 / C88 / C93 / C130 / C150 / D36 / D56 / D74 / D158 / E53 / E74 / E85 / E148 的剩余 handler mutation 迁出：

- `special-effect` 扩展为 listener-purity 的通用 mutation dispatcher：`clear-pending-fence-bonus`、`consume-pending-extra-turns`、`remove-future-meeples`、`promote-first-newborn`、`add-resource-to-space`、`build-stable-on-first-empty-tile`、`record-scoring-reserve-bonus`、`add-farmyard-space-state`、`claim-farmyard-goods-tokens`、`claim-field-goods-tokens`、`grow-field-and-non-field-crops`、`consume-supply-token`。`record-scoring-reserve-bonus` 只记录终局 Scoring Reserve 与 bonus VP，不扣真实资源；target 由 server-side `actionContext.targetPlayerId` 解析，reserved 只校验非负整数 real resource 与不超过 `target.resources - 已选 Scoring Reserve`。shared scoring 卡牌可随该记录写入 `cardType`，让非持卡 target player 的 score entry 仍保留来源卡牌归类。
- B18 这类 future-meeple 写入走 lazy flow；after-pay listener 不再立即 queue。
- C93 / C130 对 action space 的资源写入返回 `special-effect.add-resource-to-space`，额外放人仍保持 optional。
- E148 opponent-scope listener 用 owner-targeted `special-effect` 更新 reserved action spaces / stable；"无空地但需要移除 marker" 这种无收益状态同步可返回 `countCardUse: false`，避免把纯清理计入卡牌 used stats。
- `countCardUse: false` 只用于 listener 结果需要执行 housekeeping flow、但不应被视为卡牌效果触发的场景；不要用它隐藏真实收益或玩家选择。

**2026-09-16 Listener 纯度门禁：上述不变量已可执行。** `shared/cards/card-listeners.ts` 的 `executeCardListener` 与 `invokeCardCostCandidateTransform` 把每次 handler / `deriveCardCostCandidate` 调用都经过可选的 `CardListenerInvocationInterceptor`；生产环境不设置。所有能触发 listener dispatch 的 Vitest project（`fast-shared`、`fast-cards`、`fast-card-runtime`、`fast-server`、`fast-tests`、`slow`）通过 `setup-listener-purity.ts` 安装 `shared/cards/__tests__/listener-purity-guard.ts`：

- 单次调用期间，guard 把 `state`、`player`、`triggerPlayer`、`ownerPlayer`、`effectPlayer`、`space`、`actionContext`、`params`、`result`、`transactionEvents`、`actionEvents`、`triggerSnapshot`、`extraData` 以深层只读 Proxy 交给 listener；经 `Object.getOwnPropertyDescriptor(s)` 取到的值同样被包裹，`eventQuery` 也被重建，使 `find` / `filter` 的结果与 predicate 参数都是受保护的 frame 事件。任何赋值、`delete`、`defineProperty`、原型修改、freeze 或数组修改——无论直接、经别名还是在 helper 内部——都会抛出 `ListenerPurityViolationError`，指明卡牌、listener、调用类型、phase、action 与属性路径。抛错前权威值不会被写入，`GameCore` 命令结算会回滚该命令。
- 返回结果若仍引用受保护对象（例如把 live `cardStates` 过滤后的数组直接作为 `set-extra-data` 的 value），属于 `returned-authoritative-reference` 违规；listener 必须返回副本。
- Proxy 只存在于该次调用。listener 自己新建的对象不会被包裹，返回的 flow 之后仍可通过 action leaf 修改状态。嵌套的 `executeCardListener` 调用复用外层 Proxy。受保护输入与 listener 外部捕获对象之间的引用同一性不成立；engine 测试用 `resolveAuthoritative`。
- trigger-select preview 不再把 preview clone 被修改视为 card listener 的适用信号，适用性只来自返回结果。stage card-effect handler 仍对 clone 执行，不在本门禁范围。工坊自定义 listener 在 isolate 内对序列化 context 执行，无法触及权威对象，但同样经过 interceptor。
- `setup-register-all.ts` 还调用 `guardCardImplListeners(ALL_CARD_IMPLS)`，就地重写每个已注册的 `handler` 与 `deriveCardCostCandidate`，因此大量直接调用 `impl.listeners[i].handler(ctx)` 的定点测试无需手工清单即受保护；就地包装的 handler 再经 `executeCardListener` 派发时只包一次。新的定点测试仍可像 `listener-purity-wave*.test.ts` 那样显式使用 `invokeListenerHandlerUnderGuard` 或 `guardedListener`。`shared/cards/__stubs__` 的 listener stub 在测试侧 ledger 记录观测，效果以返回 leaf 表达。
- 覆盖边界：运行时 guard 只证明被执行到的分支。`pnpm run check:card-impl-boundaries` 作为补充，解析 `ALL_CARD_IMPLS` 中每个 handler 与 `deriveCardCostCandidate` 的函数体，对根为 context 参数的显式写入失败，包括同函数内的别名、`??` / `||` / 三元回退、`.find()` 结果、`for...of` 变量和数组回调参数；同时把 `Object.values` / `Object.entries` / 属性描述符结果及 `Reflect.get` 视为仍根于其参数，把 `Reflect.set` / `deleteProperty` / `defineProperty` 视为写入；不跟踪 helper 或跨文件调用。没有例外清单；需要修改状态的 listener 必须把写入迁到 action leaf。

**多 reaction 同 phase 触发**采用 PARALLEL trigger selection：

- action reaction listener、harvest field stage card-effect、before-end card-effect 在同一 owner / phase 下默认进入 `ParallelNode(mode='trigger-select')`。不同 owner 的同一时机 reaction 拆成各自 owner 的 activation/prompt；单 child 可直接展开以减少 UI 噪音；compute / query hook 保持确定性聚合。
- 不翻转 `mandatory` 默认值；`mandatory: true` 只影响 `ParallelNode(mode='trigger-select')`：当前结构适用且可执行的 mandatory child 会让 `__pass__` disabled，避免 guaranteed effect 被静默跳过。结构暂不适用的 child 本轮不显示且不永久 resolve，后续 sibling 改变资源/状态后会重新评估；当前结构适用但暂时不可支付的 child 仍展示为 disabled，让玩家知道 trigger 存在。
- 多个 optional / interactive trigger 同时可用时，必须显式给卡主玩家选择触发顺序，并允许 pass 跳过剩余 optional trigger。自动 flow 不再在 dispatcher 里与交互 flow 分开排序；是否可继续由 trigger-select preview 与真实 action leaf 校验共同决定。select-trigger option 默认以卡牌 id 作为 `value`；当同一层出现重复 `sourceCard`（同一张卡多个 listener child）时，`value` 改用 activation node id，`sourceCard` 仍保留展示用卡牌 id。
- generic `ParallelNode` 负责 select/pass/mandatory/independent 语义；不再引入 listener-trigger 专用 runtime node。
- `trigger-select` preview 支持 card listener `activate-card`、stage card-effect `activate-card-effect` 和 extra-turn provider `activate-extra-turn` child。card listener child 与 stage card-effect child 都按 child owner / target player 建立 preview state/player；card listener 的 preview 与 activation 都从 child event 的 `targetSpaceId` 解析 `context.space`。纯资源 flow preview 使用该执行玩家的资源与 fence/stable supply token；select-trigger pending 会保留原 host action 的 `targetSpaceId`，确保 activation 执行时 listener 仍看到触发行动格。stage card-effect child 在 cloned state/player 上运行 live hook，返回 flow 或产生 clone mutation 即 applicable/doable，并据此更新 pass disabled 状态。one-shot extra-turn provider 若到真实 activation 时已不再贡献 flow，会 fail 而不是静默消费 provider prompt。
- 不为 `CardListenerRegistration` 引入 / 复活 `order` 排序字段；fallback 稳定顺序来自 `playOrderIndex`（occupation < minor < improvement，数组 index），只服务单 child 展开、显示和确定性序列化。需要玩家选择时用 parallel trigger selection 显式化。

**2026-05-14 bake / trigger-select rule:** `bake-bread` is non-empty by default. Optional bake opportunities must be expressed by outer `optional` flow metadata. `ParallelNode(mode='trigger-select')` displays structurally applicable trigger options, including currently unaffordable options as disabled; disabled choices are server-rejected and remain unresolved. For before-action trigger-select, `__pass__` is disabled only when skipping remaining triggers would leave the action continuation impossible and at least one currently enabled trigger can make the action layer prove the continuation directly complete or reachable through the remaining select before-chain. Pure resource flows pass previewed resources into the continuation guard; non-resource flows ask the same guard with the current resource context, so cards such as D17 / C60 can express reachability through scoped `isDoable` listeners instead of engine-side simulation. The engine asks generic continuation guards and does not import bake-bread / D66 / oven rules; bake-specific direct continuation and before-chain reachability live in the action/card layer. Compact structured choice values such as `bulk:` are allowed through `InteractionRequest.kind === 'choice'` metadata (`structuredChoicePrefixes`), not by engine action-id special cases.

替换选择保留各 listener 的完整替代子树，见 §7.5.1。接受分支后必须履行必需续行，显式可选的内部步骤仍可拒绝。原行动准入不能借用已拒绝替代的 `isDoable` 回退；替代来源只归因到其被选中的分支。同链守卫保留 producer listener ID；放人或移动人物产生新的行动格机会时，`resetComputeReplaceGuards()` 只清除替换记录并保留其他行动上下文，因此新播种机会可以再次使用同一来源，旧替换链仍防止递归重复。

**2026-05-22 before-reachability 决策：** 多个同一时机的 `before` listener 不是 availability 阶段可静态排序或预览的链路；它们属于真实 trigger 流程，顺序由玩家通过 `ParallelNode(mode='trigger-select')` 执行。卡牌如果能让原本不可达的 action 先进入 before 流程，应通过 scoped `isDoable` listener 返回 `doable: true` 表达启动 opt-in，并在 `actionContext.skipBeforeTriggers === true` 的 continuation 中退出。所有 before listener 和它们触发的 after / exchange / optional 分支真实执行完以后，原 action leaf 必须用真实 state 重新做 strict doable 检查；如果仍不可达，不能继续原 action，只能走现有 blocked / undo-only 语义。不要为 before-grant reachability 添加单卡 payment preview，也不要在 dispatcher 中枚举 before listener 顺序或静态模拟资源 / 转换链。参考模型是 C60 Small Potter's Oven / D66 Potter Ceramics / `STUB_BeforeBakeGainClay`：先让 action 进入 trigger-select，玩家按真实顺序执行 unlocker，剩余 trigger 与 pass gate 基于新状态重算，最终 continuation 再严格检查。

**2026-08-29 Provisional Continuation 结算：** 每个公开的 `GameCore` 写命令只经过一次原子 settlement，使用规范化命令身份和完整的命令入口 checkpoint。未完成的 mandatory host 在 `before` 链中首次切换响应玩家或产生 Protected Observation 时，Session 在该命令 checkpoint 开启 Provisional Continuation Scope。Scope 按 Engine 提供的 mandatory-host ancestry 嵌套：同一 host 复用 scope，嵌套 host 建立 child；child abort 只恢复自身 checkpoint，未 guarded parent abort 会恢复整个子树。每个命令边界都以 `skipBeforeTriggers=true` strict-probe 所有 active host；成功后建立 guard，后续破坏 guard 的命令在发布前恢复。Undo history 会保留被恢复 host frame 的身份，因此 settlement 会继续关联原 scope，并原子拒绝破坏既有 guard 的撤销。activation descendants 只抑制产生它的那个 `before` listener，其他 listener 仍可形成真正的 nested host。

**2026-09-01 Mandatory post-host continuation 修订：** mandatory `afterHostCommit` continuation 会把义务传播到每层动态 descendant。任一 descendant 不可执行时进入 `engine-blocked`；`undoStep` 保持普通撤销语义，`undoAction` 作为整个 Rule Action 的回退。若 host choice 来自 Protected Observation 发布后创建的 pending interaction，Session 会在这个已发布的交互 checkpoint 建立 scope。显式 `undoAction` 会回到同一交互和同一缓存结果，撤销 host、支付与 follow-up，记住失败命令并保留 sibling option。它不会恢复到观察之前、重掷结果、按卡牌 ID 分支或改变支付顺序。

随机与隐藏信息通用原语把 observation 报告给当前 settlement；dev 命令把任意隐藏手牌移到公开区域前，也必须先报告这次公开。只有所有仍 active 的 ancestor 都 guarded 时命令才可发布；同一命令已经完成的 host 不再参与 gate，仍 active 的未 guarded ancestor 则会把 GameState、Engine/Session cursor、事件、隐藏区域和 RNG 一并恢复到命令入口。Strict replacement probe 对每个 alternative leaf 使用与 direct action 相同的 `isDoable` hook 与 listener pipeline。规范化失败命令会保留到规则相关状态真正变化。集合语义的命令字段，包括 `commitSelection` 农场元素和动物重整的 `choice.payload.zones`，按与数组顺序无关的方式规范化。耗尽 optional flow 后自动执行的拒绝使用嵌套命令 settlement，因为解析 `__skip__` 仍可能执行后续效果。成功的 provisional 命令，以及需要持久化失败记忆的拒绝命令，携带内部 durable-transition 标记；即使公开 Frame hash 未变化，`RoomCommitter` 仍记录 Replay Step；同时它独立哈希私有 `sessionCursor`，因此普通 cursor-only 转换也会持久化，且不会把 cursor 暴露到 Replay Frame。durable rejection 的错误只发送给提交 socket，其他玩家收到同一已提交版本的无错快照。恢复完成后，公开日志会按原因区分“该选择会破坏必做后续”和“随机或隐藏信息结果暂时不能公开”，解释拒绝原因，并说明在规则状态变化前不能重试。持久化明确分离 authoritative `state`、公开/回放 `frame` 和私有 `sessionCursor`：scope ancestry、rollback checkpoint、guard 与失败记忆可在恢复后继续，但不会进入 Replay Frame；只有同时匹配当前规则状态与 pending interaction 的命令键会作为 `rejectedCommandKeys` 投影给该交互的接收者，由共享客户端提交路径对所有 request kind 禁用精确重试。Scope abort 会追加自身明确的 rollback log 和一个新的恢复 Frame，不重写旧 Step。详见 ADR 0015。

### 7.8 farm-type 提交

5 种 farmType 全在各自 ActionDef.resolveChoice 内闭环（`shared/actions/effects/`）：

- **room** (`construct.ts`)：`room-payment.ts` 展开"每间房"费用变体，并把本次 `computeCosts` 的 `costTrades` / `costBonuses` / `paymentResourceProviders` 附加到 construct `ComplexCost`；farm selection 的 `maxSelections` 也使用同一 adjusted construct cost。多解时二轮 `pay:room:*` prompt finalize；doability 同时检查支付上限和 reachable room selection；direct cancel 由通用 protected-action guard 拒绝。
- **stable / plow** (`stables.ts` / `plow.ts`)：typed flat payment 解析。
- **fence** (`fencing.ts`)：校验选边/来源/连通/封闭区域，得 `newEdges` 后计算 wood（考虑 `freeFences` / `extraWood` / fence-cost-unification 的 farm-choice computeCosts Pass #2），并把该 pass 的 trades/bonuses/paymentResourceProviders/paymentBudget 传入 `pay:fence:*` payment；多解 `pay:fence:*` 二轮 prompt。
- **sow** (`sow.ts`)：validate + finalize（无 payment combo），含 extra-field card effect（`getPermittedExtraSowableFields` + `handleSowExtraField`）。

farmType 第一轮 payload 形态：`fence: {edges, palisadeEdges, extraWood, fenceSources?}` / `room: {rooms}` / `stable: {stables}` / `plow: {tile}` / `sow: {crops}`。WS `{type:'choice', value:'confirm', payload}` 经 `resolveChoice` 透传；二轮时由 `extraData.actionContextWrite: {farmPayload}` 持久化到 `pending.actionContext.farmPayload`，二轮 prompt 解析时 ActionDef 从 `ctx.actionContext.farmPayload` 读回。

`plow.actionContext.allowedTiles` 限制本次可选坐标；`plow.actionContext.adjacencyPolicy` 只表达本次 plow 的邻接策略（`ignore` / `notAdjacentToFields`），不改变后续普通 plow 默认邻接。

### 7.8.1 Fence segment / policy 不变量

`FenceSegment.type` 与 `FenceSegment.source` 是独立维度：`type` 表示边段形态（普通 fence / B30 palisade），`source` 表示这段边来自谁。缺省普通 fence 视为 own ordinary source；B30 Wood Palisades 是不同 segment type；borrowed fence 是 `type='fence'` 且 `source.kind='borrowed'` 的普通边界，不是新 segment type。

fencing 主路径不得按卡牌 id 或单卡开关分支：不要在 `fencing.ts` / farmyard validation 里写 `C1` / `B30` / `E149`、`noWoodPalisades`、`midnightFencer` 这类分支。卡牌特殊行为统一通过 generic `fencePolicy` 表达：`allowedSegmentTypes`、`sourcePolicy`、`segmentBounds`、`newPastureBounds`、`newRegionBounds`、`connectionPolicy`、`allowedNewRegionTiles`、`allowTerrainInNewRegions`、`suppressTerrainRegions`、`costPolicy`、`paymentBudget`、`cancelPolicy`、`preserveAnimalTotals`、`promptHintKey`。

`sourcePolicy: { kind: 'borrowed', donorCaps }` 表示本次 ordinary fence 的 token source、build limit 和 segment source 都由 donor caps 提供。提交 payload 必须用 `fenceSources: Record<edgeId, donorPlayerId>` 为每条新增普通 fence 指定 donor；后端按当前 donor reserve 重新截断 cap，再校验 source key 精确覆盖新增 ordinary edges、donor 不超 cap、不能指向行动玩家自己。成功后新 segment 写入 borrowed source，并通过 `supplyTokensConsumed.fence` 消耗 donor supply；donor 后续 `getOwnOrdinaryFenceReserveCount()` / own ordinary fencing max 会自然下降。`farm.fenceBuilt.fences` 必须带完整新 `FenceSegment[]`，包括 source owner。

`segmentBounds.fence` / `segmentBounds.palisade` 限制各自类型的新建边段；`segmentBounds.total` 限制普通 fence + palisade 的总新建边段。B149 Open Air Farmer 这类 参考实现 `max => 6` 总段数约束必须用 `total.max` 表达，B30 palisade 也计入该上限。`canStartFencing` 先做通用 policy 资源 / supply 可行性估算；在真实 state 中还会用 `validateFenceSelection()` 预检至少一个 legal fence commit，避免 confirm-only pending 无法完成。最终合法性仍由 `validateFenceSelection()` 原子校验并在失败时不支付。

`fencePolicy.costPolicy` 只表达 参考实现 `formatCost` 的本次基础单位成本；entry guard 与最终校验仍要叠加 `computeCosts.fence` 折扣/加价，确保 B93 future fence 这类嵌套 action 可以继续吃 E16 / C16 等围栏折扣。

`fencePolicy.paymentBudget` 只限制最终实付资源，例如 B15 Carpenter's Bench 的“只能使用本次收集的 wood”。它不等同于 `segmentBounds.total.max`，因此合法 fence shape 不能按预算资源数提前裁剪；折扣、免费 fence、虚拟支付资源和 solver 选路完成后，才按 `PaymentSolution.resourcesPaid` 过滤。

`fencePolicy.promptHintKey` 只透传交互提示文案 key，不参与规则裁定；具体 key 由卡牌文件提供，前端只按通用 `promptParams.hintKey` 渲染。

C1 Overhaul 只计数、回收、重建 own ordinary fences：onBuy 先用 `consume-fence` + `sourcePolicy: 'ownOnly'` 返还自己的普通 fence，再用 `fencePolicy` 限制本次 rebuild 只能建 ordinary fence、只消耗 own ordinary supply，并由通用 protected-action guard 拒绝 direct cancel、保留动物总量。

---

## Anytime Window Policy

The set of card-listener anytime actions available in a given pending is computed once per `buildInteraction()` via `computeAnytimePolicy()` (`shared/session/anytime-policy.ts`). The helper is **server-only** — `client/` never imports it.

Inputs (derived by `GameCore.getAnytimePolicyInput()` using the same node + composite fallback as `buildInteraction`):

- `hasActiveContext` — `getActiveInteractionContext()` non-null
- `stageResume` — current frame's `stageResume`
- `interactionKind` — `node?.request?.kind ?? composite?.request?.kind`
- `promptKey` — `node?.promptKey ?? composite?.promptKey`

Output: `{ allowed: false, reason }` or `{ allowed: true, blockedIds }`. The rules are priority-ordered (first match wins): no-context → heating-locked → `confirm-next-player` allowed with `exchange` blocked → `confirm-player-switch` blocked → animal-reorg → exchange/bake-bread promptKey → stage-hook-chain default block → everything else allowed with no blocks.

Three consumers share this snapshot:

1. `buildAnytimeEntries()` — filters the auto-discovered registry + card-listener entries; returns `[]` if `!allowed`, otherwise removes any entry whose id is in `blockedIds`.
2. `buildInteraction()` — derives `'takeAnytimeAction'` inclusion in `allowedCommands` strictly from `allowed && entries.length > 0`, keeping the UI and server views synchronised.
3. `phases/round.ts::takeAnytimeAction()` — server-entry enforcement before any anytime injection. Additional guards (gameOver, draft phase, active-owner mismatch) sit at the function entry; the policy itself only sees pending-shape inputs.

Nested anytime flows are injected ahead of the current pending tree. Parent pending state remains on its original pending host as a `PendingEnvelope`; when the nested flow resolves, `EngineStack` resumes the parent frame and `buildInteraction()` surfaces the parent envelope again instead of going idle.

每个 anytime 入口都在引擎 sequence 内运行，以能力入口 ID 和发起玩家标识。默认情况下，该 sequence 已开始且尚未结束时，`buildAnytimeEntries()` 会跨全部引擎 frame 排除同一玩家的同一入口；直接命令也使用该过滤结果。其他能力（包括同一卡牌的不同能力）仍按普通窗口策略判断。sequence 覆盖 before 效果、支付、主体收益、嵌套选择、动物整理和后置响应，主体收益完成不会解除限制。完成或显式跳过后解除限制，私有游标恢复与撤销保留这一生命周期。窗口中尚未选中的入口不受此限制。费用不足且没有其他合法 anytime 的续行进入既有 blocked / undo 路径。

系统 `ActionDefinition` 与卡牌 `CardListenerRegistration` 都支持 `allowAnytimeReentry?: boolean`。只有 `true` 豁免活动入口限制；窗口策略、归属与操作者检查、费用、使用次数、配方禁用与 continuation guard 仍全部生效。当前仅系统 `exchange` 开启。因此，exchange 引发的动物整理期间可以再次通过 exchange 烹饪，但 B104 配方仍被禁用；exchange／bake 选择、heating 和下一玩家确认期间仍禁止 exchange。喂养支持包含跨玩家选择的嵌套 anytime flow，结束后恢复同一笔尚未支付的喂养余额。新增卡牌例外必须有合法、可达的使用场景及原生 Session 结算和恢复证据，人工测试 listener 只能证明引擎契约。这是设计时要求，不是运行时穷举预检；ADR-0015 当前步骤准入规则保持不变。

同一 Anytime Ability 的商品或目标选项共享入口与限制。D124 和 M126 各提供一个卡牌 anytime 入口，具体选项在内部选择。每次发动结算一件商品或一组兑换；多个选项时先选择，再扣资源或使用标记，只有一个合法选项时沿用普通单选执行行为。反悔使用现有撤销及其可用性边界，不增加取消按钮或批量交互。D124 保留商品不得重复及原有时机规则，M126 保留四枚共享使用标记及原有时机规则。普通 XOR 在嵌套行动后仍保留原候选列表，实际付款使用当前资源；选项变得付不起时沿用既有 blocked / undo 行为。

若 anytime flow 的终止 reaction 必须等整个 injected sequence 完成后才运行，可在最后一个 leaf 上写入 `INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY`。completion listener 必须同时看到该 marker 与引擎添加的 injected-anytime marker，因此空栈顶层 anytime action 不会被误判为 suspended-flow completion。

一次兑换提交可以包含多种配方及各自次数，作为一个 Exchange Batch 结算。如果整批结束后存在新获得且未安置的动物，且来源交互本身不是动物整理，exchange 通过 `internalChildren.afterHostListeners` 安排 `reorganize`，完成后再恢复被暂停的父交互。`CardExchange.blockedAnytimeInteractionKinds` 会复制到各条 `Trade`；系统 anytime 入口将来源请求类型保存在 `actionContext.anytimeInteractionKind`，统一用于准入、候选构造及提交校验（包括 bulk）。被禁用的配方保留 trade 索引，但不提供可执行选项。B104 用三条声明 `fromFarmyard`、`anytime` / `harvest` 及 `animal-reorg` 禁用条件的配方替代独立 listener，沿用包括到期行动准备在内的默认 exchange 窗口，不提供专属计分前机会。

收获喂食请求会发布权威 `exchangeCatalog`。每条记录用稳定的 `(sourceId, exchangeIndex)` 标识当前可用配方，并投影 `from`、`to`、`max` 与 `fromFarmyard`。目录存在时，客户端只按该目录构建兑换草稿，不再从卡牌 metadata 重建动态 listener 提供的兑换。提交前，服务端必须同时匹配最新权威交互投影和按实时状态重建的目录，再进行任何资源修改；嵌套 anytime 结束后恢复喂养时刷新该投影；因此动态 Harvest exchange 能进入 UI，而伪造、过期或超限配方会被原子拒绝。

OA-vs-the reference design notes:

- Reorganize is a system-driven sub-flow in OA (not a player-triggerable anytime) — the policy never produces a `'reorganize'` entry to filter.
- `postReapAnytimeWindow` 是 `onHarvest` 完成后、喂食状态计算前的通用开放窗口。它只查询普通 anytime registry / listener，不含卡牌 ID 分支；每次嵌套 flow 完成后重新计算能力，并跳过没有可执行能力的玩家。
- `futureActionAnytimeWindow` 是到期资源完成真实 `receive` transaction 后、未来行动构造可行性前的窄化标准 `exchange` 窗口。它只对拥有到期 action token 的玩家开放，排除卡牌来源的 anytime 能力，并按实时状态重算且不含卡牌 ID 分支。
- 喂养按收获顺序逐玩家结算。队列只保存玩家序号，不预扣全员食物；轮到该玩家才扣食。`foodUsed` 记录已付款，`remaining` 记录未付需求。合法嵌套 anytime 结束后恢复同一 pending host，刷新兑换目录及动物可用量，不重复预扣；只有玩家的合法喂养机会结束才判断乞讨。已经吃饱且没有收获兑换的玩家不增加确认步骤。
- 普通 anytime 查询与鉴权使用当前 pending 节点的实际归属者；活动的 provisional continuation 保留原有 frame owner 辅助行动窗口及 guard 策略。阶段 synthetic host 与插入其中的真实选择分开处理，跨玩家确认及受保护观察沿用原有边界。
- 官方 Card Effect 可声明只读 `computeResourceCommitments(state, owner)`，从卡内状态派生参与者必须保有的资源。Session 聚合并发承诺，若命令破坏承诺则在发布前恢复命令检查点。这不预扣款、不在 PaymentSolver 锁资，也不放宽 Continuation Guard；卡牌在一次原子成交中解除承诺并交换双方资源，见 ADR-0019。
- 同步兑换反应支持立即执行的 `special-effect` 和 `gain` leaf，不执行 optional、选择或 pending flow。Listener 保持只读，资源和日志通过正常 event sink 产生。
- Idle work-phase turns and `confirm-next-player` are acting-player anytime windows: legal anytime actions remain available before a worker is placed and before control passes to the next player. In `confirm-next-player`, `exchange` stays blocked to avoid recursive generic exchange prompts. `confirm-player-switch` remains blocked because it is a system-controlled cross-player transition inside another flow.
- `stageResume`-bearing stage hook chains default to blocked to preserve the "system-driven hook chains do not yield to player anytime" invariant; the explicit allow-list (`animal-reorg`, exchange/bake-bread promptKey, and D132's `ui.cards.D132_HideFarmer.optional` before-endgame choice prompt) overrides this. D132's nested `resource-quantity-select` prompt stays blocked, because its max is frozen from current food/empty-space state and must not be resumed after arbitrary anytime changes.

---

## 8. shared/cards/ — Card Source 闭环

### 8.1 Card Source + 投影

目标态见 ADR-0002。单卡作者只维护一个 Card Source：

```ts
export const A123_FrameBuilder = defineOccupationCard({
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| 概念 | 形态 | 谁能读取 |
|---|---|---|
| Card Source | `shared/cards/{A..E,major,community}/{Card}.ts`，包含 `meta` + 可选 `impl` | server / sandbox / tests；主 client bundle 禁止 |
| Card Display | 从 Card Source 的 `meta` 构建出的 `public/cards-manifest.json` | 主 client bundle 通过 `client/services/card-meta` 读取 |
| Card Impl | Card Source 的 `impl` 投影进 `shared/cards/catalog.generated.ts` / `CardRegistry` | server / sandbox；主 client bundle 禁止 |

目标态删除 `shared/cards-display/`，不生成 shadow display 目录。`shared/cards/community/*` 与基础牌、major 一样使用单源；`shared/cards/community/auto-catalog.ts` 不再存在。

`meta` 是 Card Definition：只允许可序列化、前端可见、无运行时行为的字段。允许 `cost`、`prerequisite`、`occupationPrerequisites`、`improvementPrerequisites`、`cardField`、`isCookery` 等声明式规则字段；禁止 `modifier` / `modifiers` / `listeners` / `effect` / `prerequisiteCheck`。`desc` 保留卡牌印刷文本；可选且可本地化的 `rules` 独立记录补充裁定或实现限制，不改变运行时行为。`prerequisite` 是印刷文本，结构化静态条件走 `*Prerequisites`，动态条件走 `impl.prerequisiteCheck`。

`impl` 是 Card Impl：包含 `modifiers`、`listeners`、`effect`、`prerequisiteCheck`、helper 调用和 `reaches`。modifier 属于 impl，不属于 Card Display。`reaches` 可由构建器静态提取并投影到 manifest 顶层，但不放进 `meta`。

`scripts/build-cards-manifest.ts` 必须用 TypeScript AST 静态提取 `meta`，禁止 runtime import Card Source 或 generated catalog。`meta` 只允许 JSON-like 字面量和同文件简单常量引用；`impl` 可自由写运行时代码。

### 8.2 Generated catalog + registry

| 文件 | 作用 |
|---|---|
| `shared/cards/catalog.generated.ts` | 从 Card Source 生成 `allCardSources`、`minorImprovementCards`、`occupationCards`、`implemented*`、`ALL_CARD_IMPLS` |
| `shared/cards/active-registry.ts` | `CardRegistry` 单例 |
| `shared/cards/registry.ts` | `CardRegistry` 类（loadByIds / unload） |
| `shared/cards/custom-registry.ts` | server / sandbox 的 `CUSTOM_*` runtime impl + session context / effects / listeners / modifiers |
| `shared/cards/custom-card-metadata.ts` | 前端 `CUSTOM_*` Card Display、art URL、O 编号 |

生产路径只通过 `catalog.generated.ts` 和 `CardRegistry` 访问卡牌；测试允许直接 import 单卡 Card Source 做精确断言。`CardBase` / `MinorImprovement` / `Occupation` / `PlayerActionCard` class 语义目标态删除，使用带 `kind: 'minor' | 'occupation' | 'playerAction' | 'major'` 的 plain Card Definition，并用 `kind` 替代 `instanceof`。

`CardRegistry.loadByIds(ids, lookup)` / `unload(id)` 支持按房间动态装卡。

### 8.3 cardStates 局部状态

- 持续计数 / 单次标记 / 局部状态写入 `player.cardStates[cardId]`，不污染 `PlayerState` 顶层字段。跨多张 FoM 小改良共享的 farmyard space 状态例外落到 `player.farmyardSpaceStates`，只保存后端权威的 blocked space / farmyard goods token / field goods token / non-field crop space 元数据；placement lock 与 farmyard used/unused 由共享 helper 区分。FoM Farmyard Extension 例外落到 `player.farmyardExtensions`，因为它改变共享 farmyard geometry，而不是单卡局部状态。
- 只服务单卡或少数卡牌的历史记录优先落到 `cardStates[cardId].extraData`；如需覆盖卡牌打出前历史，使用显式 hand-zone listener，而不是新增全局 stat。
- 复杂"等待玩家下一步选择"的卡牌交互抽显式 continuation 走 `pending` / `EngineStack.push`，不偷塞共享槽位。
- 推荐结构：`{ cardId, kind:'choice'|'delayedEffect', payload }`。
- 卡牌可在 `cardStates[cardId].extraData.heldWorkerId` 持有 worker（既不在 takenBy 也不在家）；`shared/cards/helpers/card-held-workers.ts` 提供 `holdWorkerOnCard` / `getWorkerHeldOnCard` / `releaseWorkerFromCard` / `getCardHeldWorkerIds`；`returnHome` 阶段统一释放。`family-growth` 可通过 `actionContext.holdNewbornOnCard` 把 newborn 直接放到卡上，避免其在回家前占用行动格或被再次用作容量来源。
- 卡牌可在 `cardStates[cardId].extraData.farmTerrainMarkers` 写入只读 UI marker；FarmBoard 只把 marker 渲染在对应 terrain tile 内，规则仍由后端卡牌状态裁定。
- 卡牌可在目标玩家 `cardStates[sourceCard].extraData.publicCardMarkers` 写入跨玩家公开 marker；helper 汇总后由 scoring 写入 `cardBonusVp`，FarmBoard 只在原玩家摘要区域展示，不把 marker 贴到农场板外侧。

### 8.4 helpers 糖衣层（`shared/cards/helpers/`）

- `pay-gain-node.ts` —— "支付后得收益 / 支付后追加行动 / 返还到当前格再得"模板
- `stage-effects.ts` —— 阶段型 card-effect 标记和每卡一次的可选收获兑换。作坊通过现有 exchange 执行器和交易事件提供使用／跳过流程，查询收获 hook 不会直接消耗材料。
- `card-state.ts` / `round-placement.ts` —— 一次性卡牌 `flagged/extraData`、原始 Work Placement Chronology 与 Person Placement Order；“第 N 个人”排除同一工人搬迁，但包含正常放置的临时人员及召回后再次正常放置的人员。限定第二人放置动作的效果使用 `isCurrentActionSecondPersonPlacement()`，优先对照当前行动上下文的 `placedWorkerId`，缺少该身份时才读取当前 action snapshot，并排除注入的 anytime 上下文。
- `action-snapshot.ts` —— §6.5 定义的当前 Turn Scope 身份和起点快照；按行动计算的 delta 属于 action transaction，不读取这里
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

`shared/cards/helpers/card-field.ts:makeCardFieldImpl(cardId, def, options?)` 注册 Card Field owner 并派生播种集成。单卡只声明配置，以及可选的 `onReap` / `onCropRemoved` owner 副作用回调。

虚拟 tile col 由
`deriveVirtualTileCol(cardId, slotIdx) = deckOrdinal*1000 + cardNumber + slotIdx`
派生，跨 deck 不冲突；同 deck 邻号 capacity 占位需 audit（当前 11 张卡 capacity≤3，安全余量充足）。

卡牌侧接口只有三个入口。`getLogicalFields(player)` 按确定顺序返回不可变投影，包含 Farmyard Field 和所有已打出且已注册的 Card Field，也包含固定容量中的空槽。`getFarmyardFields(player)` 是犁地、围栏、相邻、版图占位与 Field tile 几何规则显式使用的窄查询。`mutateLogicalFields(state, player, options?)` 提供具名的 `place`、`insertBottom`、`grow`、`remove` 与原子 `replace` 操作；它先验证目标，再经 Farmyard 或 Card State owner adapter 写入。

Field storage 接受 grain、vegetable、wood、stone 四种合法 field good。Card Field 的 `allowedCrops` 表示普通 Sow 能力，不是存储 schema。`place` 默认执行该白名单，卡牌效果可显式绕过；普通 Sow 与 `replace` 仍受白名单限制。Owner callback 必须先检查实际 good，再执行特定作物副作用。

Card Field 固定槽存储顶层 `{ crop, remaining }`，可带按底到顶排列的 `below` 层。`insertBottom` 放置牌面授予的作物，不增加播种槽，也不应用普通播种白名单。投影同时提供全部作物层、各槽顶层和稳定身份。普通 Reap 每个非空槽取一枚，额外或整田收割可继续取下层；末枚回调检查所有层。客户端展示底层，但只有顶层映射回原固定槽的选择坐标，空槽不会造成错位。

基础田地计分只统计 Farmyard Field；Card Field 继续参与 Logical Field 规则、播种与收割。

Card Field 无论容量多少都只有一个稳定 Logical Field id 和 `groupKey`；固定槽在其他槽清空后仍保留稳定选择坐标。`card-field.ts` 内的底层 Farmyard adapter 是 Card Impl 代码唯一可直接访问 `PlayerState.fields` 的位置。`check:card-impl-boundaries` 扫描 A–E、Farmers of the Moor、major、community 与生产 helper，不论 receiver 名称都拒绝名为 `fields` 的属性或 bracket 访问，并且没有遗留文件 allowlist。

副作用回调签名：

```ts
onReap?: (ctx: {
  state: GameState
  player: PlayerState
  crop: ExtraSowableCrop
  amount: number
  isLast: boolean
  cardId: string
  trigger: ReapTrigger
  sourceCard?: string
}) => ActionFlow | void

onCropRemoved?: (ctx: {
  state: GameState
  player: PlayerState
  crop: ExtraSowableCrop
  amount: number
  isLast: boolean
  cardId: string
  reason: FarmCropRemovedEvent['reason']
  trigger?: ReapTrigger
  sourceCard?: string
}) => ActionFlow | void
```

`onReap` 只在 reap 时运行，保留收获专属语义；`onCropRemoved` 在每次真实作物移除时运行（包括 reap）。每种作物在共享写入后回调一次，返回的 flow 进入普通 `parallel` reaction。

selection effect 返回移除回调的 `ActionFlow` 时，引擎先完成这个动态 child，再推进 selection 所在父流程的下一个 continuation。因此，被移除作物立即触发的效果总先于移除卡自身的后续行动结算。

`reap` action 是两个存储 owner 唯一共用的收割实现。它遍历 Logical Field 的已有作物槽，统一经过 `computeHarvestCount()`，通过 `mutateLogicalFields()` 持久化移除，并产生一致的资源、Harvest Count application（包括零产出记录）、已收作物/位置/田数、作物事件、通用 listener 与 owner 回调。多槽 Card Field 会收割每个已有作物的槽，但每种作物只按一块 Logical Field 计数。Private Field Phase 用 private trigger 进入同一 action，不写完整 Harvest summary。

当前迁移到该 helper 的 11 张卡：B68 / D75 / E80 / D25 / E72 / C70 / E68 / E69 / E70 /
B113 / B141。

### 8.6 命名 & 约束

- 卡牌文件 `{Deck}_{Number}_{Name}.ts`（例 `A123_FrameBuilder.ts`），导出常量名同卡牌名。
- 卡牌能力**尽量在卡牌文件内部闭环**，不能扩散到 `shared/actions/effects/pay.ts` / `shared/actions/effects/improvement.ts` / `shared/session/session-core.ts` / `server/game/authoritative-session.ts` 等核心文件。
- 优先用 Hook 系统、`CardDefinition` 通用字段（`cost` / `reward` / `prerequisite`）、`cardStates`。
- 禁止：核心文件内针对单卡的 `if-else`；集中式卡牌效果注册表；前端硬编码卡牌特定规则。

运行时跨卡身份/能力读取必须优先落到 `CardDefinition` typed metadata 和 played-card helper：`getPlayedCardDefinitions(player)`、`collectCardDefinitionsAs(player, type)`、`playerHasCardCapability(player, capability, { asType? })` 只检查 `player.improvements` / `player.minorPlayed` / `player.occupationPlayed`，手牌不参与；`asType` 复用 `cardCountsAs`，因此 dual-type card 仍按既有身份语义进入查询。当前已登记的通用 metadata 包括 `preventsHandDiscard`、`fireplaceIdentity`、`cookingHearthIdentity`、`ovenIdentity`、`firewoodBuildTrigger`、`potteryIdentity`、`animalHolder`、`blocksHouseAnimalZones`、`waresSalesmanGains`。这些字段属于 Card Source `meta`，可投影进 catalog / manifest，但不新增前端展示行为。`ovenIdentity` 在 OA 中表达 oven-family identity，包含 Oven Installation 这类 upgrade/minor，供 Oven Damper 等 oven-family 计分使用；这是项目内的有意抽象，不表示每张牌都必须提供 bake exchange 或触发 Firewood，升级牌可用 `firewoodBuildTrigger:false` 保留计分身份但退出 build-trigger 语义。已迁移路径包括 B146/C35 弃手牌禁止、B153 major identity scoring、C75/A27 fireplace/hearth/oven trigger、B31 pottery identity、E144 wares gain options、D86 animal-holder occupation filtering、D12 house animal zone blocking、M72 oven-family scoring。

`check:card-impl-boundaries` 属于 `pnpm run check:architecture`；两份手动 CI workflow 与本机架构验证都复用这个唯一入口。生产 Card Source（包括嵌套普通卡、M、major 和 community） 中的运行时跨非 Major 卡 id 读取必须迁入通用 capability、action context provenance、harvest outcome、breeding threshold modifier、synthetic occupancy、trigger snapshot 等扩展点；`Major_*`、`reaches`、`allowedPurchases` 和 prerequisite candidate list 是明确例外。需要临时审计时可显式传 `--warn-only`，但不能作为合入验证路径。

卡面文字明确点名另一张普通卡时，源卡可以把该目标作为 named printed target 使用；目标 id 必须出现在 `reaches` 或等价声明式 metadata 中，runtime 只允许做存在性 / 拥有者 / 是否已打出这类公开检查。源卡不得读取目标卡 `cardStates` / `counters` / `extraData` 等私有实现状态，也不得据此模拟目标卡能力分支；checker 例外必须绑定具体 source-target pair 和允许的读取形态，不能用粗粒度 allowlist 绕过边界。

### 8.7 Minor improvement passing mechanism

OA 通过 `CardDefinition.passing?: boolean` 标记 参考实现 minor improvement 的"过手"机制。
`shared/actions/effects/improvement.ts` 的 host action 先用 internal `pay` child 完成购买支付，再在 `completeInternalChildren` 阶段读取 payment result map 并提交卡牌购买。passing 卡：

- 不进 buyer.minorPlayed；卡 push 进 `nextPlayer.minorHand`（按 `state.currentPlayerIndex` wrap）
- 不累加 `totalMinorBuilt`、不注入 `activeModifiers`、不触发 `providesOccupation` / `isField` 路径
- emit `card.passed`（`fromPlayerId` / `toPlayerId` / `cardId`）替代 `card.played`
- onBuy 仍通过 internal `activate-card-effect` 的 `afterHostCommitListeners` 执行——买家拿到效果，卡进入下家手牌等待下家自己回合再 actBuy

listener 隔离自然成立：passing 卡不进 `minorPlayed` → `getPlayerCardIds` 自然不含 → "卡进场"反应 skip。
无需 `apply-improvement` effect 或 `extraData.passing` scratchpad；参考实现 passing 行为由 improvement host action / pay child / `activate-card-effect` 三段承担。

客户端：`PublicEventCardPassAnimation` 订阅 `card.passed` events 流，按 `data-card-anchor` / `data-hand-anchor` DOM 锚点播放卡片飞行动画；LogPanel 通过现有 `mapCardPassed` 派生 `log.cardPassed` i18n 条目。

---

## 9. shared/domain/ — 领域聚合层

派生视图 + 不变量校验集中处。`PlayerState` 仍是 JSON 可序列化纯数据，所有"我能不能 X"集中到 `PlayerBoard`。

```
shared/domain/
├── player-board.ts    PlayerBoard（playerBoard 工厂）
├── farmyard.ts        农场规则校验 / normalizePlayerFarm
├── farmyard-interaction.ts  farm-select / farm-position 交互 payload 投影
├── pasture.ts         围栏验证 / computePasturesFromFences
├── animal-zones.ts    动物分区容量与容纳判定（getTotalAnimalCapacity / getPastureCapacity / canAccommodateAnimalTotals）
├── animals.ts         动物模型
├── scoring.ts         计分 / PlayerScoreSummary
├── scoring-reserve.ts 终局 Scoring Reserve 读取 / 汇总 / 扣 scoring clone
├── farm.ts、field.ts、space.ts、farmyard-space-states.ts
└── index.ts
```

`PlayerBoard(player, state)` 暴露 `farmyard`、`farmInteraction`、`animals` 三个子边界。`farmyard` 只做农场规则校验与查询（如 `canPlow` / `canSow` / `canBuildFence` / `canBuildRoom` / `canBuildStable`）；`farmInteraction` 只把当前玩家农场、行动上下文和支付可行性派生成 `farm-select` / `farm-position` `InteractionRequest` payload；`animals` 负责动物分区容量与容纳判定。前端本地 farm draft 只消费服务端给出的 interaction payload，不调用这些规则边界。

域聚合可被三方共用（主 client + sandbox + server），属于 `[A]` 主 bundle 安全层。

`Scoring Reserve` 是终局计分选择占用，不是 Payment Pipeline。卡牌通过 `special-effect.record-scoring-reserve-bonus` 把 `{ reserved, score, cardType? }` 写入目标玩家的 `cardStates[sourceCard].extraData.scoringReserveBonus`；`computeScores()` 先汇总所有已选 Scoring Reserve 并从 scoring clone 扣除，再运行现有 automatic costed-bonus solver。若后续 pre-scoring 行动使玩家无法覆盖合并后的选择，则整组 reserve 及其 bonus entry 改为失效。之后 resource-based major scoring 读取最终 clone 的剩余资源。`ScoreEntry.type='bonus'` 必须携带 `cardId`，并可以携带 `cardType` / `reserved` attribution；当 target player 没有打出 source card 时，`cardType` 由 Scoring Reserve 记录显式提供。

`Card Bonus VP` 的统一 score category 是 `cardBonusVp`：所有由卡牌产生的非印刷 bonus VP 都进入该 category，并尽量在 `ScoreEntry.type='bonus'` 上保留 `cardId` / `cardType` attribution。它不同于 printed Cards VP；卡牌本身印刷分仍进入 `cards` category，compact/live score 也必须保持 `cards` 与 `cardBonusVp` 分离。旧 `cardsBonus`、`cardStateBonusVp`、`cardBonus` score shapes 不保留，客户端和文档都不应读取、合并或兼容这些旧 key。

公开卡牌 marker 也属于 `cardBonusVp`：`publicCardMarkers` 可提供正负分，`ScoreEntry.type='bonus'` 使用 marker 的 `sourceCardId` attribution，不新增独立 score category。

`computePastureCapacityModifiers(player, state)` 返回 pasture capacity modifier 列表，由 `computeAnimalZones` 在创建 pasture zone 时统一应用。modifier 分 `replacement` / `additive` 两类：先按打出顺序应用全部 replacement，再按打出顺序应用全部 additive；因此 D011_LawnFertilizer 这类 size-one pasture replacement 总是在 A012_DrinkingTrough / B072_LoveforAgriculture 这类 additive 前生效，不需要卡牌之间互读 id 或 scratch marker。没有 modifier 时 pasture 容量仍是 `size * 2 * 2^stables`。

`AnimalZone.houseAnimalZone?: boolean` 标记“视作 house 动物区”的非 house zone。`computeAnimalZones` 在所有 `onComputeAnimalZones` 完成后，如果玩家有 `blocksHouseAnimalZones` capability，会统一移除普通 `zoneType === 'house'` 和 `houseAnimalZone === true` 的 zone。House-zone 规则统计必须使用 `isHouseAnimalZone()` / `countHouseAnimals()`，不要再直接读取 `player.houseAnimalCount` 后漏掉 D148_DomesticianExpert 这类 tagged zone。

动物“可容纳”问题统一走 `canAccommodateAnimalTotals(state, player, targetCounts)` 或 add-only wrapper `canAccommodateAllAnimals(state, player, animals)`。它们按最终动物总量搜索合法 zone assignment，允许后续系统 `reorganize` 重新分配；卡牌不得用“当前任一 zone 是否还能塞下一只”的局部判断替代，否则会错误拒绝可通过重整达成的合法状态。搜索会 memoize 已失败的工作区分配状态，避免 M031 这类多候选交换在 impossible late-game farm 上重复枚举等价分支；`exclusiveCardZoneLimit` 也必须在搜索期生效，避免候选被误判为可通过多个同卡 zone 容纳；如果候选本身会永久降低 holder 容量（例如 C148 held 被支付），候选过滤必须用支付后的容量。

`onComputeAnimalZones` card-effect 签名：`(player: PlayerState, zones: AnimalZone[], state: GameState) => AnimalZone[] | void`。第三个 `state` 入参用于读取全局字段（典型场景：A148_Woolgrower / B086_TruffleSearcher 读 `state.completedFeedingPhases` 计入容量），避免每张卡再走 per-card post-play counter。新增 `onComputeAnimalZones` 卡牌可忽略 `state`（使用 `_state` 占位）。`onComputeSharedAnimalZones(owner, animalOwner, zones, state)` 用于 card owner 为其他 animal owner 贡献 borrowed played-card animal zone；shared zone 必须携带或由 `computeAnimalZones` 补齐 `cardId`、`ownerPlayerId`、`animalOwnerPlayerId`、`displayOwnerName` 和 `displaySource:'borrowed-played-card'`，若繁殖归属不同于 Animal Owner，则显式设置 `breedingOwnerPlayerId`。当前卡牌 effect 新增的 `zoneType:'card'` zone 若没有显式 `cardId`，`computeAnimalZones` 会自动补为当前 card id，保证 animal-reorg 写回和可容纳判断使用同一个可持久化 zone 身份。固定动物类型必须显式写 `allowedAnimalType`；`animalType` 是当前可见占用类型，不能被最终总量可容纳搜索当成印刷限制。pasture capacity replacement/additive 不再放在这里，改走 `computePastureCapacityModifiers`。

farm-position backed card zones 和 hosted card zones 可把动物写入 `cardStates[cardId].extraData.animalCountsByZone`。Hosted Card Animal Zone 写入 card owner 的 card state，但统计、支付、capacity search、pending animal 检测和 reorg 操作按 `animalOwnerPlayerId` 归属到 Animal Owner；breeding phase 会把带 `breedingOwnerPlayerId` 的 zone 计入 breeding owner、并从 Animal Owner 的临时繁殖计数中扣除。reorg / capacity rewrite 按 `ownerPlayerId` 路由写回 card owner，同一卡只替换当前 Animal Owner 的 entries，不能清掉其他玩家借用同一卡的动物。所有普通 holder writer 都必须在 `animalCountsByZone` entry 上持久化 `cardId` / `ownerPlayerId` / `animalOwnerPlayerId`，跨玩家扣减只能消费显式属于目标 Animal Owner 的 entry。`serializeState` 会把当前玩家可见的 owner played-card zones、farm-position card zones 和 borrowed played-card zones 分别派生成 `SerializedPlayerState.playedCardAnimalZones`、`farmCardAnimalZones`、`borrowedPlayedCardAnimalZones`，让前端在非 reorg 状态也能展示 owner Played Cards、FarmBoard、Played Cards “by others” 的 0/N 卡牌动物区；active reorg 的 `InteractionAnimalReorgZone` draft 必须透传 owner metadata，覆盖该只读 projection 并启用控件。动物统计和消费 helper（例如 `getAssignedAnimalsByType()` / `subtractAnimalsFromBoard()`）必须同时读写 legacy `animalCounts` / `held` 与 per-zone `animalCountsByZone`，否则后续 reorg 会从 stale per-zone state 重新 hydrate 已消费动物。`exclusiveCardZoneLimit` / `allowedAnimalTypes` 是后端算出的 zone metadata，必须随 `InteractionAnimalReorgZone` 传给前端；前者由统一 reorg helper 阻止超过 limit 的多 zone 分配，后者用于 UI 禁用后端一定会拒绝的动物类型。前端不写具体卡牌 id 规则。

提交重排前校验唯一且已知的 zone id、zone 类型、已启用物种、非负整数数量、数量一致性、混放限制、容量、各物种库存、互斥上限及必空组；非法提交返回可恢复的 `log.reorganizeFail`，状态、历史和交互不变。数组和 `{ zones }` 两种格式均接受；省略区域为空，少分配表示主动弃养。宽容归一化仅用于恢复，不修补非法提交。进入重排时同步已消失或缩容的卡牌存储，但不减少资源总数，失去位置的动物留在待安置区，由玩家安置或弃养。

`AnimalZone.requiredEmptyZoneGroupIds` 在不改变 zone capacity 的前提下声明最终分配约束：每个 group id 至少要有一个 tagged zone 为空，同一 zone 可以属于多个 group。`canAccommodateAnimalTotals()` 在搜索终点检查该约束，pending payload 通过 `InteractionAnimalReorgZone` 透传，`reorganize` 在 mutation 前拒绝非法分配，前端也只做同一套通用确认门禁。卡牌只负责标记 zone，并在打出后形成非法分配时请求重整；共享路径不读取卡牌 id。

farm-position backed card animal zone 使用 `AnimalZone.farmPosition` / `countsFarmyardSpaceAsUnused` / `displaySource:'farm-position'` 进入 `InteractionAnimalReorgZone`，前端 FarmBoard 只把后端给出的 zone 渲染到对应农场格，不自行判断合法格。普通单 zone animal-holder 继续写 `cardStates[cardId].extraData.animalCounts`；同一卡多农场格 zone 写 `cardStates[cardId].extraData.animalCountsByZone[zoneId]`，并随非空 zone 持久化 `capacity` / `allowedAnimalType` / `allowedAnimalTypes` / `farmPosition` 供非 active reorg 状态继续显示。zone 消失时由 animal reorg 写回清理。需要“多个候选格但只能选一个”的卡牌使用 `exclusiveCardZoneLimit`，避免同一卡多个候选 zone 同时容纳动物。

动物支付统一走 `shared/domain/animal-payment.ts`。普通 exchange 扣动物时先让已打出卡牌通过 `consumeAnimalPayment` card effect 消费卡牌局部 marker / holder，再通过 `subtractAnimalsFromBoard()` 扣 farm board、普通 `extraData.animalCounts` animal-holder 和 `animalCountsByZone` farm-position-backed holder，最后才扣会永久损失容量的 counter-backed holder。`AnimalZone.capacityCounterKey` + `capacityLossOnPayment` 表达这类 holder 的容量来源和支付后容量损失；`animalPaymentPreference.prefer` 指向具体 card counter 时，只消费该来源，未命中时不回退扣其他 counter-backed holder；reorg / capacity enforcement 这类系统丢弃动物的路径通过 `onAnimalRemoved` card effect 通知卡牌同步局部 marker，不把具体卡牌状态写进主路径；C148 Mud Wallower 通过该 metadata 暴露 `held` counter，M031 Livestock Market 这类候选过滤只模拟共享支付 helper 后的 player，不读取 C148 私有 `cardStates`。繁殖数量和动物计分的单卡调整分别走 `computeBreedableAnimalCount` / `computeAnimalScoreAdjustment` card effect，核心 breed / scoring path 不读取具体卡牌状态。

**Special-stable card-effect 扩展点**：`getSpecialStablePositions?(state, player) => FarmTilePosition[]` + `applySpecialStable?(state, player, position) => boolean` + `getBuiltSpecialStables?(player) => FarmTilePosition[]`。在 Farm-Expansion 的 Build Stables `farm-select` 里，核心 `shared/actions/effects/stables.ts` 通过 `card-effects.ts` 的 `collectSpecialStablePositions(state, player)`（聚合所有卡的候选，每项带 `sourceCardId`）和 `applySpecialStableAt(state, player, position)`（委派给接受该格的卡，返回 `sourceCardId`）发现并结算这些“非 `stableTiles` 普通格”的特殊 stable。候选注入协议字段 `farmHandPositions`（字段名为前端兼容保留），结算时填 `farm.stableBuilt` item 的 `kind:'special'` + `sourceCardId`。门控为通用的 `actionContext.farmHand === true`——仅 Farm-Expansion stables leaf wrapper 设置，E148 / A089 / C94 等其他“建 stable”入口不提供特殊 stable。当前唯一实现者是 B085_FarmHand（2×2 田地中心），核心 stables 文件不再 import 任何具体卡牌。

第三个并列方法 `getBuiltSpecialStables?(player)`（#200）返回该卡**当前矗立**的特殊 stable 位置（建造前空，D102 / E76 回收后再次为空）。聚合 `collectBuiltSpecialStables(player) => { position, sourceCardId }[]` 遍历所有卡。`serializeState`（`shared/session/serialization.ts`）据此给每个序列化玩家派生**展示派生字段** `SerializedPlayerState.specialStables: { position, sourceCardId }[]`；同一序列化层也派生 `playedCardAnimalZones` / `farmCardAnimalZones` / `borrowedPlayedCardAnimalZones` 供 card animal zone 常驻展示。领域真相仍在 `cardStates` / card effect 计算结果，这些字段只进 snapshot，不进 `PlayerState`/`GameState` 领域顶层，`rehydrateState` 反序列化时显式剥离避免泄漏回权威态。前端 `GameContainerApi` 从 `displayPlayer.specialStables` 派生「已建特殊 stable top-left 集合」传给 FarmBoard，渲染 `.farmhand-center-built` 实心常驻 overlay，无需读任何单卡 `cardStates`。

---

## 10. 其他 shared/ 模块

### 10.1 shared/draft/

`draft-manager.ts` —— 纯函数 simultaneous 卡牌选择：`initDraftState` / `processSubmit` / `tryAdvanceRound` / `finalizeDraft`。`types.ts` 定义 `DraftState` / `DraftPool` / `DraftPickPayload`。`createRoom` 时 `draftMode: 'simultaneous'` + `draftPoolSize: 7..10` 启用。

### 10.2 shared/i18n/

UI 文案 key 与多语言资源；`PromptKey` 在 `shared/contract/prompt-keys.ts` 集中定义。

### 10.3 shared/custom-code/

`ast-validator.ts` —— 用户自定义卡牌 TypeScript 源码 AST 校验（白名单 import / 禁用 API / 网络与 IO 隔离）。listener action 由 `sandbox-listener-actions.ts` 单源定义，prompt、AST validator 与 server/browser manifest 共用。运行期隔离在 `server/custom-code/`。

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

- 一个 Room 只持有一个 `GameSession`；当前 WS `message` handler 同步调用 `dispatch()`，同一 Node 进程内的命令自然串行。
- `room-router` 负责验证、座位授权和调用 `GameSession`，不直接写 `GameState`。
- `payload-validation.ts` 纯校验（`validateResourcePayload` / `validateSingleTilePayload` / `validateMultiTilePayload`），返合法/规范化结果，不写 `GameSession`。
- ADR-0014 实施后，Room 的 `ready | blocked` 写入状态门必须位于命令入口；不增加通用异步命令队列。Durable Room Commit 同步完成，保存重试只能在 Room blocked 时运行。
- 规则命令 `resp.ok=false` 只回发起连接，不增加 `roomVersion` 或 Replay Step，也不向其他座位广播错误。

### 11.2 server/game/ — Room + GameSession

```
server/game/
├── room.ts                    Room { id, session, players, maxPlayers, startedAt }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   大厅 / 房间列表 / 自动加入
├── room-persistence-checkpoint.ts  一秒合并写、完成 / 丢弃生命周期
├── authoritative-session.ts   GameSession extends GameCore — 命令执行中心
└── persistence/
    ├── room-persistence.ts    抽象接口
    ├── sqlite-adapter.ts      data/open-agricola.db / rooms.state_json
    ├── json-adapter.ts        output/<roomId>.json
    └── memory-adapter.ts      测试注入
```

`RoomPlayer { ws, playerIndex, name, userId? }` 是连接实例，非领域 `PlayerState`。`GameSession` 是 `GameCore` 的薄服务端包装，只注入服务端 custom-code executor；连接绑定、广播和持久化不属于它。

固定持久化 dev 房：`dev2` 至 `dev6`。开发房间及其带 UUID 后缀的后继房间不因空闲过期。开发环境启动时，在清理普通房间前清除开发房间的旧到期时间，并为已恢复或新建存档的固定房间重新激活过期上下文；已完成、已下架和已过期的后继房间上下文保持终态。`PERSIST_ROOMS=sqlite`（默认） / `json` 切换 adapter。普通 SQLite 房间在全部玩家离线后，`waiting` 保留 30 分钟、`playing` 保留 7 天；启动恢复覆盖未过期的两种状态，`custom_card_ids` 一并恢复。允许同座位重连替换旧连接。

`roomId` 唯一标识一局游戏：`newGame` 先创建新 `GameSession` 和 UUID，再把在线座位、人数、custom cards、已持久化变体开关及所有连接引用切到新 Room 记录；旧 id 永不复用。首个 `waiting → playing` 转换写入不可变 `started_at`。只有权威 `gameOver` 会在单个 SQLite 事务内写入 `game_results` / `game_result_players` 标量摘要并删除 `rooms.state_json`；TTL、解散、删号和未完成重开只删除可恢复快照，把永久 Game Context 置为 `expired`，不产生结果。归档写失败会回滚，最终全量状态继续保留用于恢复或重试。

`RoomPersistenceCheckpoint` 继续处理等待态、未启用 Replay 的 Room 和非 SQLite adapter。SQLite Replay Room 的成功游戏命令改走 Durable Room Commit：同一事务先写 Room snapshot 与 Replay Step，提交后才广播；WebSocket 关闭时不再为这种 Room 补写旧 checkpoint。

### 11.3 Game Context、Replay 与 Bug Report

本节是跨任务实现契约。`room-committer.ts`、`replay-codec.ts`、七表迁移、SQLite 原子写、Game Context resolver、活动局原座位恢复、公开 Replay/Anchor 读取与不可变 Replay Viewer 已落地；Bug Report 模块由后续任务补齐。

模块：

```
server/game/
├── room-committer.ts          Durable Room Commit 的唯一外部 seam
├── replay-codec.ts            canonical JSON、delta、gzip、Frame Hash
├── game-context-store.ts      lifecycle resolver
├── replay-store.ts            公开 manifest、Segment、Anchor read model
├── replay-viewer-build.ts     Viewer Build 完整性校验
└── persistence/
    └── sqlite-adapter.ts      Room + Replay + Result 的原子事务
server/game-context-routes.ts  lifecycle resolver
server/replay-routes.ts        manifest、Segment、Anchor、Viewer/Asset 静态读取
server/bug-report-routes.ts    draft、GitHub connection、submit/status、audit
server/bug-report/
├── bug-report-store.ts        SQLite draft/attempt/claim 状态机
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

- `resp.ok=false` 绕过提交并只回发起者。成功命令只有在公开 Frame Hash 与私有权威 session-cursor hash 都未变化时才返回 `unchanged`；cursor-only 转换仍持久化 Room snapshot，并记录公开 Frame 可重复的 Step。重连和补拉不创建 Step。
- Replay Step 使用 Room 全局单调 `stepNo`，与 `roomVersion` 分离。多个玩家在同一交互阶段提交时仍串行占用连续 Step；最后一次提交触发的自动引擎结算包含在该 Step 内，规则结果不得依赖提交到达顺序。
- Step 0 在第一个互动命令前建立。classic deal 已包含在 Frame 中；互动 draft、Parent Selection 和显式多人提交从 Step 1 起记录。
- 终局 Frame 额外归档权威 `PlayerScoreSummary[]`；历史 Viewer 在 `gameOver` Step 复用只读 `ScoringPad` 展示分类、卡牌加分与总分。
- Replay Intent 由协议边界的穷尽 switch 白名单化；不保存 `requestId`、token、站点 `userId`、任意原始 WebSocket 消息或未校验 payload。
- 写失败冻结同一 Frame/Intent，Room 进入 blocked 并拒绝新游戏命令；按 1/2/5/10/30 秒、随后每 30 秒重试。暂停期间重连者等待，不读取未提交内存状态。幂等键相同但 Hash 不同永久阻断并报警。
- 单实例上限为 30 个普通内存 Room，`waiting` 与 `playing` 都计数，固定 dev Room 排除。可执行 Workshop Room 因“会话 Worker + 代码 Worker”双 Worker 形态另限 15 个；进程级 15 槽统一计算 WS Room、恢复 Room 与 HTTP sandbox 的 Worker 预留。房间 FIFO 覆盖会话执行直到 Durable Commit 完成，同一连接的换房 / 换座等待在途命令。达到上限只拒绝需要新增对应资源的 Room / `newGame`。内置卡房间不创建会话 Worker，也不增加房间分片、Redis 或外部队列。

完成 Replay 与 Bug Report 使用 ADR-0013 的公开/私有读取契约。GitHub 提交以 SQLite draft、稳定 `submissionId`、attempt 行和原子 claim 实现可恢复执行；生产 GitHub App client 与测试 fake 是 true-external seam 的两个 adapter。

### 11.4 server/custom-code/ — 隔离执行

```
server/custom-code/
├── compiler.ts          TS → JS（ts-blank-space + esbuild）
├── runtime.ts           沙盒运行时
├── engine.ts            hook / phase / scope 校验 + 调度
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

公开 Replay API 返回版本化 JSON，不暴露 SQLite gzip/BLOB 编码。Segment 每次最多展开一个 checkpoint 链并在服务端逐帧验 Hash；Anchor 必须精确匹配 `stepNo + frameHash`。completed、expired、removed resolver 与公开 Replay 在登录门外；active descriptor、恢复、Bug Report、临时证据和维护者取证分别执行 ADR-0013 的座位或管理员授权。外部错误继续使用 ADR-0013 的 `{ ok:false, code, lifecycle?, message }` 判别式结构。

### 11.6 server/workshop.ts + server/workshop-pr/

Workshop / Sandbox 后端（自定义卡上传、编译、PR 集成）。沙盒配置由 SQLite 表 `sandbox_settings` / `sandbox_cards` 持久化，覆盖 `playerCount`、`deckIds`、Through the Seasons、Farmers of the Moor、FoM 小改良不足时是否允许开局，以及 Snake Opening；`POST /api/game/new-sandbox` 读取这些配置并把 `playerCount` / `deckIds` / `customCardIds` / variant flags 交给 `createInitialState()` 统一处理。

### 11.7 数据库

`server/db.ts` —— SQLite 连接（`better-sqlite3`，按 Node 24 ABI 编译）。表：`rooms` / `users` / `sandbox_settings` / `sandbox_cards` / `custom_cards` / `pr_proposals` 等。

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
- `oauth_states`：增加加密 PKCE verifier，复用短期 state/returnTo 生命周期。

不增加 Replay Segment、Reported Evidence payload、quota counter 或 webhook delivery 表。Segment 由 `checkpointStepNo` 表达；`bug_reports.evidence_expires_at` 只在 Context 尚未完成时保护共享 Segment，正常完赛后改用永久 Replay Archive；额度和全站 20 次/分钟 GitHub 发送窗口从 report/attempt 行查询；撤销 webhook 操作本身幂等。

迁移必须幂等回填现有数据：`rooms` 生成 active `game_contexts`，`game_results` 生成 completed `game_contexts`，同一 `roomId` 同时存在时 completed 优先。上线前完成局标记 `legacy_no_replay`，不创建 `game_replays` header、Replay Frame、`schemaVersion` 或 `viewerBuildId`；completed descriptor 仍返回 Game Result Archive 摘要，只有 `replayStatus=available` 才返回 manifest 与 Segment。因此只有两个既有来源都不存在的 id 才返回 `unknown_context`。

### 11.8 GitHub 交付、安全与删除

- 创建 draft 时由服务端确认 Reporter 是 active `room_players` 或 completed `game_result_players` 中的原座位，并固定 `roomId + stepNo + frameHash`。现象 trim 后必须为 1–2000 个 Unicode 字符；不做语法或句号判断；每用户最多保留 5 个尚未丢弃且 Issue 编号未知的报告。
- `github-issue-client` 的 production adapter 只接受服务端固定 Repository ID / Installation ID，不接受客户端 owner、repo、labels 或 URL；所有 GitHub 请求使用 15 秒超时。marker 对账只接受由配置 GitHub App 创建、不早于对应交付尝试且唯一以预期 marker 结尾的 Issue。测试使用 fake adapter，覆盖成功、401、权限 403、限流 403/429、410/422、网络错误、5xx 和不确定结果对账。
- 本人提交使用加密的 GitHub App user token，并要求玩家确认 GitHub 公开作者身份无法由站点删号匿名化；报告持久化确认时的 GitHub 数字用户 id，排队和实际投递都拒绝静默切换账号，账号变化后必须重新确认。Hosted Issue Identity 使用不落盘的 installation token。连接失效绝不自动换作者。token/refresh token 使用 AES-256-GCM、每行独立 nonce/tag 和 `keyId`；PKCE verifier 同样加密且只活到 OAuth state 到期。每用户只保留一个 live Bug Report state；GitHub callback 只把 state/code 放进前端 URL fragment，前端回到原顶层上下文后用分区 session 调用 complete，服务端按当前站点用户消费 state 后才换取令牌。
- SQLite executor 原子 claim 一个 `submissionId`。不确定响应先按正文稳定标记对账；重试和限流遵守 ADR-0012。客户端只轮询站内状态，不直接调用 GitHub。
- Bug Report 底栏请求带当前 `roomId` 的 connection status；只有该用户是原参与者且 Room 已存在 Replay Step 时才启用新建入口。完成局未登录时保留当前 Replay anchor 进入登录，已保存草稿在关联活动局过期或下架后仍可恢复或丢弃。等待局、未录制局和 legacy no-replay 局返回明确的 anchor unavailable，不伪装成非参与者。
- Issue 标题为清洗并截断的 `Game bug: <现象首行>`，正文不包含截图、日志、Frame payload、其他玩家身份或隐藏信息。issues-only 仓库自动化统一添加 `needs-triage`；通知使用 GitHub 原生 watching。
- 主动断开立即删除令牌。只有本地未提交草稿的账号可直接删除草稿和账号；存在连接、公开 Issue 或已进入交付的报告时，删号先持久化 `deletion_pending`、注销全部会话并禁用本地连接，再由同一 installation adapter 修改已知 Issue 正文；失败时后台按持久化状态重试。已放弃但曾提交且 Issue 编号未知的报告先按 marker 对账；GitHub `issues.deleted` webhook 使已删除 Issue 直接完成该项清理。GitHub 回包确认正文不再含站点用户 id 后才清除最终内部关联。
- 维护者全开 evidence 读取必须提供非空理由并写 `bug_report_evidence_audit`，审计行同时保存不受账号外键删除影响的维护者身份快照；每个维护者账号每小时最多读取 30 次。返回证据前复用当前 Participant tombstone 投影；上线前已过期且没有座位快照的证据按全部座位已匿名化处理。`server/game/replay-removal.ts` 在删除 Step payload、匿名化或明确删除 Result 并把 Context 改为 removed 前，先把整次操作作为一条版本化 batch record fsync 追加到数据库外 ledger；batch 分别记录每局的 `eraseResult` 和永久资产下架规则。无换行的末尾残片会回滚，已提交坏行仍 fail-closed。后端监听前和恢复 CLI 都会幂等重放该 ledger，并补录旧备份中新发现的违规资产引用；同 Hash 后续不得再次归档。损坏的无关 Replay 元数据不会阻断 Tombstone 重放，无法证明未引用时只保守保留普通资源。共享内容资源仅在没有其他未下架 Replay 引用时删除，资源本身违规时先下架所有可识别引用局并强制删除。首版不做管理 UI。
- public resolver/manifest/Segment 使用独立 IP 读取额度和响应大小上限；active evidence、Bug Report 和维护者接口按账号限流。任何日志都不得输出 token、Frame payload、现象原文或原始 GitHub 响应。

### 11.9 部署、回滚与观测

生产除现有 SQLite 持久卷外，还必须有三个不会被镜像部署覆盖的位置：

```
replay-viewers/<viewerBuildId>/  不可变历史 Viewer 代码 Build
replay-assets/<sha256>           Replay Card Snapshot 内容资源
replay-removals.jsonl            数据库外删除 ledger
```

完整目标配置：

```
REPLAY_NEW_ROOMS_ENABLED
REPLAY_VIEWER_BUILD_ID
REPLAY_VIEWER_ROOT
REPLAY_ASSET_ROOT
REPLAY_TRUST_PROXY
REPLAY_REMOVAL_LEDGER_PATH
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

当前 Durable Room Commit 读取 `REPLAY_NEW_ROOMS_ENABLED`、`REPLAY_VIEWER_BUILD_ID`、`REPLAY_VIEWER_ROOT`、`REPLAY_ASSET_ROOT` 和 `GAME_BUILD_ID`，启用录制时只接受 SQLite 持久化。创建 Room 时持久化录制决定、两个 Build ID 和自定义卡运行时快照；未发布自定义卡要求玩家明确确认永久公开。Viewer Build ID 必须是完整 `manifest.json` 的 SHA-256，清单固定 `index.html` 入口及目录内每个文件的 SHA-256；Build 只保存 Viewer 代码、样式和卡牌 manifest，棋盘图、卡图和字体与主站使用同一固定素材仓 commit，不归档图片历史；校验失败时拒绝创建。自定义卡图在 Step 0 前复制到内容寻址资源目录并把 Replay header 改写为不可变 URL。录制开启的等待局在 Step 0 建立前拒绝游戏写入。未完成局过期时删除未被有效 Bug Report Anchor 保护的 Replay payload；小时级清理会在 evidence 到期后再次裁剪 Segment、空 header 和无引用内容资源。已有 Replay header 不受后续配置变化影响并继续记录，开关开启后恢复出的旧进行局会以 `missingPrefix=true` 建立 Step 0。

部署顺序固定为：

1. 追加并校验内容寻址 Viewer Build，旧目录不删除。
2. 备份 SQLite、Replay 资源和删除 ledger，运行数据库迁移并核对既有 `rooms` / `game_results` 的 Context 回填数量，部署 recorder-compatible 后端；两个功能开关保持关闭。
3. 启动时为恢复出的旧活动 Room 建立 `missingPrefix=true` 的 Step 0，再开始接受命令。
4. 设置已存在的 `REPLAY_VIEWER_BUILD_ID` 并启用新 Room 录制；任何已有 Replay header 的 Room 此后无条件继续记录。
5. 部署顶层 Game Context Router 和公开 Replay UI。
6. 配置并实测 GitHub App 后启用 Bug Report。

启用录制后，应用只能回滚到支持所有活动 Room `schemaVersion` 的 recorder-compatible 构建；不能回滚到功能上线前后端。Viewer Build 必须先存在，后端才能把其 id 锁进新 Room。缺少 Viewer、持久化不可写或 Room 数达到 30 时，readiness 进入 degraded 并拒绝新建 Room，不牺牲已有 Room。

首版不引入新的 metrics 后端。结构化日志和健康状态至少暴露：普通 Room 数、容量拒绝、Durable Room Commit latency/error/retry、blocked Room 数、Hash 冲突、Replay payload 大小/损坏、GitHub queue/attempt/rate-limit、缺失 Viewer Build。日志字段只含稳定 id 和数值，不含受保护 payload。

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
- `llmPrompts.ts` —— Workshop 卡牌设计师 system prompt；hook / phase / scope / actionId 表运行时从 shared 真相源 + 描述元数据（`sandbox-hook-meta.ts` 等）渲染，不再手工镜像。

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

| 约束 | 可执行覆盖 | 边界 |
|---|---|---|
| `shared` / `server` / `client` 物理分层 | ESLint `architecture/imports` error | 测试目录有显式豁免；只检查 import，不证明 runtime ownership。 |
| Card Source scope 与跨卡引用 | `pnpm run check:card-impl-boundaries` | TypeScript AST 检查生产 Card Source 文件及同文件卡牌 ID 字面量或顶层 const 别名。`Major_*`、`reaches`、购买候选和前置候选是显式例外；不追踪跨文件数据流。source scope 为空或不匹配时失败。 |
| 运行时循环依赖 | `pnpm run check:dependencies` | 所有运行时 SCC、自环和字面量动态导入环都会失败，不保留循环基线。显式 type-only 声明被擦除；verbatimModuleSyntax 下的行内 type specifier 仍加载模块。其他含源码的顶层目录报 `unclassified source root`，但 `git check-ignore` 判定为忽略的未跟踪目录（`.gitignore`、`.git/info/exclude`）除外；已跟踪目录始终计入。 |
| 浏览器与回放隔离 | `pnpm run check:browser-boundaries` | 同时检查两个生产入口的源码传递依赖和真实 Vite 模块图。元数据权限精确到文件并附原因；新增 Worker 入口、越权进入沙盒和入口证据缺失都会失败。 |
| 架构类型契约 | `pnpm run check:architecture-types` | `tsconfig.architecture.json` 对策略与检查器测试执行真正的 no-emit 类型检查，包括正反类型断言；Vitest 运行成功不等于类型通过。 |
| 扫描完整性 | no-DSL、test-project coverage、Card Source 与 field-boundary 检查 | 根目录和语法必须有效；源码声明与全部已注册实现独立比对，支持 major 文件多声明。Parents 保持独立的元数据/运行时模型。 |
| trailing listener snapshot | `pnpm run check:card-impl-boundaries` | 从解析后的 `ALL_CARD_IMPLS` 枚举 handler，其 ID 必须覆盖所有声明了 `impl` 的生产 Card Source。`during`、`immediatelyAfter`、`after` 中直接读取 `improvements` / `minorPlayed` / `occupationPlayed` 长度会失败；非 trailing 读取和 membership 检查仍允许。门禁只解析实际 handler 函数体，不跟踪 helper 调用或派生值。runtime scope 为空、不完整或无法解析时失败；runtime 诊断只标识卡牌与 listener，不伪造原始源码行号。 |
| listener 状态纯净 | 所有会 dispatch listener 的 Vitest project 由 setup 安装的运行时 guard，加 `pnpm run check:card-impl-boundaries` | guard 用深层只读 Proxy（含属性描述符与 `eventQuery` 结果）包裹每次 `executeCardListener` / `invokeCardCostCandidateTransform` 调用以及每个已加载 Card Impl 的 listener 函数本身，任何写入或返回 live 引用都失败；只证明被执行的分支。静态扫描解析每个已解析 handler 与 cost-candidate transform，对根为 context 参数的显式写入失败，仅跟踪同函数别名。两者都不跟踪跨文件数据流，不声称全程序 mutation proof。契约测试：`shared/cards/__tests__/listener-purity-guard.test.ts`、`server/__tests__/listener-purity-gate-session.test.ts`。 |
| 生成目录与 Card Source 一致 | `pnpm run check:generated-cards-sync` | 结构化校验 source/catalog 相等，不硬编码卡牌数量。 |
| `GameSession` 持有服务端命令边界 | `CONTEXT.md`、ADR-0014、review、三层 import error | 这是 ownership，不表示只有一个源文件包含赋值；不声称完成 whole-program mutation proof。 |
| canonical 架构接线 | `pnpm run check:architecture` + `scripts/__tests__/ci-card-impl-boundaries.test.ts` | 两份 CI workflow 仅手动触发且各调用一次 aggregator；当前合入证据来自可信本机全量 CI。 |

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

### 13.3 工程命令

```bash
pnpm install                # canvas 需要系统库 libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
./restart-local.sh       # 本地开发 / 运行 / 测试统一入口（绝对路径启动 tsx + vite，避免跨 worktree pkill 误伤）
pnpm test                   # vitest 全量（fast + slow）
pnpm test:fast              # 只跑 fast project（CI 默认）
pnpm test:slow              # 只跑 slow project（单卡 session 测试）
pnpm run test:e2e           # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run <file> # 单文件
pnpm run lint               # ESLint（error 必须清零）
pnpm run build              # tsc + vite build
```

本地开发统一 Node.js 24.15+ 且不含 Node 25 线（`engines`：`^24.15.0 || >=26.0.0`）；`better-sqlite3` 等原生依赖按 Node ABI 编译。

### 13.4 Replay、恢复与 Bug Report 上线门槛

实现按以下可独立验证的切片推进：

1. 数据库迁移、canonical JSON / delta / gzip / Hash codec。
2. Durable Room Commit、失败暂停/重试、30 Room 容量限制。
3. Game Context resolver、active 原座位恢复、evidence 权限。
4. Replay manifest/Segment、历史 Viewer Build、桌面/手机回放 UI。
5. Bug Report draft、GitHub App connection/queue、三步报告 UI。
6. 匿名化、Tombstone、删除 ledger、部署和生产验收。

自动化必须覆盖：

- codec round-trip、最多 15 delta、提前 checkpoint、Hash mismatch 和损坏 Segment 后续恢复；
- snapshot + Step 原子事务、gameOver 原子完成、相同 Hash 幂等、不同 Hash 阻断、数据库故障暂停与重启恢复；
- 两个同时提交玩家得到连续 `stepNo`，最后提交触发结算且交换到达顺序不改变结果；
- `ok=false` 和 unchanged 只回发起者；提交成功前任何座位都收不到未落盘状态；
- active Room 双座位恢复、座位替换、他人隐藏信息遮蔽、暂停期间重连等待；
- completed/expired/removed/unknown resolver、无登录公开 Replay、Anchor mismatch、缓存与错误码；
- 桌面 auto 时间线布局、手机 auto 棋盘布局、手动 URL 覆盖、视角选择、播放/暂停/前后步/跳转、键盘和 axe；
- OAuth 取消保留草稿、本人/Hosted 作者、稳定标记对账、限流与三次失败、重复点击、断开/撤销；
- 删号 Issue 脱敏、Replay Participant 匿名化、Tombstone、维护者全开理由与永久审计。

最终性能探针在 2 CPU / 2 GiB、真实命令与 Replay 写入负载下重跑 25/30/35，并补跑 30 Room late-state：30 Room 必须满足 action p99 ≤250ms、event-loop p99 ≤100ms、RSS ≤1.8GiB；35 Room 用于确认首个失败点。

生产验收必须由两个真实站点账号完成一局：双方在进行中分别恢复且只能看见自己的隐藏信息；完赛后在未登录浏览器选择两个座位视角和全开视角；再分别用本人 GitHub 和 Hosted Issue Identity 创建 smoke Issue、核对 Anchor/Reporter 字段并关闭。地图在 CI、前后端部署、这些线上步骤和删除/回滚演练全部通过前不关闭。

---

## 14. 关键不变量速查

1. **后端权威**：规则在 `shared/` + `server/`；前端不裁定。
2. **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/`；ESLint CI error 强制。
3. **双 client bundle**：`client-app` 不引 `shared/{engine,session,actions,cards,custom-code,draft}`；sandbox 和 Worker 仅按 `scripts/architecture-policy.mjs` 中的精确入口及文件授权。
4. **WS 游戏主链路**：`/ws` 收 `ClientCommand`，发 `StateUpdateEnvelope`；Game Context、Replay 和 Bug Report 使用版本化 HTTP 产品接口。
5. **InteractionState 是前端唯一真相**：`stateId ∈ {idle, wait, gameover}`；`wait` 下用 `request.kind` 分流。
6. **节点树是唯一状态机**：`PendingAction` union 已消除；"等什么"由 `engine.peekPendingEnvelope()` / pending host 派生。
7. **EngineStack.push / pop**：hook / anytime / 嵌套子流程唯一注入路径，不直接改 `pending`。
8. **卡牌就地闭环**：`shared/cards/{Deck}/{Card}.ts` 内部完成；不改 `shared/actions/effects/pay.ts` / `shared/actions/effects/improvement.ts` / `shared/session/session-core.ts` / `server/game/authoritative-session.ts` 等核心文件。新增 Hook 点必须同时补测试和文档。
9. **cardStates 局部状态**：持续计数 / 标记写 `player.cardStates[cardId]`；后续选择走显式 `pending` / continuation。
10. **不引入循环依赖**。
11. **不为单卡改主路径**。
12. **测试默认 2 人游戏**；规则正确性站后端边界，不通过 DOM 反推规则。
13. **前端不做乐观提交**：等 `stateUpdate` 到达再改 UI。
14. **ActionFlow 对齐 参考实现小代数**：卡牌 DSL 只暴露 `leaf / seq / parallel / xor / or` + metadata；runtime-only node 不进入卡牌 flow。
15. **listener handler 不改 state**：listener / preview / doable 路径只 build flow 或返回结构化结果；状态修改必须落在 action leaf 执行阶段。
16. **Durable Room Commit**：成功且改变公开 Frame 或私有权威 session cursor 的命令先原子写 Room snapshot + Replay Step，随后才按座位视角发送。
17. **Replay 全局 Step**：多人同时提交仍占用连续 `stepNo`；自动结算属于最后触发输入，结果不得依赖到达顺序。
18. **失败不扩散**：`resp.ok=false` 只回发起者；持久化失败冻结同一 Frame 并阻断 Room，不覆盖或继续推进。
19. **30 Room 上限**：单实例统计普通 `waiting + playing` Room；只拒绝新建，不影响恢复。
20. **历史 Viewer 不可变**：Room 锁定 schema/build，完成回放由 credentialless 只读 Viewer 读取，不执行历史规则代码。

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
