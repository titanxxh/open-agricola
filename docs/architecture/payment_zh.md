# shared/actions/payment/ — 支付

[English](payment.md) | [中文](payment_zh.md)

> 本文件是中文翻译镜像；[payment.md](payment.md) 是唯一权威版本。

包入口（`shared/actions/payment/index.ts`）导出三个生产门面。`PaymentSolver`（`solver.ts`）负责可负担方案、支付选项、选项解析、执行和结构化收据，以及费用预览、typed-flat 费用、房间支付、简单 trade 副作用和卡牌费用候选 helper。`CardPurchasePayment`（`card-purchase.ts`）是改良购买使用的卡牌购买门面：预览、支付参数、支付选项检查，以及带收据与 Cost Attribution 的已选支付。`describePaymentEffectPreview` 为建造、马厩、职业与翻修格式化支付效果预览。`payment/internal/*` 只供 payment 包及其算法测试（`shared/actions/payment/internal/__tests__`）使用；`shared/actions/payment/__tests__/import-boundary.test.ts` 禁止其他导入。外部测试使用 `PaymentSolver` 或 `shared/actions/payment/__tests__/test-helpers.ts`。

**统一的 `ComplexCost` 模型。** 建房、翻修、围栏、马厩、犁地、职业、大小改良和 `pay` leaf 都经 `computeAllBuyableCombinations` 枚举：

| 字段 | 含义 |
|---|---|
| `fees` | 每次行动的固定费用。`computeCosts.costs` 的差值并入 `fees[0]`；负总额 clamp 为 0，折扣不会退还其他资源。 |
| `unitFee` + `nb` | 单位费用乘数量（房间、翻修房间、围栏段、马厩）。 |
| `trades` | `from → to` 替代。`Trade.scope: 'action'` 每次行动对资源池转换一次；`'unit'` 对每个单位行运行候选闭包。`minCost` / `maxCost`、`replaceUpTo`、`groupMin` / `groupMax` 约束使用次数；每个单位 `TradeUsage` 记录实际替换量。 |
| `bonuses` | 每次行动的折扣或折扣选择。`optional` 增加不用折扣的分支；`capDiscountAtCost` 把可变折扣封顶在当前费用；`trackChoiceIndex` 记录 `bonusChoiceIndex`；只有 `choiceAffectsState` 让选择免于支配剪枝；`conditions` 按数量重新求值。 |
| `costResourceRemovals` | 已应用的删除 `{ resource, sourceCard, savedByFee }`。输入是卡牌的 `CostResourceRemovalModifier`（`type: 'remove-resource'`，属于 `CostModifier`，不是 `ComplexCost` 的 key）；`applyCostModifiers()` 在枚举前从所有费用中删除该资源并记录到这里，使枚举在后续折扣后仍保持删除并归属节省量。表达“不再需要 X”时用它，不用超大封顶折扣模拟。 |
| `paymentResourceProviders` | 由卡牌或 `computeCosts` hook 提供的仅支付虚拟资源：可用量、可覆盖资源、消耗来源。它们以自身 key 出现在 `resourcesPaid`，不进入成本行或 `PlayerState.resources`。 |
| `paymentBudget` | 最终 `resourcesPaid` 的上限；不提供资源，也不提前限制几何或单位数。 |
| `minimumResourcesPaid` | 最终 `resourcesPaid` 的下限，在支配剪枝前检查；准入与支付 child 共用。 |
| `resourceReserve` | 支付后某资源池保留的最低总量。`PaymentSolver` 在支配剪枝之后按它和 hook 的 `reserveResources` 过滤；只过滤方案。 |

**固定管线顺序**（领域规则，不是卡牌优先级）：基础候选（`fee`、`fees`、`unitFee`、动态 `getBaseCosts`）→ 结构性删资源 → 候选闭包 → action 级 trade → bonus → 卡牌提供的支付资源 → card → 可负担方案 → `paymentBudget` / `minimumResourcesPaid` 过滤 → 支配剪枝与排序 → `resourceReserve` / `reserveResources` 过滤。

- **候选闭包**（[ADR 0004](../adr/0004-candidate-closure-replaces-cost-modifier-ordering.md)）：卡牌购买和职业费用先规范化为 Cost Candidate List，再对所有 `deriveCardCostCandidate` 转换求不动点并做强制饱和。结果与注册顺序无关；候选转换和 `TradeModifier` 都没有 `order` 字段。每个 resources + `originalFeeIndex` 组保留一条代表行。卡牌只声明单候选转换与 `cardCostCandidateMandatory`；动态基础费用来自 `CardImpl.getBaseCosts()`。静态消费者通过 `getPrintedImprovementCostCandidates()` 读取印刷候选。
- **两条费用路径**（[ADR 0003](../adr/0003-card-purchase-compute-card-costs-candidates.md)）：大小改良与职业费用走候选管线；其他行动聚合 `computeCosts` 结果。候选 metadata（`sources`、`originalFeeIndex`、Cost Attribution）不进入 `PaymentSolution`。构建选项时（`describePaymentSolution()` / `describePaymentEffectPreview()`）在选择之前把 `sources` 并入每个选项的 `sourceCards`；`PaymentReceipt` 则把它们保留为 `candidateSources`，与 `costAttribution` 并列。
- **支配剪枝**在资源可行性过滤之后执行，豁免支付路径身份、影响状态的 bonus choice 和 card 支付。
- **Cost Attribution**：saved / paid 统计来自归因，不来自 pay leaf 的 `sourceCard`。行动 `computeCosts` 声明 `costAttribution`；宿主在真实执行后写入 clamp 后的前后差值。
- **支付选项身份**：选项值为 `<prefix>:<index>~<identity>`。即使重算后列表位置变化，也按身份结算；支付已不存在时可恢复地拒绝并保留菜单。
- **收据**：职业与改良提交保留所属宿主付款的准确资源、bonus 来源和返还卡；免费打出携带显式空收据。
- **Supply token 也是支付资源**：围栏和马厩像普通资源一样流经 `cost`、solver、`resourcesPaid` 和 `resource.paid`。支付只增加 `player.supplyTokensConsumed`。剩余容量通过 `getOwnOrdinaryFenceBuildLimit()`、`getOwnOrdinaryFenceReserveCount()` 或 `getAvailableStableSupplyCount()` 读取。
- **授予的费用优惠**：授予的翻修在自身 leaf 的 `actionContext.costBonuses` 中携带可序列化、有来源的 `Bonus[]`，按实时目标与 `computeCosts` 合并；不安装临时玩家 modifier。
- **校验**：`validateComplexCost` 在开发环境抛错，生产环境记录日志并降级为无方案。`validateTradeModifier`（单位 trade 不得带 `minNumRooms`，组上下限须一致）和 `validateBonus` 在任何环境都抛错。带 `costType` 的费用枚举会丢弃 `resourcesPaid` 含负值的分支；不带 `costType` 的 `ComplexCost` 不丢弃。
- **资源承诺**（[ADR 0019](../adr/0019-resource-commitments-preserve-unsettled-trades.md)）在命令边界检查，不是预付，也不是 solver 预留。

测试：`shared/actions/payment/internal/__tests__/{candidate-closure,cost-modifier-permutation-probe,enumerate,cost-modifiers}.test.ts`、`shared/actions/payment/__tests__/{solver,card-purchase}.test.ts`、`shared/actions/effects/__tests__/{improvement-cost-candidates,pay-supply-token,renovation}.test.ts`。
