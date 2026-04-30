# Sprint 5 机制 E：单卡修批次（6 张）— Sprint 5 收口设计

**日期**: 2026-04-30
**Sprint**: 5（mech-E 收尾批 — 单卡修 6 张）
**涉及卡**: B115 TinsmithMaster / C13 WoodSlideHammer / B29 CookeryLesson / B138 ForestGuardian / C51 FishingNet / A151 Minstrel
**Worktree**: `.worktree/sprint-5-mech-e-misc-fixes`

## 1. 背景

Sprint 5 P1 行为偏差 28 张已修 16/28（PR-5 7 + mech-A 4 + mech-D 1 + mech-B 3 + mech-C 1）。本批做 user 选定的 Tier 1+2+3（6 张），让 Sprint 5 完成度推到 22/28（~78%）。剩 6 张（B155 / C23 / wide-scan 11+4+4 中部分）推到 Sprint 5b / Sprint 7。

每张卡先 BGA 对照确认实际 bug（避免按过时 audit 描述返工）。

## 2. 设计目标

- 6 张卡逐张修 P1 偏差，对齐 BGA 行为
- 主路径改动：**合并 3 个 gain action（gain / gain-trigger-player / gain-other-players）到统一 gain action**，参数化 `recipientPlayerId` / `recipientMode` / `payerId`；删除两个冗余 effect 文件，~10 张 caller 卡迁移
- 其他全是单卡内部修
- ~6-8 小时工作量

## 3. 核心实现

### 3.1 主路径改动：`gain-trigger-player` effect 加 `payerId`

文件：`shared/actions/effects/gain-trigger-player.ts`

```ts
import type { ActionDefinition, Resource } from '../../game/types'
import { gainResources } from './gain'
import { addResourcesFromCards } from '../../logic/stats'

export const gainTriggerPlayerAction: ActionDefinition = {
  id: 'gain-trigger-player',
  nameKey: 'actions.gain-trigger-player.name',
  descriptionKey: 'actions.gain-trigger-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params, sourceCard }) => {
    const { targetPlayerId, payerId, ...resourceGains } = (params ?? {}) as {
      targetPlayerId: string
      payerId?: string
    } & Partial<Resource>

    // 扣 payer（如果指定 — 用于 B138 / C51 / 其他"对手 pay 给 owner"语义）
    if (payerId) {
      const payer = state.players.find((p) => p.id === payerId)
      if (payer) {
        Object.entries(resourceGains).forEach(([key, amount]) => {
          if (typeof amount !== 'number' || amount <= 0) return
          const k = key as keyof Resource
          payer.resources[k] = Math.max(0, payer.resources[k] - amount)
        })
      }
    }

    // 给 target gain
    const target = state.players.find((p) => p.id === targetPlayerId)
    if (target) {
      gainResources(target, resourceGains)
      if (sourceCard) addResourcesFromCards(target, resourceGains)
    }

    return { type: 'ok' }
  },
}
```

**向后兼容**：`payerId` 是 optional；现有调用（如其他卡用 gain-trigger-player）不传 payerId → 保持原行为（仅 target gain）。仅 B138 / C51 / 其他"对手扣"语义的卡传 payerId。

### 3.2 B115 TinsmithMaster — 删 selection，全 field 自动 +1

文件：`shared/cards/B/B115_TinsmithMaster.ts`

BGA 行为：`actAddAdditionalGood($zones)` 遍历**所有**被 sown zone 各 +1 crop（不让玩家选）。

修法：

```ts
// 完全替换 afterSowListener handler（删 selection 路径）：
const afterSowListener: CardListenerRegistration = {
  id: 'B115-tinsmith-master-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freshFields = getFreshlySownFields(context)
    if (freshFields.length === 0) return
    for (const field of freshFields) {
      const top = fieldTopStack(field)
      if (top) top.remaining += 1
    }
    // 不返回 flow — 直接 mutate state，无 prompt
  },
}
```

**删除**：`registerSelectionEffect('tinsmith-master-bonus-crop', ...)` 整段、`maxSelections: 1` selection prompt 整段。

### 3.3 C13 WoodSlideHammer — 改用 listener 替代静态 modifier

文件：`shared/cards/C/C13_WoodSlideHammer.ts`

BGA 行为：`onPlayerComputeCostsRenovation` 检查 `player->getRoomType() === 'roomWood' && player->countRooms() >= 5` → `addBonus(args['costs'], [STONE => -2], $this->id)`。

修法：

```ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C13_WoodSlideHammer'

const computeCostsListener: CardListenerRegistration = {
  id: 'C13-wood-slide-hammer-renovation-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // BGA: roomType === 'wood' && rooms >= 5 → -2 stone
    // plan 阶段 grep 确认 player 字段名（roomType / houseType / rooms / roomTiles.length）
    if (context.player.houseType !== 'wood') return
    if ((context.player.roomTiles?.length ?? 0) < 5) return
    return {
      bonuses: [{
        discount: { stone: 2 },
        sources: [CARD_ID],
      }],
      sourceCard: CARD_ID,
    }
  },
}

export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Slide Hammer',
  deck: 'C',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['On your first renovation, if you have at least 5 wood rooms, you can renovate to stone directly and you get a discount of 2 <STONE> on the renovation cost.'],
  cost: { wood: 1 },
  newSet: true,
})

export const C13_WoodSlideHammer_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

**删除**：原 `modifier: { type: 'bonus', cardId, appliesTo: ['renovation'], discount: { stone: 1 } }`（数值错 + 无条件）。

注：BGA "first renovation" 语义需要 plan 阶段确认 — 玩家如果之前已经翻新过（已经是 stone），不应再触发。"first renovation" 由 `roomType === 'wood'` 自然保证（已翻新过就不是 wood）。

### 3.4 B29 CookeryLesson — per-round → per-action

文件：`shared/cards/B/B29_CookeryLesson.ts`

BGA `usableThisTurn` / `setUsedOnTurnId` 是 turn-id-keyed = 一次 takeAction 内只奖一次。我们用 `cookedThisRound: boolean` per-round — 这导致 turn1 cook + turn2 lessons → turn2 仍奖 VP（违反 "same turn"）。

修法：

```ts
const COOKED_TOKEN_KEY = 'cookedActionToken'  // ← 新名（替换 cookedThisRound）

const hasCookedThisAction = (context: CardListenerContext): boolean => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return false
  const cooked = readCardExtraData<number>(context.player, CARD_ID, COOKED_TOKEN_KEY)
  return cooked === actionToken
}

const markCookedThisAction = (context: CardListenerContext): void => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return
  writeCardExtraData(context.player, CARD_ID, COOKED_TOKEN_KEY, actionToken)
}

// afterExchangeListener handler:
// - markCookedThisAction（写 actionToken）
// - hasUsedLessonsThisRound 仍用（玩家 round 内 lessons 落子记录足够）
//   — 因为玩家 lessons 落子和 cook exchange 都在同一 takeAction，actionToken 相同
//   — 实际 hasUsedLessonsThisRound 改为 hasUsedLessonsThisAction（比对 round-placement-order 最近一次 placement 在当前 actionToken 内）

// 简化：因为玩家落 lessons 是 takeAction 入口（actionToken 创建那一刻），
// 而 cook exchange 是 anytime action 在同一 takeAction 内的子流程，actionToken 相同
// → hasCookedThisAction（cookedActionToken === currentToken）+ hasUsedLessonsThisAction（lessons placement 在当前 action 内）
// 都用 actionToken 一致

// onRoundStart 改清 COOKED_TOKEN_KEY = -1（或 undefined，让 hasCookedThisAction 返回 false）
```

`hasUsedLessonsThisAction` 实现：检查 `getRoundPlacementOrder(player)` 最后一项是不是 lessons / lessons-4，且当前 actionToken 跟 lessons 落子 actionToken 一致。简化：直接看 `context.space?.id` 是 lessons-related 即代表"这次 action 就是 lessons"。

```ts
// afterPlaceFarmerListener: 这次 place-farmer 触发的 action 就是 lessons → 已确认"this action used lessons"
// 直接 hasCookedThisAction(context) 决定是否奖

// afterExchangeListener: 这次 exchange 触发 → mark cookedActionToken
// 然后 hasUsedLessonsThisAction(context) — 现在 lessons placement 已在当前 action 之前发生
//   — 检查 player.cardStates['__actionSnapshot__'].extraData.lessonsThisAction？或简单看 round-placement-order 含 lessons
//   — round-placement-order 是 round-scoped；改用 cardStates['B29'].lessonsActionToken 跟踪
```

简化更进一步：B29 自己跟踪 `lessonsActionToken`：玩家落 lessons 时 set；exchange 时检查 cooked + lessons 都在同 actionToken。

```ts
const LESSONS_TOKEN_KEY = 'lessonsActionToken'

// afterPlaceFarmerListener (place-farmer on lessons):
//   set lessonsActionToken = currentToken
//   if cookedActionToken === currentToken: awardBonusVp
// afterExchangeListener (anytime-exchange):
//   set cookedActionToken = currentToken
//   if lessonsActionToken === currentToken: awardBonusVp
```

`USED_ACTION_TOKEN_KEY`（VP-already-awarded 防重）保留。

### 3.5 B138 ForestGuardian — listener 加 payerId

文件：`shared/cards/B/B138_ForestGuardian.ts`

```ts
return {
  flow: {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'gain-trigger-player',
        params: {
          food: 1,
          targetPlayerId: ownerId,
          payerId: context.player.id,  // ← 新增（trigger player = 落 wood accumulation 的对手）
        },
        sourceCard: CARD_ID,
      },
    ],
  },
  sourceCard: CARD_ID,
}
```

注：`context.player` 是 listener 触发时的玩家（trigger player，即想拿 wood 的对手），`ownerId` 来自 `context.ownerPlayer?.id`（B138 持有者）— 现有代码已正确取这两个。

### 3.6 C51 FishingNet — 同 B138 修法

文件：`shared/cards/C/C51_FishingNet.ts`

```ts
return {
  flow: {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'gain-trigger-player',
        params: {
          food: 1,
          targetPlayerId: ownerId,
          payerId: context.player.id,  // ← 新增
        },
        sourceCard: CARD_ID,
      },
      { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
    ],
  },
  sourceCard: CARD_ID,
}
```

`flag-card` leaf 不变（onReturnHome 时给 fishing 累积 +2 food）。

### 3.7 A151 Minstrel — 改用 viaCardJump 真二次落子（worker-less 变体）

**当前实现完全不对齐 BGA**：A151 当前用 inline simulation（同 mech-A 之前的 4 张卡老实现），自己手写 sheep-market gain leaf / grain-utilization OR 等模拟，没真触发空间完整 flow。导致：
- 第二格累积资源不自动回收（sheep-market 累积 sheep 不清空、其他空间累积同样问题）
- 第二格不触发其他卡 listener（cascade dispatch 断链）
- ReplaceHook / computeCosts 等扩展点对 A151 第二格不生效
- 总之就是 mech-A 之前 4 张卡同模式的全部 bug

**BGA 行为**（`A151_Minstrel.php`）：onStartReturnHome → 检查 4 张 stage-1 action（Fencing / GrainUtilization / SheepMarket / MajorImprovement）visible + unoccupied + 仅 1 个 → `useActionSpaceNode($spaceId)` 真跑空间完整 flow。**没传 farmer 参数** — 因为 returnHome 阶段玩家 farmers 都已落子，纯空间效果触发，不消耗 worker。

**修法**：扩展 mech-A 的 viaCardJump 让 workerId 可选（worker-less 变体）；A151 用 jumpLeaf({ sourceCard, targetSpaceId }) 不传 workerId。

#### 3.7.1 主路径扩展：viaCardJump worker-less 模式

文件：`shared/actions/effects/place-farmer.ts` jump 分支头部改为：

```ts
if (actionContext?.viaCardJump) {
  const sourceCard = actionContext.sourceCard as string | undefined
  const workerId = actionContext.workerId as string | undefined  // ← 现在 optional
  const targetSpaceId = actionContext.targetSpaceId as string | undefined
  if (!sourceCard || !targetSpaceId) {
    return { type: 'fail', logKey: 'log.placeFarmerFail' }
  }

  // worker-less 模式（A151 等：returnHome / 类似阶段无 farmer 可借）
  // 标识：未传 workerId
  const isWorkerless = !workerId

  let fromSpace: ActionSpace | undefined
  if (!isWorkerless) {
    fromSpace = state.actionSpaces.find((s) =>
      s.takenBy.some((t) => t.playerId === player.id && t.workerId === workerId),
    )
    if (!fromSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
  }
  const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
  if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }

  // 可达性二次校验：仅 worker 模式跑（worker-less 阶段如 returnHome 不在 work phase，computeAllowedPlacementSpaces 语义不适用）
  if (!isWorkerless) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some((a) => a.spaceId === targetSpaceId)) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }
  }

  // 累加 jumpChain（不变）
  actionContext.jumpChain = [
    ...((actionContext.jumpChain as string[]) ?? []),
    sourceCard,
  ]

  // 移动 farmer + stats — 仅 worker 模式跑
  if (!isWorkerless && fromSpace) {
    removeWorkerRef(fromSpace, player.id, workerId!)
    addWorkerRef(targetSpace, player.id, workerId!)
    recordRoundPlacement(player, targetSpace.id, workerId!)
    incPlacedFarmers(player)
  }

  // cascade dispatch（不变 — 仍触发其他卡 second-place listener）
  // 返回 flow：第二格 expandFlow + cascadeFlows（不变）
  ...
}
```

#### 3.7.2 jumpLeaf helper 让 workerId optional

文件：`shared/cards/helpers/jump-leaf.ts`

```ts
export interface JumpLeafParams {
  sourceCard: string
  workerId?: string  // ← 改 optional
  targetSpaceId: string
}

export const jumpLeaf = (p: JumpLeafParams): ActionFlow => ({
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: p.sourceCard,
  expandFlow: true,
  actionContext: {
    viaCardJump: true,
    sourceCard: p.sourceCard,
    ...(p.workerId !== undefined ? { workerId: p.workerId } : {}),  // ← 仅传非 undefined
    targetSpaceId: p.targetSpaceId,
  },
})
```

注：mech-A 4 张卡 listener 仍传 workerId — 行为不变（向后兼容）。

#### 3.7.3 A151 重写

文件：`shared/cards/A/A151_Minstrel.ts`，完全替换：

```ts
import { Occupation } from '../types'
import { isSpaceOccupied } from '../../game/space'
import { jumpLeaf } from '../helpers/jump-leaf'
import type { CardImpl } from '../registry'

const CARD_ID = 'A151_Minstrel'

// BGA A151_Minstrel.php 监听的 4 个 stage-1 action（returning home phase 时检查）
const STAGE_1_ACTIONS = [
  'sheep-market',
  'grain-utilization',
  'fencing',
  'major-improvement',
] as const

export const A151_Minstrel = new Occupation({
  id: CARD_ID,
  name: 'Minstrel',
  deck: 'A',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the start of each returning home phase, if only one action space card on round space 1 to 4 is unoccupied, you can use that action space.'],
  cost: {},
  players: '4+',
  newSet: true,
})

export const A151_Minstrel_impl = {
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, _player) => {
      const unoccupied: string[] = []
      for (const actionId of STAGE_1_ACTIONS) {
        const space = state.actionSpaces.find((s) => s.id === actionId)
        if (!space) continue
        // BGA isVisible: 该 action 已在当前 round 开放（roundActionOrder 顺序 ≤ 当前 round）
        const roundOrder = state.roundActionOrder
        const posIndex = roundOrder.indexOf(actionId)
        if (posIndex < 0 || posIndex + 1 > state.round) continue
        if (!isSpaceOccupied(space)) unoccupied.push(actionId)
      }

      // 严格"仅 1 个 unoccupied"
      if (unoccupied.length !== 1) return

      const targetSpaceId = unoccupied[0]!

      // 用 viaCardJump worker-less 模式：让 engine 跑 targetSpaceId 的完整 flow
      // （expandFlow → 累积资源自动回收 + 其他卡 listener 触发 + ReplaceHook 等）
      return {
        type: 'seq',
        optional: true,
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            targetSpaceId,
            // workerId 不传 — worker-less 模式
          }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

**删除**：`buildFlowForSpace` 函数（不再 inline 模拟）；STAGE_1_ACTIONS 内联模拟逻辑全部删除。

#### 3.7.4 关键不变量

- **A151 走与 mech-A 4 张卡同样的 viaCardJump 路径** — 第二格行为 BGA 完全等价：累积资源回收（sheep-market sheep / fencing 资源等）/ 触发其他卡 listener / ReplaceHook / computeCosts 全部生效
- **不消耗玩家 family pool**（worker-less 跳过 incPlacedFarmers / addWorkerRef）
- **不占用第二格**（无 takenBy 记录） — returnHome 阶段语义自然（玩家在用空间但不"占"它）
- **jumpChain 仍累加** — 防递归（如果未来某卡监听 stage-1 action 又 jump，链不死）
- **mech-A 4 张卡向后兼容** — 它们仍传 workerId，行为不变

文件：`shared/cards/A/A151_Minstrel.ts`

```ts
case 'sheep-market': {
  if (accumulatedSheep <= 0) return null
  // BGA: useActionSpaceNode 自动清空累积；我们 inline 模拟，手工清空
  const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')
  if (sheepSpace) sheepSpace.resources.sheep = 0
  return {
    type: 'leaf',
    actionId: 'gain',
    params: { sheep: accumulatedSheep },
    sourceCard: CARD_ID,
  }
}
```

注：`buildFlowForSpace` 函数签名需要传入 `state` 才能 mutate space；当前函数不接 state。改造：

```ts
const buildFlowForSpace = (
  state: GameState,  // ← 新增
  spaceId: string,
  accumulatedSheep: number,
): ActionFlow | null => { /* ... */ }

// onStartReturnHome:
const flow = buildFlowForSpace(state, targetSpaceId, accumulatedSheep)
```

mutate state 在 effect handler 内不优雅，但跟 mech-A B152 zeroSpaceListener 同模式（已有先例）；可接受。如果未来 A151 改为真 useActionSpace 路径（mech-A 同款 viaCardJump），可去掉手工清零（accept this is a known simplification）。

**audit 提到的 grain-utilization OR vs SEQ**：BGA `ActionGrainUtilization` 也是 NODE_OR + forcePassAfterOne，**audit 误判**，无需修。

### 3.8 关键不变量

- **gain-trigger-player effect 向后兼容**：`payerId` optional；不传时仅 target gain（原行为）
- **B115 不让玩家选**：BGA 是自动每 field +1，删 selection 路径；玩家无 prompt
- **C13 检查 first renovation**：靠 `roomType === 'wood'` 自然保证（已翻新过 wood 之后 roomType 变 stone，不再触发）
- **B29 per-action 跟踪**：lessonsActionToken / cookedActionToken 各 keyed by actionToken；同 action 内两个都 set 才奖 1 VP；onRoundStart 清两者保险
- **A151 用 viaCardJump worker-less 模式**：与 mech-A 4 张卡同款机制，第二格走完整 ActionNode 路径；累积资源 / 其他卡 listener / ReplaceHook 自动正确；放弃原 inline 模拟

## 4. 测试策略

每张卡 1-3 个新 session 测试场景（添加到现有 batch12 / 单卡 session test）。

### 4.1 B115 TinsmithMaster

新建或加场景到 `server/__tests__/B115_TinsmithMaster-session.test.ts`：

- 单 field 被 sown → top.remaining +1（原行为不变）
- 两个 field 同时 sown → **两个 field 都 +1**（之前只 +1 一个）
- B115 未 played → 0 个 field +1（baseline）

### 4.2 C13 WoodSlideHammer

新建 `server/__tests__/C13_WoodSlideHammer-session.test.ts`：

- 5 wood rooms + 翻 stone → cost = original_stone - 2
- 4 wood rooms + 翻 stone → 无折扣
- 5 stone rooms + 翻 stone（不可能 — stone 是终态）→ 无折扣
- 玩家未持有 C13 → 无折扣

### 4.3 B29 CookeryLesson

新建或扩展 `server/__tests__/B29_CookeryLesson-session.test.ts`：

- turn1 cook + turn1 lessons → 奖 1 VP（同 action 路径）
- turn1 lessons + turn1 cook → 奖 1 VP（顺序无关）
- **turn1 cook + turn2 lessons** → **不**奖（之前 per-round 错奖；修复后正确）
- turn1 lessons → 单独无 VP / turn1 cook → 单独无 VP
- 同 turn 多次 cook + 1 次 lessons → 仅奖 1 VP（actionToken 防重）

### 4.4 B138 ForestGuardian

新建或扩展 `server/__tests__/B138_ForestGuardian-session.test.ts`：

- 对手在 wood:5 累积空间落子 → 对手 food 从 X → X-1，B138 owner food 从 Y → Y+1
- 对手在 wood:4 累积空间落子 → 不触发（< 5 wood）
- B138 owner 自己在 wood 空间落子 → 不触发（only opponent）

### 4.5 C51 FishingNet

新建或扩展 `server/__tests__/C51_FishingNet-session.test.ts`：

- 对手在 fishing 落子 → 对手 food -1, owner food +1, flag set
- 后续 returnHome → fishing 累积 +2 food
- B138 / C51 联动：玩家持两张 + 对手在 wood 累积落子 → 仅 B138 触发；对手 fishing 落子 → 仅 C51 触发

### 4.6 A151 Minstrel

扩展 `server/__tests__/A151_Minstrel-session.test.ts`（如已存在）：

- 4 stage-1 action 仅 sheep-market unoccupied + sheep 累积 5 → 玩家接受 → 玩家 sheep +5, **sheep-market.resources.sheep === 0**（由 sheep-market space.execute 自动清零，验证 viaCardJump expandFlow 路径生效）
- 4 stage-1 action 仅 fencing unoccupied → 玩家接受 → 进入 fence 选段子流程（验证 fencing.flow 被 expandFlow 展开）
- 4 stage-1 action 仅 grain-utilization unoccupied → 玩家接受 → OR(sow, bake-bread) 弹 prompt
- 4 stage-1 action 仅 major-improvement unoccupied → 玩家接受 → improvement-any 买 major prompt
- 4 stage-1 action 0 / 2+ 个 unoccupied → 不触发
- worker 不消耗：玩家 family-pool 在 returnHome 后不变（worker-less 模式）
- jumpChain 累加：actionContext.jumpChain 含 'A151_Minstrel'

## 5. 范围与排除项

### 5.1 范围内

- 主路径改 1：合并 3 个 gain action 到统一 gain（删 2 个冗余 effect 文件 + ~10 张 caller 迁移 + payerId 参数）
- 主路径改 2：viaCardJump worker-less 模式（workerId optional）+ jumpLeaf helper signature 更新
- 6 张卡 listener / effect / modifier 修
- 6 张卡 session 测试场景
- 文档同步：card_progress §2.0 / §2.3 / §7（基础设施加 viaCardJump worker-less + gain 三合一） / §8、master-plan §8、ENGINE_ARCHITECTURE 加 "viaCardJump worker-less variant" 一节

### 5.2 明确排除

- **B155 ArtTeacher**（FOOD_TRAVEL 机制）— 单独 sprint
- **C23**（先 BGA 重读再决定）— Sprint 5b 或 7
- **wide-scan A 4 张 / B 11 张 / E 4 张** — 推 Sprint 7（每张需 BGA 复读再判断）
- **gain action 命名规范化** — "gain" 现在覆盖 self / other / specific 多语义，名字不太精确；如有未来工坊 / DSL 对接需求再考虑重命名为 `transfer` 或类似

### 5.3 风险点


| 假设                                                                            | 验证方式                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `player.houseType` / `player.roomTiles` 字段名                                   | grep `state.players[].houseType` 确认；plan 阶段写测试时按 actual 类型                                       |
| `addBonus` / `bonuses` 字段在 ComplexCost 上语义生效                                  | 现有 modifier 系统已用 BonusModifier，listener 返回 `bonuses` 由 `resolveCardCostWithModifiers` 收集 — 已存在路径 |
| B29 现有 onRoundStart 清 cookedThisRound = false 行为是否对 cookedActionToken 适用      | 改 onRoundStart 清 `cookedActionToken = -1`（或 undefined）— 同样防御                                     |
| viaCardJump worker-less 模式跑通：jumpLeaf 不传 workerId → 不消耗 worker / 不动 takenBy / 仍 expandFlow + cascade dispatch | A151 session 测试 sheep-market.resources.sheep === 0（自动清空）+ family-pool 不变 |
| `place-farmer.ts` 跳过可达性二次校验（worker-less 模式）：returnHome phase 不在 work phase，computeAllowedPlacementSpaces 内部假设 work phase 可能不成立 | A151 session 测试覆盖 returnHome 触发路径 + 4 stage-1 action 各种 unoccupied 组合 |
| 现有 gain-other-players callers（A29/A50/C38/C142/E160/card-listeners）迁移后 statsLog 仍正确 | 各卡现有 session 测试跑过；新加合并 gain effect 单元测试覆盖 recipientMode='others' 路径 stats / log key |
| 现有 gain-trigger-player callers（A132/A154/A156/A159）迁移后行为不变（非 B138 / C51 类即不传 payerId） | 各卡现有 session 测试跑过 |
| C13 modifier 删除后 modifier 系统的 cost-preview / scoring 等链路                      | grep `modifier` / `getCardModifiers(C13)` 看依赖；listener 路径独立                                      |
| jumpLeaf helper workerId 改 optional 后 mech-A 4 张卡（A129/B130/B150/B152）不受影响 | jumpLeaf 4 张卡现有 session 测试跑过 |


## 6. 文档同步

### 6.1 `docs/card_progress.md`

- §2.0 加：`2026-04-30 Sprint 5 mech-E — 6 张 P1 单卡修批次（B115 TinsmithMaster / C13 WoodSlideHammer / B29 CookeryLesson / B138 ForestGuardian / C51 FishingNet / A151 Minstrel）。主路径改：(1) 合并 3 个 gain action（gain / gain-trigger-player / gain-other-players）到统一 gain，参数化 recipientPlayerId / recipientMode / payerId（删除 2 个冗余 effect 文件，~10 张 caller 卡迁移）；(2) viaCardJump 扩展 worker-less 模式（workerId optional），让 A151 这种 returnHome 阶段无 farmer 可借的卡也能复用 mech-A 路径。卡修：B115 删 selection 路径全 field 自动 +1；C13 改 listener 替代静态 modifier，加 roomType==='wood' && rooms>=5 条件 + stone:2 折扣；B29 cookedThisRound 改 cookedActionToken（per-action keyed）+ lessonsActionToken 跟踪；B138 / C51 caller 改用合并后的 gain 加 payerId 让对手扣 food；A151 完全重写用 jumpLeaf 单 leaf 触发，删 inline simulate 模拟（accumulation 资源 / 其他卡 listener / ReplaceHook 由 viaCardJump expandFlow 自动正确）。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-e-misc-fixes-design.md。`
- §2.3 把 6 张卡都标 ✅ Sprint 5 mech-E
- §8 时间线加新行（实现数 22/28 = 78% Sprint 5 完成度）

### 6.2 `docs/master-plan.md` §8

- Sprint 5 行：partially done 数从 16/28 更新到 22/28；spec / plan 列加 mech-E 路径；实际工时 + ~5h (mech-E)

### 6.3 ENGINE_ARCHITECTURE.md 加两节

- "gain action 三合一" — 描述合并后 recipientPlayerId / recipientMode / payerId 协议
- "viaCardJump worker-less variant" — 描述 workerId optional 时跳过 worker mutation，仍跑 expandFlow + cascade dispatch（A151 用例）

## 7. 提交粒度

- commit 1: `refactor(gain)`: merge gain-trigger-player + gain-other-players into unified gain action with recipientPlayerId / recipientMode / payerId（含 effect 单测 + ~10 张 caller 卡迁移 + 删除 2 个冗余 effect 文件）
- commit 2: `refactor(B138, C51)`: pass recipientPlayerId + payerId for opponent-deduct semantics（含 session 测试 — B138 / C51 行为修复）
- commit 3: `refactor(B115)`: drop selection, auto-add 1 crop to every freshly sown field（含测试）
- commit 4: `refactor(C13)`: use computeCosts listener for renovation discount（含条件检查 + 测试）
- commit 5: `refactor(B29)`: per-action token tracking instead of per-round（含测试）
- commit 6: `feat(jump,A151)`: viaCardJump worker-less variant + A151 rewrite via jumpLeaf（含 helper signature 更新 + A151 session 测试）
- commit 7: `docs`: sync mech-E across card_progress / master-plan / ENGINE_ARCHITECTURE

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build` 全绿才下一步。