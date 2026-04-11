# Card Design Prompt 文档

> **注意**：本文档为早期设计参考。实际 LLM 系统提示词以 `src/services/llmPrompts.ts` 中的 `CARD_DESIGNER_SYSTEM_PROMPT` 为准。以下内容可能与实际实现有差异。

## 设计原则

1. **不使用 import/export** — 沙盒环境禁止 import，所有函数（`registerCardEffect`、`registerCardListener`）作为全局变量注入
2. **两套扩展机制** — `registerCardEffect`（阶段触发）和 `registerCardListener`（行动触发），覆盖所有卡牌效果
3. **动态计算支持** — hook 函数内可访问完整 GameState 和 PlayerState

## Prompt 结构

### 1. 输出格式

TypeScript 代码块，**不使用 import/export**：

```typescript
const CARD_ID = 'CUSTOM_英文驼峰名'

// 效果注册（可选）
registerCardEffect({ id: CARD_ID, ... })

// 监听器注册（可选）
registerCardListener({ id: CARD_ID, ... })

// 卡牌定义（必须）
const card = new MinorImprovement({ ... })
// 或 new Occupation({ ... })
```

### 2. 可用机制清单

| 机制 | 实现方式 | 说明 |
|------|----------|------|
| 阶段触发 | `registerCardEffect` + `onReturnHome` 等 | 回家/收获/轮次触发 |
| 行动触发 | `registerCardListener` + `actions` + `phases` | 每次犁地/建造/收集等触发 |
| 费用折扣 | `modifiers` 字段 | 静态费用修改 |
| 动态费用 | `registerCardListener` + `phases: ['computeCosts']` | 动态计算折扣 |
| 动态计算 | hook 内访问 `player.familySize` 等 | 根据游戏状态计算 |
| 替换行动 | listener + `computeReplace` + `decline: true` | 把某行动替换为其他效果 |
| 启用行动 | listener + `isDoable` + `doable: true` | 让不可用的行动变可用 |
| 资源转换 | `modifiers: [{ type: 'trade', ... }]` | 静态资源替换 |
| 多选一 | ActionFlow `type: 'xor'` | 玩家选择分支 |

### 3. registerCardEffect 可用 hook

| hook | 触发时机 | 频率 |
|------|----------|------|
| `onBuy` | 打出此卡时 | 一次 |
| `onRoundStart` | 每轮开始 | 每轮 |
| `onRoundEnd` | 每轮结束 | 每轮 |
| `onReturnHome` | 工人回家阶段 | 每轮 |
| `onHarvest` | 收获阶段 | 每4-5轮 |
| `onBeforeHarvest` / `onAfterHarvest` | 收获前/后 | 每4-5轮 |
| `onHarvestFieldPhase` | 收割田地 | 每4-5轮 |
| `onBeforeFeed` / `onAfterFeed` | 喂食前/后 | 每4-5轮 |

### 4. registerCardListener 结构

```typescript
registerCardListener({
  id: 'unique-listener-id',
  cardIds: [CARD_ID],
  actions: ['plow', 'sow', 'collect', ...],
  phases: ['after'],
  handler: (context) => {
    // context.player, context.state, context.space 可用
    return { flow: ..., sourceCard: CARD_ID }
  }
})
```

**可用 phases**: `before`, `during`, `immediatelyAfter`, `after`, `computeCosts`, `computeArgs`, `computeReplace`, `isDoable`

**可用 actions**: `collect`, `construct`, `renovation`, `fencing`, `plow`, `sow`, `play-occupation`, `improvement-any`, `place-farmer`, `family-growth`

### 5. 可用 actionId

| actionId | 说明 | params |
|----------|------|--------|
| `gain` | 获得资源 | `{ food: 2, wood: 1 }` |
| `pay-resources` | 支付资源 | `{ grain: 1 }` |
| `bonus-vp` | +1 VP | `{}` |
| `gain-other-players` | 其他玩家各获得 | `{ food: 1 }` |
| `bake-bread` | 烤面包 | `{}` |

### 6. 可访问的游戏状态

- `player.resources.wood/clay/reed/stone/food/grain/vegetable/sheep/boar/cattle`
- `player.familySize` — 家庭成员数
- `player.fields.length` — 田地数
- `player.pastures.length` — 牧场数
- `player.rooms` — 房间数
- `player.houseType` — 房屋类型 `'wood'|'clay'|'stone'`
- `player.minorPlayed` / `player.occupationPlayed` — 已打出卡牌列表
- `state.round` — 当前轮次 (1-14)
- `state.playerCount` — 玩家数

### 7. 沙盒限制

- ❌ 不能使用 `import` / `export` / `require`
- ❌ 不能使用 `class`、`generator`、`with`
- ❌ 不能访问 `eval`、`Function`、`process`、`fetch` 等
- ✅ `registerCardEffect` 和 `registerCardListener` 作为全局函数可直接调用
- ✅ `MinorImprovement` 和 `Occupation` 作为全局构造函数可直接调用

### 8. 示例卡牌索引

1. 无效果纯分数卡 — SimpleHut
2. 回家阶段可选效果 — AleBenches (pay grain → VP)
3. 带修改器的职业 — Carpenter (trade modifier)
4. 收获获得资源 — HarvestHelper
5. 打出即效果 + 条件轮次 — FarmPantry
6. **行动触发（listener）** — ClayDigger (犁地后得黏土)
7. **动态计算** — FamilyFeast (按家庭成员数获得食物)
8. **多选一** — FlexibleWorker (xor 选择)
