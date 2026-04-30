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
- 唯一主路径改动：`gain-trigger-player.ts` effect 加可选 `payerId` 参数（轻量扩展，向后兼容）
- 其他全是单卡内部修
- ~4-6 小时工作量

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

### 3.7 A151 Minstrel — sheep-market 累积清零

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
- **A151 mutate state**：listener 内手工清 sheep-market 累积（同 mech-A B152 模式，可接受）；OR 路径不变

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

- 4 stage-1 action 仅 sheep-market unoccupied + sheep 累积 5 → 玩家接受 → 玩家 sheep +5, sheep-market.resources.sheep === 0
- 4 stage-1 action 0 个 unoccupied → 不触发
- 4 stage-1 action 2+ 个 unoccupied → 不触发
- grain-utilization 路径（OR sow / bake-bread）→ 玩家选 sow → field +crop（OR 行为正确）

## 5. 范围与排除项

### 5.1 范围内
- 1 主路径改：`gain-trigger-player.ts` 加 payerId
- 6 张卡 listener / effect / modifier 修
- 6 个 session 测试场景
- 文档同步：card_progress §2.0 / §2.3 / §8、master-plan §8

### 5.2 明确排除
- **B155 ArtTeacher**（FOOD_TRAVEL 机制）— 单独 sprint
- **C23**（先 BGA 重读再决定）— Sprint 5b 或 7
- **wide-scan A 4 张 / B 11 张 / E 4 张** — 推 Sprint 7（每张需 BGA 复读再判断）
- **A151 改用 mech-A viaCardJump 路径**（更优雅但 returnHome phase 玩家无 farmer，需要"虚拟 worker"扩展）— follow-up
- **gain-trigger-player effect 命名**（"gain-trigger-player" + payerId 语义稍混乱；理论上重命名 `pay-and-gain` 更准）— 不在本 spec 范围（向后兼容优先）

### 5.3 风险点

| 假设 | 验证方式 |
|---|---|
| `player.houseType` / `player.roomTiles` 字段名 | grep `state.players[].houseType` 确认；plan 阶段写测试时按 actual 类型 |
| `addBonus` / `bonuses` 字段在 ComplexCost 上语义生效 | 现有 modifier 系统已用 BonusModifier，listener 返回 `bonuses` 由 `resolveCardCostWithModifiers` 收集 — 已存在路径 |
| B29 现有 onRoundStart 清 cookedThisRound = false 行为是否对 cookedActionToken 适用 | 改 onRoundStart 清 `cookedActionToken = -1`（或 undefined）— 同样防御 |
| A151 listener handler 内 mutate state.actionSpaces[].resources.sheep 是否在测试环境正确 | session 测试场景验证 sheep-market.resources.sheep === 0 |
| `gain-trigger-player` 其他 caller（如 mech-A 之外的卡）传不传 payerId | grep `gain-trigger-player` 所有引用确认；现有不传 OK（向后兼容） |
| C13 modifier 删除后 modifier 系统的 cost-preview / scoring 等链路 | grep `modifier` / `getCardModifiers(C13)` 看依赖；listener 路径独立 |

## 6. 文档同步

### 6.1 `docs/card_progress.md`

- §2.0 加：`2026-04-30 Sprint 5 mech-E — 6 张 P1 单卡修批次（B115 TinsmithMaster / C13 WoodSlideHammer / B29 CookeryLesson / B138 ForestGuardian / C51 FishingNet / A151 Minstrel）。唯一主路径改：gain-trigger-player.ts 加可选 payerId 参数（向后兼容 — 不传时仅 target gain，传 payerId 时同时扣对手）。其他 5 张全是单卡内部修：B115 删 selection 路径全 field 自动 +1；C13 改 listener 替代静态 modifier，加 roomType==='wood' && rooms>=5 条件 + stone:2 折扣；B29 cookedThisRound 改 cookedActionToken（per-action keyed）+ lessonsActionToken 跟踪；B138 / C51 listener 加 payerId 让对手扣 food；A151 sheep-market 累积清零。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-e-misc-fixes-design.md。`
- §2.3 把 6 张卡都标 ✅ Sprint 5 mech-E
- §8 时间线加新行（实现数 22/28 = 78% Sprint 5 完成度）

### 6.2 `docs/master-plan.md` §8

- Sprint 5 行：partially done 数从 16/28 更新到 22/28；spec / plan 列加 mech-E 路径；实际工时 + ~5h (mech-E)

### 6.3 不需要改 `docs/ENGINE_ARCHITECTURE.md`

`gain-trigger-player` 加 payerId 是 effect 内部参数扩展，未引入新 hook phase / 新协议层 — 不需要文档同步。

## 7. 提交粒度

- commit 1: `feat(gain-trigger-player)`: add optional payerId for opponent-deduct semantics（含 effect 单测）
- commit 2: `refactor(B138, C51)`: pass payerId to gain-trigger-player（含 session 测试 — B138 / C51 行为修复）
- commit 3: `refactor(B115)`: drop selection, auto-add 1 crop to every freshly sown field（含测试）
- commit 4: `refactor(C13)`: use computeCosts listener for renovation discount（含条件检查 + 测试）
- commit 5: `refactor(B29)`: per-action token tracking instead of per-round（含测试）
- commit 6: `refactor(A151)`: clear sheep-market accumulation when consumed via Minstrel（含测试）
- commit 7: `docs`: sync mech-E across card_progress / master-plan

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build` 全绿才下一步。
