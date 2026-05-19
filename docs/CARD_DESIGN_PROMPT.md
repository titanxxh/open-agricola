# Card Design Prompt 文档

> **本文档面向两类受众**：
> - **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）—— 直接 import 任意 helper / hook。权威参考：`docs/ARCHITECTURE.md` + `docs/card_implementation_status.md` + `shared/cards/card-effects.ts`（`CardEffect` 类型 / `cardEffectHooks` 数组）+ `shared/actions/hooks.ts`（`ActionHookPhase`）。
> - **自定义卡 / Workshop 作者**（通过 AI Designer 提交 TS 源码）—— 受 `server/custom-code-executor/engine.ts`（isolated-vm 沙盒）+ `server/ast-validator.ts`（AST 白名单）双重约束。**沙盒可用接口的唯一真源是 [`docs/CUSTOM_CARD_SANDBOX.md`](./CUSTOM_CARD_SANDBOX.md)**——hook / phase / scope / actionId / 禁用标识符的权威清单都在那里，由 `pnpm run check:prompt-sync` 与代码自动比对。本文件下面的"自定义卡沙盒约束"章节是给设计者看的导读，遇到不一致以 SANDBOX.md 为准。LLM 系统提示词以 `client/services/llmPrompts.ts:CARD_DESIGNER_SYSTEM_PROMPT` 为准。
>
> - 工坊提交流程的 PR 文件清单（display + impl 双文件 + 4 个补丁文件）
>   详见 [`CUSTOM_CARD_SANDBOX.md` §1.1](./CUSTOM_CARD_SANDBOX.md#11-从-workshop-提交到主仓库-pr-的额外规范化)。
>
> 2026-04-19 第二轮同步：
> - 拆分"官方卡可用"与"自定义卡沙盒可用"两套清单——之前的"helper 也作为全局函数注入"陈述对沙盒并不成立。
> - 自定义卡沙盒**不注入** `familySize` / `workersAvailable` / `initCardState` 等任何项目内 helper；`state` / `player` 是 JSON 深拷贝的只读快照。
> - 自定义卡沙盒**不识别** `computeBonusScore` / `computeCostedBonus` / `computeSharedPostScore` / `computeExtraRoomCapacity` / `onComputeAnimalZones` / `onComputeSowableFields` / `computeLockedFarmTiles` / `handHooks` 等扩展 hook（`extractManifestFromCompiledCode` 用 `cardEffectHooks` 白名单过滤）。围栏折扣已迁到 `computeCosts` listener phase（参见 ARCHITECTURE.md §15.7），通过 `registerCardListener` 即可生效。
> - 自定义卡沙盒**不识别** `computeChoiceCandidates` / `anytime` 这两个 listener phase（`isActionHookPhase` 限制）。
> - `bonus-vp` actionId 固定 +1，不接受 `amount` 参数；要 N 分就把 N 个 leaf 串入 seq。
> - `PlayerState` 字段名是 `fenceSegments`（不是 `fences`）；`store-on-card` 写入 `cardStates[id].counters[resource]`，不是 `cardStates[id][resource]`。
>
> 历史：action ID 已修正为 `renovate-house`（非 `renovation`）、`fence`（非 `fencing`）、`wish-children`（非 `family-growth`）；新增 `scope`、`context.choice`/`result`/`space`、`store-on-card`/`take-from-card` 等机制。

## 设计原则

1. **不使用 import/export** — 自定义卡沙盒禁止 import；`registerCardEffect`、`registerCardListener`、`MinorImprovement`、`Occupation` 作为全局注入。**注意**：项目内 helper（`familySize` 等）**不**注入沙盒，只在官方卡 / 测试 / 直接 import 时可用。
2. **两套扩展机制** — `registerCardEffect`（阶段触发）和 `registerCardListener`（行动触发），覆盖大多数卡牌效果。
3. **动态计算支持** — hook 函数内可读 GameState / PlayerState 字段（沙盒里是 JSON 深拷贝快照，只读字段、无方法）。

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
| 动态计算 | hook 内读 `player` / `state` 字段（如家庭成员数 = `player.workers.filter(w=>w.isActive).length`） | 根据游戏状态计算 |
| 替换行动 | listener + `computeReplace` + `decline: true` | 把某行动替换为其他效果 |
| 启用行动 | listener + `isDoable` + `doable: true` | 让不可用的行动变可用 |
| 资源转换 | `modifiers: [{ type: 'trade', ... }]` | 静态资源替换 |
| 多选一 | ActionFlow `type: 'xor'` | 玩家选择分支 |

### 3. registerCardEffect 可用 hook

> 实际清单以 `shared/cards/card-effects.ts` 中 `CardEffect` 类型为准。下表覆盖目前最常用项。

| hook | 触发时机 | 频率 |
|------|----------|------|
| `onBuy` | 打出此卡时（含支付上下文） | 一次 |
| `onRoundStart` | 每轮开始 | 每轮 |
| `onBeforeStartOfTurn` | 玩家"轮到自己"之前（含 stage flow） | 每轮每人 |
| `onAllWorkersPlaced` | **本轮所有玩家工人都用完后、`performRoundEnd` 之前**（stage flow，可激活 supply worker；E125 DelayedWayfarer 消费） | 每轮 |
| `onEndTurn` | 单次 person-action 结束收束点 | 每次行动后 |
| `onReturnHome` / `onBeforeReturnHome` / `onStartReturnHome` | 工人回家阶段 | 每轮 |
| `onRoundEnd` / `onAfterRoundEnd` | 每轮结束 | 每轮 |
| `onBeforeHarvest` / `onStartHarvest` / `onHarvest` / `onEndHarvest` / `onAfterHarvest` | 收获前/中/后 | 每 4-5 轮 |
| `onStartHarvestFieldPhase` / `onHarvestFieldPhase` / `onEndHarvestFieldPhase` / `onAfterReap` | 收割田地子阶段 | 每收获 |
| `onStartHarvestFeedingPhase` / `onHarvestFeedingPhase` / `onEndHarvestFeedingPhase` / `onBeforeFeed` / `onAfterFeed` | 喂食子阶段 | 每收获 |

**以下 hook 仅对官方卡（直接 import 注册）有效；自定义卡沙盒会过滤掉，写了不会触发**（详见 §7.3）：

| hook | 触发时机 |
|------|----------|
| `computeBonusScore` | 终局加分 |
| `computeCostedBonus` / `computeSharedPostScore` | 终局花资源换 VP（costed）/ 跨玩家分调（shared） |
| `computeExtraRoomCapacity` | 房间容量修改 |
| `onComputeAnimalZones` | 动物分区计算 |
| `onComputeSowableFields` / `onSowExtraField` | 额外可播种田 |
| `computeLockedFarmTiles` | 动态锁定农场格（B38 FutureBuildingSite） |
| `handHooks` | 声明哪些 hook 在卡牌还在手牌时也触发（E96 Elder） |

> 围栏支付折扣（E16 BriarHedge / C16 FieldFences / C1 Overhaul）现走 listener `computeCosts` phase（actions: `['fence']`），不再是独立 hook。详见 ARCHITECTURE.md §15.7。

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

**可用 phases**（`shared/actions/hooks.ts` 中 `ActionHookPhase`，权威）：

- 官方卡：`before` / `during` / `immediatelyAfter` / `after` / `computeCosts` / `computeArgs` / `computeChoiceCandidates` / `computeReplace` / `isDoable` / `anytime`
- 自定义卡沙盒：仅 `before` / `during` / `immediatelyAfter` / `after` / `computeCosts` / `computeArgs` / `computeReplace` / `isDoable`（`computeChoiceCandidates` / `anytime` 会被沙盒过滤，详见 §7.4）

**可用 actions**（常用项；完整集见 `shared/actions/index.ts`）: `collect`, `gain`, `receive`, `construct`, `renovate-house`, `fence`, `stables`, `plow`, `sow`, `play-occupation`, `improvement-any`, `minor-improvement`, `place-farmer`, `wish-children`, `bake-bread`, `reap`（合成 action，由 `dispatchReapListener` 派发，B132 EstateMaster 等用）

### 5. 可用 actionId（最常用项）

| actionId | 说明 | params 示例 |
|----------|------|--------|
| `gain` | 获得资源 | `{ food: 2, wood: 1 }` |
| `pay-resources` | 支付资源 | `{ grain: 1 }` |
| `bonus-vp` | +1 VP（**固定 +1**，不接受 `amount`；要 N 分把 N 个 leaf 串入 seq） | `{}` |
| `gain-other-players` | 其他玩家各获得 | `{ food: 1 }` |
| `bake-bread` | 烤面包 | `{}` |
| `store-on-card` | 在卡上存放资源（写入 `cardStates[id].counters[resource]`） | `{ grain: 6 }` |
| `take-from-card` | 从卡上取出资源（从 `counters` 扣除） | `{ grain: 1 }` |
| `reap` | 收割合成 action（由 `dispatchReapListener` 派发，B132 等订阅；官方卡使用） | `{ crop, amount }` |

### 6. 可访问的游戏状态

> **关键区分**：以下"helper 函数"小节默认**只对官方卡有效**（直接 import 使用）。自定义卡 / Workshop 沙盒**不注入**任何项目内 helper —— 见 §7。

#### 6.1 PlayerState 字段（直接读 `player.xxx`）

- `player.resources.{wood,clay,reed,stone,food,grain,vegetable,sheep,boar,cattle}`
- `player.fields[]` / `pastures[]` / `stableTiles[]` / `roomTiles[]`
- `player.rooms` — 房间数
- `player.houseType` — `'wood' | 'clay' | 'stone'`
- `player.minorPlayed[]` / `player.occupationPlayed[]` / `player.improvements[]` — 已打出卡牌
- `player.workers[]` — Worker 身份模型，每个槽 `{ id, isActive, isNewborn }`；家庭成员数 = `workers.filter(w => w.isActive).length`
- `player.fenceSegments[]` — `FenceSegment[]`（注意字段名是 `fenceSegments`，**不是** `fences`；用 `getFenceCount(player)` 取数更安全）
- `player.cardStates[CARD_ID]` — 卡牌局部状态 `{ counters?, flagged?, infobox?, stack?, extraData? }`
- `player.extraOccupationsFromCards` — 卡牌提供的虚拟职业数
- `state.round` — 当前轮次 (1-14)
- `state.players.length` — 玩家数（**没有 `state.playerCount` 字段**）
- `state.actionSpaces[*].takenBy` — `WorkerRef[]`，元素 `{ playerId, workerId }`
- `state.availableMajorImprovements[]`

#### 6.2 官方卡可用的 helper 函数（`shared/game/player.ts` 等导出）

- `familySize(player)` / `workersAvailable(state, player)` / `workersAtHome(state, player)`
- `getFenceCount(player)` / `getPalisadeCount(player)`
- `countFields(player)` / `countOccupations(player)`（聚合自有 + 虚拟身份）
- `countPeopleOnSpace(state, spaceId)`
- `fieldHasCrop(field, kind)` / `fieldTopStack(field)` / `fieldIsEmpty(field)` / `countFieldsWithCrop(player, kind)`（Field.stacks 多堆模型）
- `cardCountsAs(cardId, asType)` / `collectCardsAs(player, asType)`（dual-type 卡，例如 D60 LargePottery 同时算 minor + major）
- `isEffectivelyMajor(cardId)`（D161 等"本质是 major 的 minor"判定）
- `holdWorkerOnCard(player, cardId, workerId)` / `releaseWorkerFromCard(player, cardId)` / `getCardHeldWorkerIds(player)`（card-held workers，C22 BasketChair）
- `initCardState(player, cardId)` / `incCounter(player, cardId, key, delta?)` —— 操作 `cardStates.counters` 的便捷写法

> 自定义卡沙盒里上述 helper **均不可用**，需要直接读字段或在沙盒内自行写等价逻辑。

### 7. 自定义卡沙盒约束（Workshop / AI Designer）

自定义卡的 TS 源码经 `validateAndCompileCustomCode`（AST 白名单）→ `compileCardCode` → `extractManifestFromCompiledCode`（hook 白名单提取）→ 入库为 `compiled_code` + `code_manifest` → 由 `registerExecutorBackedCustomCard` 在 isolated-vm 中 per-call 调用。受到以下硬性约束：

#### 7.1 AST 禁用清单（`server/ast-validator.ts`）

`import` / `export` / 动态 import / `require` / `class` 声明 / `generator` / `with` / `eval` / `Function` / `process` / `globalThis` / `global` / `window` / `document` / `__dirname` / `__filename` / `fetch` / `XMLHttpRequest` / `WebSocket` / `setTimeout` / `setInterval` / `setImmediate` / `clearTimeout` / `clearInterval` / `Deno` / `Bun` / `Proxy` / `Reflect`，以及 `.constructor` / `.__proto__` / `.__defineGetter__` 等原型链字段访问。

#### 7.2 沙盒注入的全局（`server/custom-code-executor/engine.ts`）

仅有：`registerCardEffect`、`registerCardListener`、`MinorImprovement`（stub，原样返回 def）、`Occupation`（stub）、最小化的 `console.log` / `console.warn`。**没有**任何项目 helper（`familySize` / `workersAvailable` / `initCardState` / `getFenceCount` / `cardCountsAs` 等都拿不到，会抛 ReferenceError）。

`state` / `player` / `paymentInfo` / `context` 等输入都是 `JSON.parse(JSON.stringify(...))` 后的**纯数据快照**，没有方法。

#### 7.3 沙盒识别的 effect hook（`cardEffectHooks` 白名单交集）

`onBuy` / `onBeforeStartOfTurn` / `onRoundStart` / `onAllWorkersPlaced` / `onEndTurn` / `onBeforeReturnHome` / `onStartReturnHome` / `onReturnHome` / `onRoundEnd` / `onAfterRoundEnd` / `onBeforeHarvest` / `onStartHarvest` / `onStartHarvestFieldPhase` / `onHarvestFieldPhase` / `onEndHarvestFieldPhase` / `onAfterReap` / `onStartHarvestFeedingPhase` / `onHarvestFeedingPhase` / `onEndHarvestFeedingPhase` / `onBeforeFeed` / `onAfterFeed` / `onHarvest` / `onEndHarvest` / `onAfterHarvest`。

**沙盒不识别**（写了也不会触发）：`computeBonusScore` / `computeCostedBonus` / `computeSharedPostScore` / `computeExtraRoomCapacity` / `onComputeAnimalZones` / `onComputeSowableFields` / `onSowExtraField` / `computeLockedFarmTiles` / `handHooks`。终局加分请改成在 `onAfterHarvest`（最后一轮）等阶段串多个 `bonus-vp` leaf 近似实现。围栏折扣改用 listener `computeCosts` phase（actions: `['fence']`）。

#### 7.4 沙盒识别的 listener phase（`isActionHookPhase` 白名单）

`before` / `during` / `immediatelyAfter` / `after` / `computeCosts` / `computeArgs` / `computeReplace` / `isDoable`。

**沙盒不识别**：`computeChoiceCandidates` / `anytime`。

#### 7.5 actionId 注意

- `bonus-vp` 固定 +1，不接受 `amount` 参数；要 N 分就把 N 个 leaf 串入 seq。
- `store-on-card` / `take-from-card` 操作的是 `player.cardStates[CARD_ID].counters[resource]`，读取时也要走 `counters`。

#### 7.6 listener context 的 player 语义

`scope: 'opponent'` / `scope: 'any'` 的 listener 里，`context.player` 是**触发该行动的玩家**（对手），不是卡主。判定卡主必须用 `context.ownerPlayer`。`scope: 'player'`（默认）时两者相同。

### 8. 示例卡牌索引

1. 无效果纯分数卡 — SimpleHut
2. 回家阶段可选效果 — AleBenches (pay grain → VP)
3. 带修改器的职业 — Carpenter (trade modifier)
4. 收获获得资源 — HarvestHelper
5. 打出即效果 + 条件轮次 — FarmPantry
6. **行动触发（listener）** — ClayDigger (犁地后得黏土)
7. **动态计算** — FamilyFeast (按家庭成员数获得食物)
8. **多选一** — FlexibleWorker (xor 选择)
