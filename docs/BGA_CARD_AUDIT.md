# BGA 卡牌对照审查

本轮审查聚焦当前已实现的 196 张卡，不按牌组平铺，而按“和 BGA 相比最容易重复样板、最值得抽象”的模式分组。

## 结论

- 底层能力已经够用：`flow`、`CardListener`、`card-effects`、`internal-actions`、支付预览链路都已接上。
- 当前主要差异不在“规则缺失”，而在“卡牌糖衣层太薄”。
- 最显著的重复是 4 类：
  - 支付后得资源 / 追加行动
  - 把资源放回当前行动格后再得收益
  - `card-choice` 的 pending 数据存取
  - 阶段型 `card-effects` 中的支付、标记、单次收获兑换

## 分组审查

### 1. 已接近 BGA 的支付后跟进类

这些卡的规则已经齐，但此前常把“支付”和“收益/追加行动”拆散在单卡文件里手写：

- `shared/cards/A/A37_Bucksaw.ts`
- `shared/cards/A/A108_MushroomCollector.ts`
- `shared/cards/B/B109_PaperMaker.ts`
- `shared/cards/C/C96_Merchant.ts`
- `shared/cards/E/E128_Saddler.ts`

本轮收敛后：

- `A108_MushroomCollector` 改成 `returnToSpaceThenGainFlow`
- `B109_PaperMaker` 改成 `payThenGainFlow`
- `C96_Merchant` / `E128_Saddler` 改成 `payThenActionFlow`
- `A37_Bucksaw` 已收敛为真正的一体化 `payGainNode`

和 BGA 的差距已缩到“是否需要额外 VP 后置处理”这一层，而不再是每张卡自己维护整套流程。

### 2. 通过 flow 标签收敛的 choice 类

这组卡和 BGA 一样，本质上不是简单 optional pay，而是带自定义标签与分支的选择：

- `shared/cards/C/C75_Firewood.ts`
- `shared/cards/D/D119_WoodBarterer.ts`

此前的问题不在于规则本身，而在于我们为了保留自定义标签，额外绕了 `card-choice` 和 pending 数据：

- 初始化 `player.cardStates.__pendingChoice__`
- 写 `extraData`
- 在 `after(card-choice)` 中判定是否属于本卡
- 清理 pending 数据

现在这组卡已经进一步收敛为直接 `xor` / `seq` flow：

- `D119_WoodBarterer` 直接返回带自定义 choice label 的 `xor`
- `C75_Firewood` 直接返回 `take-from-card` 分支，不再维护 `__pendingChoice__`

为此补的关键抽象是“flow 叶子节点自定义 choice label”，这让选择文案不再绑死到 action name。

### 3. 阶段型卡牌的抽象补齐

和 BGA 相比，阶段型卡牌此前最大的缺口是“缺少统一 helper 层，以及阶段钩子还不能稳定回流到引擎 flow”：

- `shared/cards/B/B70_NewPurchase.ts`
- `shared/cards/A/A166_Haydryer.ts`
- `shared/cards/D/D99_EarthenwarePotter.ts`
- `shared/cards/major/joinery.ts`
- `shared/cards/major/pottery.ts`
- `shared/cards/major/basketmaker.ts`

现在已经有两层补齐：

- `shared/cards/helpers/stage-effects.ts`
  - 回合阈值标记：`markCardCounterIfBoughtByRound`
  - 阶段型支付换收益：`tryStagePayGain`
  - 支付资源换 bonus VP：`payForCardBonusVp`
  - 单次收获兑换：`createSingleHarvestExchange`
- `GameSession` 阶段 flow
  - `onBeforeHarvest`、`onEndHarvestFeedingPhase`、`onEndHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn` 已可返回 `ActionFlow`
  - `C71_SlurrySpreader` 这类“繁殖后追加播种”的 BGA 语义，已经不需要在单卡里写即时 imperative 分支

这样阶段型卡不只是减少样板代码，也已经能在多个阶段点上暂停、恢复，并走和普通行动一致的引擎执行链。

### 4. 仍有差距的阶段行为

这轮已经把阶段 hook 的主要协议层缺口补上，但和 BGA 仍有两类差距：

受影响最明显的是：

- 仍有一部分阶段卡只完成 helper 收敛，还没完全改写成声明式 flow 分支
- `onStartHarvest`、`onHarvestFieldPhase`、`onAfterFeed` 这类阶段点虽然已在协议里，但还没有像前述阶段那样被更多真实卡牌覆盖验证

结论是：

- 短期内，阶段卡的“可暂停 flow”主干已经够用
- 后续若要继续贴齐 BGA，重点应转向扩大真实卡牌覆盖，而不是再补一轮全新的协议

## 新增/扩展 helper 清单

### 已新增

- `shared/cards/helpers/pay-gain-node.ts`
  - 现在的 `payGainNode` 是真正的一体化支付后收益/VP helper
  - 新增 `payThenGainFlow`
  - 新增 `payThenActionFlow`
  - 新增 `returnToSpaceThenGainFlow`
- `shared/cards/helpers/card-state.ts` + `round-placement.ts`
  - 统一一次性卡牌的 `flagged/extraData`
  - 统一“本轮放人顺序”这类运行时时序状态，供 `D150_GodlySpouse` 复用
- 引擎 flow leaf 自定义 choice label
  - 让 `xor/or` 分支可直接表达带文案的卡牌选择
- `shared/cards/helpers/pending-choice.ts`
  - 统一 `store/read/consume` pending choice
  - 提供 `createPendingChoiceFlow`
- `shared/cards/helpers/stage-effects.ts`
  - 统一阶段支付、标记、bonus VP、单次收获兑换

### 已验证命中的卡

- 支付后收益/追加行动：`A37_Bucksaw`、`A108_MushroomCollector`、`B109_PaperMaker`、`C96_Merchant`、`E128_Saddler`
- choice 流程：`C75_Firewood`、`D119_WoodBarterer`
  - 现已迁到直接 flow 分支，`pending-choice` 仍保留给其他尚未收敛的 `card-choice` 卡牌
- fencing delta：`A83_ShepherdsCrook`
  - `fence-validation -> farm-choice -> GameSession -> Engine` 现已透传 `newPastures/newEdges`
  - `A83` 不再维护 `processedBigPastures` 之类的累计计数，而是直接按本次新增 pasture delta 判定
- 时序/一次性状态：`A17_ReclamationPlow`、`D150_GodlySpouse`
  - `A17` 改为 `before(collect)` 记录快照，`after(collect)` 只返回瘦身后的 xor flow，消费标记不再依赖不存在的 `pass/special-effect`
  - `D150` 改为基于 round placement order 的单叶子分支，不再手写 `placedThisTurn`
- 同行动快照：`A74_StableTree`
  - `A74` 现在统一复用 action snapshot，`after(stables)` 与 `onBuy` 共用同一段“本行动是否已建畜栏、且本行动未触发过”判断
  - 原先按整轮去重的 `usedRound` 已去掉，改为更接近 BGA 的“同一 turn 只触发一次、后续 turn 可再次触发”
- 阶段型 helper：`B70_NewPurchase`、`A166_Haydryer`、`D99_EarthenwarePotter`、`Major_Joinery`、`Major_Pottery`、`Major_Basket`
- 阶段 flow 落点：`C71_SlurrySpreader`
  - `onEndHarvestFeedingPhase` 快照繁殖前动物数，`onEndHarvest` 判断是否达到“两种新生动物”并返回可选 `sow` flow

## 下一阶段建议

若继续往 BGA 靠齐，优先级建议如下：

1. 扩大阶段 flow 的真实卡牌覆盖，优先补 `onStartHarvest`、`onHarvestFieldPhase`、`onAfterFeed` 上仍缺实现样本的牌
2. 继续把还在走 `card-choice` 的实现迁到“自定义 label 的 flow choice” 抽象，复用 `D119_WoodBarterer` / `C75_Firewood` 这轮模式
3. 继续清理 `usedRound`、`flagged`、`processedBigPastures` 这类流程状态，让更多时序卡回到声明式 helper
