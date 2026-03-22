# BGA 卡牌对照审查

本轮审查聚焦当前已实现的 196 张卡，不按牌组平铺，而按“和 BGA 相比最容易重复样板、最值得抽象”的模式分组。

## 结论

- 底层能力已经够用：`flow`、`CardListener`、`card-effects`、`internal-actions`、支付预览链路都已接上。
- 当前主要差异不在“规则缺失”，而在“卡牌糖衣层太薄”。
- 最显著的重复是 4 类：
  - 支付后得资源 / 追加行动
  - 把资源放回当前行动格后再得收益
  - 带自定义 label 的 choice flow
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

当前仓库里，这类卡已经不再依赖 `__pendingChoice__` 或 `after(card-choice)` 这一套中转流程，`card-choice` 也不再是这组卡的主路径。

### 3. 阶段型卡牌的 helper 已补齐第一版

和 BGA 相比，阶段型卡牌当前最大的变化已经不是“缺 helper”，而是下面这些代表卡已经开始共用两层 helper：

- `shared/cards/B/B70_NewPurchase.ts`
- `shared/cards/A/A166_Haydryer.ts`
- `shared/cards/D/D99_EarthenwarePotter.ts`
- `shared/cards/major/joinery.ts`
- `shared/cards/major/pottery.ts`
- `shared/cards/major/basketmaker.ts`

本轮新增/收敛出的通用层主要是：

- `shared/cards/helpers/pay-gain-node.ts`
  - 统一阶段/行动里“可选支付后得收益/VP/标记”的 flow 外壳，`payGainFlow` 已可直接表达 BGA 风格的阶段可选支付
- `shared/cards/helpers/stage-effects.ts`
  - 回合阈值标记：`markCardCounterIfBoughtByRound`
  - 阶段型即时支付换收益：`applyStagePayGain`
  - 支付资源换 bonus VP：`payForCardBonusVp`
  - 单次收获兑换：`createSingleHarvestExchange`

这样阶段型卡至少不再在单卡里重复写“能否支付 / 扣资源 / 加资源 / 记 VP / 标记状态 / 包一层 optional flow”的样板。

### 4. 已接上协议层的阶段可选行为

这轮已经抹平的一点，是 BGA 在阶段钩子里常直接返回 `NODE_OR` / `payGainNode`，而我们现在至少在代表性的阶段卡上，已经接成同类的可选 flow。

受影响最明显的是：

- `shared/cards/B/B70_NewPurchase.ts`
- `shared/cards/A/A166_Haydryer.ts`
- `shared/cards/D/D99_EarthenwarePotter.ts`

这些文件现在都不是“阶段钩子中的 imperative 实现”了，而是直接在 `onBeforeHarvest` / `onAfterHarvest` / `onBeforeStartOfTurn` 中返回 `ActionFlow`：

- `A166_Haydryer` 直接返回 `payGainFlow`
- `D99_EarthenwarePotter` 直接返回 `payGainFlow`
- `B70_NewPurchase` 直接返回由两个 `payGainFlow` 组成的 `seq`

配套协议层也已经接通：

- `shared/cards/card-effects.ts` 把 `onBeforeHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn` 定义成 `FlowEffectHandler`
- `server/game-session.ts` 通过 `continueStageHook()` / `startStageFlow()` 为这些阶段 hook 创建引擎、维护 resume cursor，并在阶段推进完成后恢复主流程

结论是：

- `onBeforeHarvest` / `onAfterHarvest` / `onBeforeStartOfTurn` 这一层的协议缺口已经补上
- 当前剩余差距更多在于把同类模式继续推广到更多阶段 hook，以及把 helper 命名和分层再收敛，而不是这三类 hook 还不能返回 flow

## 新增/扩展 helper 清单

### 已新增

- `shared/cards/helpers/pay-gain-node.ts`
  - 现在的 `payGainNode` / `payGainFlow` 是一体化支付后收益/VP helper
  - 新增 `payThenGainFlow`
  - 新增 `payThenActionFlow`
  - 新增 `returnToSpaceThenGainFlow`
- `shared/cards/helpers/card-state.ts` + `round-placement.ts`
  - 统一一次性卡牌的 `flagged/extraData`
  - 统一“本轮放人顺序”这类运行时时序状态，供 `D150_GodlySpouse` 复用
- 引擎 flow leaf 自定义 choice label
  - 让 `xor/or` 分支可直接表达带文案的卡牌选择
- `shared/cards/helpers/action-snapshot.ts`
  - 统一单次行动起点快照，供 `A74_StableTree` 这类“同一行动内前后联动”的卡复用
- `shared/cards/helpers/stage-effects.ts`
  - 统一阶段标记、即时支付、bonus VP、单次收获兑换

### 已验证命中的卡

- 支付后收益/追加行动：`A37_Bucksaw`、`A108_MushroomCollector`、`B109_PaperMaker`、`C96_Merchant`、`E128_Saddler`
- choice 流程：`C75_Firewood`、`D119_WoodBarterer`
  - 现已迁到直接 flow 分支；这类卡牌不再依赖 `__pendingChoice__` / `after(card-choice)` 的中转写法
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

## 下一阶段建议

若继续往 BGA 靠齐，优先级建议如下：

1. 把已经打通的阶段 flow 模式继续推广到更多适合暂停/恢复的阶段 hook，而不是只停在 `onBeforeHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn` 这几个代表案例
2. 后续新增同类卡牌时，优先直接返回“带自定义 label 的 flow choice”，不要回退到 `card-choice` / `__pendingChoice__` 的旧中转模式
3. 再处理 `usedRound`、`flagged`、`processedBigPastures` 这类纯流程状态，让更多时序卡回到声明式 helper
