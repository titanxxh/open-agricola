# 自定义卡沙盒约束（Custom Card Sandbox Reference）

**唯一真源**。本文件描述 Workshop / AI Designer 提交的自定义卡 TS 代码在 isolated-vm 沙盒里**实际能用什么、不能用什么**。

> **谁该读这个文件**：
> - **AI 系统提示词作者** — `src/services/llmPrompts.ts` 必须与本文件一致
> - **Workshop UI 文案作者** — `src/app/workshop/AiCardDesigner.tsx` / `WorkshopPage.tsx` 文案
> - **设计文档作者** — `docs/CARD_DESIGN_PROMPT.md` / `docs/ENGINE_ARCHITECTURE.md` 提到沙盒的章节
>
> **修改本文件的同时**必须：
> 1. 同步修改 `src/services/llmPrompts.ts` 的 hook / phase / actionId 列表（CI `pnpm run check:prompt-sync` 会兜底）
> 2. 让 `docs/CARD_DESIGN_PROMPT.md` / `docs/ENGINE_ARCHITECTURE.md` 引用本文件而不是各自维护一份

> **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）**不受**本文件约束 —— 直接 import `shared/game/player.ts` 等任意 helper。本文件只覆盖 Workshop 自定义卡。

---

## 1. 沙盒注入的全局是最小集

`server/custom-code-executor/engine.ts`（PR-3 后是 `server/custom-code/isolate-executor.ts`）只往 isolate 注入：

| 全局 | 形态 | 备注 |
|---|---|---|
| `registerCardEffect(effect)` | 函数 | 把 `effect` 收集到 `__capture.effect` |
| `registerCardListener(listener)` | 函数 | 把 `listener` 收集到 `__capture.listeners[]`，自动生成 `registrationId` |
| `MinorImprovement(def)` | 函数 stub | 直接 `return def`，**不是真正的类**。`new MinorImprovement(def)` 也能跑（因为 stub 函数当构造器返回原对象），但语义上等价于"读 `def` 字段" |
| `Occupation(def)` | 函数 stub | 同上 |
| `console.log(...)` / `console.warn(...)` | 函数 | 转发到宿主 `console`，参数会被 `JSON.stringify`（非字符串时） |

**不注入**任何项目内 helper。下面这一组在沙盒里调用会抛 `ReferenceError`：

`familySize`, `workersAvailable`, `workersAtHome`, `getFenceCount`, `getPalisadeCount`, `countFields`, `countOccupations`, `countPeopleOnSpace`, `fieldHasCrop`, `fieldHasGrain`, `fieldHasVegetable`, `cardCountsAs`, `isEffectivelyMajor`, `holdWorkerOnCard`, `releaseWorkerFromCard`, `initCardState`, `incCounter`, `setCounter`, `setFlag`, ...（即 `shared/game/player.ts` / `shared/cards/__stubs__/helpers.ts` / `shared/cards/helpers/*` 里所有导出）。

**替代方案**：直接读 `state` / `player` 字段（见 §4），自己实现等价逻辑。

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

**判定卡主必须用 `context.ownerPlayer`**，不能用 `context.player`。例：

```ts
registerCardListener({
  id: CARD_ID + '-listener',
  cardIds: [CARD_ID],
  actions: ['plow'],
  phases: ['after'],
  scope: 'opponent',
  handler: (context) => {
    if (!context.ownerPlayer.minorPlayed.includes(CARD_ID)) return
    // ... 这里给 context.ownerPlayer 一些好处
  },
})
```

---

## 3. 沙盒识别的 hook / phase 白名单

> **机器可校验段落（CI 会扫）**：本节的两个列表通过下面的标记块与 `shared/cards/card-effects.ts` 的 `cardEffectHooks` 数组、`server/custom-code-executor/engine.ts` 的 `isActionHookPhase` 函数进行同源校验。**不要手动改下面这些标记块的格式**——会让 `pnpm run check:prompt-sync` 失败。

### 3.1 `registerCardEffect` 可用 hook

`extractManifestFromCompiledCode` 用 `cardEffectHooks` 数组过滤注册到 effect 上的函数键。**只有列表中的 key 才会被沙盒注册**，写在 effect 对象上的其它函数键会被静默丢弃。

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
<!-- prompt-sync:end id=card-effect-hooks -->

**沙盒不识别的常见 hook**（写了不会触发 —— `extractManifestFromCompiledCode` 会过滤掉）：

- `computeBonusScore` —— 终局加分钩子，沙盒不支持
- `computePostScore` / `computeSharedPostScore` —— 高级计分钩子
- `computeExtraRoomCapacity` —— 容纳空间扩展
- `onComputeAnimalZones` / `onComputeSowableFields` / `onSowExtraField` —— 动物分区 / 可播种地计算
- `computeLockedFarmTiles` —— 锁定田地
- `computeFenceDiscount` —— 围栏折扣（请改用 `modifiers` 或 listener `computeCosts`）
- `handHooks` —— 手牌钩子

**`computeBonusScore` 的替代方案**：在 `onAfterHarvest`（最后一轮可检查 `state.round === 14`）等阶段串多个 `bonus-vp` leaf 近似实现"游戏结束加分"。

### 3.2 `registerCardListener` 可用 phase

`isActionHookPhase` 在挂载 listener 前把 `phases` 数组里不在白名单的项过滤掉。**写在 `phases` 里的其它字符串会被沙盒静默丢弃**。

<!-- prompt-sync:begin id=action-hook-phases source=server/custom-code-executor/engine.ts:isActionHookPhase -->
- `before`
- `during`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeReplace`
- `isDoable`
<!-- prompt-sync:end id=action-hook-phases -->

**沙盒不识别的常见 phase**：

- `computeChoiceCandidates` —— 计算可选项（如让某个 xor 列表里多/少几张卡）
- `anytime` —— 任意时刻触发

### 3.3 `scope` 取值

`isCardListenerScope` 限制：

<!-- prompt-sync:begin id=listener-scopes source=server/custom-code-executor/engine.ts:isCardListenerScope -->
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

`server/ast-validator.ts`（PR-3 后是 `shared/custom-code/ast-validator.ts`）在编译前用 TypeScript AST 静态拦截以下结构。任何一条命中都会让自定义卡保存失败、给作者错误。

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

---

## 7. `LocalBrowserExecutor` 的语义对齐

§7.2 (spec) 提到 `LocalBrowserExecutor` 在浏览器里跑用户自己的代码（"用户只能攻击自己"），不进 isolate。**注入清单必须与 `ServerIsolateExecutor` 完全一致**：

- 同样只暴露 `registerCardEffect` / `registerCardListener` / `MinorImprovement(def) => def` / `Occupation(def) => def` / 简化 `console`
- 同样对输入做 `JSON.parse(JSON.stringify(...))` 拷贝
- 同样按本文件 §3 的白名单过滤 hook / phase

**理由**：本地沙盒是多人对局的 dry-run；语义不等价就违背"先在本地跑通、再提交多人"的核心定位。如果未来要加 helper，应当从 isolate 一侧加（在 isolate 里跑一段轻量 polyfill），让两端永远对齐。

---

## 8. 同步责任

### 8.1 修改本文件 → 谁会自动同步

- **`src/services/llmPrompts.ts`**：必须人工同步对应段落，CI `pnpm run check:prompt-sync` 会校验 §3.1 / §3.2 / §3.3 / §5.1 / §5.2 这五个 `prompt-sync` 标记块与 `llmPrompts.ts` 字符串、`shared/cards/card-effects.ts` 的 `cardEffectHooks`、`server/custom-code-executor/engine.ts` 的 `isActionHookPhase` / `isCardListenerScope`、`server/ast-validator.ts` 的 `DENIED_IDENTIFIERS` / `DENIED_PROPERTY_ACCESS` 一致。
- **`docs/CARD_DESIGN_PROMPT.md`**：手工同步引用本文件即可（避免重复列表）。
- **`docs/ENGINE_ARCHITECTURE.md`**：手工同步引用本文件即可。
- **`src/app/workshop/AiCardDesigner.tsx`**：手工同步引用本文件即可。

### 8.2 修改 hook / phase / denylist 代码 → 必须更新本文件

- 在 `shared/cards/card-effects.ts` 的 `cardEffectHooks` 数组增删一项 → 改本文件 §3.1 同名 `prompt-sync` 块
- 在 `server/custom-code-executor/engine.ts` 的 `isActionHookPhase` 增删 phase → 改本文件 §3.2
- 在 `server/custom-code-executor/engine.ts` 的 `isCardListenerScope` 增删 scope → 改本文件 §3.3
- 在 `server/ast-validator.ts` 的 `DENIED_IDENTIFIERS` / `DENIED_PROPERTY_ACCESS` 增删项 → 改本文件 §5.1 / §5.2

CI 会拦下漏改的情况。

---

## 9. 历史

| 日期 | 变更 |
|---|---|
| 2026-04-19 | 抽出本文件作为唯一真源；从 `docs/CARD_DESIGN_PROMPT.md` / `docs/superpowers/specs/2026-04-19-architecture-three-layer-split-design.md` §16 内联描述迁出 |
