# Card Design Prompt 文档

> **本文档面向两类受众**：
> - **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）—— 直接 import 任意 helper / hook。权威参考：`docs/ARCHITECTURE.md` + `docs/card_implementation_status.md` + `shared/cards/card-effects.ts`（`CardEffect` 类型 / `cardEffectHooks` 数组）+ `shared/actions/hooks.ts`（`ActionHookPhase`）。
> - **自定义卡 / Workshop 作者**（通过 AI Designer 提交 TS 源码）—— 受 `server/custom-code/engine.ts`（isolated-vm 沙盒）+ `shared/custom-code/ast-validator.ts`（AST 白名单）双重约束。**沙盒可用接口的唯一真源是 [`docs/CUSTOM_CARD_SANDBOX.md`](./CUSTOM_CARD_SANDBOX.md)**——hook / phase / scope / actionId / 禁用标识符的权威清单都在那里，由 `pnpm run check:prompt-sync` 与代码自动比对。本文件下面的"自定义卡沙盒约束"章节是给设计者看的导读，遇到不一致以 SANDBOX.md 为准。LLM 系统提示词以 `client/services/llmPrompts.ts:CARD_DESIGNER_SYSTEM_PROMPT` 为准。
>
> - 工坊提交流程的 PR 文件清单（单 Card Source + 3 个补丁文件 + 可选美术）
>   详见 [`CUSTOM_CARD_SANDBOX.md` §1.1](./CUSTOM_CARD_SANDBOX.md#11-从-workshop-提交到主仓库-pr-的额外规范化)。
>
> 2026-04-19 第二轮同步：
> - 拆分"官方卡可用"与"自定义卡沙盒可用"两套清单——之前的"helper 也作为全局函数注入"陈述对沙盒并不成立。
> - 自定义卡沙盒**不注入** `familySize` / `workersAvailable` / `initCardState` 等任何项目内 helper；`state` / `player` 是 JSON 深拷贝的只读快照。
> - 自定义卡沙盒 effect hook / listener phase 白名单以 `CUSTOM_CARD_SANDBOX.md §3` 为准；本文件只保留设计导读。
> - 同一时机多个 reaction listener / stage hook / extra-turn provider 可用时，系统会用 `trigger-select` 让玩家选择来源卡，设计时不要依赖打出区扫描顺序。
> - `bonus-vp` actionId 固定 +1，不接受 `amount` 参数；要 N 分就把 N 个 leaf 串入 seq。
> - `PlayerState` 字段名是 `fenceSegments`（不是 `fences`）；`store-on-card` 写入 `cardStates[id].counters[resource]`，不是 `cardStates[id][resource]`。
>
> 历史：action ID 已修正为 `renovate-house`（非 `renovation`）、`fence`（非 `fencing`）、`wish-children`（非 `family-growth`）；新增 `scope`、`context.choice`/`result`/`space`、`store-on-card`/`take-from-card` 等机制。

## 设计原则

1. **不使用 import/export** — 自定义卡沙盒禁止 import；LLM 输出 `CARD_DEF` + `CARD_IMPL` 双常量。**注意**：项目内 helper（`familySize` 等）**不**注入沙盒，只在官方卡 / 测试 / 直接 import 时可用。
2. **两套扩展机制** — `CARD_IMPL.effect`（阶段触发）和 `CARD_IMPL.listeners`（行动触发），覆盖大多数卡牌效果。
3. **动态计算支持** — hook 函数内可读 GameState / PlayerState 字段（沙盒里是 JSON 深拷贝快照，只读字段、无方法）。
4. **反应顺序由玩家选择** — 多张卡同一时机触发时，返回可重放 ActionFlow，让 `trigger-select` 执行来源卡选择；不要把规则写成依赖卡牌扫描顺序。

## Prompt 结构

### 1. 输出格式

TypeScript 代码块，**不使用 import/export**。`CARD_DEF` 只接受下面的对象格式，不兼容 `new MinorImprovement(...)` / `new Occupation(...)`。LLM prompt 的 hook、phase、scope、actionId 四张 schema 表由 `client/services/llmPrompts.ts` 从真相源常量自动生成；完整白名单仍以 `CUSTOM_CARD_SANDBOX.md` 为准。

```typescript
const CARD_ID = 'CUSTOM_英文驼峰名'

const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'English Card Name',
    deck: 'CUSTOM',
    number: 0,
    desc: ['English effect description.'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: { name: '中文卡名', desc: ['中文效果描述。'] },
    },
  },
}

const CARD_IMPL = {
  effect: { id: CARD_ID, onBuy: () => gainLeaf(CARD_ID, { food: 1 }) },
  listeners: [],
}
```

### 2. 可用机制清单

| 机制 | 实现方式 | 说明 |
|------|----------|------|
| 阶段触发 | `CARD_IMPL.effect` + `onReturnHome` 等 | 回家/收获/轮次触发 |
| 行动触发 | `CARD_IMPL.listeners` + `actions` + `phases` | 每次犁地/建造/收集等触发 |
| 简单行动费用折扣 | listener `computeCosts` 返回 `costs` | 仅用于 `construct` 等简单行动费用 |
| 跨所有改良候选的资源折扣 | listener `computeCosts` 返回 `bonuses: [{ discount, capDiscountAtCost: true, optional: false, sources: [CARD_ID] }]` | mandatory capped bonus 保留候选和归还卡要求 |
| 替代支付 | listener `computeCosts` 返回 `paymentResourceProviders` | 只影响支付选项，不直接改玩家资源 |
| 动态计算 | hook 内读 `player` / `state` 字段（如家庭成员数 = `player.workers.filter(w=>w.isActive).length`） | 根据游戏状态计算 |
| 替换行动 | listener + `computeReplace` + `decline: true` | 把某行动替换为其他效果 |
| 启用行动 | listener + `isDoable` + `doable: true` | 让不可用的行动变可用 |
| 资源转换 | listener `computeCosts` 返回 `trades` / `bonuses` | 支付替换或折扣选项 |
| 多选一 | ActionFlow `type: 'xor'` | 玩家选择分支 |
| 额外行动 provider | `CARD_IMPL.effect.contributeExtraTurn` | 普通工人耗尽后贡献一次额外行动机会；多个 provider 先让玩家选择来源卡 |

### 3. CARD_IMPL.effect 可用 hook

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
| `onStartHarvestFeedingPhase` / `onHarvestFeedingPhase` / `onEndHarvestFeedingPhase` | 喂食子阶段 | 每收获 |
| `onBeforeEndGame` | 终局计分前，按 target player step 触发 | 每局一次 |
| `contributeExtraTurn` | 普通工人耗尽后贡献 extra-turn provider | 每次轮转检查 |

`onBeforePlayerTurn` 是 non-flow skip-control exception，只能同步返回 `{ skipTurn?: true } | void`，用于 labor turn 入口跳过本次放工人机会；不能返回 `ActionFlow` 或产生 pending。

harvest field 三个 stage hook、`onBeforeEndGame` 和 action reaction listener 同一时机有多个来源时默认进入 `trigger-select`；`contributeExtraTurn` 多 provider 时先选择来源卡，再展开该 provider 的 flow。

**进阶 hook**（官方卡可直接 import 使用；自定义卡是否可用以 `CUSTOM_CARD_SANDBOX.md §3.1` 白名单为准）：

| hook | 触发时机 |
|------|----------|
| `computeBonusScore` | 终局加分 |
| `computeCostedBonus` / `computeSharedPostScore` | 终局花资源换 VP（costed）/ 跨玩家分调（shared） |
| `computeExtraRoomCapacity` | 房间容量修改 |
| `onComputeAnimalZones` | 动物分区计算 |
| `onComputeSowableFields` | 额外可播种田候选（仅官方卡；Workshop 无法执行配套结算） |
| `onSowExtraField` | 结算额外播种（仅官方卡；Workshop 的 JSON 快照无法回传 mutation） |
| `computeLockedFarmTiles` | 动态锁定农场格（B38 FutureBuildingSite） |
| `handHooks` | 声明哪些 stage hook 在卡牌还在手牌时也触发（E96 Elder；不支持 `onBuy` / `onEndTurn` / `onBeforeEndGame` / `onBeforePlayerTurn`） |

`CARD_IMPL.effect` 必须直接写对象字面量，禁止变量引用、spread、computed key 和 accessor。

> 围栏支付折扣（E16 BriarHedge / C16 FieldFences）现走 listener `computeCosts` phase（actions: `['fence']`），不再是独立 hook。详见 ARCHITECTURE.md §15.7。
>
> C1 Overhaul rebuild 只处理 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy`。

### 4. CARD_IMPL.listeners 结构

```typescript
const CARD_IMPL = {
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['plow'],
    phases: ['after'],
    handler: (context) => {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    },
  }],
}
```

**可用 phases**：

- 官方卡以 `shared/actions/hooks.ts` 的 `ActionHookPhase` 为准，额外包含内部 `computeExchanges`。
- 自定义卡沙盒以 `shared/custom-code/sandbox-listener-phases.ts` 的 `sandboxListenerPhases` 为准：`before` / `during` / `immediatelyAfter` / `after` / `computeCosts` / `computeArgs` / `computeChoiceCandidates` / `computeReplace` / `isDoable` / `anytime`。

**可用 scope**以 `shared/custom-code/sandbox-listener-scopes.ts` 的 `sandboxListenerScopes` 为准：`player` / `opponent` / `any`。

**可用 actions**以 `shared/custom-code/sandbox-listener-actions.ts` 的 `sandboxListenerActions` 为准；主要或次要改良购买统一监听 `improvement`。未知 action 会被 AST validator 拒绝。

### 5. 可用 actionId（最常用项）

| actionId | 说明 | params 示例 |
|----------|------|--------|
| `gain` | 获得资源 | `{ food: 2, wood: 1 }` |
| `pay` | 支付资源 | `{ grain: 1 }` |
| `bonus-vp` | +1 VP（**固定 +1**，不接受 `amount`；要 N 分把 N 个 leaf 串入 seq） | `{}` |
| `bake-bread` | 烤面包 | `{}` |
| `store-on-card` | 在卡上存放资源（写入 `cardStates[id].counters[resource]`） | `{ grain: 6 }` |
| `take-from-card` | 从卡上取出资源（从 `counters` 扣除） | `{ grain: 1 }` |
| `push-to-card-stack` | 向本卡 stack 推入一项 | `{ item: 'wood' }` |
| `special-effect` | cardStates mutation 统一入口 | `{ kind: 'set-flag', flag: true }` |
| `future-meeples` | 预放资源到未来回合 | `{ __futureMeepleRequest: { ... } }` |

### 6. 可访问的游戏状态

> **关键区分**：以下"helper 函数"小节默认**只对官方卡有效**（直接 import 使用）。自定义卡 / Workshop 沙盒**不注入**任何项目内 helper —— 见 §7。

#### 6.1 PlayerState 字段（直接读 `player.xxx`）

- `player.resources.{wood,clay,reed,stone,food,grain,vegetable,sheep,boar,cattle}`
- `player.fields[]` / `pastures[]` / `stableTiles[]` / `roomTiles[]`
- `player.rooms` — 房间数
- `player.houseType` — `'wood' | 'clay' | 'stone'`
- `player.minorPlayed[]` / `player.occupationPlayed[]` / `player.improvements[]` — 已打出卡牌
- `player.workers[]` — Worker 身份模型，每个槽 `{ id, isActive, isNewborn }`；家庭成员数 = `workers.filter(w => w.isActive).length`
- `player.fenceSegments[]` — `FenceSegment[]`（注意字段名是 `fenceSegments`，**不是** `fences`；普通 fence 总数可用 `getFenceCount(player)`，palisade 用 `getPalisadeCount(player)`，own ordinary / supply 相关必须用 own-only helper 或按 `FenceSegment.type/source` 过滤；fencing 差异走 `fencePolicy`）
- `player.cardStates[CARD_ID]` — 卡牌局部状态 `{ counters?, flagged?, infobox?, stack?, extraData? }`
- `player.extraOccupationsFromCards` — 卡牌提供的虚拟职业数
- `state.round` — 当前轮次 (1-14)
- `state.players.length` — 玩家数（**没有 `state.playerCount` 字段**）
- `state.actionSpaces[*].takenBy` — `WorkerRef[]`，元素 `{ playerId, workerId }`
- `state.availableMajorImprovements[]`

#### 6.2 官方卡可用的 helper 函数（`shared/domain/player.ts` 等导出）

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

#### 7.1 AST 禁用清单（`shared/custom-code/ast-validator.ts`）

`import` / `export` / 动态 import / `require` / `class` 声明 / `generator` / `with` / `eval` / `Function` / `process` / `globalThis` / `global` / `window` / `document` / `__dirname` / `__filename` / `fetch` / `XMLHttpRequest` / `WebSocket` / `setTimeout` / `setInterval` / `setImmediate` / `clearTimeout` / `clearInterval` / `Deno` / `Bun` / `Proxy` / `Reflect`，以及 `.constructor` / `.__proto__` / `.__defineGetter__` 等原型链字段访问。

#### 7.2 沙盒注入的全局（`server/custom-code/engine.ts`）

仅有：`MinorImprovement` / `Occupation` stub、最小化的 `console.log` / `console.warn`、`gainLeaf`、`payLeaf`、`spaceHasPlayer`、`positionKey`、`getCardStack`、`readCardExtraData`、`getCardDefinition` stub。**没有**任何项目 helper（`familySize` / `workersAvailable` / `initCardState` / `getFenceCount` / `cardCountsAs` 等都拿不到，会抛 ReferenceError）。

`state` / `player` / `paymentInfo` / `context` 等输入都是 `JSON.parse(JSON.stringify(...))` 后的**纯数据快照**，没有方法。

#### 7.3 沙盒识别的 effect hook（`cardEffectHooks` 白名单交集）

完整列表见 `CUSTOM_CARD_SANDBOX.md §3.1`，并由 `pnpm run check:prompt-sync` 和代码白名单同步。`onBeforePlayerTurn` 是 non-flow skip-control，只返回 `{ skipTurn?: true } | void`。`contributeExtraTurn` 返回本卡 provider flow；多个 provider 同时可用时先进入 provider 来源卡选择。围栏折扣使用 listener `computeCosts` phase（actions: `['fence']`）。

#### 7.4 沙盒识别的 listener phase（`sandboxListenerPhases` 白名单）

`before` / `during` / `immediatelyAfter` / `after` / `computeCosts` / `computeArgs` / `computeChoiceCandidates` / `computeReplace` / `isDoable` / `anytime`。

#### 7.5 沙盒识别的 listener scope（`sandboxListenerScopes` 白名单）

`player` / `opponent` / `any`。

#### 7.6 actionId 注意

- `bonus-vp` 固定 +1，不接受 `amount` 参数；要 N 分就把 N 个 leaf 串入 seq。
- `store-on-card` / `take-from-card` 操作的是 `player.cardStates[CARD_ID].counters[resource]`，读取时也要走 `counters`。

#### 7.7 listener context 的 player 语义

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
