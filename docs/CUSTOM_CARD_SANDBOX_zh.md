# 自定义卡沙盒约束（Custom Card Sandbox Reference）

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

> 本文是 [`CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md) 的中文镜像；英文版是 prompt 同步与沙盒校验的规范文档。

以下为英文规范文档的中文翻译，描述 Workshop / AI Designer 提交的自定义卡 TS 代码在 isolated-vm 沙盒里**实际能用什么、不能用什么**。

> **谁该读这个文件**：
>
> - **AI 系统提示词作者** — `client/services/llm/generation/prompt.ts` 包含 `server/workshop-sandbox-contract.ts` 返回的已部署契约；hook / phase / scope / actionId、helper 和运行语义来自实际运行的后端及 shared 描述元数据，样例由浏览器按需从 GitHub 读取
> - **Workshop UI 文案作者** — `client/app/workshop/AiCardDesigner.tsx` / `WorkshopPage.tsx` 文案
> - **设计文档作者** — `docs/ARCHITECTURE.md` 提到沙盒的章节
> - **LLM 自动化测试维护者** — `docs/test/llm-card-gen.md` 描述了用真 LLM 验证沙盒契约的 fixture 套件
>
> **修改本文件的同时**必须：
>
> 1. 本文件是 hook / phase / scope / actionId 的**人读镜像**：名字白名单由源码常量拥有（`cardEffectHooks` / `sandboxListenerPhases` / `sandboxListenerScopes` / `SANDBOX_ALLOWED_ACTION_IDS`），描述由穷尽 map 拥有；已部署沙盒契约在运行时派生这些内容，由浏览器放入生成 prompt，**不再手工同步 prompt 表格**。CI `pnpm run check:prompt-sync` 只校验本文件的 `prompt-sync` 块与源码名字一致。
> 2. 让 `docs/ARCHITECTURE.md` 引用本文件而不是另行维护一份
> 3. 支付语义、hook 参数/返回值和 helper 数据形状不是名字同步能覆盖的；同步更新 executor / prompt contract 测试，并按 `docs/test/llm-card-gen.md` 跑固定浏览器验收批次；历史 golden 回放保留为独立回归检查

> **官方卡作者**（在 `shared/cards/<deck>/<id>.ts` 里写 TS 模块）**不受**本文件约束 —— 直接 import `shared/domain/player.ts` 等任意 helper。本文件只覆盖 Workshop 自定义卡。

---

## 1. 沙盒注入的全局

`server/custom-code/engine.ts` 往 isolate 注入以下全局：

<!-- prompt-sync:begin id=sandbox-injections -->

| 全局                                       | 形态      | 备注                                                                                 |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `MinorImprovement(def)`                  | 函数 stub | 将精确 `{occupation: n}` 前提规范化为文本及数值下限；`new MinorImprovement(def)` 也支持                                    |
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

`extractManifestFromCompiledCode` 用 `cardEffectHooks` 数组过滤 `CARD_IMPL.effect` 上的函数键。**只有列表中的 key 才会被沙盒注册**。AST validator 会**硬拒**不在列表中的键——保存直接失败并给出错误信息。



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
- `computeSharedPostScore`
- `computeCostedBonus`
- `computeExtraRoomCapacity`
- `computeHarvestBreedOrderPriority`
- `onComputeAnimalZones`
- `computeLockedFarmTiles`
- `getInvalidAnimals`
- `getBuiltSpecialStables`
- `getRuleContributions`
- `getStatePresentation`
- `computeResourceCommitments`
- `countExtraTurns`
- `enforceReorganizeOnLastHarvest`
- `computeBreedThreshold`
- `computeBreedableAnimalCount`
- `computeAnimalScoreAdjustment`
- `onComputeSharedAnimalZones`
<!-- prompt-sync:end id=card-effect-hooks -->


`onBeforeWork` 在回合资源增长和 future-meeple 行动之后、`onRoundStart` 之前触发；仅用于卡面明确写明“工作阶段开始前”的效果。

`onBeforePlayerTurn` 是 non-flow skip-control exception：签名是 `(state, player) => { skipTurn: boolean } | void`，只用于 labor turn 入口同步跳过该玩家本次放工人机会；不能返回 `ActionFlow`，不能创建 pending。

reaction-compatible hook（action listener 的 `before` / `during` / `immediatelyAfter` / `after`、harvest field 三个 stage hook、`onBeforeEndGame`、`contributeExtraTurn`）不能依赖卡牌扫描顺序。多个同一时机可触发项会进入 `trigger-select`，由玩家选择来源卡后再执行。自定义卡应返回可重放 `ActionFlow` 表达状态修改；不要假设 handler 调用本身就是最终结算。

`contributeExtraTurn` 返回的是本卡 extra-turn provider 的 flow；多张卡同时返回 provider 时，系统先展示 provider 来源卡，选中后才展开该 flow。`countExtraTurns(state, player)` 返回剩余额外机会数；与 `contributeExtraTurn` 配合，`extraTurnBeforeWorkers` 可提前到普通工人之前提供。


额外允许的 meta 字段（不在 `cardEffectHooks` 数组中，但 AST validator 放行）：`id`、`handHooks`、`beforeEndGameScope`、`beforeEndGameMandatory`、`preHarvestGoodsWanted`、`preHarvestGoodsWantedBeforeReap`、`maySkipHarvestFieldPhase`、`extraTurnBeforeWorkers`。

**进阶 hook 说明**：


| hook                                         | 签名特殊点                                                            | 用途                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `computeBonusScore`                          | `(state, player, ctx) => number`（`ctx.categories` 只读）           | 终局加分（free bonus；solver 收集后并入 `cardStateBonusVp`）       |
| `computeCostedBonus`                         | `(state, player, ctx) => BonusScoreLevel[]`                      | 终局花资源换 VP（申报 levels，solver 枚举最优组合）                    |
| `computeSharedPostScore`                     | `(state, owner, summaries) => Array<{ playerId, score }>`        | 跨玩家加分（如对手最低分给你额外 VP）                                |
| `contributeExtraTurn`                         | `(state, player) => ActionFlow \| void`                          | 普通工人耗尽后的 extra-turn provider；多个 provider 先由玩家选择来源卡       |
| `resolveChoice`                              | `(state, player, choice, ctx) => ActionFlow`                           | 处理玩家选择；`ctx` 含 `sourceCard` / `actionContext` 数据，不含宿主回调                                  |
| `computeExtraRoomCapacity`                   | `(player) => number`                                              | 额外容纳空间                                              |
| `computeHarvestBreedOrderPriority`           | `(state, player) => number \| void`                               | Harvest breeding phase 顺序调整，数字越大越晚                         |
| `onComputeAnimalZones`                       | `(player, zones, state) => AnimalZone[]`                          | 只返回新增 zones；不要拼接传入的 `zones`；原地修改 JSON 快照无效             |
| `computeLockedFarmTiles`                     | `(player) => FarmTilePosition[]`                                  | 田地锁定                                                |
| `getInvalidAnimals`                          | `(player, zone, meeples, state) => Meeple[]`                             | 卡牌专属动物分区禁入校验；第四个参数传完整 `state` 快照                           |
| `getBuiltSpecialStables`                     | `(player) => FarmTilePosition[]`                                | 当前矗立的特殊 stable（驱动 snapshot `specialStables` 展示派生）    |
| `getRuleContributions` | `(player) => CardRuleContributions` | 来源卡只读贡献组件预留或空格数量调整；有限、取整、非负并按类别上限约束 |
| `getStatePresentation` | `(player) => CardStatePresentation` | 明确的公开计数、资源组、作物层和标记；普通客户端不读取内部状态 |
| `handHooks`（meta）                            | `HandCardEffectHook[]`                                           | 声明哪些 stage hook 在卡牌还在手牌时也触发                          |

额外播种与特殊 stable 都是“候选 + 结算”成对契约：`onComputeSowableFields` / `onSowExtraField`、`getSpecialStablePositions` / `applySpecialStable`。结算 hook 依赖原地修改宿主对象，沙盒的 JSON 快照无法回传，因此 Workshop 不暴露这两对 hook。`handHooks` 不支持 `onBuy`、`onEndTurn`、`onBeforeEndGame`、`onBeforePlayerTurn`；`CARD_IMPL.effect` 必须直接写对象字面量，禁止变量引用、spread、computed key 和 accessor，避免 hook 或 meta 字段绕过静态校验；server/browser manifest 还会在宿主侧拒绝不支持的 hand hook。

> 围栏折扣（E16 BriarHedge / C16 FieldFences）现走 listener `computeCosts` phase（actions: `['fence']`）；详见 ARCHITECTURE.md §15.7。
>
> C1 Overhaul rebuild 只处理 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy`。



### 3.1.1 完整参数与新增纯查询

执行器保留全部位置参数，包括第四、第五个。普通阶段 hook 的第三个参数是可选 `FlowEffectContext`（仅 `triggerActionId`）；`onBuy(state, player, paymentInfo, ctx)` 同时获得支付与阶段上下文。`resolveChoice` 的第四个参数包含 `sourceCard` 和 `actionContext`。所有参数均为 JSON 快照，宿主回调不传入。

新增查询：`computeResourceCommitments(state, owner)` 返回玩家资源预留；`countExtraTurns(state, player)` 返回剩余额外机会；`enforceReorganizeOnLastHarvest(state, player)` 返回终局重组要求；`computeBreedThreshold(state, player, animal, ctx)` 与 `computeBreedableAnimalCount(state, player, animal, count, ctx)` 调整繁殖；`computeAnimalScoreAdjustment(state, player, animal, ctx)` 当前仅用于 FOTM 马匹计分；`onComputeSharedAnimalZones(owner, animalOwner, zones, state)` 只返回新增卡牌区域，保留所有者与动物所有者身份。

`beforeEndGameScope` / `beforeEndGameMandatory` 控制终局目标和强制性；两种 `preHarvestGoodsWanted*` 区分收割前库存与可保证收割的作物；`maySkipHarvestFieldPhase` 影响需求估算。仅声明元数据的 effect 也会注册。

### 3.2 `CARD_IMPL.listeners` 白名单

`actions` 只能使用以下高层 action ID；AST validator 会硬拒绝未知 ID：

<!-- prompt-sync:begin id=listener-actions -->
- `anytime`
- `compute-exchanges`
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
- `pay`
- `bonus-vp`
- `store-on-card`
- `take-from-card`
- `push-to-card-stack`
- `special-effect`
- `future-meeples`
- `exchange`
- `set-first-player`
- `selection`
- `emit-choice`
- `reorganize`
<!-- prompt-sync:end id=listener-actions -->

`sandboxListenerPhases` 是 Workshop listener phase 白名单。挂载 listener 前会过滤不在白名单里的项；AST validator 会**硬拒**不在白名单中的 phase——保存直接失败并给出错误信息。



<!-- prompt-sync:begin id=action-hook-phases -->
- `before`
- `during`
- `immediatelyAfter`
- `after`
- `computeCosts`
- `computeArgs`
- `computeChoiceCandidates`
- `computeReplace`
- `isDoable`
- `anytime`
- `computeExchanges`
<!-- prompt-sync:end id=action-hook-phases -->




Listener 的 `zones`（默认 played）、`mandatory`、`preScoring`、`replacesTurn`、`blockedAnytimeInteractionKinds` 均保留。省略 `cardIds` / `actions` / `phases` 会显式绑定本卡和以上集合；不会变成全局或未来新增机制的通配 listener。`anytime` 和 `compute-exchanges` 是调度器的查询身份，只能用于监听，不能 dispatch 为 leaf。`computeExchanges` 已开放；返回受同一兑换限制的 `extraExchanges`。不支持的 listener 字段明确报错。

### 3.3 费用机制边界

对已有行动支付的动态贡献，通过 `computeCosts` listener 的 handler 返回值表达。声明式费用、兑换和 modifier 放在 `CARD_DEF.meta`：

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

不要生成 `deriveCardCostCandidate`、`cardCostCandidateMandatory`、`getBaseCosts` 或 `CARD_IMPL.modifiers`：这些官方卡回调没有已开放的沙盒调用或注册契约。声明式 `CARD_DEF.meta.modifier` / `modifiers` 和 `exchanges` 会进入原生注册与结算路径，不能和 `CARD_IMPL` 字段混淆。`computeExchanges` 已开放并返回受同一兑换限制的 `extraExchanges`；省略过滤时也显式包含该查询身份。

### 3.4 `scope` 取值

`sandboxListenerScopes` 限制：



<!-- prompt-sync:begin id=listener-scopes -->
- `player`
- `opponent`
- `any`
<!-- prompt-sync:end id=listener-scopes -->



不在列表里的 `scope` 会被明确拒绝；省略时默认 `player`。

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

AST validator 还会检查 `CARD_IMPL.effect` 中的键是否在 `cardEffectHooks` + meta 字段白名单中，以及 `CARD_IMPL.listeners[].phases` 中的值是否在 `actionHookPhases` 白名单中。**不在白名单中的 hook/phase 会导致编译失败**（hard-fail），而非静默丢弃。

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

`CARD_IMPL.listeners[].actions` 接受的字符串是**触发行动的内部 leaf actionId**（如 `place-farmer`、`gain`、`collect`），**不是**行动空间 ID（如 `forest`、`clay-pit`、`wish-children`）。完整列表由 `shared/custom-code/sandbox-listener-actions.ts` 定义，并进入已部署沙盒契约。

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

`optional` 是节点上的布尔字段，不是另一种节点类型。返回流程的 effect hook 直接返回 flow；listener 返回 `{ flow, sourceCard: CARD_ID }`（或其文档规定的查询结果）。

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
- `plow`
- `sow`
- `fence`
- `stables`
- `construct`
- `renovate-house`
- `improvement`
- `occupation`
- `family-growth`
- `breed`
- `reap`
- `exchange`
- `set-first-player`
- `selection`
- `emit-choice`
- `reorganize`
<!-- prompt-sync:end id=action-ids -->

| actionId                   | 关键约束                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `bonus-vp`                 | **固定 +1 VP，不接受 `amount` / `vp` 参数**。要 N 分就把 N 个 leaf 串入 seq                       |
| `store-on-card`            | params 形如 `{ wood: 1, clay: 2 }`，写入 `player.cardStates[CARD_ID].counters`         |
| `take-from-card`           | params 形如 `{ grain: 1 }`，从 `player.cardStates[CARD_ID].counters` 扣，扣完 leaf 就 fail |
| `gain`                     | params 形如 `{ food: 2, wood: 1 }`                                                  |
| `pay`                      | 同上，扣资源                                                                            |
| `bake-bread`               | 启动一段烤面包子流程                                                                        |
| `push-to-card-stack`       | 向 `player.cardStates[CARD_ID].stack` 推入一项                                         |
| `special-effect`           | **沙盒 cardStates mutation 入口**（Sprint 6a/6b）。`params: { kind: 'set-flag' \| 'set-infobox' \| 'set-counter' \| 'increment-counter' \| 'set-extra-data' \| 'increment-extra-data', ... }`。取代旧的 `flag-card` / `unflag-card` / `set-card-infobox` / `clear-card-infobox` / `write-card-extra-data` 5 个 leaf。详见 §6.1；未列出的仓库内部 kind 不属于 Workshop 合约。 |
| `future-meeples`           | 沙箱专用：用 `params.__futureMeepleRequest` 预放未来回合资源（见 §5.7）                            |

> Sprint 6b（2026-04-30）已删除 5 个独立 mutation actionId（`flag-card` / `unflag-card` / `set-card-infobox` / `clear-card-infobox` / `write-card-extra-data`）+ 3 个 dead actionId（`hold-worker-on-card` / `release-worker-from-card` / `gain-other-players`）。统一使用 `special-effect` discriminated-union。`check-prompt-sync` 在 CI 校验 prompt 只暴露白名单内 actionId；白名单外的 actionId 不会出现在 prompt 中，沙盒卡牌不应使用——改用 `special-effect`。


新增普通农场行动保留原生邻接、组件、支付和前提。plow、sow、fence、stables、construct 和 renovate-house 的限制放在叶子顶层 `actionContext`；原生结算不读取 `params.actionContext`，因此该嵌套形式明确拒绝。`occupation` 的 `allowedCards` / `exactCost` 放在 params；`improvement` 的 `types` / `allowedPurchases` 也放在 params，限制同时覆盖主要、小发展专用和注入候选；`minimumResourcesPaid` 放在叶子顶层的 `actionContext`，不能放入 `params.actionContext`；它约束实际支付，包含资源替换。农场选择走 `commitSelectionChoice`，不得用内部 `farmPayload` 绕过。`selection` 仅开放明确的 farm-position 候选。`reap` 必须显式给 `actionContext.trigger: {phase: 'private-field-phase', cardId: CARD_ID}`；`breed` 来源为本卡；`reorganize` 仅普通 anytime。`fencePolicy` 仅开放自有围栏的 `segmentBounds`（fence/total）、`newPastureBounds` 和 `cancelPolicy`。具体允许字段由站点契约的 `paramKeys` / `contextKeys` 提供，动态嵌套 flow、listener 覆盖与声明式兑换也执行相同准入。指定目标的子树必须引用当前游戏中的玩家；必选 choice 组合必须含有子节点，多选声明必须使用字符串前缀与有序的非负整数上下限。多选下限按不同的可用值计数，可选值必须非空且不含逗号。农场候选必须为实际执行玩家农场上的不同整数坐标，包含已有农场扩展，且最低选择数必须可达。发展类型限制必须为非空的 major/minor 列表；畜栏和兑换次数上限为非负整数。围栏、牧场数量限制必须使用有序整数上下限。普通选择必须有可用选项；多选下限为零时仍可提交空选择。职业候选限制与卡牌堆项保持声明的字符串形态。

自定义 `pay` 不允许填写 `playedCards`、`candidateMetadataByFeeIndex`、`costResourceRemovals`，卡牌归属和支付归因由权威引擎产生。直接自定义 `pay.cost.cards` 延期，等待宿主提供真实卡牌候选适配；`CARD_DEF.meta.cost.cards` 的声明式购买退卡费用继续使用原生归属路径。选择项不能冒充另一张来源卡。计分查询在进入原生消费者前校验数组、玩家身份、资源费用和有限分数；格式错误记录为卡牌警告。bonus 与 trade modifier 复用原生声明不变量；虚拟支付来源 key 必须属于本卡，支付选择和前缀必须为字符串。结构化职业/发展前提使用有序的非负整数上下限。

Listener 的 `flow` 和 `followUpActions` 默认由 `context.effectPlayer` 执行；替代行动的 `alternativeFlow`、`actionId` 与当前行动的 `extraData` 使用 `context.player`。农场候选校验遵循原生执行玩家，包括指定目标后的玩家切换。

付款 trade 不开放仅供兑换使用的 `triggers`、`fromFarmyard`、`blockedAnytimeInteractionKinds`；这些字段仅允许用于兑换声明。兑换 max 与复合费用 nb 为非负整数。bonus 与 modifier 的 conditions 只允许数值形式的 minNumRooms、houseTypeWood / houseTypeClay / houseTypeStone，其中房间下限为非负整数。印刷 vp 必须是有限数值。范围式未来请求必须包含资源对象，回合与次数为整数。播种下限在实际执行前按原生投影、逻辑田组和可用种子校验，此时此前行动和 before 效果已完成；原生播种结算即使声明零下限也至少需要选择一块田；不可达的显式边界会拒绝并回滚当前命令，不创建无法提交的等待交互。

资源数量、支付数量和未来资源数量必须为安全整数，费用 delta 仍允许有符号的整数折扣。文本 prerequisite 必须是字符串。gain 的接收者/付款者 ID 必须存在于本局，recipientMode 只允许 self 或 others。listener 的 doable/countCardUse/decline 必须是布尔值。额外房间容量、剩余额外机会和繁殖数量必须为非负整数。付款 trade 校验 scope、replaceUpTo、minCost/maxCost 及分组次数，并复用 modifier 的公开声明不变量。

虚拟支付 provider 的可用数量为 0 到 511 的整数，覆盖/支付比例为正整数。所有 cover/provider 的 `(floor(available / paymentAmount) + 1)` 保守乘积不得超过 512；原生枚举前也对合并后的完整列表检查同一预算，不能通过拆分贡献绕过。可用性查询将超预算行动视为不可用，实际执行拒绝并回滚命令，不静默截断候选。首版明确排除更大的虚拟支付搜索，等待宿主具备另行设计的有界算法。

卡牌文本元数据（包括 players）为字符串，描述/规则行为字符串数组，能力标志为布尔值，回合/卡牌编号为非负整数。locale 条目开放相同的可选文本字段。人数文本沿用原生解释方式，准入不另造格式。remove-resource modifier 仅允许 type/cardId/appliesTo/resources，不可声明原生会忽略的 trade/bonus 字段或条件。pay.costType 使用八种原生成本类别。未来请求的接收者必须存在。动物分区容量/数量、独占上限和牧场索引为非负整数；农场坐标为可带负号的安全整数。flow 提示/选择标签及 option ID 为字符串，标签参数为对象；发出的选择提示同样校验文本和参数类型。

provider key 必须各不相同，来源行动格 ID 不能为空。原生候选在最优筛选和菜单展示前按当前来源库存过滤，所有消费同一资源池的虚拟 key 合计需求。provider 费用不使用玩家/费用缓存，实际消费复查同一判断。宿主记录每个已发菜单值对应的付款和消费来源，包括没有 provider 的菜单。提交时原样使用菜单值；付款已不可用时拒绝并回滚命令，其他仍有效的已发值在 provider 新增或撤回后仍可结算。宿主管理的 issuedPaymentChoices 上下文不是自定义 flow 字段，不会换扣另一付款方案。

含 provider 的必需 `pay` 按当前来源库存没有可行付款时，执行拒绝并回滚命令，不能留下未付款的阻塞流程，也不能执行后续奖励。

选择项和 leaf 的 effectPreview 按原生九种判别结构校验：fieldContents、cardScore、actionSpace、futureOffers、resourceMovement、futureSchedule、resourceExchange、payment、text。descriptionPreview 为 action 或递归校验的 group。必需资源对象、位置、条目、行动、条件、标签及基础类型在发送给任何观看者前校验；沿用数组和深度上限。这些是展示声明，不是可执行的规则回调。

组合 `mode` 仅支持 `parallel`；`triggerSelectOnce` 必须配合 `mode: 'trigger-select'`。每个选择 value 必须不同，包括禁用项和多个 listener 合并后的最终菜单；重复值拒绝命令并完整回滚。bonus 的 `optional` 只放在外层，不能放在 `choices` 各项；每项必须含 `discount`，保留原生 flags、sources、conditions 和费用上下限。

元数据 altCosts 的每项必须是平坦支付资源对象；returnCards 必须是字符串数组，要求退回真实持有的卡并支付牌面费用；cost.cards 在 required 不为 true 时是替代付款路径；必需退卡费用必须含非空列表，非必需的空列表仍可按资源付款。remove-resource modifier 需要非空的支持资源数组。复合 resourceReserve 声明不重复的资源名及非负整数 minimum，不能重复计入同一种剩余资源。兑换没有正输入时必须提供非负整数 max。breed 的选择必须是本局已启用且不重复的动物；动物分区的所有准入可选数据字段在原生安置前校验。声明的 `allowedAnimalTypes` 白名单与本局物种、固定 `allowedAnimalType` 和 `getInvalidAnimals` 取交集；空名单禁止放入任何动物。权威重组、恢复、可容纳搜索和预填使用同一白名单，UI 接收最终可用物种。

未来回合调度仅开放普通资源和 field/stable；不开放调度条目的 `actionContext` 或原生 `sourceSummary`。`special-effect` 另外开放 `pop-card-stack-top`、`set-infobox(text)`、`remove-future-meeples(rounds?)`，取消只作用于本卡及效果玩家。其他 kind 均明确拒绝。

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

// player.cardStates[sourceCard].extraData[key] += amount
{ kind: 'increment-extra-data', key: 'used', amount: 1 }
```

仓库内部还可能使用非沙盒 kind（例如 `emit-card-triggered` 用于写入可见卡牌触发事件日志）。这些 kind 不属于 Workshop 合约，LLM prompt 也不会推荐。

跨玩家 flow 使用已准入的顶层 `targetPlayerId`，指定已有玩家。`special-effect` 的 actionContext 不开放目标覆盖，来源仍绑定本卡。`set-private-data` 属于原生能力；工坊尚未开放其私有观察生命周期，会明确拒绝。

> **`card_*` 前缀 ad-hoc actions**：repo-internal 单卡专用 actions（如 `card_E112_GrainThief_protect`）通过 `registerAdHocAction()` 注册。Workshop 没有对应注册接口，生成卡不得依赖另一张卡的原生专用行动。源码校验与动态执行均拒绝未准入的 leaf，包括 `card_*` 行动。某个行动出现在原生 registry 中，并不代表工坊支持它，应使用站点提供的能力契约。


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

浏览器本地执行器（`client/local-sandbox/browser-executor.ts`，`VITE_SANDBOX_EXECUTOR=browser` 时的工坊试玩路径）在浏览器里跑用户自己的代码（"用户只能攻击自己"），不进 isolate。**注入清单与服务端 `server/custom-code/engine.ts` 完全一致**：

- 两种执行器共用 `shared/custom-code/sandbox-declarations.ts` 的 MinorImprovement/Occupation 构造器规范化、简化 console，及 `shared/custom-code/injected-helpers.ts` 中 §1 的所有 helper。仅精确 `{occupation: n}` 且 n 为非负安全整数时，在准入前转换为文本前提及数值下限；已有显式数值边界保留。直接 metadata 的 prerequisite 必须是字符串；数组、空对象、未知字段和小数计数仍拒绝。
- 同样对输入做 `JSON.parse(JSON.stringify(...))` 拷贝、输出 JSON round-trip
- 同样按本文件 §3 的准入定义校验 hook、phase 和动态输出（复用 shared 的同一组函数）
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

---

### 9.3 能力补齐评审（2026-10-08）

项目 owner 已确认扩充适合的真实工坊能力，并让生成、校验与执行使用同一开放范围，见 [ADR 0025](adr/0025-workshop-capability-contract-is-an-execution-boundary.md)。本节记录 c136edc83 的补齐前审计与适配决定；§9.4 是本轮实现，其余项目仍为延期设计，不扩大已部署范围。

| 已审计机制 | 当前限制 | 建议处理方式及原因 |
|---|---|---|
| `beforeEndGameScope`、`beforeEndGameMandatory` | 已提取并执行，但没有写入模型契约 | 补齐字段以及卡主/全玩家、强制执行语义。 |
| Listener `zones`、`mandatory`、`preScoring`、`replacesTurn`、`blockedAnytimeInteractionKinds` | 源码接受字段，但 manifest 会丢弃 | 在两种 executor 和注册链路保留声明式数据；验证手牌触发、计分窗口、强制效果与回合完成。 |
| 声明式 `modifier` / `modifiers` 和 `exchanges` | `CARD_DEF.meta` 已支持；文档将其与不支持的实现字段混淆 | 明确真实位置、参数结构和结算限制。`reward` 元数据当前没有消费者；即时收益应走 `onBuy` flow。 |
| `computeExchanges` | 显式 phase 被拒绝；未过滤 listener 仍能进入 | 正式准入并校验纯查询及兑换窗口，收紧省略 listener 过滤导致的隐式扩面。 |
| `computeResourceCommitments`、`countExtraTurns`、`enforceReorganizeOnLastHarvest` | 原生查询没有进入沙盒 hook 集合 | 适合 JSON 查询；约束返回值，并保持 `countExtraTurns` 与 `contributeExtraTurn` 配对。资源承诺影响支付准入，属于规则能力。 |
| 繁殖阈值/数量、动物分数修正、共享动物区 | 原生纯查询需要四或五个参数；executor 只保留前三个 | 补齐可序列化参数与返回契约。分数修正目前只在 Farmers of the Moor 马计分中有消费者，不承诺全部动物均适用。 |
| 已开放的 `resolveChoice`、`getInvalidAnimals`、`onBuy` 上下文 | 第四个参数丢失；上下文函数在 JSON 中被移除 | 透传可序列化上下文与状态；受保护观察/事件回调需要独立的宿主协议，不能直接暴露函数。 |
| `projectInteractionRequest` | 缺少四参数桥接；原生 hook 可改变交互 | 需要受限投影契约，不得凭返回对象新增结算命令或绕过后端选项校验。 |
| 标准行动及文档中的九个 ID | 自定义返回 flow 当前可以使用其他已注册行动 | 逐项审出完整普通行动语义，再在来源边界校验自定义 flow、嵌套节点和参数分支。引擎生成的可信内部流程仍按原生契约执行。 |
| `special-effect` | 一个文档行动覆盖 29 个原生 `kind`；契约只描述五个局部状态分支 | 按参数分支分别准入。局部计数、flag、数据和展示，与组件供给、农场写入、全局行动格转移及内部清理分开审定。 |

下列原生接口或控制声明不能仅复制名字就开放：

| 接口或声明 | 不适合直接开放的原因 | 牌面机制的替代方向 |
|---|---|---|
| `computePastureCapacityModifiers` | 返回含 `appliesTo` / `apply` 函数，JSON 会将它们移除 | 可序列化容量贡献或受限的逐牧场查询，由宿主结算。 |
| `consumeAnimalPayment`、`onAnimalRemoved` | 原生实现原地修改动物/卡牌状态；仅复制返回值会造成已付款或已清理的假象 | 明确命名的后端支付和标记结算操作。 |
| `onComputeSowableFields` + `onSowExtraField` | 仅开放候选查询不能完成播种；原生结算会修改作物存储 | 将候选、作物支付、逻辑田归属与结算成套设计。 |
| `getSpecialStablePositions` + `applySpecialStable` + `returnSpecialStable` | 原生写入会更新位置、一次性标记和组件供给，沙盒副本无法持久化 | 用一个通用建造/归还机制覆盖占地、供给、卡牌状态及事件/日志语义。 |
| `allowAnytimeReentry` | 会关闭正在执行的同一能力的递归保护 | 在明确重入次数、完成条件和恢复设计前保留保护。 |
| `monotoneFenceCost` | 未证明的优化声明可能剪掉合法围栏方案 | 保留原生可信声明，或从受限费用描述推导保证。 |
| `deriveCardCostCandidate`、`cardCostCandidateMandatory` | 需要独立候选回调、强制饱和与有界闭包遍历，普通 listener handler 无法提供 | 独立评审受限的费用候选适配切片。 |

原生签名不适合跨隔离边界，不代表对应牌面规则永久不能开发；应先设计通用结算替代方案再准入。规则行为仍由固定场景和 Session 断言验收，能力准入检查不另做行为判断器。

普通 `CARD_DEF.meta.cardField` 也不能只开放元数据：原生 `makeCardFieldImpl` 同时登记候选、卡内作物写入与全局定义；单独声明在沙盒不能播种，直接复用全局登记还会破坏同 ID 卡牌的会话隔离。该声明与额外播种配对一起延期，需要会话局部的声明式适配及生成到正式 Card Source 后的行为一致性，当前明确拒绝。原生目录身份、房屋 / 卡牌持有与 FOTM 专用元数据开关也不在本轮开放集合内，其相关目录消费者和生命周期路径需分别验收；站点契约的 `cardMetadataKeys` 给出精确集合。

### 9.4 首批实现范围与固定验收

Owner 已选择本轮复用现有引擎能可靠处理的机制。以下具体范围与固定测试说明已在编码前确认。本轮现已开放 45 个 hooks、11 个 phases、31 个 listener 身份（含两个查询身份）、25 个 leaf actions、8 个本地 special-effect kinds。

- 新增七个纯查询：`computeResourceCommitments`、`countExtraTurns`、`enforceReorganizeOnLastHarvest`、`computeBreedThreshold`、`computeBreedableAnimalCount`、`computeAnimalScoreAdjustment`、`onComputeSharedAnimalZones`，hook 集合变为 45 个。两种 executor 透传全部可序列化参数，包括第四、第五参数；宿主回调仍不可调用。已有 `resolveChoice`、`getInvalidAnimals`、`onBuy` 补齐缺失的可序列化上下文。明确分数修正目前只适用于马计分。
- 保留 effect 元数据 `handHooks`、`beforeEndGameScope`、`beforeEndGameMandatory`、`preHarvestGoodsWanted`、`preHarvestGoodsWantedBeforeReap`、`maySkipHarvestFieldPhase`、`extraTurnBeforeWorkers`；保留 listener `zones`、`mandatory`、`preScoring`、`replacesTurn`、`blockedAnytimeInteractionKinds`。不支持的行为声明明确报错，不再丢弃。说明现有声明式卡牌前提、费用修正、兑换在元数据中的真实位置；卡牌田的声明与结算一起延期。
- 正式开放 `computeExchanges`，phase 变为 11 种；监听行动补齐对应已准入普通行动以及支付/卡牌存储事件。省略过滤时使用明确的支持集合，不能自动包含所有将来的原生行动/phase；scope 与卡牌归属仍绑定本卡。
- 保留原九个 leaf 行动，新增普通形式的 `plow`、`sow`、`fence`、`stables`、`construct`、`renovate-house`、`improvement`、`occupation`、`family-growth`、`breed`、`reap`、`exchange`、`set-first-player`、`selection`、`emit-choice`、`reorganize`，共 25 个 ID。建造和购买使用正常后端支付、供给和前提校验。选择器仅支持明确的农场坐标候选，不开放原生选择回调或私有手牌后续处理。卡牌触发的繁殖、收割和动物重组不能冒充 Harvest 或回合结束生命周期，仍遵守普通原生约束。
- `special-effect` 精确开放八个分支：`increment-counter`、`set-counter`、`set-flag`、`increment-extra-data`、`set-extra-data`、`pop-card-stack-top`、`set-infobox`、`remove-future-meeples`。局部写入与取消排程绑定本卡及有权执行效果的玩家。其他分支明确列为缺口，包括私有观察写入和内部生命周期清理。
- 可静态检查的源码和运行时自定义返回值共用同一描述，覆盖嵌套 flow、元数据触发操作和参数分支。约束放在自定义值进入宿主的位置，引擎产生的内部子流程保留原生权限。浏览器本地 executor 与服务端一致；继续使用现有两个资料工具，以及用户浏览器直连模型的架构。

延期项目包括 9.3 节的原生写入/回调接口组合、受限交互投影、派生成本回调、重入与优化声明，以及 `place-farmer`。最后一项结合行动格展开、工人供给和轮转，普通放工与无工人/临时工人变体需要单独审完整链路并做固定 Session 验收；所有延期项目都不能通过未声明路径绕过。

**测试设计：**本轮是通用沙盒边界适配，不新增单卡核心分支。机械准入/序列化复用现有 validator/executor 测试；简单局部效果直接调用公开 effect 做行为测试；支付、选择、阶段、跨玩家分区和多步 flow 使用固定 `GameSession` 场景。每个 Session 从新的 2 人游戏（seed 42）开始，固定双方 hand（无关时用 `['__test_placeholder__']`），将来源自定义卡放在明确的手牌/已打出区域，初始 `cardStates` 为空、农场/工人供给正常，除场景声明外行动格不被占用。逐场景设置资源与必要版图/阶段事实，不依赖随机发牌。

| 固定场景 | 状态准备与公开交互序列 | 必须断言及不触发情况 |
|---|---|---|
| 手牌/已打出 listener 与归属 | P0 手持本卡，Forest 上有 3 木；执行 `takeAction(0, 'forest')` 并明确完成选择；再分别设置卡牌已打出或仅由 P1 持有 | 资源 delta、来源事件/日志；只在声明 zone/scope 触发，不重复发动。 |
| 阶段元数据与计分窗口 | 第 14 轮、工人已用尽、固定已打出卡；终局收益声明强制/全玩家；准备 1 木和登记的兑换；执行 `invokeAfterRoundEnd`、激活选择，然后在计分窗口调用 `takeAnytimeAction` / `resolveChoice` | 正确目标资源、强制/跳过可用性、声明的计分前能力与费用、最终 `gameOver`/分数；没有卡或交互类型被禁止时不提供能力。 |
| 查询完整参数 | 准备固定动物数量/分区与本卡计数；在 Session context 调公开繁殖/分区聚合器，再执行对应真实繁殖/重组命令 | 第四/第五参数能区分来源、已有数量、卡主与动物主人；实际动物总量和 pending 安置一致；无关动物/来源不变，副本写入不修改输入状态。 |
| 资源承诺与多次机会 | P0 有 2 食物，本卡条件成立时保留 2 食物；尝试付 1 食物，解除条件后重试；另设工人用尽且提供两次机会的卡 | 承诺不满足时状态/资源/日志不变；允许后只结算一次；次数机会只消耗一次，不吞掉或凭空生成另一玩家回合。 |
| 农场与购买 | 准备种子、建筑资源、合法相邻空格与明确可买手牌；从自定义 flow 进入各已准入行动，明确提交 `commitSelectionChoice`、支付 `resolveChoice` 与选卡 | 田/作物/房间/畜栏/牧场、费用、组件余量、hand/played、pending 完成与日志；占用/不相邻、资源/组件不足、前提不满足时拒绝且无部分写入。 |
| 私有田间阶段/繁殖与普通重组 | 固定作物堆、两只动物与足够容纳空间；运行自定义额外收割/繁殖 flow，并提交普通动物安置 | 正确作物消耗、资源/动物 delta 与安置总数，不伪造正式 Harvest 汇总或生命周期；非法安置被拒绝。 |
| 选择、选择器和兑换 | 发出本卡选择，用 `resolveChoice` 提交明确值；用 `commitSelectionChoice` 选择明确农场格，再在后续 flow 读取已存结果；执行指定已登记兑换 | 选择结果、本卡数据、准确支付/收益；未知选项/格子、内部选择回调和未登记兑换副作用被拒绝。 |
| 局部状态与排程 | 固定本卡及另一卡的计数/stack/排程，逐项调用局部公开 effect；取消指定未来回合，并恢复快照 | 准确的计数/flag/stack/infobox delta 和取消排程；其他卡/玩家及未指定回合不变，恢复后状态一致。 |
| 封闭能力边界 | 固定非法声明与运行时生成的嵌套 flow，提交现有 validator 与两种 executor | 不支持的字段、phase/action、外卡局部来源 ID、禁止参数分支明确失败；不能通过省略过滤或声明式元数据隐式扩面。 |

保留所有现有固定 LLM fixture 与历史回放；将精确规则场景补进已有测试设施，不新建行为判断器，不提交运行结果 JSON。验证包含 executor parity、固定 LLM 测试、本地真实浏览器契约/校验流程、`test:fast`、lint 与 build；确定性验收路径不联系模型 provider。

### 9.5 固定范围的完整对应审计与集中验收（2026-10-09）

审计基线为 main `8fa967bd4` 上的 `53e8585a7`。逐项追踪部署契约 → 源码准入 → 共享 manifest → 服务端 Worker / 浏览器执行器 → 原生消费者 → 固定验收。覆盖 45 个 hooks、7 个 effect 元数据、11 个 phases、31 个监听身份、25 个 actions、8 个局部修改、32 个卡牌元数据字段、全部 13 个 leaf / 12 个 composite 字段、2 个公共 context 字段，以及每个行动的 params/context 槽位。基线共 186 个外层字段槽位，另审嵌套付款、选择、预览、排程、围栏结构。这是固定范围的对应审计，不代表证明了任意生成卡或 31 × 11 的每种组合。

**冻结决定：**保留既有 hook / action / 身份集合及可靠原生规则。移除 `order` 后 listener 有 9 个准入字段，`handler` 必须存在且可调用。`listener.id` 也拒绝：宿主固定 `${CARD_ID}:listener:${index}` 身份。可选 `effect.id` 必须等于 CARD_ID。非元数据 hook 必须是函数，handHooks 每项必须有实现；终局元数据必须配 onBeforeEndGame，countExtraTurns / extraTurnBeforeWorkers 必须配 contributeExtraTurn。两组收获需求及 maySkipHarvestFieldPhase 保持独立的准备声明；后者改变保证收获的估计，不授予任意跳收获能力。

#### Hook 与查询对应

全部 45 个名字继续由英文 §3.1 与部署的穷尽 map 维护，均有原生消费者，不因缺专门测试而删除。

| 范围 | 真实消费者与限制 | 固定行为证据 |
|---|---|---|
| 24 个普通 flow 阶段 hook（含 onBuy） | stage-dispatch 与 session-core 阶段续跑；onBuy 走原生购卡激活，保留卡主/目标及手牌身份 | 购卡/onBuy，加完整 14 轮两人游戏记录实际阶段执行和相对顺序；手牌/已打出另验 |
| onBeforePlayerTurn | card-effects → 工作轮转；只返回 skipTurn 布尔，不建 flow/pending | 对手真实行动后跳过卡主，发出 turn.skipped，并保留卡主未使用工人 |
| resolveChoice / contributeExtraTurn / countExtraTurns | 原生选择与额外机会激活；卡维护剩余次数，宿主另减 skip / 显式消费次数 | 真实选择及正常轮转中恰好两次额外机会，不新增计数协议 |
| 普通 / 付费 / 跨玩家计分 | domain/scoring 与原生 bonus solver | 实际计分类别、成本分配、共享分接收者及不修改资源；错误查询中性值另验 |
| 房间容量、繁殖优先级/门槛/数量、动物计分 | card-effects collector → 成长/繁殖/计分 | 实际成长/繁殖、来源敏感的第4/5参数、公开优先级归一化、FOM 马计分；门槛归一到1..2，优先级为 max(0,floor(value)) |
| 自有/共享动物区与非法动物 | animal-zones；只新增区，区主/动物主人不同 | 真实安置/重组/存储、共享归属、四参数限制；白名单与原生安置限制取交集 |
| 锁定格、规则贡献 | 原生农场几何、组件余量、空地扣分 | 锁格拒绝/释放、供给预留与计分贡献，不直接写农场 |
| 资源承诺与最后收获重组 | 原生付款门禁与正式第14轮繁殖/重组 | 付款拒绝/释放，最后收获无新生也重组；私有繁殖不冒充收获 |
| 特殊畜栏位置与状态展示 | 权威公共投影，只作展示 | 坐标/公共字段及快照隔离，不授予建造/退还畜栏或写规则能力 |

onBeforeStartOfTurn 属于新一轮准备，并非每次个人轮转。查询会为预览和结算重复调用，修改 JSON 输入不生效。权威命令外错误给出警告和规定中性值；命令内每次调用失败都检测并回滚。失败事件独立于显示警告去重，已记录的相同错误不能让下一命令成功空跑。生产 Worker 与浏览器共用完整 listener 返回校验，包含费用归因匹配。

#### Listener 返回字段与适用范围

部署 phase map 持有 resultKeys，运行准入读取同一 map。sourceCard 仅是本卡来源标记，不能覆写行动者或卡主。

| Phase | 消费字段（另可有 sourceCard） | 适用范围 |
|---|---|---|
| before / during / immediatelyAfter / after | flow、followUpActions、countCardUse、doable | 普通反应激活；doable 为预览信号。during 在执行后追加反应，包含 XOR 与真实付款选择完成，不改已执行参数 |
| before / place-farmer 专用 collector | 仅 flow | 未显式 target 时继承匹配卡主；跨玩家交给正常 session driver / 切人。这条路径没有独立 mandatory / count / follow-up 激活 |
| 逐作物 immediatelyAfter / reap collector | 仅 flow | crop/amount 事件；普通引擎完成 reap 仍消费普通反应字段 |
| computeCosts | costs、costAttribution、trades、bonuses、paymentResourceProviders | 纯查询，须由原生定价消费者落到账单；整数量差必须有匹配本卡归因 |
| computeArgs | extraOptions | 没有原生 base 候选构造器的普通 choice 请求，以及 occupied-placement 查询；农场位置/selection/动物请求不消费参数覆写 |
| computeChoiceCandidates | extraOptions | 原生 base 选择及改良候选 collector |
| computeReplace | actionId、decline、alternativeFlow | 继承原 params/context，不开放 extraData 覆写；alternativeFlow 要求 decline:true，按实际行动者校验 |
| isDoable | doable；仅职业候选可 reserveResources | false veto 优先于 true，不绕过正式结算 |
| anytime | flow、labelKey、labelParams | 身份 anytime，卡主必须是当前玩家；scope:opponent 不提供对手能力 |
| computeExchanges | extraExchanges | 身份 compute-exchanges，配方由正式兑换/付款结算 |

mandatory 只用于普通反应激活；preScoring / replacesTurn / blockedAnytimeInteractionKinds 必须用于 anytime 发现。省略过滤仍绑定明确集合和本卡。31 个身份包括两个纯查询身份、普通引擎行动及仅可监听的原生 collect / receive / place-farmer / wish-children；某身份支持某 phase 不代表任意组合都适用。部署描述明确这些差异，不承诺通用参数修改。

#### 行动与嵌套参数闭合

所有精确 params/context keys 仍由 sandbox-action-ids.ts 部署，英文 §6 / §6.1 分别列全部25行动与8种局部修改。本轮统一收口：

| 范围 | 冻结边界与保留的原生语义 |
|---|---|
| Flow 外壳/农场 | 六种农场行动只读顶层 actionContext；mode 仅 parallel，one-shot 须 trigger-select。归属、optional、组件、几何、pending、付款保留原生规则 |
| ExactCost / 普通付款 | ExactCost 仅真实资源加 max，拒绝会被忽略的组件/虚拟键；ComplexCost 保留 fee/fees/unitFee 优先级、分组与折扣 |
| 费用身份/控制 | feeIdentities 是与实际 fee 行对齐的非负安全整数数组，重复值有意归为同一路径；付款控制为布尔。退卡资格归宿主，cards.type 是历史标注，不是附加限制 |
| 付款展开 | provider 合并后乘积仍≤512；unit/action trade、bonus 与最终支配筛选共用100000步宿主预算；超限整次拒绝，不截候选，巨大单位循环/兑换展开前就检查 |
| 资源域 | 结构识别13种名称；非零 horse/fuel 须 FOM 资源槽。共享 gain/trade/future/payment 消费者在修改前拒绝不适用资源，0值不启用扩展 |
| 兑换 | catalog 配方保留发现窗口/限次，tradeIds 走明确指定路径；directTrade 只作一次即时 from/to 兑换，可带 fromFarmyard/source/sourceId，拒绝 catalog max/窗口及混用过滤/次数限制 |
| 选择/预览 | 自定义数组和最终菜单 value 唯一，保留原生 first-wins 合并；options 非空，零下限可提交实际候选的空子集。预览只是显示数据 |
| 繁殖/收割/重组 | leaf 来源绑定私有繁殖，包含 follow-up；正式 Harvest 仍由宿主控制。动物白名单约束安置/恢复，不改原生按总容量繁殖；reap 为 private-field-phase，可选 actionId 为字符串 |
| 未来排程 | 当前玩家、本卡 entries；资源/field/stable 及匹配 roomType 时原生加一房；不开 actionContext。过滤、entries优先、精确取消保留原生语义 |
| 局部状态 | 本卡/效果玩家；数字增加要求现值为有限数字（缺失视作0）且结果有限；set-extra-data 可存任意 JSON，set-counter 保留非负归一化 |
| 注入 helper | 两执行器同一正文；payLeaf 的 cost 是完整 params，复杂费用写 payLeaf({cardId:CARD_ID,cost:{cost:complexCost}})；读 stack/extraData 不写宿主，getCardDefinition 始终为 null |

#### 卡牌元数据与参考资料边界

| 全部准入元数据分组 | 实际意义与限制 |
|---|---|
| id / name / deck / number / category / desc / rules / artUrl / locales / card_type / playerActionCardType / implemented | 身份/展示/catalog；CUSTOM deck、number 和主卡类型由工坊归一化，标签或分类不注册规则行动。CARD_DEF 外壳只允许 cardType/meta 与 minor/occupation 类型 |
| cost / altCosts / returnCards / passing / providesOccupation / vp | 原生小发展购卡/转手/职业数量/印刷分；职业学费或 exact cost 独立，altCosts/passing/小发展印刷分不是通用职业能力 |
| prerequisite / occupationPrerequisites / improvementPrerequisites / maxRound / players | 原生资格 parser/filter；数字 bounds 执行，任意文字或未知人数串不是新增条件，不用杜撰文本表达未支持规则 |
| exchanges / modifier / modifiers / isCookery / isBaking | 原生配方与活动付款修饰；标记本身不制造配方 |
| isField / providesField / extraVp / evenMoreSet | 标记/历史数据，不能注册可播种田或自动加分；Card Field 与权威作物结算仍延期 |

参考工具与凭据架构不变：search_references 搜允许路径和已读正文；read_reference 读取每次尝试固定的最新 main，校验 blob 与行范围。模型凭据只在浏览器直连 provider；后端资料元数据用项目 GitHub 凭据，不接触用户 LLM Token。更新的 GitHub 代码不能扩大已部署执行范围。

**集中验收：**沿用 validator/executor parity 查机械准入；固定两人 Session 验付款、选择、卡主切换、延迟奖励、共享动物、局部状态、错误回滚、额外机会和完整生命周期。公开隔离查询验真实计分/供给/安置消费者，浏览器 E2E 单验渲染交互。冻结批次覆盖非法声明、动态嵌套结果、重复错误、直接/XOR/付款续跑及扩展模式对照。保留既有 LLM cases 和 golden；回放仅作历史回归，不代表新生成质量或模型准入。本次审计不需要付费模型调用或单独行为判定程序。

## 10. 历史


| 日期         | 变更                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-04 | 修正跨全部改良候选折扣为 mandatory capped bonus；补齐并收窄 `handHooks` manifest、要求 effect 使用无 accessor 的直接对象字面量并在宿主侧过滤、统一 `positionKey({row,col})`，移除无法完整结算的 Workshop candidate/settlement hook；新增语义 contract 与 M11 live/record/replay 守卫。 |
| 2026-04-30 | 双轨 scoring hook 重构：删除 `computePostScore` / `scoringPriority` / `ctx.reserved`；新增 `computeCostedBonus` 走 Pareto 求解器。详见 `(spec/plan 已归档，见 git history)`。|
| 2026-04-24 | 修正 `computeBonusScore` / `computePostScore` / `computeSharedPostScore` 签名（实为 `=> number` / `=> Array<{playerId,score}>`，非 `{score,label}`）；新增 §5.5 listener `actions:` 高频踩坑（不含空间 ID、`harvest-feed` 不可监听）、§5.6 anytime 写法、§5.7 `futureMeeplesNode` 不在沙箱；登记 `flag-card` / `future-meeples` actionId。来源：LLM card-gen session 测试套件实测 |
| 2026-04-22 | 全面重写：`registerCardEffect`/`registerCardListener` → `CARD_DEF`/`CARD_IMPL` 双常量；注入 helper 函数；扩展 hook 白名单至全部 CardEffectField；扩展 phase 白名单增加 `anytime`/`computeChoiceCandidates`；AST validator hard-fail；4 个新 actionId                                                                                                               |
| 2026-04-19 | 抽出英文规范文档作为唯一真源；从旧设计文档 §16 内联描述迁出                                                                                                                                                                                                                                                        |
