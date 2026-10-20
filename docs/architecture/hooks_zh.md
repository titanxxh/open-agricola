# Hook、阶段分发与 listener 纯度

[English](hooks.md) | [中文](hooks_zh.md)

> 本文件是中文翻译镜像；[hooks.md](hooks.md) 是唯一权威版本。

Hook 注册表、公开行动的执行顺序、Stage Dispatch 与 listener 纯度规则；属于 `shared/actions/`（[actions](actions_zh.md)）。

## Hook 系统

- 每个 `GameCore` 拥有自己的 `ActionHookRegistry`（`actionHooks`）。分发、可用性、费用预览和规则 helper 显式接收它，没有进程级默认值。上下文对象声明 `actionHooks`，只有无通用规则的纯调用才用 `undefined`。注册表是每个 Core 重建的运行时依赖，从不进入状态或游标。
- `CardRegistry` 也没有进程默认值：卡牌查找使用临时同步的 `withCtx` 绑定，嵌套调用和异常后恢复；未绑定环境的查找直接失败。自定义代码 adapter 在调用不可信代码前剥离 `actionHooks`。

```text
isDoable                 修改行动是否可执行
computeReplace           替换整个行动
computeCosts             调整费用，包括围栏与卡牌购买折扣
computeArgs              为 execute() 返回的选择追加选项
computeChoiceCandidates  向 opt-in 的 getBaseChoiceOptions 注入候选
computeExchanges         注入运行时 CardExchange
before / immediatelyAfter / after
anytime                  注册额外的 anytime 行动
```

- `ActionHookContext` 为 `{ actionHooks, state, player, space, actionId, phase, result?, choice?, doable? }`；执行期 `ActionMutationContext.eventSink` 记录事件。`ActionHookResult`（`shared/actions/hooks.ts`）为 `{ doable?, actionId?, extraData?, extraOptions?, extraExchanges?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard?, countCardUse?, labelKey?, labelParams?, decline?, alternativeFlow? }`。`extraExchanges` 注入运行时兑换，`countCardUse` 控制启用计数，`labelKey` / `labelParams` 为这次贡献命名；`computeReplace` 结果带 `decline` + `alternativeFlow` 时，该流程作为原行动旁的备选项提供，而不是替换原行动。顶层 `flow.sourceCard` 会复制给缺少来源的子 leaf。
- Card listener 默认只匹配已打出卡牌；只有显式 `zones` 才扫描手牌。匹配结果携带 `ownerCardId` / `ownerCardZone`。手牌 listener 同样保持纯函数，按视角序列化时隐藏从隐藏手牌派生的全部信息。
- `listener-contract.ts` 统一规定订阅目标和阶段。每条注册只能选择显式 `actions`、`actionSpaces`（`before`、`immediatelyAfter`、`after`、`isDoable` 或 `computeReplace`）、已提交 host 的 `events`（仅 `after`）或 `globalQuery: true`（仅 `isDoable`），且阶段非空。`actionSpaces` 接受非空棋盘格 ID 数组或显式 `'all'`；handler 可筛选格子类别，无需枚举所有卡牌创建的格子。棋盘格 ID 是筛选数据，不是行动订阅身份。`anytime` 和 `compute-exchanges` 是显式查询身份。全部注册入口复制并冻结筛选条件，包括 retained timed listener 和工坊 overlay；clone/merge 和 getter 不能改变订阅。架构门禁以相同契约检查完整展开的 `ALL_CARD_IMPLS`。Workshop 在 AST、manifest 和两种 runtime 边界保持独立受测子集。
- Listener `scope` 为 `player`、`opponent` 或 `any`。匹配按 listener ID 枚举；尾随节点按 owner 分组（全局、当前玩家、其他玩家），组内按打出顺序稳定排序。反应 listener 进入 trigger-select；compute / query listener 确定性聚合。
- 行动格使用反应选择 `actionSpaces`；规则动作保留 `actions`，包括订阅 `place-farmer` 的人员放置规则。显式用格上下文标识实际进入、查询和整格替换。内部规则动作即使带相同 `space` 或 `targetSpaceId`，也不会打开用格窗口。见 [ADR 0031](../adr/0031-explicit-action-space-use-subscriptions.md)。
- `before` 在合法目标确定后、费用前运行。`space-use-nodes.ts` 用引擎 sequence 包住一次完整用格，分为主体和完成阶段。普通放人、额外放人、搬迁和无人员用格进入此边界；只放人不执行目标的效果不进入。主体包括支付、选择、替换后代和强制子流程。只有主体事件进入本次用格收据；反应奖励及嵌套用格保留各自身份。
- 主体最后一步完成时，空间反应和已捕获的规则反应共用既有 owner/trigger-select 调度：所有 `immediatelyAfter` 完成后才进入普通 `after`。多步主体内较早完成的规则动作保留既有顺序。`space-use-runtime.ts` 分别在每个阶段入口捕获空间来源，因此立即反应可为随后 after 阶段引入新来源，但不会重放较早的规则反应。阶段内已捕获来源保持固定，handler 读取实时状态。scope 元数据和收据保存在私有引擎游标，跨 pending、恢复和撤销保留。
- 真实 `place-farmer` wrapper 保留自己的规则动作完成点，包括带工人和无工人的 jump。顶层放置和 `place-farmer-on-space` 没有该 wrapper，由 scope 仅将放置动作订阅加入共同 after 池。原生 scope 调度信息防止额外放置重复完成。移动不创建放置回调，合成完成点不重派主体事件订阅。每回合限次使用既有 Turn Scope 身份，不依赖某条反应最后被选择。
- 领域事实订阅显式声明 `events`，只匹配已完成 host 捕获的 `actionEvents`。本次事实缺失或不相关时不匹配，即使更广的 transaction 含有同类事实。它复用既有尾随 owner 和 trigger-select；记录事件不会另建完成边界。

**事件是规则事实的来源。** `EventStore` 为每个公开行动或内部 leaf 开启 transaction，只在成功时提交（失败、取消、回滚和跳过都不追加），按 `state.nextEventSeq` 重新编号，校验可见性、JSON 安全、大小与已知字段，并追加 `publicEvents.committed` 包。`state.log` 是事件 mapper 派生的 UI 缓存。Listener 读取 `transactionEvents` / `eventQuery`，资源事实不读未提交的全局 `state.events` 或 `context.result`。

- 农场修改事件（`farm.fieldPlowed`、`farm.roomBuilt`、`farm.stableBuilt`、`farm.fenceBuilt`）携带 `newlyUsedTiles`，在修改前后、尾随反应之前捕获。围栏提交还携带 `newlyEnclosedPastureTiles`。每个共同农场操作都为新增已用坐标发出 `farm.spacesUsed`；封锁状态修改使用同一事实。地形操作还发出包含层变化和新田的 `farm.terrainChanged`。计划领取的房间同样发出 `farm.roomBuilt`。
- 建房、建厩、犁地、围栏和地形的行动结果在原宿主完成点保留 `farmOperations`。结果与同一宿主的 `actionEvents` 一起经过支付子流程和持久化等待；嵌套行动各自持有结果，父行动不重新交付子操作。反应复用现有 owner/phase trigger-select，操作内部不另设 dispatcher。见 `server/__tests__/farm-operation-session.test.ts`。
- 地形消费者使用 `getActionTerrainOperations()`，先读取原结果收据，再回退到事件，避免返回 flow 的 sibling 将嵌套子操作当作父操作变化。Moor 特殊行动的延迟反应序列化自身捕获的地形事实。已用格消费者订阅 `farm.spacesUsed`，通过 `getActionNewlyUsedTiles()` 优先读取原结果收据，只回退到本宿主已提交的 `actionEvents`；围栏范围使用 `getNewlyEnclosedPastureTiles()`，均按玩家过滤；不从后来的几何重建差异，不保存行动前缓存，也不回退到更大的 Turn 范围。
- 印刷的围栏数量与触发只计算普通 `type='fence'` 段（`hasOrdinaryFenceBuiltEvent()`）。
- 动物兑换经 exchange / trade 路径扣减，使已安置动物保持同步。按 trade 的资源门槛使用 `immediatelyAfter.trade-applied` 与 `extraData.preResources`。

**触发帧。** 宿主行动提交时，引擎在任何 `afterHostCommitListeners` 修改之前冻结 `transactionEvents`、`actionEvents` 以及匹配到的尾随 listener 集合与顺序。延迟的续行复用这一帧，不重新匹配。`CardListenerContext.triggerSnapshot` 只存在于 `immediatelyAfter` / `after`，保存宿主提交时各玩家的 occupation / minor / major / improvement / played 列表；询问“这是第 N 张”的 listener 读取它，`check:card-impl-boundaries` 拒绝在这些阶段直接读取实时长度。激活时不再检查 owner 卡是否仍在原牌区。该帧随 `activate-card` 节点序列化。对返回 flow 的宿主的反应携带 `preservedTransactionEvents` / `preservedActionEvents`，后续每次提交都会扩展它们。

- 费用预览（`previewComputeCosts`）在查询纯度契约下求值 `computeCosts`，不克隆状态。

测试：`shared/engine/__tests__/{event-transaction,trigger-snapshot,hook-dispatch,continuation-event-scopes}.test.ts`、`shared/actions/effects/__tests__/farm-action-events.test.ts`、`shared/cards/__tests__/card-listener-zones.test.ts`。

### 公开 `ActionNode` 执行顺序

`computeReplace → before → strict isDoable → computeCosts → execute → immediatelyAfter → after`

1. `computeReplace` 最先执行，此前 `actionContext.targetSpaceId` 已解析出 `context.space`。只改 `actionId` 时，后续所有阶段沿用新 ID。
2. 每个匹配的 `decline + alternativeFlow` 贡献一棵完整子树。`buildReplacementChoiceNode()` 在原行动的可选提示前插入普通 XOR，并设 `requiresExplicitChoice=true`，即使只有一个替换也等待玩家选择；原分支保留其可选性，提供菜单时任何分支的 `before` 都不执行。选中的分支重新进入本管线，跳过自身 producer 以及从外层替换继承的所有 producer 守卫；原分支携带 `checkedReplaceAction`，只有分发器解读它。`resolvedReplacement` 让决定跨恢复保持；放人或移动授予新机会时重置 producer 守卫。
3. `before` listener 编译为原 leaf 之前的 `activate-card` leaf，按 owner 进入 trigger-select。使用前资格在实际使用行动格时收集一次（`collectBeforePlacementFlows`、`collectBeforeActionSpaceUseFlows`）；`requiresNewPlacement` 排除工人移动。
4. Strict `isDoable` 读取真实 `before` 修改后的状态：基础 `canBeExecutedByPlayer`、费用预览、hook 与 listener 的 `isDoable`。失败时，只有已接受的必选续行可以通过 `isAlreadySatisfied` 按同一 transaction 中先前的事实结算，此时本体与尾随 listener 不执行。选项级 listener 同样过滤职业手牌选项，`reserveResources` 传入支付 leaf。
5. `computeCosts` 填充 `executionContext.costs`、`costTrades`、`costBonuses`、`paymentResourceProviders` 与 `costAttribution`。
6. 执行本体（`getBaseChoiceOptions` 或 `execute()`）；`resolveChoice` 继续前重新校验可执行性与费用。
7. `immediatelyAfter` 与 `after` 从冻结的触发帧执行（[Hook 系统](#hook-系统)）。内部 `activate-card` 绕过本管线，把返回的 flow 交还引擎。

复合行动在展开前完成替换选择并保留延迟展开标记，子行动随后各自做替换决定（[ADR 0027](../adr/0027-composite-actions-use-existing-replacement-selection.md)）。`EngineTree.insertBefore()` / `insertAfter()` 保留父级 OR/XOR 的选择。直接 `cancel` 受保护原子行动（`plow`、`sow`、`construct`、`stables`、`fence`、`reorganize`、`selection`）会被可恢复地拒绝；可选性来自 `optional` metadata 与 `__skip__`，撤销来自历史。

测试：`server/__tests__/action-replacement-session.test.ts`、`server/__tests__/space-use-boundaries-session.test.ts`、`server/__tests__/space-use-listener-lifecycle-session.test.ts`、`shared/engine/__tests__/engine-pipeline.test.ts`、`shared/actions/__tests__/flow-replacement-admission.test.ts`。

### 当前步骤准入与 blocked 恢复

可用性与权威入口共用 `GameCore.applyIsDoableCheck()` 和 flow 准入 helper；普通放人与卡牌授予放人共用 `isPlacementActionDoableInFlowContext()`。见 [ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)。

- 当前原子步骤可执行，或适用的 `before` 能开始，行动即可开始；这不承诺能完成。SEQ 检查下一步，OR/XOR 检查任一分支入口。没有整条 flow 搜索；支付、动物容量和围栏几何仍是原子检查。
- 查询不消耗资源、激活、事件或私有游标，也不使用可用性缓存。
- `originalActionCondition` 是原分支的结构条件：空累积格不能被固定或附加收益重新开放，明确的替换仍有资格。
- 卡牌创建的行动格默认使用 Strict Action Entry；标准复合行动格显式 opt-in（[ADR 0018](../adr/0018-future-schedule-and-authoritative-action-entry.md)）。
- 递归 key 包含已消费的替换 producer ID，同名替代可以推进，无进展的循环会终止。
- 已接受的根与必选续行把义务传到复合后代；显式可选节点在接受前仍可跳过。不可用的必选节点进入 `engine-blocked`，保留已发生的效果，等待 `undoStep` / `undoAction`。非法输入恢复命令检查点并保留交互；已发出菜单中过期的选项被可恢复地拒绝。
- 本体开始前，不可用的必选宿主只在合法 anytime 列表非空时提供 Continue 窗口；Continue 严格复查，不重放 `before`。

测试：`server/__tests__/{anytime-admission-session,empty-accumulation-admission-session,moor-admission-deep-session}.test.ts`。

### Pay-child 不变量

- `pay` 是内部结算 child。公开宿主行动负责业务修改、事件与完成。禁止的形态：`seq:[pay, apply-*]`、顶层 `apply-*` effect、`PlayerState` 支付草稿或任何跨行动支付槽。
- `beforeHostListeners`、`afterHostCommitListeners` 与 `afterHostListeners` 编码每个宿主的支付位置。翻修、改良、职业、建房、围栏和马厩的强制支付在尾随效果之前结算，反应不能花掉仍欠宿主的资源。
- 改良与职业的 `onBuy` 在 `afterHostCommitListeners` 中执行：支付完成、宿主提交卡牌、执行 `onBuy`，再进入尾随反应。一次性自身打出收益放在 `onBuy`；打出的卡不匹配自身的 `occupation` / `improvement` 尾随反应，但仍计入触发快照。“打出某卡后”的效果监听已提交的宿主，不监听其 `pay` child。
- `shared/actions/helpers/improvement-purchase-lifecycle.ts` 负责购买支付后的提交（返还卡、传牌、`card.played` / `card.passed`、手牌变更）。`params.allowedPurchases` 约束所有候选来源；`purchaseActionCardId` 把本次购买节点来源传入 `onBuy`；`playedFromHand` 在手牌变化前冻结。
- 必选的 `afterHostCommit` 续行及其返回或注入的一切保持必选；不可执行的后代进入 blocked，使用普通撤销。listener 上的 `mandatory: true` 即使没有触发菜单也会传播。
- `animal-reorg` 请求把整理交给 Session 子流程，宿主保留自己的反应：`before` 一次，子流程结束后 `immediatelyAfter` / `after` 各一次。
- `activate-card-effect` 从内部结果表读取 `paymentInfo`，执行 `onBuy` 或阶段 hook；阶段激活携带 owner、target 与阶段 metadata。

测试：`shared/actions/effects/__tests__/pay-child-context.test.ts`、`shared/engine/__tests__/internal-children.test.ts`、`server/__tests__/action-hook-continuations-session.test.ts`。

## 阶段 hook

```text
准备阶段: onBeforeStartOfTurn → 增轮 / action.revealed → onAfterRevealAction → onPreparation
  → 累积格补充 → onRoundStart（StartOfTurn）→ onEndPreparation → onBeforeWork → onWorkStart → work.started
工作:    PlaceFarmer → 各原子行动 → onEndTurn → allWorkersUsed → onAllWorkersPlaced
回家:    onBeforeReturnHome → onStartReturnHome → onReturnHome
回合结束: onRoundEnd → onAfterRoundEnd
收获（第 4/7/9/11/13/14 轮）:
  onBeforeHarvest → harvestPrepWindow → onStartHarvest
  → onStartHarvestFieldPhase → onHarvestFieldPhase → reap [dispatch 'reap'] → reap reaction parallel
    → onAfterReap → onEndHarvestFieldPhase → onHarvest
  → postReapAnytimeWindow → onStartHarvestFeedingPhase → onHarvestFeedingPhase
    → feed → onEndHarvestFeedingPhase
  → breed → onEndHarvest → onAfterHarvest
终局前: 第 14 轮 onAfterRoundEnd 完成后，不进入第 15 轮准备窗口，
  onBeforeEndGame → preScoringWindow → gameover
```

阶段 hook 返回 `ActionFlow`，通过 `EngineStack` 作为可恢复子流程运行。**Stage Dispatch**（[ADR 0008](../adr/0008-node-parallel-reaction-dispatch.md)）是准备窗口、StartOfTurn、回合结束、收获前、收获田间阶段和终局前的共享模型：

- 每个窗口冻结玩家顺序（规则要求时从起始玩家标记顺时针），并在每名玩家进入时，按持牌、手牌启用的 hook 与纯 `stageEligibility` 查询捕获一棵固定的 `activate-card-effect` 来源树。来源发现从不按当前支付能力过滤。
- 单个来源直接展开；多个来源进入 `ParallelNode(mode='trigger-select')`。每次选择后，handler、支付与必选 / Pass 状态按实时克隆预览重算。已完成的来源不重放；窗口内打出的卡只参加后续窗口。
- 窗口上下文、玩家顺序与树游标保存在 `stageResume`；恢复时不重扫牌区，也不重读已变化的标记。旧的串行阶段保留 `resumeAfterCardId` 用于自身索引恢复。
- 嵌套可选分支保留兑换机会，不削弱必选根。`requiresExplicitChoice` 在实时兑换可能提供资金时保持购买选择开放。
- 阶段完成时，未安置动物先嵌套现有 `reorganize` flow，再恢复帧。
- 阶段子流程的私有事件保留到最外层响应。

各窗口的不变量：

- **准备阶段**：`onRoundStart` 即 StartOfTurn；`onBeforeStartOfTurn` 在轮次增加前执行并收到 `nextRound`；揭牌上下文保留实际 `actionId` / `roundSlot`。工作顺序（`roundFirstPlayerId`）在 StartOfTurn 之前冻结。`startFirstRoundAfterSetup()` 是新局的唯一入口：bootstrap 不提前累积，加载工作阶段状态也不重新准备。
- **StartOfTurn**：回合开始激活、计划领取、付款门控的 offer 和计划行动共用一棵玩家树。到期的普通货物按玩家合并为一次 `receive`，保留各条目来源且不触发 Gain；带 `roomType` 或 `actionContext.resourceCondition` 的条目各自单独一次 `receive`，保留自身的领取条件与依赖；`futureMeeple.resolved` 只在实际领取后提交。
- **未来计划**（[ADR 0018](../adr/0018-future-schedule-and-authoritative-action-entry.md)）：Exact Future Target 保留目标轮，超出 `current round < target <= 14` 时丢弃；Future Prefix 保留仍存在的连续后缀。一次性的未来 offer 使用 `scheduled-offer` 行动与 `cardStates[cardId].extraData.scheduledOffers`，不用资源 token。卡牌排未来 token，不自写 `targetRound` 状态机。
- **回合结束**：普通轮转与卡牌驱动的 Turn 共用 `buildEndTurnReactionFlow()` 的同一棵冻结来源树；窗口完成时关闭 Turn Scope 一次。卡牌以既有 Turn 身份记录每 Turn 一次的凭据。
- **收获前**：在收获跳过生效前冻结玩家顺序；所有玩家都参与；顺序保存在 `stageResume.extra.beforeHarvestPlayerOrder`。
- **跳过整个收获**：待生效标记在所有 `onBeforeHarvest` 之后激活一次，该轮之后的每个收获步骤、阶段 hook 和 listener 都排除该玩家。
- **收获准备**：`harvestPrepWindow` 依据 `preHarvestGoodsWanted` / `preHarvestGoodsWantedBeforeReap` / `maySkipHarvestFieldPhase` metadata，只提供可支付、有次数限制且能产出所需货物的 Harvest 兑换。使用次数按来源和轮次记录。
- **收割**：`reap` 是内部行动。完整收获使用 `trigger: { phase: 'harvest' }`；私人田间阶段收割不写收获摘要。`computeHarvestCount()` 返回带 `sources` / `tags` / `scope` 的数量，只能通过 `registerHarvestCountModifier()` 修改。逐作物 `reap` 事件汇入一个 parallel flow，之后才进入 `onAfterReap`。
- **收割后 anytime**：按收获顺序、在计算喂食之前提供；每个 flow 后重建。
- **喂食**：`computeHarvestFeedingRequirement()` 只能通过 `registerHarvestFeedingRequirementModifier()` 修改。feed 请求携带权威兑换目录（[Anytime 窗口策略](actions_zh.md#anytime-窗口策略)）；`handleFeedResolved()` 在任何修改前校验完整的有序计划。
- **繁殖**：`getBreedThreshold()` 取已打出卡中最小的阈值；`computeHarvestBreedOrderPriority()` 只调整繁殖顺序。
- **收获摘要**是规则事实：`harvestReapSummary`（作物、位置、数量应用）与 `harvestBreedSummary`（安置后结算的新生动物）保留到 `onAfterHarvest`；卡牌通过 `getHarvestOutcome()` 组合它们。
- **终局前**：`onBeforeEndGame` 按 target 座位顺序与 `beforeEndGameScope` 分发；`handHooks` 不支持它。随后 `preScoringWindow` 逐玩家只提供 `preScoring: true` 的 anytime listener，结束后才写 `gameOver`。计分前花费使用显式 flow；Scoring Reserve 不扣真实资源。
- **`onBeforePlayerTurn`** 是唯一的 non-flow hook：只做 skip-control，返回 `{ skipTurn?: true } | void`，从不返回 `ActionFlow`，也不产生 pending。
- **定时规则**：`CardEffect.timedRules` 声明闭合的 `TimedRule` / `RuleBody`，由原生注册编译进既有 hook；`timed-rules.ts` 不查询运行时注册表。执行期公式来自 `rule-queries.ts`。

测试：`server/__tests__/{preparation-bga-session,before-harvest-reaction-dispatch-session,stage-animal-settlement-session,parallel-trigger-multi-session}.test.ts`、`server/__tests__/stage-hook-flow.test.ts`、`shared/actions/__tests__/future-meeples-entries.test.ts`。

## Listener 纯度

`CardListenerRegistration.handler` 在分发、预览和可执行判断路径上是状态纯的 flow 构造器，对齐参考实现：反应收集只构造激活 leaf，状态修改发生在行动 leaf 中。

- handler 可以读取状态与事件，返回 `ActionHookResult`、`ActionFlow`、费用、可执行性或选项。每次修改，包括写自身 `cardStates[cardId]`，都是返回的 leaf（`gain`、`pay`、`special-effect`、`exchange` 或可复用的内部行动）。
- 分发从不为预先计算结果而执行 handler。listener 激活是普通内部 leaf（`activate-card`），携带 listener、卡牌、事件、owner 与触发玩家；`event.actionContext` 保留触发时的 `targetSpaceId`。
- **门禁**：所有会分发 listener 的 Vitest project 都安装 `shared/cards/__tests__/listener-purity-guard.ts`，为每次调用提供深层只读 Proxy，任何写入或返回实时引用都会失败。`pnpm run check:card-impl-boundaries` 静态拒绝所有已解析 handler 与 `deriveCardCostCandidate` 中对 context 的显式写入。没有豁免清单。
- **Trigger-select**（`ParallelNode`）负责 select、pass、mandatory 与 independent 语义，没有 listener 专用节点。结构暂不适用的 child 本轮隐藏，sibling 执行后重新评估；适用但付不起的 child 保持可见并禁用。`mandatory: true` 只在必选 child 适用且可执行时禁用 Pass。Card listener 的适用性只来自返回结果；阶段卡牌效果仍在克隆上预览。
- **before 可达性**：同一时机的多个 `before` listener 是由玩家排序的真实触发 flow，从不静态模拟。能让不可达行动变为可达的卡牌通过 scoped `isDoable` opt-in，并在 `skipBeforeTriggers` 下让开。Pass 门禁先用 `skipBeforeTriggers=true` 检查原行动，再只看通用替换回退。
- **逐配方分发**：`trade-applied` 执行确定性 `seq` / `parallel` flow 中的非可选 `special-effect` 与 `gain` leaf（`executeImmediateSpecialEffectFlows()`）。完整喂食批次使用普通 `exchange` 反应，支付与交互 flow 完成后才恢复喂食结算。
- **Owner 与切换**：owner 与触发玩家显式传递；跨玩家确认和撤销边界由运行时负责。`confirm-player-switch` 由交出控制的玩家提交，并建立撤销边界。
- **暂定续行**（[ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)）：每个修改命令都经过一个结算边界，带规范化身份与检查点；作用域、守卫、受保护观察和失败记忆保存在私有会话游标中。
- 不要给 `CardListenerRegistration` 增加 `order` 字段；稳定的回退顺序来自 `playOrderIndex`。

测试：`shared/cards/__tests__/listener-purity-guard.test.ts`、`shared/cards/__tests__/listener-purity-wave*.test.ts`、`server/__tests__/authoritative-command-settlement.test.ts`。
