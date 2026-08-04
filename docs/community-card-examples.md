# 社区卡牌示例（Community Card Examples）

10 个典型示例，涵盖沙盒支持的主要机制。

---

## 1. 极简纯分数卡

只有 CARD_DEF，CARD_IMPL 为空。花费资源打出，静态 VP。

```typescript
const CARD_ID = 'CUSTOM_SimpleHut'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Simple Hut',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Costs 2 <WOOD> 1 <REED> to build. Worth 1 <SCORE>.'],
    cost: { wood: 2, reed: 1 },
    vp: 1,
    implemented: true,
    locales: {
      zh: {
        name: '简易棚屋',
        desc: ['花费 2 <WOOD> 1 <REED> 建造，值 1 分。'],
      },
    },
  },
}

const CARD_IMPL = {}
```

> 纯定义卡不需要任何 effect 或 listener。`CARD_IMPL` 可以是空对象。

---

## 2. listener-only：监听 collect + resourcesGained

监听资源收集行动，根据收集到的资源类型获得额外收益。类似 A103 Portmonger。

```typescript
const CARD_ID = 'CUSTOM_Portmonger'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Portmonger',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Each time you collect <REED> from an accumulating space, you also gain 1 <FOOD>.'],
    cost: { clay: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '港口商人',
        desc: ['每次你从累积格收集 <REED> 时，额外获得 1 <FOOD>。'],
      },
    },
  },
}

const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        const gained = context.result?.resourcesGained
        if (!gained || !(gained.reed > 0)) return
        return {
          flow: gainLeaf(CARD_ID, { food: 1 }),
          sourceCard: CARD_ID,
        }
      },
    },
  ],
}
```

> `context.result.resourcesGained` 仅在 `after`/`immediatelyAfter` 阶段可用。

---

## 3. effect-only + seq：payLeaf + bonus-vp

打出时获得即时收益，每轮可选花费资源获得 VP。简化版 A100 Curator。

```typescript
const CARD_ID = 'CUSTOM_Curator'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Curator',
    deck: 'CUSTOM',
    number: 0,
    desc: ['When played, gain 1 <FOOD>. Each Returning Home phase, you may pay 1 <CLAY> to gain 1 <SCORE>.'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '策展人',
        desc: ['打出时获得 1 <FOOD>。每轮回家阶段，你可以花 1 <CLAY> 获得 1 <SCORE>。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      return gainLeaf(CARD_ID, { food: 1 })
    },
    onReturnHome: (state, player) => {
      if ((player.resources?.clay ?? 0) < 1) return
      return {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    },
  },
}
```

> `bonus-vp` 固定 +1 VP。需要 N 分就串 N 个 leaf 进 seq。

---

## 4. computeCosts phase listener：购买折扣

监听改良卡购买，在 computeCosts 阶段返回 mandatory capped bonus。

```typescript
const CARD_ID = 'CUSTOM_Bargainer'

const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Bargainer',
    deck: 'CUSTOM',
    number: 0,
    desc: ['When you buy an Improvement, its cost is reduced by 1 <WOOD>.'],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '砍价师',
        desc: ['你购买改良卡时，费用减少 1 <WOOD>。'],
      },
    },
  },
}

const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeCosts'],
      handler: () => ({
        bonuses: [{
          discount: { wood: 1 },
          capDiscountAtCost: true,
          optional: false,
          sources: [CARD_ID],
        }],
        sourceCard: CARD_ID,
      }),
    },
  ],
}
```

> 跨所有主要/次要改良候选的资源折扣必须用 mandatory capped bonus。`capDiscountAtCost` 防止费用变成负数，`optional: false` 不保留原价路径；`costs` 只用于简单行动费用。

---

## 5. store-on-card + take-from-card

打出时在卡上存放资源，满足条件时取出。简化版 A102 Grocer。

```typescript
const CARD_ID = 'CUSTOM_Grocer'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Grocer',
    deck: 'CUSTOM',
    number: 0,
    desc: ['When played, place 3 <GRAIN> on this card. After each Sow action, take 1 <GRAIN> from this card.'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '杂货商',
        desc: ['打出时在此卡上放置 3 <GRAIN>。每次播种后，从此卡上取 1 <GRAIN>。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      return {
        type: 'leaf',
        actionId: 'store-on-card',
        params: { grain: 3 },
        sourceCard: CARD_ID,
      }
    },
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['sow'],
      phases: ['after'],
      handler: (context) => {
        const stored = context.ownerPlayer?.cardStates?.[CARD_ID]?.counters?.grain ?? 0
        if (stored <= 0) return
        return {
          flow: { type: 'leaf', actionId: 'take-from-card', params: { grain: 1 }, sourceCard: CARD_ID },
          sourceCard: CARD_ID,
        }
      },
    },
  ],
}
```

> `store-on-card` 写入 `cardStates[CARD_ID].counters`，`take-from-card` 从中扣除。

---

## 6. scope: 'opponent'：对手翻修时获得芦苇

监听对手行动，给卡牌拥有者发放资源。

```typescript
const CARD_ID = 'CUSTOM_SpyMaster'

const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Spy Master',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Each time an opponent renovates their house, you gain 1 <REED>.'],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '间谍大师',
        desc: ['每当对手翻修房屋时，你获得 1 <REED>。'],
      },
    },
  },
}

const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['renovate-house'],
      phases: ['immediatelyAfter'],
      scope: 'opponent',
      handler: (context) => {
        return {
          flow: gainLeaf(CARD_ID, { reed: 1 }),
          sourceCard: CARD_ID,
        }
      },
    },
  ],
}
```

> `scope: 'opponent'` 时 `context.player` 是对手，`context.ownerPlayer` 是卡主。引擎自动进行所有权检查。

---

## 7. type: 'xor' 多选一：回家阶段选择

每轮回家阶段选择获得 2 食物或 1 木 1 黏土。

```typescript
const CARD_ID = 'CUSTOM_FlexibleWorker'

const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Flexible Worker',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Each Returning Home phase, choose: gain 2 <FOOD>, or gain 1 <WOOD> and 1 <CLAY>.'],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '灵活工人',
        desc: ['每轮回家阶段，你可以选择获得 2 <FOOD> 或 1 <WOOD> 1 <CLAY>。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: (state, player) => {
      return {
        type: 'xor',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { food: 2 }),
          gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
        ],
      }
    },
  },
}
```

> `type: 'xor'` 让玩家在子节点中选一个执行。`optional: true` 允许跳过。

---

## 8. onAfterHarvest + state.round 时序门

从第 5 轮起，每次收获后获得食物。

```typescript
const CARD_ID = 'CUSTOM_LateBloom'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Late Bloom',
    deck: 'CUSTOM',
    number: 0,
    desc: ['From round 5 onward, gain 2 <FOOD> after every Harvest.'],
    cost: { stone: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '大器晚成',
        desc: ['从第 5 轮起，每次收获后获得 2 <FOOD>。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onAfterHarvest: (state, player) => {
      if ((state.round ?? 0) < 5) return
      return gainLeaf(CARD_ID, { food: 2 })
    },
  },
}
```

> `state.round` 范围 1-14。收获发生在阶段 4/7/9/11/13/14 结束时。

---

## 9. computeBonusScore 终局加分：每 3 只羊 = 1 VP

游戏结束时根据羊的数量加分。

```typescript
const CARD_ID = 'CUSTOM_Shepherd'

const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Shepherd',
    deck: 'CUSTOM',
    number: 0,
    desc: ['At game end, gain 1 <SCORE> for every 3 <SHEEP> you have.'],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '牧羊人',
        desc: ['游戏结束时，每 3 只 <SHEEP> 获得 1 <SCORE>。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (state, player) => {
      const sheep = player.resources?.sheep ?? 0
      return Math.floor(sheep / 3)
    },
  },
}
```

> `computeBonusScore` 返回 VP 数（`number`）而非 ActionFlow。这是终局计分的正式方式。

---

## 10. handHooks 手中触发：回合开始时从手牌触发

卡牌在手牌中时就能在回合开始时触发效果（如 E96 Elder）。

```typescript
const CARD_ID = 'CUSTOM_EarlyBird'

const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Early Bird',
    deck: 'CUSTOM',
    number: 0,
    desc: ['At the start of each round (even while this card is still in hand), gain 1 <FOOD>. Once played, the effect continues normally.'],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
      zh: {
        name: '早起者',
        desc: ['每轮开始时（即使此卡还在手中），获得 1 <FOOD>。打出后效果照常触发。'],
      },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    handHooks: ['onRoundStart'],
    onRoundStart: (state, player) => {
      return gainLeaf(CARD_ID, { food: 1 })
    },
  },
}
```

> `handHooks` 是 meta 字段，只声明会从手牌派发的 stage hook；不支持 `onBuy`、`onEndTurn`、`onBeforeEndGame`、`onBeforePlayerTurn`。一旦卡牌打出，只走正常 hook 路径。
