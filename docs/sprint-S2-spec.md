# Sprint S2 Spec：InteractionRequest 完整推广 + Session traits 拆分

> 基线：`docs/ENGINE_NEW_ARCHITECTURE.md` §15 Sprint S2
> Lean spec：`docs/superpowers/specs/2026-05-03-sprint-S2-design.md`
> 跨 sprint 契约：`docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md`
> Worktree：`.worktree/sprint-S2-interaction-request`，分支 `sprint-S2-interaction-request`
> 前置：S1 (`sprint-S1-pending-elimination`) 已完成 35 commits（含 carry-overs 到 S2 在 `docs/sprint-S1-progress.md` 登记）

## 1. 一句话目标

S2 完成 `InteractionRequest` 8 种 kind 的完整推广 + `harvestFeed` / `cardDraft` 收口 + `game-core.ts` 拆 4 个 phase mixin，使得 `PendingAction` union 与 `InteractionState` 8 stateId 完全消失，行动层与 protocol 层只认识"InteractionRequest + resolveChoice"一种交互模型。

## 2. 范围

### 2.1 In

| ID | 内容 | 关联 |
|---|---|---|
| **K1** | InteractionRequest 完整 8 kind（`farm-select` / `selection` / `feed` / `card-draft` 落地） | contract §1.2 [L] |
| **K2** | `farm-select` 单一 kind + `farmType` 闭 union（5 种锁定：plow/sow/fence/room/stable）| Q4 决议 |
| **K3** | `selection` kind + `selectionType` 闭 union（farm-position/occupation-hand）| contract §1.3 |
| **K4** | `feed` kind 保持队列内嵌（不拆嵌套 sub-flow）| Q2 决议 |
| **K5** | `card-draft` kind 包装 `shared/draft/draft-manager.ts` 153 行 simultaneous 模型 | Q1 决议 |
| **L1** | 下沉派生逻辑：删 `GameCore.buildPlowInteraction / buildSowInteraction / buildFenceInteraction / buildSelectionInteraction / buildFarmInteraction`，逻辑下沉到 leaf action 的 `execute()` | |
| **L2** | 删 `isFarmPromptKey()` / `isSelectionPromptKey()` 字符串嗅探 | |
| **L3** | `selection.ts` 不再用 `choice.split(',')` 字符串拼接（payload 走结构化字段） | |
| **P1** | protocol `InteractionState` 简化：8 stateId → 3（idle / wait / gameover） | contract §1.4 [L] |
| **P2** | `ClientCommand` 收敛：删 `commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed` / `feed` / `nextPlayer` / `confirmPlayerSwitch`；统一 `resolveChoice` | contract §1.5 [L] |
| **P3** | `promptKey` 保留为闭 `PromptKey` union；`promptParams` 收紧为按 promptKey 的具名 schema（`PromptParams<K>`） | Q5 决议 |
| **P4** | `pending: PendingAction` 字段从 `GameSyncPayload` 删除；`PendingAction` union 类型本身完全删除（S1 留的最后引用清理） | |
| **S1** | `game-core.ts` 拆 `session-core.ts` + 4 个 phase mixin（`Setup` / `Round` / `Harvest` / `Draft`） | Q3 决议 |
| **S2** | mixin 内部 method 边界按本文 §3.6 落地（6 处：runEngineSteps / undo / confirm-* / buildInteraction / continueAfterReorganize_ helpers / resumeStageFlow） | Q-mixin 决议 |
| **S3** | `harvestFeed` 协议路径完全清理：删 3 个 GameCore adapter shim（`confirmNextPlayer/PlayerSwitch/HarvestFeed`）+ `client/services/gameTransport.ts` 重命名 `confirmXxx` → `resolveChoice` | S1 carry-over |
| **S4** | composite emit 包装到 InteractionNode（消除 `Engine.lastEmittedChoice` cache）| S1 Task 10 reviewer S-1 |
| **S5** | `EMPTY_ENGINE_STACK_CURSOR` fallback 删除；`serializeState(state, ctx)` 的 `ctx` 必填 | S1 Task 8 reviewer concern 3 |
| **S6** | `HistoryEntry.pending` 字段保留（S1 reviewer 误判为 dead，实际 `undoStep()` 读 `entry.pending.type === 'choice'`）| S1 progress 已记录 |
| **T1** | 卡牌效果 session 测试 codemod：35 个 S1 skip 中可机械修复的 (`'choice'`→`'request'` shape) 在 S2 顺手 codemod；不可机械的留 S7 | S1 skip-tracker |

### 2.2 Out

- 不做 Payment 收口（S3）
- 不做 `improvement.ts` 瘦身（S3）
- 不做 `shared/domain/` 引入（S4）
- 不做 `shared/logic/farm/*` 迁移（S4）
- 不做物理目录搬迁（contract / cards-display / ESLint 边界）（S6）
- 不做卡牌效果回归（S7）
- 不引入 BGA 风格 pass-around 轮抽（已 [L]）
- 不做 `card-draft` per-connection 视角化（issue #7）
- 不动 hook 注册机制
- 不动卡牌 desc 文案

## 3. 目标态接口设计

### 3.1 InteractionRequest 完整 sum type（K1）

```ts
// shared/game/types.ts （或 shared/contract/protocol/interaction.ts，物理目录留 S6）

export type SubFlowKind =
  | 'choice'
  | 'animal-reorg'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'feed'
  | 'farm-select'
  | 'selection'
  | 'card-draft'

export type FarmSelectType = 'plow' | 'sow' | 'fence' | 'room' | 'stable'      // [L] 闭 union
export type SelectionKind = 'farm-position' | 'occupation-hand'                   // [L] 闭 union

export type InteractionRequest =
  // S1 已落地的 4 kind
  | { kind: 'choice'; options: ActionChoiceOption[] }
  | { kind: 'animal-reorg'; zones: InteractionAnimalReorgZone[] }
  | { kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | { kind: 'feed'
      remaining: number
      foodUsed: number
      feedQueue?: FeedQueueEntry[] }
  // S2 新增 3 kind
  | { kind: 'farm-select'
      farm:
        | { farmType: 'plow'; selectableTiles: FarmTilePosition[] }
        | { farmType: 'sow'; selectableFields: { tile, allowedCrops, sourceCard? }[]; maxSelections? }
        | { farmType: 'fence'; selectableEdges: string[]; extraWood?: number }
        | { farmType: 'room'; selectableTiles: FarmTilePosition[]; maxSelections: number }
        | { farmType: 'stable'; selectableTiles: FarmTilePosition[]; maxSelections: number }
      options?: ActionChoiceOption[]   // 部分 farmType 仍有 confirm/cancel meta-options
    }
  | { kind: 'selection'
      selection:
        | { selectionType: 'farm-position'; selectablePositions: FarmTilePosition[]; minSelections?, maxSelections }
        | { selectionType: 'occupation-hand'; selectableCards: string[]; minSelections, maxSelections }
    }
  | { kind: 'card-draft'
      mode: 'simultaneous'
      round: number
      totalRounds: number
      poolSize: number
      seatOrder: string[]
      pools: Record<string, { occ: string[]; minor: string[] }>   // pid → { occupation hand, minor hand }
      pendingPicks: string[]                                      // 还在等 pick 的 pid
      kept: Record<string, { occ: string[]; minor: string[] }>     // 已选的牌
    }
```

#### 3.1.1 `farm-select` 边界判定（K2 / Q4 C 决议）

按 contract §1.3 易混淆 kind 边界判定表：

- **`choice`**：从预先列举的离散方案挑 1 个（如 "wood / clay / stone" 三选一）
- **`selection`**：从可枚举数据集合挑子集（如 "选 N 张职业牌弃掉"）
- **`farm-select`**：在农场上选格子并执行结构操作（plow / sow / fence / room / stable）

红线：
- 5 种 farmType **闭 union [L]**，新增 farmType 必须开新一轮 brainstorm + 更新 contract
- 卡牌效果"在农场上选格子做某事"——95% 应是 `farm-select`，仅在"选格子作引用、不改农场结构"时用 `selection` (`farm-position`)
- `farmType` 字段是强类型 discriminator，不得用 `farm.farmType.includes(...)` 等字符串嗅探

### 3.2 Protocol InteractionState 简化（P1）

```ts
// shared/game/types.ts

export type InteractionState =
  | { stateId: 'idle'; allowedCommands: ['takeAction', 'newGame', 'loadGame', ...]; anytimeActions: AnytimeAction[] }
  | { stateId: 'wait'
      playerIndex: number          // 等谁
      spaceId?: string              // 当前 frame.spaceId
      promptKey?: PromptKey         // [L] 闭 union（见 §3.4）
      promptParams?: PromptParamsFor<PromptKey>  // 按 PromptKey 派生具名 schema
      sourceCard?: string
      request: InteractionRequest  // 单字段承载所有 kind
      allowedCommands: ['resolveChoice', 'undoStep', 'undoAction', ...]
      anytimeActions: AnytimeAction[] }
  | { stateId: 'gameover'; winners: string[]; scores: PlayerScoreSummary[]; allowedCommands: ['newGame', 'loadGame']; anytimeActions: [] }
```

不存在的旧 stateId（S2 删除）：
- `choice` / `farmSelect` / `selection` / `animalReorg` / `harvestFeed` / `confirmNextPlayer` / `confirmPlayerSwitch`

### 3.3 ClientCommand 收敛（P2）

```ts
// shared/protocol/ws.ts

type ClientCommand =
  | { type: 'action'; spaceId: string }
  | { type: 'resolveChoice'; selection?: string; payload?: ResolveChoicePayload }   // ★ 唯一选择类
  | { type: 'anytime'; actionId: string }
  | { type: 'newGame' | 'loadGame' | 'undoStep' | 'undoAction' | 'devCreatePasture' | ... }

type ResolveChoicePayload =
  | { kind: 'animal-reorg'; zones: ZoneAssignment[] }
  | { kind: 'farm-select'; tiles?: FarmTilePosition[]; edges?: string[]; fields?: SowField[] }
  | { kind: 'selection'; positions?: string[]; cards?: string[] }
  | { kind: 'feed'; selections: FeedSelection[] }
  | { kind: 'card-draft'; pickedOcc?: string; pickedMinor?: string }
  // confirm-next-player / confirm-player-switch / choice 用 selection 字段（'confirm' / option value），无 payload
```

S2 删除：
- `commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed` / `feed` / `nextPlayer` / `confirmPlayerSwitch` / `confirmHarvestFeed`（HTTP）/ `confirmAnimalReorg`（HTTP，已 S1 删）

### 3.4 promptKey 闭 union + promptParams 具名 schema（P3 / Q5 决议）

```ts
// shared/game/prompt-keys.ts （新建）

export type PromptKey =
  | 'ui.interactionAnimalReorg'
  | 'ui.confirmNextPlayer'
  | 'ui.confirmPlayerSwitch'
  | 'ui.harvestFeed'
  | 'ui.interactionPlow'
  | 'ui.interactionSow'
  | 'ui.interactionFence'
  | 'ui.interactionRoom'
  | 'ui.interactionStable'
  | 'ui.interactionSelection'
  | 'ui.interactionOccupationHand'
  | 'ui.interactionCardDraft'
  | 'ui.interactionExchange'
  | 'ui.interactionBakeBread'
  | 'ui.interactionFlowSelect'      // OrNode/XorNode 通用
  | 'ui.interactionOptionalAction'  // OptionalNode 通用
  // 卡牌特定 promptKey 通过 'ui.cards.${cardId}' 命名约定
  | `ui.cards.${string}`

export type PromptParams<K extends PromptKey> =
  K extends 'ui.harvestFeed'           ? { remaining: number; foodUsed: number }
  : K extends 'ui.interactionAnimalReorg' ? { trigger: ReorganizeTrigger }
  : K extends 'ui.interactionSow'       ? { allowedCrops?: CropType[]; needed?: number }
  : K extends 'ui.interactionRoom'      ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionStable'    ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionFence'     ? { extraWood?: number }
  : K extends 'ui.interactionSelection' ? { maxSelections: number; minSelections?: number }
  : K extends 'ui.interactionOccupationHand' ? { maxSelections: number; minSelections: number }
  : K extends `ui.cards.${string}`     ? Record<string, unknown>   // 卡牌特殊场景保留 escape hatch
  : Record<string, never>              // 默认无 params
```

红线：
- 协议层 `promptKey` 字段类型 = `PromptKey`（闭 union），不允许 plain `string`
- `promptParams` 字段类型 = `PromptParamsFor<promptKey>` 条件类型派生
- 现有 i18n key 全部保留（破坏迁移成本太高）；只是协议层加类型约束
- 卡牌特殊文案走 `'ui.cards.${cardId}'` 命名约定，逃逸到 `Record<string, unknown>`

### 3.5 `ChoiceNode` 完全消除（S1 已完成；S2 确认）

S1 已经把 `ChoiceNode` 重命名为 `InteractionNode`。S2 不需要做任何额外清理；DoD 项里 grep 验证 `ChoiceNode` 0 hits。

### 3.6 Session traits 4 mixin 拆分（S1 / S2 / Q3 + 6 处方法边界决议）

#### 3.6.1 文件结构

```
shared/session/
  ├─ session-core.ts                    [~600 行] 跨 phase 共享 + dispatcher
  ├─ phases/
  │   ├─ setup.ts                        [~150 行]
  │   ├─ round.ts                        [~700 行]
  │   ├─ harvest.ts                      [~700 行]
  │   └─ draft.ts                        [~150 行]
  └─ stage-resume.ts                     [~200 行] resumeStageFlow umbrella
```

#### 3.6.2 session-core.ts（主 class GameCore）

包含跨 phase 共用 + dispatch + 序列化：

| 字段 / 方法 | 来源 |
|---|---|
| `private engineStack: EngineStack` | S1 |
| getter: `engine / engineSource / activeSpaceId / activePlayerIndex / stageResume / deferredPlayerSwitch` | S1 |
| `private state: GameState` | |
| `private history: HistoryEntry[]` + `actionStartIndex` + `nextActionToken` | A/B 决议 |
| `pushHistory / restoreHistory / undoStep / undoAction` | B 决议 |
| `recordActionSnapshot` | B 决议 |
| `runEngineSteps()` | A 决议 |
| `dispatch(cmd)` / `resolveChoice(input)` | D 决议 |
| `buildInteraction(): InteractionState` | D 决议 |
| `resumeStageFlow(stage)` | F 决议 |
| `continueAfterSubFlow(frame)` umbrella | E 决议 |
| `clonePending / serializeState / rehydrateState 钩子` | |
| `respond / respondError` | |
| 卡牌 hook 派发（`hookDispatcher.applyXxx`） | |
| mixin 引用：`this.setup` / `this.round` / `this.harvest` / `this.draft` | |

#### 3.6.3 Setup mixin（`phases/setup.ts`）

| 内容 |
|---|
| `init()` 含卡牌注册、cardRegistry / activeRegistry / sessionCardContext |
| 自定义卡注入 |
| `loadState(stateOrSeed)` 入口（含 cursor 恢复）—— 调 session-core.restoreEngineStackFromCursor |
| `getCustomCardDefs()` |
| `updatePlayerName` |

#### 3.6.4 Round mixin（`phases/round.ts`）

| 内容 |
|---|
| `takeAction(playerIndex, spaceId)` |
| 工人放置 / `placeWorker` / `runPlaceFarmerAfterHooks` |
| `confirmNextPlayer/PlayerSwitch` 触发 + handler（C1 决议）：`startConfirmNextPlayer / startConfirmPlayerSwitch / handleConfirmNextPlayerResolved / handleConfirmPlayerSwitchResolved` |
| BGA `stLabor()` skip-next 循环（在 `handleConfirmNextPlayerResolved` 内） |
| `nextPlayerIdx / shouldSkipPlayerTurn` |
| `finalizeActionLog / finalizeCompletedAction` |
| Round transition: round end / round start hook 触发 / first player 切换 |
| `continueAfterReorganize_returningHome`（E2 决议，归 Round） |
| 持有 `turnOwnerPlayerIndex / deferredPlayerSwitch` 的更新逻辑（实际字段在 frame） |

#### 3.6.5 Harvest mixin（`phases/harvest.ts`）

| 内容 |
|---|
| `startHarvest` |
| Field phase: `harvestField / startHarvestFieldPhase / endHarvestFieldPhase` |
| Feed phase: `startHarvestFeedingPhase / startFeedSubFlow / handleFeedResolved / endHarvestFeedingPhase` |
| Breed phase: `startBreedPhase / continueEndHarvestEffects` |
| Animal-bred 检测 + reorganize harvest-breed pivot |
| `continueAfterReorganize_harvestBreed`（E2 决议，归 Harvest） |
| Harvest 系列 stage hook handlers (12 个：`onBeforeHarvest / onAfterReap / onHarvest / onEndHarvest / onAfterHarvest / onStartHarvestFeedingPhase / onHarvestFeedingPhase / onEndHarvestFeedingPhase / onStartHarvestFieldPhase / onHarvestFieldPhase / onEndHarvestFieldPhase / onBreedPhase`) |

#### 3.6.6 Draft mixin（`phases/draft.ts`）

| 内容 |
|---|
| `startDraft` 包装 `shared/draft/draft-manager.ts` 153 行 simultaneous 模型 |
| `startCardDraftSubFlow(playerIndex)` 触发 InteractionNode（kind: 'card-draft'） |
| `handleCardDraftResolved(payload)` 调 `draft-manager.applyPick(...)` |
| draft phase 结束 → `phase: 'draft' → 'work'` 切换 |
| 不引入 BGA pass-around 语义 |

#### 3.6.7 stage-resume.ts（`resumeStageFlow` 大 switch）

session-core.ts 引用：

```ts
import { resumeStageFlow } from './stage-resume'

// 24 个 hook switch，每 case 调对应 mixin method:
//   case 'onBeforeHarvest': return harvest.continueBeforeHarvest()
//   case 'onRoundStart':    return round.continueRoundStart()
//   case 'onEndTurn':       return round.continueEndTurn()
//   ...
```

F 决议：派发逻辑在 session-core，case 体调 mixin method。

#### 3.6.8 `continueAfterSubFlow` umbrella（E 决议）

session-core.ts：

```ts
private continueAfterSubFlow(frame: EngineFrame): void {
  const stage = frame.stageResume
  if (!stage) return this.runEngineSteps()
  switch (stage.hook) {
    case 'onReorganizeComplete': {
      const trigger = (stage.extra?.trigger as ReorganizeTrigger) ?? 'anytime'
      if (trigger === 'returning-home') return this.round.continueAfterReorganize_returningHome(stage.playerIndex)
      if (trigger === 'harvest-breed')  return this.harvest.continueAfterReorganize_harvestBreed(stage.playerIndex)
      if (trigger === 'round-end')      return this.round.continueAfterReorganize_roundEnd(stage.playerIndex, stage.extra?.originPlayerIndex ?? null)
      return this.runEngineSteps()  // anytime fallthrough
    }
    default: return this.resumeStageFlow(stage)
  }
}
```

3 个 helper 各归 mixin（`returningHome` 和 `roundEnd` 均归 Round；`harvestBreed` 归 Harvest）。

### 3.7 cardDraft 包装到 InteractionRequest（K5 / Q1 决议）

```ts
// shared/session/phases/draft.ts

class DraftPhase {
  // 包装现有 shared/draft/draft-manager.ts；不改 manager 内部逻辑
  startDraft(): void {
    const draftState = startSimultaneousDraft(this.session.state)  // existing
    this.session.state.draft = draftState
    this.startCardDraftPrompt()
  }

  private startCardDraftPrompt(): void {
    const node = new InteractionNode(
      this.session.makeNodeId('interaction:card-draft'),
      [],  // no choice options; UI uses `request` data
      {
        kind: 'card-draft',
        mode: 'simultaneous',
        round: this.session.state.draft.round,
        totalRounds: this.session.state.draft.totalRounds,
        poolSize: this.session.state.draft.poolSize,
        seatOrder: this.session.state.draft.seatOrder,
        pools: this.session.state.draft.pools,
        pendingPicks: this.session.state.draft.pendingPicks,
        kept: this.session.state.draft.kept,
      },
    )
    node.promptKey = 'ui.interactionCardDraft'
    this.session.engineStack.push({
      engine: this.session.createFlowEngine({ type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }),
      source: { kind: 'flow', flow: { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID } },
      ownerPlayerIndex: 0,  // simultaneous，不区分；前端按 pendingPicks 派发到具体玩家
      spaceId: subflowSpaceId('card-draft'),
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'card-draft',
    })
    this.session.engineStack.current()!.engine.injectInteraction(node)
  }

  handleCardDraftResolved(playerIndex: number, payload: { pickedOcc?: string; pickedMinor?: string }): SessionResponse {
    applyDraftPick(this.session.state, playerIndex, payload)  // existing draft-manager fn
    if (allPlayersPicked(this.session.state.draft)) {
      advanceDraftRound(this.session.state.draft)
      if (draftComplete(this.session.state.draft)) {
        this.session.engineStack.pop()
        this.session.state.phase = 'work'   // exit draft phase
        return this.session.runEngineSteps()
      }
      // 下一轮，更新 InteractionNode 的 request (重新 inject)
      this.startCardDraftPrompt()
    }
    return this.session.respond()
  }
}
```

S2 删除：
- `PendingAction.cardDraft`（已被 S1 部分清理；S2 完成）
- `'draftSubmit'` `ClientCommand` variant
- `/api/game/draft-submit` HTTP 端点
- `client/services/gameTransport.ts` 中 draft-submit 方法名

UI 改动：`DraftOverlay` 数据源从 `state.draft` 改为 `interaction.request`（kind: 'card-draft'），**不重写**。

### 3.8 leaf action 下沉派生逻辑（L1 / L2）

S2 之前 `farm-select` / `selection` 的 `farm` / `selection` 字段在 `GameCore.buildInteraction()` 由 `buildPlowInteraction / buildSowInteraction / buildFenceInteraction / buildSelectionInteraction / buildFarmInteraction` 集中派生。S2 后这些字段在 leaf action `execute()` 直接 emit。

例：plow leaf

```ts
// shared/actions/effects/plow.ts （重写）

execute: ({ state, player, actionContext }): ActionExecutionResult => {
  const selectableTiles = computePlowableFields(state, player)
  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'plow', selectableTiles },
    },
    promptKey: 'ui.interactionPlow',
  }
}
```

`computePlowableFields` 来自 `shared/logic/farm/plow-validation.ts`（S2 不动，S4 迁入 `domain/`）。

`isFarmPromptKey()` / `isSelectionPromptKey()` 函数全删（DoD 项）。

### 3.9 selection.ts 字符串拼接清理（L3）

S2 之前 `selection.ts` 把 `positions[]` 编码进 `choice` value 字符串（`'pos1,pos2,pos3'`），`resolveChoice` 用 `choice.split(',')` 解析。S2 把 `positions[]` 直接走 `payload.positions` 结构化字段。

```ts
// shared/actions/effects/internal/selection.ts （重写）

execute: ({ player, actionContext }) => {
  const kind = (actionContext?.selectionKind as string) ?? 'farm-position'
  const maxSelections = (actionContext?.maxSelections as number) ?? 1
  const minSelections = (actionContext?.minSelections as number) ?? 1
  if (kind === 'farm-position') {
    return {
      type: 'request',
      request: {
        kind: 'selection',
        selection: {
          selectionType: 'farm-position',
          selectablePositions: getFarmPositions(player),
          maxSelections,
          minSelections,
        },
      },
      promptKey: 'ui.interactionSelection',
      promptParams: { maxSelections, minSelections },
    }
  }
  // occupation-hand 同理
}

resolveChoice: ({ player, sourceCard, actionContext, state }, _selection, payload) => {
  const positions = (payload as { positions?: string[] })?.positions ?? []   // 结构化字段，无 split
  if (sourceCard) writeCardExtraData(player, sourceCard, 'selectedPositions', positions)
  // ...
}
```

DoD：`grep "\.split(','" shared/actions/effects/selection.ts` 0 hits。

### 3.10 composite emit 包装到 InteractionNode（S4）

S1 引入 `Engine.lastEmittedChoice` cache 是为了让 OrNode/XorNode/OptionalNode emit choice 时 `peekInteraction()` 能找到。S2 把这些 composite 节点 emit 时**真正构造 InteractionNode**（而不是 just emit choice via cache）。

```ts
// shared/engine/nodes.ts

class OrNode {
  // 旧实现：emit choice 时直接通过 lastEmittedChoice cache 暴露
  // 新实现：emit 时构造 InteractionNode 加进 children，pendingInteractionNodeId 指向它

  protected emitChoice(options: ActionChoiceOption[], promptKey?: PromptKey, promptParams?): void {
    const node = new InteractionNode(
      this.engine.nextSyntheticNodeId('or-emit'),
      options,
      { kind: 'choice', options },
    )
    node.promptKey = promptKey ?? 'ui.interactionFlowSelect'
    node.promptParams = promptParams
    this.children.unshift(node)  // 或合适位置
    this.engine.pendingInteractionNodeId = node.id
    this.engine.pendingInteractionActionId = INTERACTION_ONLY_ACTION_ID
  }
}
```

S2 完成后：
- `Engine.lastEmittedChoice` 字段删除
- `peekPendingChoiceFromComposite()` getter 删除
- snapshot/restore 不再 round-trip lastEmittedChoice
- `choice-disabled-option.test.ts` 不再访问私有 cache 字段，改用真实 InteractionNode

### 3.11 删除 3 个 GameCore confirm adapter shim（S3 / S1 carry-over）

S1 保留了 `confirmNextPlayer / confirmPlayerSwitch / confirmHarvestFeed` 公开 method 作为 thin adapter（forwarding to handle*Resolved）。S2 删除这 3 个：

需要同时改：
- 68 个 session 测试 codemod：`session.confirmXxx()` → `session.dispatch({ type: 'resolveChoice', ... })`
- `client/services/gameTransport.ts` rename 方法名
- `server/game-router.ts` HTTP 路由删除
- `server/game/room-manager.ts` WS 命令路由删除（已 S1 部分删除）

### 3.12 `EMPTY_ENGINE_STACK_CURSOR` 删除 + ctx 必填（S5）

```ts
// shared/game/serialization.ts

// 删除：
// const EMPTY_ENGINE_STACK_CURSOR: EngineStackCursor = ...

// 改：
export const serializeState = (
  state: GameState,
  ctx: { engineStack: EngineStack },   // 必填，不再 ctx?
): SerializedGameState => { ... }
```

需要同时 codemod：所有非测试 caller 必传 ctx；测试 caller (~30 处) 加 minimal `ctx`（构造空 EngineStack 即可）。

## 4. 文件改动清单

### 4.1 新建

| 路径 | 内容 |
|---|---|
| `shared/session/session-core.ts` | 主 class GameCore（含 dispatch / undo / runEngineSteps / buildInteraction / resumeStageFlow / continueAfterSubFlow） |
| `shared/session/stage-resume.ts` | resumeStageFlow 24-hook switch（实际可在 session-core.ts 内 private method；独立文件视行数定）|
| `shared/session/phases/setup.ts` | Setup mixin |
| `shared/session/phases/round.ts` | Round mixin |
| `shared/session/phases/harvest.ts` | Harvest mixin |
| `shared/session/phases/draft.ts` | Draft mixin |
| `shared/game/prompt-keys.ts` | `PromptKey` 闭 union + `PromptParams<K>` 派生类型 |
| `docs/sprint-S2-spec.md` | 本文 |
| `docs/sprint-S2-plan.md` | 实施计划（spec 通过后写） |
| `docs/sprint-S2-progress.md` | 实施进度（execute 时写） |

### 4.2 修改

| 路径 | 改动 |
|---|---|
| `shared/game/types.ts` | InteractionRequest 加 3 kind（farm-select / selection / card-draft）；InteractionState 简化 stateId；`PendingAction` 类型完全删除；`promptKey` 字段类型从 `string` → `PromptKey`；`promptParams` 类型化 |
| `shared/game/serialization.ts` | `serializeState(state, ctx)` ctx 必填；删 `EMPTY_ENGINE_STACK_CURSOR` fallback |
| `shared/protocol/ws.ts` | 删 `commitFarm/commitSelection/commitChoice/confirmFeed/feed/nextPlayer/confirmPlayerSwitch/confirmHarvestFeed/confirmAnimalReorg/draftSubmit` ClientCommand variants（部分已 S1 删）|
| `shared/protocol/game.ts` | `GameSyncPayload.pending` 字段删除 |
| `shared/session/game-core.ts` | **拆分**为 session-core + 4 mixin（见 §3.6） |
| `shared/engine/engine.ts` | 删 `lastEmittedChoice` cache + `peekPendingChoiceFromComposite()` + snapshot/restore 不再写 lastEmittedChoice |
| `shared/engine/nodes.ts` | OrNode/XorNode/OptionalNode emit 时构造真 InteractionNode（§3.10） |
| `shared/actions/effects/plow.ts / sow.ts / fencing.ts / construct.ts / stables.ts` | leaf action emit `'request'` + `kind: 'farm-select'` + 内嵌 farmType（§3.8） |
| `shared/actions/effects/internal/selection.ts` | payload 结构化（§3.9）|
| `shared/actions/effects/internal/move-farmer-to-space.ts` | 已 emit `'request' + kind: 'choice'`，无需改 |
| `server/game-router.ts` | 删除 confirmXxx HTTP 路由 |
| `server/game/room-manager.ts` | 删除 confirmXxx WS 命令路由 |
| `client/services/gameTransport.ts` | 重命名 `confirmXxx` 方法为 `resolveChoice` |
| `client/components/interaction/*` | 数据源改为 `interaction.request`（按 `request.kind` switch） |
| `client/components/board/DraftOverlay*` | 数据源切到 `interaction.request`（kind: 'card-draft'） |
| 68 个 session 测试 + 35 skip 中可机械修复的 | codemod `session.confirmXxx()` / `'choice'` 形状断言 → `dispatch({ kind: 'resolveChoice' })` / `'request'` 形状 |

### 4.3 删除

| 路径 | 理由 |
|---|---|
| `shared/session/game-core.ts`（原文件）| 拆分到 session-core.ts + 4 mixin 后删除（保留作为入口 re-export 也可，根据 §3.6 决定） |
| `shared/actions/helpers/animal-zones.ts` 中 GameCore.buildXxx 引用的派生函数 | 仍在（S4 才迁），但 GameCore.buildInteraction 不再调（leaf action 自己调）|

## 5. 实施顺序（高层）

```
[A] 类型层：PromptKey + PromptParams + InteractionRequest 3 新 kind 类型定义
       ↓
[B] InteractionState simplification + ClientCommand 收敛（protocol 层）
       ↓
[C] leaf action emit 重写（plow/sow/fence/room/stable/selection）
       ↓
[D] composite emit 包装到 InteractionNode（删 lastEmittedChoice）
       ↓
[E] Session traits 拆分（最大改动；按 6 处方法边界落地）
       ↓
[F] cardDraft 包装到 InteractionRequest
       ↓
[G] harvestFeed 协议清理（删 3 adapter shim + transport rename）
       ↓
[H] EMPTY_ENGINE_STACK_CURSOR 删除 + ctx 必填
       ↓
[I] selection.ts 字符串拼接清理
       ↓
[J] 卡牌测试 codemod（35 skip 中可机械修的）
       ↓
[K] PendingAction 类型删除（最后清理；前面所有引用消除后）
```

每阶段独立 commit；每阶段后跑「强制 green 子集」+ cursor round-trip + fast suite。

## 6. 测试策略

### 6.1 强制 green 子集（每 commit 必绿）

S1 baseline：22 文件 / 143 测试。S2 新增：

- **InteractionRequest 8 kind round-trip 测试**：`shared/game/__tests__/serialization-cursor.test.ts` 新增 farm-select/selection/card-draft 各一条；feed 已存在
- **leaf action emit 单测**：每个 leaf action 单测断言 emit 形状（`expect(result.type).toBe('request'); expect(result.request.kind).toBe('farm-select'); expect(result.request.farm.farmType).toBe('plow')`）
- **Session traits 边界单测**：每 mixin 独立单测，至少覆盖该 mixin 的 1-2 个核心 method
- **promptKey 类型测试**：`tests/protocol-types.test.ts` 新增 `PromptKey` 闭 union + `PromptParams<K>` 派生测试

### 6.2 允许 skip（sprint 期间）

- `confirmXxx → dispatch resolveChoice` codemod 暂时 incomplete 的 session 测试
- card-specific 测试中依赖 `'choice'` shape 但 codemod 复杂的（移交 S7）

每个 PR 描述列「新增 skip 数 / 累计 skip 数」。Skip 数应**减少**（清理 S1 35 skip 中的 ~15-20 个，新增不超过 5 个）。

### 6.3 不允许 skip

- 「强制 green 子集」（S1 §13.1）
- cursor 序列化 round-trip（S1 引入，覆盖 5 kind；S2 扩到 8 kind 后必须 8 kind 全绿）
- protocol-level 单元测试

### 6.4 Fast / slow suite

- `pnpm test:fast` 0 fail 是硬性 DoD
- `pnpm test:slow` 0 fail 是硬性 DoD（S1 残留 13 skip 应清理 ≥ 5 个）
- ci-full（每日 cron）须全绿

### 6.5 codemod 工具（推荐）

- 用 `ts-morph` 或 vitest snapshot transformer 写一次性 codemod 脚本
- 模式：`expect(result.type).toBe('choice')` → `expect(result.type).toBe('request'); expect(result.request.kind).toBe('choice')`
- 模式：`session.confirmXxx(...)` → `session.dispatch({ type: 'resolveChoice', ... })`

## 7. DoD checklist

### 类型 & 协议层

- [ ] `PendingAction` union 类型完全删除（grep 0 hits in `shared/`/`server/`）
- [ ] `InteractionState` 仅含 3 个 stateId（idle / wait / gameover）
- [ ] `InteractionRequest` 8 kind 完整定义（含闭 union `FarmSelectType` / `SelectionKind`）
- [ ] `PromptKey` 闭 union + `PromptParams<K>` 派生类型存在
- [ ] `GameSyncPayload.pending` 字段不存在
- [ ] `ClientCommand` 选择类只剩 `resolveChoice`（grep `commitFarm|commitSelection|commitChoice|confirmFeed|feed|nextPlayer|confirmPlayerSwitch|confirmHarvestFeed|confirmAnimalReorg|draftSubmit` 在 `shared/protocol/ws.ts` 0 hits）

### Session traits

- [ ] `shared/session/session-core.ts` 存在；`game-core.ts` 删除（或纯 re-export）
- [ ] `shared/session/phases/{setup,round,harvest,draft}.ts` 存在
- [ ] session-core.ts ≤ 800 行；4 mixin 平均 ≤ 700 行（最大不超 800）
- [ ] 6 处方法边界按 §3.6.2-3.6.8 落地

### 行动层下沉

- [ ] `GameCore.buildPlowInteraction / buildSowInteraction / buildFenceInteraction / buildSelectionInteraction / buildFarmInteraction` 不复存在
- [ ] `isFarmPromptKey()` / `isSelectionPromptKey()` 不复存在
- [ ] leaf action `plow/sow/fencing/construct/stables/selection` emit `'request' + kind: 'farm-select'`（除 selection emit `kind: 'selection'`）
- [ ] `selection.ts` 不再用 `choice.split(',')`

### Engine

- [ ] `Engine.lastEmittedChoice` cache 删除
- [ ] `peekPendingChoiceFromComposite()` getter 删除
- [ ] OrNode/XorNode/OptionalNode emit 构造真 InteractionNode
- [ ] snapshot/restore 不再含 `lastEmittedChoice` 字段

### S1 carry-overs 清理

- [ ] 3 个 GameCore confirm adapter shim 删除
- [ ] `client/services/gameTransport.ts` 方法重命名为 `resolveChoice`
- [ ] `EMPTY_ENGINE_STACK_CURSOR` 删除；`serializeState` ctx 必填
- [ ] `room-manager.ts` 中 `serializeState` fallback 分支删除

### Card draft

- [ ] `card-draft` kind 落地；前端 `DraftOverlay` 切到 `interaction.request`
- [ ] `PendingAction.cardDraft` 类型已随 PendingAction union 删除一并消失
- [ ] `'draftSubmit'` ClientCommand + `/api/game/draft-submit` HTTP 路由删除
- [ ] **不引入 BGA pass-around 语义**

### 测试

- [ ] `pnpm test:fast` 0 fail
- [ ] `pnpm test:slow` 0 fail
- [ ] cursor round-trip 8 kind 全覆盖（5 已存 + 3 新增）
- [ ] 「强制 green 子集」全绿
- [ ] skip-tracker.md S1 残留 skip 减少 ≥ 15 个
- [ ] 新增 skip ≤ 5 个

### 流程

- [ ] `pnpm exec tsc -b` 0 errors
- [ ] `pnpm run lint` 0 errors（warnings 不变）
- [ ] `pnpm run build` 成功
- [ ] `git rebase main` fast-forward 通过

## 8. 风险（继承 lean spec §5）

| # | 风险 | 概率 | 影响 | 缓解 | 回滚信号 |
|---|---|---|---|---|---|
| R1 | farm-select 5 farmType 字段差异大，单一 kind union 字段冗余 | 低 | 中 | 启动时按 §3.1 5 farmType audit；如果 ≥ 1 种字段冲突无法在 union 内表达，回退到 Q4 方案 B（顶层 5 kind） | 实施时发现 union 写不下 |
| R2 | cardDraft UI 切到 `interaction.request` 数据源后历史房间快照不兼容 | 中 | 低 | UI 切换前后跑对比测试；持久化房间含 `phase: 'draft'` 走 rehydrate 兼容路径 | 已存在 draft 房间 rehydrate 后 UI 黑屏 |
| R3 | 删 3 confirm shim + 68 测试 codemod 一次性铺开后大批 fail | 高 | 中 | codemod 工具一次性跑；fail 的逐个 skip + 登记 tracker；e2e 用契约层断言 | 累计 skip > 阈值（启动时定 30）|
| R4 | Session traits 4 mixin 边界划错（method 漂移） | 中 | 中 | §3.6 已给细化边界 + BGA `BaseTrait/HarvestTrait/RoundTrait/DraftTrait` 对照 | 任一 mixin > 800 行 |
| R5 | composite emit 真 InteractionNode 化破坏现有 OrNode/XorNode 单测 | 中 | 中 | composite emit 改造前先扫测试断言 `lastEmittedChoice` 的 N 处；同期 codemod | 改造完后 engine 单测 ≥ 5 fail |
| R6 | `promptKey` 闭 union 限制卡牌 hook 自定义文案 | 中 | 低 | `'ui.cards.${cardId}'` 命名约定 + `PromptParams<\`ui.cards.${string}\`>` = `Record<string, unknown>` 逃逸 | 单卡 hook 无法表达 promptKey |
| R7 | cursor 序列化 round-trip 8 kind 中某条破裂 | 低 | 高 | 强制 green 子集列表加 cursor round-trip；任何破裂立刻定位 | round-trip 测试挂 ≥ 1 条 |

## 9. 估算

继承 lean spec §9，sprint 启动时复核：

- 类型层 [A]：~1 PR
- protocol simplification + ClientCommand 收敛 [B]：~1 PR
- leaf action emit 重写 [C]：~3 PR（5 farmType + selection 拆几次）
- composite emit 包装 [D]：~1 PR（含 engine 测试 codemod）
- Session traits 拆分 [E]：~3 PR（最大）
- cardDraft 包装 [F]：~1 PR
- harvestFeed 清理 [G]：~1 PR
- EMPTY_ENGINE_STACK_CURSOR + ctx [H]：~1 PR
- selection.ts 字符串清理 [I]：~0.5 PR
- 测试 codemod [J]：~1 PR
- PendingAction 删除 [K]：~0.5 PR

总计 **~13 PR / 1.5–2 周**。比 S1（35 commits）规模略小（S1 含 S2 开始前的 carry-overs；S2 没有这种背包）。

## 10. Out-of-scope（继承 lean spec §2.2）

明确不做：

- Payment 收口（S3 — 已在 worktree `sprint-S3-payment-solver` 跑）
- `improvement.ts` 瘦身（S3）
- `shared/domain/` 引入 + 节点充血（S4）
- 物理目录搬迁（contract / cards-display / `client/sandbox/` ESLint）（S6）
- 卡牌 hook 注册机制改动
- 卡牌 desc 文案修改
- BGA pass-around 轮抽
- card-draft per-connection 视角化（issue #7）
- nextActionToken cursor 序列化（cold-restart reset 接受；S5+ 处理）
- HistoryEntry.pending 字段删除（S1 已确认 `undoStep` 真依赖此字段；保留）

## 11. 决策溯源

| 决策 | 来源 | 状态 |
|---|---|---|
| 8 种 kind 集合 | contract §1.2 | [L] 锁定 |
| InteractionState 3 stateId | contract §1.4 | [L] |
| ClientCommand 单一 `resolveChoice` | contract §1.5 | [L] |
| `ChoiceNode` 完全消除 | contract §1.6 | [L]（S1 已完成）|
| Q1 cardDraft 视角化留 issue #7 | brainstorm 决议 | [L] |
| Q2 feed 队列内嵌不动 | brainstorm 决议 | [L] |
| Q3 traits = `Setup / Round / Harvest / Draft` | brainstorm 决议 | [L] |
| Q4 farm-select 单 kind + farmType 闭 union（5 锁定） | brainstorm 决议 | [L] |
| Q5 promptKey 保留 + promptParams 收紧具名 schema | brainstorm 决议 | [L] |
| 6 处 mixin 方法边界 (A-F) | brainstorm 决议 | [L] |
| 不引入 BGA pass-around 轮抽 | user direction (commit 17c28178) | [L] |

ADR 占位（在 sprint 启动时建）：

- ADR-0007：`farm-select` 单 kind + farmType 闭 union 的边界判定（与 selection / choice 区分）
- ADR-0008：Session traits 4 mixin 命名 + 边界
- ADR-0009：cardDraft 不照搬 BGA DraftTrait（决策记录已在 commit message 17c28178 / 31e4b75c 留下，可不另开 ADR）

## 12. 与 §15 / §17 对应

- §15 Sprint S2 项 ↔ 本 spec 全文
- §15 ClientCommand 收敛 ↔ §3.3
- §17 ADR ↔ §11 决策溯源
