# Sprint 6a — Cookery Exchange 通用化 + 6 张 stub 卡 + family-growth 统一 设计

> 日期：2026-04-30
> Sprint：6a（Sprint 6 第一批，6 张 stub 🟢/🟡 卡 + 通用机制清理）
> Worktree：`.worktree/sprint-6a-cookery-trades`
> 基于 main：`47d03b68`（含 Sprint 5 / 5b 全收口 + audit §5.7 重审）
> 目标：6 张 stub 卡（C109 / C105 / D62 / D108 / D157 / D92 / E139）+ 4 个通用机制升级
> 工时估算：~3.3-3.6 day

## 1. 范围与目标

Sprint 6 整体清单：12 张 stub + ~5 张 §2.4 数值偏差 + category 命名 sweep + getExchangeResources 系统性简化。Sprint 6a 选 🟢 / 🟡 张数（机制评估「现有扩展点能闭包」类）+ 顺手清理几个反模式：

### 6 张 stub 卡

| 卡 | 类型 | 评估 |
|---|---|---|
| C109 SchnappsDistiller | Occupation | 🟢 单条 harvest exchange metadata |
| D62 BeerTap | Minor | 🟢 三档 harvest exchange metadata（max:1 共享 sourceId）|
| D108 StoneCarver | Occupation | 🟢 单条 harvest exchange metadata |
| C105 BasketCarrier | Occupation | 🟡 反向 trade（食物→3资源）— 触发 selector 通用化 |
| D157 PartyOrganizer | Minor | 🟢 opponent listener wish-children + 计分（已实现） |
| D92 ChildOmbudsman | Occupation | 🔴→🟢 现有 listener 完全错（监听对象错 + 效果错），重写 |
| E139 BunnyBreeder | Minor | 🟢 onBuy queueFutureMeeples（参考 E108/E119 现成模式） |

### 4 个通用机制升级（连带清理）

1. **`exchanges` metadata 字段统一**：删 `cookeryTrades` 硬编码表 + Major Fireplace/CookingHearth 加 `exchanges` 字段 + 删 `hasHarvestCooking` 硬编码 ID 检测
2. **harvest exchange selector 通用化**：entry-index 模型 + 双向 reverse trade 支持（C105 驱动）
3. **`family-growth` action 统一**：合并 `wish-children-growth` + `grow-family-without-room` 为单一 `family-growth` action with `actionContext.skipRoomCheck`（BGA 对齐 — 单一 `WISHCHILDREN` action）
4. **`special-effect` 升级**：从空 stub 升级为 mutation dispatcher（4 kind）

### 不在范围（推后）

- **C62 CookeryExtension** 🔴：动态 cookery exchange 生成（扫其他 cookery 卡 × 翻倍 food）— 需新机制 ~1.5d，独立 spec
- **D94 HenpeckedHusband** 🔴：placed-farmer 顺序追踪 + return-specific-farmer API — 独立 spec
- **E155 Visionary** 🔴：family-growth `isDoable` 跨玩家比较 — 独立 spec
- **E58 / E153** 🟡：harvest phase skip / exchange bonus VP 字段扩展 — 6b 候选
- **E149 / E38 / D134 / C104** 4 张「listener handler / execute 内 mutate cardStates」清理：性质与 6a 不同（已用卡的 mutation pattern 清理 vs 补 stub 让卡能用），独立 sprint
- **A165 / B155**：Sprint 6 余下范围 / Sprint 7

## 2. Cookery Exchange 通用化

### 2.0 前置重构 — 删除硬编码反模式

#### 现状问题

| 反模式 | 位置 | 影响 |
|---|---|---|
| 硬编码 trade 表 | `shared/actions/effects/exchange.ts:220-248`（5 条 entries：4 Major + E53） | 加新 cookery 卡要改主路径文件 |
| 硬编码 ID 前缀检测 | `shared/session/game-core.ts:585-587`（`startsWith('Major_Fireplace')`） | 加新 cooking 设备要改 game-core |
| Major 卡无 `exchanges` 字段 | `shared/cards/major/types.ts` `MajorCardEffect` | 主要改良无统一 metadata |

#### 改造

1. **`MajorCardEffect`** 加 `exchanges?: CardExchange[]` 字段（同 `CardBase`）
2. **fireplace1/fireplace2/cookingHearth1/cookingHearth2** 4 个 Major 卡加 metadata：

```ts
// shared/cards/major/fireplace.ts
export const fireplace1: MajorCardEffect = {
  id: 'Major_Fireplace1', cost: { clay: 2 }, vp: 1, isCookery: true, isBaking: true,
  exchanges: [
    { from: { sheep: 1 },     to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { boar: 1 },      to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { cattle: 1 },    to: { food: 3 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    // bake-bread 单独窗口（未来扩展）
    { from: { grain: 1 },     to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['bake-bread'] },
  ],
}
// fireplace2 同 fireplace1（仅 cost 不同）
// cookingHearth1/2: cattle/vegetable 比例不同（看 BGA）
```

3. **E53_BoarSpear metadata** 加 `exchanges` 字段：

```ts
exchanges: [{
  from: { boar: 1 }, to: { food: 4 },
  sourceId: 'E53_BoarSpear',
  triggers: [],   // 空 triggers — 不在 anytime / harvest window aggregator 中（仅事件触发可见）
}]
```

4. **`getPlayerCookeryTrades`** 改写走 metadata：

```ts
// shared/actions/effects/exchange.ts
function getExchangesInWindow(player: PlayerState, window: ExchangeWindow): CardExchange[] {
  const result: CardExchange[] = []
  for (const cardId of [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]) {
    const card = getRegisteredCard(cardId)
    for (const ex of card?.exchanges ?? []) {
      if (ex.triggers.includes(window)) result.push(ex)
    }
  }
  return result
}

function getExchangesByTradeIds(player: PlayerState, tradeIds: string[]): CardExchange[] {
  // listener 弹时使用：按 sourceId 强制 include（即使 triggers=[]）
  ...
}
```

5. **删除** `cookeryTrades` 硬编码表（exchange.ts:220-248）

6. **删除** `hasHarvestCooking`（game-core.ts:583-598）；feeding phase 入队条件改为：

```ts
const hasHarvestExchange = getExchangesInWindow(player, 'harvest').length > 0 ||
                           getExchangesInWindow(player, 'anytime').length > 0
const remaining = required - useFood
if (remaining > 0 || hasHarvestExchange) {
  feedQueue.push({ index: i, remaining, foodUsed: useFood })
}
```

#### Trigger 字段类型

```ts
type ExchangeWindow = 'anytime' | 'harvest' | 'bake-bread'

type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  sourceId: string
  max?: number
  triggers: ExchangeWindow[]   // 数组：可同时属于多 window；空数组 = 仅事件触发
}
```

注意：`triggers` 仅 window 类型（无 event descriptor）。事件触发型 exchange（如 E53）保留 listener 模式 + tradeIds filter（mech-C 已成熟），不引入 event DSL（YAGNI；当前仅 1 张事件触发卡）。

#### 工时

~1.5h（含 4 Major + E53 metadata 迁移 + helper 改写 + 删除反模式 + 现有 4 cookery 测试回归）

### 2.1 C109 SchnappsDistiller — 单条 metadata

```ts
exchanges: [{ from: { vegetable: 1 }, to: { food: 5 }, sourceId: 'C109_SchnappsDistiller', max: 1, triggers: ['harvest'] }]
```

无 effect impl。**~5 min**。

### 2.2 D108 StoneCarver — 单条 metadata

```ts
exchanges: [{ from: { stone: 1 }, to: { food: 3 }, sourceId: 'D108_StoneCarver', max: 1, triggers: ['harvest'] }]
```

**~5 min**。

### 2.3 D62 BeerTap — 三档共享 sourceId

```ts
exchanges: [
  { from: { grain: 2 }, to: { food: 3 }, sourceId: 'D62_BeerTap', max: 1, triggers: ['harvest'] },
  { from: { grain: 3 }, to: { food: 6 }, sourceId: 'D62_BeerTap', max: 1, triggers: ['harvest'] },
  { from: { grain: 4 }, to: { food: 9 }, sourceId: 'D62_BeerTap', max: 1, triggers: ['harvest'] },
]
```

`game-core.ts:2237-2240` 的 `perSourceUsed` map 是 sourceId-level 累加 — 三 entries 共享 sourceId 自然实现「整张卡 1 次（3 选 1）」语义。**onBuy +2 food 已实现，不动**。

**~10 min**（含 sourceId 字段验证）。

### 2.4 C105 BasketCarrier + selector 通用化

#### BGA

```php
$this->exchanges = [Utils::formatExchange([FOOD => [WOOD => 1, REED => 1, GRAIN => 1], 'nb' => 2, 'max' => 1], $this->name, [HARVEST], $this->id)];
// 玩家付 2 food 换 1 wood + 1 reed + 1 grain（反向 trade）
```

#### C105 metadata

```ts
exchanges: [{
  from: { food: 2 },
  to: { wood: 1, reed: 1, grain: 1 },
  sourceId: 'C105_BasketCarrier',
  max: 1,
  triggers: ['harvest'],
}]
```

#### Selector 通用化（game-core.ts:2215-2242）

**当前限制**：

```ts
if (fromKeys.length !== 1) return false                  // 只单 from key
const foodOut = (ex.to as Partial<Resource>).food ?? 0
return foodOut === sel.food                              // to 必须是 food
```

**改造为 entry-index based**：

```ts
type CookerySelection = {
  sourceId: string
  exchangeIndex: number   // ← 直接定位 entry，不靠资源 / food 匹配
  count: number
}

const exchange = card.exchanges?.[sel.exchangeIndex]
if (!exchange || !exchange.triggers.includes('harvest')) return sel
// perSourceUsed cap 不变（sourceId-level）
```

**消费阶段双向应用**：

```ts
const capped = Math.min(sel.count, remaining)
// 扣 from（任意 resource set）
for (const [k, v] of Object.entries(exchange.from)) {
  player.resources[k] -= v * capped
}
// 加 to（任意 resource set）
for (const [k, v] of Object.entries(exchange.to)) {
  player.resources[k] += v * capped
}
```

#### Feeding phase prompt UI

`hasHarvestCooking` 改名 / 替换为 `hasAnyHarvestExchange`（前述 §2.0）。Prompt UI 列双向选项：

- **Forward**（resource → food）：sell sheep / boar / cattle / veg / grain / stone for X food（C59 / C109 / D108 / D62 / Major Fireplace / CookingHearth）
- **Reverse**（food → resources）：buy 1 wood + 1 reed + 1 grain for 2 food（C105）
- **Skip / Done**：玩家放弃任何 trade（remaining 自动 begging）

每个选项标 `sourceId + exchangeIndex`。i18n key 加 reverse 文案。

#### 工时

~1d（含 selector 模型改 + 双向 consumer + UI prompt 改 + 4 张 forward 卡回归 + C105 测试 4 例）

### 2.5 special-effect 升级（mutation dispatcher）

#### 现状

`shared/actions/effects/special-effect.ts` 是空 stub（仅测试用）。

#### 改造

```ts
// shared/actions/effects/special-effect.ts
import { setCardFlag, writeCardInfobox, readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }

export const specialEffectAction: ActionDefinition = {
  id: 'special-effect',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
    const p = params as SpecialEffectParams | undefined
    if (!p) return { type: 'fail', logKey: 'log.specialEffectFail' }
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(player, sourceCard, p.key) ?? 0
        writeCardExtraData(player, sourceCard, p.key, current + p.amount)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(player, sourceCard, p.key, p.value)
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(player, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(player, sourceCard, p.text)
        return { type: 'ok' }
    }
  },
}
```

#### 注册

加到 `shared/actions/internal-actions.ts` 的 action 列表（替换现有 stub `specialEffect` 引用）。

#### 用例（D92 SEQ children）

```ts
[
  { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
    params: { kind: 'increment-extra-data', key: 'negativeScore', amount: 2 } },
  { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
]
```

#### 工时

~50 min（含 4 kind dispatcher + 注册 + 4 单元测试 + D92 用 leaf 接入）

## 3. family-growth refactor + D157 + D92 重写

### 3.1 family-growth 统一

#### BGA 对齐

`/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/Actions/ActionUrgentWishChildren.php:24`：单一 `WISHCHILDREN` action（urgent 通过 actionCardType 标识）。

#### 改造

```ts
// shared/actions/effects/wish-children.ts — 合并 wishChildrenAction + growFamilyWithoutRoomAction
export const familyGrowthAction: ActionDefinition = {
  id: 'family-growth',
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player, ctx) => {
    if (ctx?.actionContext?.skipRoomCheck === true) return true
    return effectiveRooms(player) > familySize(player)
  },
  execute: ({ state, player, space, actionContext }) => {
    const skipRoom = actionContext?.skipRoomCheck === true
    if (!skipRoom && effectiveRooms(player) <= familySize(player)) {
      return { type: 'fail', logKey: 'log.familyGrowthFail' }
    }
    return growFamilyCore(state, player, space.id)   // 合并核心逻辑
  },
}
```

`growFamilyCore`：合并 `growFamily` + `growFamilyWithoutRoom`（核心 `activateSmallestInactive` + `addWorkerRef` 相同）。

#### Action space 注册

```ts
// 'wish-children' space — 标准 grow，require room
flow: { type: 'leaf', actionId: 'family-growth' }

// 'urgent-wish-children' space — 不 require room
flow: { type: 'leaf', actionId: 'family-growth', actionContext: { skipRoomCheck: true } }
```

#### 5 张稳定 listener 卡迁移 actionId

| 卡 | 当前 actions | refactor 后 |
|---|---|---|
| E113 Godmother | `['wish-children', 'wish-children-growth']` | `['family-growth']` |
| E130 Overachiever | `['wish-children-growth']` | `['family-growth']` |
| E151 DeliveryNurse | `['wish-children-growth']` | `['family-growth']` |
| E92 FieldDoctor | `['wish-children-growth']` | `['family-growth']` |
| D150 GodlySpouse | `['wish-children-growth']` | `['family-growth']` |

注：D92 同样涉及但走完整重写（§3.3），不仅是 actionId 迁移。E113 / D92 现有的 `'wish-children'` space ID 监听语义会去掉（plan 阶段确认这俩卡是不是只关心 effect 触发，BGA 也是监听 effect）。

#### 工时

~1.5h（含 effect 合并 + space 注册 + 5 卡迁移 + 测试 actionId 更新）

### 3.2 D157 PartyOrganizer

#### BGA 行为

- 触发：当**对方**家庭成员数到 5（恰好 4→5）
- 效果：本卡 owner 立即获 8 food（限一次，flag）
- 计分：仅当 owner 5 人 + **无其他玩家** 5 人 → +3 bonus VP

#### 修法

```ts
import { workersAvailable, familySize } from '../../game/player'   // 复用现有 helper

const listener: CardListenerRegistration = {
  id: 'D157-after-opponent-grows-family',
  cardIds: [CARD_ID],
  scope: 'opponent',                       // 现成 mech，参考 E160 / E154 / E95
  phases: ['after'],
  actions: ['family-growth'],              // 监听 effect 不是 space
  handler: (context) => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const opponent = getEventPlayer(context)   // plan 阶段确认字段名（context.actor / context.eventPlayer）
    if (familySize(opponent) !== 5) return     // 仅在「正好到 5」触发
    setCardFlag(context.player, CARD_ID, true)
    return {
      flow: { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID,
              params: { food: 8 } },
      sourceCard: CARD_ID,
    }
  },
}

// computeBonusScore（plan 阶段验证已实现）
computeBonusScore: (state, player) => {
  if (familySize(player) < 5) return 0
  const otherPlayersWith5 = state.players.filter(p => p.id !== player.id && familySize(p) >= 5).length
  return otherPlayersWith5 === 0 ? 3 : 0
}
```

#### 工时

~0.3d（含 listener context 字段确认 + 测试 4 例）

### 3.3 D92 ChildOmbudsman 重写

#### 当前错误

- 监听 `wish-children-growth`（应监听**任何 place-farmer**）
- 仅累加 -2 VP/次（应弹**可选 SEQ**让玩家选「-2 VP + family-growth」）
- `growthCount` 实际是「自己 grow 次数」，BGA 是「主动选 D92 几次」

#### BGA 行为

```php
public function isListeningTo($event) {
  return $this->isActionEvent($event, 'PlaceFarmer');   // 任何 place-farmer
}
public function onPlayerAfterPlaceFarmer($player) {
  if (Globals::getTurn() < 5) return;
  // round ≥ 5：弹 SEQ optional [SPECIAL_EFFECT 累加 -2 VP, WISHCHILDREN constraints:freeRoom]
}
```

#### 改造

```ts
const listener: CardListenerRegistration = {
  id: 'D92-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['place-farmer'],                           // 监听 place-farmer 任何
  handler: (context) => {
    if (context.state.round < 5) return                // round < 5 不 active
    if (effectiveRooms(context.player) <= familySize(context.player)) return  // 无 free room 跳过
    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.D92_ChildOmbudsman.choice',
        children: [
          // 1. 累加 -2 VP（玩家选 yes 后 engine 才 fire）
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'negativeScore', amount: 2 } },
          // 2. 立即 family-growth（require freeRoom，已通过 listener 守卫）
          { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

// computeBonusScore — 累计 -negativeScore 转 VP
computeBonusScore: (_state, player) => {
  return -(readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0)
}
```

#### 关键 plan 阶段确认

1. **mech-A jumpChain 互动**：jumpChain 跳第二格时，D92 listener 也 fire — 是 BGA 设计的一部分（每个 place-farmer 都触发）。D92 自己的 family-growth leaf 不会回到 D92 listener（family-growth ≠ place-farmer），安全。
2. **per-turn 一次性**：BGA 没显式说 once-per-turn，每次 place-farmer 都触发；按 BGA 行为，不加守卫。
3. **`negativeScore` 字段命名**：用 `negativeScore` 累计（BGA 用 `negativeScore` 同名），computeBonusScore 转负。

#### 工时

~0.5d（含 listener 重写 + SEQ + computeBonusScore + 测试 5 例）

## 4. E139 BunnyBreeder

### BGA 行为（确认）

```php
// E139_BunnyBreeder.php
public function onBuy($player) {
  $turnLeft = 14 - Globals::getTurn();
  $childs = [];
  for ($i = 1; $i <= $turnLeft; $i++) {
    $childs[] = $this->futureMeeplesNode([FOOD => $i], [Globals::getTurn()+$i]);
  }
  return ['type' => NODE_XOR, 'optional' => true, 'childs' => $childs];
}
```

**XOR optional**：玩家选**一个**目标 round（current+1, current+2, ..., 14），在该 round 一次性派 `(target_round - current_round)` 食物。或玩家 skip（不选）。**单 entry，非累积**。

### 修法

```ts
import { Occupation } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E139_BunnyBreeder'

export const E139_BunnyBreeder = new Occupation({
  id: CARD_ID,
  name: 'Bunny Breeder',
  deck: 'E', number: 139,
  category: 'FOOD',
  desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
  players: '3+',
})

export const E139_BunnyBreeder_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const turnLeft = 14 - state.round
      if (turnLeft <= 0) return
      // XOR optional: 列出 i=1..turnLeft 个选项；玩家选 1 个或 skip
      const xorChildren = Array.from({ length: turnLeft }, (_, idx) => {
        const i = idx + 1
        // 每个 child 是「在 round=state.round+i 派 i food」的单 entry future-meeples 节点
        // plan 阶段确认 futureMeeplesNode 接口是否支持 inline 配置或需要先 queueFutureMeeples（参考 E108 / E119）
        return makeFutureMeepleChild(state, player, i)
      })
      return {
        type: 'xor',
        optional: true,
        children: xorChildren,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### Plan 阶段确认（关键）

1. **XOR node + futureMeeplesNode children 实现方式**：
   - 当前 E108 / E119 / E43 / E45 模式是「onBuy 直接 `queueFutureMeeples(...)` + 返回 `futureMeeplesNode()`」（立即执行，无玩家选择）
   - E139 需要「**XOR 玩家选 1 个**」+ 每个 child 各自 queueFutureMeeples — engine 是否支持「XOR child 内执行 mutation + 返回 node」？
   - 实现选项：
     - **A**（XOR node + child resolveChoice）：每个 XOR child 是单 leaf 或自己的 SEQ；engine 执行选中 child 时调 child 的 mutation；plan 阶段确认 engine XOR 节点的语义
     - **B**（choice + resolveChoice）：onBuy 返回 `{ type:'choice', options }`；resolveChoice 内根据 i 调 queueFutureMeeples + 返回 futureMeeplesNode（跟 mech-A / 5b 其他 choice-driven 卡风格一致）
   - 推荐 **B**（更贴近现有 pattern；engine XOR 节点未必支持 child 内 mutation）
2. **Occupation effect 是否支持 `resolveChoice` 回调**：参考 E108 / E119 是不是有 resolveChoice；如果没有，在 effect 上加。
3. **i18n key**：`cards.E139_BunnyBreeder.option`（labelParams `{ delta, targetRound }`）+ `prompt` 双语。

### 工时

~0.2d（plan 阶段 BGA 验证 + onBuy choice + resolveChoice + 测试 4 例）

## 5. 测试 + 文档同步

### 5.1 测试边界

按 commit 粒度配套测试（plan 阶段细化），合计 ~25-30 例：

| commit | 测试 |
|---|---|
| 1. exchange metadata 重构 | `getPlayerCookeryTrades` / `getExchangesInWindow` 走 metadata；4 Major + C59 + E53 cookery 现有测试**回归** |
| 2. C109 / D62 / D108 metadata | 各 2-3 例（harvest 转换 / max:1 cap / D62 三档共享 sourceId 1 次） |
| 3. C105 + selector 通用化 | C105 4 例（无 food 不可选 / 食 2 换 1+1+1 / max:1 / harvest skip）+ selector 双向 unit test 5 例 |
| 4. special-effect 升级 | `special-effect.test.ts` 4 例（每 kind 一例） |
| 5. family-growth refactor | 单一 action ID + skipRoomCheck + 5 卡 listener actionId 迁移**回归** |
| 6. D157 listener | 4 例（4→5 触发 / 5→6 不重发 / 3→4 不发 / 计分） |
| 7. D92 重写 | 5 例（round 4 不弹 / 无 freeRoom 不弹 / 弹 SEQ / 选 yes / 选 no） |
| 8. E139 futureMeeples | 4 例（onBuy choice / N=2 队列 / round 2/3 各派 / round 14 onBuy 无 choice） |

### 5.2 文档同步

#### `docs/card_progress.md`

- §2.0 changelog 加 sprint-6a 条目（每 commit 简要描述）
- §2.6 stub 列表迁出 6 张（C109 / D62 / D108 / D157 / D92 / E139）→ ✅ done；保留 C62 / D94 / E155（推后）+ A165 / B155
- §2.3 D92 / D157 行为偏差迁移到 ✅
- §3 基础设施清单加 4 条：
  1. `exchanges` metadata 字段统一（删 cookeryTrades 表 + Major 加字段 + 删 hasHarvestCooking）
  2. harvest exchange selector 通用化（entry-index + 双向 reverse）
  3. `family-growth` action 统一（actionContext.skipRoomCheck）
  4. `special-effect` mutation dispatcher（4 kind）
- §6 Follow-up cleanup：登记 4 张 mutation 卡清理（E149 / E38 / D134 / C104）
- §8 时间线加 sprint-6a 行

#### `docs/master-plan.md`

- §1 / §8 Sprint 6 进度更新（partial done → 6/12 stub + 4 通用机制）
- §8 加 sprint-6a 行（spec / plan / branch 列）

#### `docs/ENGINE_ARCHITECTURE.md`

接续 mech-E §15.5 / 5b §15.6-15.7，加：

- **§15.8 cookery exchange metadata-driven**：所有 trade 在卡 metadata `exchanges` 字段；`triggers: ExchangeWindow[]` 控制 window
- **§15.9 harvest exchange selector 通用化**：entry-index 模型 + reverse trade
- **§15.10 family-growth unification**：单一 action + actionContext.skipRoomCheck
- **§15.11 special-effect mutation dispatcher**：4 kind discriminated union

#### `docs/CUSTOM_CARD_SANDBOX.md`

- 加 `triggers` 字段说明（如果在 LLM 工坊范围内）
- 加 `special-effect` action 描述
- prompt-sync 自动检查（避免再次 hot-fix）

### 5.3 Commit 粒度（9 个）

```
1. refactor(exchange): migrate cookeryTrades + Major exchanges to card metadata; remove hasHarvestCooking
2. feat(stub): C109 / D62 / D108 metadata exchanges
3. feat(C105, exchange): generic selection model + reverse trade support
4. feat(special-effect): upgrade stub to mutation dispatcher (4 kinds)
5. refactor(family-growth): unify two grow effects into single action with actionContext.skipRoomCheck
6. fix(D157): opponent listener using family-growth + 8 food gain on opponent reaching 5
7. fix(D92): rewrite to listen place-farmer; offer optional [-2 VP via special-effect + family-growth] SEQ
8. feat(E139): onBuy queueFutureMeeples for 1..N future rounds
9. docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / CUSTOM_CARD_SANDBOX for sprint-6a
```

## 6. Follow-up cleanup（不在 6a 实施）

### 6.1 4 张 mutation pattern 清理

性质与 6a 不同（已用卡的 mutation pattern 清理 vs 补 stub 让卡能用），独立 sprint：

1. **E149 MidnightFencer** — `resolveChoice` 累加 `owedFences += K` → 改 special-effect leaf
2. **E38 RodCollection** — listener `after-collect` handler 累加 `woodCount += 2` → 改 special-effect leaf（即使 after-hook 自动）
3. **D134 OysterEater** — listener `after-place-farmer` handler 累加 `skipNextPlacement += 1` → 改 SEQ + special-effect
4. **C104 Collector** — PlayerActionCard `execute` 累加 `used += 1` → 改 SEQ + special-effect（涉及 PlayerActionCard 模式重写，最复杂）

### 6.2 flag-card / unflag-card 重定向

`flag-card` / `unflag-card` 重定向到 `special-effect` kind=`'set-flag'`（rename / 兼容工作）

### 6.3 listener handler mutation 全审计

plan 阶段 grep 发现的其他「listener handler 内 mutate cardStates」卡（除已 6a / 已记 follow-up 外）

## 7. 风险与回滚

### 风险点

1. **Major Fireplace / CookingHearth 加 `exchanges` 字段后回归风险**：现有 `cooking-exchange.test.ts` 等测试要全部通过 — plan 阶段先复查 4 Major 卡的 cooking 行为不能 break
2. **Selector entry-index 模型改变 selection schema**：跨 client / server / persistence — plan 阶段确认序列化兼容；若有 ongoing session state 需 rehydrate 处理（影响 dev 持久化房间）
3. **D92 重写改变玩家体验**：之前每次 wish-children 自动累 -2 VP；新版每次 place-farmer 弹可选 SEQ。需要游戏中 D92 玩家明确感知行为变化
4. **family-growth refactor 影响 6 张 listener 卡**：actionId 迁移需要全部 listener 卡同步；任一漏改会变 silent no-op；plan 阶段 grep `wish-children-growth` / `grow-family-without-room` 全文件确认完整

### 回滚

每个 commit 独立可 revert。最坏情况：
- commit 1（exchange metadata 重构）revert → 退回硬编码表，新卡（commit 2/3）需要 cookeryTrades 表写入版本（plan 阶段保留 fallback 假设）
- commit 4 / 5（special-effect / family-growth）独立可 revert
- commit 7（D92）revert → 维持现错误状态，不影响其他卡

## 8. 验证 / DoD

- `pnpm test:fast` 全绿（fast project ~280 文件，约 +5-7 个新测试文件）
- `pnpm test:slow` 不回归（cookery / fencing / harvest 相关 session test）
- `pnpm run lint` 0 error
- `pnpm run build` 成功
- `pnpm run check:prompt-sync` 全绿（避免 5b 时 hot-fix 再现）
- 手测：开两人房，每张新卡 / 修改卡走正向 / 反向场景
  - C105：harvest 弹 reverse trade prompt，玩家 spend 2 food 拿 wood/reed/grain
  - D62：harvest 三档选一，整张卡 1 次
  - C109 / D108：harvest 转换正确
  - D157：对手 grow 到 5 → owner 自动 +8 food
  - D92：round 5 后玩家 place-farmer → 弹 SEQ 选 yes 拿 family +1 + -2 VP
  - E139：onBuy 选 N → 后续 round 派 food
- CI 三 run（CI / CI Full / Deploy）全 success
- 4 个 doc 同步完整

## 9. 工时合计

| 项 | 工时 |
|---|---|
| §2.0 cookery metadata 重构 | ~1.5h |
| §2.1-§2.3 (3 张 metadata) | ~20 min |
| §2.4 (C105 + selector 通用化) | ~1d |
| §2.5 special-effect 升级 | ~50 min |
| §3.1 family-growth refactor | ~1.5h |
| §3.2 D157 listener | ~0.3d |
| §3.3 D92 重写 | ~0.5d |
| §4 E139 futureMeeples | ~0.2d |
| §5 测试 + 文档同步 | ~0.6d |
| **6a 合计** | **~3.3-3.6d** |
