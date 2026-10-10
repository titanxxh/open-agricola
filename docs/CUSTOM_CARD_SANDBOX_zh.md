# 自定义卡沙盒约束（Custom Card Sandbox Reference）

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

> 本文是 [`CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md) 的中文镜像；英文版是 prompt 同步与沙盒校验的规范文档。

以下为英文规范文档的中文翻译，描述 Workshop / AI Designer 提交的自定义卡 TS 代码在 isolated-vm 沙盒里**实际能用什么、不能用什么**。

> **谁该读这个文件**：
>
> - **AI 系统提示词作者** — `client/services/llm/generation/prompt.ts` 包含 `server/workshop-sandbox-contract.ts` 返回的已部署工坊能力契约；hook / phase / scope / actionId、helper 和运行语义来自实际运行的后端及 shared 描述元数据，样例由浏览器按需从 GitHub 读取
> - **Workshop UI 文案作者** — `client/app/workshop/AiCardDesigner.tsx` / `WorkshopPage.tsx` 文案
> - **设计文档作者** — `docs/ARCHITECTURE.md` 提到沙盒的章节
> - **LLM 自动化测试维护者** — `docs/test/llm-card-gen.md` 描述了用真 LLM 验证工坊能力契约的 fixture 套件
>
> **修改本文件的同时**必须：
>
> 1. 本文件是 hook / phase / scope / actionId 的**人读镜像**：名字白名单由源码常量拥有（`cardEffectHooks` / `sandboxListenerPhases` / `sandboxListenerScopes` / `SANDBOX_ALLOWED_ACTION_IDS`），描述由穷尽 map 拥有；已部署的工坊能力契约在运行时派生这些内容，由浏览器放入生成 prompt，**不再手工同步 prompt 表格**。CI `pnpm run check:prompt-sync` 只校验本文件的 `prompt-sync` 块与源码名字一致。
> 2. 让 `docs/ARCHITECTURE.md` 引用本文件而不是另行维护一份
> 3. 支付语义、hook 参数/返回值和 helper 数据形状不是名字同步能覆盖的；同步更新 executor / prompt contract 测试，并按 `docs/test/llm-card-gen.md` 跑固定浏览器验收批次；历史 golden 回放保留为独立回归检查

> **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）**不受**本文件约束 —— 直接 import `shared/domain/player.ts` 等任意 helper。本文件只覆盖 Workshop 自定义卡。

---

## 1. 沙盒注入的全局

服务端 isolate 注入以下全局：hook 和 listener 调用在 `server/custom-code/isolate-runner.ts`，manifest 提取在 `server/custom-code/engine.ts`：

<!-- prompt-sync:begin id=sandbox-injections -->

| 全局                                       | 形态      | 备注                                                                                 |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `MinorImprovement(def)`                  | 函数 stub | 直接 `return def`，`new MinorImprovement(def)` 也能跑                                    |
| `Occupation(def)`                        | 函数 stub | 同上                                                                                 |
| `console.log(...)` / `console.warn(...)` | 函数      | 转发到宿主 `console`，参数会被 `JSON.stringify`（非字符串时）                                       |
| `gainLeaf(cardId, resources)`            | 函数      | 返回 `{ type: 'leaf', actionId: 'gain', params: resources, sourceCard: cardId }`     |
| `payLeaf({ cardId, cost })`              | 函数      | 返回 `{ type: 'leaf', actionId: 'pay', params: cost, sourceCard: cardId }`           |
| `spaceHasPlayer(space, playerId)`        | 函数      | 判断某个行动位是否已被指定玩家占据                                                                  |
| `positionKey(pos)`                       | 函数      | 将 `{ row, col }` 转为确定性字符串 `"row-col"`                                              |
| `getCardDefinition(cardId)`              | 函数 stub | 沙盒里始终返回 `null`（无法访问卡牌注册表）                                                          |
| `getCardStack(player, cardId)`           | 函数      | 读取 `player.cardStates[cardId].stack` 的浅拷贝                                          |
| `readCardExtraData(player, cardId)`      | 函数      | 读取 `player.cardStates[cardId].extraData` 的浅拷贝                                      |

<!-- prompt-sync:end id=sandbox-injections -->


**不再注入** `registerCardEffect` / `registerCardListener`。新契约通过 `CARD_DEF` + `CARD_IMPL` 双常量导出（见 §7）。

**不注入**任何项目内 helper。下面这一组在沙盒里调用会抛 `ReferenceError`：

`familySize`, `workersAvailable`, `workersAtHome`, `getFenceCount`, `getPalisadeCount`, `countFields`, `countOccupations`, `countPeopleOnSpace`, `fieldHasCrop`, `fieldHasGrain`, `fieldHasVegetable`, `cardCountsAs`, `isEffectivelyMajor`, `holdWorkerOnCard`, `releaseWorkerFromCard`, `initCardState`, `incCounter`, `setCounter`, `setFlag`, ...（即 `shared/domain/player.ts` / `shared/cards/__stubs__/helpers.ts` / `shared/cards/helpers/`* 里所有导出）。

**替代方案**：使用上述注入的 helper 函数，或直接读 `state` / `player` 字段（见 §4）。

---

## 1.1 从 Workshop 提交到主仓库 PR 的额外规范化

沙盒里的代码目标是"能在工坊保存、预览、沙盒游戏中运行"；提交到主仓库后会变成 `shared/cards/community/*.ts` 的正式 TypeScript 模块，并参加完整 CI。因此 Workshop → PR 生成器会在 `server/workshop-pr/code-gen.ts` 做一层保守规范化：


| Workshop 代码形态                     | PR 生成结果                                                                 | 原因                                                              |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `deck: 'CUSTOM'`                  | `deck: 'community'`                                                     | community deck 检查要求所有社区牌属于 `community` deck                     |
| `const CARD_IMPL = { ... }`       | `const CARD_IMPL: CardImpl = { ... }`                                   | 给 listener/action/phase 提供上下文类型，避免字面量数组变成 `string[]`            |
| `listeners: [{ ... }]` 缺 `id`     | 自动补 `{cardId}-listener-{n}`                                             | listener 排序和注册要求稳定 id                                           |
| `prerequisite: { occupation: 2 }` | `prerequisite: '2 Occupations'` + `occupationPrerequisites: { min: 2 }` | 仓库正式卡牌类型中 `prerequisite` 是印刷文本，结构化校验走 `occupationPrerequisites` |
| 顶层辅助常量、函数和类型 | `CARD_IMPL` 直接或经其他辅助间接引用到的按原顺序保留；引用不到的辅助和顶层表达式语句丢弃 | `CARD_IMPL` 运行时要调用它们，`noUnusedLocals` 不允许遗留未用声明 |
| 未标注类型的参数 | 一律输出为 `any`；顶层辅助函数返回值也标为 `any`，文件加 `no-explicit-any` 的 lint 豁免 | 沙盒代码是运行时校验的无类型 JavaScript；严格构建不接受隐式 `any`，也不接受返回的 `{ type: 'seq' }` 被放宽成 `string` |


生成器还会同步输出：

- `shared/cards/community/{CUSTOM_ID}.ts` — Card Source（UI metadata + `CardImpl`）
- `shared/cards/register-all.ts`
- `shared/cards/catalog.generated.ts`
- `docs/community_cards.md`
- 可选 `public/card-art/community/{CUSTOM_ID}.{ext}`

提交到 GitHub PR 后，必须至少能通过：

```bash
pnpm run check:community-deck
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run build
```

如果某张工坊卡在沙盒中通过、但 PR CI 因 TypeScript 类型失败，优先修生成器规范化，而不是只手改生成出来的单张社区牌；否则下一次用户提 PR 还会复现。

### 1.1.1 提交后的单 Card Source 文件

提交到 GitHub PR 时，server `code-gen.ts` 会把沙盒里的 `CARD_DEF + CARD_IMPL`
规范化成一个正式 Card Source 文件：

- `shared/cards/community/{CARD_ID}.ts` — `defineMinorCard` / `defineOccupationCard`
  + `meta`（前端 manifest 可静态提取）
  + `impl`（后端运行时注册）
  + `export const {CARD_ID}_impl = {CARD_ID}.impl`

外加 3 个补丁文件：
- `shared/cards/register-all.ts` — patched 加 `{CARD_ID}.impl` 注册
- `shared/cards/catalog.generated.ts` — patched 加卡牌定义
- `docs/community_cards.md` — patched 加目录行

生成器不创建通用 smoke test。简单即时效果补直接行为测试；支付、选择 / pending、延迟、跨玩家和多步 flow 由作者、reviewer 或 LLM 编写专属 `GameSession` 场景。

**用户在沙盒里不需要关心正式模块形态**：继续按 `CARD_DEF + CARD_IMPL`
两个常量写，`CARD_IMPL` 用到的顶层辅助函数照常写在旁边即可。后端 `code-gen.ts` 负责规范化到单 Card Source。

---

## 2. `state` / `player` / `paymentInfo` / `context` 是 JSON 深拷贝快照

isolate 入口对所有输入做：

```js
const jsonSafe = JSON.parse(JSON.stringify(value ?? null))
```

效果：

- **没有方法**：只能读字段。任何 `player.xxx()` 调用必抛 `TypeError`。
- **修改无效**：handler 里改 `state` / `player` 不影响宿主端真状态。要影响游戏必须 `return { flow }` 让引擎执行 ActionFlow。
- `**undefined` 字段会消失**：`JSON.stringify` 会丢掉 `undefined` 值的 key，因此读字段时务必加 `?.` 和 `??` 兜底。
- **循环引用会爆**：宿主端 `JSON.stringify` 失败会抛错。GameState 已确保无循环，但自定义代码不要尝试在 effect 对象里塞回 `state`。

特别注意 `CardListenerContext` 里的玩家字段：


| 字段                      | 含义                      | `scope: 'player'` | `scope: 'opponent'` | `scope: 'any'` |
| ----------------------- | ----------------------- | ----------------- | ------------------- | -------------- |
| `context.player`        | **触发玩家**（执行 action 的人）  | = 卡主              | ≠ 卡主                | 不一定            |
| `context.ownerPlayer`   | **卡主**（持有这张卡的玩家）        | = `player`        | = "我"               | = 卡主           |
| `context.triggerPlayer` | 同 `context.player`，便于阅读 | —                 | —                   | —              |
| `context.effectPlayer`  | 效果应作用到的玩家（一般 = owner）   | —                 | —                   | —              |


**判定卡主必须用 `context.ownerPlayer`**，不能用 `context.player`。

每个卡牌 listener 都应通过 `cardIds: [CARD_ID]` 绑定本卡，让 scope 和 owner 指向这张卡。玩家身份通过这些对象读取：`context.player.id` 和 `context.ownerPlayer.id`。不存在 `context.playerId`；将它与卡主 ID 比较可能导致所有触发静默失效。对于已通过 `cardIds: [CARD_ID]` 绑定的 listener，`scope: 'player'` 已经只向卡主分发，无需再判断行动玩家是否为卡主。不要从引擎内部字段推断扁平的身份字段；已部署的工坊契约通过 `listeners.players` 列出支持的玩家对象键。

### 2.1 `context.space` (ActionSpace) 可读字段

`context.space` 的运行时形状是 `ActionDefinition + resources + takenBy`（见 `shared/contract/types.ts` 的 `ActionDefinition`）。Listener handler 只应读以下字段：

| 字段 | 类型 | 用途 |
|------|------|------|
| `space.id` | `string` | 行动位 ID（`'renovate-house'`、`'plow-1'` 等），用 `===` 精确过滤 |
| `space.takenBy` | `WorkerRef[]` | 占用情况；用 `spaceHasPlayer(space, playerId)` helper 判定 |
| `space.resources` | `Resource` | 行动位上堆积的资源（如累积 wood） |

⚠️ **不存在但常被幻觉**：`space.params`、`space.target`、`space.amount`、`space.houseType`。`params` 是 ActionFlow leaf 节点的字段（`{ type: 'leaf', actionId, params }`），**不属于** ActionSpace。写 `space.params.X` 在 sandbox 跑能过（`ts.transpileModule` 不做类型检查），但提交到主仓库 PR 后 `pnpm run build` 必报 `TS2339: Property 'params' does not exist on type 'ActionSpace'`。

### 2.2 常见判断与陷阱

- **翻修目标房屋类型**：参考实现升级链固定 `wood → clay → stone`，无分支。`renovate-house` 触发时不要尝试从 `space` 读目标，用 `context.player.houseType` 反推：当前 `'wood'` 表示翻修到泥屋，`'clay'` 表示翻修到石屋。例：石屋翻修折扣 → `if (context.player.houseType !== 'clay') return`（参见 `shared/cards/A/A110_Roughcaster.ts:15,26`）。
- **建造房屋类型**：监听 `construct`，用 `context.player.houseType`（`wood` / `clay` / `stone`）判断。`context.actionId` 始终是 `construct`；`context.choice` 是交互选择值，不表示房屋材料。
- **未使用 handler 参数**：项目 `tsconfig.json` 开了 `noUnusedParameters`。如果 handler 不需要 context，把参数前缀 `_` 或省掉。否则 PR CI 报 `TS6133: 'context' is declared but its value is never read`。

---

## 3. 沙盒识别的 hook / phase / scope 白名单

> **机器可校验段落（CI 会扫）**：本节的三个列表通过下面的标记块与 `shared/projections/card-effect-hooks.ts` 的 `cardEffectHooks`、`shared/custom-code/sandbox-listener-phases.ts` 的 `sandboxListenerPhases`、`shared/custom-code/sandbox-listener-scopes.ts` 的 `sandboxListenerScopes` 同源校验。**不要手动改下面这些标记块的格式**——会让 `pnpm run check:prompt-sync` 失败。

### 3.1 `CARD_IMPL.effect` 可用 hook

**只有 `cardEffectHooks` 列表中的 key 才会被沙盒注册**。漏到 manifest 提取阶段的未列出函数键会被明确拒绝，不再被悄悄丢弃。AST validator 会**硬拒**不在列表中的键——保存直接失败并给出错误信息。



<!-- prompt-sync:begin id=card-effect-hooks -->
- `onBuy`
- `onBeforeWork`
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
- `onEndHarvest`
- `onAfterHarvest`
- `onBeforeEndGame`
- `onBeforeStartOfTurn`
- `onBeforePlayerTurn`
- `onAllWorkersPlaced`
- `resolveChoice`
- `contributeExtraTurn`
- `computeBonusScore`
- `computeCostedBonus`
- `computeSharedPostScore`
- `computeExtraRoomCapacity`
- `computeHarvestBreedOrderPriority`
- `onComputeAnimalZones`
- `computeLockedFarmTiles`
- `getInvalidAnimals`
- `getBuiltSpecialStables`
- `getRuleContributions`
- `getStatePresentation`
<!-- prompt-sync:end id=card-effect-hooks -->


`onBeforeWork` 在回合资源增长和 future-meeple 行动之后、`onRoundStart` 之前触发；仅用于卡面明确写明“工作阶段开始前”的效果。

`onBeforePlayerTurn` 是 non-flow skip-control exception：签名是 `(state, player) => { skipTurn?: boolean } | void`，只用于 labor turn 入口同步跳过该玩家本次放工人机会；不能返回 `ActionFlow`，不能创建 pending。

reaction-compatible hook（action listener 的 `before` / `immediatelyAfter` / `after`、harvest field 三个 stage hook、`onBeforeEndGame`、`contributeExtraTurn`）不能依赖卡牌扫描顺序。多个同一时机可触发项会进入 `trigger-select`，由玩家选择来源卡后再执行。自定义卡应返回可重放 `ActionFlow` 表达状态修改；不要假设 handler 调用本身就是最终结算。

`contributeExtraTurn` 返回的是本卡 extra-turn provider 的 flow；多张卡同时返回 provider 时，系统先展示 provider 来源卡，选中后才展开该 flow。`countExtraTurns` 是官方卡内部字段，Workshop 不暴露。


额外允许的 meta 字段（不在 `cardEffectHooks` 数组中，但 AST validator 放行）：`id`、`handHooks`。

**进阶 hook 说明**：


| hook                                         | 签名特殊点                                                            | 用途                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `computeBonusScore`                          | `(state, player, ctx) => number`（`ctx.categories` 只读）           | 终局加分（free bonus；solver 收集后并入 `cardStateBonusVp`）       |
| `computeCostedBonus`                         | `(state, player, ctx) => BonusScoreLevel[]`                      | 终局花资源换 VP（申报 levels，solver 枚举最优组合）                    |
| `computeSharedPostScore`                     | `(state, owner, summaries) => Array<{ playerId, score }>`        | 跨玩家加分（如对手最低分给你额外 VP）                                |
| `contributeExtraTurn`                         | `(state, player) => ActionFlow \| void`                          | 普通工人耗尽后的 extra-turn provider；多个 provider 先由玩家选择来源卡       |
| `resolveChoice`                              | `(state, player, choice) => ActionFlow`                           | 处理玩家选择；沙盒不传 `ctx`                                  |
| `computeExtraRoomCapacity`                   | `(player) => number`                                              | 额外容纳空间                                              |
| `computeHarvestBreedOrderPriority`           | `(state, player) => number \| void`                               | Harvest breeding phase 顺序调整，数字越大越晚                         |
| `onComputeAnimalZones`                       | `(player, zones, state) => AnimalZone[]`                          | 只返回新增 zones；不要拼接传入的 `zones`；原地修改 JSON 快照无效             |
| `computeLockedFarmTiles`                     | `(player) => FarmTilePosition[]`                                  | 田地锁定                                                |
| `getInvalidAnimals`                          | `(player, zone, meeples) => Meeple[]`                             | 卡牌专属动物分区禁入校验；沙盒不传 `state`                           |
| `getBuiltSpecialStables`                     | `(player) => FarmTilePosition[]`                                | 当前矗立的特殊 stable（驱动 snapshot `specialStables` 展示派生）    |
| `getRuleContributions` | `(player) => CardRuleContributions` | 来源卡只读贡献组件预留或空格数量调整；有限、取整、非负并按类别上限约束 |
| `getStatePresentation` | `(player) => CardStatePresentation` | 明确的公开计数、资源组、作物层和标记；普通客户端不读取内部状态 |
| `handHooks`（meta）                            | `HandCardEffectHook[]`                                           | 声明哪些 stage hook 在卡牌还在手牌时也触发                          |

查询类 hook 返回文档规定的顶层类型（数字、数组或对象），也可以不返回。类型不符或返回非有限数字（`NaN`、无穷大）按 hook 出错处理。出错或没有返回值的查询贡献一个中性结果：空数组；`computeBonusScore` 和 `computeExtraRoomCapacity` 为 `0`；其余为空。

额外播种与特殊 stable 都是“候选 + 结算”成对契约：`onComputeSowableFields` / `onSowExtraField`、`getSpecialStablePositions` / `applySpecialStable`。结算 hook 依赖原地修改宿主对象，沙盒的 JSON 快照无法回传，因此 Workshop 不暴露这两对 hook。`handHooks` 不支持 `onBuy`、`onEndTurn`、`onBeforeEndGame`、`onBeforePlayerTurn`；`CARD_IMPL.effect` 必须直接写对象字面量，禁止变量引用、spread、computed key 和 accessor，避免 hook 或 meta 字段绕过静态校验；server/browser manifest 还会在宿主侧过滤不支持的 hand hook。

> 围栏折扣（E16 BriarHedge / C16 FieldFences）现走 listener `computeCosts` phase（actions: `['fence']`）；详见 ARCHITECTURE.md §15.7。
>
> C1 Overhaul rebuild 只处理 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy`。


### 3.2 `CARD_IMPL.listeners` 白名单

listener 条目只能声明 `handler`、`actions`、`phases`、`scope` 和 `cardIds`，另可带一个宿主会忽略的 `id` 标签。其他字段在保存时失败，因为 manifest 会丢弃它们。

listener 始终属于自己的卡：只有这张卡在 `scope` 选中的玩家面前已打出时才会触发，打出之前不会触发。`cardIds` 可以省略；如果写了，必须是 `[CARD_ID]`。

省略 `actions` 或 `phases` 表示本节列出的集合；anytime listener 另加 anytime 身份。它不会匹配 `forest` 这类行动格 id，也不会匹配清单之外的原生行动和阶段。

`actions` 只能使用以下高层 action ID；AST validator 会硬拒绝未知 ID：

<!-- prompt-sync:begin id=listener-actions -->
- `collect`
- `gain`
- `receive`
- `plow`
- `sow`
- `construct`
- `renovate-house`
- `fence`
- `stables`
- `improvement`
- `occupation`
- `place-farmer`
- `wish-children`
- `family-growth`
- `bake-bread`
- `breed`
- `reap`
<!-- prompt-sync:end id=listener-actions -->

`sandboxListenerPhases` 是 Workshop listener phase 白名单。AST validator 拒绝新源码中不支持的阶段；已保存的可执行 manifest 在 Session 或 runtime 注册前检查，隔离 Session 工厂先检查原始卡牌，再剥离父进程镜像中的可执行字段。不支持的阶段会在任何卡牌 effect、listener 或 worker 安装前拒绝创建。HTTP 创建对局返回 400、`code: 'unsupported_listener_phase'` 及具体阶段错误；WS 创建在持久化 Room 前返回错误。`during` 不再支持，也不会映射为 `after`；草稿和历史版本仍可读取、编辑。



<!-- prompt-sync:begin id=action-hook-phases -->
- `before`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeReplace`
- `isDoable`
- `anytime`
- `computeChoiceCandidates`
<!-- prompt-sync:end id=action-hook-phases -->



### 3.3 费用机制边界

Workshop 自定义卡只能通过 `computeCosts` listener 的 handler 返回值影响支付：

`computeCosts` 是纯查询，会在预览与支付执行时反复求值。每次调用都应返回本卡当前适用的贡献。`context.costs` 可能带有传入的已计算费用差值，它既不是基础价格，也不表示本 listener 已经贡献过折扣。尤其不能因为该字段已经为负值就跳过本次折扣；支付求解器负责合并贡献，并将应付费用下限限制为零。

购买主要或次要改良的费用统一监听 `actions: ['improvement']`。

- `costs`：简单行动费用 delta；负数表示折扣，正数表示额外费用。适合 `construct` 等普通 action cost。
- `trades`：支付替换候选，例如把一种资源换成另一种资源。适合“可以用 X 代替 Y”。
- `bonuses`：折扣或折扣选项；用 `choices` 表达玩家选择，用 `optional` 表达是否可跳过。
- `paymentResourceProviders`：payment-only 虚拟支付资源，适合“可以用行动格上的 food 支付 occupation cost”这类路径。它不写入 `costs` / `PlayerState.resources`，只在支付选项里作为特殊 payment resource 出现，并由 `consume` 消耗来源。

返回 `costs` 时必须在同一对象中返回 `costAttribution`；Workshop AST 校验和正式卡源码审计都会阻断缺失归因的代码：

```ts
handler: () => ({
  costs: { wood: -1 },
  costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -1 } }],
  sourceCard: CARD_ID,
})
```

跨所有主要/次要改良候选的资源折扣必须返回 mandatory capped bonus；`costs` 只用于简单行动费用：

```ts
handler: () => ({
  bonuses: [{
    discount: { wood: 2 },
    capDiscountAtCost: true,
    optional: false,
    sources: [CARD_ID],
  }],
  sourceCard: CARD_ID,
})
```

`capDiscountAtCost: true` 把低于折扣额的费用截到 0；`optional: false` 不保留未折扣路径。它只折扣实际含该资源的候选，并保留 `ComplexCost.cards` 等非资源要求。若同一张卡还折扣建房等简单行动，为 `improvement` 与该行动分别注册 listener，不要共用一个 `costs` 返回值。

`paymentResourceProviders` 形态示例：

```ts
return {
  paymentResourceProviders: [{
    key: `${CARD_ID}:traveling-players-food`,
    sourceCard: CARD_ID,
    available: context.state.actionSpaces.find(s => s.id === 'traveling-players')?.resources?.food ?? 0,
    covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
    consume: { type: 'actionSpace', spaceId: 'traveling-players', resource: 'food' },
  }],
  sourceCard: CARD_ID,
}
```

不要生成这些字段：`deriveCardCostCandidate`、`cardCostCandidateMandatory`、`getBaseCosts`、`modifiers`、`computeExchanges`。这些字段是官方卡内部 API，Workshop 不支持。其中 `deriveCardCostCandidate` / `getBaseCosts` 属于 major/minor improvement 购买成本候选管线，`computeExchanges` 属于运行时 exchange 注入机制；沙盒 manifest 不会完整注册这些字段。

### 3.4 `scope` 取值

`sandboxListenerScopes` 限制：



<!-- prompt-sync:begin id=listener-scopes -->
- `player`
- `opponent`
- `any`
<!-- prompt-sync:end id=listener-scopes -->



不在列表里的 `scope` 在保存时失败；省略 `scope` 时默认为 `player`。

---

## 4. `PlayerState` / `cardStates` 字段口径

下面这些是 prompt / 文档高频踩坑点，已与 `shared/contract/types.ts` 的 `PlayerState` 校准。

### 4.1 玩家字段


| 字段                        | 类型                                           | 用法                                                                |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `player.workers`          | `Worker[]` 即 `{ id, isActive, isNewborn }[]` | **数家庭成员要 `.filter(w => w.isActive).length`**（少数卡如 A127 会把工人置为非活跃） |
| `player.fenceSegments`    | `FenceSegment[]`                            | **字段名是 `fenceSegments`，不是 `fences`**；`type` 表示 ordinary fence / palisade，`source` 表示 own / borrowed；旧 string shape 只属于 normalize legacy 输入，不是 runtime shape |
| `player.fields`           | `Field[]`                                    | `.length` 得到田地数                                                   |
| `player.pastures`         | `Pasture[]`                                  | `.length` 得到牧场数                                                   |
| `player.rooms`            | `number`                                     | 房间数                                                               |
| `player.houseType`        | `'wood' \| 'clay' \| 'stone'`               | 房屋类型                                                              |
| `player.resources`        | `Partial<Record<Resource, number>>`          | `player.resources.wood ?? 0`                                      |
| `player.minorPlayed`      | `string[]`                                   | 已打小发展卡 ID 列表                                                      |
| `player.occupationPlayed` | `string[]`                                   | 已打职业卡 ID 列表                                                       |
| `player.improvements`     | `string[]`                                   | 已建主要改良 ID 列表                                                      |
| `player.cardStates`       | `Record<string, CardState>`                  | 见 §4.2                                                            |


### 4.2 `cardStates[id]` 形状

```ts
type CardState = {
  counters?: Record<string, number>            // 资源或有名称的卡牌局部计数器
  flagged?: boolean                              // 一次性触发标记
  infobox?: string                               // 显示在卡面的小标签
  stack?: unknown[]                              // 复杂状态（如 LIFO 队列）
  extraData?: Record<string, unknown>            // 自由扩展字段
  privateData?: Record<string, unknown>
}
```
计数、flag、stack 和 `extraData` 默认属于权威内部状态，不进入普通同步，本人也不接收。`privateData` 仅对存储它的玩家可见；传牌不会转移其他玩家的私有观察。`infobox` 和资源统计是预留的公开通道。其他公开信息必须通过 `getStatePresentation(player)` 或原生 Card Source 的 `presentation` 声明提供。宿主复制查询输入，并按封闭的 `CardStatePresentation` 结构校验结果；返回公开计数、资源组、作物层或标记，不返回原始状态。规则贡献使用 `getRuleContributions(player)`，查询不写状态。


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


| 字段                              | 注意                                                              |
| ------------------------------- | --------------------------------------------------------------- |
| `state.round`                   | 1–14                                                            |
| `state.players.length`          | 玩家数。**没有 `state.playerCount` 字段**                               |
| `state.actionSpaces`            | `ActionSpace[]`                                                 |
| `state.actionSpaces[i].takenBy` | `WorkerRef[]`，元素 `**{ playerId, workerId }`**（不是 `playerIndex`） |


---

## 5. AST validator 禁用清单

`shared/custom-code/ast-validator.ts` 在编译前用 TypeScript AST 静态拦截以下结构。任何一条命中都会让自定义卡保存失败、给作者错误。

AST validator 还会检查 `CARD_IMPL.effect` 中的键是否在 `cardEffectHooks` + meta 字段白名单中，以及 `CARD_IMPL.listeners[].phases` 中的值是否在 `actionHookPhases` 白名单中。**不在白名单中的 hook/phase 会导致编译失败**（hard-fail），而非静默丢弃。 静态可见的 flow leaf 也按同样方式检查：字面量 `actionId` 不在 §6 之内，或字面量 `special-effect` kind 不在 §6.1 之内，保存时失败。

### 5.1 禁用标识符（裸引用即报错）



<!-- prompt-sync:begin id=denied-identifiers -->
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
- `self`
- `importScripts`
- `postMessage`
- `WorkerGlobalScope`
- `indexedDB`
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



<!-- prompt-sync:begin id=denied-property-access -->
- `constructor`
- `__proto__`
- `__defineGetter__`
- `__defineSetter__`
- `__lookupGetter__`
- `__lookupSetter__`
<!-- prompt-sync:end id=denied-property-access -->



### 5.3 禁用语言结构


| 结构                              | 说明              |
| ------------------------------- | --------------- |
| `import` 声明                     | 静态 import 全禁    |
| 动态 `import(...)`                | 同上              |
| `export` 声明 / `export =`        | 全禁              |
| `require()` 调用                  | 即使没在禁用标识符里也会单独拦 |
| `class` 声明 / `class` 表达式        | 全禁              |
| `with` 语句                       | 全禁              |
| Generator 函数（`function`* / 表达式） | 全禁              |


### 5.4 允许的（非穷举提示）

- 普通 `const` / `let` / `function` / 箭头函数
- `for` / `while` / `if` / `switch` / `try/catch`
- 字面量：数字 / 字符串 / 模板字符串（不含禁用标签）/ 数组 / 对象
- `JSON.parse` / `JSON.stringify`（沙盒里 JSON 是有的）
- `Math.*`（沙盒里 Math 是有的）
- `Array.prototype.*` / `Object.keys/values/entries`

---

## 5.5 listener `actions:` 字段（高频踩坑）

`CARD_IMPL.listeners[].actions` 接受的字符串是**触发行动的内部 leaf actionId**（如 `place-farmer`、`gain`、`collect`），**不是**行动空间 ID（如 `forest`、`clay-pit`）。唯一的例外是 `wish-children`：它在清单里，玩家使用“渴望孩子”行动格时，监听它的 listener 会在 `before` 阶段被调用。完整列表由 `shared/custom-code/sandbox-listener-actions.ts` 定义，并进入已部署沙盒契约。

要在"玩家走某个行动空间"后触发，监听 `actions: ['place-farmer']` 然后在 handler 内用 `context.space?.id === '<空间ID>'` 过滤。

```ts
// ✗ 错误：'forest' 不是 leaf actionId，listener 永不触发
{ actions: ['forest'], phases: ['after'], handler: (ctx) => ({ flow: ... }) }

// ✓ 正确：监听 place-farmer，handler 内过滤空间 id
{
  actions: ['place-farmer'],
  phases: ['after'],
  handler: (ctx) => {
    if (ctx.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}
```

特殊行动名 `harvest-feed` **不是** listener 可监听项 —— 收获阶段的 feeding 走直接资源 mutation，不进 listener pipeline。要在喂食阶段开始时补食物，用 `onStartHarvestFeedingPhase` 返回 `gainLeaf(CARD_ID, { food: N })`；flow 在进入 feeding 阶段后、实际扣除食物前完成。`onHarvest` 更早，在收割后的 anytime 窗口之前执行。

## 5.6 Anytime ability（任意时刻能力）

不是单独的 API。直接写一个 listener，`phases: ['anytime']`，**不要** `actions:` 字段：

```ts
{
  cardIds: [CARD_ID],
  phases: ['anytime'],
  handler: (ctx) => {
    if (ctx.player.cardStates?.[CARD_ID]?.flagged) return  // 一次性闸门
    if ((ctx.player.resources?.wood ?? 0) < 2) return       // 资源不够就不出
    return {
      flow: {
        type: 'seq',
        // 不要写 optional: true —— 玩家会跳过 pay 还白拿 gain
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
          gainLeaf(CARD_ID, { food: 3 }),
          { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true }, sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}
```

引擎会在每次 `respond()` 时自动收集所有 anytime listener，调 handler 拿 flow，把 flow 暴露在 `interaction.anytimeActions[]`。玩家通过 `takeAnytimeAction(playerIndex, action.id)` 触发。`action.id` 即 listener 的 `registrationId`（沙箱卡为 `{cardId}:listener:{index}`）。

## 5.7 `futureMeeplesNode` 不在沙箱

虽然官方卡用 `futureMeeplesNode(request)` builder，但**沙箱里没注入这个 helper**。要预放未来回合的资源，手写 leaf：

```ts
return {
  type: 'leaf',
  actionId: 'future-meeples',
  sourceCard: CARD_ID,
  params: {
    __futureMeepleRequest: {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: state.round + 1, resources: { wood: 1 } }],
    },
  },
}
```

`futureMeeplesAction.execute()` 识别 `params.__futureMeepleRequest`，把 entry 入队到 `state.pendingFutureMeeples`，下一回合开始时落到当回合行动卡格上。`FutureMeepleRequest` 还有 `{ startRound, count, resources }` 形式（多个回合连续放），见 `shared/contract/types.ts` 的 `FutureMeepleRequest`。

未来回合的预放奖励必须走该调度路径，由引擎管理可见的预放记录、到账与清理。把资源存在卡牌 counters，再通过带 flag 的 `onRoundStart` 发放，不会创建未来回合的预放记录。

### 5.8 ActionFlow 结构

单步使用 `{ type: 'leaf', actionId, params, sourceCard: CARD_ID }`。组合节点的数组字段是 `children`，类型可以是 `seq`、`or`、`xor` 或 `parallel`：

```ts
{ type: 'seq', children: [gainLeaf(CARD_ID, { food: 1 }), gainLeaf(CARD_ID, { wood: 1 })] }
```

`optional` 是节点上的布尔字段，不是另一种节点类型。节点还可以带 `promptKey` 和 `anytimeWindow`，leaf 可以带 `actionContext`，其中只能有 `targetPlayerId` 这一个键，其他键会被拒绝。其余原生节点字段不对工坊卡开放，返回 flow 时会被拒绝：`mode`、`triggerSelectOnce`、`expandFlow`、`optionId`、`choiceLabelKey`、`choiceLabelParams`、`effectPreview`、`anytimeActionId`，以及节点级的 `targetPlayerId`。节点上的其他任何字段同样被拒绝，所以 `optoinal` 这样的拼写错误会报错，不会被悄悄忽略。节点、listener 返回值和 `followUpActions` 条目上的 `sourceCard` 必须是 `CARD_ID`。没写 `sourceCard` 的 leaf，以及带 flow 但没写它的 listener 返回值，会被归到本卡。返回流程的 effect hook 直接返回 flow；listener 返回 `{ flow, sourceCard: CARD_ID }`（或其文档规定的查询结果）。

执行前，AST 校验会拒绝可静态识别的组合节点字面量：缺少 `children`，或其值明显不是数组。这覆盖 flow hook 的直接返回、嵌套的字面量 children，以及 listener 的 `flow` / `alternativeFlow` 结果。校验不会把 leaf 参数或卡牌私有数据当作 flow，也不推断动态 helper 结果或 spread 提供的 children。静态通过后仍需试玩验证行为。

---

## 6. `actionId` 行为校准

下面这几个是高频踩坑点。完整 `actionId` 列表见 `shared/actions/effects/*` 目录。


<!-- prompt-sync:begin id=action-ids -->
- `gain`
- `pay`
- `bonus-vp`
- `bake-bread`
- `store-on-card`
- `take-from-card`
- `push-to-card-stack`
- `special-effect`
- `future-meeples`
<!-- prompt-sync:end id=action-ids -->

这九个 ID 是强制执行的，不只是推荐。源码校验会拒绝可见的其他 ID 的 leaf。两个执行器会拒绝使用其他 ID 的返回值，包括 `flow`、`alternativeFlow`、`followUpActions` 条目和替换用的 `actionId`，嵌套分组内也一样。整份返回值在任何节点执行前被拒绝；玩家随后看到的行为见 §9.3。

每个行动只接受下表列出的参数键。`gain`、`store-on-card`、`take-from-card` 接受资源名；`pay` 接受资源名，或 `payLeaf` 产生的单个 `cost` 键；`bonus-vp` 和 `bake-bread` 不接受参数；`push-to-card-stack` 接受 `item`；`future-meeples` 接受 `__futureMeepleRequest`，其中的 `cardId` 必须是 `CARD_ID`。原生专用的控制项会被拒绝，例如 gain 上的 `payerId`、pay 上的 `costType`。数量、费用规则和排程由原生行动自己校验。

| actionId                   | 关键约束                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `bonus-vp`                 | **固定 +1 VP，不接受 `amount` / `vp` 参数**。要 N 分就把 N 个 leaf 串入 seq                       |
| `store-on-card`            | params 形如 `{ wood: 1, clay: 2 }`，写入 `player.cardStates[CARD_ID].counters`         |
| `take-from-card`           | params 形如 `{ grain: 1 }`，从 `player.cardStates[CARD_ID].counters` 扣，扣完 leaf 就 fail |
| `gain`                     | params 形如 `{ food: 2, wood: 1 }`                                                  |
| `pay`                      | 同上，扣资源                                                                            |
| `bake-bread`               | 启动一段烤面包子流程                                                                        |
| `push-to-card-stack`       | 向 `player.cardStates[CARD_ID].stack` 推入一项                                         |
| `special-effect`           | **沙盒 cardStates mutation 入口**（Sprint 6a/6b）。`params: { kind: 'set-flag' \| 'set-infobox' \| 'set-counter' \| 'increment-counter' \| 'set-extra-data' \| 'set-private-data' \| 'increment-extra-data', ... }`。取代旧的 `flag-card` / `unflag-card` / `set-card-infobox` / `clear-card-infobox` / `write-card-extra-data` 5 个 leaf。详见 §6.1；未列出的仓库内部 kind 不属于 Workshop 合约。 |
| `future-meeples`           | 沙箱专用：用 `params.__futureMeepleRequest` 预放未来回合资源（见 §5.7）                            |

> Sprint 6b（2026-04-30）已删除 5 个独立 mutation actionId（`flag-card` / `unflag-card` / `set-card-infobox` / `clear-card-infobox` / `write-card-extra-data`）+ 3 个 dead actionId（`hold-worker-on-card` / `release-worker-from-card` / `gain-other-players`）。统一使用 `special-effect` discriminated-union。`check-prompt-sync` 在 CI 校验 prompt 只暴露白名单内 actionId；白名单外的 actionId 不会出现在 prompt 中，沙盒卡牌不应使用——改用 `special-effect`。

### 6.1 `special-effect` `params.kind` 沙盒可用子集

每次修改都通过带有 `sourceCard: CARD_ID` 的 `special-effect` leaf 返回，`params` 使用下面的一种形状。

```ts
// 写入 player.cardStates[sourceCard].counters[key]
{ kind: 'increment-counter', key: 'uses', amount: 1 }
{ kind: 'set-counter', key: 'uses', value: 0 }

// 设/清除 player.cardStates[sourceCard].flagged
{ kind: 'set-flag', flag: true }
{ kind: 'set-flag', flag: false }

// 设 player.cardStates[sourceCard].infobox（空字符串等价 clear）
{ kind: 'set-infobox', text: '✓' }
{ kind: 'set-infobox', text: '' }

// 写 player.cardStates[sourceCard].extraData[key]
{ kind: 'set-extra-data', key: 'foo', value: 1 } // 内部状态

// 写 player.cardStates[sourceCard].privateData[key]；readCardExtraData 读不到它
{ kind: 'set-private-data', key: 'secret', value: '仅本人可见' }

// player.cardStates[sourceCard].extraData[key] += amount
{ kind: 'increment-extra-data', key: 'used', amount: 1 }
```

以上七个 kind 是沙盒的完整集合，定义在 `SANDBOX_SPECIAL_EFFECT_KINDS`。仓库内部还使用其他 kind（例如 `emit-card-triggered` 用于写入可见卡牌触发事件日志）。这些 kind 不属于 Workshop 合约，使用它们的 `special-effect` leaf 会被拒绝。已列出的 kind 如果字段类型与上面不符，同样被拒绝：`key` 和 `text` 是字符串，计数和累加类 kind 的 `amount`、`value` 是有限数字，`flag` 是布尔值，两个写数据的 kind 必须带 `value`。

可选 `actionContext.targetPlayerId?: string` 让 mutation 路由到 `state.players` 中匹配的玩家（默认是 `context.player` 即 actor）。Workshop 通常用不到 targetPlayerId（仅 D134 OysterEater 等跨玩家场景需要）。

> **`card_*` 前缀 ad-hoc actions**（Sprint 6b）：repo-internal 单卡专用 actions（如 `card_E112_GrainThief_protect`）通过 `registerAdHocAction()` 注册，仅在主仓库代码中可见。Workshop 生成的卡 **不能** dispatch `card_*` actionId——这类 id 不在 `SANDBOX_ALLOWED_ACTION_IDS` 白名单内、不会出现在 prompt 中，沙盒运行时也不接受。如果需要单卡 mutation，请用 `special-effect` 或标准 `gain`。


---

## 7. 输出格式：`CARD_DEF` / `CARD_IMPL` 双常量

自定义卡代码**必须**通过两个顶层 `const` 声明输出：

```typescript
const CARD_ID = 'CUSTOM_MyCard'

// 卡牌定义（必须）
const CARD_DEF = {
  cardType: 'minor',            // 或 'occupation'
  meta: {
    id: CARD_ID,
    name: '卡牌名',
    deck: 'CUSTOM',
    number: 0,
    desc: ['效果描述'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
  },
}

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

## 8. 浏览器本地执行器的语义对齐

浏览器本地执行器（`client/local-sandbox/browser-executor.ts`，`VITE_SANDBOX_EXECUTOR=browser` 时的工坊试玩路径）在浏览器里跑用户自己的代码（"用户只能攻击自己"），不进 isolate。**注入清单与服务端 isolate（`server/custom-code/isolate-runner.ts`）完全一致**：

- 同样暴露 `MinorImprovement(def) => def` / `Occupation(def) => def` / 简化 `console` / 所有 §1 中列出的 helper 函数（复用同一份 `shared/custom-code/injected-helpers.ts` 字符串常量）
- 同样对输入做 `JSON.parse(JSON.stringify(...))` 拷贝、输出 JSON round-trip
- 同样按本文件 §3 的白名单过滤 hook / phase（复用 shared 的同一组过滤函数）
- 同样使用 `CARD_DEF` / `CARD_IMPL` 双常量捕获

等价性由 `server/__tests__/local-sandbox-parity.test.ts` 钉死：同一卡源码在双端的 validate/compile 结果、effect/listener 调用结果、错误容忍行为逐项断言相等。

**理由**：本地沙盒是多人对局的 dry-run；语义不等价就违背"先在本地跑通、再提交多人"的核心定位。

---

## 9. 同步责任

### 9.1 修改本文件 → 谁会自动同步

- `server/workshop-sandbox-contract.ts` 从 shared 真相源和描述元数据派生部署的 hook / phase / scope / actionId 与 helper 正文，`client/services/llm/generation/prompt.ts` 包含该契约，由 `client/services/__tests__/generation-prompt.test.ts` 守卫。CI `pnpm run check:prompt-sync` 校验本文件的全部 `prompt-sync` 块与源码一致。浏览器从 GitHub 当前 main 读取本文和样例，每次尝试固定 SHA，不随站点打包发布。
- `**docs/ARCHITECTURE.md**`：手工同步引用本文件即可。
- `**client/app/workshop/AiCardDesigner.tsx**`：手工同步引用本文件即可。

### 9.2 修改 hook / phase / scope / denylist 代码 → 必须更新本文件

- 在 `shared/projections/card-effect-hooks.ts` 的 `cardEffectHooks` 数组增删一项 → 改本文件 §3.1 同名 `prompt-sync` 块
- 在 `shared/custom-code/sandbox-listener-phases.ts` 的 `sandboxListenerPhases` 增删 phase → 改本文件 §3.2
- 在 `shared/custom-code/sandbox-listener-scopes.ts` 的 `sandboxListenerScopes` 增删 scope → 改本文件 §3.4
- 在 `shared/custom-code/ast-validator.ts` 的 `DENIED_IDENTIFIERS` / `DENIED_PROPERTY_ACCESS` 增删项 → 改本文件 §5.1 / §5.2

CI 会拦下漏改的情况。

`check:prompt-sync` 只防名字集合漂移。修改支付器、executor 参数透传、JSON 边界或 injected helper 时，还必须更新 `client/services/__tests__/generation-prompt.test.ts`、对应 executor/parity 测试和语义 contract 测试；涉及生成策略时增加或收紧真实 `GameSession` fixture，冻结实现，并在已批准预算内跑完整浏览器验收批次。保留历史失败，将合成演练、历史 golden 回放与模型准入分开；详见 `docs/test/llm-card-gen.md`。

### 9.3 工坊能力契约规则

本文件遵守 [ADR 0025](adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)。

- **契约管的是名字、节点字段、各行动的参数键、`special-effect` 的字段类型，以及查询类 hook 返回值的顶层类型。**参数的取值和查询结果的内容由原生代码自己校验，与原生卡相同；准入不重复实现这些规则。
- **未列出即未开放。**部署契约、源码校验和两个执行器接受同一组名字：§3.1 的 hook，§3.2 和 §3.4 的 listener 行动、阶段和 scope，§6 的 action ID，以及 §6.1 的 `special-effect` kind。本文件不逐项列出未开放的原生接口，候选能力记录在 [issue #1079](https://github.com/titanxxh/open-agricola/issues/1079)。
- **有固定行为测试的名字才开放。**每个名字至少要有一个测试，在不改原生规则路径的前提下，用两人 `GameSession` 真实驱动它。新能力单独开 issue，并带上这个测试。
- **hook 出错和返回契约外内容的处理相同。**如果出错发生在一条命令的结算过程中，第一次出现时拒绝这条命令，恢复到命令之前的状态，并返回错误；错误里写明被拒绝的行动、kind 或字段。同样的错误再次出现时不再报告：命令成功，这张卡本次的效果被跳过。这是有意的行为，让带着有问题卡牌的对局可以继续。出错如果发生在命令之外，例如为一次响应计算可用性、预览或分数时运行的查询，则只记一条卡牌警告，并贡献 §3.1 所说的中性结果；此时没有正在进行的命令，所以不回滚。

准入面向诚实作者和模型写错的情况，除 isolate 自身的限制外，不限制恶意构造的工作量。

---

## 10. 历史


| 日期         | 变更                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-10 | 契约改为收紧执行（ADR 0025）：源码校验和两个执行器强制执行 action ID 与 `special-effect` kind，拒绝不支持的 listener 字段和未写入文档的 `beforeEndGameScope` / `beforeEndGameMandatory` 元数据，每个 listener 和返回的节点绑定到自己的卡，省略的 listener 过滤绑定到已列出的集合，拒绝未开放的原生节点字段、未写入文档的行动参数键、类型不符的 `special-effect` 字段和顶层类型不符的查询结果，并写明 hook 出错时的行为。 |
| 2026-08-04 | 修正跨全部改良候选折扣为 mandatory capped bonus；补齐并收窄 `handHooks` manifest、要求 effect 使用无 accessor 的直接对象字面量并在宿主侧过滤、统一 `positionKey({row,col})`，移除无法完整结算的 Workshop candidate/settlement hook；新增语义 contract 与 M11 live/record/replay 守卫。 |
| 2026-04-30 | 双轨 scoring hook 重构：删除 `computePostScore` / `scoringPriority` / `ctx.reserved`；新增 `computeCostedBonus` 走 Pareto 求解器。详见 `(spec/plan 已归档，见 git history)`。|
| 2026-04-24 | 修正 `computeBonusScore` / `computePostScore` / `computeSharedPostScore` 签名（实为 `=> number` / `=> Array<{playerId,score}>`，非 `{score,label}`）；新增 §5.5 listener `actions:` 高频踩坑（不含空间 ID、`harvest-feed` 不可监听）、§5.6 anytime 写法、§5.7 `futureMeeplesNode` 不在沙箱；登记 `flag-card` / `future-meeples` actionId。来源：LLM card-gen session 测试套件实测 |
| 2026-04-22 | 全面重写：`registerCardEffect`/`registerCardListener` → `CARD_DEF`/`CARD_IMPL` 双常量；注入 helper 函数；扩展 hook 白名单至全部 CardEffectField；扩展 phase 白名单增加 `anytime`/`computeChoiceCandidates`；AST validator hard-fail；4 个新 actionId                                                                                                               |
| 2026-04-19 | 抽出英文规范文档作为唯一真源；从旧设计文档 §16 内联描述迁出                                                                                                                                                                                                                                                        |
