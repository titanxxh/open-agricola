# 自定义卡沙盒约束（Custom Card Sandbox Reference）

**唯一真源**。本文件描述 Workshop / AI Designer 提交的自定义卡 TS 代码在 isolated-vm 沙盒里**实际能用什么、不能用什么**。

> **谁该读这个文件**：
> - **AI 系统提示词作者** — `client/services/llmPrompts.ts` 必须与本文件一致
> - **Workshop UI 文案作者** — `client/app/workshop/AiCardDesigner.tsx` / `WorkshopPage.tsx` 文案
> - **设计文档作者** — `docs/CARD_DESIGN_PROMPT.md` / `docs/ENGINE_ARCHITECTURE.md` 提到沙盒的章节
>
> **修改本文件的同时**必须：
> 1. 同步修改 `client/services/llmPrompts.ts` 的 hook / phase / actionId 列表（CI `pnpm run check:prompt-sync` 会兜底）
> 2. 让 `docs/CARD_DESIGN_PROMPT.md` / `docs/ENGINE_ARCHITECTURE.md` 引用本文件而不是各自维护一份

> **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）**不受**本文件约束 —— 直接 import `shared/game/player.ts` 等任意 helper。本文件只覆盖 Workshop 自定义卡。

---

## 1. 沙盒注入的全局

`server/custom-code/engine.ts` 往 isolate 注入以下全局：

| 全局 | 形态 | 备注 |
|---|---|---|
| `MinorImprovement(def)` | 函数 stub | 直接 `return def`，`new MinorImprovement(def)` 也能跑 |
| `Occupation(def)` | 函数 stub | 同上 |
| `console.log(...)` / `console.warn(...)` | 函数 | 转发到宿主 `console`，参数会被 `JSON.stringify`（非字符串时） |
| `gainLeaf(cardId, resources)` | 函数 | 返回 `{ type: 'leaf', actionId: 'gain', params: resources, sourceCard: cardId }` |
| `payLeaf({ cardId, cost })` | 函数 | 返回 `{ type: 'leaf', actionId: 'pay-resources', params: cost, sourceCard: cardId }` |
| `spaceHasPlayer(space, playerId)` | 函数 | 判断某个行动位是否已被指定玩家占据 |
| `positionKey(pos)` | 函数 | 将 `{ x, y }` 转为确定性字符串 `"x,y"` |
| `getMajorCardEffect(cardId)` | 函数 stub | 沙盒里始终返回 `null`（无法访问主改良注册表） |
| `getCardStack(player, cardId)` | 函数 | 读取 `player.cardStates[cardId].stack` 的浅拷贝 |
| `readCardExtraData(player, cardId)` | 函数 | 读取 `player.cardStates[cardId].extraData` 的浅拷贝 |

**不再注入** `registerCardEffect` / `registerCardListener`。新契约通过 `CARD_DEF` + `CARD_IMPL` 双常量导出（见 §7）。

**不注入**任何项目内 helper。下面这一组在沙盒里调用会抛 `ReferenceError`：

`familySize`, `workersAvailable`, `workersAtHome`, `getFenceCount`, `getPalisadeCount`, `countFields`, `countOccupations`, `countPeopleOnSpace`, `fieldHasCrop`, `fieldHasGrain`, `fieldHasVegetable`, `cardCountsAs`, `isEffectivelyMajor`, `holdWorkerOnCard`, `releaseWorkerFromCard`, `initCardState`, `incCounter`, `setCounter`, `setFlag`, ...（即 `shared/game/player.ts` / `shared/cards/__stubs__/helpers.ts` / `shared/cards/helpers/*` 里所有导出）。

**替代方案**：使用上述注入的 helper 函数，或直接读 `state` / `player` 字段（见 §4）。

---

## 2. `state` / `player` / `paymentInfo` / `context` 是 JSON 深拷贝快照

isolate 入口对所有输入做：

```js
const jsonSafe = JSON.parse(JSON.stringify(value ?? null))
```

效果：

- **没有方法**：只能读字段。任何 `player.xxx()` 调用必抛 `TypeError`。
- **修改无效**：handler 里改 `state` / `player` 不影响宿主端真状态。要影响游戏必须 `return { flow }` 让引擎执行 ActionFlow。
- **`undefined` 字段会消失**：`JSON.stringify` 会丢掉 `undefined` 值的 key，因此读字段时务必加 `?.` 和 `??` 兜底。
- **循环引用会爆**：宿主端 `JSON.stringify` 失败会抛错。GameState 已确保无循环，但自定义代码不要尝试在 effect 对象里塞回 `state`。

特别注意 `CardListenerContext` 里的玩家字段：

| 字段 | 含义 | `scope: 'player'` | `scope: 'opponent'` | `scope: 'any'` |
|---|---|---|---|---|
| `context.player` | **触发玩家**（执行 action 的人） | = 卡主 | ≠ 卡主 | 不一定 |
| `context.ownerPlayer` | **卡主**（持有这张卡的玩家） | = `player` | = "我" | = 卡主 |
| `context.triggerPlayer` | 同 `context.player`，便于阅读 | — | — | — |
| `context.effectPlayer` | 效果应作用到的玩家（一般 = owner） | — | — | — |

**判定卡主必须用 `context.ownerPlayer`**，不能用 `context.player`。

---

## 3. 沙盒识别的 hook / phase 白名单

> **机器可校验段落（CI 会扫）**：本节的两个列表通过下面的标记块与 `shared/cards/card-effects.ts` 的 `cardEffectHooks` 数组、`server/custom-code/engine.ts` 的 `isActionHookPhase` 函数进行同源校验。**不要手动改下面这些标记块的格式**——会让 `pnpm run check:prompt-sync` 失败。

### 3.1 `CARD_IMPL.effect` 可用 hook

`extractManifestFromCompiledCode` 用 `cardEffectHooks` 数组过滤 `CARD_IMPL.effect` 上的函数键。**只有列表中的 key 才会被沙盒注册**。AST validator 会**硬拒**不在列表中的键——保存直接失败并给出错误信息。

<!-- prompt-sync:begin id=card-effect-hooks source=shared/cards/card-effects.ts:cardEffectHooks -->
- `onBuy`
- `onRoundStart`
- `onHarvest`
- `onRoundEnd`
- `onEndTurn`
- `onReturnHome`
- `onBeforeReturnHome`
- `onStartReturnHome`
- `onAfterRoundEnd`
- `onBeforeHarvest`
- `onStartHarvest`
- `onStartHarvestFieldPhase`
- `onHarvestFieldPhase`
- `onEndHarvestFieldPhase`
- `onAfterReap`
- `onStartHarvestFeedingPhase`
- `onHarvestFeedingPhase`
- `onEndHarvestFeedingPhase`
- `onBeforeFeed`
- `onAfterFeed`
- `onEndHarvest`
- `onAfterHarvest`
- `onBeforeStartOfTurn`
- `onAllWorkersPlaced`
- `resolveChoice`
- `computeBonusScore`
- `computePostScore`
- `computeSharedPostScore`
- `computeExtraRoomCapacity`
- `onComputeAnimalZones`
- `onComputeSowableFields`
- `onSowExtraField`
- `computeLockedFarmTiles`
- `computeFenceDiscount`
<!-- prompt-sync:end id=card-effect-hooks -->

额外允许的 meta 字段（不在 `cardEffectHooks` 数组中，但 AST validator 放行）：`id`、`handHooks`、`scoringPriority`。

**进阶 hook 说明**：

| hook | 签名特殊点 | 用途 |
|---|---|---|
| `computeBonusScore` | 返回 `{ score, label }` 而非 ActionFlow | 终局加分 |
| `computePostScore` / `computeSharedPostScore` | 同上 | 高级计分 |
| `computeExtraRoomCapacity` | 返回 `number` | 额外容纳空间 |
| `onComputeAnimalZones` | 接收 `(zones, state, player)` 或 `(state, player, zones)` | 动物分区扩展（双接口） |
| `onComputeSowableFields` / `onSowExtraField` | 返回额外可播种田/处理播种 | 播种扩展 |
| `computeLockedFarmTiles` | 返回锁定田地位置 | 田地锁定 |
| `computeFenceDiscount` | 返回折扣数 | 围栏折扣 |
| `handHooks`（meta） | `CardEffectHook[]` | 声明哪些 hook 在卡牌还在手牌时也触发 |

### 3.2 `CARD_IMPL.listeners[].phases` 可用 phase

`isActionHookPhase` 在挂载 listener 前把 `phases` 数组里不在白名单的项过滤掉。AST validator 会**硬拒**不在白名单中的 phase——保存直接失败并给出错误信息。

<!-- prompt-sync:begin id=action-hook-phases source=server/custom-code/engine.ts:isActionHookPhase -->
- `before`
- `during`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeReplace`
- `isDoable`
- `anytime`
- `computeChoiceCandidates`
<!-- prompt-sync:end id=action-hook-phases -->

### 3.3 `scope` 取值

`isCardListenerScope` 限制：

<!-- prompt-sync:begin id=listener-scopes source=server/custom-code/engine.ts:isCardListenerScope -->
- `player`
- `opponent`
- `any`
<!-- prompt-sync:end id=listener-scopes -->

不在列表里的 `scope` 会被设为 `undefined`（行为等价于默认 `player`）。

---

## 4. `PlayerState` / `cardStates` 字段口径

下面这些是 prompt / 文档高频踩坑点，已与 `shared/game/types.ts` 校准。

### 4.1 玩家字段

| 字段 | 类型 | 用法 |
|---|---|---|
| `player.workers` | `Worker[]` 即 `{ id, isActive, isNewborn }[]` | **数家庭成员要 `.filter(w => w.isActive).length`**（少数卡如 A127 会把工人置为非活跃） |
| `player.fenceSegments` | `string[]` | **字段名是 `fenceSegments`，不是 `fences`** |
| `player.fields` | `Field[]` | `.length` 得到田地数 |
| `player.pastures` | `Pasture[]` | `.length` 得到牧场数 |
| `player.rooms` | `number` | 房间数 |
| `player.houseType` | `'wood' \| 'clay' \| 'stone'` | 房屋类型 |
| `player.resources` | `Partial<Record<Resource, number>>` | `player.resources.wood ?? 0` |
| `player.minorPlayed` | `string[]` | 已打小发展卡 ID 列表 |
| `player.occupationPlayed` | `string[]` | 已打职业卡 ID 列表 |
| `player.improvements` | `string[]` | 已建主要改良 ID 列表 |
| `player.cardStates` | `Record<string, CardState>` | 见 §4.2 |

### 4.2 `cardStates[id]` 形状

```ts
type CardState = {
  counters?: Partial<Record<Resource, number>>  // store-on-card / take-from-card 写入这里
  flagged?: boolean                              // 一次性触发标记
  infobox?: string                               // 显示在卡面的小标签
  stack?: unknown[]                              // 复杂状态（如 LIFO 队列）
  extraData?: Record<string, unknown>            // 自由扩展字段
}
```

读"卡上存了多少 grain"：

```ts
const stored = player.cardStates?.[CARD_ID]?.counters?.grain ?? 0
```

**不要写**：

```ts
const stored = player.cardStates?.[CARD_ID]?.grain ?? 0  // ❌ 读不到
```

`store-on-card` 写到 `cardStates[id].counters[resource]`；`take-from-card` 从 `cardStates[id].counters[resource]` 扣。

### 4.3 全局状态

| 字段 | 注意 |
|---|---|
| `state.round` | 1–14 |
| `state.players.length` | 玩家数。**没有 `state.playerCount` 字段** |
| `state.actionSpaces` | `ActionSpace[]` |
| `state.actionSpaces[i].takenBy` | `WorkerRef[]`，元素 **`{ playerId, workerId }`**（不是 `playerIndex`） |

---

## 5. AST validator 禁用清单

`shared/custom-code/ast-validator.ts` 在编译前用 TypeScript AST 静态拦截以下结构。任何一条命中都会让自定义卡保存失败、给作者错误。

AST validator 还会检查 `CARD_IMPL.effect` 中的键是否在 `cardEffectHooks` + meta 字段白名单中，以及 `CARD_IMPL.listeners[].phases` 中的值是否在 `actionHookPhases` 白名单中。**不在白名单中的 hook/phase 会导致编译失败**（hard-fail），而非静默丢弃。

### 5.1 禁用标识符（裸引用即报错）

<!-- prompt-sync:begin id=denied-identifiers source=server/ast-validator.ts:DENIED_IDENTIFIERS -->
- `eval`
- `Function`
- `process`
- `require`
- `globalThis`
- `global`
- `window`
- `document`
- `__dirname`
- `__filename`
- `fetch`
- `XMLHttpRequest`
- `WebSocket`
- `setTimeout`
- `setInterval`
- `setImmediate`
- `clearTimeout`
- `clearInterval`
- `Deno`
- `Bun`
- `Proxy`
- `Reflect`
<!-- prompt-sync:end id=denied-identifiers -->

### 5.2 禁用属性访问（包括 `obj.x` 和 `obj['x']`）

<!-- prompt-sync:begin id=denied-property-access source=server/ast-validator.ts:DENIED_PROPERTY_ACCESS -->
- `constructor`
- `__proto__`
- `__defineGetter__`
- `__defineSetter__`
- `__lookupGetter__`
- `__lookupSetter__`
<!-- prompt-sync:end id=denied-property-access -->

### 5.3 禁用语言结构

| 结构 | 说明 |
|---|---|
| `import` 声明 | 静态 import 全禁 |
| 动态 `import(...)` | 同上 |
| `export` 声明 / `export =` | 全禁 |
| `require()` 调用 | 即使没在禁用标识符里也会单独拦 |
| `class` 声明 / `class` 表达式 | 全禁 |
| `with` 语句 | 全禁 |
| Generator 函数（`function*` / 表达式） | 全禁 |

### 5.4 允许的（非穷举提示）

- 普通 `const` / `let` / `function` / 箭头函数
- `for` / `while` / `if` / `switch` / `try/catch`
- 字面量：数字 / 字符串 / 模板字符串（不含禁用标签）/ 数组 / 对象
- `JSON.parse` / `JSON.stringify`（沙盒里 JSON 是有的）
- `Math.*`（沙盒里 Math 是有的）
- `Array.prototype.*` / `Object.keys/values/entries`

---

## 6. `actionId` 行为校准

下面这几个是高频踩坑点。完整 `actionId` 列表见 `shared/actions/effects/*` 目录。

| actionId | 关键约束 |
|---|---|
| `bonus-vp` | **固定 +1 VP，不接受 `amount` / `vp` 参数**。要 N 分就把 N 个 leaf 串入 seq |
| `store-on-card` | params 形如 `{ wood: 1, clay: 2 }`，写入 `player.cardStates[CARD_ID].counters` |
| `take-from-card` | params 形如 `{ grain: 1 }`，从 `player.cardStates[CARD_ID].counters` 扣，扣完 leaf 就 fail |
| `gain` | params 形如 `{ food: 2, wood: 1 }` |
| `pay-resources` | 同上，扣资源 |
| `gain-other-players` | 给其它每位玩家各发资源（不含自己） |
| `bake-bread` | 启动一段烤面包子流程 |
| `push-card-stack` | 向 `player.cardStates[CARD_ID].stack` 推入一项 |
| `write-card-extra-data` | 写入 `player.cardStates[CARD_ID].extraData` |
| `hold-worker-on-card` | 将工人标记为被卡牌持有（不回家） |
| `release-worker-from-card` | 释放被卡牌持有的工人 |

---

## 7. 输出格式：`CARD_DEF` / `CARD_IMPL` 双常量

自定义卡代码**必须**通过两个顶层 `const` 声明输出：

```typescript
const CARD_ID = 'CUSTOM_MyCard'

// 卡牌定义（必须）
const CARD_DEF = new MinorImprovement({
  id: CARD_ID,
  name: '卡牌名',
  deck: 'CUSTOM',
  number: 0,
  desc: ['效果描述'],
  cost: { wood: 1 },
  vp: 0,
  implemented: true,
})

// 卡牌实现（可选，无效果卡可省略）
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => {
      // ...
      return gainLeaf(CARD_ID, { food: 1 })
    },
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (context) => {
        return {
          flow: gainLeaf(CARD_ID, { clay: 1 }),
          sourceCard: CARD_ID,
        }
      },
    },
  ],
}
```

**关键点**：
- 引擎自动处理所有权检查——effect hook 和 listener handler 内**不需要**手动检查 `player.minorPlayed.includes(CARD_ID)` 或 `player.occupationPlayed.includes(CARD_ID)`
- `CARD_IMPL.effect` 的键必须在 §3.1 白名单中
- `CARD_IMPL.listeners[].phases` 的值必须在 §3.2 白名单中
- 不使用 `import` / `export` / `registerCardEffect` / `registerCardListener`

---

## 8. `LocalBrowserExecutor` 的语义对齐

`LocalBrowserExecutor` 在浏览器里跑用户自己的代码（"用户只能攻击自己"），不进 isolate。**注入清单必须与 `ServerIsolateExecutor` 完全一致**：

- 同样暴露 `MinorImprovement(def) => def` / `Occupation(def) => def` / 简化 `console` / 所有 §1 中列出的 helper 函数
- 同样对输入做 `JSON.parse(JSON.stringify(...))` 拷贝
- 同样按本文件 §3 的白名单过滤 hook / phase
- 同样使用 `CARD_DEF` / `CARD_IMPL` 双常量捕获

**理由**：本地沙盒是多人对局的 dry-run；语义不等价就违背"先在本地跑通、再提交多人"的核心定位。

---

## 9. 同步责任

### 9.1 修改本文件 → 谁会自动同步

- **`client/services/llmPrompts.ts`**：必须人工同步对应段落，CI `pnpm run check:prompt-sync` 会校验 §3.1 / §3.2 / §3.3 / §5.1 / §5.2 这五个 `prompt-sync` 标记块与 `llmPrompts.ts` 字符串、`shared/cards/card-effects.ts` 的 `cardEffectHooks`、`server/custom-code/engine.ts` 的 `isActionHookPhase` / `isCardListenerScope`、`shared/custom-code/ast-validator.ts` 的 `DENIED_IDENTIFIERS` / `DENIED_PROPERTY_ACCESS` 一致。
- **`docs/CARD_DESIGN_PROMPT.md`**：手工同步引用本文件即可（避免重复列表）。
- **`docs/ENGINE_ARCHITECTURE.md`**：手工同步引用本文件即可。
- **`client/app/workshop/AiCardDesigner.tsx`**：手工同步引用本文件即可。

### 9.2 修改 hook / phase / denylist 代码 → 必须更新本文件

- 在 `shared/cards/card-effects.ts` 的 `cardEffectHooks` 数组增删一项 → 改本文件 §3.1 同名 `prompt-sync` 块
- 在 `server/custom-code/engine.ts` 的 `isActionHookPhase` 增删 phase → 改本文件 §3.2
- 在 `server/custom-code/engine.ts` 的 `isCardListenerScope` 增删 scope → 改本文件 §3.3
- 在 `shared/custom-code/ast-validator.ts` 的 `DENIED_IDENTIFIERS` / `DENIED_PROPERTY_ACCESS` 增删项 → 改本文件 §5.1 / §5.2

CI 会拦下漏改的情况。

---

## 10. 历史

| 日期 | 变更 |
|---|---|
| 2026-04-22 | 全面重写：`registerCardEffect`/`registerCardListener` → `CARD_DEF`/`CARD_IMPL` 双常量；注入 helper 函数；扩展 hook 白名单至全部 CardEffectField；扩展 phase 白名单增加 `anytime`/`computeChoiceCandidates`；AST validator hard-fail；4 个新 actionId |
| 2026-04-19 | 抽出本文件作为唯一真源；从 `docs/CARD_DESIGN_PROMPT.md` / `docs/superpowers/specs/2026-04-19-architecture-three-layer-split-design.md` §16 内联描述迁出 |
