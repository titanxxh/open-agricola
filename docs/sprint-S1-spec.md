# Sprint S1 Spec：PendingAction 残留清理 + InteractionNode 骨架 + D-a 序列化

> 基线文档：[`docs/ENGINE_NEW_ARCHITECTURE.md`](./ENGINE_NEW_ARCHITECTURE.md)
> 范围摘要：架构 §15 Sprint S1
> Worktree：`.worktree/sprint-S1-pending-elimination`，分支 `sprint-S1-pending-elimination`

## 1. 范围

7 件事一起做，不允许拆分（接口形状互相约束）：

| # | 内容 | 影响面 |
|---|---|---|
| **R1** | `pausedEngine` ad-hoc 字段升级为 `EngineStack` | `game-core.ts` |
| **R2** | `subFlowKind` 强类型枚举替代 `promptKey` 字面量 discriminator | `shared/game/types.ts`、`game-core.ts`、`reorganize.ts` |
| **R3** | 3 个 `continueAfterReorganize_*` 函数用 `stageResume.extra` 自描述化 | `game-core.ts` |
| **R4** | `__reorganize__` synthetic space 收口为 `__subflow:reorganize` 命名约定 | `game-core.ts` |
| **N1** | 引入 `InteractionNode` 节点 + `InteractionRequest` sum type 骨架 | `shared/engine/`、`shared/game/types.ts` |
| **N2** | `ActionExecutionResult.type === 'choice'` → `'request'`，删除 `'animalReorg'` result type | `shared/game/types.ts`、所有 effect leaf |
| **D-a** | `Engine.snapshotCursor()` + cursor 进 `SerializedGameState` | `engine.ts`、`serialization.ts`、`protocol/game.ts` |
| **P0** | 删 `GameState.pending` + `SerializedGameState.pending` 字段；`GameCore.buildInteraction` 从 engineStack 派生 | `game/types.ts`、`game/serialization.ts`、`game-core.ts` ~50 处 |
| **P1** | 推广 `confirmNextPlayer` + `confirmPlayerSwitch` 到 `InteractionNode` | `game-core.ts`、`game-router.ts`、`room-manager.ts`、`protocol/ws.ts`、`game/types.ts` |
| **P2** | 推广 `harvestFeed` 到 `InteractionNode`（`request.kind = 'feed'`） | `game-core.ts`、`game-router.ts`、`room-manager.ts`、`protocol/ws.ts`、`game/types.ts` |

**本 sprint 不做**（留 S2）：
- farm-select / selection / card-draft 3 种 InteractionRequest kind（feed 在 S1，其余留 S2）
- 删除 `commitFarm` / `commitSelection` 命令（`confirmFeed` 在 S1 删）
- 删除 GameCore.buildPlowInteraction / buildSowInteraction / buildFenceInteraction / buildSelectionInteraction（这些是按 promptKey 嗅探派生 farm/selection 字段；S2 删）
- 协议层 `InteractionState` 8 → 3 stateId 简化 / 前端 ~100 处 codemod
- `cardDraft` 推广
- Session 拆 traits / mixins
- 物理目录搬迁

## 2. 现状摸底

### 2.1 reorganize prototype 留下的具体形状（main HEAD: ce3ed1f0）

```ts
// shared/session/game-core.ts
private pausedEngine: {
  engine: Engine
  engineSource: EngineSource
  activeSpaceId: string
  activePlayerIndex: number
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
} | null = null

// 8 字段 ad-hoc，只支持栈深 ≤ 1
```

`startReorganizeSubFlow()` push（line 487+）；`resumeStageFlow` 的 `case 'onReorganizeComplete'` pop（line 1674+）。

**字符串 discriminator** 当前出现位置：

| 文件 | 行 | 字面量 |
|---|---|---|
| `game-core.ts` | 1781 | `pending.type === 'choice' && pending.promptKey === 'ui.interactionAnimalReorg'` |
| `game-core.ts` | 759 | 同上（buildAnytimeEntries 抑制 anytime） |
| `B104_SheepWalker.ts` | 7-9 | 注释说明 |
| `game-core.ts` | 638 | `spaceId.startsWith('__')` 通配 synthetic space |

3 个 `continueAfterReorganize_*` 函数：`_returningHome`（1571）、`_harvestBreed`（1582）、`_roundEnd`（1591），覆盖 4 种 trigger（anytime / returning-home / harvest-breed / round-end）。

### 2.2 confirmNextPlayer / confirmPlayerSwitch 现状

**触发** 4 处（全部 `game-core.ts`）：
- L1362 `nextPlayerIdx` 切换
- L1365 round-end 切首玩家
- L1608 reorganize round-end 完成后切玩家
- L1780 `playerSwitch` 节点 emit `confirmPlayerSwitch`

**实现** L2436–2495：
- `confirmPlayerSwitch()` 简单：切 activePlayerIndex + 清 deferredPlayerSwitch + runEngineSteps
- `confirmNextPlayer()` **有真实业务**：清 engine/source/space/playerIndex/stageResume + actionStartIndex + history（清 undo）+ turnOwnerPlayerIndex + 跑 skip-next 循环（mirror BGA `stLabor()`）

**协议命令** `shared/protocol/ws.ts:25-28`：
```ts
| { type: 'confirmNextPlayer' }
| { type: 'confirmPlayerSwitch' }
```

**HTTP 路由** `server/game-router.ts:259, 265`、**WS 路由** `server/game/room-manager.ts:1004, 1010`。

### 2.3 Engine snapshot / restore 现有数据

`shared/engine/engine.ts:828, 869`：

```ts
snapshot() returns {
  nodeStates: { id; state: 'ready'|'resolved'|'blocked'; active?: boolean }[]
  pendingChoiceNodeId: string | null
  pendingChoiceActionId: string | null
  pendingChoiceOwnerNodeId: string | null
  pendingChoiceContext: Pick<ActionExecutionContext, 'params'|'costs'|'sourceCard'|'actionContext'> | null
  choiceData: { id; promptKey?; choices: ActionChoiceOption[] } | null
}
```

**结论**：cursor 数据已经全部齐备，只缺 wire 进 `SerializedGameState`。`choiceData` / `pendingChoiceContext` 都是可 JSON 序列化的。

### 2.4 SerializedGameState 当前 schema

`shared/game/serialization.ts:13`：

```ts
type SerializedGameState = Omit<GameState, 'actionSpaces'|'roundStartSnapshot'> & {
  actionSpaces: SerializedActionSpace[]   // 去掉函数字段
  roundStartSnapshot: null
}
```

**完全不含 engine state**——所以"重启冷恢复"靠 `state.pending` 字段（pending ∈ GameState）。S1 后 `pending` 不再存"等什么"，必须靠 `engineStack` cursor 恢复。

### 2.5 EngineSource

`game-core.ts:137-140`：
```ts
type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }
```

已经数据化 + 可 JSON 序列化，无需改造。

## 3. 目标态接口设计

### 3.1 EngineStack（R1）

```ts
// shared/engine/engine-stack.ts （新文件）
export type SubFlowReason = 'reorganize' | 'feed' | 'card-draft' | string  // string for forward-compat

export type EngineFrame = {
  engine: Engine
  source: EngineSource              // { kind: 'action'|'flow', ... }
  ownerPlayerIndex: number
  spaceId: string                   // 真实 spaceId 或 '__subflow:NAME'
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}

export class EngineStack {
  private frames: EngineFrame[] = []

  push(frame: EngineFrame): void
  pop(): EngineFrame | undefined
  current(): EngineFrame | undefined
  depth(): number

  // 序列化
  toCursor(): EngineStackCursor
  static fromCursor(cursor: EngineStackCursor, rebuild: (source: EngineSource) => Engine): EngineStack
}

export type EngineStackCursor = {
  frames: EngineFrameCursor[]
}

export type EngineFrameCursor = {
  source: EngineSource
  engineSnapshot: ReturnType<Engine['snapshot']>   // 复用 §2.3 已有的形状
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}
```

**GameCore 改造**：
- 删除 `pausedEngine` 字段
- 删除 `engine` / `engineSource` / `activeSpaceId` / `activePlayerIndex` / `stageResume` / `deferredPlayerSwitch` 6 个独立字段（迁入 `engineStack.current()`）
- 增加 `private engineStack = new EngineStack()`
- 所有读现有字段的地方改为 `this.engineStack.current()?.xxx`
- 进入子流程：`this.engineStack.push(frame)`
- 出子流程：`this.engineStack.pop()`

### 3.2 SubFlowKind 强类型（R2）

```ts
// shared/game/types.ts （新增 export）
export type SubFlowKind =
  | 'choice'                      // 普通 N 选 1（默认）
  | 'animal-reorg'                // 动物重组
  | 'confirm-next-player'         // 切玩家确认
  | 'confirm-player-switch'       // playerSwitch 节点确认
  // S2 扩展：'farm-select' | 'selection' | 'feed' | 'card-draft'
```

**添加到 InteractionRequest**（见 §3.5）；`promptKey` 退化为纯 i18n。

`isFarmPromptKey()` / `isSelectionPromptKey()` 暂留（S2 删）。`game-core.ts:1781` 等 `promptKey === 'ui.interactionAnimalReorg'` 改为 `request.kind === 'animal-reorg'`。

### 3.3 stageResume.extra 自描述（R3）

```ts
// game-core.ts StageResumeState（修改）
type StageResumeState = {
  hook: ...                       // 现有 24 个 hook 名
  playerIndex: number
  cardIndex: number
  extra?: Record<string, unknown>   // ★ 不再约束字段，开放结构
}
```

`onReorganizeComplete` 的 extra 现在是 `{ trigger, originPlayerIndex }`——保留这种 ad-hoc 结构，但不在类型上限定。

**`continueAfterReorganize_*` 三函数合并**为单一 dispatcher：

```ts
// game-core.ts
private continueAfterSubFlow(frame: EngineFrame): void {
  const stage = frame.stageResume
  if (!stage) return this.runEngineSteps()
  switch (stage.hook) {
    case 'onReorganizeComplete': {
      const trigger = stage.extra?.trigger as ReorganizeTrigger | undefined ?? 'anytime'
      // 内嵌 dispatch（不再独立成 3 个函数）
      if (trigger === 'returning-home') return this.continueReturningHome(stage.playerIndex)
      if (trigger === 'harvest-breed')  return this.continueHarvestBreed(stage.playerIndex)
      if (trigger === 'round-end')      return this.continueRoundEnd(stage.playerIndex, stage.extra?.originPlayerIndex)
      // 'anytime' fallthrough：从 pausedEngine 恢复，已经被 EngineStack.pop() 完成
      return this.runEngineSteps()
    }
    // 其他 23 种 hook（onBeforeHarvest 等）走现有 resumeStageFlow 路径
    default: return this.resumeStageFlow(stage)
  }
}
```

收益：
- `continueAfterReorganize_returningHome / _harvestBreed / _roundEnd` 三个函数留下，但是从 GameCore 的成员方法降为 `continueAfterSubFlow` 内部调用——**不再外部直接 dispatch**
- 新加 sub-flow（feed/draft/...）时只在 `continueAfterSubFlow` 加 case，不增长 GameCore 成员表

### 3.4 `__subflow:NAME` 命名约定（R4）

```ts
// game-core.ts
const SUBFLOW_SPACE_PREFIX = '__subflow:' as const

const subflowSpaceId = (reason: SubFlowReason): string =>
  `${SUBFLOW_SPACE_PREFIX}${reason}`

// startReorganizeSubFlow 把 '__reorganize__' → '__subflow:reorganize'
// getSpaceById 改：spaceId.startsWith(SUBFLOW_SPACE_PREFIX) ? createSyntheticSpace(spaceId) : null
```

`SerializedActionSpace` 不变（synthetic space 不入 actionSpaces array，只在 `getSpaceById` 时按需 create）。

### 3.5 InteractionNode 骨架（N1）

```ts
// shared/engine/nodes.ts （改）
// 不删 ChoiceNode 文件（避免一次大 rename），新增 InteractionNode class，
// ChoiceNode 暂时保留为 InteractionNode 的 type alias（实施过程中渐进切换）
// 但 sprint DoD 要求最终 ChoiceNode 名称在代码中不复存在

// shared/game/types.ts
export type InteractionRequest =
  | { kind: 'choice'; options: ActionChoiceOption[] }
  | { kind: 'animal-reorg'; zones: InteractionAnimalReorgZone[] }
  | { kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | { kind: 'feed'; remaining: number; foodUsed: number; feedQueue?: { index: number; remaining: number; foodUsed: number }[] }

// 在 shared/engine/nodes.ts 内
export class InteractionNode extends LeafNode {
  readonly type = 'interaction' as const
  readonly request: InteractionRequest
  readonly promptKey?: string
  readonly promptParams?: Record<string, unknown>
  readonly sourceCard?: string

  constructor(args: {
    id: string
    request: InteractionRequest
    promptKey?: string
    promptParams?: Record<string, unknown>
    sourceCard?: string
  }) {
    super(args.id)
    this.request = args.request
    this.promptKey = args.promptKey
    this.promptParams = args.promptParams
    this.sourceCard = args.sourceCard
  }

  // 序列化字段全在 toCursor()
}
```

**Engine 适配**：原来 `pendingChoiceNodeId` / `choiceData` 改名 / 扩展为 `pendingInteractionNodeId` / `interactionData`，`interactionData` 携带完整 `InteractionRequest`。

### 3.6 ActionExecutionResult 扩展（N2）

```ts
// shared/game/types.ts
export type ActionExecutionResult =
  | { type: 'ok'; logKey?; resourcesGained?; resourcesPaid?; logParams?; immediateLogs?; extraData? }
  | { type: 'request'; request: InteractionRequest; promptKey?; promptParams?; sourceCard?; extraData? }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow; logKey?; logParams?; immediateLogs?; extraData? }
// ❌ 删除 { type: 'choice' }（迁移到 type: 'request'，request.kind = 'choice'）
// ❌ 删除 { type: 'animalReorg' }（迁移到 type: 'request'，request.kind = 'animal-reorg'）
```

**所有 effect leaf 改造**（约 ~15 处 `type: 'choice'` 调用方）：

```ts
// 旧
return { type: 'choice', promptKey: 'ui.interactionPlow', options: [...] }
// 新
return {
  type: 'request',
  promptKey: 'ui.interactionPlow',
  request: { kind: 'choice', options: [...] },
}
```

`reorganize.ts` 的 `execute()` 已经走 `{ type: 'choice' }`，改为 `{ type: 'request', request: { kind: 'animal-reorg', zones: ... } }`。**注意**：reorganize prototype 现在是 `{ type: 'choice', options: [confirm, cancel?] }` + payload = zones——目标态 `request.kind = 'animal-reorg'` 时 zones 直接进 request.zones（前端从 request 读取可重组的 zones 数据），payload 仍然是用户提交的 ZoneAssignment[]。

### 3.7 D-a：EngineStack cursor 进 SerializedGameState

```ts
// shared/game/types.ts
export type SerializedGameState = ... & {
  engineStack: EngineStackCursor    // ★ required
  // pending 字段保留（暂不删，S2 删——本 sprint 范围是清残留 + 引入 cursor，删 pending 留 S2）
}

// shared/game/serialization.ts
export const serializeState = (state: GameState, sessionContext: { engineStack: EngineStack }): SerializedGameState => {
  // 现有逻辑 + engineStack: sessionContext.engineStack.toCursor()
}

export const rehydrateState = (raw: SerializedGameState): {
  state: GameState
  engineStackCursor: EngineStackCursor
} => {
  // 现有逻辑 + 把 cursor 单独返回（GameSession reconstructor 用）
}
```

**GameSession 恢复路径**（`server/game-session.ts` 或现状的 game-core import）：
1. `rehydrateState(serialized)` → `{ state, engineStackCursor }`
2. 用 `state` 构造 GameCore
3. `gameCore.engineStack = EngineStack.fromCursor(engineStackCursor, src => gameCore.createEngineFromSource(src))`

**注意**：本 sprint 同步删除 `GameState.pending` 和 `SerializedGameState.pending` 字段（见 §3.9）。

### 3.8 删 GameState.pending + buildInteraction 重写（P0）

```ts
// shared/game/types.ts
type GameState = ... & {
  // ❌ pending: PendingAction 字段移除
}

// shared/game/serialization.ts
type SerializedGameState = Omit<GameState, ...> & {
  engineStack: EngineStackCursor   // 见 §3.7
  // ❌ pending 字段不复存在（也不写出去）
}

// shared/session/game-core.ts
class GameCore {
  // ❌ private pending: PendingAction 字段移除
  private engineStack = new EngineStack()
}
```

**`PendingAction` union** 在 `shared/game/types.ts` 仍保留为类型（因为 `shared/protocol/game.ts` 的 `InteractionState` 继续派生输出 `'choice' / 'farmSelect' / 'selection' / 'animalReorg' / 'harvestFeed'` 等 stateId，前端继续按 stateId switch）。但 `GameState` 不再持有 `pending` 字段实例。

**`GameCore.buildInteraction()` 重写**——从 `engineStack` 派生 InteractionState：

```ts
private buildInteraction(): InteractionState {
  const node = this.engineStack.peekInteraction()
  if (!node) return { stateId: 'idle', allowedCommands: [], anytimeActions: [] }

  const playerIndex = this.engineStack.current()!.ownerPlayerIndex
  const spaceId = this.engineStack.current()!.spaceId

  switch (node.request.kind) {
    case 'animal-reorg':
      return { stateId: 'animalReorg', playerIndex, spaceId,
               zones: node.request.zones, allowedCommands: ['resolveChoice', ...], anytimeActions: [] }
    case 'confirm-next-player':
      return { stateId: 'confirmNextPlayer', nextPlayerIndex: node.request.nextPlayerIndex,
               allowedCommands: ['resolveChoice'], anytimeActions: [] }
    case 'confirm-player-switch':
      return { stateId: 'confirmPlayerSwitch', fromPlayerIndex: ..., toPlayerIndex: node.request.toPlayerIndex,
               allowedCommands: ['resolveChoice'], anytimeActions: [] }
    case 'feed':
      return { stateId: 'harvestFeed', playerIndex,
               remaining: node.request.remaining, foodUsed: node.request.foodUsed,
               feedQueue: node.request.feedQueue,
               allowedCommands: ['resolveChoice'], anytimeActions: [...] }
    case 'choice':
      // 兼容现状：promptKey 嗅探派生 farmSelect / selection / 普通 choice
      // S2 改成 wait + request kind
      const promptKey = node.promptKey
      if (isFarmPromptKey(promptKey)) return this.buildFarmInteractionFromNode(node, playerIndex, spaceId)
      if (isSelectionPromptKey(promptKey)) return this.buildSelectionInteractionFromNode(node, playerIndex, spaceId)
      return { stateId: 'choice', playerIndex, spaceId, options: node.request.options,
               promptKey, ..., allowedCommands: ['resolveChoice', ...], anytimeActions: [...] }
  }
}
```

**所有 ~50 处 `this.pending.type === '...'` 引用全部改写**：

| 旧 | 新 |
|---|---|
| `this.pending.type === 'choice'` | `this.engineStack.peekInteraction()?.request.kind === 'choice'` |
| `this.pending.type === 'animalReorg'` | `this.engineStack.peekInteraction()?.request.kind === 'animal-reorg'` |
| `this.pending.type === 'harvestFeed'` | `this.engineStack.peekInteraction()?.request.kind === 'feed'` |
| `this.pending.type === 'none'` | `!this.engineStack.peekInteraction()` |

**前端零改动**：协议层 `InteractionState` 8 个 stateId 输出不变，前端按 stateId switch 继续工作。S2 才简化 InteractionState + 前端 codemod。

### 3.9 confirmNextPlayer + confirmPlayerSwitch + harvestFeed 推广（P1 + P2）

P1（confirm-next-player / confirm-player-switch）和 P2（harvestFeed → feed）共用同一模式：触发用 InteractionNode + 业务在 GameCore 私有方法 + dispatch.switch 按 `request.kind` 路由。下面以 confirmNextPlayer 为例，feed / confirmPlayerSwitch 同理。


**之前**（S1 前）：

```ts
// 触发
this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }

// 处理
confirmNextPlayer(): SessionResponse {
  if (this.pending.type !== 'confirmNextPlayer') return ...
  this.pushHistory()
  // ... 25 行业务逻辑（清 engine/state，跑 skip-next 循环）
}

// 协议命令
{ type: 'confirmNextPlayer' }
```

**之后**（S1，决议走 GameCore 私有方法 + InteractionNode 触发）：

```ts
// 触发：GameCore 直接构造 InteractionNode 注入当前 engine（不开新 frame）
private startConfirmNextPlayer(nextPlayerIndex: number): void {
  const node = new InteractionNode({
    id: nextNodeId(),
    request: { kind: 'confirm-next-player', nextPlayerIndex },
    promptKey: 'ui.confirmNextPlayer',
  })
  this.engineStack.current()!.engine.injectInteraction(node)
  // runEngineSteps() 后 yield 给客户端
}

// 处理：dispatch({ kind: 'resolveChoice' }) 按 request.kind switch
dispatch(cmd: Command): SessionResponse {
  if (cmd.kind === 'resolveChoice') {
    const node = this.engineStack.peekInteraction()
    switch (node?.request.kind) {
      case 'confirm-next-player':
        return this.handleConfirmNextPlayerResolved(node.request.nextPlayerIndex)
      case 'confirm-player-switch':
        return this.handleConfirmPlayerSwitchResolved(node.request.toPlayerIndex)
      case 'feed':
        return this.handleFeedResolved(cmd.payload as FeedSelections)   // 见 §3.10
      case 'animal-reorg':
      case 'choice':
        return this.forwardToEngine(cmd)   // 走 engine.resolveChoice → action.resolveChoice
      default:
        return this.respond(false, 'no pending interaction')
    }
  }
  ...
}

private handleConfirmNextPlayerResolved(nextPlayerIndex: number): SessionResponse {
  // 25 行业务原样保留（清 engine/source/space/playerIndex/stageResume/actionStartIndex/
  // turnOwnerPlayerIndex/history + BGA stLabor() skip-next 循环），就近访问 this.* 私有字段
}

// 协议命令
{ type: 'resolveChoice' }   // 唯一
```

**为什么不走 internal action 路线**：confirmNextPlayer 的 25 行几乎全是清 GameCore 私有字段（`history`、`actionStartIndex`、`turnOwnerPlayerIndex` 等 session 级 book-keeping）+ BGA `stLabor()` skip-next 循环。这是 session 控制流，不是领域变换。让 internal action 来做要么破坏封装（开放私有字段给 ctx），要么引入"session-callback"新机制。GameCore 私有方法直接、不绕、TypeScript exhaustive check 编译期兜底 switch。

reorganize 走 internal action 是因为它的 25 行是"reshape player.pastures / stableAnimals / resources"——领域状态变换，行动的天然事。两类业务定位不同。

### 3.10 harvestFeed 推广（P2）—— feed kind 详细

**之前** `game-core.ts` L1518 / L2424：

```ts
this.pending = {
  type: 'harvestFeed',
  playerIndex: first.index,
  remaining: first.remaining,
  foodUsed: first.foodUsed,
  feedQueue: feedQueue.slice(1),
}
```

`confirmHarvestFeed(playerIndex, selections)` L2290+ 是 ~150 行业务（lookupExchange + cappedSelections + 资源 swap + 推进 feedQueue）。

**之后** S1：

```ts
// 触发：startFeedSubFlow
private startFeedSubFlow(playerIndex: number, remaining: number, foodUsed: number, feedQueue?: ...): void {
  const node = new InteractionNode({
    id: nextNodeId(),
    request: { kind: 'feed', remaining, foodUsed, feedQueue },
    promptKey: 'ui.harvestFeed',
  })
  // 当前 EngineStack frame 的 engine 注入；不开新 frame
  // ownerPlayerIndex 由 engineStack.current().ownerPlayerIndex = playerIndex 设置
  this.engineStack.current()!.engine.injectInteraction(node)
  this.engineStack.current()!.ownerPlayerIndex = playerIndex
}

// 处理：dispatch.switch 路由到 GameCore 私有方法
private handleFeedResolved(selections: FeedSelections): SessionResponse {
  // 复用现状 confirmHarvestFeed 的 ~150 行业务（lookupExchange + cappedSelections + swap + 推进 feedQueue）
  // 推进 feedQueue：如果有下一个，调 startFeedSubFlow 进入下一玩家；如果空，调 startBreedPhase
}
```

**协议层 ClientCommand** 删除 `{ type: 'feed', selections }`，统一 `{ type: 'resolveChoice', payload: FeedSelections }`。

**InteractionState** 派生（§3.8 buildInteraction）：`request.kind === 'feed'` 派生 `stateId: 'harvestFeed'` + `remaining/foodUsed/feedQueue` 字段，前端零改动。

## 4. 文件改动清单

| 文件 | 改动 |
|---|---|
| `shared/engine/engine-stack.ts` | 新建 |
| `shared/engine/engine.ts` | `snapshot()` / `restore()` 调整字段名（`pendingChoiceXxx` → `pendingInteractionXxx`）；`peekInteraction(): InteractionNode \| null` 新增 |
| `shared/engine/nodes.ts` | 新增 `InteractionNode` class；**一次 rename** `ChoiceNode` 全部引用为 `InteractionNode`（含 `instanceof`） |
| `shared/engine/index.ts` | 导出 `EngineStack` / `EngineFrame` / `InteractionNode` |
| `shared/game/types.ts` | 新增 `SubFlowKind` / `InteractionRequest`（5 种 kind）/ 修改 `ActionExecutionResult`；**`GameState.pending` 字段删除**；`SerializedGameState` 加 `engineStack: EngineStackCursor`、删 `pending` 字段；`PendingAction` union 类型保留（协议层 InteractionState 仍用） |
| `shared/game/serialization.ts` | `serializeState` 接 sessionContext 参数；`rehydrateState` 返 `{ state, engineStackCursor }`；不再写/读 `pending` 字段 |
| `shared/protocol/ws.ts` | 删 `{ type: 'confirmNextPlayer' }` / `{ type: 'confirmPlayerSwitch' }` / `{ type: 'feed' }` 命令；`resolveChoice` 扩展 `selection?: string; payload?: unknown` |
| `shared/protocol/game.ts` | InteractionState 8 个 stateId 暂不简化（S2）；GameCore.buildInteraction 派生输出 |
| `shared/session/game-core.ts` | 删 `pausedEngine`、6 个独立 frame 字段、`pending` 字段；引入 `engineStack`；`buildInteraction` 重写从 engineStack 派生；`startReorganizeSubFlow` 走 `engineStack.push()`；`startConfirmNextPlayer` / `startConfirmPlayerSwitch` / `startFeedSubFlow` 新增；`resumeStageFlow` 改 `continueAfterSubFlow`；删 `confirmNextPlayer()` / `confirmPlayerSwitch()` / `confirmHarvestFeed()` 方法（业务搬到 private `handleXxxResolved`）；`__reorganize__` → `__subflow:reorganize`；所有 `promptKey === 'ui.interactionAnimalReorg'` 改 `request.kind === 'animal-reorg'`；harvestFeed 触发 2 处（L1518/L2424）改走 `startFeedSubFlow` |
| `shared/actions/effects/reorganize.ts` | `execute()` 改返回 `{ type: 'request', request: { kind: 'animal-reorg', zones } }` |
| `shared/actions/effects/*.ts` | 所有 `{ type: 'choice', options }` 改成 `{ type: 'request', request: { kind: 'choice', options } }`（约 ~15 处） |
| `server/game-router.ts` | 删除 `confirmNextPlayer` / `confirmPlayerSwitch` / `confirmHarvestFeed` HTTP 路由 |
| `server/game/room-manager.ts` | 删除 `confirmNextPlayer` / `confirmPlayerSwitch` / `feed` WS 命令路由；`resolveChoice` 路径承接 |
| `server/game-session.ts` 或对应入口 | 恢复路径调用 `EngineStack.fromCursor()`；删 pending field 引用 |
| `tests/`、`server/__tests__/` | 强制 green 子集：`harvest-session.test.ts` / `harvest-feed-session.test.ts` / `on-end-turn-session.test.ts` / `stage-hook-flow.test.ts` / `reorganize-engine-session.test.ts` / `pending-undo-regression.test.ts` 等改 dispatch 入口；卡牌测试若打断走 skip + 登记 |
| 新增 | `shared/engine/__tests__/engine-stack.test.ts`：栈 push/pop + cursor round-trip |
| 新增 | `shared/game/__tests__/serialization-cursor.test.ts`：完整 serialize → rehydrate 中途子流程 round-trip（reorganize / confirmNextPlayer / feed 三种 kind） |
| `docs/skip-tracker.md` | 新建（Markdown 表，本 sprint 新增 skip 登记） |

## 5. 实施顺序

依赖图：

```
[A] 新增类型/枚举（SubFlowKind / InteractionRequest / EngineStackCursor）
       ↓
[B] EngineStack class + 单测
       ↓
[C] InteractionNode class + Engine 接口适配（peekInteraction）
       ↓
[D] ActionExecutionResult 'request' 扩展 + reorganize.ts 改 emit
       ↓
[E] effect/*.ts 批量从 'choice' → 'request' kind:'choice'
       ↓
[F] GameCore 改：删 pausedEngine + 6 字段 → 用 engineStack
       ↓
[G] R2/R3/R4 清残留：subFlowKind discriminator + stageResume.extra 自描述 + __subflow:NAME
       ↓
[H] D-a：serialization 接 EngineStack + 序列化 round-trip 测试
       ↓
[I] confirmNextPlayer / confirmPlayerSwitch / harvestFeed 推广 + 删命令/路由/方法 + 删 GameState.pending 字段 + buildInteraction 重写
       ↓
[J] 强制 green 子集 codemod + 跑 fast project + 收口 skip 登记
```

每个阶段独立 commit。建议 commit message：
- `feat(engine): introduce SubFlowKind / InteractionRequest types`
- `feat(engine): add EngineStack with cursor round-trip`
- `feat(engine): add InteractionNode + peekInteraction`
- `refactor(actions): migrate ActionExecutionResult choice → request`
- `refactor(actions): batch migrate ~15 effect leaves to request kind`
- `refactor(session): replace pausedEngine + 6 fields with engineStack`
- `refactor(session): subFlowKind enum + stageResume.extra + __subflow naming`
- `feat(serialization): wire engineStack cursor into SerializedGameState (D-a)`
- `refactor(session): promote confirmNextPlayer + confirmPlayerSwitch to InteractionNode`
- `test(forced-green): codemod baseline tests to dispatch resolveChoice`

## 6. 测试策略

按 [`docs/ENGINE_NEW_ARCHITECTURE.md` §13.1](./ENGINE_NEW_ARCHITECTURE.md)：

### 强制 green 子集（每个 commit 必绿）

- `tests/pending-undo-regression.test.ts`
- `tests/protocol-types.test.ts`
- `tests/game-sync-pipeline.test.ts`
- `server/__tests__/harvest-session.test.ts`
- `server/__tests__/on-end-turn-session.test.ts`
- `server/__tests__/stage-hook-flow.test.ts`
- `server/__tests__/reorganize-engine-session.test.ts`
- `server/__tests__/harvest-feed-session.test.ts`
- 所有 `shared/engine/__tests__/`
- 所有 `shared/actions/effects/__tests__/`（不含具体卡牌前缀的）
- `shared/logic/__tests__/`
- 新增的 `engine-stack.test.ts` + `serialization-cursor.test.ts`

### 允许 skip（sprint 期间）

`server/__tests__/{A,B,C,D,E}NN_*-session.test.ts` —— ~254 个卡牌效果测试。

skip 行格式：
```ts
it.skip('某场景', () => { ... })  // SKIP[S1]: confirmXxx → resolveChoice 待 codemod，见 docs/skip-tracker.md
```

### 新增测试

#### engine-stack.test.ts
- push 1 frame → current() 返这个 frame
- push 2 frames → pop 弹后再 current() 返底层
- toCursor() → fromCursor() round-trip 字段全等
- empty stack 的 current() 返 undefined

#### serialization-cursor.test.ts（最关键）
- 启动新游戏 → 走到某个 reorganize sub-flow 中途 → serializeState → rehydrateState → 重建 GameSession → assert engineStack.depth === 1 + interactionNode.request.kind === 'animal-reorg'
- 启动新游戏 → 走到 confirmNextPlayer 等待 → serializeState → rehydrateState → 重建 → assert engineStack 顶层 InteractionNode.request.kind === 'confirm-next-player'
- 启动新游戏 → 普通 ChoiceNode 等待（如 selection-action）→ serialize → rehydrate → assert request.kind === 'choice'

### CI 集成

- `pnpm test:fast` 必须全绿（前提：强制 green 子集 + skip 卡牌测试）
- `pnpm test:slow` 期望"已 skip 数 + 通过数 = 254"，不允许真 fail
- `pnpm run lint` error = 0
- `pnpm run build` 成功

## 7. DoD checklist

### 代码

- [ ] `shared/session/game-core.ts` 不存在 `pausedEngine` 字段
- [ ] `shared/session/game-core.ts` 不存在 `engineSource` / `activeSpaceId` / `activePlayerIndex` / `stageResume` / `deferredPlayerSwitch` 6 个独立字段（全部经 `engineStack.current()`）
- [ ] `shared/engine/engine-stack.ts` 存在并被 game-core 使用
- [ ] `SubFlowKind` 类型导出且 5 种 kind 齐全（`choice / animal-reorg / confirm-next-player / confirm-player-switch / feed`）；不含 `'farm-select' / 'selection' / 'card-draft'`（留 S2）
- [ ] `InteractionRequest` 类型存在且 5 种 kind 全部有触发用例
- [ ] `ActionExecutionResult.type === 'choice'` 在代码中不复存在；`type === 'animalReorg'` 不复存在
- [ ] `ChoiceNode` 类名在代码中不复存在（统一 `InteractionNode`）
- [ ] `GameState.pending` 字段不复存在
- [ ] `SerializedGameState.pending` 字段不复存在
- [ ] `PendingAction.confirmNextPlayer` / `PendingAction.confirmPlayerSwitch` / `PendingAction.harvestFeed` 不复存在
- [ ] `ClientCommand.confirmNextPlayer` / `ClientCommand.confirmPlayerSwitch` / `ClientCommand.feed` 不复存在；`server/game-router.ts` 和 `server/game/room-manager.ts` 路由删除
- [ ] `GameCore.confirmNextPlayer()` / `GameCore.confirmPlayerSwitch()` / `GameCore.confirmHarvestFeed()` 方法不复存在
- [ ] `GameCore.buildInteraction()` 从 `engineStack.peekInteraction()` 派生（不再读 `this.pending`）
- [ ] `promptKey === 'ui.interactionAnimalReorg'` 字面量在 `shared/` 和 `server/` 中不复存在
- [ ] `__reorganize__` 字符串不复存在；synthetic space 全部 `__subflow:NAME`
- [ ] `SerializedGameState.engineStack: EngineStackCursor` required 字段存在
- [ ] `serializeState` / `rehydrateState` 处理 engineStack
- [ ] 所有 effect leaf 的 `{ type: 'request' }` emit 都带 `request: InteractionRequest`

### 测试

- [ ] 「强制 green 子集」全绿
- [ ] `engine-stack.test.ts` 含 ≥ 4 个用例
- [ ] `serialization-cursor.test.ts` 含 ≥ 5 个 sub-flow round-trip 用例（reorganize / confirmNextPlayer / confirmPlayerSwitch / feed / 普通 choice 各 ≥ 1）
- [ ] `docs/skip-tracker.md` 存在；当前 sprint 新增 skip 全部登记
- [ ] PR 描述列出「新增 skip 数 / 累计 skip 数」

### 流程

- [ ] `pnpm test:fast` 全绿（含 skip）
- [ ] `pnpm test:slow` skip 数 + pass 数 = 254
- [ ] `pnpm run lint` error = 0
- [ ] `pnpm run build` 成功
- [ ] `git rebase main` 通过

## 8. 已知未决问题（实施前需 grilling）

### 8.1 confirmNextPlayer 业务逻辑放哪？✅ 决议：B（GameCore 私有方法）

详见 §3.8。25 行业务是 session 控制流（清 GameCore 私有字段 + BGA `stLabor()` 镜像），不是领域变换，不适合走 internal action。InteractionNode 触发 + GameCore.dispatch switch + 私有方法处理。confirmPlayerSwitch 同理。

### 8.2 SerializedGameState.pending 字段 ✅ 决议：删除（仅 1+2，不含 InteractionState 简化）

S1 同步删除 `GameState.pending` 和 `SerializedGameState.pending` 字段。`PendingAction` union 类型仍保留（协议层 `InteractionState` 仍输出 8 种 stateId，前端零改动）。`GameCore.buildInteraction()` 重写为从 engineStack 派生（详见 §3.8）。InteractionState 8→3 简化 + 前端 codemod 留 S2。

### 8.3 `peekInteraction()` 接口暴露在哪 ✅ 决议：选项 2（EngineStack）

`engineStack.peekInteraction()` 内部 forward 到顶层 frame engine。EngineStack 是 sub-flow 抽象的所有者，"等什么"问它最自然。

### 8.4 `ChoiceNode` rename ✅ 决议：选项 A（一次 rename）

S1 全部改 `ChoiceNode` → `InteractionNode`，含 `instanceof ChoiceNode` → `instanceof InteractionNode`。alias 过渡会让后续 codemod 漏掉 instanceof 检查。`ChoiceNode` 名在 S1 完成后不复存在。

### 8.5 harvestFeed S1 推广 vs S2 推广 ✅ 决议：S1 推广（与 PendingAction 字段删除同期）

S1 把 harvestFeed 一并推广到 `InteractionNode + request.kind = 'feed'`，确保 `GameState.pending` 字段彻底消失。S1 InteractionRequest 5 种 kind（choice / animal-reorg / confirm-next-player / confirm-player-switch / feed）。详见 §3.10。S2 只剩 farm-select / selection / card-draft 3 种 kind + 协议层 InteractionState 简化 + 前端 codemod。

---

## 9. 风险

- **R1 + R2 + R3 互斥变更面大**：删 6 个独立字段 + 改 `pending.type` 类型 + 改 promptKey 嗅探 → game-core.ts 改动 ~500 行起步
- **D-a 序列化 round-trip 隐性 bug**：cursor 重建后 engine.tree 节点顺序与原 frame 不一致（某些地方依赖节点 ID 隐式顺序），需要 fixture 测试覆盖
- **confirmNextPlayer `stLabor()` 镜像逻辑搬家**：业务逻辑分散到 internal action 时容易丢 hook 触发或 history clear，这块 reorganize prototype 没有对照
- **协议层兼容性**：客户端代码也调 `confirmNextPlayer` / `confirmPlayerSwitch` 命令——`client/services/*.ts` 的 transport 实现要同步改

## 10. Out-of-scope 复核

S2 范围（不做）：
- farm-select / selection / card-draft 3 种 InteractionRequest kind（feed 已在 S1）
- 删 `commitFarm` / `commitSelection` 命令（`confirmFeed` 已在 S1 删）
- 删 `GameCore.buildPlowInteraction` / `buildSowInteraction` / `buildFenceInteraction` / `buildSelectionInteraction`
- `cardDraft` 推广（harvestFeed 已在 S1）
- Session 拆 traits / mixins
- `selection.ts` 的 `choice.split(',')` 字符串拼接拆除（payload 走结构化）
- 协议层 InteractionState 8 → 3 stateId 简化 / 前端 ~100 处 codemod
- `isFarmPromptKey()` / `isSelectionPromptKey()` 删除
- `PendingAction` union 类型从 `shared/game/types.ts` 删除（S1 已删字段，类型本身随 InteractionState 简化一起删）

S6 范围（不做）：
- `shared/contract/` / `shared/cards-display/` 物理分层
- `client/sandbox/` ESLint 边界
- `shared/game/` / `shared/logic/` 目录消失

S7 范围（不做）：
- 254 个卡牌测试 codemod 修复
- skip-tracker 清空
