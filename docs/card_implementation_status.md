# 卡牌实现现状报告

> 生成/更新日期：2026-06-19。本文件替代 `docs/card_desc_audit.md`、`docs/card_progress.md`、`docs/master-plan.md`、`docs/bad-smell.md`。BGA 唯一基准：`/data00/home/xuxinhao.titan/raw/bga-agricola`。

## 1. 当前快照

| 项目 | 状态 |
|---|---:|
| BGA A-E canonical 卡牌 | 888 |
| OA A-E canonical 卡牌定义 | 888 |
| 自动 metadata 脚本 literal mismatch | 0 |
| 自动 metadata 脚本 complex mismatch | 4 |
| 其中 schema-up 已接受差异 | 4 |
| 需要实现复核的卡牌 | 0 |
| 已接受 / 产品策略差异 | 41 |
| 排除的 BGA legacy 或未实现行为目标 | 51 |
| 本轮审计视为已对齐 | 796 |
| Parent Cards 扩展结构化定义 | 24 / 24 |
| Parent Cards gameplay 接入 | setup / simultaneous selection / mother rewards via futureMeeples / parentCards fractional scoring / ordinary-card draw deck + keep UI / father simple + complex side quest 已接入 |
| 6 人 Major Improvement supply | 标准 10 张 + duplicate concrete id 8 张；6 人局通过 stack-aware supply 只暴露当前 top，2-5 人仍使用标准 flat supply |

说明：`scripts/audit-bga-metadata-diff.ts` 现在会解析 BGA `STABLE` 打印成本和 `passing`。当前 literal mismatch 0（passing 已全部对齐）。当前 complex mismatch 是 4 个已接受的 schema-up prerequisite 差异。

Parent Cards 扩展当前完成 PR01-PR12 / PS01-PS12 的结构化数据、runtime portrait/back assets、资产解析、完整注册表校验、可选开局设置、同时 mother/father 选择阶段、mother round gain 通过 `state.futureMeeples` / `receive` / `futureMeepleActions` 后端结算、mother schedule log 通过 `parent.motherScheduled` public event 派生、`parentCards` 小数计分类别、供父亲卡奖励使用的普通 occupation/minor 后端抽牌牌堆、draw-3-keep-1 私有选择基础设施、keep-one transport command 与前端保留选择 overlay，以及 father cards simple/complex side quest 完成入口、奖励结算和完成 infobox。Parent selection 候选与 ordinary draw decks 使用非公开 seed，不从公开 `gameSeed` 派生；ordinary draw keep-one choice 处理前，普通行动与 anytime action 均被后端阻塞。复杂奖励覆盖 PS02 house material、PS03 draw-3 keep-1、PS04 building resource choice（option value / internal label 区分资源组合，UI 通过 `descriptionPreview.effectPreview` 渲染资源图标）、PS07 backend sow flow（最少 1 块田、最多 N 块田，sow 成功后才标记完成）；father resource / completion marker 奖励通过既有 `gain` / `special-effect` ActionFlow 执行。Parent Cards 前端按横向整卡比例展示，dev hover 可显示 parent card id，parent selection 阶段会显示本玩家已 draft/持有的 occupation + minor，开局日志会展示 mother 奖励预约到对应回合的效果，ActionBoard 直接读取后端 `state.futureMeeples` 并按普通 future token 方式显示 mother 奖励，在游戏内已打出卡牌区支持 hover 横向大图预览；普通 simultaneous draft 每个玩家提交后后端立即写入 kept 并发出私有 draft update，进入最后一轮且只剩唯一 occupation/minor 时由后端自动分配，Parent Cards 选择中只剩唯一 mother/father 的玩家也由后端自动提交。它不进入 A-E Card Source、cards-manifest、普通手牌或常规卡牌注册表；adoption / 让子仍未接入。

审计规则：优先核对卡牌描述文本、custom description、cost、prerequisite、passing、职业/小改 metadata，以及游戏规则行为。BGA 平台/工坊字段如 `banned`、`implemented`、`isCorbariusOrDulcinaria`、`isArtifexOrBubulcus` 不作为对齐要求；如果它们影响产品策略，只记录为已接受差异或排除项，不记为实现 bug。

## 2. 问题优先汇总

BGA PHP 路径默认相对 `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards`；OA 路径默认相对本仓库。

当前没有开放的问题优先条目。

## 3. 已接受差异

除非产品方向改变，以下内容不算当前 bug。

2026-05-25 重审后，旧 `docs/card_progress.md` §5/§6 的“已接受简化 / 刻意行为差异”不再作为接受依据；相关卡牌已改列 §2 / §11，或在重审后改为已对齐。

| 类别 | 卡牌 |
|---|---|
| 用 schema-up metadata 替代 BGA custom `isBuyable` | `A3_PaperKnife`, `B56_Brook`, `B74_ThickForest`, `B154_SheepKeeper` |
| field/cardField 作物约束差异 | `E70_CropRotationField` |
| BGA 未实现，但 OA 有产品扩展/重写 | `A113_HeresyTeacher`, `D25_WitchesDanceFloor` |
| BGA banned，但 OA 保留 | `A131_CraftTeacher`, `A133_Braggart`, `A14_CarpentersHammer`, `A33_BigCountry`, `A39_Chapel`, `A48_ShavingHorse`, `A82_WorkCertificate`, `A97_Freshman`, `B10_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B15_CarpentersBench`, `B161_Weakling`, `B21_HayloftBarn`, `B22_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C28_TeachersDesk`, `C31_WritingChamber`, `C3_CarriageTrip`, `C60_SmallPottersOven`, `C63_CraftBrewery`, `C99_GardenDesigner`, `D137_TradeTeacher`, `D19_PulverizerPlow`, `D21_Recruitment`, `D33_SummerHouse`, `D4_CrossCutWood`, `D74_RoyalWood`, `D92_ChildOmbudsman`, `D97_BeggingStudent`, `E22_GuestRoom` |
| BGA stable / FarmHand 模型差异 | `B85_FarmHand` |
| Candidate Closure：optional 分支候选集是 BGA 单一 topo 序产物的合法超集；solver 层支配剪枝（ADR 0004 Amendment）后玩家可选集合与 BGA optimal 集一致，单选项 auto-resolve；卡牌提供的虚拟支付资源以自身 key 进入 `resourcesPaid`，与玩家库存资源不互相支配 | 全部 card-purchase / unit-trade cost 修改卡；B155 这类行动格支付资源 |
| Candidate Closure：等价候选行（同 resources + originalFeeIndex、仅 sources 不同）只保留一条代表行（sources 最少 → key 字典序，ADR 0004 Amendment）；玩家不再看到仅归因不同的重复支付选项，未选中链的卡不进该选项 hover 归因 | 全部 card-purchase cost 修改卡（C95/E109 fixed-price 双子、A75/D117 bypass 链等） |

## 4. 简洁度审阅

行数只是信号，不是结论。复核口径：按当前 Card Source 文件和 canonical BGA PHP 文件统计非空非注释行；方法 / 函数声明行保留。仅剔除 OA 的 `import` / `export` 行，以及 BGA 的 `<?php` / `namespace` / `use` 行。

简洁度比较要先排除 BGA 坏味道：如果 BGA 通过 `Actions/*`、`Core/*`、`Models/*` 等主路径，或其他卡牌文件里的显式 cardId 分支来补某张卡的行为，这张卡不进入简洁度比较。BGA `implemented=false` 的卡没有可比实现，直接跳过且不在本节列出。

剔除 BGA 坏味道和未实现项后，当前 OA/BGA > 1.5 且可公平比较的卡牌剩 7 张：

| 卡牌 | BGA | OA | 比例 | 原因 / 后续判断 |
|---|---:|---:|---:|---|
| `B93_Confidant` | 59 | 132 | 2.24 | BGA 用 `FOODPLUS` future meeple + `getPostReceiveBonus()` 隐式串起返还 food 后的 sow/fence；OA 还要显式处理职业支付时的 `reserveResources`、lessons doability、future meeple resolved provenance、防重复 `lastResolvedRound`、以及 1 wood fence policy。可等 future meeple 支持 post-receive bonus 后再简化。 |
| `C150_ParrotBreeder` | 67 | 147 | 2.19 | BGA 直接读座位 / actionCardId，并用 flag + extraData + dummy playerConstraint 注入已占行动格；OA 需要显式追踪右邻、anytime 付 grain 后 flag、自己 / 对手放人后清理、再向 `place-farmer` 注入 occupied option。完整单卡状态机，暂不抽通用 helper。 |
| `C94_StableCleaner` | 42 | 78 | 1.86 | BGA 直接返回 fixed-cost `STABLES` flow；OA 在暴露 anytime 前要 probe `stables` 的 cost modifier / affordability，并显式包 flag、`trueAction:false`、固定 cost context 和执行后清理。若 anytime action 可统一内建 affordability probe，可再降。 |
| `B157_Salter` | 104 | 177 | 1.70 | BGA 的 `payNode` / `argsSalt` / `actSalt` 承担动物选择与支付；OA 需要自定义 `resource-quantity-select` ad-hoc action、校验动物必须来自农场且 reserve 为空、从 board 扣动物、单动物快捷路径、future food schedule 和日志。BGA 本身也长，优先级低。 |
| `A130_MummysBoy` | 53 | 90 | 1.70 | BGA 依赖 `Globals::getPlacedFarmers()` / `Farmers` manager 直接找到第 2 个农夫位置并注入 dummy action；OA 需要用 placement order、occupied-space option、meeting-place 过滤、once-per-round flag 和 start-turn 清理显式实现。和 C150 同类，除非抽 occupied action helper，否则保持卡内闭环。 |
| `B156_StorehouseKeeper` | 29 | 44 | 1.52 | BGA 用 `isActionCardEvent('ResourceMarket')` + `gainNode` XOR；OA 需要显式列出 resource-market 变体并包 listener / typed flow。低边界项，只有出现更多 action-space alias 卡时才值得抽 helper。 |
| `B107_Manservant` | 33 | 50 | 1.52 | BGA 的 `onBuy` 复用 `onPlayerAfterRenovation()` 并直接返回 `futureMeeplesNode`；OA 需要复用 `placeFood`、after-renovation listener、stone-house guard、`queueFutureMeeples` + node bridge。低边界项，优先级低。 |

因 BGA 坏味道而排除的卡牌：

| 卡牌 | 排除原因 |
|---|---|
| `D36_BreedRegistry` | BGA 在 `Core/Stats.php` 为本卡更新 infobox。 |
| `E161_ElderBaker` | BGA 在 `ActionCards.js` 和 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `C88_CarpentersApprentice` | BGA 在 `Actions/Fencing.php` 和 `Actions/Stables.php` 对本卡做主路径特判。 |
| `A41_VegetableSlicer` | BGA 在 `Actions/Pay.php` 对本卡做支付路径特判。 |
| `A87_Conservator` | BGA 在 `Actions/Renovation.php` 对本卡做翻修路径特判。 |
| `D131_CraftsmanshipPromoter` | BGA 在 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `D1_ZigzagHarrow` | BGA 在 `Models/PlayerBoard.php` 提供本卡专用几何 helper。 |
| `E16_BriarHedge` | BGA 在 `Actions/Fencing.php` 对本卡做围栏路径特判。 |
| `B138_ForestGuardian` | BGA `B100_Clutterer.php` 的其他卡牌路径显式枚举本卡。 |
| `C16_FieldFences` | BGA 在 `Actions/Fencing.php` 对本卡做围栏路径特判。 |
| `C27_Blueprint` | BGA 在 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `B146_Illusionist` | BGA `B100_Clutterer.php` 的其他卡牌路径显式枚举本卡。 |
| `B42_ForestInn` | BGA `E144_WaresSalesman.php` 的其他卡牌路径显式枚举本卡。 |
| `C162_ForestOwner` | BGA `E47_SyrupTap.php` 的其他卡牌路径显式判断本卡。 |
| `A106_SlurrySpreader` | BGA 在 `Actions/Reap.php` 对本卡做收获路径特判。 |
| `D132_HideFarmer` | BGA 在 `Managers/Scores.php` 对本卡做计分路径特判。 |
| `E96_Elder` | BGA 在 `States/TurnTrait.php` 对本卡做回合路径特判。 |
| `E155_Visionary` | BGA 在 `Actions/WishChildren.php` 和 `E130_Overachiever.php` 对本卡做特判。 |
| `E153_StoneSculptor` | BGA `E144_WaresSalesman.php` 的其他卡牌路径显式枚举本卡。 |

近期 PR / 本轮简化后已经降下来的旧高比例项：

| 卡牌 | 变化 |
|---|---|
| `A111_WallBuilder` | 本轮改为 after construct 直接返回 inline `futureMeeplesNode`，去掉 built-room delta、action snapshot token 和卡内 extraData 防重；按当前复核口径已低于 1.5。 |
| `B18_GrasslandHarrow` | 本轮让 future meeple 支持 `field`/`stable` 到期触发 action；B18 只保留 after-pay 计算目标轮并排 `field` future meeple，移除卡内 `targetRound` / `onRoundStart` 状态机。 |
| `E118_KindlingGatherer` | 本轮合并 `place-farmer` / `collect` / `gain` 三个同 handler listener，保留 action-space provenance 过滤。 |
| `E148_Lazybones` | 本轮抽出 `action-space-tokens` helper，统一 bounded token choice、choice resolve、owner-targeted token consume flow；E148 卡内只保留触发空间、空地判断和 helper 调用，按当前复核口径降至 BGA 65 / OA 66 = 1.02。 |
| `C41_FarmStore` | #244 后用卡内 `REWARD_OPTIONS` 表生成 optional pay/gain XOR。 |
| `D80_BrickHammer` | #244 后走 `getPrintedImprovementResourceCost()`，不再手写 cost / altCosts 分支。 |
| `E142_Smuggler` | #244 后 `TRADE_OPTIONS` 表生成同类 2x 选项，并保留 mixed optional OR。 |
| `E156_ClaypitOwner` | #244 后 printed/base cost helper 覆盖 minor altCosts 与 major fee candidates。 |
| `D117_WoodExpert` | #259/#272 后从当前 Cost Candidate List 派生候选，已低于 1.5 阈值。 |

后续简化原则：只有当同一种 helper 能服务至少两张当前或近期目标卡，才抽新抽象；否则维持卡内闭环。

## 5. 架构审阅

本轮审阅没有发现新的“仅前端裁定规则”路径，也没有开放的通用基础设施 blocker。下表只保留会继续约束新增卡牌 / 后续改动的架构事项；已完成的一次性基础设施记录不再作为待办保留。

| 事项 | 当前代码证据 | 后续约束 |
|---|---|---|
| Metadata 审计覆盖需要随字段演进同步 | `scripts/audit-bga-metadata-diff.ts` 已覆盖 `STABLE` cost 和 `passing`；当前 literal mismatch 为 0 | 新增 BGA metadata 字段时同步加 parser / diff fixture，避免统计口径回退。 |
| 后端权威的 action / pending 合同 | `allowedCommands`、typed request、`commitSelection`、`engine-resolve` protected cancel、`resolveEngineChoice` | 新增交互必须显式暴露 command / options 并由后端校验；不要恢复 encoded choice shortcut、old pending cursor 或前端裁定规则。 |
| 事件与支付 provenance | `resource.paid`、`bonusChoiceIndex`、`event-mapping-policy.ts`、`publicEventArchive`、`shared/cards/__tests__/provenance-result-audit.test.ts` | 支付 / 资源 / farm metadata 先 emit 结构化事件，再让 listener 消费；生产卡牌不要从 `context.result` 读取资源事实。 |
| Cost Attribution / hover stats | `CardResourceStats`、`trackSourceCardPaymentStats`、`recordCardCostAttribution()`、ADR 0003 | 成本变化卡牌的 saved / paid 展示必须走 Cost Attribution；card-purchase selected candidate 写入每个 source card 自己的 saved / paid delta；不要因为 pay leaf 携带 `sourceCard` 就把整笔 action / card-purchase 支付记成该卡 PAID。 |
| Printed improvement base cost helper | `getPrintedImprovementResourceCost()`、D80/E156 | 读取 minor / major definitions 的 printed/base cost candidates；`cost`、minor `altCosts`、major complex `fee` / `fees` 是候选组，按目标资源取最大值，不按实际支付或候选求和。 |
| Card-purchase ComputeCardCosts candidate pipeline | `resolveCardCostWithModifiersDetailed()`、`deriveCardCostCandidate` + `cardCostCandidateMandatory`、`CardImpl.getBaseCosts()`、`discountCardCostCandidate()`、ADR 0003、ADR 0004 | 购买 major / minor improvement 的新成本变形走 Cost Candidate List；A20/B36 这类动态基础费用在 pipeline 前产出 base candidates；卡牌只声明单候选转换，遍历 / 去重 / 饱和过滤由候选闭包负责（`CardListenerRegistration.order` 已删除，禁止重新引入顺序字段）；普通折扣天然保留原候选，后续 payment dominance 再隐藏严格劣势支付项；`cardCostCandidateMandatory` 只用于固定价 / replacement 这类必须隐藏原 candidate 的语义（如 A27），不可用于 A75 这类普通折扣；折到 0 的资源键省略；候选 metadata 不写入资源 map 或通用 `PaymentSolution`，由 improvement payment glue 合并到现有 `sourceCards`，并在支付选定后把 Cost Attribution 写入 Card Resource Stats。 |
| Payment bonus choices / unit cost alternatives | `Bonus.capDiscountAtCost`、`Bonus.trackChoiceIndex`、`Bonus.choiceAffectsState`、A16、C56、D88 | 普通 bonus choice 必须在折扣后不产生负 cost；typed cost payment 不保留 `resourcesPaid` 为负的 surplus 分支。BGA `addCost` per-unit alternative 先用 `scope:'unit'` trade 生成 cost row，再允许 D88 这类 bonus choice 继续替换。只有“移除当前 cost 中某资源”这类卡牌显式设置 cap 时，折扣才按当前 cost 封顶。`bonusChoiceIndex` 只表示玩家选了第几个 choice；只有 `choiceAffectsState` 标记的 choice identity 会被 after-pay 等 listener 消费并改变状态时，payment dominance 才禁止互剪。B145/D88 这类无状态 replacement choice 不设置该标记。 |
| Card-provided payment resources | `ComplexCost.paymentResourceProviders`、`PaymentSolution.paymentResourceCovers`、`B155_ArtTeacher`、ADR 0004 | 卡牌可在 `computeCosts` 内声明 payment-only 虚拟资源；provider 在卡牌内部定义可用量、覆盖比例和消费来源。虚拟资源不进入成本候选行或 `PlayerState.resources`，但会出现在 payment option / `resourcesPaid`；使用 provider 的 payment option 必须把 provider `sourceCard` 合入 `sourceCards` 以区分卡牌效果路径，并由 executor 消耗来源状态。 |
| Payment budgets | `ComplexCost.paymentBudget`、`fencePolicy.paymentBudget`、`B15_CarpentersBench` | 对最终 `PaymentSolution.resourcesPaid` 做资源上限过滤；不提供资源、不改变 cost row、不作为 `segmentBounds`。fencing 中用于 B15 这类“只能使用本次资源”的规则，必须在 free fence / computeCosts / payment solver 之后检查，禁止用 collected+1 段数上限替代。 |
| Candidate Closure（候选闭包，ADR 0004） | `candidate-closure.ts` `closeCandidates()`、`buildUnitCostOptions()` 闭包接入、`cost-modifier-permutation-probe.test.ts` | unit trade（D15/B145/A123 等）不再声明 `order`，`Trade.order` / `TradeModifier.order` 已删除；可达 cost row 集合由闭包求不动点产出，与修改器注册顺序无关；mandatory 饱和过滤保证强制折扣链任意序收敛；新增 cost 转换只声明局部语义（替换什么、mandatory 与否、maxUses），禁止重新引入任何顺序字段。 |
| 跨玩家 / 阶段 hook 调度 | `stageResume`、`confirm-player-switch`、`TriggerSnapshot`、`onBeforeEndGame`、`beforeEndGameScope` / `beforeEndGameDispatchMode` | owner prompt、trigger-select、before-end choice 必须保留 undo boundary 和触发时快照语义；trailing listener 读 snapshot helper，不读执行时 live count。 |
| 终局计分与 card bonus VP 统一模型 | `shared/domain/scoring.ts`、`scoring-reserve.ts`、`ScoreEntry.type='bonus'`、`cardBonusVp` category、ScoringPad / compact score 测试 | 所有非印刷卡牌奖励分进入 `cardBonusVp`；不要读取或兼容旧 `cardsBonus` / `cardStateBonusVp` / `cardBonus` score key。Scoring Reserve 只占用终局计分资源，不扣真实资源。 |
| 卡牌能力 metadata 与实现边界 | `CardDefinition` runtime capability fields、`playerHasCardCapability()`、`getPlayedCardDefinitions()`、`collectCardDefinitionsAs()`、`pnpm run check:card-impl-boundaries` | 跨卡身份 / 能力读 metadata/helper；生产 `shared/cards/A-E/*.ts` 不新增运行时外卡 id 分支，明确 allowlist 除外。 |
| 自定义卡 runtime / frontend metadata 拆分 | `shared/cards/custom-registry.ts`、`shared/cards/custom-card-metadata.ts`、`client/services/card-meta.ts`、`scripts/__tests__/eslint-client-boundary.test.ts` | server / sandbox 只注册 impl、session context、effects、listeners、modifiers；main client 只注册 display metadata、art URL、O 编号，不 import custom runtime registry。 |
| Card Source metadata / runtime 分离 | `shared/cards/card-source.ts`、`scripts/build-cards-manifest.ts`、`scripts/generate-register-all.ts`、`scripts/check-generated-cards-sync.ts`、`shared/cards/__tests__/card-source-representatives.test.ts` | Card Source 卡牌的运行时字段只放在 `impl`；manifest / generated catalog 只静态读取 `meta` 并输出 metadata 字面量；major runtime source 只在 `major/runtime.generated.ts` 进入后端实现路径；generated catalog 必须保持同步；workshop PR 生成必须基于已 fetch 的 upstream generated 文件 patch，不读部署机本地 cards tree；代表卡必须通过 production catalog / registry path 覆盖。 |
| Major Improvement stack supply | `shared/cards/major/supply.ts`、`GameState.majorImprovementSupply`、`availableMajorImprovements`、`MajorImprovements` panel | 6 人 duplicate major 是真实 card id，但 board availability 只暴露每个 stack 当前 top；major purchase / return-to-board / swap 必须通过 supply helper 同步 stack 与兼容 flat list，禁止在主路径散落 `availableMajorImprovements` push/filter 来表达 supply 变化。 |
| Parent Card Definition 数据边界 | `shared/parents/*`、`public/assets/parents/*`、`client/services/parent-assets.ts`、`client/app/parents/*`、`shared/parents/__tests__/parent-cards-complete.test.ts`、`shared/parents/selection.ts`、`shared/parents/mother-rewards.ts`、`shared/parents/father-completion.ts`、`shared/session/ordinary-card-draw.ts`、`shared/domain/scoring.ts` | Parent Cards 是扩展专用结构化数据和 runtime asset 引用，不属于 A-E Card Source / Card Definition / Card Impl 投影；setup / simultaneous mother+father selection、唯一 mother/father 后端自动提交、mother round gain 排入真实 `state.futureMeeples`、开局 mother schedule log 通过 `parent.motherScheduled` public event 派生、ActionBoard round slot future token、`parentCards` scoring、father simple/complex side quest 完成、奖励、draw keep-one transport + UI、ordinary draw pending action gate、sow completion marker、father resource choice structured preview 已由后端权威接入；候选与普通抽牌牌堆必须使用非公开 seed，不在前端补规则裁定。 |
| Farm / action-space source metadata | `FenceSegment.type/source`、`WorkerRef.synthetic.kind='linked-occupancy'`、stable count helpers、special-stable card-effect hooks、supply/family token helpers、`action-space-tokens` | fence、linked occupancy、special stable、stable count、token supply、行动格预留 marker 都走 source/type metadata 与 domain helper；公共基础 action definition 的 player-count filter 覆盖 2-6，5/6 专属行动格单独建模；不要在主路径恢复单卡 import 或卡牌 id 分支。 |
| Future meeple action token / Receive | `receive` internal action、`FutureMeepleResourceMap.field/stable`、`FutureMeeple.actionContext`、`futureMeepleActions` stage resume | round space 到期的普通资源按 player 合并为一次 `receive` transaction，保留每个 entry 的 `sourceCardId`，触发 Receive listener 而不隐式触发 Gain listener；`field` / `stable` 仍由通用 round-start path 转成 optional `plow` / 免费 `stables` action；卡牌应排 future token，不再写卡内 targetRound + onRoundStart 状态机。 |
| Harvest / animal 通用扩展点 | `private-field-phase`、`HarvestReapSummary.harvestCountApplications`、`computeHarvestSelectionThreshold()`、`computeHarvestFeedingRequirement()`、`getHarvestOutcome()`、`getBreedThreshold()`、`computePastureCapacityModifiers()`、house / card animal zone helpers | 收获、繁殖、喂食、动物容量规则读 summary / modifier / helper；animal reorg 交互保留 card zone / `cardId`，不要反查外卡 `cardStates` 或临时改 live resources。 |

注：React/Suspense、CDN、browser fallback 等属于平台/浏览器正常术语，不视为卡牌架构风险。

## 6. 基础设施待办

当前没有开放的基础设施 umbrella 待办。已完成的 Before-End Player Dispatch、Scoring Reserve、printed-cost helper、extra-turn 轮转、family token supply、Major Improvement stack supply、card boundary guard、pasture / harvest / breeding / scoring / stable / special-stable 等历史条目已按需归并到 §5 架构约束或 §12 单卡备注，不再在本节保留完成清单。

后续若发现需要跨多张卡的新机制，先在本节新增待办；实现完成并有测试或守卫后，从本节移除并同步 §5 / §9 / §10 / §12。

## 7. Log 系统对比

BGA 的日志是两层结构：`Core/Notifications.php` 负责玩家可见 gamelog 和客户端状态/动画通知，`Helpers/Log.php` 负责数据库变更、checkpoint/step/engine 边界、undo 后取消旧 gamelog packet 并发 `clearTurn` / `refreshUI` / `refreshHand`。

OA 没有照抄 notification-as-rule-source，而是建了一个比 `GameState.log` 更底层的**结构化事件层**：规则执行时 emit 事件，再由事件统一派生 UI log、瞬时通知、高亮、资源动画、审计和 replay。后端 state 仍是唯一权威。

### 事件层组成

- **GameState 字段**（`shared/contract/types.ts`）：`log`（i18n key + params 的可见日志）、`events`（`GameEvent[]` 结构化事件流）、`nextEventSeq`、`publicEventArchive`（`PublicEventArchivePacket[]`）、`nextPublicEventArchivePacketSeq`。
- **Public events**（`shared/contract/events.ts`）：50 种事件类型，覆盖 resource / farm / worker / action / card / futureMeeple / parent / 生命周期（round / work / returnHome / harvest / game）。统一 `GameEventBase`（`schemaVersion` / `id` / `seq` / `round` / `phase` / `type` / actor / target / source / `trigger`），经 `EventSink.emit` / `emitMany` 写入。
- **Private events**（`shared/contract/private-events.ts`）：`private.promptShown` / `private.handChanged` / `private.draftUpdated` 三种，带 `recipientPlayerId` 做 per-viewer masking——非目标玩家看到 redaction，draft picks 被遮蔽。
- **Mapping policy**（`shared/events/event-mapping-policy.ts`）：每个事件类型声明四个消费通道（log / notification / highlight / resourceAnimation）和 replay 归类（`replayable` / `metadataOnly`），通道可带条件。
- **Log mapper**（`shared/events/log-mapper.ts`）：`eventsToLogEntries()` 把 `GameEvent[]` 批量转 `LogEntry[]`。
- **Archive packet**（`shared/events/archive.ts`）：`publicEvents.committed` 持久化已提交事件序列；`publicEvents.canceled` 在 undoStep / undoAction 时记录被撤销事件的完整副本和 seq 窗口。

### 卡牌判定

Card listener（`shared/cards/card-listeners.ts`）收到 `transactionEvents`（整个工作事务的事件）、`actionEvents`（当前行动/阶段切片）和类型化 `eventQuery`（`has` / `find` / `filter`）。资源类卡牌优先读 `actionEvents`、回退 `transactionEvents`。`resource.paid` 携带 `paymentFor` / `paymentSources` / `bonusSources` / `bonusChoiceIndex` / `returnedCardId`，支付折扣 / 退卡类卡牌据此判定，不依赖 action result 资源事实。Card-purchase candidate metadata 即使收敛为单候选行，也按 index 0 继续写入 `bonusSources` / Card Resource Stats。

### 客户端消费

| 通道 | 文件 | 职责 |
|---|---|---|
| ActionLog / LogPanel | `client/app/action-log-timeline.ts` | 按轮次分组事件 + 遗留日志，去重重放推导条目 |
| 瞬时通知 | `client/app/public-event-notifications.ts` | 代表性 public event 转本地化短通知 |
| 高亮 | `client/app/public-event-notifications.ts` | 提取 action / farm / fence 高亮目标 |
| 资源动画 | `client/app/public-event-notifications.ts` | 计算端点间资源流动画 |
| 私有通知 | `client/app/private-event-notifications.ts` | private event 转目标玩家短通知，签名去重 |
| Replay | `client/app/replay-timeline.ts` | 从 archive committed / canceled packet 重建 active / canceled / missing 时间线 |

### 收敛守卫

`scripts/check-direct-session-log.ts`（`pnpm run check:direct-session-log`）用 TS AST 静态分析禁止绕过事件层直写 session log：拦截 `state.log` 直接修改、非白名单文件 `new LogStore()`、非白名单函数 `logStore.append()` / `prependDerivedLogEntries()`。白名单仅限 `session-core.ts` / `engine.ts` / `engine-proceed.ts` / `engine-resolve.ts` / `append.ts` 的指定函数。

### 与 BGA 的差距

- `log.enterRound` / `log.harvest*` / `log.placeFarmer` 等少量遗留直写日志仍保留，逐步迁往事件派生。
- 事件层基础设施（policy / audit / archive / replay UI）已闭环；更丰富的动画细节属后续 enhancement，不是基础设施缺口。
- 不要照抄 BGA 把 notification 当规则源的做法——OA 同一事件层已能同时服务卡牌判定、UI、私有通知和回放，后端 state 保持唯一权威。

## 8. BGA 坏味道：不要照抄

- 中心化 `SpecialEffect.js` cardId dispatch 和单卡 JS 方法。OA 应保留 typed pending/action flow。
- BGA 在 action/main path 中出现卡名或一次性逻辑，例如全局 Scythe-style flag 或 C88 stable/fence cost relocation。OA 应优先使用卡牌本地 hooks/helpers。
- fencing 主路径不得为 C1 / B30 / E149 增加卡牌 id 分支或 `noWoodPalisades` / `midnightFencer` 一类单卡开关；用 `FenceSegment.type` / `source` 与 generic `fencePolicy` 表达差异。
- BGA mutable PHP args 和原地 cost rewrite。OA 应保留结构化 modifiers 和 payment enumeration。
- BGA 平台状态字段如 `banned`、`implemented` 不应自动驱动 OA 产品行为。

## 9. BGA 使用 Special Effect 的卡牌

| Deck | 卡牌 |
|---|---|
| A | `A102_Grocer`, `A112_ScytheWorker`, `A132_Publican`, `A136_DrudgeryReeve`, `A137_RiverineShepherd`, `A144_Sequestrator`, `A150_Stagehand`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A162_ForestTallyman`, `A165_PigBreeder`, `A17_ReclamationPlow`, `A22_Telegram`, `A25_Bassinet`, `A29_AleBenches`, `A39_Chapel`, `A3_PaperKnife`, `A40_PottersYard`, `A53_Claypipe`, `A58_AsparagusKnife`, `A70_LiftingMachine`, `A71_ClearingSpade`, `A72_CalciumFertilizers`, `A81_InterimStorage`, `A82_WorkCertificate`, `A84_Silage`, `A89_StablePlanner`, `A92_AdoptiveParents` |
| B | `B124_Trimmer`, `B146_Illusionist`, `B157_Salter`, `B19_MoldboardPlow`, `B21_HayloftBarn`, `B23_FinalScenario`, `B24_Lasso`, `B34_SpecialFood`, `B3_Moonshine`, `B42_ForestInn`, `B48_ForestStone`, `B55_MaintenancePremium`, `B67_HandTruck`, `B76_Ceilings`, `B81_Handcart`, `B83_MuddyPuddles`, `B85_FarmHand` |
| C | `C104_Collector`, `C115_Sower`, `C120_AgriculturalLabourer`, `C130_OutskirtsDirector`, `C132_TimberShingleMaker`, `C133_Soldier`, `C142_MarketCrier`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C151_SowingDirector`, `C153_PatternMaker`, `C156_HoofCaregiver`, `C162_ForestOwner`, `C167_CattleBuyer`, `C168_AnimalCatcher`, `C18_RollOverPlow`, `C19_SwingPlow`, `C1_Overhaul`, `C22_BasketChair`, `C23_JobContract`, `C24_BedintheGrainField`, `C25_SteamMachine`, `C29_BeerTable`, `C51_FishingNet`, `C57_Crudite`, `C63_CraftBrewery`, `C67_MineralFeeder`, `C69_LandConsolidation`, `C75_Firewood`, `C84_PerennialRye`, `C85_DenBuilder`, `C87_Mason`, `C8_PlantFertilizer`, `C93_InnerDistrictsDirector`, `C99_GardenDesigner` |
| D | `D101_SugarBaker`, `D102_SampleStableMaker`, `D103_CanalBoatman`, `D107_Bellfounder`, `D10_StorksNest`, `D116_TreeInspector`, `D124_Emissary`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D129_LumberVirtuoso`, `D134_OysterEater`, `D137_TradeTeacher`, `D138_PetLover`, `D14_HammerCrusher`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D158_BeanCounter`, `D161_CabbageBuyer`, `D167_PureBreeder`, `D20_TurnwrestPlow`, `D22_WorkPermit`, `D23_PioneeringSpirit`, `D26_CarpentersYard`, `D27_Retraining`, `D51_Archway`, `D66_PotterCeramics`, `D70_StrawManure`, `D71_Changeover`, `D72_StableManure`, `D74_RoyalWood`, `D82_HuntingTrophy`, `D92_ChildOmbudsman`, `D93_SheepInspector`, `D94_HenpeckedHusband`, `D96_Furnisher`, `D98_Transactor` |
| E | `E103_Wolf`, `E106_EmergencySeller`, `E10_StrawHat`, `E112_GrainThief`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E134_Omnifarmer`, `E148_Lazybones`, `E162_Entrepreneur`, `E166_Roastmaster`, `E167_DairyCrier`, `E22_GuestRoom`, `E27_PiggyBank`, `E4_Thunderbolt`, `E51_WhaleOil`, `E52_Cubbyhole`, `E53_BoarSpear`, `E58_LunchtimeBeer`, `E5_NightLoot`, `E73_Scythe`, `E74_AshTrees`, `E76_LumberPile`, `E78_SleightofHand`, `E81_AlchemistsLab`, `E83_ShepherdsWhistle`, `E85_MasterTanner`, `E86_PenBuilder` |

## 10. Hook 点清单

下表从 `shared/cards/A-E` 和当前 `ALL_CARD_IMPLS` 机械抽取。`*` 表示 action id 通配；动态 listener 已按运行时 `actions` 展开。

Protected atomic action 的 direct `cancel` 在 public action lifecycle 之前被拒绝，不触发 `before` / `during` / `immediatelyAfter` / `after` listener；本表只描述真实成功路径和 guard 之后的 recoverable failure。

| 类型 | Hook 点 | 卡牌 |
|---|---|---|
| effect | `computeBonusScore` | `A101_CookeryOutfitter`, `A133_Braggart`, `A134_FullFarmer`, `A31_DebtSecurity`, `A32_Manger`, `A38_WoolBlankets`, `A98_StableArchitect`, `A99_FellowGrazer`, `B132_EstateMaster`, `B153_Housemaster`, `B30_WoodPalisades`, `B31_PotteryYard`, `B32_Kettle`, `B39_Loom`, `B98_OrganicFarmer`, `B99_Tutor`, `C100_Butler`, `C132_TimberShingleMaker`, `C134_CowPrince`, `C135_Constable`, `C30_HalfTimberedHouse`, `C31_WritingChamber`, `C33_GreeningPlan`, `C35_LanternHouse`, `C39_StudioBoat`, `C59_SchnappsDistillery`, `D100_LordoftheManor`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D154_ChimneySweep`, `D157_PartyOrganizer`, `D29_MuckRake`, `D30_ArtisanDistrict`, `D31_Storeroom`, `D33_SummerHouse`, `D34_LuxuriousHostel`, `D35_FodderChamber`, `D36_BreedRegistry`, `D38_MilkingStool`, `D60_LargePottery`, `D92_ChildOmbudsman`, `E124_MayorCandidate`, `E134_Omnifarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E153_StoneSculptor`, `E154_Margrave`, `E159_OldMiser`, `E32_Nave`, `E34_LandRegister`, `E35_Misanthropy`, `E37_OxSkull`, `E38_RodCollection` |
| effect | `computeCostedBonus` | `C99_GardenDesigner`, `E132_VeggieLover` |
| effect | `computeExtraRoomCapacity` | `A10_WoodenShed`, `A127_Lodger`, `A85_Homekeeper`, `B10_Caravan`, `B85_FarmHand`, `C10_BunkBeds`, `D85_Reader`, `E85_MasterTanner` |
| effect | `computeLockedFarmTiles` | `B38_FutureBuildingSite` |
| effect | `computeSharedPostScore` | `A135_AnimalReeve`, `B136_HouseSteward`, `C136_RanchProvost` |
| effect | `getInvalidAnimals` | `B11_Feedyard`, `C11_WildlifeReserve`, `C12_CattleFarm`, `C148_MudWallower`, `C86_LivestockFeeder`, `E11_PettingZoo`, `E33_BeaverColony`, `E36_HerbalGarden`, `E86_PenBuilder` |
| effect | `onAfterHarvest` | `B82_ValueAssets`, `C34_ElephantgrassPlant`, `C66_EternalRyeCultivation`, `D99_EarthenwarePotter`, `E134_Omnifarmer`, `E91_PlowBuilder` |
| effect | `onAfterReap` | `A106_SlurrySpreader`, `A59_PotatoRidger`, `A64_BarleyMill`, `B21_HayloftBarn`, `B58_CrackWeeder`, `C106_PotatoHarvester`, `C120_AgriculturalLabourer`, `D113_FoodMerchant`, `D126_FieldCultivator`, `D63_Lynchet`, `D65_GrainSieve` |
| effect | `onAfterRoundEnd` | `A165_PigBreeder`, `A54_Credit`, `B53_SculptureCourse`, `D167_PureBreeder`, `D64_BakingCourse`, `D79_CarrotMuseum`, `E87_MasterRenovator` |
| effect | `onAllWorkersPlaced` | `E125_DelayedWayfarer` |
| effect | `onBeforeEndGame` | `A136_DrudgeryReeve`, `B133_VillagePeasant`, `C133_Soldier`, `D132_HideFarmer` |
| effect | `onBeforeHarvest` | `A166_Haydryer`, `C92_AutumnMother`, `D32_WoodRake`, `D98_Transactor` |
| effect | `onBeforePlayerTurn` | `D134_OysterEater`（non-flow skip-control，labor turn 入口同步消费 `{ skipTurn?: true }`） |
| effect | `contributeExtraTurn` | `A92_AdoptiveParents`（轮转额外行动：玩家普通工人耗尽但仍持未激活后代时返回 XOR[use, forfeit] flow；被 round.ts 主动消费、order-independent；轮转据此不提前跳过该玩家；内部 `countExtraTurns` 让 skip-turn / forced consume 逐个 opportunity 消费） |
| effect | `onBeforeReturnHome` | `B117_Informant`, `B140_FarmyardWorker`, `B158_DistrictManager`, `B160_PubOwner`, `D130_RecreationalCarpenter`, `D142_PotatoPlanter`, `D51_Archway`, `E10_StrawHat`, `E143_Hewer`, `E158_StoneCustodian`, `E23_Apiary`, `E26_Sundial`, `E27_PiggyBank` |
| effect | `onBeforeStartOfTurn` | `A130_MummysBoy`, `A22_Telegram`, `A49_NestSite`, `B106_MoralCrusader`, `B124_Trimmer`, `B140_FarmyardWorker`, `B70_NewPurchase`, `B89_Groom`, `C101_StallHolder`, `C111_SmallAnimalBreeder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C157_ResourceAnalyzer`, `C46_Mandoline`, `C64_CornSchnappsDistillery`, `C67_MineralFeeder`, `C84_PerennialRye`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D46_PelletPress`, `D48_CivicFacade`, `D53_TeaHouse`, `E162_Entrepreneur`, `E22_GuestRoom`, `E28_Bookmark`, `E56_RomanPot`, `E62_SourDough`, `E93_Motivator`, `E96_Elder` |
| effect | `onBuy` | `A102_Grocer`, `A112_ScytheWorker`, `A117_WoodCarrier`, `A11_MudPatch`, `A120_ClayHutBuilder`, `A121_ClayPuncher`, `A125_Priest`, `A127_Lodger`, `A134_FullFarmer`, `A135_AnimalReeve`, `A136_DrudgeryReeve`, `A13_RenovationCompany`, `A144_Sequestrator`, `A162_ForestTallyman`, `A165_PigBreeder`, `A167_BreederBuyer`, `A16_RammedClay`, `A19_Handplow`, `A1_Shelter`, `A20_DoubleTurnPlow`, `A22_Telegram`, `A27_OvenSite`, `A2_ShiftingCultivation`, `A33_BigCountry`, `A36_FacadesCarving`, `A39_Chapel`, `A3_PaperKnife`, `A40_PottersYard`, `A43_FarmyardManure`, `A44_PondHut`, `A47_Trellises`, `A4_Baseboards`, `A53_Claypipe`, `A54_Credit`, `A57_MilkingParlor`, `A5_ClayEmbankment`, `A69_LargeGreenhouse`, `A6_StorageBarn`, `A74_StableTree`, `A77_Hod`, `A7_GardenersKnife`, `A86_AnimalTamer`, `A89_StablePlanner`, `A8_FoodBasket`, `A9_YoungAnimalMarket`, `B102_Consultant`, `B105_CaseBuilder`, `B107_Manservant`, `B113_PatchCaregiver`, `B116_Shoreforester`, `B117_Informant`, `B119_Lumberjack`, `B123_RoofBallaster`, `B124_Trimmer`, `B125_EstateWorker`, `B127_Seducer`, `B136_HouseSteward`, `B137_Wholesaler`, `B141_FieldCaretaker`, `B148_PetBroker`, `B149_OpenAirFarmer`, `B14_Hawktower`, `B160_PubOwner`, `B163_Pastor`, `B164_SheepWhisperer`, `B167_StableSergeant`, `B16_MiningHammer`, `B19_MoldboardPlow`, `B1_UpscaleLifestyle`, `B20_ChainFloat`, `B21_HayloftBarn`, `B22_WalkingBoots`, `B23_FinalScenario`, `B25_BreadPaddle`, `B27_Toolbox`, `B29_CookeryLesson`, `B2_MiniPasture`, `B33_Mantlepiece`, `B37_Grange`, `B38_FutureBuildingSite`, `B3_Moonshine`, `B41_Hauberg`, `B42_ForestInn`, `B44_ChickStable`, `B45_StrawberryPatch`, `B46_ClubHouse`, `B48_ForestStone`, `B4_WoodPile`, `B52_GrowingFarm`, `B54_Tumbrel`, `B55_MaintenancePremium`, `B58_CrackWeeder`, `B59_FoodChest`, `B5_StoreofExperience`, `B65_GrainDepot`, `B66_SackCart`, `B6_ExcursiontotheQuarry`, `B71_HarvestHouse`, `B73_GiftBasket`, `B74_ThickForest`, `B76_Ceilings`, `B78_ReedBelt`, `B7_Wage`, `B83_MuddyPuddles`, `B84_AcornsBasket`, `B88_EstablishedPerson`, `B89_Groom`, `B8_MarketStall`, `B93_Confidant`, `B96_TreeFarmJoiner`, `B99_Tutor`, `B9_BeatingRod`, `C104_Collector`, `C106_PotatoHarvester`, `C107_Baker`, `C108_Layabout`, `C113_WinterCaretaker`, `C116_FurnitureMaker`, `C118_WoodCollector`, `C119_SkillfulRenovator`, `C121_ClayKneader`, `C127_Lover`, `C135_Constable`, `C136_RanchProvost`, `C139_BasketmakersWife`, `C140_PackagingArtist`, `C143_StoneBuyer`, `C144_ReedRoofRenovator`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C155_FoodDistributor`, `C156_HoofCaregiver`, `C161_PotatoDigger`, `C162_ForestOwner`, `C165_GameCatcher`, `C166_CattleWhisperer`, `C16_FieldFences`, `C17_NewlyPlowedField`, `C19_SwingPlow`, `C1_Overhaul`, `C22_BasketChair`, `C24_BedintheGrainField`, `C26_Flail`, `C2_Stable`, `C38_Christianity`, `C39_StudioBoat`, `C3_CarriageTrip`, `C40_CanvasSack`, `C44_ChickenCoop`, `C47_GardenClaw`, `C4_WritingBoards`, `C50_StableYard`, `C57_Crudite`, `C5_Remodeling`, `C60_SmallPottersOven`, `C65_Granary`, `C6_StoneClearing`, `C72_FestivalPlanning`, `C74_PrivateForest`, `C77_ClaySupply`, `C78_ReedHattedToad`, `C79_StoneCart`, `C7_BladeShears`, `C81_MaterialHub`, `C83_EarlyCattle`, `C86_LivestockFeeder`, `C87_Mason`, `C8_PlantFertilizer`, `C98_CubeCutter`, `C9_AutomaticWaterTrough`, `D109_SowingMaster`, `D114_SeedTrader`, `D116_TreeInspector`, `D117_WoodExpert`, `D118_Bonehead`, `D120_ClayDeliveryman`, `D122_ClayCarrier`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D131_CraftsmanshipPromoter`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D141_SeedSeller`, `D145_RoofExaminer`, `D156_RetailDealer`, `D162_ClayFirer`, `D166_StableMilker`, `D167_PureBreeder`, `D1_ZigzagHarrow`, `D20_TurnwrestPlow`, `D22_WorkPermit`, `D23_PioneeringSpirit`, `D2_DwellingPlan`, `D3_Furrows`, `D40_Cesspit`, `D41_HorseDrawnBoat`, `D43_Hutch`, `D44_ForestWell`, `D45_SheepWell`, `D47_Churchyard`, `D4_CrossCutWood`, `D50_ForeignAid`, `D51_Archway`, `D57_WholesaleMarket`, `D5_FieldClay`, `D60_LargePottery`, `D62_BeerTap`, `D67_ReapHook`, `D69_SmallGreenhouse`, `D6_PetrifiedWood`, `D74_RoyalWood`, `D78_ReedPond`, `D7_Trident`, `D84_FeedPellets`, `D88_Millwright`, `D8_FernSeeds`, `D91_Plowman`, `D96_Furnisher`, `D97_BeggingStudent`, `D99_EarthenwarePotter`, `D9_GameTrade`, `E103_Wolf`, `E104_SpiceTrader`, `E105_Pioneer`, `E106_EmergencySeller`, `E119_LandHeir`, `E120_ScrapCollector`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E127_DiligentFarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E138_LivestockExpert`, `E139_BunnyBreeder`, `E140_Carter`, `E145_Parvenu`, `E148_Lazybones`, `E155_Visionary`, `E161_ElderBaker`, `E167_DairyCrier`, `E1_PoleBarns`, `E22_GuestRoom`, `E25_BumperCrop`, `E28_Bookmark`, `E2_RenovationMaterials`, `E33_BeaverColony`, `E3_TeaTime`, `E40_BeeStatue`, `E41_MuddyWaters`, `E42_WaterGully`, `E43_BarnCats`, `E44_FodderBeets`, `E45_FruitLadder`, `E46_WaterlilyPond`, `E4_Thunderbolt`, `E51_WhaleOil`, `E56_RomanPot`, `E5_NightLoot`, `E60_WorkingGloves`, `E63_IronOven`, `E64_SimpleOven`, `E65_Almsbag`, `E6_Recount`, `E74_AshTrees`, `E76_LumberPile`, `E78_SleightofHand`, `E7_Pumpernickel`, `E81_AlchemistsLab`, `E82_Profiteering`, `E8_FarmersMarket`, `E94_Prophet`, `E97_Beneficiary`, `E98_Prodigy`, `E9_BarteringHut` |
| effect | `computeBreedThreshold` | `E84_DollysMother` |
| effect | `computePastureCapacityModifiers` | `A12_DrinkingTrough`, `B72_LoveforAgriculture`, `D11_LawnFertilizer` |
| effect | `onComputeAnimalZones` | `A11_MudPatch`, `A148_Woolgrower`, `A86_AnimalTamer`, `B115_TinsmithMaster`, `B11_Feedyard`, `B12_Stockyard`, `B148_PetBroker`, `B86_TruffleSearcher`, `C11_WildlifeReserve`, `C12_CattleFarm`, `C148_MudWallower`, `C86_LivestockFeeder`, `C89_StableMaster`, `D148_DomesticianExpert`, `D86_SheepAgent`, `E11_PettingZoo`, `E12_AnimalBedding`, `E33_BeaverColony`, `E36_HerbalGarden`, `E86_PenBuilder` |
| effect | `onComputeSowableFields` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B68_Beanfield`, `B72_LoveforAgriculture`, `C70_LettucePatch`, `D25_WitchesDanceFloor`, `D75_WoodField`, `E68_CherryOrchard`, `E69_MelonPatch`, `E70_CropRotationField`, `E72_ArtichokeField`, `E80_RockGarden` |
| effect | `onEndHarvest` | `A112_ScytheWorker`, `A145_Ropemaker`, `B11_Feedyard`, `C113_WinterCaretaker`, `C124_StoneImporter`, `C71_Slurry`, `D72_StableManure`, `D115_FodderPlanter`, `E133_ChampionBreeder`, `E73_Scythe`, `E90_DungCollector`, `E99_UncaringParents` |
| effect | `onEndHarvestFeedingPhase` | `C41_FarmStore`, `D76_SocialBenefits`, `E83_ShepherdsWhistle` |
| effect | `onEndHarvestFieldPhase` | `A61_WinnowingFan`, `C110_HomeBrewer`, `C29_BeerTable`, `C54_MarketBooth`, `E112_GrainThief` |
| effect | `onEndTurn` | `B27_Toolbox`, `D74_RoyalWood` |
| effect | `onHarvestFeedingPhase` | `A62_BeerKeg`, `C49_BeerStall`, `C55_Studio`, `C63_CraftBrewery`, `D12_MilkingPlace`, `D133_BeerTentOperator`, `D84_FeedPellets`, `E110_Dentist`, `E132_VeggieLover`, `E142_Smuggler`, `E39_Paintbrush`, `E48_TownHall` |
| effect | `onHarvestFieldPhase` | `A104_WoodHarvester`, `A118_Treegardener`, `B101_FurnitureCarpenter`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B39_Loom`, `B50_ButterChurn`, `B68_Beanfield`, `B72_LoveforAgriculture`, `C70_LettucePatch`, `C98_CubeCutter`, `D25_WitchesDanceFloor`, `D38_MilkingStool`, `D75_WoodField`, `E107_LandSurveyor`, `E68_CherryOrchard`, `E69_MelonPatch`, `E70_CropRotationField`, `E72_ArtichokeField`, `E80_RockGarden` |
| effect | `onReturnHome` | `A29_AleBenches`, `A53_Claypipe`, `A70_LiftingMachine`, `A84_Silage`, `B124_Trimmer`, `B139_ForestScientist`, `B22_WalkingBoots`, `C51_FishingNet`, `C75_Firewood`, `D52_RollingPin` |
| effect | `onRoundEnd` | `A54_Credit` |
| effect | `onRoundStart` | `A76_Cob`, `A81_InterimStorage`, `A90_PlowDriver`, `A96_TaskArtisan`, `B110_Pavior`, `B114_Childless`, `B116_Shoreforester`, `B118_SmallscaleFarmer`, `B135_NutritionExpert`, `B23_FinalScenario`, `B29_CookeryLesson`, `B57_Scullery`, `B69_PottersMarket`, `B81_Handcart`, `B93_Confidant`, `B97_Scholar`, `C103_GreenGrocer`, `C123_Freemason`, `C125_Nightworker`, `C159_FishermansFriend`, `C21_HeartofStone`, `C39_StudioBoat`, `D116_TreeInspector`, `D22_WorkPermit`, `D54_TroutPool`, `D69_SmallGreenhouse`, `D93_SheepInspector`, `E100_MuseumCaretaker`, `E102_Acquirer`, `E111_Recluse`, `E126_TaxCollector`, `E152_BargainHunter`, `E168_AnimalTamersApprentice`, `E88_MasterFencer` |
| effect | `onSowExtraField` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B68_Beanfield`, `B72_LoveforAgriculture`, `C70_LettucePatch`, `D25_WitchesDanceFloor`, `D75_WoodField`, `E68_CherryOrchard`, `E69_MelonPatch`, `E70_CropRotationField`, `E72_ArtichokeField`, `E80_RockGarden` |
| effect | `onStartHarvest` | `C24_BedintheGrainField`, `C62_CookeryExtension`, `D129_LumberVirtuoso`, `D153_WealthyMan`, `D61_BaleofStraw`, `D97_BeggingStudent`, `E110_Dentist`, `E111_Recluse`, `E117_PipeSmoker`, `E147_AnimalDriver`, `E149_MidnightFencer`, `E58_LunchtimeBeer`, `E61_RaisedBed` |
| effect | `onStartHarvestFeedingPhase` | `C107_Baker`, `E52_Cubbyhole` |
| effect | `onStartHarvestFieldPhase` | `A112_ScytheWorker`, `B165_GameProvider`, `B61_ThreeFieldRotation`, `C57_Crudite`, `D70_StrawManure`, `D72_StableManure`, `E112_GrainThief`, `E73_Scythe` |
| effect | `onStartReturnHome` | `A100_Curator`, `A127_Lodger`, `A141_TurnipFarmer`, `A151_Minstrel`, `A152_NightSchoolStudent`, `A157_Bohemian`, `A35_SwimmingClass`, `A58_AsparagusKnife`, `C155_FoodDistributor`, `C97_SeedResearcher`, `D102_SampleStableMaker`, `D107_Bellfounder`, `D10_StorksNest`, `D18_SteamPlow`, `E20_IronHoe`, `E87_MasterRenovator` |
| effect | `resolveChoice` | `A136_DrudgeryReeve`, `B146_Illusionist`, `B157_Salter`, `B3_Moonshine`, `C104_Collector`, `C133_Soldier`, `C146_WorkshopAssistant`, `D132_HideFarmer`, `D23_PioneeringSpirit`, `E134_Omnifarmer`, `E148_Lazybones` |
| exchange | `anytime` | `A60_OrientalFireplace`, `B104_SheepWalker`, `B32_Kettle`, `B80_HardPorcelain`, `C139_BasketmakersWife`, `C50_StableYard`, `D162_ClayFirer`, `D25_WitchesDanceFloor`, `D59_EarthOven`, `D60_LargePottery`, `E109_BraidMaker` |
| exchange | `bake-bread` | `A60_OrientalFireplace`, `D25_WitchesDanceFloor`, `D59_EarthOven`, `D64_BakingCourse`, `E63_IronOven`, `E64_SimpleOven` |
| exchange | `harvest` | `C105_BasketCarrier`, `C109_SchnappsDistiller`, `C59_SchnappsDistillery`, `D108_StoneCarver`, `D155_Ebonist`, `D62_BeerTap`, `E153_StoneSculptor` |
| handHooks | `onBeforeStartOfTurn` | `E96_Elder` |
| listener | `after.*` | `E47_SyrupTap` |
| listener | `after.bake-bread` | `A30_BakingSheet`, `A63_DutchWindmill`, `C61_BeerStein`, `E57_CheeseFondue` |
| listener | `after.collect` | `A103_Portmonger`, `A142_Cordmaker`, `A146_StorehouseSteward`, `A15_CarpentersAxe`, `A164_WoodWorker`, `A17_ReclamationPlow`, `A23_StoneCompany`, `A48_ShavingHorse`, `A95_Angler`, `B131_Equipper`, `B147_Huntsman`, `B15_CarpentersBench`, `B162_ForestClearer`, `B17_ForestPlow`, `B21_HayloftBarn`, `B34_SpecialFood`, `B48_ForestStone`, `B55_MaintenancePremium`, `B79_Corf`, `C102_TreeGuard`, `C114_SoilScientist`, `C163_MaterialDeliveryman`, `C42_RavenousHunger`, `C52_HuntsmansHat`, `C81_MaterialHub`, `D140_Loudmouth`, `D143_TreeCutter`, `D144_WaterWorker`, `D146_Porter`, `D19_PulverizerPlow`, `D36_BreedRegistry`, `D73_SupplyBoat`, `E103_Wolf`, `E118_KindlingGatherer`, `E140_Carter`, `E15_NailBasket`, `E38_RodCollection`, `E51_WhaleOil`, `E53_BoarSpear`, `E77_Mattock` |
| listener | `after.construct` | `A110_Roughcaster`, `A111_WallBuilder`, `A167_BreederBuyer`, `A21_FamilyFriendHome`, `A40_PottersYard`, `A73_AgriculturalFertilizers`, `A93_BedMaker`, `B111_Rustic`, `B140_FarmyardWorker`, `B163_Pastor`, `B27_Toolbox`, `D123_RenovationPreparer`, `D128_BuildingTycoon`, `D163_JourneymanBricklayer`, `D74_RoyalWood`, `D94_HenpeckedHusband`, `D96_Furnisher`, `E123_ResourceHoarder`, `E49_Twibil`, `E52_Cubbyhole` |
| listener | `after.exchange` | `A48_ShavingHorse`, `B21_HayloftBarn`, `B29_CookeryLesson`, `C148_MudWallower`, `C53_GypsysCrock`, `D36_BreedRegistry`, `D56_FatstockStretcher`, `E103_Wolf`, `E53_BoarSpear`, `E85_MasterTanner` |
| listener | `after.family-growth` | `D150_GodlySpouse`, `D157_PartyOrganizer`, `E113_Godmother` |
| listener | `after.fence` | `A144_Sequestrator`, `A34_Loppers`, `A40_PottersYard`, `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `B124_Trimmer`, `B140_FarmyardWorker`, `B27_Toolbox`, `B94_StockProtector`, `D89_Stablehand`, `E108_BlackberryFarmer`, `E74_AshTrees` |
| listener | `after.gain` | `A48_ShavingHorse`, `B21_HayloftBarn`, `C120_AgriculturalLabourer`, `C52_HuntsmansHat`, `D36_BreedRegistry`, `E103_Wolf`, `E118_KindlingGatherer`, `E53_BoarSpear` |
| listener | `after.pop-card-stack` | `D36_BreedRegistry` |
| listener | `after.receive` | `A48_ShavingHorse`, `B21_HayloftBarn`, `B96_TreeFarmJoiner`, `C120_AgriculturalLabourer`, `C52_HuntsmansHat`, `E53_BoarSpear` |
| listener | `after.take-from-card` | `D36_BreedRegistry` |
| listener | `immediatelyAfter.harvest-feed-conversion` | `D36_BreedRegistry` |
| listener | `immediatelyAfter.future-meeple-resolved` | `D36_BreedRegistry` |
| listener | `after.improvement` | `A109_SmallTrader`, `A131_CraftTeacher`, `A41_VegetableSlicer`, `B100_Clutterer`, `B49_Scales`, `C115_Sower`, `C137_CharcoalBurner`, `C43_FarmBuilding`, `C75_Firewood`, `C80_RockyTerrain`, `D118_Bonehead`, `D161_CabbageBuyer`, `D80_BrickHammer`, `E144_WaresSalesman`, `E156_ClaypitOwner`, `E165_MasterHuntsman`, `E18_SeedAlmanac`, `E31_Upholstery` |
| listener | `after.occupation` | `A139_HollowWarden`, `A96_TaskArtisan`, `B100_Clutterer`, `B103_FieldMerchant`, `B138_ForestGuardian`, `B151_LittlePeasant`, `B155_ArtTeacher`, `B25_BreadPaddle`, `B49_Scales`, `C120_AgriculturalLabourer`, `C68_Bookcase`, `C80_RockyTerrain`, `C95_BasketWeaver`, `D118_Bonehead`, `D163_JourneymanBricklayer`, `D42_EducationBonus`, `D95_SiteManager`, `E101_Blighter`, `E116_FirCutter`, `E144_WaresSalesman`, `E157_Usufructuary`, `E163_Patroness`, `E165_MasterHuntsman`, `E89_Stallwright`, `E95_Miller` |
| listener | `after.pay` | `B18_GrasslandHarrow`, `C116_FurnitureMaker`, `C148_MudWallower`, `D74_RoyalWood`, `E122_Cottar`, `E123_ResourceHoarder`, `E128_Saddler`, `E54_Contraband` |
| listener | `after.place-farmer` | `A113_HeresyTeacher`, `A114_SeasonalWorker`, `A116_WoodCutter`, `A119_FirewoodCollector`, `A121_ClayPuncher`, `A122_PanBaker`, `A128_RiparianBuilder`, `A129_Swagman`, `A130_MummysBoy`, `A137_RiverineShepherd`, `A138_Harpooner`, `A139_HollowWarden`, `A140_ShovelBearer`, `A147_AnimalDealer`, `A149_HouseArtist`, `A150_Stagehand`, `A154_Paymaster`, `A155_Conjurer`, `A156_Buyer`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A160_Lutenist`, `A161_PatchCaretaker`, `A163_BuildingExpert`, `A168_AnimalTeacher`, `A18_WheelPlow`, `A24_ThreshingBoard`, `A42_ForestLakeHut`, `A46_ClawKnife`, `A50_MilkJug`, `A51_DriftNetBoat`, `A66_FeedingDish`, `A67_CornScoop`, `A72_CalciumFertilizers`, `A77_Hod`, `A78_Canoe`, `A80_StoneTongs`, `A82_WorkCertificate`, `A92_AdoptiveParents`, `A97_Freshman`, `B108_OvenFiringBoy`, `B112_Silokeeper`, `B121_Geologist`, `B128_Plumber`, `B130_FullPeasant`, `B137_Wholesaler`, `B142_Greengrocer`, `B143_ClayWarden`, `B144_Collier`, `B150_LargeScaleFarmer`, `B152_JuniorArtist`, `B156_StorehouseKeeper`, `B161_Weakling`, `B166_CattleFeeder`, `B19_MoldboardPlow`, `B24_Lasso`, `B28_ForestryStudies`, `B29_CookeryLesson`, `B40_BreweryPond`, `B43_Chophouse`, `B47_HerringPot`, `B56_Brook`, `B60_BrewingWater`, `B62_Pitchfork`, `B64_MillWheel`, `B77_LoamPit`, `B87_Cottager`, `B90_CooperativePlower`, `B91_AssistantTiller`, `B92_LittleStickKnitter`, `C117_Legworker`, `C121_ClayKneader`, `C126_Excavator`, `C130_OutskirtsDirector`, `C131_PrivateTeacher`, `C138_AnimalFeeder`, `C141_SheepProvider`, `C142_MarketCrier`, `C145_ForestReviewer`, `C147_Cowherd`, `C148_MudWallower`, `C150_ParrotBreeder`, `C151_SowingDirector`, `C152_Puppeteer`, `C164_GermanHeathKeeper`, `C167_CattleBuyer`, `C19_SwingPlow`, `C20_MolePlow`, `C23_JobContract`, `C26_Flail`, `C39_StudioBoat`, `C42_RavenousHunger`, `C45_Stew`, `C48_Farmstead`, `C82_HardwareStore`, `C90_FieldWatchman`, `C91_PlowHero`, `C93_InnerDistrictsDirector`, `D101_SugarBaker`, `D103_CanalBoatman`, `D109_SowingMaster`, `D112_YoungFarmer`, `D134_OysterEater`, `D137_TradeTeacher`, `D141_SeedSeller`, `D144_WaterWorker`, `D149_CasualWorker`, `D151_SpinDoctor`, `D156_RetailDealer`, `D158_BeanCounter`, `D160_Midwife`, `D161_CabbageBuyer`, `D164_PetGrower`, `D165_PigStalker`, `D20_TurnwrestPlow`, `D27_Retraining`, `D39_TruffleSlicer`, `D55_NewMarket`, `D68_SmallBasket`, `D92_ChildOmbudsman`, `D93_SheepInspector`, `E105_Pioneer`, `E115_SeedServant`, `E116_FirCutter`, `E118_KindlingGatherer`, `E131_MarketMaster`, `E148_Lazybones`, `E160_KelpGatherer`, `E19_OxGoad`, `E40_BeeStatue`, `E66_BarnShed`, `E82_Profiteering`, `E95_Miller` |
| listener | `after.plow` | `A105_BarrowPusher`, `A144_Sequestrator`, `A17_ReclamationPlow`, `A40_PottersYard`, `B159_LieutenantGeneral`, `C80_RockyTerrain`, `D104_Cultivator`, `E164_MountainPlowman` |
| listener | `after.receive` | `A48_ShavingHorse`, `B21_HayloftBarn`, `C120_AgriculturalLabourer`, `C52_HuntsmansHat`, `E53_BoarSpear` |
| listener | `after.renovate-house` | `A110_Roughcaster`, `A120_ClayHutBuilder`, `A37_Bucksaw`, `A45_FireProtectionPond`, `B107_Manservant`, `B134_HousebookMaster`, `B168_PastureMaster`, `B16_MiningHammer`, `B55_MaintenancePremium`, `B76_Ceilings`, `C119_SkillfulRenovator`, `C132_TimberShingleMaker`, `C146_WorkshopAssistant`, `C149_ResourceRecycler`, `C153_PatternMaker`, `D111_InteriorDecorator`, `D161_CabbageBuyer`, `D163_JourneymanBricklayer`, `D27_Retraining`, `D77_RecycledBrick`, `D81_RoofLadder`, `E123_ResourceHoarder`, `E154_Margrave`, `E87_MasterRenovator` |
| listener | `after.reorganize` | `C148_MudWallower` |
| listener | `after.sow` | `A79_GardenHoe`, `B115_TinsmithMaster`, `B54_Tumbrel`, `C73_SeaweedFertilizer`, `D58_Gritter`, `E50_WildGreens`, `E71_CowPatty`, `E79_FieldSpade` |
| listener | `after.stables` | `A167_BreederBuyer`, `A40_PottersYard`, `A43_FarmyardManure`, `A73_AgriculturalFertilizers`, `A74_StableTree`, `B140_FarmyardWorker`, `B27_Toolbox`, `C56_FeedFence`, `D166_StableMilker`, `D168_Stockman`, `E114_ShedBuilder` |
| listener | `after.store-on-card` | `E27_PiggyBank` |
| listener | `after.take-from-card` | `E27_PiggyBank` |
| listener | `after.wish-children` | `E113_Godmother` |
| listener | `anytime.*` | `A102_Grocer`, `A153_PigOwner`, `A71_ClearingSpade`, `B154_SheepKeeper`, `B157_Salter`, `B35_HookKnife`, `B69_PottersMarket`, `B83_MuddyPuddles`, `B85_FarmHand`, `C101_StallHolder`, `C115_Sower`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C18_RollOverPlow`, `C46_Mandoline`, `C57_Crudite`, `C64_CornSchnappsDistillery`, `C69_LandConsolidation`, `C84_PerennialRye`, `C85_DenBuilder`, `C87_Mason`, `C94_StableCleaner`, `D106_WhiskyDistiller`, `D114_SeedTrader`, `D122_ClayCarrier`, `D124_Emissary`, `D13_Trowel`, `D46_PelletPress`, `D53_TeaHouse`, `D71_Changeover`, `D87_MasterBuilder`, `E13_StoneHouseReconstruction`, `E14_WoodSaw`, `E22_GuestRoom`, `E27_PiggyBank`, `E62_SourDough`, `E86_PenBuilder`, `E91_PlowBuilder` |
| listener | `before.*` | `A124_Knapper`, `A126_MasterWorkman`, `B120_Sweep` |
| listener | `before.bake-bread` | `B67_HandTruck`, `C60_SmallPottersOven`, `D66_PotterCeramics` |
| listener | `before.collect` | `A107_Catcher`, `A115_ChiefForester`, `A52_ThrowingAxe`, `A81_InterimStorage`, `A91_ShiftingCultivator`, `B122_Mineralogist`, `B138_ForestGuardian`, `B146_Illusionist`, `B34_SpecialFood`, `B51_DiggingSpade`, `C51_FishingNet`, `C76_WoodCart`, `D105_Sculptor`, `D125_ForestTrader` |
| listener | `before.construct` | `A40_PottersYard`, `A73_AgriculturalFertilizers`, `D119_WoodBarterer` |
| listener | `before.cultivation` | `C112_Thresher` |
| listener | `before.exchange` | `D56_FatstockStretcher`, `E85_MasterTanner` |
| listener | `before.family-growth` | `E130_Overachiever` |
| listener | `before.farmland` | `C112_Thresher` |
| listener | `before.fence` | `A40_PottersYard`, `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `B94_StockProtector`, `D119_WoodBarterer`, `E74_AshTrees` |
| listener | `before.grain-utilization` | `C112_Thresher` |
| listener | `before.improvement` | `B75_WoodWorkshop` |
| listener | `before.lessons` | `B63_Tasting` |
| listener | `before.lessons-3` | `B63_Tasting` |
| listener | `before.lessons-4` | `B63_Tasting` |
| listener | `before.meeting-place` | `D139_Chairman` |
| listener | `before.occupation` | `D152_Patron`, `D49_Bookshelf`, `E51_WhaleOil` |
| listener | `before.place-farmer` | `A92_AdoptiveParents`, `C154_TwinResearcher`, `C158_ForestCampaigner`, `C15_Trellis`, `C160_Outrider`, `C28_TeachersDesk`, `C48_Farmstead`, `D110_FishFarmer`, `D147_TrapBuilder`, `D16_WoodenWheyBucket`, `D28_WritingDesk`, `D83_Pigswill`, `D90_PlowMaker`, `E121_HillCultivator`, `E137_FlaxFarmer`, `E141_VegetableVendor`, `E166_Roastmaster`, `E17_SkimmerPlow`, `E55_StoneWeir`, `E59_CombandCutter`, `E67_GrainBag` |
| listener | `before.plow` | `A40_PottersYard` |
| listener | `before.renovate-house` | `D14_HammerCrusher` |
| listener | `before.sow` | `A132_Publican`, `A65_SeedPellets`, `D17_DrillHarrow` |
| listener | `before.stables` | `A40_PottersYard`, `A73_AgriculturalFertilizers` |
| listener | `computeArgs.place-farmer` | `A130_MummysBoy`, `A25_Bassinet`, `A26_SleepingCorner`, `A28_ForestSchool`, `A94_LazySowman`, `B129_Seatmate`, `B151_LittlePeasant`, `C129_SecondSpouse`, `C150_ParrotBreeder`, `D112_YoungFarmer`, `D24_BrotherlyLove`, `D50_ForeignAid`, `E129_Imitator`, `E150_RockBeater`, `E21_SheepRug` |
| listener | `computeChoiceCandidates.improvement` | `C27_Blueprint`, `D131_CraftsmanshipPromoter`, `E161_ElderBaker` |
| listener | `computeChoiceCandidates.renovate-house` | `A87_Conservator`, `D13_Trowel` |
| listener | `computeCosts.construct` | `A128_RiparianBuilder`, `A149_HouseArtist`, `B126_Carpenter`, `B13_CarpentersParlor`, `C128_WoodenHutExtender`, `C88_CarpentersApprentice`, `D121_ClayPlasterer`, `E123_ResourceHoarder`, `E150_RockBeater` |
| listener | `computeCosts.fence` | `C16_FieldFences`, `C88_CarpentersApprentice`, `D82_HuntingTrophy`, `E16_BriarHedge` |
| listener | `computeCardCostCandidates.improvement` | `A27_OvenSite`, `A143_Stonecutter`, `A75_LumberMill`, `B95_MasterBricklayer`, `C122_Bricklayer`, `C27_Blueprint`, `C95_BasketWeaver`, `D117_WoodExpert`, `D95_SiteManager`, `D96_Furnisher`, `E109_BraidMaker`, `E27_PiggyBank` |
| base cost | `getBaseCosts.improvement` | `A20_DoubleTurnPlow`, `B36_Bottles` |
| listener | `computeCosts.improvement` | `D82_HuntingTrophy`, `E123_ResourceHoarder`, `E130_Overachiever` |
| listener | `computeCosts.occupation` | `B109_PaperMaker`, `B155_ArtTeacher` |
| listener | `computeCosts.plow` | `C37_DwellingMound` |
| listener | `computeCosts.renovate-house` | `B128_Plumber`, `D121_ClayPlasterer`, `D13_Trowel`, `D154_ChimneySweep`, `D81_RoofLadder`, `E123_ResourceHoarder` |
| listener | `computeCosts.stables` | `C88_CarpentersApprentice` |
| listener | `computeExchanges.*` | `C62_CookeryExtension` |
| listener | `computeReplace.bake-bread` | `A97_Freshman`, `B26_AgrarianFences` |
| listener | `computeReplace.collect` | `D138_PetLover` |
| listener | `computeReplace.family-growth` | `E151_DeliveryNurse`, `E92_FieldDoctor` |
| listener | `computeReplace.gain` | `C168_AnimalCatcher` |
| listener | `computeReplace.improvement` | `B103_FieldMerchant`, `C140_PackagingArtist`, `D21_Recruitment`, `E24_Ambition` |
| listener | `computeReplace.sow` | `A94_LazySowman`, `B26_AgrarianFences` |
| listener | `during.improvement` | `A55_JunkRoom` |
| listener | `during.place-farmer` | `D112_YoungFarmer`, `E77_Mattock` |
| listener | `immediatelyAfter.*` | `C25_SteamMachine` |
| listener | `immediatelyAfter.collect` | `A108_MushroomCollector`, `A56_Basket`, `C36_ClayDeposit`, `C58_Woodcraft`, `E33_BeaverColony`, `E75_StoneAxe` |
| listener | `immediatelyAfter.construct` | `B132_EstateMaster` |
| listener | `immediatelyAfter.fence` | `A83_ShepherdsCrook`, `B132_EstateMaster` |
| listener | `immediatelyAfter.fencing` | `B132_EstateMaster` |
| listener | `immediatelyAfter.gain` | `A92_AdoptiveParents`, `E33_BeaverColony` |
| listener | `immediatelyAfter.improvement` | `C96_Merchant`, `D26_CarpentersYard`, `E146_Reseller` |
| listener | `immediatelyAfter.plow` | `B132_EstateMaster` |
| listener | `immediatelyAfter.reap` | `B132_EstateMaster` |
| listener | `immediatelyAfter.renovate-house` | `C144_ReedRoofRenovator` |
| listener | `immediatelyAfter.stables` | `B132_EstateMaster` |
| listener | `immediatelyAfter.trade-applied` | `C53_GypsysCrock`, `E91_PlowBuilder` |
| listener | `isDoable.*` | `A126_MasterWorkman` |
| listener | `isDoable.bake-bread` | `A97_Freshman`, `B26_AgrarianFences`, `B67_HandTruck`, `C60_SmallPottersOven`, `D66_PotterCeramics` |
| listener | `isDoable.collect` | `C51_FishingNet` |
| listener | `isDoable.construct` | `D119_WoodBarterer` |
| listener | `isDoable.family-growth` | `E155_Visionary` |
| listener | `isDoable.fence` | `B94_StockProtector`, `C88_CarpentersApprentice`, `D119_WoodBarterer`, `D82_HuntingTrophy`, `E74_AshTrees` |
| listener | `isDoable.fishing` | `C51_FishingNet` |
| listener | `isDoable.improvement` | `B103_FieldMerchant`, `B75_WoodWorkshop`, `C140_PackagingArtist`, `D21_Recruitment` |
| listener | `isDoable.lessons` | `B93_Confidant` |
| listener | `isDoable.lessons-3` | `B93_Confidant` |
| listener | `isDoable.lessons-4` | `B93_Confidant` |
| listener | `isDoable.occupation` | `B93_Confidant`, `D152_Patron`, `D49_Bookshelf`, `E101_Blighter` |
| listener | `isDoable.place-farmer` | `E125_DelayedWayfarer` |
| listener | `isDoable.renovate-house` | `A87_Conservator`, `D14_HammerCrusher` |
| listener | `isDoable.sow` | `A65_SeedPellets`, `A94_LazySowman`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B26_AgrarianFences`, `B68_Beanfield`, `B72_LoveforAgriculture`, `C112_Thresher`, `C70_LettucePatch`, `D17_DrillHarrow`, `D25_WitchesDanceFloor`, `D75_WoodField`, `E68_CherryOrchard`, `E69_MelonPatch`, `E70_CropRotationField`, `E72_ArtichokeField`, `E80_RockGarden` |
| specialKind | `add-resource-to-space` | `C130_OutskirtsDirector`, `C93_InnerDistrictsDirector`, `D101_SugarBaker` |
| specialKind | `build-stable-on-first-empty-tile` | `E148_Lazybones` |
| specialKind | `card-field` | `C8_PlantFertilizer` |
| specialKind | `choice` | `B146_Illusionist`, `C104_Collector`, `C146_WorkshopAssistant`, `D23_PioneeringSpirit` |
| specialKind | `clear-pending-fence-bonus` | `E74_AshTrees` |
| specialKind | `consume-pending-extra-turns` | 通用 pending extra-turn 消费（C25 等） |
| specialKind | `consume-fence` | `C1_Overhaul` |
| specialKind | `emit-card-triggered` | `A92_AdoptiveParents` |
| specialKind | `field` | `C8_PlantFertilizer` |
| specialKind | `grain` | `E112_GrainThief` |
| specialKind | `increment-counter` | `B132_EstateMaster`, `C132_TimberShingleMaker` |
| specialKind | `increment-extra-data` | `C104_Collector`, `D134_OysterEater`, `D92_ChildOmbudsman`, `E38_RodCollection` |
| specialKind | `move-resource-between-spaces` | `E166_Roastmaster` |
| specialKind | `plant-additional-good` | `C8_PlantFertilizer` |
| specialKind | `pop-card-stack-top` | `E103_Wolf` |
| specialKind | `promote-first-newborn` | `A92_AdoptiveParents` |
| specialKind | `remove-field-crop` | `C63_CraftBrewery` |
| specialKind | `remove-field-crops` | `C57_Crudite` |
| specialKind | `remove-future-meeples` | `B76_Ceilings` |
| specialKind | `record-scoring-reserve-bonus` | `A136_DrudgeryReeve`, `C133_Soldier` |
| specialKind | `resource-quantity-select` | `B157_Salter` |
| specialKind | `resourceExchange` | `E5_NightLoot` |
| specialKind | `return-card-to-board` | `C60_SmallPottersOven` |
| specialKind | `set-counter` | `A144_Sequestrator`, `B48_ForestStone`, `C148_MudWallower`, `D158_BeanCounter` |
| specialKind | `set-extra-data` | `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `A92_AdoptiveParents`, `B124_Trimmer`, `B132_EstateMaster`, `B137_Wholesaler`, `B21_HayloftBarn`, `B34_SpecialFood`, `B48_ForestStone`, `B55_MaintenancePremium`, `B93_Confidant`, `C150_ParrotBreeder`, `C16_FieldFences`, `C48_Farmstead`, `C53_GypsysCrock`, `D156_RetailDealer`, `D36_BreedRegistry`, `D56_FatstockStretcher`, `D74_RoyalWood`, `E148_Lazybones`, `E149_MidnightFencer`, `E51_WhaleOil`, `E53_BoarSpear`, `E58_LunchtimeBeer`, `E85_MasterTanner`, `E91_PlowBuilder` |
| specialKind | `set-flag` | `A130_MummysBoy`, `A153_PigOwner`, `A17_ReclamationPlow`, `A18_WheelPlow`, `A45_FireProtectionPond`, `A97_Freshman`, `B124_Trimmer`, `B140_FarmyardWorker`, `B154_SheepKeeper`, `B163_Pastor`, `B24_Lasso`, `B34_SpecialFood`, `B35_HookKnife`, `B76_Ceilings`, `B85_FarmHand`, `C101_StallHolder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C42_RavenousHunger`, `C46_Mandoline`, `C51_FishingNet`, `C64_CornSchnappsDistillery`, `C84_PerennialRye`, `C85_DenBuilder`, `C87_Mason`, `C94_StableCleaner`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D27_Retraining`, `D46_PelletPress`, `D53_TeaHouse`, `D87_MasterBuilder`, `D93_SheepInspector`, `E13_StoneHouseReconstruction`, `E146_Reseller`, `E151_DeliveryNurse`, `E22_GuestRoom`, `E27_PiggyBank`, `E62_SourDough`, `E91_PlowBuilder`, `E92_FieldDoctor` |
| specialKind | `set-infobox` | `A17_ReclamationPlow`, `B21_HayloftBarn`, `B48_ForestStone`, `B55_MaintenancePremium`, `C115_Sower`, `C148_MudWallower`, `D126_FieldCultivator`, `D36_BreedRegistry`, `E110_Dentist`, `E22_GuestRoom`, `E27_PiggyBank`, `E51_WhaleOil`, `E74_AshTrees` |
| specialKind | `stone` | `C6_StoneClearing` |
| specialKind | `swap-improvement-with-board` | `D27_Retraining` |
| specialKind | `vegetable` | `A113_HeresyTeacher` |

## 11. 源码排除项

| 来源 | 原因 |
|---|---|
| `C54_MarketStall` | `C54_MarketBooth` 的 BGA legacy 源文件。 |
| `C71_SlurrySpreader` | `C71_Slurry` 的 BGA legacy/错误命名源文件。 |
| `D11_LawnFertilzer` | `D11_LawnFertilizer` 的 BGA typo 源文件。 |
| `E132_Shearer` | `E132_VeggieLover` 的 BGA legacy 源文件。 |
| BGA `implemented=false` 且无运行时行为的卡牌 | 除非 OA 明确作为产品扩展实现，否则排除出行为对齐范围。 |

## 12. 单卡附录

状态值：`已对齐`、`已接受差异`、`需复核`、`排除`。

`需复核` 表示未对齐：已经发现 BGA 差异或高置信行为风险，需要修复或补测试确认后才能改为 `已对齐`；它不是“已接受差异”。

| 卡牌 | 状态 | 备注 |
|---|---|---|
| `A1_Shelter` | 已对齐 |  |
| `A2_ShiftingCultivation` | 已对齐 |  |
| `A3_PaperKnife` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `A4_Baseboards` | 已对齐 |  |
| `A5_ClayEmbankment` | 已对齐 |  |
| `A6_StorageBarn` | 已对齐 |  |
| `A7_GardenersKnife` | 已对齐 |  |
| `A8_FoodBasket` | 已对齐 |  |
| `A9_YoungAnimalMarket` | 已对齐 |  |
| `A10_WoodenShed` | 已对齐 |  |
| `A11_MudPatch` | 已对齐 |  |
| `A12_DrinkingTrough` | 已对齐 | pasture capacity additive 走 `computePastureCapacityModifiers`，在 replacement 后应用。 |
| `A13_RenovationCompany` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修。 |
| `A14_CarpentersHammer` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A15_CarpentersAxe` | 已对齐 |  |
| `A16_RammedClay` | 已对齐 | fence clay-for-wood 走 `scope:'unit'` trade，先生成 BGA `addCost` clay cost row，再允许 D88 等 bonus choice 继续替换。 |
| `A17_ReclamationPlow` | 已对齐 |  |
| `A18_WheelPlow` | 已对齐 |  |
| `A19_Handplow` | 已对齐 |  |
| `A20_DoubleTurnPlow` | 已对齐 | BGA `getBaseCosts()` 对齐为 `CardImpl.getBaseCosts()`，round > 3 时在进入 card-purchase pipeline 前生成 `{grain:1, food:1}` base candidate；不再用 `computeCosts.improvement` modifier 表达。 |
| `A21_FamilyFriendHome` | 已对齐 |  |
| `A22_Telegram` | 已对齐 | turn-start optional extraPlacement 的 skip/use session 路径已覆盖，行为等价于 BGA flag 后并入放人选择 |
| `A23_StoneCompany` | 已对齐 |  |
| `A24_ThreshingBoard` | 已对齐 |  |
| `A25_Bassinet` | 已对齐 |  |
| `A26_SleepingCorner` | 已对齐 |  |
| `A27_OvenSite` | 已对齐 | prerequisite 改用 `fireplaceIdentity` / `cookingHearthIdentity` played-card capability；不再直接枚举 A60_OrientalFireplace。onBuy 期间购买 Clay/Stone Oven 的 1 clay + 1 stone 固定价改走 card-purchase candidate replacement，不保留 printed oven cost candidate。 |
| `A28_ForestSchool` | 已对齐 |  |
| `A29_AleBenches` | 已对齐 |  |
| `A30_BakingSheet` | 已对齐 |  |
| `A31_DebtSecurity` | 已对齐 |  |
| `A32_Manger` | 已对齐 |  |
| `A33_BigCountry` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A34_Loppers` | 已对齐 |  |
| `A35_SwimmingClass` | 已对齐 |  |
| `A36_FacadesCarving` | 已对齐 |  |
| `A37_Bucksaw` | 已对齐 |  |
| `A38_WoolBlankets` | 已对齐 |  |
| `A39_Chapel` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A40_PottersYard` | 已对齐 |  |
| `A41_VegetableSlicer` | 已对齐 |  |
| `A42_ForestLakeHut` | 已对齐 |  |
| `A43_FarmyardManure` | 已对齐 |  |
| `A44_PondHut` | 已对齐 |  |
| `A45_FireProtectionPond` | 已对齐 |  |
| `A46_ClawKnife` | 已对齐 |  |
| `A47_Trellises` | 已对齐 |  |
| `A48_ShavingHorse` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A49_NestSite` | 已对齐 |  |
| `A50_MilkJug` | 已对齐 |  |
| `A51_DriftNetBoat` | 已对齐 |  |
| `A52_ThrowingAxe` | 已对齐 |  |
| `A53_Claypipe` | 已对齐 |  |
| `A54_Credit` | 已对齐 |  |
| `A55_JunkRoom` | 已对齐 |  |
| `A56_Basket` | 已对齐 |  |
| `A57_MilkingParlor` | 已对齐 |  |
| `A58_AsparagusKnife` | 已对齐 |  |
| `A59_PotatoRidger` | 已对齐 |  |
| `A60_OrientalFireplace` | 已对齐 |  |
| `A61_WinnowingFan` | 已对齐 |  |
| `A62_BeerKeg` | 已对齐 |  |
| `A63_DutchWindmill` | 已对齐 |  |
| `A64_BarleyMill` | 已对齐 |  |
| `A65_SeedPellets` | 已对齐 |  |
| `A66_FeedingDish` | 已对齐 |  |
| `A67_CornScoop` | 已对齐 |  |
| `A68_AsparagusGift` | 已对齐 |  |
| `A69_LargeGreenhouse` | 已对齐 |  |
| `A70_LiftingMachine` | 已对齐 |  |
| `A71_ClearingSpade` | 已对齐 |  |
| `A72_CalciumFertilizers` | 已对齐 |  |
| `A73_AgriculturalFertilizers` | 已对齐 |  |
| `A74_StableTree` | 已对齐 |  |
| `A75_LumberMill` | 已对齐 | improvement wood 折扣走 card-purchase candidate derivation；resolver 层保留原始候选并追加 sourced discounted candidate，支付层再由 dominance 隐藏严格劣势原价支付项。 |
| `A76_Cob` | 已对齐 |  |
| `A77_Hod` | 已对齐 |  |
| `A78_Canoe` | 已对齐 |  |
| `A79_GardenHoe` | 已对齐 |  |
| `A80_StoneTongs` | 已对齐 |  |
| `A81_InterimStorage` | 已对齐 |  |
| `A82_WorkCertificate` | 已接受差异 | BGA banned，但 OA 按产品策略保留；runtime 使用共享 partial-take helper 从 accumulation space 移除资源 |
| `A83_ShepherdsCrook` | 已对齐 |  |
| `A84_Silage` | 已对齐 |  |
| `A85_Homekeeper` | 已对齐 |  |
| `A86_AnimalTamer` | 已对齐 |  |
| `A87_Conservator` | 已对齐 |  |
| `A88_HedgeKeeper` | 已对齐 |  |
| `A89_StablePlanner` | 已对齐 |  |
| `A90_PlowDriver` | 已对齐 |  |
| `A91_ShiftingCultivator` | 已对齐 |  |
| `A92_AdoptiveParents` | 已对齐 | BGA pull model：玩家普通工人耗尽但仍持未激活后代时 `contributeExtraTurn` 贡献一次额外放工 XOR[use, forfeit]（#203+#204）；A92 own-prompt anytime suppression、stacked/beyond-player-count skip per-opportunity consumption、failed/auto-resolved/pending-context target rollback by placedWorkerId、forfeit visible log、多 newborn / adult-feeding 覆盖已补齐 |
| `A93_BedMaker` | 已对齐 |  |
| `A94_LazySowman` | 已对齐 |  |
| `A95_Angler` | 已对齐 |  |
| `A96_TaskArtisan` | 已对齐 |  |
| `A97_Freshman` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A98_StableArchitect` | 已对齐 |  |
| `A99_FellowGrazer` | 已对齐 |  |
| `A100_Curator` | 已对齐 |  |
| `A101_CookeryOutfitter` | 已对齐 |  |
| `A102_Grocer` | 已对齐 |  |
| `A103_Portmonger` | 已对齐 |  |
| `A104_WoodHarvester` | 已对齐 |  |
| `A105_BarrowPusher` | 已对齐 |  |
| `A106_SlurrySpreader` | 已对齐 |  |
| `A107_Catcher` | 已对齐 |  |
| `A108_MushroomCollector` | 已对齐 |  |
| `A109_SmallTrader` | 已对齐 |  |
| `A110_Roughcaster` | 已对齐 |  |
| `A111_WallBuilder` | 已对齐 |  |
| `A112_ScytheWorker` | 已对齐 | 额外收获选择门槛走 `computeHarvestSelectionThreshold()`；选中田通过 Harvest Count modifier 增加 count，并在 `harvestCountApplications` 记录来源 |
| `A113_HeresyTeacher` | 已接受差异 | 已接受的行为 / 产品差异 |
| `A114_SeasonalWorker` | 已对齐 |  |
| `A115_ChiefForester` | 已对齐 |  |
| `A116_WoodCutter` | 已对齐 |  |
| `A117_WoodCarrier` | 已对齐 |  |
| `A118_Treegardener` | 已对齐 |  |
| `A119_FirewoodCollector` | 已对齐 |  |
| `A120_ClayHutBuilder` | 已对齐 |  |
| `A121_ClayPuncher` | 已对齐 |  |
| `A122_PanBaker` | 已对齐 |  |
| `A123_FrameBuilder` | 已对齐 |  |
| `A124_Knapper` | 已对齐 |  |
| `A125_Priest` | 已对齐 |  |
| `A126_MasterWorkman` | 已对齐 |  |
| `A127_Lodger` | 已对齐 |  |
| `A128_RiparianBuilder` | 已对齐 | Reed Bank 触发的跨玩家 construct prompt 覆盖 undo 后重选 construct，确保不会重复进入 confirm-player-switch；授予 construct 的 clay/stone 折扣走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 折扣候选。 |
| `A129_Swagman` | 已对齐 |  |
| `A130_MummysBoy` | 已对齐 |  |
| `A131_CraftTeacher` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A132_Publican` | 已对齐 |  |
| `A133_Braggart` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A134_FullFarmer` | 已对齐 |  |
| `A135_AnimalReeve` | 已对齐 |  |
| `A136_DrudgeryReeve` | 已对齐 | BGA sharedScoring 通过 all-player before-end select dispatch 对每位 target player 提供 0..max sets 选择，选择后用 Scoring Reserve 记录 wood/clay/stone/reed 占用和 1/3/5 额外分；真实资源不扣除，Joinery / Pottery / Basketmaker / C133 读取剩余计分资源 |
| `A137_RiverineShepherd` | 已对齐 | optional extra good 使用另一个累积格的 partial collect，会扣除来源格并保留 action-space provenance |
| `A138_Harpooner` | 已对齐 |  |
| `A139_HollowWarden` | 已对齐 |  |
| `A140_ShovelBearer` | 已对齐 |  |
| `A141_TurnipFarmer` | 已对齐 |  |
| `A142_Cordmaker` | 已对齐 |  |
| `A143_Stonecutter` | 已对齐 | improvement stone 折扣走 `computeCardCostCandidates` 追加 sourced candidate；construct 仍走 optional bonus modifier，renovation 走 mandatory sourced bonus modifier，不保留原始翻修成本分支。 |
| `A144_Sequestrator` | 已对齐 |  |
| `A145_Ropemaker` | 已对齐 |  |
| `A146_StorehouseSteward` | 已对齐 |  |
| `A147_AnimalDealer` | 已对齐 |  |
| `A148_Woolgrower` | 已对齐 |  |
| `A149_HouseArtist` | 已对齐 | 授予 construct 的 reed 折扣走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 折扣候选。 |
| `A150_Stagehand` | 已对齐 |  |
| `A151_Minstrel` | 已对齐 |  |
| `A152_NightSchoolStudent` | 已对齐 |  |
| `A153_PigOwner` | 已对齐 |  |
| `A154_Paymaster` | 已对齐 |  |
| `A155_Conjurer` | 已对齐 |  |
| `A156_Buyer` | 已对齐 |  |
| `A157_Bohemian` | 已对齐 |  |
| `A158_CulinaryArtist` | 已对齐 |  |
| `A159_JoineroftheSea` | 已对齐 |  |
| `A160_Lutenist` | 已对齐 |  |
| `A161_PatchCaretaker` | 已对齐 |  |
| `A162_ForestTallyman` | 已对齐 |  |
| `A163_BuildingExpert` | 已对齐 |  |
| `A164_WoodWorker` | 已对齐 |  |
| `A165_PigBreeder` | 已对齐 |  |
| `A166_Haydryer` | 已对齐 |  |
| `A167_BreederBuyer` | 已对齐 |  |
| `A168_AnimalTeacher` | 已对齐 |  |
| `A169_OffSiter` | 排除 | BGA implemented=false，本轮无运行时对齐目标；Card Source metadata-only 代表迁移，仍无运行时 impl |
| `A170_Hayward` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A171_Sidekick` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A172_BoatPainter` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A173_ClayThief` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A174_MasterHora` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A175_HollowGardener` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A176_Wheelmaker` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A177_Middleman` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A178_CarpentersBoy` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A179_MountainShepherd` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `A180_AnimalBrander` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B1_UpscaleLifestyle` | 已对齐 | 即时翻修子行动使用当前 `renovate-house` action id。 |
| `B2_MiniPasture` | 已对齐 | BGA `formatCost([WOOD => 0])` / `miniPasture` 通过 nested `fencePolicy` 表达免费 fence、最多 4 段总 fence、恰好 1 个 1 格新牧场，不走 `fencing` wrapper 丢 params。 |
| `B3_Moonshine` | 已对齐 |  |
| `B4_WoodPile` | 已对齐 |  |
| `B5_StoreofExperience` | 已对齐 |  |
| `B6_ExcursiontotheQuarry` | 已对齐 |  |
| `B7_Wage` | 已对齐 |  |
| `B8_MarketStall` | 已对齐 |  |
| `B9_BeatingRod` | 已对齐 |  |
| `B10_Caravan` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B11_Feedyard` | 已对齐 |  |
| `B12_Stockyard` | 已对齐 |  |
| `B13_CarpentersParlor` | 已对齐 | 木房固定 2 wood + 2 reed 建房成本走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 候选。 |
| `B14_Hawktower` | 已对齐 |  |
| `B15_CarpentersBench` | 已接受差异 | BGA banned，但 OA 按产品策略保留；BGA `formatCost([WOOD => 1])` / `max` / `benchWood` 通过 `reserve-fence-bonus` + nested `fencePolicy` 表达：只建普通 fence、恰好 1 个新牧场、1 段免费，并用 `paymentBudget: { wood: collectedWood }` 限制最终实付普通 wood；通过 `fencePolicy.promptHintKey` 给前端提示“只能 1 个新牧场”；不注册全局 `fencing` 折扣，避免和 E16/C16 等 `computeCosts.fence` 再次叠加；不再用 `collectedWood + 1` 段数上限裁剪合法形状。 |
| `B16_MiningHammer` | 已对齐 | onBuy 使用 CardEffect；翻修后仍监听 `after.renovate-house` 并免费建 1 个 stable |
| `B17_ForestPlow` | 已对齐 |  |
| `B18_GrasslandHarrow` | 已对齐 |  |
| `B19_MoldboardPlow` | 已对齐 | optional extra plow 先执行 `plow`，成功后再 `pop-card-stack`；optional 跳过走 `__skip__`，接受后 `plow` confirm-only 且 direct `cancel` 被通用 guard 拒绝 |
| `B20_ChainFloat` | 已对齐 |  |
| `B21_HayloftBarn` | 已接受差异 | BGA banned，但 OA 按产品策略保留；通过 resource exchange 获得的 grain 已由 provenance helper 触发；空卡 family-growth 使用 `hasInactiveWorkerInSupply`，不会在仅剩 removed worker 时暴露生人 flow |
| `B22_WalkingBoots` | 已接受差异 | BGA banned，但 OA 按产品策略保留；临时 from-supply worker 归还时标记 `removedFromSupply`，后续 family-growth supply 与玩家面板家庭成员上限都不再计入该 token |
| `B23_FinalScenario` | 已对齐 | 第 14 轮行动 reveal / exclusive gate / clear event 已由后端权威建模 |
| `B24_Lasso` | 已对齐 | 任意首次放人后先用 placement availability 计算合法 second-placement target；非动物市场首放仅在有合法动物市场时触发，动物市场首放仅在有任意合法 target 时触发，并经通用 target action flow 执行目标行动 |
| `B25_BreadPaddle` | 已对齐 |  |
| `B26_AgrarianFences` | 已对齐 |  |
| `B27_Toolbox` | 已对齐 | 重审未见实质行为差异；建 room/stable/fence 后可买 Joinery/Pottery/Basket，子行动 `trueAction=false` |
| `B28_ForestryStudies` | 已对齐 |  |
| `B29_CookeryLesson` | 已对齐 | lessons-3 行动格覆盖已由共享 lessons-space helper 对齐 |
| `B30_WoodPalisades` | 已对齐 |  |
| `B31_PotteryYard` | 已对齐 | prerequisite 改用 `potteryIdentity` played-card capability；D60_LargePottery 通过 dual-type major 身份参与判断。 |
| `B32_Kettle` | 已对齐 |  |
| `B33_Mantlepiece` | 已对齐 | desc/cost/vp/prereq/onBuy 得分对齐；BGA/OA 均未见 runtime 禁止 renovate 逻辑 |
| `B34_SpecialFood` | 已对齐 | 行动格动物 provenance 已收敛到 `sumActionSpaceMovedToTriggerPlayer()`；保留动物检查改用 assigned animal 口径，bonus VP 只记一次并在牌面显示累计值 |
| `B35_HookKnife` | 已对齐 |  |
| `B36_Bottles` | 已对齐 | BGA `getBaseCosts()` 对齐为 `CardImpl.getBaseCosts()`，按当前 family size 在进入 card-purchase pipeline 前生成 `{clay:N, food:N}` base candidate；不再用 `computeCosts.improvement` modifier 表达。 |
| `B37_Grange` | 已对齐 |  |
| `B38_FutureBuildingSite` | 已对齐 |  |
| `B39_Loom` | 已对齐 |  |
| `B40_BreweryPond` | 已对齐 |  |
| `B41_Hauberg` | 已对齐 |  |
| `B42_ForestInn` | 已对齐 |  |
| `B43_Chophouse` | 已对齐 |  |
| `B44_ChickStable` | 已对齐 |  |
| `B45_StrawberryPatch` | 已对齐 |  |
| `B46_ClubHouse` | 已对齐 |  |
| `B47_HerringPot` | 已对齐 |  |
| `B48_ForestStone` | 已对齐 |  |
| `B49_Scales` | 已对齐 | `after.occupation` / `after.improvement` 用 trigger snapshot helper 判断触发时职业/改良平衡；连续打职业/改良导致 live count 改变时仍按触发帧结算。 |
| `B50_ButterChurn` | 已对齐 |  |
| `B51_DiggingSpade` | 已对齐 |  |
| `B52_GrowingFarm` | 已对齐 |  |
| `B53_SculptureCourse` | 已对齐 |  |
| `B54_Tumbrel` | 已对齐 | #186 sow 后“每座畜栏 1 food”改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`） |
| `B55_MaintenancePremium` | 已对齐 |  |
| `B56_Brook` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B57_Scullery` | 已对齐 |  |
| `B58_CrackWeeder` | 已对齐 |  |
| `B59_FoodChest` | 已对齐 |  |
| `B60_BrewingWater` | 已对齐 |  |
| `B61_ThreeFieldRotation` | 已对齐 |  |
| `B62_Pitchfork` | 已对齐 |  |
| `B63_Tasting` | 已对齐 | lessons-3 行动格覆盖已由共享 lessons-space helper 对齐 |
| `B64_MillWheel` | 已对齐 |  |
| `B65_GrainDepot` | 已对齐 | wood/clay/stone base paths 作为 card-purchase candidates 进入 ComputeCardCosts；派生候选支付后 onBuy 使用 `originalFeeIndex` 保持原路径身份，wood/clay/stone 仍分别排 2/3/4 个 future grain。 |
| `B66_SackCart` | 已对齐 |  |
| `B67_HandTruck` | 已对齐 | bake 前先 optional gain grain，随后保留 mandatory bake continuation；无 bake provider 时不触发 |
| `B68_Beanfield` | 已对齐 |  |
| `B69_PottersMarket` | 已对齐 |  |
| `B70_NewPurchase` | 已对齐 |  |
| `B71_HarvestHouse` | 已对齐 |  |
| `B72_LoveforAgriculture` | 已对齐 | 已播种 pasture 的容量扣减走 additive pasture capacity modifier；即使 B72 先打出，也在 D11 replacement / A12 additive 后按 modifier 顺序计算。 |
| `B73_GiftBasket` | 已对齐 |  |
| `B74_ThickForest` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B75_WoodWorkshop` | 已对齐 | 使用通用 before-reachability opt-in；B75 session 覆盖 gain wood 后打出小改、经 A48 转换后打出 food-cost 小改，以及最终仍不可达时 engine-blocked / undo-only |
| `B76_Ceilings` | 已对齐 |  |
| `B77_LoamPit` | 已对齐 |  |
| `B78_ReedBelt` | 已对齐 |  |
| `B79_Corf` | 已对齐 |  |
| `B80_HardPorcelain` | 已对齐 |  |
| `B81_Handcart` | 已对齐 | 使用共享 partial-take helper 生成 `collect` leaf，从 accumulation space 移除 1 个资源并记录 `resource.moved` 来源 |
| `B82_ValueAssets` | 已对齐 |  |
| `B83_MuddyPuddles` | 已对齐 |  |
| `B84_AcornsBasket` | 已对齐 |  |
| `B85_FarmHand` | 已接受差异 | FarmHand stable 通过 Farm Expansion 的 `stables` leaf wrapper（`actionContext.farmHand`）进入共享 stables 付费 / `farm.stableBuilt` 事件 / after-stables listener 链路，cost = 2 wood 并随 C88 等折扣统一生效；OA 允许同一次 stables leaf 混合建造普通 stable 与 FarmHand 特殊 stable。差异：FarmHand 位置不进 `stableTiles`（不计入动物 zone / loose stable 容量），仅经 `computeExtraRoomCapacity` +1 住房，stable count 口径由 `shared/domain/stables.ts` 单独派生。`farm.stableBuilt` item 加 `kind: 'normal' \| 'special'`，special 带 `sourceCardId`。Return-stable（D102 / E76 经 `stable-removal` helper）把 FarmHand 列为候选并清 `extraData.position`、释放 1 个 stable supply、住房容量回 0，但保留 `flagged`（once-per-game，回收后不再 offer），不产生动物重整 flow。前端接线（#189 P1-1）：`useFarmSelection` 加 `pendingFarmHand` 状态（最多 1 个特殊位点）；FarmBoard 把 farm-select 的 `farmHandPositions` 渲染为可点击目标；InteractionBar confirm 在 `pendingStableTilesLength === 0 && !pendingFarmHand` 才禁用（只选 FarmHand 也可确认）；提交经 `buildStableCommitPayload` 走 `commitSelection({ stables, farmHand })`。UI 候选/选中态（#199）：候选不再标在 2×2 左上角田格，而是渲染在 2×2 几何中心的 `post` cell（纯函数 `client/components/board/farmHandCenter.ts` 做 top-left↔center-post 坐标映射），用半透明紫色中心框 overlay（`.farmhand-center-overlay`，热区 ≈0.7×`--tile` 易点、不抢外圈普通 stable 候选），点中心经 `toggleFarmHand(top-left)`，选中加粗实心框。已建常驻态（#200）：后端通用 card-effect hook `getBuiltSpecialStables(player)` + 聚合 `collectBuiltSpecialStables` 派生 snapshot 展示字段 `SerializedPlayerState.specialStables`（不进领域顶层、`rehydrateState` 剥离）；前端 `GameContainerApi` 从 `displayPlayer.specialStables` 派生 built top-left 集合传给 FarmBoard，在 2×2 中心 post 渲染 `.farmhand-center-built` 常驻 stable 图标（无脉动、不可再选），随 snapshot 自然更新——D102/E76 回收后 `specialStables` 空、overlay 消失。2026-05-30 UI 修正：InteractionBar 摘要把 FarmHand 计入 selected 并显示 `Max +` 语义；farm post 父级不再用 `opacity: 0` 隐藏自身；选择态只显示中心框、不显示 stable 图标，建成态只显示 stable 图标、不保留选择框；`farm.stableBuilt` 高亮跳过 `kind:'special'`，避免把 top-left 存储坐标高亮成普通田格。前端零单卡耦合（不读 `cardStates['B85_FarmHand']`、不 import `shared/cards`）。 |
| `B86_TruffleSearcher` | 已对齐 |  |
| `B87_Cottager` | 已对齐 |  |
| `B88_EstablishedPerson` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修；后续 ordinary fence 直接走 `fence`。 |
| `B89_Groom` | 已对齐 |  |
| `B90_CooperativePlower` | 已对齐 |  |
| `B91_AssistantTiller` | 已对齐 |  |
| `B92_LittleStickKnitter` | 已对齐 |  |
| `B93_Confidant` | 已对齐 | onBuy 必须选择 2/3/4 个未来 round 之一；`isDoable.occupation` 按可选 occupation 支付方案过滤，并通过 `reserveResources` 要求职业支付后仍有最低 2 个真实 food 支付 future schedule；`isDoable.lessons*` 在 B93 是唯一且不可支付的职业时 veto lessons action space，避免占格后无职业可打；future receive 后可选 `sow` 或 `fence`，其中 BGA `formatCost([WOOD => 1])` 通过 nested `fencePolicy.costPolicy` 显式表达，并继续叠加 E16 / C16 等 `computeCosts.fence` 折扣。 |
| `B94_StockProtector` | 已对齐 |  |
| `B95_MasterBricklayer` | 已对齐 | major-only stone 折扣走 `computeCardCostCandidates`，按当前房间数追加 sourced candidates；minor improvement 不产生 candidate pipeline 输出。 |
| `B96_TreeFarmJoiner` | 已对齐 | future wood 到期走通用 Future Receive；卡内 `after.receive` listener 检查本卡来源 wood 后追加 optional `minor-improvement`，不在 round-start 核心路径写单卡分支。 |
| `B97_Scholar` | 已对齐 |  |
| `B98_OrganicFarmer` | 已对齐 |  |
| `B99_Tutor` | 已对齐 |  |
| `B100_Clutterer` | 已对齐 |  |
| `B101_FurnitureCarpenter` | 已对齐 |  |
| `B102_Consultant` | 已对齐 |  |
| `B103_FieldMerchant` | 已对齐 |  |
| `B104_SheepWalker` | 已对齐 |  |
| `B105_CaseBuilder` | 已对齐 |  |
| `B106_MoralCrusader` | 已对齐 |  |
| `B107_Manservant` | 已对齐 |  |
| `B108_OvenFiringBoy` | 已对齐 |  |
| `B109_PaperMaker` | 已对齐 |  |
| `B110_Pavior` | 已对齐 |  |
| `B111_Rustic` | 已对齐 |  |
| `B112_Silokeeper` | 已对齐 |  |
| `B113_PatchCaregiver` | 已对齐 |  |
| `B114_Childless` | 已对齐 |  |
| `B115_TinsmithMaster` | 已对齐 | 播种奖励已改为 optional farm-position selection，使用精确 selectableTiles |
| `B116_Shoreforester` | 已对齐 |  |
| `B117_Informant` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B118_SmallscaleFarmer` | 已对齐 |  |
| `B119_Lumberjack` | 已对齐 |  |
| `B120_Sweep` | 已对齐 |  |
| `B121_Geologist` | 已对齐 |  |
| `B122_Mineralogist` | 已对齐 |  |
| `B123_RoofBallaster` | 已对齐 |  |
| `B124_Trimmer` | 已对齐 | after fence 不再写本工作阶段奖励 flag；每次牧场覆盖面积增加都可得 2 stone，return-home flag 仍阻止非工作阶段误触 |
| `B125_EstateWorker` | 已对齐 |  |
| `B126_Carpenter` | 已对齐 | 固定 3 building-resource + 2 reed 建房成本走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 候选。 |
| `B127_Seducer` | 已对齐 |  |
| `B128_Plumber` | 已对齐 | Major Improvement 后 optional `renovate-house` leaf 以 `sourceCard` 触发；翻修 cost listener 读取 `params.selectedOption` 的目标材质，只提供 mandatory sourced 2 个目标资源折扣。 |
| `B129_Seatmate` | 已对齐 | 4p 用 `(ownerIdx+⌊n/2⌋)%n` 计算对座，对座未占 r13 且 owner 自己未在 r13 时才注入 allow-occupied；3p 任一邻座占且 owner 自己未在 r13 时注入；round<13 / 其他人数不注入。state.players 顺序约定与 C150_ParrotBreeder 一致。 |
| `B130_FullPeasant` | 已对齐 |  |
| `B131_Equipper` | 已对齐 |  |
| `B132_EstateMaster` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B133_VillagePeasant` | 已对齐 |  |
| `B134_HousebookMaster` | 已对齐 |  |
| `B135_NutritionExpert` | 已对齐 |  |
| `B136_HouseSteward` | 已对齐 |  |
| `B137_Wholesaler` | 已对齐 | #241 改为卡内 `SPACE_REWARDS` 表生成四个 action-space listener，保留 cardStates 一次性领取语义。 |
| `B138_ForestGuardian` | 已对齐 |  |
| `B139_ForestScientist` | 已对齐 |  |
| `B140_FarmyardWorker` | 已对齐 |  |
| `B141_FieldCaretaker` | 已对齐 |  |
| `B142_Greengrocer` | 已对齐 |  |
| `B143_ClayWarden` | 已对齐 |  |
| `B144_Collier` | 已对齐 |  |
| `B145_BrushwoodCollector` | 已对齐 | renovation replacement 是无状态 cost alternative，不设置 `choiceAffectsState`；与 D88 等折扣组合时可被 payment dominance pruning 去掉严格劣势支付项。 |
| `B146_Illusionist` | 已对齐 |  |
| `B147_Huntsman` | 已对齐 |  |
| `B148_PetBroker` | 已对齐 |  |
| `B149_OpenAirFarmer` | 已对齐 | pay 3 stable supply token；fixed 2 wood 建一个 2格 pasture；`segmentBounds.total.max=6`，B30 palisade 计入总段数且可补足 ordinary fence supply |
| `B150_LargeScaleFarmer` | 已对齐 |  |
| `B151_LittlePeasant` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B152_JuniorArtist` | 已对齐 |  |
| `B153_Housemaster` | 已对齐 | 终局计分按 major identity 汇总真实 major 与 `alsoCountsAs: ['major']` 的 minor，不再保留 A60 单卡特判。 |
| `B154_SheepKeeper` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B155_ArtTeacher` | 已对齐 | 职业支付可用 Traveling Players 食物通过卡牌内部 `paymentResourceProviders` 表达；payment solution 记录 `B155_ArtTeacher:traveling-players-food`，执行时扣行动格食物，不再用 payment trade sideEffect。 |
| `B156_StorehouseKeeper` | 已对齐 |  |
| `B157_Salter` | 已对齐 |  |
| `B158_DistrictManager` | 已对齐 |  |
| `B159_LieutenantGeneral` | 已对齐 |  |
| `B160_PubOwner` | 已对齐 |  |
| `B161_Weakling` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B162_ForestClearer` | 已对齐 |  |
| `B163_Pastor` | 已对齐 |  |
| `B164_SheepWhisperer` | 已对齐 |  |
| `B165_GameProvider` | 已对齐 | 已限制 1/3/4 块 grain field，并在 effect 前校验 selectableTiles |
| `B166_CattleFeeder` | 已对齐 |  |
| `B167_StableSergeant` | 已对齐 |  |
| `B168_PastureMaster` | 已对齐 |  |
| `B169_LivestockSustainer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B170_CorralBuilder` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B171_GreenhouseBuilder` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B172_CattleCaregiver` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B173_Sweeper` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B174_RiverbankGardener` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B175_FieldOverseer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B176_VillageIdiot` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B177_StoneClawer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B178_TagAlong` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B179_WildBoarHunter` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `B180_GameTeaser` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C1_Overhaul` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理；rebuild 只计数/回收/重建 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy` |
| `C2_Stable` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 `stables` `actionContext.exactCost` 表达免费 stable。 |
| `C3_CarriageTrip` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C4_WritingBoards` | 已对齐 |  |
| `C5_Remodeling` | 已对齐 |  |
| `C6_StoneClearing` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `C7_BladeShears` | 已对齐 |  |
| `C8_PlantFertilizer` | 已对齐 |  |
| `C9_AutomaticWaterTrough` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `C10_BunkBeds` | 已对齐 |  |
| `C11_WildlifeReserve` | 已对齐 |  |
| `C12_CattleFarm` | 已对齐 |  |
| `C13_WoodSlideHammer` | 已对齐 | wood house 且至少 5 rooms 的直接翻修到 stone 折扣走 mandatory sourced bonus modifier，不保留原始 stone 翻修成本分支。 |
| `C14_StrawThatchedRoof` | 已对齐 | construct / renovation 移除 reed 通过 `capDiscountAtCost` 表达，不再依赖过量折扣被 payment 枚举器截断。 |
| `C15_Trellis` | 已对齐 | BGA ordinary `FENCING` 子行动映射到内部 `fence` leaf。 |
| `C16_FieldFences` | 已对齐 |  |
| `C17_NewlyPlowedField` | 已对齐 |  |
| `C18_RollOverPlow` | 已对齐 | discard selection 默认至少选 1 个有作物田，空提交或选择空田不会绕过 discard 直接进入 plow。 |
| `C19_SwingPlow` | 已对齐 |  |
| `C20_MolePlow` | 已对齐 |  |
| `C21_HeartofStone` | 已对齐 |  |
| `C22_BasketChair` | 已对齐 | 回收 Day Laborer 工人后按 linked-occupancy metadata 清理同 linked worker 的 synthetic occupancy，并保留真实 / 不匹配 lessons 占格 |
| `C23_JobContract` | 已对齐 | lessons fake occupancy 写入 `WorkerRef.synthetic.kind='linked-occupancy'`，source card 与 linked worker id 都在 action-space state 上表达 |
| `C24_BedintheGrainField` | 已对齐 | 下一次 harvest 有空房时提供 optional `family-growth`，skip/accept 后都清理一次性 marker；无空房也消费 marker |
| `C25_SteamMachine` | 已对齐 | 最后一个普通工人使用 accumulation space 后返回 `SEQ[optional bake-bread, special-effect.consume-pending-extra-turns]`；消费步骤走通用 pending extra-turn 聚合，不引用 A92。无 pending/不可支付时 silent no-op；有多个 pending opportunity 时全部写入 `_extraTurnConsumedCount`，并只在实际消费时由 C25 发 `card.triggered`。Card-sourced follow-up leaf 通过 `sourceCard` 守卫避免 immediatelyAfter 自触发循环，也不把卡牌额外放人当作“普通工人最后行动”。 |
| `C26_Flail` | 已对齐 |  |
| `C27_Blueprint` | 已对齐 | 三张 workshop major 保留原支付 candidate，并追加 Blueprint stone-discount candidate；minor-improvement 入口维持 `computeChoiceCandidates` listener 模式，payment option 通过 candidate metadata 显示来源。 |
| `C28_TeachersDesk` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C29_BeerTable` | 已对齐 |  |
| `C30_HalfTimberedHouse` | 已对齐 |  |
| `C31_WritingChamber` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C32_AbortOriel` | 已对齐 |  |
| `C33_GreeningPlan` | 已对齐 |  |
| `C34_ElephantgrassPlant` | 已对齐 |  |
| `C35_LanternHouse` | 已对齐 |  |
| `C36_ClayDeposit` | 已对齐 |  |
| `C37_DwellingMound` | 已对齐 |  |
| `C38_Christianity` | 已对齐 |  |
| `C39_StudioBoat` | 已对齐 |  |
| `C40_CanvasSack` | 已对齐 |  |
| `C41_FarmStore` | 已对齐 | #241 改为卡内 `REWARD_OPTIONS` 表生成 optional pay/gain XOR。 |
| `C42_RavenousHunger` | 已对齐 | Vegetable Seeds 后先用 placement availability 过滤实际可进入的累积格；有合法 target 才创建 optional second placement，目标 collect 通过 `after.collect` flag 追加对应累积资源 +1，并在结算后 unflag |
| `C43_FarmBuilding` | 已对齐 |  |
| `C44_ChickenCoop` | 已对齐 |  |
| `C45_Stew` | 已对齐 |  |
| `C46_Mandoline` | 已对齐 |  |
| `C47_GardenClaw` | 已对齐 |  |
| `C48_Farmstead` | 已对齐 |  |
| `C49_BeerStall` | 已对齐 | #186 “空未围畜栏”改用 `getEmptyUnfencedStableCountForCards`（B85 永远算 1 个 empty，对齐 BGA `getEmptyUnfencedStables`） |
| `C50_StableYard` | 已对齐 |  |
| `C51_FishingNet` | 已对齐 |  |
| `C52_HuntsmansHat` | 已对齐 | cooking prerequisite 与 action-space boar/pig gain 得 food 路径对齐；未见当前 OA action-space 差异 |
| `C53_GypsysCrock` | 已对齐 |  |
| `C54_MarketBooth` | 已对齐 | printed cost 为 1 stable；收获 exchange 支付 grain + reserve fence |
| `C55_Studio` | 已对齐 |  |
| `C56_FeedFence` | 已对齐 | stable clay-for-wood 走 `scope:'unit'` trade + `groupMax:1`，只替换一座原本 2 wood 的 stable，并能先生成 BGA `addCost` clay cost row 再被 D88 替换；#186 “第 4 座畜栏 +2 food”bonus 口径改用 `getStableCountForCards === 4`（含 B85，对齐 BGA `countStablesForCards()==4`）；本次建造数仍走 `getStableTilesBuiltThisAction`（归 #185） |
| `C57_Crudite` | 已对齐 |  |
| `C58_Woodcraft` | 已对齐 |  |
| `C59_SchnappsDistillery` | 已对齐 |  |
| `C60_SmallPottersOven` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C61_BeerStein` | 已对齐 |  |
| `C62_CookeryExtension` | 已对齐 |  |
| `C63_CraftBrewery` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C64_CornSchnappsDistillery` | 已对齐 |  |
| `C65_Granary` | 已对齐 |  |
| `C66_EternalRyeCultivation` | 已对齐 |  |
| `C67_MineralFeeder` | 已对齐 | turn start 先提供 optional reorganize，再按 reorganize 后 pasture sheep 状态发放奖励 |
| `C68_Bookcase` | 已对齐 |  |
| `C69_LandConsolidation` | 已对齐 | extra-crop placement pending 期间通过 `actionContext.extraCropPlacement` 禁用 anytime，避免嵌套 swap |
| `C70_LettucePatch` | 已对齐 |  |
| `C71_Slurry` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C72_FestivalPlanning` | 已对齐 | onBuy 先执行 `private-field-phase` 收获普通田和 Card Field，再进入 optional improvement |
| `C73_SeaweedFertilizer` | 已对齐 |  |
| `C74_PrivateForest` | 已对齐 |  |
| `C75_Firewood` | 已对齐 | 按 `fireplaceIdentity` / `cookingHearthIdentity` / `ovenIdentity` 触发；D25_WitchesDanceFloor 触发，D64_BakingCourse 不触发。 |
| `C76_WoodCart` | 已对齐 |  |
| `C77_ClaySupply` | 已对齐 |  |
| `C78_ReedHattedToad` | 已对齐 |  |
| `C79_StoneCart` | 已对齐 |  |
| `C80_RockyTerrain` | 已对齐 |  |
| `C81_MaterialHub` | 已对齐 |  |
| `C82_HardwareStore` | 已对齐 |  |
| `C83_EarlyCattle` | 已对齐 |  |
| `C84_PerennialRye` | 已对齐 |  |
| `C85_DenBuilder` | 已对齐 |  |
| `C86_LivestockFeeder` | 已对齐 |  |
| `C87_Mason` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `C88_CarpentersApprentice` | 已对齐 | 木房建房 -2 wood 走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 折扣候选。第 13–15 根 fence 免费区间走 `computeCosts.fence`，doability 通过免费 `fencePolicy` 复用真实布局门禁。Build Stables 的 `maxSelections` 用 count-aware total cost 计算（#191）：`stables.ts` 的 `buildStableFarmSelection` 对 count=1..reserve 逐一算 `resolveStableTotalCostWithDiscount`（与结算同一总额，含 C88 第 3/4 座 -1 的 non-uniform 折扣）+ `canAffordTypedFlatCost`，取最大可负担数覆写 `farm.maxSelections`，不再 probe `stableCount:1` 折后注入 farmyard 的 per-unit `costOverride`（non-uniform 折扣下会少让一座，如 1 card-facing stable + 3 wood + C88 应能建 2 座）。total 对 count 单调（每多一座 ≥+1 wood），首个不可负担即终止扫描。`actionContext.max`（A1 Shelter）/`zoneFilter='pasture-1'`/`exactCost`（C94）路径不受影响。 |
| `C89_StableMaster` | 已对齐 | onBuy 的 1 wood stable 走 `stables` exactCost，入口不做 raw wood gate，允许 C88 等 `computeCosts.stables` 折扣叠加。 |
| `C90_FieldWatchman` | 已对齐 |  |
| `C91_PlowHero` | 已对齐 |  |
| `C92_AutumnMother` | 已对齐 |  |
| `C93_InnerDistrictsDirector` | 已对齐 | 放 stone 与可选额外放人已作为整段 optional，skip 不再强制放 stone |
| `C94_StableCleaner` | 已对齐 | anytime 入口用 stables preview + `computeCosts.stables` 判断可用性，1 wood + 1 food exactCost 可叠加 C88 等 stable cost modifier。 |
| `C95_BasketWeaver` | 已对齐 | onBuy 期间 Basketmaker's Workshop 的 1 reed + 1 stone 固定价改走 card-purchase candidate append，保留原价 candidate，并在 payment option 展示来源；fixed-price listener 在 candidate pipeline 中先于普通折扣执行，避免组合来源污染。 |
| `C96_Merchant` | 已对齐 |  |
| `C97_SeedResearcher` | 已对齐 |  |
| `C98_CubeCutter` | 已对齐 |  |
| `C99_GardenDesigner` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C100_Butler` | 已对齐 |  |
| `C101_StallHolder` | 已对齐 | #186 “未围畜栏数”改用 `getUnfencedStableCountForCards`（含 B85，对齐 BGA `countUnfencedStablesForCards`） |
| `C102_TreeGuard` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C103_GreenGrocer` | 已对齐 |  |
| `C104_Collector` | 已对齐 |  |
| `C105_BasketCarrier` | 已对齐 |  |
| `C106_PotatoHarvester` | 已对齐 |  |
| `C107_Baker` | 已对齐 |  |
| `C108_Layabout` | 已对齐 |  |
| `C109_SchnappsDistiller` | 已对齐 |  |
| `C110_HomeBrewer` | 已对齐 |  |
| `C111_SmallAnimalBreeder` | 已对齐 |  |
| `C112_Thresher` | 已对齐 |  |
| `C113_WinterCaretaker` | 已对齐 |  |
| `C114_SoilScientist` | 已对齐 |  |
| `C115_Sower` | 已对齐 |  |
| `C116_FurnitureMaker` | 已对齐 |  |
| `C117_Legworker` | 已对齐 |  |
| `C118_WoodCollector` | 已对齐 |  |
| `C119_SkillfulRenovator` | 已对齐 |  |
| `C120_AgriculturalLabourer` | 已对齐 | gain/receive/reap/exchange 转换 grain 均触发从卡上取 clay 的路径 |
| `C121_ClayKneader` | 已对齐 |  |
| `C122_Bricklayer` | 已对齐 | improvement clay 折扣走 `computeCardCostCandidates` 追加 sourced candidate；construct 仍走 optional bonus modifier，renovation 走 mandatory sourced bonus modifier，不保留原始 clay 翻修成本分支。 |
| `C123_Freemason` | 已对齐 |  |
| `C124_StoneImporter` | 已对齐 |  |
| `C125_Nightworker` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C126_Excavator` | 已对齐 |  |
| `C127_Lover` | 已对齐 |  |
| `C128_WoodenHutExtender` | 已对齐 | 分轮次木房固定成本走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 候选。 |
| `C129_SecondSpouse` | 已对齐 |  |
| `C130_OutskirtsDirector` | 已对齐 |  |
| `C131_PrivateTeacher` | 已对齐 |  |
| `C132_TimberShingleMaker` | 已对齐 |  |
| `C133_Soldier` | 已对齐 | 终局前 owner before-end select 提供 0..max 对 wood/stone 选择；选择后用 Scoring Reserve 记录占用和额外分，真实资源不扣除，资源计分读取剩余计分资源 |
| `C134_CowPrince` | 已对齐 |  |
| `C135_Constable` | 已对齐 |  |
| `C136_RanchProvost` | 已对齐 |  |
| `C137_CharcoalBurner` | 已对齐 |  |
| `C138_AnimalFeeder` | 已对齐 |  |
| `C139_BasketmakersWife` | 已对齐 |  |
| `C140_PackagingArtist` | 已对齐 |  |
| `C141_SheepProvider` | 已对齐 |  |
| `C142_MarketCrier` | 已对齐 |  |
| `C143_StoneBuyer` | 已对齐 |  |
| `C144_ReedRoofRenovator` | 已对齐 |  |
| `C145_ForestReviewer` | 已对齐 |  |
| `C146_WorkshopAssistant` | 已对齐 | onBuy 将 pair key 存入 `extraData.pairs` 并记录所选资源 pair 日志；其他玩家 renovation 后 owner 可 optional 取回一对，资源移动走标准 `gain`/`resource.moved` 语义并记录 used/gained；owner prompt 进入/返回行动玩家都经过确认玩家切换，且切换边界不暴露 undo；交互栏 pair 选择使用资源图标并替换 needed 参数；Played Cards 区从 `extraData.pairs` 渲染卡上资源 pair stack |
| `C147_Cowherd` | 已对齐 |  |
| `C148_MudWallower` | 已对齐 | `held` counter 是卡上野猪的当前上限/数量口径；animal reorg 的 `card:C148_MudWallower` zone 展示真实卡上野猪数并在前端 played-card 区可调整；E53 这类动物兑换通过一次性 Animal Payment Preference 决定是否扣本牌 held，普通 action-space / B137 新获得野猪兑换不误扣本牌 held |
| `C149_ResourceRecycler` | 已对齐 |  |
| `C150_ParrotBreeder` | 已对齐 |  |
| `C151_SowingDirector` | 已对齐 |  |
| `C152_Puppeteer` | 已对齐 |  |
| `C153_PatternMaker` | 已对齐 |  |
| `C154_TwinResearcher` | 已对齐 | pair 映射补齐 hollow / copse-add 等 BGA 行动格覆盖 |
| `C155_FoodDistributor` | 已对齐 |  |
| `C156_HoofCaregiver` | 已对齐 |  |
| `C157_ResourceAnalyzer` | 已对齐 |  |
| `C158_ForestCampaigner` | 已对齐 |  |
| `C159_FishermansFriend` | 已对齐 |  |
| `C160_Outrider` | 已对齐 |  |
| `C161_PotatoDigger` | 已对齐 |  |
| `C162_ForestOwner` | 已对齐 |  |
| `C163_MaterialDeliveryman` | 已对齐 |  |
| `C164_GermanHeathKeeper` | 已对齐 |  |
| `C165_GameCatcher` | 已对齐 |  |
| `C166_CattleWhisperer` | 已对齐 |  |
| `C167_CattleBuyer` | 已对齐 |  |
| `C168_AnimalCatcher` | 已对齐 |  |
| `C169_FastMason` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C170_AmateurFencer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C171_YoungArtist` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C172_FieldCounter` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C173_TopOuter` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C174_StoneCustodian` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C175_VillageTeacher` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C176_Cleanacre` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C177_MountainHiker` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C178_OnSiteReverend` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C179_BovinePioneer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C180_Trapper` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D1_ZigzagHarrow` | 已对齐 | 使用 generic `plow.actionContext.allowedTiles` 对齐 BGA zigzag 目标限制；accepted divergence：raw zigzag candidates 不预过滤越界/占用，最终由 plow validation / `allowedTiles` 交集处理；empty intersection optional leaf auto-skip |
| `D2_DwellingPlan` | 已对齐 | 即时翻修子行动使用当前 `renovate-house` action id。 |
| `D3_Furrows` | 已对齐 |  |
| `D4_CrossCutWood` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D5_FieldClay` | 已对齐 |  |
| `D6_PetrifiedWood` | 已对齐 |  |
| `D7_Trident` | 已对齐 |  |
| `D8_FernSeeds` | 已对齐 |  |
| `D9_GameTrade` | 已对齐 |  |
| `D10_StorksNest` | 已对齐 |  |
| `D11_LawnFertilizer` | 已对齐 | size-one pasture replacement 走 `computePastureCapacityModifiers`；先替换为 `3 * (stables + 1)`，再叠加 A12/B72 等 additive。 |
| `D12_MilkingPlace` | 已对齐 | 通过 `blocksHouseAnimalZones` metadata 触发 `computeAnimalZones()` 通用过滤，不再直接读取 D148。 |
| `D13_Trowel` | 已对齐 | anytime 直接翻修到 stone 通过 `params.selectedOption='stone'` 进入真实 `renovate-house`；wood→stone / clay→stone 固定成本用 sourced mandatory bonus 表达，payment option 保留 Trowel 来源。 |
| `D14_HammerCrusher` | 已对齐 |  |
| `D15_ClaySupports` | 已对齐 |  |
| `D16_WoodenWheyBucket` | 已对齐 | BGA `formatCost(['max' => 1, WOOD => 1])` / `formatCost(['max' => 1])` 通过 `stables` `actionContext.exactCost` 表达羊市场 1 wood、牛市场免费，且最多 1 个 stable。 |
| `D17_DrillHarrow` | 已对齐 |  |
| `D18_SteamPlow` | 已对齐 |  |
| `D19_PulverizerPlow` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D20_TurnwrestPlow` | 已对齐 | 购买本卡的支付不记为 Turnwrest Plow 自身 PAID；Wood Expert 等 card-purchase Cost Attribution 归因到对应 source card。 |
| `D21_Recruitment` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D22_WorkPermit` | 已对齐 |  |
| `D23_PioneeringSpirit` | 已对齐 |  |
| `D24_BrotherlyLove` | 已对齐 |  |
| `D25_WitchesDanceFloor` | 已接受差异 | 已接受的行为 / 产品差异 |
| `D26_CarpentersYard` | 已对齐 |  |
| `D27_Retraining` | 已对齐 |  |
| `D28_WritingDesk` | 已对齐 |  |
| `D29_MuckRake` | 已对齐 |  |
| `D30_ArtisanDistrict` | 已对齐 |  |
| `D31_Storeroom` | 已对齐 |  |
| `D32_WoodRake` | 已对齐 |  |
| `D33_SummerHouse` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D34_LuxuriousHostel` | 已对齐 |  |
| `D35_FodderChamber` | 已对齐 |  |
| `D36_BreedRegistry` | 已对齐 | 使用 zone-aware hand listener 在 D36 存在于手牌/已打出时维护本卡 `boardSheep` / `cardSheep` / `sheepConvertedToFood`；买入时初始化 infobox；No Sheep 走当前 animal zones。 |
| `D37_Sculpture` | 已对齐 |  |
| `D38_MilkingStool` | 已对齐 |  |
| `D39_TruffleSlicer` | 已对齐 |  |
| `D40_Cesspit` | 已对齐 |  |
| `D41_HorseDrawnBoat` | 已对齐 |  |
| `D42_EducationBonus` | 已对齐 | after.occupation 奖励改读 trigger snapshot 职业数量；E97 连续额外打职业时按各自 host action 的触发帧发放资源。 |
| `D43_Hutch` | 已对齐 |  |
| `D44_ForestWell` | 已对齐 |  |
| `D45_SheepWell` | 已对齐 |  |
| `D46_PelletPress` | 已对齐 |  |
| `D47_Churchyard` | 已对齐 |  |
| `D48_CivicFacade` | 已对齐 |  |
| `D49_Bookshelf` | 已对齐 |  |
| `D50_ForeignAid` | 已对齐 |  |
| `D51_Archway` | 已对齐 |  |
| `D52_RollingPin` | 已对齐 |  |
| `D53_TeaHouse` | 已对齐 |  |
| `D54_TroutPool` | 已对齐 |  |
| `D55_NewMarket` | 已对齐 |  |
| `D56_FatstockStretcher` | 已对齐 |  |
| `D57_WholesaleMarket` | 已对齐 |  |
| `D58_Gritter` | 已对齐 |  |
| `D59_EarthOven` | 已对齐 |  |
| `D60_LargePottery` | 已对齐 |  |
| `D61_BaleofStraw` | 已对齐 |  |
| `D62_BeerTap` | 已对齐 |  |
| `D63_Lynchet` | 已对齐 |  |
| `D64_BakingCourse` | 已对齐 |  |
| `D65_GrainSieve` | 已对齐 |  |
| `D66_PotterCeramics` | 已对齐 |  |
| `D67_ReapHook` | 已对齐 |  |
| `D68_SmallBasket` | 已对齐 |  |
| `D69_SmallGreenhouse` | 已对齐 |  |
| `D70_StrawManure` | 已对齐 |  |
| `D71_Changeover` | 已对齐 |  |
| `D72_StableManure` | 已对齐 | 额外收获选择门槛走 `computeHarvestSelectionThreshold()`；选中田通过 Harvest Count modifier 增加 count，并在 top stack 收空后继续收同田下一层 stack，在 `harvestCountApplications` 记录来源。#186 “未围畜栏数”改用 `getUnfencedStableCountForCards`（含 B85，对齐 BGA `countUnfencedStablesForCards`） |
| `D73_SupplyBoat` | 已对齐 |  |
| `D74_RoyalWood` | 已接受差异 | BGA banned，但 OA 按产品策略保留；stables 支付因 afterHost slot 通过 after-pay provenance 统计 |
| `D75_WoodField` | 已对齐 |  |
| `D76_SocialBenefits` | 已对齐 |  |
| `D77_RecycledBrick` | 已对齐 |  |
| `D78_ReedPond` | 已对齐 |  |
| `D79_CarrotMuseum` | 已对齐 |  |
| `D80_BrickHammer` | 已对齐 | after-improvement 判断改用 `getPrintedImprovementResourceCost(..., 'clay')`；`cost` 与 `altCosts` 是 base cost 候选，取最大 clay，不再把 minor `cost.clay` 与 `altCosts[].clay` 相加。 |
| `D81_RoofLadder` | 已对齐 | 翻修少付 1 reed 走 sourced mandatory bonus；after.renovate-house 仍给 1 stone。 |
| `D82_HuntingTrophy` | 已对齐 | House Redevelopment 的 improvement 折扣走 mandatory sourced resource choice；Farm Redevelopment 的 fence 总计最多 3 wood 折扣走 sourced action trade，保留原始围栏成本并追加 BGA `addCost` 折扣候选；fence farm-choice settlement 会保留该 trade 并传入 `pay:fence`。 |
| `D83_Pigswill` | 已对齐 |  |
| `D84_FeedPellets` | 已对齐 |  |
| `D85_Reader` | 已对齐 |  |
| `D86_SheepAgent` | 已对齐 | 容量扣除通过 `animalHolder` metadata + occupation identity 过滤；D86 自身仍计入容量，minor animal-holder 不扣容量。 |
| `D87_MasterBuilder` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `D88_Millwright` | 已对齐 | 用两个 sequential optional `BonusModifier.choices` 表达最多 2 次 building-resource→grain replacement；在 A16/C56 这类 unit cost alternative 之后应用，保留 BGA 组合来源；无状态 replacement 不设置 `choiceAffectsState`，可被 payment dominance pruning 合并。 |
| `D89_Stablehand` | 已对齐 |  |
| `D90_PlowMaker` | 已对齐 |  |
| `D91_Plowman` | 已对齐 |  |
| `D92_ChildOmbudsman` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D93_SheepInspector` | 已对齐 |  |
| `D94_HenpeckedHusband` | 已对齐 |  |
| `D95_SiteManager` | 已对齐 | onBuy 期间 major improvement 支付改走 card-purchase candidate append；对当前候选中已有 wood/clay/stone/reed 的每个非空 subset 生成“每类最多 1 个 building resource -> 1 food”replacement candidate，保留原候选。 |
| `D96_Furnisher` | 已对齐 | `actionCardId === D96_Furnisher` 的 improvement 追加 wood-discount candidate；普通 improvement 不产生 candidate pipeline 输出；选择折扣候选后记录 Furnisher saved wood；折到 0 的 wood 不保留零值键。 |
| `D97_BeggingStudent` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D98_Transactor` | 已对齐 |  |
| `D99_EarthenwarePotter` | 已对齐 |  |
| `D100_LordoftheManor` | 已对齐 |  |
| `D101_SugarBaker` | 已对齐 | Grain Utilization 后 optional pay 1 food 得 1 bonus VP，并通过 `add-resource-to-space` 把该 food 放回 Grain Utilization |
| `D102_SampleStableMaker` | 已对齐 |  |
| `D103_CanalBoatman` | 已对齐 |  |
| `D104_Cultivator` | 已对齐 |  |
| `D105_Sculptor` | 已对齐 |  |
| `D106_WhiskyDistiller` | 已对齐 |  |
| `D107_Bellfounder` | 已对齐 |  |
| `D108_StoneCarver` | 已对齐 |  |
| `D109_SowingMaster` | 已对齐 |  |
| `D110_FishFarmer` | 已对齐 |  |
| `D111_InteriorDecorator` | 已对齐 |  |
| `D112_YoungFarmer` | 已对齐 |  |
| `D113_FoodMerchant` | 已对齐 |  |
| `D114_SeedTrader` | 已对齐 |  |
| `D115_FodderPlanter` | 已对齐 |  |
| `D116_TreeInspector` | 已对齐 |  |
| `D117_WoodExpert` | 已对齐 | 从当前 Cost Candidate List 中每个含 wood 的候选追加 `{wood - 2 clamp 0, food + 1}` sourced candidate；无 wood 候选不派生，继续支持 minor `altCosts`；折到 0 的 wood 不保留零值键；选择派生候选后按实际 clamp 差值记录 saved wood，并记录 paid food。 |
| `D118_Bonehead` | 已对齐 |  |
| `D119_WoodBarterer` | 已对齐 |  |
| `D120_ClayDeliveryman` | 已对齐 |  |
| `D121_ClayPlasterer` | 已对齐 | 黏土房固定 3 clay + 2 reed 建房成本走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 候选；翻修到 clay 走 sourced mandatory bonus，把 clay 成本固定到 1。 |
| `D122_ClayCarrier` | 已对齐 |  |
| `D123_RenovationPreparer` | 已对齐 |  |
| `D124_Emissary` | 已对齐 |  |
| `D125_ForestTrader` | 已对齐 |  |
| `D126_FieldCultivator` | 已对齐 |  |
| `D127_HardworkingMan` | 已对齐 |  |
| `D128_BuildingTycoon` | 已对齐 |  |
| `D129_LumberVirtuoso` | 已对齐 |  |
| `D130_RecreationalCarpenter` | 已对齐 |  |
| `D131_CraftsmanshipPromoter` | 已对齐 |  |
| `D132_HideFarmer` | 已对齐 | 终局前 `onBeforeEndGame` optional flow 选择 0..max 空地，真实支付 food 并写入 `hiddenSpaces`；空地罚分按 `farmyard-usage` used tile key 扣除有限 hiddenSpaces |
| `D133_BeerTentOperator` | 已对齐 |  |
| `D134_OysterEater` | 已对齐 | Fishing 后写入 card-local skip flag；`onBeforePlayerTurn` non-flow skip-control 在 owner 下一次 labor turn 入口同步消费 |
| `D135_GardeningHeadOfficial` | 已对齐 |  |
| `D136_AnimalActivist` | 已对齐 |  |
| `D137_TradeTeacher` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D138_PetLover` | 已对齐 |  |
| `D139_Chairman` | 已对齐 |  |
| `D140_Loudmouth` | 已对齐 |  |
| `D141_SeedSeller` | 已对齐 |  |
| `D142_PotatoPlanter` | 已对齐 |  |
| `D143_TreeCutter` | 已对齐 |  |
| `D144_WaterWorker` | 已对齐 |  |
| `D145_RoofExaminer` | 已对齐 |  |
| `D146_Porter` | 已对齐 |  |
| `D147_TrapBuilder` | 已对齐 |  |
| `D148_DomesticianExpert` | 已对齐 | 创建 `houseAnimalZone` tagged card zone；不再直接读取 D12。 |
| `D149_CasualWorker` | 已对齐 |  |
| `D150_GodlySpouse` | 已对齐 |  |
| `D151_SpinDoctor` | 已对齐 |  |
| `D152_Patron` | 已对齐 |  |
| `D153_WealthyMan` | 已对齐 |  |
| `D154_ChimneySweep` | 已对齐 | 翻修目标为 stone 时提供 sourced mandatory 2 stone bonus；wood→clay 普通翻修不产生 source-marked no-op candidate。 |
| `D155_Ebonist` | 已对齐 | runtime/display exchange 都为 harvest window，`sourceId=D155_Ebonist`，不再暴露为 anytime exchange |
| `D156_RetailDealer` | 已对齐 |  |
| `D157_PartyOrganizer` | 已对齐 |  |
| `D158_BeanCounter` | 已对齐 |  |
| `D159_ReedSeller` | 排除 | BGA implemented=false；OA 保留 data-only 定义 |
| `D160_Midwife` | 已对齐 |  |
| `D161_CabbageBuyer` | 已对齐 | renovation tracker 覆盖 renovate-house 与后续 major/minor improvement；无 worker placement 的卡牌 renovation 直接给 3f offer |
| `D162_ClayFirer` | 已对齐 |  |
| `D163_JourneymanBricklayer` | 已对齐 |  |
| `D164_PetGrower` | 已对齐 | 使用 `countHouseAnimals()` 统计普通 house zone 与 tagged house zone，覆盖 D148 house-edge zone。 |
| `D165_PigStalker` | 已对齐 |  |
| `D166_StableMilker` | 已对齐 |  |
| `D167_PureBreeder` | 已对齐 |  |
| `D168_Stockman` | 已对齐 | #186 第 2/3/4 座畜栏序数定位（`nAfter`）改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`）；本次建造数仍走 `getStableTilesBuiltThisAction`（归 #185） |
| `D169_Plowsmith` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D170_FoldBuilder` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D171_SeniorTeacher` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D172_PutcherMaker` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D173_TownClerk` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D174_LoessGardener` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D175_Countryman` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D176_Woodshacker` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D177_Graduate` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D178_SubstituteTeacher` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D179_Bullcatcher` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D180_PartTimeWorker` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `E1_PoleBarns` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 `stables` `actionContext.exactCost` 表达最多 3 个免费 stable。 |
| `E2_RenovationMaterials` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修到 clay。 |
| `E3_TeaTime` | 已对齐 |  |
| `E4_Thunderbolt` | 已对齐 |  |
| `E5_NightLoot` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `E6_Recount` | 已对齐 |  |
| `E7_Pumpernickel` | 已对齐 |  |
| `E8_FarmersMarket` | 已对齐 |  |
| `E9_BarteringHut` | 已对齐 |  |
| `E10_StrawHat` | 已对齐 | 第 3/6 轮 return-home 返回 mandatory XOR；food 分支始终存在，有 Farmland worker 且有合法目标时追加 move 分支，move 真实移走 Farmland worker 并执行目标行动 flow |
| `E11_PettingZoo` | 已对齐 |  |
| `E12_AnimalBedding` | 已对齐 |  |
| `E13_StoneHouseReconstruction` | 已对齐 | anytime 翻修子行动使用当前 `renovate-house` action id。 |
| `E14_WoodSaw` | 已对齐 |  |
| `E15_NailBasket` | 已对齐 |  |
| `E16_BriarHedge` | 已对齐 | prerequisite 改用 `getAssignedAnimalsByType()`，house/pasture/stable/animal-holder 口径统一；fence discount 保留本卡 listener。 |
| `E17_SkimmerPlow` | 已对齐 |  |
| `E18_SeedAlmanac` | 已对齐 |  |
| `E19_OxGoad` | 已对齐 |  |
| `E20_IronHoe` | 已对齐 |  |
| `E21_SheepRug` | 已对齐 |  |
| `E22_GuestRoom` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E23_Apiary` | 已对齐 |  |
| `E24_Ambition` | 已对齐 |  |
| `E25_BumperCrop` | 已对齐 | onBuy 走 `private-field-phase`；`2 Grain Fields` 前置同时计入普通 grain field 与带 grain 的 Card Field |
| `E26_Sundial` | 已对齐 |  |
| `E27_PiggyBank` | 已对齐 | flagged free-major 支付改走 card-purchase candidate append，追加 free major candidate 并保留原价 candidate；free candidate 在 pipeline 中先于普通折扣执行。 |
| `E28_Bookmark` | 已对齐 |  |
| `E29_Heirloom` | 已对齐 |  |
| `E30_ChildsToy` | 已对齐 |  |
| `E31_Upholstery` | 已对齐 |  |
| `E32_Nave` | 已对齐 |  |
| `E33_BeaverColony` | 已对齐 |  |
| `E34_LandRegister` | 已对齐 |  |
| `E35_Misanthropy` | 已对齐 |  |
| `E36_HerbalGarden` | 已对齐 |  |
| `E37_OxSkull` | 已对齐 |  |
| `E38_RodCollection` | 已对齐 |  |
| `E39_Paintbrush` | 已对齐 |  |
| `E40_BeeStatue` | 已对齐 |  |
| `E41_MuddyWaters` | 已对齐 |  |
| `E42_WaterGully` | 已对齐 |  |
| `E43_BarnCats` | 已对齐 | #186 prerequisite（1 stable）与 onBuy 的“你拥有畜栏数”改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`） |
| `E44_FodderBeets` | 已对齐 |  |
| `E45_FruitLadder` | 已对齐 |  |
| `E46_WaterlilyPond` | 已对齐 |  |
| `E47_SyrupTap` | 已对齐 | 已响应来自 action-space 的 gain provenance，并防止自触发递归 |
| `E48_TownHall` | 已对齐 |  |
| `E49_Twibil` | 已对齐 |  |
| `E50_WildGreens` | 已对齐 |  |
| `E51_WhaleOil` | 已对齐 |  |
| `E52_Cubbyhole` | 已对齐 |  |
| `E53_BoarSpear` | 已对齐 | listener 只允许本次新获得的 boar 次数参与兑换；Animal Payment Preference 按来源 prefer / avoid C148 held，C148 来源扣 C148，本体 action-space / B137 来源优先扣新获得的非 C148 boar，decline 不改变来源 |
| `E54_Contraband` | 已对齐 |  |
| `E55_StoneWeir` | 已对齐 |  |
| `E56_RomanPot` | 已对齐 |  |
| `E57_CheeseFondue` | 已对齐 |  |
| `E58_LunchtimeBeer` | 已对齐 |  |
| `E59_CombandCutter` | 已对齐 |  |
| `E60_WorkingGloves` | 已对齐 | Card Source 代表迁移；4 条 occupation trade modifiers 已移入 `impl.modifiers`，session payment 覆盖 |
| `E61_RaisedBed` | 已对齐 |  |
| `E62_SourDough` | 已对齐 |  |
| `E63_IronOven` | 已对齐 |  |
| `E64_SimpleOven` | 已对齐 |  |
| `E65_Almsbag` | 已对齐 |  |
| `E66_BarnShed` | 已对齐 | Card Source listener 代表迁移；session 覆盖 opponent forest trigger |
| `E67_GrainBag` | 已对齐 |  |
| `E68_CherryOrchard` | 已对齐 | 描述恢复 BGA sow/harvest-as-grain 语义，session 覆盖 wood field harvest |
| `E69_MelonPatch` | 已对齐 |  |
| `E70_CropRotationField` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E71_CowPatty` | 已对齐 | 单个 eligible 也走 optional selection，多田使用精确 selectableTiles |
| `E72_ArtichokeField` | 已对齐 | Card Field 在私人田地阶段只收作物；harvest-only 1 food 奖励仅在 Harvest field phase 触发 |
| `E73_Scythe` | 已对齐 | 选择时记录 `fullReapPosition`，普通 reap 通过 Harvest Count override 收完整块田，并用 `full-field-reap` tag / `field` scope 写入 `harvestCountApplications`；位置保留到 EndHarvest 清理 |
| `E74_AshTrees` | 已对齐 |  |
| `E75_StoneAxe` | 已对齐 |  |
| `E76_LumberPile` | 已对齐 |  |
| `E77_Mattock` | 已对齐 |  |
| `E78_SleightofHand` | 已对齐 | 已迁到原子 batch exchange，覆盖 UI/private/replay |
| `E79_FieldSpade` | 已对齐 |  |
| `E80_RockGarden` | 已对齐 |  |
| `E81_AlchemistsLab` | 已对齐 |  |
| `E82_Profiteering` | 已对齐 |  |
| `E83_ShepherdsWhistle` | 已对齐 |  |
| `E84_DollysMother` | 已对齐 | 通过 `computeBreedThreshold` 仅让 harvest-source sheep breeding threshold=1；breed phase 直接产生 newborn sheep 并写入 summary，不再使用 virtual sheep 状态 |
| `E85_MasterTanner` | 已对齐 |  |
| `E86_PenBuilder` | 已对齐 |  |
| `E87_MasterRenovator` | 已对齐 |  |
| `E88_MasterFencer` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 nested `fencePolicy` 表达付 2/3 wood 后最多 3/4 段总免费 fence。 |
| `E89_Stallwright` | 已对齐 | BGA `formatCost(['max' => 1])` 通过 `stables` `actionContext.exactCost` 表达；第 2/3/5/7 张职业判断改读 trigger snapshot，不依赖 E97 内嵌特判或执行时 live 数量。 |
| `E90_DungCollector` | 已对齐 |  |
| `E91_PlowBuilder` | 已对齐 |  |
| `E92_FieldDoctor` | 已对齐 |  |
| `E93_Motivator` | 已对齐 |  |
| `E94_Prophet` | 已对齐 | 即时翻修 / fencing 子行动使用当前 `renovate-house` / `fence` action id。 |
| `E95_Miller` | 已对齐 |  |
| `E96_Elder` | 已对齐 |  |
| `E97_Beneficiary` | 已对齐 | 额外 occupation 保留 `params.exactCost: { food: 1 }`；已删除 E89 stable 内嵌分支，E89/D42/B49 等 trailing listener 由 trigger snapshot 自行结算。 |
| `E98_Prodigy` | 已对齐 |  |
| `E99_UncaringParents` | 已对齐 |  |
| `E100_MuseumCaretaker` | 已对齐 |  |
| `E101_Blighter` | 已对齐 |  |
| `E102_Acquirer` | 已对齐 |  |
| `E103_Wolf` | 已对齐 |  |
| `E104_SpiceTrader` | 已对齐 |  |
| `E105_Pioneer` | 已对齐 |  |
| `E106_EmergencySeller` | 已对齐 |  |
| `E107_LandSurveyor` | 已对齐 |  |
| `E108_BlackberryFarmer` | 已对齐 |  |
| `E109_BraidMaker` | 已对齐 | Basketmaker's Workshop 的 1 reed + 1 stone 固定价改走 card-purchase candidate append，保留原价 candidate，并在 payment option 展示来源；fixed-price listener 在 candidate pipeline 中先于普通折扣执行。 |
| `E110_Dentist` | 已对齐 |  |
| `E111_Recluse` | 已对齐 |  |
| `E112_GrainThief` | 已对齐 | start 选择 grain fields；reap 通过 Harvest Count modifier 写入 `supply-instead-of-field` tag，end field phase 只读 `harvestCountApplications`，带 `full-field-reap` tag 的同田不补 grain；D72 额外 count 可在 E112 供应堆替代 top grain 后继续收下一层 crop；同时注册 selection threshold modifier，把 A112/D72 的 grain field 门槛降为 1；end harvest 清理 selectedPositions |
| `E113_Godmother` | 已对齐 |  |
| `E114_ShedBuilder` | 已对齐 | #186 第 1-4 座畜栏序数定位（`nAfter`）改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`）；本次建造数仍走 `getStableTilesBuiltThisAction`（归 #185） |
| `E115_SeedServant` | 已对齐 |  |
| `E116_FirCutter` | 已对齐 |  |
| `E117_PipeSmoker` | 已对齐 |  |
| `E118_KindlingGatherer` | 已对齐 |  |
| `E119_LandHeir` | 已对齐 |  |
| `E120_ScrapCollector` | 已对齐 |  |
| `E121_HillCultivator` | 已对齐 |  |
| `E122_Cottar` | 已对齐 |  |
| `E123_ResourceHoarder` | 已对齐 | after-pay 仅监听 `pay` leaf，并读取 `resource.paid` 的 bonusSources / bonusChoiceIndex 决定弹出 top k；本牌的 `Bonus.choices` 设置 `choiceAffectsState:true`，因此使用不同 top-k 的支付路径不会被 dominance pruning 互剪。动态支付会把实际 reduction 写入 `PaymentSolution.bonusReductions`，hover stats 可显示本牌 saved 资源；payment solver 不再把无实际 cost 变化的 `k=0` skip 记录为本牌生效路径，避免和 C14 等 reed discount 叠出重复选项；C14 与 E123 top reed 都可作为玩家可选支付路径 |
| `E124_MayorCandidate` | 已对齐 |  |
| `E125_DelayedWayfarer` | 已对齐 | delayed from-supply 的 `isDoable` / `onAllWorkersPlaced` 使用 `hasInactiveWorkerInSupply`，不会在仅剩 removed worker 时暴露放人 flow |
| `E126_TaxCollector` | 已对齐 |  |
| `E127_DiligentFarmer` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `E128_Saddler` | 已对齐 |  |
| `E129_Imitator` | 已对齐 |  |
| `E130_Overachiever` | 已对齐 | Wish for Children 触发的额外 improvement 使用一个 mandatory resource-choice bonus（10 个资源选择），每次只减 1 个所选资源；不再作为 10 个可叠加 optional bonus。 |
| `E131_MarketMaster` | 已对齐 |  |
| `E132_VeggieLover` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `E133_ChampionBreeder` | 已对齐 |  |
| `E134_Omnifarmer` | 已对齐 | 在 `onAfterHarvest` 通过 `getHarvestOutcome()` 基于本次实际 harvested crops / newborn animals 提供一次存 goods 选择；提交时重新校验 outcome、stored goods 和当前资源，不再读取 E84 或 live 阈值 |
| `E135_Pickler` | 已对齐 |  |
| `E136_AnimalHusbandryWorker` | 已对齐 | BGA ordinary `FENCING` 子行动映射到内部 `fence` leaf。 |
| `E137_FlaxFarmer` | 已对齐 |  |
| `E138_LivestockExpert` | 已对齐 |  |
| `E139_BunnyBreeder` | 已对齐 |  |
| `E140_Carter` | 已对齐 | collect building resources from action-space 判定改用 `sumActionSpaceMovedToTriggerPlayer()`；triggerRound gating unchanged。 |
| `E141_VegetableVendor` | 已对齐 |  |
| `E142_Smuggler` | 已对齐 | #241 改为卡内 `TRADE_OPTIONS` 表生成 2x 同类选项，并保留 mixed optional OR 子树。 |
| `E143_Hewer` | 已对齐 |  |
| `E144_WaresSalesman` | 已对齐 | 按 `waresSalesmanGains` metadata 读取 single/multiple gain options，不再维护硬编码 improvement id 分组。 |
| `E145_Parvenu` | 已对齐 |  |
| `E146_Reseller` | 已对齐 |  |
| `E147_AnimalDriver` | 已对齐 |  |
| `E148_Lazybones` | 已对齐 | 行动格预留 marker 走 `action-space-tokens` helper；reserved stable action spaces 计入 stable supply helper；无空地时仍可清理 marker，不把 no-op 清理计为卡牌 use |
| `E149_MidnightFencer` | 已对齐 | 第 14 轮 harvest start 提供 optional real borrowed `fence` leaf；donor cap 按其他玩家 own ordinary reserve 各最多 2，跳过或建造均不再产生 owed-fence bonus VP；借围栏选择可 undo 回 E149 optional，但不能继续 undo 穿过 round-end 边界 |
| `E150_RockBeater` | 已对齐 | 石房建房 -2 stone 走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 折扣候选。 |
| `E151_DeliveryNurse` | 已对齐 |  |
| `E152_BargainHunter` | 已对齐 |  |
| `E153_StoneSculptor` | 已对齐 |  |
| `E154_Margrave` | 已对齐 |  |
| `E155_Visionary` | 已对齐 |  |
| `E156_ClaypitOwner` | 已对齐 | printed clay 判定改用 `getPrintedImprovementResourceCost(..., 'clay')`，可识别 minor `altCosts` 中含 clay 的 base cost 候选，并继续支持 major simple / complex fee cost。 |
| `E157_Usufructuary` | 已对齐 |  |
| `E158_StoneCustodian` | 已对齐 |  |
| `E159_OldMiser` | 已对齐 |  |
| `E160_KelpGatherer` | 已对齐 |  |
| `E161_ElderBaker` | 已对齐 |  |
| `E162_Entrepreneur` | 已对齐 |  |
| `E163_Patroness` | 已对齐 |  |
| `E164_MountainPlowman` | 已对齐 |  |
| `E165_MasterHuntsman` | 已对齐 |  |
| `E166_Roastmaster` | 已对齐 |  |
| `E167_DairyCrier` | 已对齐 |  |
| `E168_AnimalTamersApprentice` | 已对齐 |  |
