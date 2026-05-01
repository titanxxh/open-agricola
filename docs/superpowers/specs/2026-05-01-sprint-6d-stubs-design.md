# Sprint 6d — D131 / E58 / E153 Stub 卡完整对齐 Design

> **Sprint 6d**：实现 D131 CraftsmanshipPromoter / E58 LunchtimeBeer / E153 StoneSculptor 三张 stub 卡按 BGA 完整对齐，并同步 §2.7 stub list 划掉 A165 / E134（Sprint 2 已实现但未划线）。引入 3 处通用扩展（Trade.sideEffect.bonusVp / harvest phase skip helper / minor-improvement listener candidate injection）。

**Goal**：3 张 stub 卡完整对齐 BGA，0 deliberate divergence；§2.7 stub list 与实际进度一致。

**Architecture**：保持卡牌闭环 + 数据驱动通用扩展。3 处机制扩展互不耦合，分别对应 3 张卡的核心需求；扩展接口文档化让未来同模式卡可复用。

**Tech Stack**：TypeScript（shared/cards/{D,E}/、shared/actions/effects/、shared/session/）+ vitest（单元 + session）+ pnpm。

**Worktree**：`.worktree/sprint-6d-stubs`（base main `4dd01af2`）。

**总工时**：~2.5d（D131 ~0.6d / E58 ~0.7d / E153 ~0.7d / §2.7 同步 ~0.05d / 文档 ~0.2d / 缓冲 ~0.2d）

---

## 0. 范围与背景

### 0.1 真实残留

`docs/card_progress.md` §2.7 stub list（line 206）现状：

```
~~A135~~ ✅ / A165 / C62 / ~~C105~~ ✅ / ~~C109~~ ✅ / ~~C136~~ ✅ /
~~D62~~ ✅ / ~~D94~~ ✅ / ~~D108~~ ✅ / D131 / ~~D157~~ ✅ /
E58 / E134 / ~~E139~~ ✅ / E153 / ~~E155~~ ✅
```

A165 已 Sprint 2 PR-2A 实现，E134 已 Sprint 2 PR-2D 实现 — 但 list 未划线。本 sprint 一并清。

真正待实现 stub：**C62 / D131 / E58 / E153 = 4 张**。C62 CookeryExtension 因需 `computeExchanges` hook + per-harvest used-flag（~1.5–2d 机制扩展）单独立项（Sprint 6e 候选）；本 sprint 只做剩余 3 张。

### 0.2 偏差摘要

| 卡 | BGA | 我方 stub 现状 | 差距 |
|---|---|---|---|
| **D131 CraftsmanshipPromoter** | onBuy gain stone:1 + Minor Improvement action 也能 buy bottom-row major | onBuy ✅ + TODO 注释（candidate injection 缺） | 缺 minor-improvement candidate injection |
| **E58 LunchtimeBeer** | onStartHarvest 可选 SEQ：gain food:1 + skip 当 harvest field/breeding phase | onStartHarvest 给 food:1 ✅ + TODO 注释（skip phase 缺） | 缺 harvest phase skip 机制 |
| **E153 StoneSculptor** | exchanges harvest-only max:1: 1 stone → 1 food + 1 bonus VP | exchanges triggers:['anytime'] 简化 + 缺 score VP | trigger 错（harvest vs anytime） + 缺 score VP 机制 |

### 0.3 范围决定

- ✅ D131 通过 listener 注入 minor-improvement candidate（仅 D131 owner 触发）
- ✅ E58 通过 special-effect leaf 写 cardStates flag + game-core harvest 流程入口检查 skip
- ✅ E153 改 exchanges triggers:['harvest'] + 通用 Trade.sideEffect.bonusVp 表达 score VP
- ✅ §2.7 list 同步划掉 A165 / E134
- ❌ 把 score VP 引入 Resource 类型（侵入式；用 sideEffect kind 数据驱动更干净）
- ❌ minor-improvement.execute 重构为 getBaseChoiceOptions 模式（scope 漂移）
- ❌ E58 skip 用全局 game-state flag（cardStates 局部更干净）
- ❌ C62 CookeryExtension（推 Sprint 6e）

---

## 1. 总体结构

### 1.1 修改路径

```
D131 CraftsmanshipPromoter
  ├─ shared/cards/D/D131_*.ts
  │   ├─ effect.onBuy: gainLeaf({stone:1}) (保留)
  │   └─ computeChoiceCandidates listener on actions:['minor-improvement']
  │      → return extraOptions: bottom-row major 列表（仅当 player 拥有 D131）
  └─ shared/actions/effects/improvement.ts
      minor-improvement.execute 加 listener 调用，合并 extraOptions

E58 LunchtimeBeer
  ├─ shared/cards/E/E58_*.ts
  │   onStartHarvest listener → return optional SEQ([gainLeaf({food:1}), specialEffectLeaf(set-extra-data)])
  └─ shared/session/game-core.ts
      hasPassFieldAndBreed(player) helper + startHarvestFieldPhase / startBreedPhase 入口前 skip 检查

E153 StoneSculptor
  ├─ shared/cards/E/E153_*.ts
  │   exchanges: triggers:['harvest'] + sideEffect:{type:'bonusVp', amount:1}
  │   computeBonusScore 读 cardStates.bonusVpEarned
  ├─ shared/game/types.ts
  │   TradeSideEffect 联合加 'bonusVp' kind
  ├─ shared/actions/helpers/payment.ts
  │   applyTradeSideEffect switch 加 'bonusVp' case (扩签名加 player + sourceCard)
  └─ shared/actions/effects/exchange.ts
      exchange.execute 应用 trade 时调 applyTradeSideEffect

§2.7 stub list 同步
  └─ docs/card_progress.md line 206
      A165 / E134 加 strikethrough+✅ Sprint 2 (PR-2A / PR-2D)
      D131 / E58 / E153 加 strikethrough+✅ Sprint 6d
```

### 1.2 文件清单

| 位置 | 改动类型 |
|---|---|
| `shared/game/types.ts` | `TradeSideEffect` 联合加 `'bonusVp' { amount }` kind |
| `shared/actions/helpers/payment.ts` | `applyTradeSideEffect` switch 加 bonusVp case + 签名扩 player + sourceCard |
| `shared/actions/effects/exchange.ts` | exchange.execute 应用 trade 时调 applyTradeSideEffect |
| `shared/actions/effects/improvement.ts` | minor-improvement.execute 加 listener 调用 + extraOptions 合并 |
| `shared/cards/card-listeners.ts` (or improvement.ts) | `collectComputeChoiceCandidates` helper |
| `shared/session/game-core.ts` | `hasPassFieldAndBreed` helper + startHarvestFieldPhase / startBreedPhase 入口 skip 检查 |
| `shared/cards/D/D131_CraftsmanshipPromoter.ts` | rewrite — 加 computeChoiceCandidates listener |
| `shared/cards/E/E58_LunchtimeBeer.ts` | rewrite — onStartHarvest 改 listener 返回 SEQ + special-effect leaf |
| `shared/cards/E/E153_StoneSculptor.ts` | rewrite — exchanges triggers:['harvest'] + sideEffect:bonusVp + computeBonusScore |
| `server/__tests__/D131_CraftsmanshipPromoter-session.test.ts` | 新建 6 case |
| `server/__tests__/E58_LunchtimeBeer-session.test.ts` | 新建 5 case |
| `server/__tests__/E153_StoneSculptor-session.test.ts` | 新建 6 case |
| `shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts` | 既有文件追加 3 case (bonusVp) |
| `docs/card_progress.md` | §2 changelog + §1 总览 + §2.7 list + §7 基础设施 |
| `docs/master-plan.md` | §0 Sprint 6 stub 数同步 + §8 加 Sprint 6d 行 |
| `docs/ENGINE_ARCHITECTURE.md` | 3 处通用扩展描述 |

---

## 2. D131 CraftsmanshipPromoter 实现

### 2.1 BGA 源（`bga-agricola/modules/php/Cards/D/D131_CraftsmanshipPromoter.php`）

```php
public function onBuy($player) {
  return $this->gainNode([STONE => 1]);
}
// desc: 'You can build any of the major improvements in the bottom row of
//        the supply board even when taking a Minor Improvement action.'
```

BGA D131.php **不枚举** bottom-row major 列表；list 来自 supply-board 物理布局配置。**plan 阶段需 grep BGA supply-board / Major_* 配置**确认精确列表。spec 假设：`['Major_Pottery', 'Major_Joinery', 'Major_Basket', 'Major_StoneOven']`（4 张工坊系，按 Agricola 规则下排）。

### 2.2 我方实现

```ts
// shared/cards/D/D131_CraftsmanshipPromoter.ts (rewrite)
import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D131_CraftsmanshipPromoter'

const BOTTOM_ROW_MAJORS = [
  'Major_Pottery',
  'Major_Joinery',
  'Major_Basket',
  'Major_StoneOven',
] as const

const computeChoiceCandidatesListener: CardListenerRegistration = {
  id: 'D131-craftsmanship-promoter-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['minor-improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    if (!ctx.player.occupationPlayed.includes(CARD_ID)) return
    const available = ctx.state.availableMajorImprovements ?? []
    const extraOptions: ActionChoiceOption[] = BOTTOM_ROW_MAJORS
      .filter((id) => available.includes(id))
      .map((id) => ({
        value: id,
        labelKey: `cards.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const D131_CraftsmanshipPromoter = new Occupation({
  id: CARD_ID,
  name: 'Craftsmanship Promoter',
  deck: 'D',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you immediately get 1 <STONE>. You can build any of the major improvements in the bottom row of the supply board even when taking a __Minor Improvement__ action.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const D131_CraftsmanshipPromoter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { stone: 1 }),
  },
  listeners: [computeChoiceCandidatesListener],
  reaches: [...BOTTOM_ROW_MAJORS] as readonly string[],
} satisfies CardImpl
```

### 2.3 minor-improvement.execute 加 listener candidate 注入

打开 `shared/actions/effects/improvement.ts:766-776`，把 execute 改为：

```ts
execute: ({ state, player }) => {
  const baseOptions = buildPlayableMinorOptions(state, player)

  // 通用 candidate injection — listener 扩展 minor-improvement 选项
  const extraOptions = collectComputeChoiceCandidates(state, player, 'minor-improvement')

  // affordability 过滤
  const affordableExtraOptions = extraOptions.filter((opt) =>
    isAffordableImprovement(state, player, opt.value),
  )

  const options = [...baseOptions, ...affordableExtraOptions]
  if (options.length === 0) return { type: 'ok' }
  return { type: 'choice', promptKey: 'ui.interactionChooseMinorImprovement', options }
},

resolveChoice: ({ state, player }, choice) =>
  playImprovement(state, player, choice, 'any'),
```

新增 helper `collectComputeChoiceCandidates`（位置：`shared/cards/card-listeners.ts` 或 `shared/actions/effects/improvement.ts`）：

```ts
const collectComputeChoiceCandidates = (
  state: GameState,
  player: PlayerState,
  actionId: string,
): ActionChoiceOption[] => {
  const ctx: CardListenerContext = buildBaseListenerContext(state, player, {
    actionId,
    phase: 'computeChoiceCandidates',
  })
  const out: ActionChoiceOption[] = []
  for (const matched of getMatchingListeners(ctx)) {
    const result = executeCardListener(matched.registration, ctx)
    if (result?.extraOptions) out.push(...result.extraOptions)
  }
  return out
}
```

`isAffordableImprovement`：复用既有 `meetsCardPrerequisites` + `canAffordImprovement` 组合（plan 阶段 grep 实际 helper 名）。

### 2.4 与 BGA 对齐表

| BGA | 我方等价 |
|---|---|
| `taking a Minor Improvement action` | minor-improvement actionId |
| `bottom row of supply board` | BOTTOM_ROW_MAJORS 常量（plan 阶段从 BGA 配置确认）|
| `you can build` | 通过 listener 注入 candidates；玩家选择；走 playImprovement('any')|
| 限定 D131 owner | listener handler `if (!ctx.player.occupationPlayed.includes(CARD_ID)) return` |

---

## 3. E58 LunchtimeBeer 实现

### 3.1 BGA 源（`bga-agricola/modules/php/Cards/E/E58_LunchtimeBeer.php`）

```php
isListeningTo: isPlayerEvent && type==StartHarvest

onPlayerStartHarvest:
  return SEQ optional countAsUse:
    [ gainNode([FOOD => 1]),
      SPECIAL_EFFECT(method='passFieldAndBreedingPhase') ]

passFieldAndBreedingPhase:
  $pass = Globals::getPassFieldAndBreed() ?? []
  $pass[] = $player->getId()
  Globals::setPassFieldAndBreed($pass)
```

逻辑：harvest 开始时玩家可选 "拿 1 food + 跳过 field/breeding phase"。`Globals::passFieldAndBreed` 是 round-state，每 round 重置。

### 3.2 我方实现

```ts
// shared/cards/E/E58_LunchtimeBeer.ts (rewrite)
import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E58_LunchtimeBeer'

const onStartHarvestListener: CardListenerRegistration = {
  id: 'E58-lunchtime-beer-on-start-harvest',
  cardIds: [CARD_ID],
  actions: ['__stage:onStartHarvest'],   // plan 阶段确认 stage hook actionId 实际名
  phases: ['after' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          actionContext: {
            kind: 'set-extra-data',
            cardId: CARD_ID,
            key: 'passFieldAndBreedRound',
            value: ctx.state.round,    // 在 listener 触发时即固定为当前 round
          },
          sourceCard: CARD_ID,
        },
      ],
    }
    return { flow, sourceCard: CARD_ID }
  },
}

export const E58_LunchtimeBeer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lunchtime Beer',
  deck: 'E',
  number: 58,
  category: 'FOOD',
  desc: ['At the start of each harvest, you can choose to skip the field and breeding phase of that harvest and get exactly 1 <FOOD> instead.'],
  cost: {},
})

export const E58_LunchtimeBeer_impl = {
  listeners: [onStartHarvestListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注：当前 E58 用 `effect.onStartHarvest`（fire-and-forget effect handler）；改用 listener 走 stage hook 的 after phase 更对齐 BGA 的 `onPlayerStartHarvest` 返回 SEQ 语义。**plan 阶段确认** listener 在 `__stage:onStartHarvest` 入口能 fire（dispatcher 跑 stage flow 时 leaf-equivalent 触发 phase）。如果不能，fallback 用 `effect.onStartHarvest` 返回 ActionFlow（与 sprint-5c §2.4 onAfterRoundEnd 同模式）。

### 3.3 game-core harvest skip 检查

```ts
// shared/session/game-core.ts (新 helper)
private hasPassFieldAndBreed(player: PlayerState): boolean {
  const cardStates = player.cardStates ?? {}
  for (const cardId of Object.keys(cardStates)) {
    const round = cardStates[cardId]?.extraData?.passFieldAndBreedRound
    if (typeof round === 'number' && round === this.state.round) {
      return true
    }
  }
  return false
}

// startHarvestFieldPhase / continueHarvestFieldPhase 入口
private continueHarvestFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
  const harvestOrder = this.getHarvestPlayerIndices()
  const filteredOrder = harvestOrder.filter((idx) => {
    const p = this.state.players[idx]
    return p && !this.hasPassFieldAndBreed(p)
  })
  // 后续 reap / field-phase 用 filteredOrder
}

// continueAfterFeedingPhase 入口（既有 sprint-5c harvest leaf flow 路径）
private continueAfterFeedingPhase(...) {
  // ...既有 prelude
  const harvestOrder = this.getHarvestPlayerIndices()
  const filteredOrder = harvestOrder.filter((idx) => {
    const p = this.state.players[idx]
    return p && !this.hasPassFieldAndBreed(p)
  })
  // 用 filteredOrder 构造 breed leaf flow
}
```

`passFieldAndBreedRound` 字段在下个 round 自然失效（`=== state.round` 不再匹配），无需主动清。

### 3.4 与 BGA 对齐表

| BGA | 我方等价 |
|---|---|
| `Globals::passFieldAndBreed[]` | `cardStates.E58.extraData.passFieldAndBreedRound === state.round` |
| `onPlayerStartHarvest return SEQ optional` | listener `__stage:onStartHarvest` after phase return optional SEQ |
| `pass for this harvest only` | round 比较 `=== state.round` 自然限定单 harvest |
| field phase skip | `continueHarvestFieldPhase` filter harvestOrder |
| breeding phase skip | `continueAfterFeedingPhase` filter harvestOrder |

### 3.5 与其他 onHarvest hook 的互动（plan 阶段 BGA 复核）

跳过 phase 是否阻止该 phase 内所有 listener fire？
- **假设默认**：phase 跳过 = 玩家在该 phase 不参与（reap / breed leaf 跳过），但其他 onHarvestFieldPhase listener（如 D38 cattle income）**仍 fire**——因为 D38 的 listener 是按玩家 hook 触发，不是 phase-internal。
- **plan 阶段验证**：grep BGA `onPlayerStartHarvestFieldPhase` 等 hook 在 passFieldAndBreed 玩家上是否 fire；如不 fire 调整 game-core 的 skip 范围（不只 reap/breed leaf，还要短路其他 hook）。
- 不一致时登记 deliberate divergence + 写测试覆盖。

---

## 4. E153 StoneSculptor 实现

### 4.1 BGA 源（`bga-agricola/modules/php/Cards/E/E153_StoneSculptor.php`）

```php
$this->exchanges = [
  Utils::formatExchange(
    [STONE => [SCORE => 1, FOOD => 1], 'max' => 1],
    $this->name,
    [HARVEST],
    $this->id
  ) + ['scoreCardId' => $this->id]
];
```

逻辑：harvest window，每 harvest 最多 1 次，1 stone → 1 food + 1 bonus VP。

### 4.2 我方实现

```ts
// shared/cards/E/E153_StoneSculptor.ts (rewrite)
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E153_StoneSculptor'

export const E153_StoneSculptor = new Occupation({
  id: CARD_ID,
  name: 'Stone Sculptor',
  deck: 'E',
  number: 153,
  category: 'BONUS_POINTS',
  desc: ['Each harvest, you can use this card to exchange exactly 1 <STONE> for 1 bonus <SCORE> and 1 <FOOD>.'],
  cost: {},
  players: '4+',
  extraVp: true,
  exchanges: [{
    from: { stone: 1 },
    to: { food: 1 },
    max: 1,
    triggers: ['harvest'],
    sourceId: CARD_ID,
    sideEffect: { type: 'bonusVp', amount: 1 },
  }],
})

export const E153_StoneSculptor_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player): number => {
      return (player.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned as number) ?? 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### 4.3 Trade.sideEffect.bonusVp 通用扩展

```ts
// shared/game/types.ts (TradeSideEffect 联合扩 bonusVp)
export type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }    // sprint-5c
  | { type: 'bonusVp'; amount: number }                                // ← 新
```

```ts
// shared/actions/helpers/payment.ts (扩 applyTradeSideEffect 签名 + bonusVp case)
export const applyTradeSideEffect = (
  state: GameState,
  player: PlayerState,
  eff: TradeSideEffect,
  times: number,
  sourceCard: string,
): void => {
  if (times <= 0) return
  switch (eff.type) {
    case 'drainSpace': {
      const space = state.actionSpaces.find((s) => s.id === eff.spaceId)
      if (!space?.resources) return
      const cur = space.resources[eff.resource] ?? 0
      space.resources[eff.resource] = Math.max(0, cur - times)
      return
    }
    case 'bonusVp': {
      player.cardStates ??= {}
      player.cardStates[sourceCard] ??= { extraData: {} }
      player.cardStates[sourceCard].extraData ??= {}
      const cur = (player.cardStates[sourceCard].extraData.bonusVpEarned as number) ?? 0
      player.cardStates[sourceCard].extraData.bonusVpEarned = cur + eff.amount * times
      return
    }
  }
}
```

注：sprint-5c 落地的 `applyTradeSideEffect` 签名当时是 `(state, eff, times)` — 改为 `(state, player, eff, times, sourceCard)` 是 breaking 改动。所有 caller（payment.ts 内 + exchange.ts 内）同步更新。

### 4.4 Exchange.execute 应用 sideEffect

```ts
// shared/actions/effects/exchange.ts (apply trade 处补 sideEffect 调用)
// 既有：扣 from / 加 to
// 新增：
if (trade.sideEffect && times > 0) {
  applyTradeSideEffect(state, player, trade.sideEffect, times, trade.sourceId ?? 'unknown')
}
```

### 4.5 Harvest window exchange 暴露

E153 的 `triggers: ['harvest']` 已经被 `getExchangesInWindow(player, 'harvest')`（exchange.ts:254）识别。**plan 阶段核查**：

1. 当前 harvest 流程（reap / feed / breed phase）哪个时机暴露 exchange 给玩家？grep `getExchangesInWindow.*'harvest'` / `harvest.*selector`。
2. 如果 harvest selector 当前只调 `'anytime'` window，需要在 harvest 流程某点（推荐：startHarvest 或 continueAfterFeedingPhase 之前）调 `getExchangesInWindow(player, 'harvest')` 暴露给玩家选用。
3. `max:1` 在 harvest 周期重置：plan 阶段确认现有 selector 是否在 harvest 入口重置 max counter；如不重置需补 reset 逻辑。

### 4.6 与 BGA 对齐表

| BGA | 我方等价 |
|---|---|
| `[STONE => [SCORE => 1, FOOD => 1], 'max' => 1]` | `from:{stone:1}, to:{food:1}, max:1, sideEffect:{bonusVp:1}` |
| `[HARVEST] window` | `triggers:['harvest']`（types.ts:5 已支持） |
| `scoreCardId` 累加 bonus VP | sideEffect.bonusVp dispatcher 写 cardStates.bonusVpEarned + computeBonusScore 读出 |

---

## 5. §2.7 stub list 同步

`docs/card_progress.md` line 206：

**Before**:
```
~~A135~~ ✅ Sprint 4 PR-4A / A165 / C62 / ~~C105~~ ✅ ... E134 / ~~E139~~ ✅ ... E153 / ~~E155~~ ✅
```

**After**:
```
~~A135~~ ✅ Sprint 4 PR-4A / ~~A165~~ ✅ Sprint 2 PR-2A / C62 /
~~C105~~ ✅ Sprint 6a / ~~C109~~ ✅ Sprint 6a / ~~C136~~ ✅ Sprint 4 PR-4A /
~~D62~~ ✅ Sprint 6a / ~~D94~~ ✅ Sprint 6c / ~~D108~~ ✅ Sprint 6a /
~~D131~~ ✅ Sprint 6d / ~~D157~~ ✅ Sprint 6a /
~~E58~~ ✅ Sprint 6d / ~~E134~~ ✅ Sprint 2 PR-2D / ~~E139~~ ✅ Sprint 6a /
~~E153~~ ✅ Sprint 6d / ~~E155~~ ✅ Sprint 6c
```

剩余真实 stub：**C62**（推 Sprint 6e）。

---

## 6. 测试策略

### 6.1 D131 session 测试（≥6 case）

| # | 用例 | 准备 | 断言 |
|---|---|---|---|
| 1 | onBuy gain stone:1 | p1 出 D131 | resources.stone +1 |
| 2 | D131 owner 占 minor-improvement → choice 含 bottom-row major | p1 拿 D131 + 占 minor-improvement + Pottery 仍可用 + 可付 cost | resp.pending.type='choice'，options 含 `Major_Pottery` 且 sourceCard='D131' |
| 3 | D131 owner 选 Major_Pottery → 走 major 付费 + 加 player.improvements | 同上 | resolveChoice 后 player.improvements 含 'Major_Pottery' |
| 4 | 非 D131 owner → 不出现 major 选项 | p1 拿其他 occupation；占 minor-improvement | options 不含 Major_* |
| 5 | D131 owner 但 4 张 bottom-row major 都已被买 | supply 上 4 张都已被领走 | options 仅含 minor 选项 |
| 6 | D131 owner 选 Major_Pottery 但 cost 不可付 | 资源不足 | Major_Pottery 不出现（affordability filter） |

### 6.2 E58 session 测试（≥5 case）

| # | 用例 | 准备 | 断言 |
|---|---|---|---|
| 1 | harvest 开始选用 → +1 food + skip field/breeding phase | p1 拿 E58；走到 round 4；选 optional 路径 | resources.food +1；cardStates.E58.extraData.passFieldAndBreedRound === 4；harvestReapSummary / harvestBreedSummary 不含 p1 entry |
| 2 | harvest 开始选不用 | optional 选 cancel | food 不变；cardStates 无 flag；正常跑 phase |
| 3 | 玩家无 E58 | 普通 harvest | listener 不 fire；正常跑 phase |
| 4 | round 4 选用 + round 7 重新触发 | 多 harvest 独立 | round 7 再次出现 optional 选项 |
| 5 | 跳过 phase 后玩家其他 onHarvest hook 是否触发 | p1 同时拿 E58 + D38 MilkingStool；选用 E58 跳过 | **plan 阶段 BGA 复核**：BGA 行为是否还触发 D38 onHarvestFieldPhase？默认假设 phase 跳过 = 该 phase 内所有 hook 都不 fire；如 BGA 行为不同，调整 spec 或登记 deliberate divergence |

### 6.3 E153 session 测试（≥6 case）

| # | 用例 | 准备 | 断言 |
|---|---|---|---|
| 1 | harvest 中 stone≥1 → 选 1 stone → 1 food + 1 bonus VP | p1 拿 E153，stone=2，走到 harvest | resources.stone -1, food +1；cardStates.E153.extraData.bonusVpEarned === 1 |
| 2 | 同 harvest 用 2 次（max:1）→ 只能 1 次 | stone=2，尝试再选第 2 次 | selector 不再暴露此 trade；bonusVpEarned 仍为 1 |
| 3 | 下个 harvest 重新 1 次 | round 4 用 1 次 → round 7 再用 1 次 | bonusVpEarned === 2 |
| 4 | 玩家无 E153 | 不暴露此 trade | exchange options 不含 E153 |
| 5 | 玩家有 E153 但 stone=0 | 不可付 | options 不含 E153 |
| 6 | computeBonusScore 累加 | 用 3 次（3 harvest 各 1 次）后游戏结束 | scores.bonusVp += 3 |

### 6.4 单元测试（既有 payment-trade-side-effect.test.ts 追加）

| # | 用例 | 断言 |
|---|---|---|
| 1 | bonusVp sideEffect: amount=2, times=3 → cardStates.bonusVpEarned += 6 | mock state+player；调 applyTradeSideEffect → 断言 cardStates 累加 |
| 2 | bonusVp sideEffect: cardStates 不存在时初始化 | 同上从 undefined 开始 |
| 3 | drainSpace 路径仍 work（regression）| 验证 sprint-5c 行为不破 |

### 6.5 反"假绿"机制

- E58 case 1：先红再绿。改 E58 stub 仅 gain food + 写 cardStates flag（不动 game-core）→ case 1 fail（reapSummary 仍含 p1）→ 改 game-core skip → green。
- E153 case 1：先红再绿。先实现 exchanges metadata 但 sideEffect 注册 dispatcher 不 fire → bonusVpEarned 不增 → case 1 fail → 补 dispatcher → green。

### 6.6 全量回归

| 测试 | 期望 |
|---|---|
| `pnpm test:fast` | 全绿 |
| `pnpm test:slow` 含相关卡 session 测试 | 全绿（D38 / E84 等不受影响） |
| `pnpm run lint` / `pnpm run build` | 0 error；不引入新 warning |

---

## 7. 文档同步

| 文档 | 改动 |
|---|---|
| `docs/card_progress.md` §2 changelog | "2026-05-01 Sprint 6d — D131 / E58 / E153 三张 stub 卡完整对齐 BGA + 3 处通用扩展（Trade.sideEffect.bonusVp / harvest phase skip helper / minor-improvement candidate injection）；§2.7 stub list 同步划掉 A165 / E134" |
| `docs/card_progress.md` §1 总览 | 实现数 +3；stub deferred 数 -3 |
| `docs/card_progress.md` §2.7 stub list | A165/E134 加 strikethrough+✅ Sprint 2；D131/E58/E153 加 strikethrough+✅ Sprint 6d |
| `docs/card_progress.md` §7 基础设施 | 新增 3 条扩展点 |
| `docs/master-plan.md` §0 Sprint 6 | stub deferred 数 12 → 9 |
| `docs/master-plan.md` §8 | 加 Sprint 6d 行 |
| `docs/ENGINE_ARCHITECTURE.md` | Trade.sideEffect.bonusVp 描述（接续 sprint-5c §15.19 drainSpace）；harvest phase skip helper；minor-improvement listener candidate injection 说明 |

---

## 8. 风险点

| 风险 | 严重度 | 缓解 |
|---|---|---|
| D131 bottom-row major 列表 BGA 未明确枚举 | 中 | plan 阶段 grep BGA `Major_*` / supply-board 配置；如确实只是 4 张工坊，spec 假设成立；如不一致按 BGA 调整 |
| E58 skip phase 与 onHarvest hook 互动语义 | 中 | plan 阶段读 BGA `passFieldAndBreed` 行为 + 实际 hook fire 测试；若 BGA 跳过 phase 仍 fire，调整 game-core skip 检查的精确范围；不一致登记 deliberate divergence |
| sprint-5c 的 `applyTradeSideEffect` 签名扩成 `(state, player, eff, times, sourceCard)` | 中 | grep caller 全部更新；与 sprint-5c 已落代码保持兼容（agent 报告该函数已存在；signature 改动需要在所有 caller 同步） |
| E153 `max:1` 在 harvest 周期重置机制 | 中 | plan 阶段确认现有 harvest selector 是否在 harvest 入口重置 max counter；如不重置需补 |
| minor-improvement.execute 加 listener 调用可能影响其他既有 minor-improvement 卡 | 低 | listener cardIds 限定 D131 own only；其他卡不触发；既有 D95 SiteManager 等用 `actions:['improvement-any']` 不冲突 |
| E58 stage-hook listener actionId 名 | 低 | plan 阶段 grep `__stage:onStartHarvest` 实际命名；如不存在该入口 fallback 用 effect.onStartHarvest 返回 ActionFlow（与 sprint-5c §2.4 onAfterRoundEnd 同模式） |

---

## 9. Definition of Done

1. D131 / E58 / E153 各 session 测试 ≥6 / ≥5 / ≥6 case 全绿
2. 单元测试 payment-trade-side-effect bonusVp 3 case 全绿
3. `pnpm test:fast` + 受影响 slow project 子集全绿
4. `pnpm run lint`：0 error；不引入新 warning
5. `pnpm run build`：通过
6. 文档同步（card_progress §2.0 / §1 / §2.7 / §7、master-plan §0 + §8、ENGINE_ARCHITECTURE）落实
7. push 后 GitHub Actions 全绿（CLAUDE.md push 后 CI 验证硬性要求）
8. 0 deliberate divergence（除非 plan 阶段 BGA 复核证实 phase-skip 互动需要登记）
9. §2.7 stub list 与实际进度一致：剩余真实 stub 唯一 = C62（推 Sprint 6e）
