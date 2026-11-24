# 写卡指南

[English](CARD_AUTHORING.md) | [中文](CARD_AUTHORING_zh.md)

> 本文件是中文翻译镜像；[CARD_AUTHORING.md](CARD_AUTHORING.md) 是唯一权威版本。

用本指南实现一张卡：遵守 Card contract，把卡面文字对应到现有机制，照最接近的范例卡写，再照那张卡的 Session 测试写测试。仓库里的 agent 和工坊模型都读它。每一节都给出范例卡和测试；准确的字段名以它们为准。机制本身由[架构索引](ARCHITECTURE_zh.md)及其 module 文档解释，本指南只负责从卡面文字指向它们。

## Card contract

每张卡都遵守下面每一条规则。交付一张卡之前逐条核对，评审一张卡时再核对一遍。每条规则写的是卡该怎么做；链接指向定义该机制的 module 文档或 ADR，列出的卡是代码范例。

- **Closure（闭环）。** 卡符合 §1 的可行性定义：一个闭环的文件，不改核心路径，不新增 hook 点、phase、action 或引擎节点。它通过能力和带类型的 metadata 访问其他卡。见 [cards：边界](architecture/cards_zh.md#命名能力与边界)。门禁：`pnpm run check:card-impl-boundaries` 拒绝卡读取另一张卡的 ID，`pnpm run check:card-state-boundaries` 拒绝核心代码读取单张卡的状态。
- **Local state（局部状态）。** 计数器、标记和 flag 持久化在 `player.cardStates[cardId]`，在 `presentation` 声明公开之前都是内部状态。公开的计数器 key 不是资源时，语言源里要有 `ui.cardCounters.<key>` 标签。见 [cards：局部状态](architecture/cards_zh.md#cardstates-中的局部状态)。门禁：`client/components/board/__tests__/card-counter-label.test.ts`。
- **Purity（纯度）。** listener handler 读取状态，返回 flow、成本或选项。每一次修改，包括写卡自己的状态，都是一个返回的 leaf。见 [hooks：listener 纯度](architecture/hooks_zh.md#listener-纯度)。门禁：每个测试 project 里的 listener 纯度守卫。
- **Timing（时机）。** 订阅和 phase 按卡面文字，照 §3 的表格选择（[ADR 0033](adr/0033-card-listener-timing-follows-project-semantics.md)）。阶段效果按 §4.3 选卡面时机对应的 hook，写法相同的卡挂同一个 hook（[ADR 0055](adr/0055-same-timing-sources-resolve-by-a-seat-setting.md)）。门禁：`shared/cards/__tests__/printed-timing-hooks.test.ts`。
- **Admission（准入）。** 提供选项之前，卡检查自己能控制的东西：卡面前提，以及现在必须可用的目标，例如已翻开的行动格或能够开始的授予行动（`CWM061_BackDoor`），还有卡自己的费用，用 `reserve` 传入，让目标按付费之后的资源判断（`CWM023_ForestFarmer`、`C150_ParrotBreeder`）。后续的宿主步骤归引擎管，引擎只检查当前一步：玩家已接受的选择让后面某个必选步骤付不起时，Session 显示 `engine-blocked`，直到 `undoStep` / `undoAction`（`D014_HammerCrusher`、`CWM042_Remodeler`）。见 [hooks：当前步骤准入](architecture/hooks_zh.md#当前步骤准入与-blocked-恢复)、[ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)，以及 [cards：helper](architecture/cards_zh.md#sharedcardshelpers-中的-helper) 里的 `reserved-resources.ts`。
- **Standard leaves（标准 leaf）。** 资源通过标准 leaf 移动：新资源用 `gain`，行动格上的资源用 `collect`，卡上的资源用 `take-from-card` 和 `receive`，兑换用 `exchange`，费用用 `pay`。其他卡的反应订阅这些 leaf，统计也读取它们，所以两者都能看到这次移动（`CWM055_WoodWorker`、`CWM066_Brazier`）。对"获得资源"的反应，要订阅每一个可能入账该资源的 leaf（§4.1）。见 [actions：effect 与内部行动](architecture/actions_zh.md#effect-与内部行动)。
- **Action parameters（行动参数）。** `params` 和 `actionContext` 的键名从该行动的 effect 文件或一张用过它的卡照抄，因为未知的键会被忽略而不报错：`shared/actions/effects/construct.ts` 用 `maxRooms` 限制房间数，`shared/actions/effects/stables.ts` 用 `max` 限制马厩数（`C149_ResourceRecycler`、`CWM037_MasterStableman`）。Session 测试提交比上限多一个的数量，预期被拒绝。
- **Optionality（可选性）。** 卡面写的 "may"、"can" 和 "up to" 把选择权交给玩家：节点是 `optional`，或者菜单里带一个停止选项（`CWM069_ChangingPlans`、`CWM045_StableDeliveryman`）。hook 返回的非 optional leaf 会不经询问直接执行。见 [engine：节点类型](architecture/engine_zh.md#节点类型)和 §4.4。
- **Scope（范围）。** 卡按卡面写的生命周期读取数据。"本次行动"是 handler 的 `actionEvents` / `eventQuery`；"本回合（Turn）"是 Turn Scope，通过 `helpers/turn-token.ts` 读取（`A074_StableTree`）；"本轮"是 `state.round`。`state.events` 是整局游戏已提交的日志：仍在执行的行动的事件可能还不在里面；依赖先后顺序的累计要按顺序逐步计算（`CWM056_Almshouse`）。见 [session：Turn Scope](architecture/session_zh.md#turn-scope-与行动执行作用域)和 [hooks：事件](architecture/hooks_zh.md#hook-系统)。
- **Identity（身份）。** 卡用坐标记住农场上的东西：一个格子或一段围栏。`pasture.id` 按位置生成，围栏变化时会重新编号；数组下标也会移动（`CWM074_Donkey`）。读取自己的标记时，卡要确认被标记的东西仍然在（`CWM005_BeeKeeper`）。见 [domain](architecture/domain_zh.md) 的"农场"段。
- **Edition（版本）。** 新旧版卡牌同在一局时，卡仍然正确，版本差异由卡自己声明；没有规则读取对局的 Card Edition（[ADR 0050](adr/0050-rules-code-does-not-assume-one-card-edition.md)）。
- **Supply limits（供应上限）。** 围栏和马厩的上限来自 supply token helper 和支付管线，例如 `getAvailableStableSupplyCount()`。见 [payment](architecture/payment_zh.md) 的 supply token 段。
- **Card text（卡面文字）。** `meta.desc` 把资源、动物、地形和分数写成图标 token（`<FOOD>`、`bonus <SCORE>`），把确切的行动、行动格和卡牌名称写成 `__Name__`。见 [cards：Card Source](architecture/cards_zh.md#card-source-与投影)。门禁：`scripts/__tests__/card-description-icons.test.ts` 和 `card-description-double-underscore.test.ts`。
- **Evidence（证据）。** 卡有一个正例测试（效果触发）和一个反例测试（效果不得触发）（§5、[CARD_TEST_TEMPLATE](CARD_TEST_TEMPLATE_zh.md)）。

## 1. 先判断可行性

一张卡能放进一个闭环的卡牌文件时，它是**可行的（feasible）**：

- 只使用 §4 的机制、`shared/cards/helpers/` 里的 helper 和 Card Definition 字段；
- 持久的计数器和标记放在 `player.cardStates[cardId]`，由返回的 leaf 写入；
- 后续选择使用现有的 optional 节点、trigger-select 和 continuation；
- 不改核心路径，例如 `shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts` 或 `server/game/authoritative-session.ts`，也不新增 hook 点、phase、action 或引擎节点。

卡需要上述任何一种核心改动，或者需要 §4、module 文档和现有卡都不提供的机制时，它**需要平台改动（needs a platform change）**。报告缺失的 seam，并附证据：查过的文件和符号、最接近的现有卡、它表达不了什么。

卡面文字没有说清时机、由谁选择或某个边界情况，而 §3 的规则也定不下来时，它**需要更多信息（needs more information）**。提一个准确的问题。

在工坊里，写产物之前用 `report_feasibility` 记录这个结论；`needs-platform` 结论让作者能用你的证据和缺口预填一个 GitHub issue。

没找到证据不等于不存在。声明缺口之前，先搜 §4 的卡面句式、`shared/cards/card-effects.ts` 里的 hook 列表、`shared/cards/listener-contract.ts` 里的订阅契约，以及一张相似的现有卡。

## 2. Card Source 的形状

一张原生卡是一个模块：`shared/cards/<Deck>/<Id>_<Name>.ts`（社区卡是 `shared/cards/community/<CARD_ID>.ts`）。它导出来自 `shared/cards/card-source.ts` 的 `defineMinorCard({ meta, impl })` 或 `defineOccupationCard({ meta, impl })`。`impl` 包含 `listeners`、`effect`、`modifiers`、`prerequisiteCheck`、`getBaseCosts` 和 `reaches`，类型在 `shared/cards/registry.ts`。`reaches` 列出源文件可以点名的其他卡牌 ID。

**工坊源码**就是同一种模块（ADR 0052），内容是它的 pull request 要新增的那个文件。作者浏览器里的 Worker 把它对 `shared/` 的 import 解析到自己的引擎模块；服务端只检查结构、不执行代码（`shared/custom-code/card-source-admission.ts`）：一个与卡同名的导出，只相对导入共享引擎模块和卡牌 helper（不导入其他卡或测试），以及一个内联字面量 `meta`，其中 `deck: 'community'`。已退役的 `CARD_DEF` / `CARD_IMPL` 沙箱格式不再运行；仍是这种格式的草稿必须重新生成为模块（[CUSTOM_CARD_SANDBOX](CUSTOM_CARD_SANDBOX_zh.md)）。

## 3. 选择时机

时机由卡面文字、官方裁定和已记录的项目解释决定，参考实现不算数（[ADR 0033](adr/0033-card-listener-timing-follows-project-semantics.md)、[ADR 0031](adr/0031-explicit-action-space-use-subscriptions.md)）。单凭 "Each time" 选不出 phase：要看触发条件，以及效果是否依赖结果。

先判断卡面描述的到底是不是一个反应。下面这些 "each time" 句式用的是别的机制，不需要 listener phase：

| 卡面文字 | 机制 | 范例 |
|---|---|---|
| "instead"，或放弃一个行动以换取别的东西 | `computeReplace` listener 返回带 `alternativeFlow` 的 `decline`，在行动执行前决定 | `A097_Freshman`、`B026_AgrarianFences`、`B103_FieldMerchant`、`D138_PetLover` |
| 费用里的折扣、"do not have to pay"、"replace X with Y" | 成本 modifier 或 `computeCosts`（§4.14） | `A014_CarpentersHammer`、`A088_HedgeKeeper`、`B095_MasterBricklayer`、`E060_WorkingGloves` |
| 轮次或收获里的某个时间点：准备阶段放置资源、翻开行动格、家庭成员回家、收割、动物出生 | `impl.effect` 上的阶段 hook（§4.3） | `A049_NestSite`、`C021_HeartofStone`、`C097_SeedResearcher`、`A106_SlurrySpreader`、`E133_ChampionBreeder` |
| 一个状态而不是事件，例如 "both … are occupied" | 卡牌行动格上的可用条件，或一个随时能力（§4.9） | `A162_ForestTallyman`、`D178_SubstituteTeacher`、`E014_WoodSaw` |

否则按触发条件选择订阅：

| 卡面文字 | 订阅 |
|---|---|
| "Each time you use action space X" | `actionSpaces: ['x']`，或 `'all'` 加分类 helper |
| "Each time you place a person"（不含移动） | `actions: ['place-farmer']` 加 `requiresNewPlacement: true` |
| "Each time you take the X action"（犁地、播种、烤面包、建造……） | `actions: ['x']` |
| "Each time you get goods from an action space" | 一次获取：`actions: ['collect', 'gain']`、`phases: ['after']`，用 `hasActionSpaceAcquisition` 过滤 |

然后选择 phase。下面是 ADR 0033 的默认值：

| 卡面文字 | 订阅 | Phase |
|---|---|---|
| 卡面写 "immediately before" 或 "before" | 按卡面 | `before` |
| 卡面写 "immediately after" | 按卡面 | `immediatelyAfter` |
| 卡面写 "each time after" 或 "after" | 按卡面 | `after` |
| 使用某个行动格的额外好处（also get、can buy、can exchange），且不依赖这次使用的结果 | `actionSpaces` | `before` |
| 从累积格拿到至少 N 个资源 | `collect`，一次获取 | `after` |
| 由拥有者、其他玩家或任意玩家执行的规则行动：犁地、建造、翻修、围栏、播种、家庭成长或换取食物 | 该规则行动，配上相应的 `scope` | `after` |
| 执行 Moor 特殊行动的额外好处 | `moor-action` | `before` |

- `before` 的奖励在同一次行动内就能用，所以可以用来支付这次使用，或成为它的输入。
- 卡面没写时机时，只有当效果依赖这次使用的结果、且必须在普通 `after` 反应之前结算，才用 `immediatelyAfter`。
- 同一个窗口里的多个来源由玩家决定顺序，每次选择都重新读取当前状态。不要添加固定顺序，也不要添加 `during` phase。
- `before` 的奖励不会让空的累积格变得可进入，卡也不添加 `isDoable` 覆盖来强行做到。

listener 的默认值：

- `scope: 'player'`（另有 `'opponent'` 和 `'any'`）；
- `zones: ['played']`，手牌 listener 需要 `zones: ['hand']`；
- 始终设置 `cardIds: [CARD_ID]`。

一个注册只有一个选择器：`actions`、`actionSpaces`、`events` 或 `globalQuery`（`shared/cards/listener-contract.ts`）。

handler 是纯函数。每一次修改，包括写卡自己的 `cardStates`，都是一个返回的 leaf，例如 `gain`、`pay` 或 `special-effect`；有守卫会让写入状态的测试失败。阶段 hook 和 `onBuy` 不是 listener：它们运行在实时状态上，有些卡在那里直接写（`E140_Carter`）。

行动格 ID 在 `shared/cards/action/` 下每个文件定义一个（例如 `round-western-quarry.ts` 里是 `id: 'western-quarry'`）。分类 helper 在 `shared/cards/helpers/action-space-categories.ts`。handler 比较 `context.space?.id`。

## 4. 卡面句式

leaf helper 在 `shared/cards/helpers/pay-gain-node.ts`：

- `gainLeaf(cardId, gain)` 会丢弃 `score`；
- `bonusVpLeaf(cardId, n)` 给予奖励分；
- `payLeaf` 支付一项费用；
- `payGainActionFlow` 是必选的先付后得；
- `payGainFlow` / `payGainNode` 是可选的先付后得（遇到 `score` 会加上 `bonus-vp`）；
- `payThenActionFlow` 先支付，再执行一个行动。

### 4.1 "Each time you use space X, you also get …"

```ts
{ id: 'my-card-fishing', cardIds: [CARD_ID], actionSpaces: ['fishing'], phases: ['before'],
  handler: ctx => ({ flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }) }
```

- 范例：`A042_ForestLakeHut`（`before`，用 `'all'` 加行动格判断）和 `C051_FishingNet`（显式 `actionSpaces`）。
- "After you use" 用 `phases: ['after']`（`D101_SugarBaker`）。
- "Each time you get food from an action space" 是一次获取：`E118_KindlingGatherer`，用 `helpers/event-provenance.ts` 里的 `hasActionSpaceAcquisition`。
- 旧版印刷版图上的 "Adjacent to space X" 用 `helpers/classic-board-topology.ts` 里的 `getClassicAdjacentSpaceIds`，与界面布局无关（`CWM080_FishHook`、`CWM025_Godfather`）。
- 测试：`A42_ForestLakeHut-session.test.ts`；空格子的准入见 `empty-accumulation-admission-session.test.ts`。

### 4.2 打出时，以及 Card Definition 字段

`effect.onBuy(state, player, paymentInfo?, ctx?)` 在支付和卡牌提交之后、尾随反应之前运行。刚打出的卡不会匹配自己的 `occupation` / `improvement` 反应。范例是 `A016_RammedClay` 和 `C143_StoneBuyer`，后者提供一次可选购买。它的测试 `E140_Carter-session.test.ts` 通过 `lessons` 从手牌打出这张卡。

| `meta` 字段 | 作用 |
|---|---|
| `cost` / `altCosts` | 费用或替代费用（`shared/contract/cards.ts`） |
| `vp` | 卡面分数 |
| `extraVp` | 只是展示标记；奖励分来自 `computeBonusScore` 或 `bonus-vp` |
| `prerequisite` | 卡面文字，会被解析成检查。无法识别的子句会直接通过，所以其他情况用 `occupationPrerequisites` / `improvementPrerequisites`（`{ min, max }`）、`maxRound` 或 `impl.prerequisiteCheck` |
| `players` | 发牌池过滤，例如 `'3+'` |
| `category` | 仅用于展示 |
| `exchanges` | 声明式兑换（§4.9） |

### 4.3 在轮次或收获的某个阶段

声明 `impl.effect.<hook>: (state, player, ctx?) => ActionFlow | void`。hook 名称及其顺序列在 `shared/cards/card-effects.ts` 和 [hooks](architecture/hooks_zh.md#阶段-hook)。每个阶段 hook 都开一个 Stage Dispatch 窗口：每个玩家一个 trigger-select，来源在进入窗口时冻结。

卡面时机写法相同，就挂同一个 hook（[ADR 0055](adr/0055-same-timing-sources-resolve-by-a-seat-setting.md)）：

| 卡面时机 | Hook |
|---|---|
| "At the end of each work phase"、"at the end of the work phases of rounds N" | `onAllWorkersPlaced`（`E023_Apiary`） |
| "After each work phase"、"immediately before the returning home phase" | `onBeforeReturnHome`（`B117_Informant`） |
| "At the start of the returning home phase" | `onStartReturnHome`（`A157_Bohemian`） |
| "In the returning home phase (of each round)" | `onReturnHome`（`D107_Bellfounder`） |
| "Immediately after each returning home phase" | `onAfterReturnHome`（`D018_SteamPlow`） |
| "During each harvest feeding phase"、"in the feeding phase of each harvest" | `onHarvestFeedingPhase`（`CWM005_BeeKeeper`） |
| "At the end of each round"、"at the end of round N" | `onRoundEnd`（`B053_SculptureCourse`） |
| "After each round" | `onAfterRoundEnd`（`D167_PureBreeder`） |

门禁 `shared/cards/__tests__/printed-timing-hooks.test.ts` 检查这些写法，以及收获和准备阶段的写法。田间阶段的效果按它读取的数据放在收割之前或之后；由其他机制实现的时机（例如喂养阶段的兑换）在门禁里登记，并写明实现机制。

- 准备阶段的窗口用纯函数 `effect.stageEligibility[hook]` 过滤来源（`E111_Recluse`）。
- `handHooks` 让手牌也能触发，`onBuy`、`onEndTurn` 和 `onBeforeEndGame` 除外。
- 收获开始的范例是 `E110_Dentist`（`onStartHarvest`）。
- 座位设置开启时（缺省），只获得非动物货物、把货物放到卡上或只改计数的必选效果，会先于玩家排序自动结算（[ADR 0055](adr/0055-same-timing-sources-resolve-by-a-seat-setting.md)）；不要依赖出牌顺序。每次收获的记账放在按轮次区分的卡牌状态里（`C062_CookeryExtension`；田地选择带上所属轮次，见 `A112_ScytheWorker`），随机抽取放在 action leaf 里（`M104_WildHarvest`），都不要写在阶段 hook 本身。
- 测试：`E090_E127-parity-session.test.ts` 走到第 4 轮收获（§5）；`harvest-late-reaction-windows-session.test.ts` 用两张同时机的卡测两种顺序。

### 4.4 "You may pay X to get Y"

返回 `payGainNode({ cardId, cost, gain })` 或 `payGainFlow(...)`，即一个可选的 `seq`：先 `pay` 再 `gain`。玩家会看到这个选项和 `__skip__`。

- 第一步无法开始时，引擎会跳过这个可选的根节点，所以是否付得起的守卫可写可不写。
- 卡面条件不满足时返回 `undefined`。
- 卡牌层的 `seq[pay, gain]` 是认可的形状；[hooks](architecture/hooks_zh.md#pay-child-不变量) 里的"禁止形状"说的是宿主行动自己的 `pay` 子节点。
- 范例：`D101_SugarBaker`（带 `followUp`）和 `E110_Dentist`。
- 测试：`D101_SugarBaker-session.test.ts`，配合 `_helpers/trigger-select.ts` 里的 `resolveNonSkipChoice` / `resolveSkipChoice`。

### 4.5 对其他玩家作出反应

`scope: 'opponent'` 或 `'any'`。在 handler 的上下文里，`player` 是行动的玩家，`ownerPlayer` 是卡的拥有者。始终由拥有者选择，Pass 也属于拥有者。

| 订阅 | 未指定目标的返回 flow 由谁执行 |
|---|---|
| `actionSpaces` 或 `place-farmer`，`before` | 行动者 |
| 规则 `actions` 的 `before`；所有 `immediatelyAfter` / `after` | 拥有者 |

指定玩家的方式：

- flow 节点上的 `targetPlayerId` 让整棵子树换主（行动者、付款者和选择者）。这是与 phase 无关的写法；见 `D149_CasualWorker` 和 `E160_KelpGatherer`。
- `gain` 的参数：`recipientPlayerId` 指定接收者，`payerId` 从该玩家转移，`recipientMode: 'others'` 给其他每个玩家（`B138_ForestGuardian`、`C051_FishingNet`）。
- leaf 上的 `actionContext.targetPlayerId` 只对 `special-effect` 和 `bonus-vp` 有效。

测试：`E160_KelpGatherer-session.test.ts`（配合 `confirmPlayerSwitch`）和 `A132_Publican-session.test.ts`。

### 4.6 持续性 modifier

| 卡面文字 | 机制 | 范例 |
|---|---|---|
| 牧场能容纳更多动物 | `effect.computePastureCapacityModifiers` 返回 `{ sourceCard, kind: 'additive', apply }` | `A012_DrinkingTrough` |
| 任何东西更便宜、更贵或改用别的资源支付 | 支付管线（§4.14） | `A088_HedgeKeeper`、`A143_Stonecutter` |
| 收割产量更多 | `registerHarvestCountModifier`；它不过滤归属，所以要检查卡已打出，且所选田地属于本次收获的轮次 | `E073_Scythe` |
| 喂养所需更少 | `registerHarvestFeedingRequirementModifier`（只对已打出的卡） | `E159_OldMiser` |
| 繁殖门槛 | `effect.computeBreedThreshold`；取最小值 | `E084_DollysMother` |
| 额外的房间容量 | `effect.computeExtraRoomCapacity` | `B010_Caravan` |

### 4.7 每回合、每轮或每次收获一次

- **每个 Turn 一次：** `helpers/turn-token.ts` 里的 `isUsedThisTurn` / `markUsedThisTurnLeaf`（`A074_StableTree`）。
- **每轮一次：** 没有 helper。返回一个 `set-flag` 的 `special-effect` leaf，在 handler 里检查 `isCardFlagged`，并在 `onRoundStart` 重置（`D122_ClayCarrier`、`C143_StoneBuyer`）。其他 `special-effect` 种类有 `set-extra-data`、`increment-extra-data`、`set-counter` 和 `increment-counter`。
- **每次收获一次的兑换：** `helpers/stage-effects.ts` 里的 `createSingleHarvestExchange`（`B101_FurnitureCarpenter`）。
- 测试：`D122_ClayCarrier-session.test.ts`。

### 4.8 终局分数

- `effect.computeBonusScore(state, player, { categories })` 返回一个数字（`A098_StableArchitect`）。
- 游戏过程中获得的分数用 `bonus-vp` leaf。
- 测试里断言 `resp.scores` 的 `cardBonusVp` 分类。

### 4.9 随时能力与兑换

- **静态兑换：** `meta.exchanges: [{ from, to, max?, sourceId, triggers: ['anytime' | 'harvest' | 'bake-bread'] }]`（`C109_SchnappsDistiller`）。
- **有条件的配方：** `actions: ['compute-exchanges'], phases: ['computeExchanges']` 返回 `{ extraExchanges }`（`B101_FurnitureCarpenter`）。
- **自由形式的随时 flow：** `actions: ['anytime'], phases: ['anytime']`。listener 的 `id` 就是传给 `takeAnytimeAction` 的随时行动 ID（`D122_ClayCarrier`）。
- **计分之前：** `preScoring: true | 'only'`。

### 4.10 未来的资源与报价

- 放在未来轮次格上的资源：`futureMeeplesNode`（`A046_ClawKnife`）。
- 一次性的未来购买：在 `onBuy` 里用 `scheduleOffersNode`，在 `onRoundStart` 上配 `scheduledOffersRoundStartFlow`（`D069_SmallGreenhouse`）。
- 只在某一轮生效的公式：`effect.timedRules`（`C155_FoodDistributor`）。

### 4.11 从累积格拿走一部分

- `helpers/partial-take.ts` 里的 `createPartialTakeFromSpaceLeaf({ sourceCard, spaceId, resource, amount })`（`B081_Handcart`、`E005_NightLoot`）。
- 剩余数量少于 `amount` 时 `collect` 会失败。
- 对手的 `before` 反应把行动者即将收取的格子拿空，这种情况没有测试覆盖；如果一张卡需要它，先测试，受阻时报告缺口。

### 4.12 卡上的资源、动物或作物

- **资源：** `store-on-card` leaf，用 `getStoredResource` 和 `take-from-card` 读回（`E052_Cubbyhole`）。"随时取走卡上的资源"用 `helpers/card-resource-withdrawal.ts` 里的 `cardResourceWithdrawal`（`CWM096_OakCask`）。
- **农场上的资源：** 未使用格子上的一个 token 用 `helpers/farm-token-selection.ts` 里的 `farmTokenSelection`（`CWM064_Bonre`）；每个房间一个标记用 `helpers/room-food-markers.ts` 里的 `roomFoodMarkers`（`CWM071_Cookies`）。
- **动物：** `meta.animalHolder: true`，并用 `effect.onComputeAnimalZones` 添加一个 `card:<id>` 区域（`B012_Stockyard`）。
- **作物：** Card Field（`B068_Beanfield`；[cards](architecture/cards_zh.md#card-field-与-logical-field-seam)）。

### 4.13 还没放置的人，以及 "place another person"

- **还剩几个人、最后一个人、所有人都已放置：** 读取 `actions/guest-turns.ts` 里的 `peopleLeftToPlace()`，不能只看 `workersAvailable()`：待放置的 Guest 也是还没放置的人（`E131_MarketMaster`、`M057_Taps`）。
- **"Place another person"：** 以 `peopleLeftToPlace() > 0` 为条件，返回一个 `place-farmer` leaf，`sourceCard` 是这张卡；卡上的人则用 `spend-worker`。放置本身会让玩家选家庭成员或待放置的 Guest（`C042_RavenousHunger`、`D103_CanalBoatman`）。没有家庭成员可用时，用 `computeAllowedPlacementSpaces` 计算约束要传 `ignoreWorkerAvailability`。
- 测试：`guest-mixed-edition-session.test.ts`。

### 4.14 费用与支付

所有费用都走同一条支付管线（[payment](architecture/payment_zh.md)）。卡通过声明 modifier 或回应 `computeCosts` 来改变费用，再由管线枚举各种支付方式；卡自己从不直接扣资源。`appliesTo` 和 `costType` 的取值是 `construct`、`renovation`、`fencing`、`stables`、`plow`、`occupation`、`major-improvement` 或 `minor-improvement`。

| 卡面文字 | 机制 | 范例 |
|---|---|---|
| 建房、翻修、围栏、建马厩或犁地时 "Pay X instead of Y"、"N of them are free" | `impl.modifiers`，`type: 'trade'`，带 `appliesTo`、`from`、`to` 和 `max`；`scope: 'unit'` 按每间房、每段围栏或每个马厩生效，`'action'` 每次行动生效一次 | `A088_HedgeKeeper`、`A016_RammedClay`、`CWM011_Contractor` |
| "You no longer need X" | `impl.modifiers`，`type: 'remove-resource'` | `C014_StrawThatchedRoof` |
| 房间价格取决于房屋类型，或每间房的折扣 | `actions: ['construct'], phases: ['computeCosts']` 返回 `trades`，用 `helpers/construct-cost.ts` 构造（`constructUnitPriceTrade`、`constructUnitDiscountTrade`、`constructedRoomMaterial`） | `B126_Carpenter`、`CWM027_Heiress` |
| 翻修折扣 | `actions: ['renovate-house'], phases: ['computeCosts']` 返回 `bonuses`，用 `helpers/renovation-cost.ts` 构造（`sourcedMandatoryBonus`、`sourcedMandatoryBonusChoices`、`selectedRenovationTarget`） | `D081_RoofLadder`、`B128_Plumber` |
| 围栏、犁地或其他行动上的固定折扣或加价 | `computeCosts` 返回 `costs` 增量，并同时返回等额的 `costAttribution`；静态门禁会拒绝只有 `costs` 没有它的写法 | `C016_FieldFences`、`C037_DwellingMound` |
| 改良或职业更便宜，或改付别的东西 | `actions: ['improvement']` 或 `['occupation']`，`phases: ['computeCosts']`，配合 `deriveCardCostCandidate`，用 `PaymentSolver.discountCardCostCandidate` 构造 | `A143_Stonecutter`、`E060_WorkingGloves` |
| 卡自身的费用取决于对局状态 | `impl.getBaseCosts` | `B036_Bottles` |
| 卡面印着几种费用可选 | `meta.altCosts` | `A004_Baseboards` |
| "You can use goods from … to pay" | 行动格上的资源：`computeCosts` 返回 `paymentResourceProviders`；卡上的资源：带 `choiceAffectsState` 的 `bonuses` 选项，再加一个订阅 `pay` 的 `after` listener 把用掉的资源移走 | `B155_ArtTeacher`、`E123_ResourceHoarder` |
| "Each time you pay …"、"each time another player pays …" | `actions: ['pay'], phases: ['after']`；上下文里的 `costType` 表示支付目的，`helpers/event-provenance.ts` 里的 `sumActualPaidResource` / `sumResourcePaid` 读取数量 | `E122_Cottar`、`D171_SeniorTeacher` |
| 计分时按持有的资源给分，且每个资源只能为一张卡计分 | `effect.computeCostedBonus` 返回 `{ cost, score }` 档位 | `Major_Pottery`、`CWM086_GlassblowersShop` |

测试：`A123_FrameBuilder-construct-session.test.ts`、`E60_WorkingGloves-session.test.ts`、`workshop-timing-payment-session.test.ts`。

### 4.15 授予一个行动

卡通过返回某个规则行动的 leaf 来授予它：`plow`、`sow`、`construct`、`stables`、`fence`、`renovate-house`、`family-growth`、`bake-bread`、`improvement` 或 `occupation`。这个 leaf 只执行该行动，不会使用平时提供它的行动格（[actions：effect 与内部行动](architecture/actions_zh.md#effect-与内部行动)）。

- **价格：** `exactCost: {}` 表示免费，`exactCost: { food: 1 }` 固定价格。农场类行动从 `actionContext` 读取（`C149_ResourceRecycler`、`A001_Shelter`）；`occupation` 从 `params` 读取（`C028_TeachersDesk`）。
- **限制：** `construct` 用 `maxRooms`，`stables` 用 `max`，`improvement` 用 `types` 和 `params.allowedPurchases`（`A027_OvenSite`），`fence` 用 `fencePolicy`（`B002_MiniPasture`；[actions：围栏策略](architecture/actions_zh.md#围栏段与-policy)），不需要房间的 `family-growth` 用 `skipRoomCheck`（`B127_Seducer`）。
- **是否算作该行动：** `actionContext.trueAction: false` 表示这个效果不算作执行了该具名行动，所以 "each time you take the X action" 的反应不会触发。卡面授予的就是具名行动本身时不要设置它（[session：Turn Scope](architecture/session_zh.md#turn-scope-与行动执行作用域)）。
- **把人放到行动格上：** `place-farmer-on-space` 把另一个人放到固定的行动格（`CWM061_BackDoor`）；`helpers/jump-leaf.ts` 里的 `jumpLeaf` 移动一个已放置的人（`A129_Swagman`）；`recall-placed-worker` 把一个人收回（`D094_HenpeckedHusband`）。

### 4.16 选择与农场选取

- **多个效果选一个：** `xor` flow；给每个子节点设置 `choiceLabelKey`，让各选项的文字不同（`B026_AgrarianFences`）。
- **一组值的菜单：** `emit-choice` leaf，`params.options: [{ value, labelKey, labelParams }]`；`requiresExplicitChoice: true` 表示只剩一个选项时也要询问。答案交给 `effect.resolveChoice(state, player, choice)`，它可以返回下一个 flow，包括再一个 `emit-choice`（`B003_Moonshine`、`CWM114_WineCloset`、`CWM045_StableDeliveryman`）。
- **农场格子：** `selection` leaf，`actionContext: { selectionKind: 'farm-position', selectionEffect, minSelections, maxSelections, selectableTiles }`，再用 `shared/actions/helpers/selection-effect-registry.ts` 里的 `registerSelectionEffect` / `registerSelectionValidator` 定义选中后做什么、哪些选法合法（`A070_LiftingMachine`、`CWM103_Raspberries`）。测试里用 `commitSelectionChoice(i, { positions: ['row-col'] })` 作答。

### 4.17 让一个行动可以执行或不能执行

| 卡面文字 | 机制 | 范例 |
|---|---|---|
| "You can no longer use …" | `phases: ['isDoable']` 加 `globalQuery: true`，当 `context.actionId` 是该行动格时返回 `{ doable: false }` | `D050_ForeignAid`、`CWM020_FarmSchoolGraduate` |
| "You can take action X even without …" | 订阅该行动的 `phases: ['isDoable']`，只在 `context.doable` 为 false 且卡能补上所缺的东西时返回 `{ doable: true }` | `A065_SeedPellets`、`D014_HammerCrusher` |
| "You can use an occupied space"，以及其他额外的放置目标 | `actions: ['place-farmer'], phases: ['computeArgs']` 返回 `extraOptions`，其 value 以 `OCCUPIED_SPACE_CHOICE_PREFIX` 开头。被占用者拿空的累积格不能靠 `isDoable` 重新开放；要在那里给出别的收益，在该格上用 `computeReplace`，并以 `actionSpaceUse.personUse` 区分这次进入的人 | `A025_Bassinet`、`CWM016_Diplomat`、`CWM013_Cowboy` |
| "You can also buy … there" | 订阅 `improvement` 的 `phases: ['computeChoiceCandidates']`，返回 `extraOptions` | `C027_Blueprint` |

### 4.18 读取已经发生的事

| 卡需要知道 | 读取 | 范例 |
|---|---|---|
| 本次行动建了哪些房间或马厩 | `helpers/construction-events.ts`（`getRoomsBuiltThisAction`、`getActionRoomConstructions`、`getActionStableConstructions`） | `A093_BedMaker`、`CWM060_Attic` |
| 本次行动建了哪些围栏、新围住哪些格子 | `helpers/fence-events.ts`（`hasOrdinaryFenceBuiltEvent`、`countNewFenceEdges`、`getActionNewlyEnclosedPastureTiles`） | `CWM026_HedgeMaster` |
| 哪些农场格变成了已使用 | `events: ['farm.spacesUsed']` 配合 `helpers/farmyard-events.ts` 里的 `getActionNewlyUsedTiles` | `A040_PottersYard`、`CWM103_Raspberries` |
| 本 Turn 更早时建过什么 | `helpers/action-snapshot.ts` | `A074_StableTree` |
| 这是本轮第几个人使用该行动格 | `getSpaceUsePersonPlacementOrdinal`，以及 `helpers/round-placement.ts` 里的其他查询 | `A163_BuildingExpert` |
| 玩家场上的卡，按类型或能力查 | `helpers/card-type.ts`（`collectCardsAs`、`playerHasCardCapability`）；触发时冻结的数量用 `helpers/trigger-snapshot.ts` | `B133_VillagePeasant`、`B049_Scales` |
| 某个行动格是不是 Lessons 格 | `helpers/lessons-spaces.ts` 里的 `isLessonsSpaceId` | `D171_SeniorTeacher` |
| 卡自己的计数器、flag 和数据 | `helpers/card-state.ts`（`readCardExtraData`、`isCardFlagged`） | `D122_ClayCarrier` |
| 已使用和未使用的农场格 | `shared/domain/farmyard-usage.ts` 里的 `getUsedFarmyardTileKeys`；卡从不自己数格子 | `B038_FutureBuildingSite`、`CWM103_Raspberries` |
| 玩家能否安置自己的动物 | `shared/domain/animal-zones.ts` 里的 `canAccommodateAllAnimals` 和 `computeAnimalZones` | `D036_BreedRegistry` |
| 本次行动或整个事务的事件，以及是谁触发了反应 | `context.actionEvents`、`context.transactionEvents`、`context.eventQuery`；`context.triggerPlayer ?? context.player` | `D171_SeniorTeacher`、`A132_Publican` |

### 4.19 较少用到的 seam

| 卡需要 | Seam | 范例 |
|---|---|---|
| 本轮多一个回合或多一个人 | `effect.contributeExtraTurn`，排在玩家自己的人之前时加 `extraTurnBeforeWorkers`；安排在之后某一轮的用 `timedRules` | `E093_Motivator`、`A022_Telegram` |
| 一个 Guest | `helpers/guest-flow.ts` 里的 `grantGuestLeaf` / `grantImmediateGuestLeaf` | `CZ314_Keg`、`CI073_Guest` |
| 多个玩家都可能得到的分数 | `effect.computeSharedPostScore` 返回 `{ playerId, score }` 条目 | `A135_AnimalReeve`、`CWM087_GoldMedal` |
| 限制卡上的区域能留哪些动物 | `effect.getInvalidAnimals` | `B011_Feedyard` |
| 在其他格子播种，或播种数量不同 | `effect.onComputeSowableFields` 配合 `onSowExtraField`；`effect.modifySowAmount` | `B072_LoveforAgriculture`、`E071_CowPatty` |
| 玩家可能想留到收获再用的资源 | `effect.preHarvestGoodsWanted` | `A061_WinnowingFan` |
| 由共享规则汇总的只读事实，例如预留的棋子或分数调整 | `effect.getRuleContributions` | `E159_OldMiser`、`CWM021_FenceDealer` |
| 改写由卡自己的行动发起的请求 | `effect.projectInteractionRequest` | `C127_Lover` |
| 卡上的一摞资源 | `push-to-card-stack` / `pop-card-stack` leaf，配合 `presentation: { stack: true }` | `CWM022_FoodConnoisseur` |
| 把资源放回行动格 | `helpers/pay-gain-node.ts` 里的 `returnToSpaceThenGainFlow` | `A164_WoodWorker` |
| 退回一个已建的马厩 | `helpers/stable-removal.ts` | `CWM069_ChangingPlans` |
| 卡改变了动物可以待的地方之后重新安置动物 | `reorganize` leaf | `CWM074_Donkey`、`E083_ShepherdsWhistle` |
| 一张烹饪类改良 | `meta.isCookery: true` 加 `exchanges` | `A060_OrientalFireplace` |
| 卡上或农场上的公开标记 | `presentation`；需要计算的标记用 `effect.getStatePresentation` | `CWM050_TapestryWeaver` |
| 显示在卡上的文字 | `set-infobox` 的 `special-effect` leaf | `A173_ClayThief` |
| 卡自己的状态变化，而没有标准 leaf 能表达 | 卡牌私有行动：`shared/actions/helpers/ad-hoc-action-registry.ts` 里的 `registerAdHocAction`，id 以 `card_` 开头；资源仍然通过标准 leaf 移动（[actions：effect 与内部行动](architecture/actions_zh.md#effect-与内部行动)） | `A040_PottersYard`、`E073_Scythe` |

## 5. Session 测试

每张卡的测试至少覆盖一个**正例（positive）**场景，即效果触发并改变状态，以及一个**反例（negative）**场景，即效果不得触发：卡不在场上、由其他玩家触发、玩家拒绝，或费用付不起。[CARD_TEST_TEMPLATE](CARD_TEST_TEMPLATE_zh.md) 列出要记录和断言的内容。工坊的浏览器测试把每个用例命名为 `positive: …` 或 `negative: …`；一次运行里两类各至少有一个通过，才算通过。

**仓库里的 Session 测试**（`server/__tests__/*-session.test.ts`）：

- 用 `_helpers/session-fixtures.ts` 里的 `createWorkSession({ seed, options: { playerCount: 2 }, configure })` 构造。在 `configure` 里设置 `occupationPlayed` / `minorPlayed` 或手牌、资源、`cardStates` 和 `round`。无关的手牌用 `['__test_placeholder__']`。
- 要走到第 4 轮收获：设置 `state.round = 4`，给足食物，对每个玩家调用 `markAllWorkersUsed`，然后调用 `autoAdvanceRoundEnd(session, { onChoice })`（`_helpers/round-end.ts`）或 `performRoundEnd()`。`enterFeeding` 停在喂养阶段。
- 回应提示时调用 `resolveChoice(i, value)`。`'__skip__'` 拒绝一个可选节点，`'__pass__'` 放弃一个 trigger-select。`confirmPlayerSwitch` 以 `request.fromPlayerIndex` 的身份提交。农场选择用 `commitSelectionChoice`。
- 断言 `ok` / `error`、玩家的 `resources` 和 `cardStates`、`interaction.stateId` / `request.kind` / `playerIndex`、带 `sourceCardId` 的 `resource.moved` 事件、`log` 和 `scores`。

**工坊的浏览器测试**运行在 `client/local-sandbox/card-test-runtime.ts`：

- 运行时注入 `test(name, fn)`、Chai 的 `expect`、`createSession()` 和 `helpers`（`emptyResources`、`setActiveWorkerCount`、`setWorkersAtHome`）。import 会被拒绝。
- `createSession()` 返回一个两人的 `GameCore`：第 1 轮、工作阶段、idle、seed 42，手牌是占位牌。
- 用 `session.devPlayCard(0, CARD_ID)` 把卡放到场上。用 `getState()` 和 `loadState(state)` 调整状态。
- 命令失败时，错误信息会附加到失败测试的消息里。范例：`client/local-sandbox/__tests__/card-test-runtime.test.ts`。
