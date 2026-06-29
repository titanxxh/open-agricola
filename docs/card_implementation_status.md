# 卡牌实现现状报告

> 生成/更新日期：2026-06-29。本文件替代 `docs/card_desc_audit.md`、`docs/card_progress.md`、`docs/master-plan.md`、`docs/bad-smell.md`。BGA 唯一基准：`/data00/home/xuxinhao.titan/raw/bga-agricola`。

## 1. 当前快照

| 项目 | 状态 |
|---|---:|
| BGA A-E canonical 卡牌 | 888 |
| OA A-E canonical 卡牌定义 | 888 |
| 自动 metadata 脚本 literal mismatch | 0 |
| 自动 metadata 脚本 complex mismatch | 4 |
| 其中 schema-up 已接受差异 | 4 |
| 需要实现复核的卡牌 | 0 |
| 已接受 / 产品策略差异 | 70 |
| 排除的 BGA legacy 或未实现行为目标 | 3 |
| 本轮审计视为已对齐 | 815 |
| Parent Cards 扩展结构化定义 | 24 / 24 |
| Parent Cards gameplay 接入 | setup / simultaneous selection / mother rewards via futureMeeples / parentCards fractional scoring / ordinary-card draw deck + keep UI / father simple + complex side quest 已接入 |
| 6 人 Major Improvement supply / behavior | 标准 10 张 + duplicate concrete id 8 张；6 人局通过 stack-aware supply 只暴露当前 top，2-5 人仍使用标准 flat supply；duplicate Well / oven / cookery / workshop 行为按具体 id 独立结算 |
| Through the Seasons 变体 gameplay | 随机起始季节 / 四个公开季节行动格 / 下一轮开始切换季节 / 四季 setup 调整与 Winter、Spring、Summer、Autumn 行动和折扣规则已接入 |
| Farmers of the Moor complexity III gameplay | variant setup / farm terrain / special action cards / heating, fuel, sick workers, Infirmary / gated horse animal resource, Horse Market, horse breeding/reorg/scoring, generic animal-card compatibility, major supply stack registry, FoM hand setup / staged draft / incomplete FoM minor pool room option, web UI / WS protocol integration, compatibility regression coverage, deferred FoM minor terminology contract, and FoM major improvement runtime effects for Peat-charcoal Kiln / Forester's Lodge / Riding Stables / Museum of the Moors / Heating Oven / Tiled Oven / Furniture Stall / Ceramics Stall / Basket Stall / Village Church 已接入；FoM 小改良已实现 104 张（M015/M016/M017/M018/M019/M020/M021/M022/M023/M024/M025/M026/M028/M029/M030/M031/M032/M036/M037/M038/M039/M040/M041/M042/M043/M044/M045/M046/M047/M048/M049/M050/M051/M054/M055/M058/M059/M060/M061/M062/M063/M064/M065/M066/M067/M068/M069/M070/M071/M072/M073/M074/M075/M076/M077/M078/M079/M080/M081/M082/M083/M085/M086/M087/M088/M089/M090/M091/M092/M094/M095/M096/M097/M098/M099/M100/M103/M104/M105/M106/M107/M108/M109/M110/M111/M112/M113/M114/M115/M116/M117/M118/M119/M120/M121/M122/M123/M124/M125/M126/M127/M128/M129/M130），剩余 13 张仍为 metadata-only / `implemented:false` |

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
| 用 schema-up metadata 替代 BGA custom `isBuyable` | `A003_PaperKnife`, `B056_Brook`, `B074_ThickForest`, `B154_SheepKeeper` |
| field/cardField 作物约束差异 | `E070_CropRotationField` |
| BGA 未实现，但 OA 有产品扩展/重写 | `A113_HeresyTeacher`, `A169_OffSiter`, `A170_Hayward`, `A171_Sidekick`, `A173_ClayThief`, `A174_MasterHora`, `A177_Middleman`, `A180_AnimalBrander`, `B170_CorralBuilder`, `B171_GreenhouseBuilder`, `B173_Sweeper`, `B175_FieldOverseer`, `B176_VillageIdiot`, `B178_TagAlong`, `B179_WildBoarHunter`, `C169_FastMason`, `C170_AmateurFencer`, `C171_YoungArtist`, `C172_FieldCounter`, `C173_TopOuter`, `C175_VillageTeacher`, `C180_Trapper`, `D025_WitchesDanceFloor`, `D170_FoldBuilder`, `D171_SeniorTeacher`, `D173_TownClerk`, `D175_Countryman`, `D176_Woodshacker`, `D178_SubstituteTeacher`, `D179_Bullcatcher`, `D180_PartTimeWorker` |
| BGA banned，但 OA 保留 | `A131_CraftTeacher`, `A133_Braggart`, `A014_CarpentersHammer`, `A033_BigCountry`, `A039_Chapel`, `A048_ShavingHorse`, `A082_WorkCertificate`, `A097_Freshman`, `B010_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B015_CarpentersBench`, `B161_Weakling`, `B021_HayloftBarn`, `B022_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C028_TeachersDesk`, `C031_WritingChamber`, `C003_CarriageTrip`, `C060_SmallPottersOven`, `C063_CraftBrewery`, `C099_GardenDesigner`, `D137_TradeTeacher`, `D019_PulverizerPlow`, `D021_Recruitment`, `D033_SummerHouse`, `D004_CrossCutWood`, `D074_RoyalWood`, `D092_ChildOmbudsman`, `D097_BeggingStudent`, `E022_GuestRoom` |
| BGA stable / FarmHand 模型差异 | `B085_FarmHand` |
| Candidate Closure：optional 分支候选集是 BGA 单一 topo 序产物的合法超集；solver 层支配剪枝（ADR 0004 Amendment）后玩家可选集合与 BGA optimal 集一致，单选项 auto-resolve；卡牌提供的虚拟支付资源以自身 key 进入 `resourcesPaid`，与玩家库存资源不互相支配 | 全部 card-purchase / unit-trade cost 修改卡；B155 这类行动格支付资源 |
| Candidate Closure：等价候选行（同 resources + originalFeeIndex、仅 sources 不同）只保留一条代表行（sources 最少 → key 字典序，ADR 0004 Amendment）；玩家不再看到仅归因不同的重复支付选项，未选中链的卡不进该选项 hover 归因 | 全部 card-purchase cost 修改卡（C95/E109 fixed-price 双子、A75/D117 bypass 链等） |

## 4. 简洁度审阅

行数只是信号，不是结论。复核口径：按当前 Card Source 文件和 canonical BGA PHP 文件统计非空非注释行；方法 / 函数声明行保留。仅剔除 OA 的 `import` / `export` 行，以及 BGA 的 `<?php` / `namespace` / `use` 行。

简洁度比较要先排除 BGA 坏味道：如果 BGA 通过 `Actions/*`、`Core/*`、`Models/*` 等主路径，或其他卡牌文件里的显式 cardId 分支来补某张卡的行为，这张卡不进入简洁度比较。BGA `implemented=false` 的卡没有可比实现，直接跳过且不在本节列出。

剔除 BGA 坏味道和未实现项后，当前 OA/BGA > 1.5 且可公平比较的卡牌剩 7 张：

| 卡牌 | BGA | OA | 比例 | 原因 / 后续判断 |
|---|---:|---:|---:|---|
| `B093_Confidant` | 59 | 132 | 2.24 | BGA 用 `FOODPLUS` future meeple + `getPostReceiveBonus()` 隐式串起返还 food 后的 sow/fence；OA 还要显式处理职业支付时的 `reserveResources`、lessons doability、future meeple resolved provenance、防重复 `lastResolvedRound`、以及 1 wood fence policy。可等 future meeple 支持 post-receive bonus 后再简化。 |
| `C150_ParrotBreeder` | 67 | 147 | 2.19 | BGA 直接读座位 / actionCardId，并用 flag + extraData + dummy playerConstraint 注入已占行动格；OA 需要显式追踪右邻、anytime 付 grain 后 flag、自己 / 对手放人后清理、再向 `place-farmer` 注入 occupied option。完整单卡状态机，暂不抽通用 helper。 |
| `C094_StableCleaner` | 42 | 78 | 1.86 | BGA 直接返回 fixed-cost `STABLES` flow；OA 在暴露 anytime 前要 probe `stables` 的 cost modifier / affordability，并显式包 flag、`trueAction:false`、固定 cost context 和执行后清理。若 anytime action 可统一内建 affordability probe，可再降。 |
| `B157_Salter` | 104 | 177 | 1.70 | BGA 的 `payNode` / `argsSalt` / `actSalt` 承担动物选择与支付；OA 需要自定义 `resource-quantity-select` ad-hoc action、校验动物必须来自农场且 reserve 为空、从 board 扣动物、单动物快捷路径、future food schedule 和日志。BGA 本身也长，优先级低。 |
| `A130_MummysBoy` | 53 | 90 | 1.70 | BGA 依赖 `Globals::getPlacedFarmers()` / `Farmers` manager 直接找到第 2 个农夫位置并注入 dummy action；OA 需要用 placement order、occupied-space option、meeting-place 过滤、once-per-round flag 和 start-turn 清理显式实现。和 C150 同类，除非抽 occupied action helper，否则保持卡内闭环。 |
| `B156_StorehouseKeeper` | 29 | 44 | 1.52 | BGA 用 `isActionCardEvent('ResourceMarket')` + `gainNode` XOR；OA 需要显式列出 resource-market 变体并包 listener / typed flow。低边界项，只有出现更多 action-space alias 卡时才值得抽 helper。 |
| `B107_Manservant` | 33 | 50 | 1.52 | BGA 的 `onBuy` 复用 `onPlayerAfterRenovation()` 并直接返回 `futureMeeplesNode`；OA 需要复用 `placeFood`、after-renovation listener、stone-house guard、`queueFutureMeeples` + node bridge。低边界项，优先级低。 |

因 BGA 坏味道而排除的卡牌：

| 卡牌 | 排除原因 |
|---|---|
| `D036_BreedRegistry` | BGA 在 `Core/Stats.php` 为本卡更新 infobox。 |
| `E161_ElderBaker` | BGA 在 `ActionCards.js` 和 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `C088_CarpentersApprentice` | BGA 在 `Actions/Fencing.php` 和 `Actions/Stables.php` 对本卡做主路径特判。 |
| `A041_VegetableSlicer` | BGA 在 `Actions/Pay.php` 对本卡做支付路径特判。 |
| `A087_Conservator` | BGA 在 `Actions/Renovation.php` 对本卡做翻修路径特判。 |
| `D131_CraftsmanshipPromoter` | BGA 在 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `D001_ZigzagHarrow` | BGA 在 `Models/PlayerBoard.php` 提供本卡专用几何 helper。 |
| `E016_BriarHedge` | BGA 在 `Actions/Fencing.php` 对本卡做围栏路径特判。 |
| `B138_ForestGuardian` | BGA `B100_Clutterer.php` 的其他卡牌路径显式枚举本卡。 |
| `C016_FieldFences` | BGA 在 `Actions/Fencing.php` 对本卡做围栏路径特判。 |
| `C027_Blueprint` | BGA 在 `Actions/Improvement.php` 对本卡做主路径特判。 |
| `B146_Illusionist` | BGA `B100_Clutterer.php` 的其他卡牌路径显式枚举本卡。 |
| `B042_ForestInn` | BGA `E144_WaresSalesman.php` 的其他卡牌路径显式枚举本卡。 |
| `C162_ForestOwner` | BGA `E047_SyrupTap.php` 的其他卡牌路径显式判断本卡。 |
| `A106_SlurrySpreader` | BGA 在 `Actions/Reap.php` 对本卡做收获路径特判。 |
| `D132_HideFarmer` | BGA 在 `Managers/Scores.php` 对本卡做计分路径特判。 |
| `E096_Elder` | BGA 在 `States/TurnTrait.php` 对本卡做回合路径特判。 |
| `E155_Visionary` | BGA 在 `Actions/WishChildren.php` 和 `E130_Overachiever.php` 对本卡做特判。 |
| `E153_StoneSculptor` | BGA `E144_WaresSalesman.php` 的其他卡牌路径显式枚举本卡。 |

近期 PR / 本轮简化后已经降下来的旧高比例项：

| 卡牌 | 变化 |
|---|---|
| `A111_WallBuilder` | 本轮改为 after construct 直接返回 inline `futureMeeplesNode`，去掉 built-room delta、action snapshot token 和卡内 extraData 防重；按当前复核口径已低于 1.5。 |
| `B018_GrasslandHarrow` | 本轮让 future meeple 支持 `field`/`stable` 到期触发 action；B18 只保留 after-pay 计算目标轮并排 `field` future meeple，移除卡内 `targetRound` / `onRoundStart` 状态机。 |
| `E118_KindlingGatherer` | 本轮合并 `place-farmer` / `collect` / `gain` 三个同 handler listener，保留 action-space provenance 过滤。 |
| `E148_Lazybones` | 本轮抽出 `action-space-tokens` helper，统一 bounded token choice、choice resolve、owner-targeted token consume flow；E148 卡内只保留触发空间、空地判断和 helper 调用，按当前复核口径降至 BGA 65 / OA 66 = 1.02。 |
| `C041_FarmStore` | #244 后用卡内 `REWARD_OPTIONS` 表生成 optional pay/gain XOR。 |
| `D080_BrickHammer` | #244 后走 `getPrintedImprovementResourceCost()`，不再手写 cost / altCosts 分支。 |
| `E142_Smuggler` | #244 后 `TRADE_OPTIONS` 表生成同类 2x 选项，并保留 mixed optional OR。 |
| `E156_ClaypitOwner` | #244 后 printed/base cost helper 覆盖 minor altCosts 与 major fee candidates。 |
| `D117_WoodExpert` | #259/#272 后从当前 Cost Candidate List 派生候选，已低于 1.5 阈值。 |

后续简化原则：只有当同一种 helper 能服务至少两张当前或近期目标卡，才抽新抽象；否则维持卡内闭环。

## 5. 架构审阅

本轮审阅没有发现新的“仅前端裁定规则”路径，也没有开放的通用基础设施 blocker。下表只保留会继续约束新增卡牌 / 后续改动的架构事项；已完成的一次性基础设施记录不再作为待办保留。

| 事项 | 当前代码证据 | 后续约束 |
|---|---|---|
| Metadata 审计覆盖需要随字段演进同步 | `scripts/audit-bga-metadata-diff.ts` 已覆盖 `STABLE` cost 和 `passing`；当前 literal mismatch 为 0 | 新增 BGA metadata 字段时同步加 parser / diff fixture，避免统计口径回退。 |
| 后端权威的 action / pending 合同 | `allowedCommands`、typed request、`commitSelection`、`engine-resolve` protected cancel、`resolveEngineChoice`、bare improvement choice ids | 新增交互必须显式暴露 command / options 并由后端校验；major/minor improvement choice value 使用裸 `cardId`，旧 `major:` / `minor:` 只作为 parser 兼容输入，支付 option 保留 `pay:*` 命名空间；不要恢复 encoded choice shortcut、old pending cursor 或前端裁定规则。 |
| 事件与支付 provenance | `resource.paid`、`paymentSources`、`sumActualPaidResource()`、`bonusChoiceIndex`、`event-mapping-policy.ts`、`publicEventArchive`、`shared/actions/helpers/trades.ts`、`shared/actions/helpers/trade-applied-listener.ts`、`shared/cards/__tests__/provenance-result-audit.test.ts` | 支付 / 资源 / farm metadata 先 emit 结构化事件，再让 listener 消费；生产卡牌不要从 `context.result` 读取资源事实。动物 exchange 必须通过 exchange/trade 路径扣减，默认同步 pasture / house / stable / animal-holder 中已安置动物，避免只改 `player.resources` 留下 phantom animal。需要 per-trade 前置资源门槛的卡牌优先监听 `immediatelyAfter.trade-applied`，读取 `extraData.preResources`。 |
| Cost Attribution / hover stats | `CardResourceStats`、`trackSourceCardPaymentStats`、`recordCardCostAttribution()`、ADR 0003 | 成本变化卡牌的 saved / paid 展示必须走 Cost Attribution；card-purchase selected candidate 写入每个 source card 自己的 saved / paid delta；不要因为 pay leaf 携带 `sourceCard` 就把整笔 action / card-purchase 支付记成该卡 PAID。 |
| Printed improvement base cost helper | `getPrintedImprovementResourceCost()`、D80/E156 | 读取 minor / major definitions 的 printed/base cost candidates；`cost`、minor `altCosts`、major complex `fee` / `fees` 是候选组，按目标资源取最大值，不按实际支付或候选求和。 |
| Card-purchase ComputeCardCosts candidate pipeline | `resolveCardCostWithModifiersDetailed()`、`deriveCardCostCandidate` + `cardCostCandidateMandatory`、`CardImpl.getBaseCosts()`、`discountCardCostCandidate()`、ADR 0003、ADR 0004 | 购买 major / minor improvement 的新成本变形走 Cost Candidate List；A20/B36 这类动态基础费用在 pipeline 前产出 base candidates；卡牌只声明单候选转换，遍历 / 去重 / 饱和过滤由候选闭包负责（`CardListenerRegistration.order` 已删除，禁止重新引入顺序字段）；普通折扣天然保留原候选，后续 payment dominance 再隐藏严格劣势支付项；`cardCostCandidateMandatory` 只用于固定价 / replacement 这类必须隐藏原 candidate 的语义（如 A27），不可用于 A75 这类普通折扣；折到 0 的资源键省略；候选 metadata 不写入资源 map 或通用 `PaymentSolution`，由 improvement payment glue 合并到现有 `sourceCards`，并在支付选定后把 Cost Attribution 写入 Card Resource Stats。 |
| Payment bonus choices / unit cost alternatives | `Bonus.capDiscountAtCost`、`Bonus.trackChoiceIndex`、`Bonus.choiceAffectsState`、A16、C56、D88 | 普通 bonus choice 必须在折扣后不产生负 cost；typed cost payment 不保留 `resourcesPaid` 为负的 surplus 分支。BGA `addCost` per-unit alternative 先用 `scope:'unit'` trade 生成 cost row，再允许 D88 这类 bonus choice 继续替换。只有“移除当前 cost 中某资源”这类卡牌显式设置 cap 时，折扣才按当前 cost 封顶。`bonusChoiceIndex` 只表示玩家选了第几个 choice；只有 `choiceAffectsState` 标记的 choice identity 会被 after-pay 等 listener 消费并改变状态时，payment dominance 才禁止互剪。B145/D88 这类无状态 replacement choice 不设置该标记。 |
| Card-provided payment resources | `ComplexCost.paymentResourceProviders`、`PaymentSolution.paymentResourceCovers`、`B155_ArtTeacher`、ADR 0004 | 卡牌可在 `computeCosts` 内声明 payment-only 虚拟资源；provider 在卡牌内部定义可用量、覆盖比例和消费来源。虚拟资源不进入成本候选行或 `PlayerState.resources`，但会出现在 payment option / `resourcesPaid`；使用 provider 的 payment option 必须把 provider `sourceCard` 合入 `sourceCards` 以区分卡牌效果路径，并由 executor 消耗来源状态。 |
| Payment budgets | `ComplexCost.paymentBudget`、`fencePolicy.paymentBudget`、`B015_CarpentersBench` | 对最终 `PaymentSolution.resourcesPaid` 做资源上限过滤；不提供资源、不改变 cost row、不作为 `segmentBounds`。fencing 中用于 B15 这类“只能使用本次资源”的规则，必须在 free fence / computeCosts / payment solver 之后检查，禁止用 collected+1 段数上限替代。 |
| Candidate Closure（候选闭包，ADR 0004） | `candidate-closure.ts` `closeCandidates()`、`buildUnitCostOptions()` 闭包接入、`cost-modifier-permutation-probe.test.ts` | unit trade（D15/B145/A123 等）不再声明 `order`，`Trade.order` / `TradeModifier.order` 已删除；可达 cost row 集合由闭包求不动点产出，与修改器注册顺序无关；mandatory 饱和过滤保证强制折扣链任意序收敛；新增 cost 转换只声明局部语义（替换什么、mandatory 与否、maxUses），禁止重新引入任何顺序字段。 |
| 跨玩家 / 阶段 hook 调度 | `stageResume`、`confirm-player-switch`、`TriggerSnapshot`、`onBeforeEndGame`、`beforeEndGameScope` / `beforeEndGameDispatchMode` | owner prompt、trigger-select、before-end choice 必须保留 undo boundary 和触发时快照语义；trailing listener 读 snapshot helper，不读执行时 live count。 |
| 终局计分与 card bonus VP 统一模型 | `shared/domain/scoring.ts`、`scoring-reserve.ts`、`ScoreEntry.type='bonus'`、`cardBonusVp` category、ScoringPad / compact score 测试 | 所有非印刷卡牌奖励分进入 `cardBonusVp`；不要读取或兼容旧 `cardsBonus` / `cardStateBonusVp` / `cardBonus` score key。Scoring Reserve 只占用终局计分资源，不扣真实资源。 |
| 卡牌能力 metadata 与实现边界 | `CardDefinition` runtime capability fields、`playerHasCardCapability()`、`getPlayedCardDefinitions()`、`collectCardDefinitionsAs()`、`pnpm run check:card-impl-boundaries` | 跨卡身份 / 能力读 metadata/helper；生产 `shared/cards/A-E/*.ts` 不新增运行时外卡 id 分支，明确 allowlist 除外。 |
| 自定义卡 runtime / frontend metadata 拆分 | `shared/cards/custom-registry.ts`、`shared/cards/custom-card-metadata.ts`、`client/services/card-meta.ts`、`scripts/__tests__/eslint-client-boundary.test.ts` | server / sandbox 只注册 impl、session context、effects、listeners、modifiers；main client 只注册 display metadata、art URL、O 编号，不 import custom runtime registry。 |
| Card Source metadata / runtime 分离 | `shared/cards/card-source.ts`、`scripts/build-cards-manifest.ts`、`scripts/generate-register-all.ts`、`scripts/check-generated-cards-sync.ts`、`shared/cards/__tests__/card-source-representatives.test.ts`、`client/components/common/PlayerCard.tsx` | Card Source 卡牌的运行时字段只放在 `impl`；manifest / generated catalog 只静态读取 `meta` 并输出 metadata 字面量；`definePlayerActionCard` 必须显式声明 `playerActionCardType`，发牌池和 UI 由该字段区分 occupation / minor，不从卡号或 i18n 猜测；PlayerCard 读取 manifest 渲染非 0 的印刷正/负 VP，不把负 VP 误判成缺 metadata；major runtime source 只在 `major/runtime.generated.ts` 进入后端实现路径；generated catalog 必须保持同步；workshop PR 生成必须基于已 fetch 的 upstream generated 文件 patch，不读部署机本地 cards tree；代表卡必须通过 production catalog / registry path 覆盖。 |
| Major Improvement stack supply / duplicate / variant behavior | `shared/cards/major/supply.ts`、`GameState.majorImprovementSupply`、`availableMajorImprovements`、`MajorImprovements` panel、`shared/cards/major/*`、`exchange-registry.ts`、`bake-exchange-ui.ts` | Major supply 由 variant registry 选择模板；6 人 duplicate major 和 Farmers of the Moor major supply 都是真实 card id stack，board availability 只暴露每个 stack 当前 top。major purchase / return-to-board / swap 必须通过 supply helper 同步 stack 与兼容 flat list，禁止在主路径散落 `availableMajorImprovements` push/filter 来表达 supply 变化。duplicate Well / oven / cookery / workshop 行为必须保留 concrete id 作为 `sourceCard` / exchange source / scoring attribution，不用 alias 伪装成原版；FoM 启用时使用 12 个供应位、14 张 FoM major + 基础 10 张，不加入 5/6 人 duplicate major，返还 Fireplace / Cooking Hearth 时按当前局面的 stackId 回到 FoM 原供应位。FoM major definitions 按原版 major 的单卡 / 卡牌家族文件组织，runtime effects 优先走 card metadata / impl：`requiresFarmersOfTheMoor` 门控专属 exchange，`heatingRoomDiscount` / `heatingFuelCap` 驱动供暖需求，onBuy / onHarvest 用标准 ActionFlow，避免在供暖、exchange、收获主路径写单卡分支。 |
| Parent Card Definition 数据边界 | `shared/parents/*`、`public/assets/parents/*`、`client/services/parent-assets.ts`、`client/app/parents/*`、`shared/parents/__tests__/parent-cards-complete.test.ts`、`shared/parents/selection.ts`、`shared/parents/mother-rewards.ts`、`shared/parents/father-completion.ts`、`shared/session/ordinary-card-draw.ts`、`shared/domain/scoring.ts` | Parent Cards 是扩展专用结构化数据和 runtime asset 引用，不属于 A-E Card Source / Card Definition / Card Impl 投影；setup / simultaneous mother+father selection、唯一 mother/father 后端自动提交、mother round gain 排入真实 `state.futureMeeples`、开局 mother schedule log 通过 `parent.motherScheduled` public event 派生、ActionBoard round slot future token、`parentCards` scoring、father simple/complex side quest 完成、奖励、draw keep-one transport + UI、ordinary draw pending action gate、sow completion marker、father resource choice structured preview 已由后端权威接入；候选与普通抽牌牌堆必须使用非公开 seed，不在前端补规则裁定。 |
| Through the Seasons 变体边界 | `shared/seasons/*`、`createSeasonActionSpaces()`、`registerThroughTheSeasonsHooks()`、`registerThroughTheSeasonsCardListeners()`、`server/__tests__/through-the-seasons-*-session.test.ts` | Through the Seasons 是 Game Variant，不是卡牌来源；四季行动格常驻公开 board，只有 `state.throughTheSeasons.currentSeason` 对应行动格可执行，季节在下一轮开始时推进并应用 setup 调整。季节版图动作走后端 ActionFlow；Winter/Spring/Summer 这类普通行动修正走 action hook，季节行动分支必须复用 flow child doability 以包含 hook/listener 可执行性；Summer Day Laborer 额外 grain 用 action snapshot token 限制为每次行动一次；Autumn major-improvement 强制建筑资源折扣走会话级 global card-purchase candidate listener 并由 `cardCostCandidateMandatory` 隐藏未折扣候选；variant listener 不写玩家 `cardStates`，不在前端补规则。 |
| Farmers of the Moor hand setup / draft 边界 | `shared/session/state-bootstrap.ts`、`shared/draft/draft-manager.ts`、`shared/draft/types.ts`、`server/game/__tests__/draft-session.test.ts`、`shared/session/__tests__/farmers-of-the-moor-setup.test.ts` | Farmers of the Moor 小改良来源独立于已出版普通小改良牌池；可发 FoM 小改良不足时默认拒绝开局，只有 room option `allowIncompleteFarmersOfTheMoorMinorDeal` 开启时才允许等量减少到 0 张。非 draft 发 4 张 FoM 小改良（不足时按选项等量减少）+ 3 张已出版小改良；simultaneous draft 分阶段执行职业、FoM 小改良、已出版小改良，当前阶段只提交对应 card type。Community Deck / custom minor 只进入已出版小改良部分；Parent Cards selection 仍在手牌确定后启动，不进入 FoM card source。当前可发 FoM 小改良池只包含已实现的 104 张：`M015` / `M016` / `M017` / `M018` / `M019` / `M020` / `M021` / `M022` / `M023` / `M024` / `M025` / `M026` / `M028` / `M029` / `M030` / `M031` / `M032` / `M036` / `M037` / `M038` / `M039` / `M040` / `M041` / `M042` / `M043` / `M044` / `M045` / `M046` / `M047` / `M048` / `M049` / `M050` / `M051` / `M054` / `M055` / `M058` / `M059` / `M060` / `M061` / `M062` / `M063` / `M064` / `M065` / `M066` / `M067` / `M068` / `M069` / `M070` / `M071` / `M072` / `M073` / `M074` / `M075` / `M076` / `M077` / `M078` / `M079` / `M080` / `M081` / `M082` / `M083` / `M085` / `M086` / `M087` / `M088` / `M089` / `M090` / `M091` / `M092` / `M094` / `M095` / `M096` / `M097` / `M098` / `M099` / `M100` / `M103` / `M104` / `M105` / `M106` / `M107` / `M108` / `M109` / `M110` / `M111` / `M112` / `M113` / `M114` / `M115` / `M116` / `M117` / `M118` / `M119` / `M120` / `M121` / `M122` / `M123` / `M124` / `M125` / `M126` / `M127` / `M128` / `M129` / `M130`。 |
| Farmers of the Moor 小改良发牌池派生 | `getImplementedFarmersOfTheMoorMinorIds()`、`implementedMinorImprovementCards`、`CardDefinition.requiresFarmersOfTheMoor`、`cardAllowedForPlayerCount()` | 当前可发 FoM 小改良池从已实现 registry 动态派生，只筛选 FoM 专属小改良和当前人数可用牌；`state-bootstrap` 不再维护与 card registry 平行的手写 id 清单。 |
| Farmers of the Moor terrain / deferred minor runtime 边界 | `docs/adr/0007-farmers-of-the-moor-variant-runtime.md`、`player.farmTerrain`、`player.farmyardExtensions`、`shared/moor/terrain-flow.ts`、`shared/moor/farm-terrain.ts`、`shared/moor/terrain-adjacency.ts`、farmyard validation helpers、`shared/cards/major/supply.ts`、`player.cardStates[cardId]`、`player.farmyardSpaceStates`、`server/__tests__/farmers-of-the-moor-compatibility-session.test.ts`、`server/__tests__/moor-minors-terrain-flow-session.test.ts`、`server/__tests__/M038_M039_M043_moor-adjacency-overrides-session.test.ts`、`server/__tests__/M041_M109_moor-complex-special-minors-session.test.ts`、`server/__tests__/M044_M049_moor-future-terrain-minors-session.test.ts`、`server/__tests__/M046_M047_moor-covered-terrain-session.test.ts`、`server/__tests__/M050_M051_moor-farmyard-extension-session.test.ts`、`server/__tests__/M075_M130_moor-minors-session.test.ts`、`server/__tests__/M088_M126_moor-minors-session.test.ts`、`server/__tests__/moor-batch1-scoring-cookery-exchange-session.test.ts`、`server/__tests__/moor-special-action-listener-minors-session.test.ts`、`server/__tests__/E358_FarmersOfTheMoorHeating-session.test.ts`、`server/__tests__/M018_M062_M063_M068_M106_M113_moor-major-supply-minors-session.test.ts`、`server/__tests__/moor-minor-384-room-build-session.test.ts`、`shared/cards/M/moor-batch1-helpers.ts`、`shared/moor/heating.ts` | FoM 小改良已分批进入 runtime：`M015` / `M016` / `M017` / `M018` / `M019` / `M020` / `M021` / `M022` / `M023` / `M024` / `M025` / `M026` / `M028` / `M029` / `M030` / `M031` / `M032` / `M036` / `M037` / `M038` / `M039` / `M040` / `M041` / `M042` / `M043` / `M044` / `M045` / `M046` / `M047` / `M048` / `M049` / `M050` / `M051` / `M054` / `M055` / `M058` / `M059` / `M060` / `M061` / `M062` / `M063` / `M064` / `M065` / `M066` / `M067` / `M068` / `M069` / `M070` / `M071` / `M072` / `M073` / `M074` / `M075` / `M076` / `M077` / `M078` / `M079` / `M080` / `M081` / `M082` / `M083` / `M085` / `M086` / `M087` / `M088` / `M089` / `M090` / `M091` / `M092` / `M094` / `M095` / `M096` / `M097` / `M098` / `M099` / `M100` / `M103` / `M104` / `M105` / `M106` / `M107` / `M108` / `M109` / `M110` / `M111` / `M112` / `M113` / `M114` / `M115` / `M116` / `M117` / `M118` / `M119` / `M120` / `M121` / `M122` / `M123` / `M124` / `M125` / `M126` / `M127` / `M128` / `M129` / `M130` 已实现。Visible Forests / Visible Moors 是 `farmTerrain.kind` 的公开 top layer；Covered Farm Terrain 存在同条 terrain entry 的 `covered`，不参与 visible 计数、Cut Peat / Slash and Burn 候选或 visible terrain 奖励；Fell Trees 移除 top forest 后会 reveal covered terrain，且不触发 cleared-space token listener。FoM terrain 小改良通过通用 selection leaf 复用 `InteractionRequest.selection` / `farm-position` / selectable tiles：可在 unused farmyard 放置 forest/moor、移除 visible terrain、把 forest 改为 moor、按既有 adjacency 规则把 moor 换成 field；future terrain token 复用 `futureMeeples` round entry，`forest`/`moor` 到期转成 optional terrain selection，`field` 继续转成 optional plow，不支持任意多层 stacked terrain；fenced terrain adjacency 通过纯 helper 统计 forest-field / forest-moor edge；plow / fence 一次性非标准邻接通过 actionContext `adjacencyPolicy`、`allowedTiles`、`fencePolicy` 表达，普通后续 plow/fence 保持默认邻接；M038 fenced terrain 在 terrain 全清前只记录在本卡 `cardStates`，不进入 `player.pastures`。Special action listener 复用现有 played-zone `CardListener` 扫描和普通 ActionFlow/pending，不把 special action 当 action space，也不触发 place-farmer/action-space hook；Special action 资源获得/支付、Fell Trees reveal 和 Slash and Burn 翻田等结果走 `GameEvent` 后由 log mapper 派生 `log.actionDetail`，不直接写 `state.log`；Black Market / Illicit Work 这类 special action 自带 follow-up 时，先完成 follow-up，再通过内部 after-listeners action 读取最终状态；M041/M058/M059/M109 复用普通 `plow` / `sow` / `pay` / `gain` ActionFlow，M054/M055 通过后端 Moor special choice action 复用现有 special action 校验与效果执行，M059 通过 trigger payload / selection extraData + `allowedFields:'fromSelectedFields'` 限制 optional sow 到新 field，M060 在 Horse Market 后通过 card-local post-reorg check 读取动物重整后的 horse count 再决定是否弹 sow；Counter / phase-listener 小改良使用 `cardStates[cardId].counters.usage`、既有 listener/action hook、optional pending 和卡牌局部 ActionFlow，不在前端或单卡外散落临时状态。Farmyard space state 小改良使用 `player.farmyardSpaceStates` 记录 blocked space / farmyard goods token / field goods token / non-field crop space；`getUsedFarmyardTileKeys()` 只把 `blocksPlacement` 计为占用，goods token 通过 `special-effect` claim 在格子真正被使用或 field/private-field-phase sow/reap 触发后发放，non-field crop space 通过 placement lock 阻止覆盖但仍算 unused。Farmyard Extensions 使用 `player.farmyardExtensions` 扩展共享 farmyard geometry；used/unused、plow/room/stable/fence、terrain placement、border edge、scoring 和 FarmBoard 均读取动态形状，M050/M051 通过 farm-position selection 提交真实坐标。FoM heating 小改良通过 heating metadata/context 和 `cardStates` 进入供暖需求计算：M032/M085 走静态 metadata，M082 走 wood-to-fuel context 且按折扣前需求扣实际转换 wood，M086 在 harvest field phase 写入当次 harvest 折扣；`1 Sheep` / `Exactly 1 Sheep` 等动物数量前置走通用 prerequisite parser。Major-supply 小改良复用 stack-aware supply helper、`move-major-improvement-to-top` special effect 和卡牌局部 listener/modifier，不在购买主路径硬编码单卡。Room/build/harvest-building 小改良复用 construct `scope:'unit'` modifier、after construct/collect listener、`trueAction:false` follow-up flow、以及 harvest-local `extraData` food craft-building used 标记。任意多层 stacked terrain 仍不实现；Moving Up Major Improvement / Upgrade 必须走 stack-aware major supply 与 card identity metadata。 |
| Farmers of the Moor terrain 提交期校验 | `getUsedFarmyardTileKeys()`、`commitSelectionChoice()`、`validateFarmPositions()`、`applyTerrainSelectionEffect()` | `selectableTiles` 只作为 pending 展示和第一层候选；`farm-position` 提交与 terrain effect 执行时都会重新读取当前 farmyard 占用，防止同一 round 多个 future terrain token 复用已经被前一个 token 占用的格子。 |
| Farm / action-space source metadata | `FenceSegment.type/source`、`WorkerRef.synthetic.kind='linked-occupancy'`、`ActionSpace.blockedBy`、stable count helpers、special-stable card-effect hooks、supply/family token helpers、`action-space-tokens`、action-space category helpers、`actionSpaceAttachments` cardState、`place-farmer-on-space` | fence、linked occupancy、5/6 linked action-space blocking、special stable、stable count、token supply、行动格预留 marker 与行动格资源附件都走 source/type metadata、cardState 与 domain/helper；公共基础 action definition 的 player-count filter 覆盖 2-6，5/6 专属行动格单独建模；Lessons / Hollow / wood accumulation / Traveling Players / Resource Market 这类跨人数 action-space 语义走共享 category helper，并覆盖 5/6 变体；指定目标的额外放人 / piggyback 放人走 `place-farmer-on-space` internal action，`allowOccupied` 只放宽占用，不绕过 blocked、round availability、action executability 或 worker supply；确实需要 direct-click 硬拒绝的 action space 用通用 `strictCanExecute` opt-in，不要在主路径恢复单卡 import 或卡牌 id 分支。 |
| Future meeple action token / Receive | `receive` internal action、`FutureMeepleResourceMap.field/stable/forest/moor`、`FutureMeeple.actionContext`、`futureMeepleActions` stage resume | round space 到期的普通资源按 player 合并为一次 `receive` transaction，保留每个 entry 的 `sourceCardId`，触发 Receive listener 而不隐式触发 Gain listener；`field` / `stable` 仍由通用 round-start path 转成 optional `plow` / 免费 `stables` action；`forest` / `moor` 由同一 round-start path 转成 optional `farm-position` terrain selection；`actionContext.resourceCondition` 可表达 round-start 资源领取前置条件（例如 Riding Stables 的至少 2 匹 horse），条件不满足时移除到期 entry 但不发资源；M044/M045/M048/M049 复用 future terrain token，不新增 state / pending kind；M075/M076/M078/M079 只复用普通 future resource token，不引入 future optional pay/gain；卡牌应排 future token，不再写卡内 targetRound + onRoundStart 状态机。 |
| Future meeple FoM 资源覆盖 | `extendedResourceKeyList`、`receive` internal action、`buildFutureMeepleActionFlow()` | future resource token 结算复用同一个 `receive` path，并覆盖 base resource 之外的 `fuel` / `horse`；M075/M076/M078/M079 这类预约 FoM 资源的牌不需要卡内 round-start 状态机。 |
| Harvest / animal 通用扩展点 | `reap` private trigger、`HarvestReapSummary.harvestCountApplications`、`computeHarvestSelectionThreshold()`、`computeHarvestFeedingRequirement()`、`getHarvestOutcome()`、`getBreedThreshold()`、`computePastureCapacityModifiers()`、house / card animal zone helpers、`animal-holder-state.ts`、`animalKeysForState()` | 收获、繁殖、喂食、动物容量规则读 summary / modifier / helper；base game 仍只枚举 sheep / boar / cattle，Farmers of the Moor 启用时 `animalKeysForState()` 才把 horse 纳入 reorg、breeding、scoring、newborn-animal 与 all-type 语义；`computeAnimalZones()` 会给当前卡牌 effect 新增但未显式写 `cardId` 的 card zone 补 source card id；animal reorg 交互保留 card zone / `cardId` / `animalCounts` / `allowedAnimalType`，通用 reorg 对 keyed animal-holder card zone 写回 `cardStates[cardId].extraData.animalCounts`，按服务端计算的 fixed `allowedAnimalType` / zone 类型与 `getInvalidAnimals` 校验 payload，先过滤 card-invalid 动物再裁剪容量；只有显式 `allowedAnimalType: null` 的 card zone 允许混放，普通空 card zone 的 mixed payload 会归一到单一动物类型；固定物种 holder 必须显式写 `allowedAnimalType`，`animalType` 只表达当前占用；zone 消失时清理已存动物；最终动物总量可容纳 helper memoize 失败分配状态，避免 impossible 多动物候选重复搜索；pending animal 检测用 active keyed card zone 的 clamped 可见计数替换裸 `extraData`，旧 unkeyed card zone 仍按 normalized payload totals 保持兼容，单类型兼容 `{held,animalType}`，`counters.held` 型卡牌仍由卡内 listener 管理。 |

注：React/Suspense、CDN、browser fallback 等属于平台/浏览器正常术语，不视为卡牌架构风险。

## 6. 基础设施待办

当前没有开放的基础设施 umbrella 待办。已完成的 Before-End Player Dispatch、Scoring Reserve、printed-cost helper、extra-turn 轮转、family token supply、Major Improvement stack supply、card boundary guard、single-layer terrain selection flow、FoM immediate resource minor helper、pasture / harvest / breeding / scoring / stable / special-stable 等历史条目已按需归并到 §5 架构约束或 §12 单卡备注，不再在本节保留完成清单。

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

Card listener（`shared/cards/card-listeners.ts`）收到 `transactionEvents`（整个工作事务的事件）、`actionEvents`（当前行动/阶段切片）和类型化 `eventQuery`（`has` / `find` / `filter`）。资源类卡牌优先读 `actionEvents`、回退 `transactionEvents`。`resource.paid` 携带 `paymentFor` / `paymentSources` / `bonusSources` / `bonusChoiceIndex` / `returnedCardId`，支付折扣 / 退卡类卡牌据此判定，不依赖 action result 资源事实；需要判断实际被消耗的资源时用 `sumActualPaidResource()` 从 `paymentSources` 还原，避免把 card-provided payment resource 当成普通资源。Card-purchase candidate metadata 即使收敛为单候选行，也按 index 0 继续写入 `bonusSources` / Card Resource Stats。

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
| A | `A102_Grocer`, `A112_ScytheWorker`, `A132_Publican`, `A136_DrudgeryReeve`, `A137_RiverineShepherd`, `A144_Sequestrator`, `A150_Stagehand`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A162_ForestTallyman`, `A165_PigBreeder`, `A017_ReclamationPlow`, `A022_Telegram`, `A025_Bassinet`, `A029_AleBenches`, `A039_Chapel`, `A003_PaperKnife`, `A040_PottersYard`, `A053_Claypipe`, `A058_AsparagusKnife`, `A070_LiftingMachine`, `A071_ClearingSpade`, `A072_CalciumFertilizers`, `A081_InterimStorage`, `A082_WorkCertificate`, `A084_Silage`, `A089_StablePlanner`, `A092_AdoptiveParents` |
| B | `B124_Trimmer`, `B146_Illusionist`, `B157_Salter`, `B019_MoldboardPlow`, `B021_HayloftBarn`, `B023_FinalScenario`, `B024_Lasso`, `B034_SpecialFood`, `B003_Moonshine`, `B042_ForestInn`, `B048_ForestStone`, `B055_MaintenancePremium`, `B067_HandTruck`, `B076_Ceilings`, `B081_Handcart`, `B083_MuddyPuddles`, `B085_FarmHand` |
| C | `C104_Collector`, `C115_Sower`, `C120_AgriculturalLabourer`, `C130_OutskirtsDirector`, `C132_TimberShingleMaker`, `C133_Soldier`, `C142_MarketCrier`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C151_SowingDirector`, `C153_PatternMaker`, `C156_HoofCaregiver`, `C162_ForestOwner`, `C167_CattleBuyer`, `C168_AnimalCatcher`, `C018_RollOverPlow`, `C019_SwingPlow`, `C001_Overhaul`, `C022_BasketChair`, `C023_JobContract`, `C024_BedintheGrainField`, `C025_SteamMachine`, `C029_BeerTable`, `C051_FishingNet`, `C057_Crudite`, `C063_CraftBrewery`, `C067_MineralFeeder`, `C069_LandConsolidation`, `C075_Firewood`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C008_PlantFertilizer`, `C093_InnerDistrictsDirector`, `C099_GardenDesigner` |
| D | `D101_SugarBaker`, `D102_SampleStableMaker`, `D103_CanalBoatman`, `D107_Bellfounder`, `D010_StorksNest`, `D116_TreeInspector`, `D124_Emissary`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D129_LumberVirtuoso`, `D134_OysterEater`, `D137_TradeTeacher`, `D138_PetLover`, `D014_HammerCrusher`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D158_BeanCounter`, `D161_CabbageBuyer`, `D167_PureBreeder`, `D020_TurnwrestPlow`, `D022_WorkPermit`, `D023_PioneeringSpirit`, `D026_CarpentersYard`, `D027_Retraining`, `D051_Archway`, `D066_PotterCeramics`, `D070_StrawManure`, `D071_Changeover`, `D072_StableManure`, `D074_RoyalWood`, `D082_HuntingTrophy`, `D092_ChildOmbudsman`, `D093_SheepInspector`, `D094_HenpeckedHusband`, `D096_Furnisher`, `D098_Transactor` |
| E | `E103_Wolf`, `E106_EmergencySeller`, `E010_StrawHat`, `E112_GrainThief`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E134_Omnifarmer`, `E148_Lazybones`, `E162_Entrepreneur`, `E166_Roastmaster`, `E167_DairyCrier`, `E022_GuestRoom`, `E027_PiggyBank`, `E004_Thunderbolt`, `E051_WhaleOil`, `E052_Cubbyhole`, `E053_BoarSpear`, `E058_LunchtimeBeer`, `E005_NightLoot`, `E073_Scythe`, `E074_AshTrees`, `E076_LumberPile`, `E078_SleightofHand`, `E081_AlchemistsLab`, `E083_ShepherdsWhistle`, `E085_MasterTanner`, `E086_PenBuilder` |

## 10. Hook 点清单

下表从当前 `ALL_CARD_IMPLS` 机械抽取。`*` 表示 action id 通配；动态 listener 已按运行时 `actions` 展开。本轮新增 FoM special action listener runtime：`M041` / `M054` / `M055` / `M058` / `M059` / `M060` / `M109` 复用 special action before/after dispatch、后端 Moor special choice action、普通 `plow` / `sow` / `pay` / `gain` flow；`M070` / `M077` / `M092` / `M096` / `M127` 使用 `after.cut-peat`，`M096` / `M118` / `M119` 使用 `after.fell-trees`，`M083` / `M121` / `M123` 使用 `after.hiring-fair`，`M116` / `M122` 走 `moorSpecialActionBonuses` metadata，并继续复用 `after.place-farmer` / `after.collect` / `onBuy` / `onStartReturnHome` 等既有 hook；FoM heating 小改良 runtime：`M032` 使用 `computeExtraRoomCapacity` + `computeReplace/isDoable.renovate-house`，`M082` 使用 `onBuy`，`M086` 使用 `onHarvestFieldPhase`；room/build/harvest-building runtime：`M036` 使用 construct `scope:'unit'` modifier，`M037` 使用 `after.construct`，`M061` 使用 `after.collect`，`M091` 使用 harvest effect + `after.exchange` / `immediatelyAfter.trade-applied`。

Protected atomic action 的 direct `cancel` 在 public action lifecycle 之前被拒绝，不触发 `before` / `during` / `immediatelyAfter` / `after` listener；本表只描述真实成功路径和 guard 之后的 recoverable failure。

| 类型 | Hook 点 | 卡牌 |
|---|---|---|
| effect | `computeBonusScore` | `A101_CookeryOutfitter`, `A133_Braggart`, `A134_FullFarmer`, `A031_DebtSecurity`, `A032_Manger`, `A038_WoolBlankets`, `A098_StableArchitect`, `A099_FellowGrazer`, `B132_EstateMaster`, `B153_Housemaster`, `B030_WoodPalisades`, `B031_PotteryYard`, `B032_Kettle`, `B039_Loom`, `B098_OrganicFarmer`, `B099_Tutor`, `C100_Butler`, `C132_TimberShingleMaker`, `C134_CowPrince`, `C135_Constable`, `C030_HalfTimberedHouse`, `C031_WritingChamber`, `C033_GreeningPlan`, `C035_LanternHouse`, `C039_StudioBoat`, `C059_SchnappsDistillery`, `D100_LordoftheManor`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D154_ChimneySweep`, `D157_PartyOrganizer`, `D029_MuckRake`, `D030_ArtisanDistrict`, `D031_Storeroom`, `D033_SummerHouse`, `D034_LuxuriousHostel`, `D035_FodderChamber`, `D036_BreedRegistry`, `D038_MilkingStool`, `D060_LargePottery`, `D092_ChildOmbudsman`, `E124_MayorCandidate`, `E134_Omnifarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E153_StoneSculptor`, `E154_Margrave`, `E159_OldMiser`, `E032_Nave`, `E034_LandRegister`, `E035_Misanthropy`, `E037_OxSkull`, `E038_RodCollection`, `M064_FamilyBurialPlot`, `M067_ChamberOfCommerce`, `M070_MoorArchaeology`, `M072_OvenDamper`, `M073_StockBreedingPrize` |
| effect | `computeCostedBonus` | `C099_GardenDesigner`, `E132_VeggieLover`, `M108_GrainDistillery` |
| effect | `computeExtraRoomCapacity` | `A010_WoodenShed`, `A127_Lodger`, `A085_Homekeeper`, `B010_Caravan`, `B085_FarmHand`, `C010_BunkBeds`, `D085_Reader`, `E085_MasterTanner`, `M032_PeatHut` |
| effect | `computeLockedFarmTiles` | `B038_FutureBuildingSite` |
| effect | `computeSharedPostScore` | `A135_AnimalReeve`, `B136_HouseSteward`, `C136_RanchProvost`, `M071_BogBody` |
| effect | `getInvalidAnimals` | `B011_Feedyard`, `B169_LivestockSustainer`, `C011_WildlifeReserve`, `C012_CattleFarm`, `C148_MudWallower`, `C086_LivestockFeeder`, `E011_PettingZoo`, `E033_BeaverColony`, `E036_HerbalGarden`, `E086_PenBuilder` |
| effect | `onAfterHarvest` | `B082_ValueAssets`, `C034_ElephantgrassPlant`, `C066_EternalRyeCultivation`, `D099_EarthenwarePotter`, `E134_Omnifarmer`, `E091_PlowBuilder` |
| effect | `onAfterReap` | `A106_SlurrySpreader`, `A059_PotatoRidger`, `A064_BarleyMill`, `B021_HayloftBarn`, `B058_CrackWeeder`, `C106_PotatoHarvester`, `C120_AgriculturalLabourer`, `D113_FoodMerchant`, `D126_FieldCultivator`, `D063_Lynchet`, `D065_GrainSieve` |
| effect | `onAfterRoundEnd` | `A165_PigBreeder`, `A054_Credit`, `B053_SculptureCourse`, `D167_PureBreeder`, `D064_BakingCourse`, `D079_CarrotMuseum`, `E087_MasterRenovator` |
| effect | `onAllWorkersPlaced` | `E125_DelayedWayfarer` |
| effect | `onBeforeEndGame` | `A136_DrudgeryReeve`, `B133_VillagePeasant`, `C133_Soldier`, `D132_HideFarmer` |
| effect | `onBeforeHarvest` | `A166_Haydryer`, `C092_AutumnMother`, `D032_WoodRake`, `D098_Transactor` |
| effect | `onBeforePlayerTurn` | `D134_OysterEater`（non-flow skip-control，labor turn 入口同步消费 `{ skipTurn?: true }`） |
| effect | `contributeExtraTurn` | `A092_AdoptiveParents`（轮转额外行动：玩家普通工人耗尽但仍持未激活后代时返回 XOR[use, forfeit] flow；被 round.ts 主动消费、order-independent；轮转据此不提前跳过该玩家；内部 `countExtraTurns` 让 skip-turn / forced consume 逐个 opportunity 消费） |
| effect | `onBeforeReturnHome` | `A172_BoatPainter`, `B117_Informant`, `B140_FarmyardWorker`, `B158_DistrictManager`, `B160_PubOwner`, `C174_StoneCustodian`, `D130_RecreationalCarpenter`, `D142_PotatoPlanter`, `D051_Archway`, `E010_StrawHat`, `E143_Hewer`, `E158_StoneCustodian`, `E023_Apiary`, `E026_Sundial`, `E027_PiggyBank` |
| effect | `onBeforeStartOfTurn` | `A130_MummysBoy`, `A022_Telegram`, `A049_NestSite`, `B106_MoralCrusader`, `B124_Trimmer`, `B140_FarmyardWorker`, `B070_NewPurchase`, `B089_Groom`, `C101_StallHolder`, `C111_SmallAnimalBreeder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C157_ResourceAnalyzer`, `C046_Mandoline`, `C064_CornSchnappsDistillery`, `C067_MineralFeeder`, `C084_PerennialRye`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D046_PelletPress`, `D048_CivicFacade`, `D053_TeaHouse`, `E162_Entrepreneur`, `E022_GuestRoom`, `E028_Bookmark`, `E056_RomanPot`, `E062_SourDough`, `E093_Motivator`, `E096_Elder` |
| effect | `onBuy` | `A102_Grocer`, `A112_ScytheWorker`, `A117_WoodCarrier`, `A011_MudPatch`, `A120_ClayHutBuilder`, `A121_ClayPuncher`, `A125_Priest`, `A127_Lodger`, `A134_FullFarmer`, `A135_AnimalReeve`, `A136_DrudgeryReeve`, `A013_RenovationCompany`, `A144_Sequestrator`, `A162_ForestTallyman`, `A165_PigBreeder`, `A167_BreederBuyer`, `A176_Wheelmaker`, `A177_Middleman`, `A016_RammedClay`, `A019_Handplow`, `A001_Shelter`, `A020_DoubleTurnPlow`, `A022_Telegram`, `A027_OvenSite`, `A002_ShiftingCultivation`, `A033_BigCountry`, `A036_FacadesCarving`, `A039_Chapel`, `A003_PaperKnife`, `A040_PottersYard`, `A043_FarmyardManure`, `A044_PondHut`, `A047_Trellises`, `A004_Baseboards`, `A053_Claypipe`, `A054_Credit`, `A057_MilkingParlor`, `A005_ClayEmbankment`, `A069_LargeGreenhouse`, `A006_StorageBarn`, `A074_StableTree`, `A077_Hod`, `A007_GardenersKnife`, `A086_AnimalTamer`, `A089_StablePlanner`, `A008_FoodBasket`, `A009_YoungAnimalMarket`, `B102_Consultant`, `B105_CaseBuilder`, `B107_Manservant`, `B113_PatchCaregiver`, `B116_Shoreforester`, `B117_Informant`, `B119_Lumberjack`, `B123_RoofBallaster`, `B124_Trimmer`, `B125_EstateWorker`, `B127_Seducer`, `B136_HouseSteward`, `B137_Wholesaler`, `B141_FieldCaretaker`, `B148_PetBroker`, `B149_OpenAirFarmer`, `B014_Hawktower`, `B160_PubOwner`, `B163_Pastor`, `B164_SheepWhisperer`, `B167_StableSergeant`, `B016_MiningHammer`, `B019_MoldboardPlow`, `B001_UpscaleLifestyle`, `B020_ChainFloat`, `B021_HayloftBarn`, `B022_WalkingBoots`, `B023_FinalScenario`, `B025_BreadPaddle`, `B027_Toolbox`, `B029_CookeryLesson`, `B002_MiniPasture`, `B033_Mantlepiece`, `B037_Grange`, `B038_FutureBuildingSite`, `B003_Moonshine`, `B041_Hauberg`, `B042_ForestInn`, `B044_ChickStable`, `B045_StrawberryPatch`, `B046_ClubHouse`, `B048_ForestStone`, `B004_WoodPile`, `B052_GrowingFarm`, `B054_Tumbrel`, `B055_MaintenancePremium`, `B058_CrackWeeder`, `B059_FoodChest`, `B005_StoreofExperience`, `B065_GrainDepot`, `B066_SackCart`, `B006_ExcursiontotheQuarry`, `B071_HarvestHouse`, `B073_GiftBasket`, `B074_ThickForest`, `B076_Ceilings`, `B078_ReedBelt`, `B007_Wage`, `B083_MuddyPuddles`, `B084_AcornsBasket`, `B088_EstablishedPerson`, `B089_Groom`, `B008_MarketStall`, `B093_Confidant`, `B096_TreeFarmJoiner`, `B099_Tutor`, `B009_BeatingRod`, `C104_Collector`, `C106_PotatoHarvester`, `C107_Baker`, `C108_Layabout`, `C113_WinterCaretaker`, `C116_FurnitureMaker`, `C118_WoodCollector`, `C119_SkillfulRenovator`, `C121_ClayKneader`, `C127_Lover`, `C135_Constable`, `C136_RanchProvost`, `C139_BasketmakersWife`, `C140_PackagingArtist`, `C143_StoneBuyer`, `C144_ReedRoofRenovator`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C155_FoodDistributor`, `C156_HoofCaregiver`, `C161_PotatoDigger`, `C162_ForestOwner`, `C165_GameCatcher`, `C166_CattleWhisperer`, `C016_FieldFences`, `C017_NewlyPlowedField`, `C019_SwingPlow`, `C001_Overhaul`, `C022_BasketChair`, `C024_BedintheGrainField`, `C026_Flail`, `C002_Stable`, `C038_Christianity`, `C039_StudioBoat`, `C003_CarriageTrip`, `C040_CanvasSack`, `C044_ChickenCoop`, `C047_GardenClaw`, `C004_WritingBoards`, `C050_StableYard`, `C057_Crudite`, `C005_Remodeling`, `C060_SmallPottersOven`, `C065_Granary`, `C006_StoneClearing`, `C072_FestivalPlanning`, `C074_PrivateForest`, `C077_ClaySupply`, `C078_ReedHattedToad`, `C079_StoneCart`, `C007_BladeShears`, `C081_MaterialHub`, `C083_EarlyCattle`, `C086_LivestockFeeder`, `C087_Mason`, `C008_PlantFertilizer`, `C098_CubeCutter`, `C009_AutomaticWaterTrough`, `D109_SowingMaster`, `D114_SeedTrader`, `D116_TreeInspector`, `D117_WoodExpert`, `D118_Bonehead`, `D120_ClayDeliveryman`, `D122_ClayCarrier`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D131_CraftsmanshipPromoter`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D141_SeedSeller`, `D145_RoofExaminer`, `D156_RetailDealer`, `D162_ClayFirer`, `D166_StableMilker`, `D167_PureBreeder`, `D177_Graduate`, `D001_ZigzagHarrow`, `D020_TurnwrestPlow`, `D022_WorkPermit`, `D023_PioneeringSpirit`, `D002_DwellingPlan`, `D003_Furrows`, `D040_Cesspit`, `D041_HorseDrawnBoat`, `D043_Hutch`, `D044_ForestWell`, `D045_SheepWell`, `D047_Churchyard`, `D004_CrossCutWood`, `D050_ForeignAid`, `D051_Archway`, `D057_WholesaleMarket`, `D005_FieldClay`, `D060_LargePottery`, `D062_BeerTap`, `D067_ReapHook`, `D069_SmallGreenhouse`, `D006_PetrifiedWood`, `D074_RoyalWood`, `D078_ReedPond`, `D007_Trident`, `D084_FeedPellets`, `D088_Millwright`, `D008_FernSeeds`, `D091_Plowman`, `D096_Furnisher`, `D097_BeggingStudent`, `D099_EarthenwarePotter`, `D009_GameTrade`, `E103_Wolf`, `E104_SpiceTrader`, `E105_Pioneer`, `E106_EmergencySeller`, `E119_LandHeir`, `E120_ScrapCollector`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E127_DiligentFarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E138_LivestockExpert`, `E139_BunnyBreeder`, `E140_Carter`, `E145_Parvenu`, `E148_Lazybones`, `E155_Visionary`, `E161_ElderBaker`, `E167_DairyCrier`, `E001_PoleBarns`, `E022_GuestRoom`, `E025_BumperCrop`, `E028_Bookmark`, `E002_RenovationMaterials`, `E033_BeaverColony`, `E003_TeaTime`, `E040_BeeStatue`, `E041_MuddyWaters`, `E042_WaterGully`, `E043_BarnCats`, `E044_FodderBeets`, `E045_FruitLadder`, `E046_WaterlilyPond`, `E004_Thunderbolt`, `E051_WhaleOil`, `E056_RomanPot`, `E005_NightLoot`, `E060_WorkingGloves`, `E063_IronOven`, `E064_SimpleOven`, `E065_Almsbag`, `E006_Recount`, `E074_AshTrees`, `E076_LumberPile`, `E078_SleightofHand`, `E007_Pumpernickel`, `E081_AlchemistsLab`, `E082_Profiteering`, `E008_FarmersMarket`, `E094_Prophet`, `E097_Beneficiary`, `E098_Prodigy`, `E009_BarteringHut` |
| effect | `onBuy` (FoM minors) | `M019_LawnTurf`, `M020_PeatPellets`, `M022_EcologicalNiche`, `M023_EdgeOfTheForest`, `M024_BasicSupplies`, `M025_HouseholdInventory`, `M026_ChimneyHood`, `M028_OutOnTheWallaby`, `M029_Tinker`, `M030_FarmAnimalMarket`, `M031_LivestockMarket`, `M050_FarmExtension`, `M051_MoorEnclosures`, `M064_FamilyBurialPlot`, `M065_FireBrigade`, `M067_ChamberOfCommerce`, `M072_OvenDamper`, `M074_Administration`, `M075_FuelStorage`, `M076_Flatboat`, `M078_Barge`, `M079_PeatSled`, `M080_AdvancePayment`, `M082_Firewood`, `M083_CoalSeam`, `M090_WinterStorehouse`, `M095_FallowFields`, `M099_HealingClay`, `M100_Pheromones`, `M104_WildHarvest`, `M115_OakBark`, `M123_StoneQuarry`, `M125_HardwareStore`, `M126_CooperativeStore` |
| effect | `computeBreedThreshold` | `E084_DollysMother` |
| effect | `computePastureCapacityModifiers` | `A012_DrinkingTrough`, `B072_LoveforAgriculture`, `D011_LawnFertilizer` |
| effect | `onComputeAnimalZones` | `A011_MudPatch`, `A148_Woolgrower`, `A086_AnimalTamer`, `B115_TinsmithMaster`, `B011_Feedyard`, `B012_Stockyard`, `B148_PetBroker`, `B169_LivestockSustainer`, `B086_TruffleSearcher`, `C011_WildlifeReserve`, `C012_CattleFarm`, `C148_MudWallower`, `C086_LivestockFeeder`, `C089_StableMaster`, `D148_DomesticianExpert`, `D086_SheepAgent`, `E011_PettingZoo`, `E012_AnimalBedding`, `E033_BeaverColony`, `E036_HerbalGarden`, `E086_PenBuilder` |
| effect | `onComputeSowableFields` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M111_NoTillFarming` |
| effect | `onEndHarvest` | `A112_ScytheWorker`, `A145_Ropemaker`, `B011_Feedyard`, `C113_WinterCaretaker`, `C124_StoneImporter`, `C071_Slurry`, `D072_StableManure`, `D115_FodderPlanter`, `E133_ChampionBreeder`, `E073_Scythe`, `E090_DungCollector`, `E099_UncaringParents` |
| effect | `onEndHarvestFeedingPhase` | `C041_FarmStore`, `D076_SocialBenefits`, `E083_ShepherdsWhistle`, `M091_RoutineWork` |
| effect | `onEndHarvestFieldPhase` | `A061_WinnowingFan`, `C110_HomeBrewer`, `C029_BeerTable`, `C054_MarketBooth`, `E112_GrainThief` |
| effect | `onEndTurn` | `B027_Toolbox`, `D074_RoyalWood`, `M062_HearthBrush`, `M063_PastoralLetter` |
| effect | `onHarvest` | `M088_PeatIron` |
| effect | `onHarvestFeedingPhase` | `A062_BeerKeg`, `C049_BeerStall`, `C055_Studio`, `C063_CraftBrewery`, `D012_MilkingPlace`, `D133_BeerTentOperator`, `D084_FeedPellets`, `E110_Dentist`, `E132_VeggieLover`, `E142_Smuggler`, `E039_Paintbrush`, `E048_TownHall`, `M074_Administration` |
| effect | `onHarvestFieldPhase` | `A104_WoodHarvester`, `A118_Treegardener`, `B101_FurnitureCarpenter`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B039_Loom`, `B050_ButterChurn`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `C098_CubeCutter`, `D025_WitchesDanceFloor`, `D038_MilkingStool`, `D075_WoodField`, `E107_LandSurveyor`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M086_SpinningMill`, `M128_Workbench` |
| effect | `onReturnHome` | `A029_AleBenches`, `A053_Claypipe`, `A070_LiftingMachine`, `A084_Silage`, `B124_Trimmer`, `B139_ForestScientist`, `B022_WalkingBoots`, `C051_FishingNet`, `C075_Firewood`, `D052_RollingPin` |
| effect | `onRoundEnd` | `A054_Credit` |
| effect | `onRoundStart` | `A076_Cob`, `A081_InterimStorage`, `A090_PlowDriver`, `A096_TaskArtisan`, `B110_Pavior`, `B114_Childless`, `B116_Shoreforester`, `B118_SmallscaleFarmer`, `B135_NutritionExpert`, `B172_CattleCaregiver`, `B023_FinalScenario`, `B029_CookeryLesson`, `B057_Scullery`, `B069_PottersMarket`, `B081_Handcart`, `B093_Confidant`, `B097_Scholar`, `C103_GreenGrocer`, `C123_Freemason`, `C125_Nightworker`, `C159_FishermansFriend`, `C021_HeartofStone`, `C039_StudioBoat`, `D116_TreeInspector`, `D022_WorkPermit`, `D054_TroutPool`, `D069_SmallGreenhouse`, `D093_SheepInspector`, `E100_MuseumCaretaker`, `E102_Acquirer`, `E111_Recluse`, `E126_TaxCollector`, `E152_BargainHunter`, `E168_AnimalTamersApprentice`, `E088_MasterFencer` |
| effect | `onSowExtraField` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C070_LettucePatch`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden`, `M111_NoTillFarming` |
| effect | `onStartHarvest` | `C178_OnSiteReverend`, `C024_BedintheGrainField`, `C062_CookeryExtension`, `D129_LumberVirtuoso`, `D153_WealthyMan`, `D061_BaleofStraw`, `D097_BeggingStudent`, `E110_Dentist`, `E111_Recluse`, `E117_PipeSmoker`, `E147_AnimalDriver`, `E149_MidnightFencer`, `E058_LunchtimeBeer`, `E061_RaisedBed`, `M091_RoutineWork`, `M104_WildHarvest` |
| effect | `onStartHarvestFeedingPhase` | `C107_Baker`, `E052_Cubbyhole` |
| effect | `onStartHarvestFieldPhase` | `A112_ScytheWorker`, `B165_GameProvider`, `B061_ThreeFieldRotation`, `C057_Crudite`, `D070_StrawManure`, `D072_StableManure`, `E112_GrainThief`, `E073_Scythe` |
| effect | `onStartReturnHome` | `A100_Curator`, `A127_Lodger`, `A141_TurnipFarmer`, `A151_Minstrel`, `A152_NightSchoolStudent`, `A157_Bohemian`, `A035_SwimmingClass`, `A058_AsparagusKnife`, `C155_FoodDistributor`, `C171_YoungArtist`, `C097_SeedResearcher`, `D102_SampleStableMaker`, `D107_Bellfounder`, `D010_StorksNest`, `D018_SteamPlow`, `E020_IronHoe`, `E087_MasterRenovator`, `M097_VillageHall` |
| effect | `resolveChoice` | `A136_DrudgeryReeve`, `B146_Illusionist`, `B157_Salter`, `B003_Moonshine`, `C104_Collector`, `C133_Soldier`, `C146_WorkshopAssistant`, `D132_HideFarmer`, `D023_PioneeringSpirit`, `E134_Omnifarmer`, `E148_Lazybones` |
| exchange | `anytime` | `A060_OrientalFireplace`, `B104_SheepWalker`, `B032_Kettle`, `B080_HardPorcelain`, `C139_BasketmakersWife`, `C050_StableYard`, `D162_ClayFirer`, `D172_PutcherMaker`, `D025_WitchesDanceFloor`, `D059_EarthOven`, `D060_LargePottery`, `E109_BraidMaker`, `M081_PeatBoat`, `M105_OpenGrill` |
| exchange | `bake-bread` | `A060_OrientalFireplace`, `D025_WitchesDanceFloor`, `D059_EarthOven`, `D064_BakingCourse`, `E063_IronOven`, `E064_SimpleOven`, `M105_OpenGrill` |
| exchange | `harvest` | `C105_BasketCarrier`, `C109_SchnappsDistiller`, `C059_SchnappsDistillery`, `D108_StoneCarver`, `D155_Ebonist`, `D062_BeerTap`, `E153_StoneSculptor`, `M108_GrainDistillery` |
| handHooks | `onBeforeStartOfTurn` | `E096_Elder` |
| listener | `after.*` | `E047_SyrupTap`, `M092_AridField`, `M095_FallowFields`, `M096_FallowLand` |
| listener | `after.bake-bread` | `A030_BakingSheet`, `A063_DutchWindmill`, `C061_BeerStein`, `E057_CheeseFondue` |
| listener | `after.collect` | `A103_Portmonger`, `A142_Cordmaker`, `A146_StorehouseSteward`, `A015_CarpentersAxe`, `A164_WoodWorker`, `A017_ReclamationPlow`, `A175_HollowGardener`, `A179_MountainShepherd`, `A023_StoneCompany`, `A048_ShavingHorse`, `A095_Angler`, `B131_Equipper`, `B147_Huntsman`, `B015_CarpentersBench`, `B162_ForestClearer`, `B017_ForestPlow`, `B174_RiverbankGardener`, `B180_GameTeaser`, `B021_HayloftBarn`, `B034_SpecialFood`, `B048_ForestStone`, `B055_MaintenancePremium`, `B079_Corf`, `C102_TreeGuard`, `C114_SoilScientist`, `C163_MaterialDeliveryman`, `C177_MountainHiker`, `C042_RavenousHunger`, `C052_HuntsmansHat`, `C081_MaterialHub`, `D140_Loudmouth`, `D143_TreeCutter`, `D144_WaterWorker`, `D146_Porter`, `D169_Plowsmith`, `D174_LoessGardener`, `D180_PartTimeWorker`, `D019_PulverizerPlow`, `D036_BreedRegistry`, `D073_SupplyBoat`, `E103_Wolf`, `E118_KindlingGatherer`, `E140_Carter`, `E015_NailBasket`, `E038_RodCollection`, `E051_WhaleOil`, `E053_BoarSpear`, `E077_Mattock`, `M061_HayWagon`, `M098_FishSmokehouse`, `M110_FarmCart`, `M117_DraughtHorses`, `M118_TimberMill`, `M127_Wheelbarrow` |
| listener | `after.construct` | `A110_Roughcaster`, `A111_WallBuilder`, `A167_BreederBuyer`, `A178_CarpentersBoy`, `A021_FamilyFriendHome`, `A040_PottersYard`, `A073_AgriculturalFertilizers`, `A093_BedMaker`, `B111_Rustic`, `B140_FarmyardWorker`, `B163_Pastor`, `B027_Toolbox`, `D123_RenovationPreparer`, `D128_BuildingTycoon`, `D163_JourneymanBricklayer`, `D074_RoyalWood`, `D094_HenpeckedHusband`, `D096_Furnisher`, `E123_ResourceHoarder`, `E049_Twibil`, `E052_Cubbyhole`, `M037_BuildingPlan` |
| listener | `after.cut-peat` | `M048_ForestSwamp`, `M070_MoorArchaeology`, `M077_DryingField`, `M092_AridField`, `M096_FallowLand`, `M127_Wheelbarrow` |
| listener | `after.exchange` | `A048_ShavingHorse`, `B021_HayloftBarn`, `B029_CookeryLesson`, `C148_MudWallower`, `C053_GypsysCrock`, `D036_BreedRegistry`, `D056_FatstockStretcher`, `E103_Wolf`, `E053_BoarSpear`, `E085_MasterTanner`, `M091_RoutineWork`, `M115_OakBark` |
| listener | `after.family-growth` | `D150_GodlySpouse`, `D157_PartyOrganizer`, `E113_Godmother`, `M089_BirthingHouse`, `M103_ForestKindergarten` |
| listener | `after.fell-trees` | `M096_FallowLand`, `M118_TimberMill`, `M119_AlderSwamp` |
| listener | `after.fence` | `A144_Sequestrator`, `A034_Loppers`, `A040_PottersYard`, `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `B124_Trimmer`, `B140_FarmyardWorker`, `B027_Toolbox`, `B094_StockProtector`, `C179_BovinePioneer`, `D089_Stablehand`, `E108_BlackberryFarmer`, `E074_AshTrees` |
| listener | `after.gain` | `A048_ShavingHorse`, `B021_HayloftBarn`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `D036_BreedRegistry`, `E103_Wolf`, `E118_KindlingGatherer`, `E053_BoarSpear` |
| listener | `after.hiring-fair` | `M083_CoalSeam`, `M121_Loam`, `M123_StoneQuarry` |
| listener | `after.pop-card-stack` | `D036_BreedRegistry` |
| listener | `after.receive` | `A048_ShavingHorse`, `B021_HayloftBarn`, `B096_TreeFarmJoiner`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `E053_BoarSpear` |
| listener | `after.take-from-card` | `D036_BreedRegistry` |
| listener | `immediatelyAfter.harvest-feed-conversion` | `D036_BreedRegistry` |
| listener | `immediatelyAfter.future-meeple-resolved` | `D036_BreedRegistry` |
| listener | `after.improvement` | `A109_SmallTrader`, `A131_CraftTeacher`, `A041_VegetableSlicer`, `B100_Clutterer`, `B049_Scales`, `C115_Sower`, `C137_CharcoalBurner`, `C043_FarmBuilding`, `C075_Firewood`, `C080_RockyTerrain`, `D118_Bonehead`, `D161_CabbageBuyer`, `D173_TownClerk`, `D080_BrickHammer`, `E144_WaresSalesman`, `E156_ClaypitOwner`, `E165_MasterHuntsman`, `E018_SeedAlmanac`, `E031_Upholstery` |
| listener | `after.occupation` | `A139_HollowWarden`, `A096_TaskArtisan`, `B100_Clutterer`, `B103_FieldMerchant`, `B138_ForestGuardian`, `B151_LittlePeasant`, `B155_ArtTeacher`, `B025_BreadPaddle`, `B049_Scales`, `C120_AgriculturalLabourer`, `C068_Bookcase`, `C080_RockyTerrain`, `C095_BasketWeaver`, `D118_Bonehead`, `D163_JourneymanBricklayer`, `D042_EducationBonus`, `D095_SiteManager`, `E101_Blighter`, `E116_FirCutter`, `E144_WaresSalesman`, `E157_Usufructuary`, `E163_Patroness`, `E165_MasterHuntsman`, `E089_Stallwright`, `E095_Miller` |
| listener | `after.pay` | `B018_GrasslandHarrow`, `C116_FurnitureMaker`, `C148_MudWallower`, `D171_SeniorTeacher`, `D074_RoyalWood`, `E122_Cottar`, `E123_ResourceHoarder`, `E128_Saddler`, `E054_Contraband` |
| listener | `after.place-farmer` | `A113_HeresyTeacher`, `A114_SeasonalWorker`, `A116_WoodCutter`, `A119_FirewoodCollector`, `A121_ClayPuncher`, `A122_PanBaker`, `A128_RiparianBuilder`, `A129_Swagman`, `A130_MummysBoy`, `A137_RiverineShepherd`, `A138_Harpooner`, `A139_HollowWarden`, `A140_ShovelBearer`, `A147_AnimalDealer`, `A149_HouseArtist`, `A150_Stagehand`, `A154_Paymaster`, `A155_Conjurer`, `A156_Buyer`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A160_Lutenist`, `A161_PatchCaretaker`, `A163_BuildingExpert`, `A168_AnimalTeacher`, `A171_Sidekick`, `A177_Middleman`, `A018_WheelPlow`, `A024_ThreshingBoard`, `A042_ForestLakeHut`, `A046_ClawKnife`, `A050_MilkJug`, `A051_DriftNetBoat`, `A066_FeedingDish`, `A067_CornScoop`, `A072_CalciumFertilizers`, `A077_Hod`, `A078_Canoe`, `A080_StoneTongs`, `A082_WorkCertificate`, `A092_AdoptiveParents`, `A097_Freshman`, `B108_OvenFiringBoy`, `B112_Silokeeper`, `B121_Geologist`, `B128_Plumber`, `B130_FullPeasant`, `B137_Wholesaler`, `B142_Greengrocer`, `B143_ClayWarden`, `B144_Collier`, `B150_LargeScaleFarmer`, `B152_JuniorArtist`, `B156_StorehouseKeeper`, `B161_Weakling`, `B166_CattleFeeder`, `B173_Sweeper`, `B178_TagAlong`, `B019_MoldboardPlow`, `B024_Lasso`, `B028_ForestryStudies`, `B029_CookeryLesson`, `B040_BreweryPond`, `B043_Chophouse`, `B047_HerringPot`, `B056_Brook`, `B060_BrewingWater`, `B062_Pitchfork`, `B064_MillWheel`, `B077_LoamPit`, `B087_Cottager`, `B090_CooperativePlower`, `B091_AssistantTiller`, `B092_LittleStickKnitter`, `C117_Legworker`, `C121_ClayKneader`, `C126_Excavator`, `C130_OutskirtsDirector`, `C131_PrivateTeacher`, `C138_AnimalFeeder`, `C141_SheepProvider`, `C142_MarketCrier`, `C145_ForestReviewer`, `C147_Cowherd`, `C148_MudWallower`, `C150_ParrotBreeder`, `C151_SowingDirector`, `C152_Puppeteer`, `C164_GermanHeathKeeper`, `C167_CattleBuyer`, `C176_Cleanacre`, `C019_SwingPlow`, `C020_MolePlow`, `C023_JobContract`, `C026_Flail`, `C039_StudioBoat`, `C042_RavenousHunger`, `C045_Stew`, `C048_Farmstead`, `C082_HardwareStore`, `C090_FieldWatchman`, `C091_PlowHero`, `C093_InnerDistrictsDirector`, `D101_SugarBaker`, `D103_CanalBoatman`, `D109_SowingMaster`, `D112_YoungFarmer`, `D134_OysterEater`, `D137_TradeTeacher`, `D141_SeedSeller`, `D144_WaterWorker`, `D149_CasualWorker`, `D151_SpinDoctor`, `D156_RetailDealer`, `D158_BeanCounter`, `D160_Midwife`, `D161_CabbageBuyer`, `D164_PetGrower`, `D165_PigStalker`, `D020_TurnwrestPlow`, `D027_Retraining`, `D039_TruffleSlicer`, `D055_NewMarket`, `D068_SmallBasket`, `D092_ChildOmbudsman`, `D093_SheepInspector`, `E105_Pioneer`, `E115_SeedServant`, `E116_FirCutter`, `E118_KindlingGatherer`, `E131_MarketMaster`, `E148_Lazybones`, `E160_KelpGatherer`, `E019_OxGoad`, `E040_BeeStatue`, `E066_BarnShed`, `E082_Profiteering`, `E095_Miller`, `M083_CoalSeam`, `M087_PeatBarge`, `M094_PeatBath`, `M099_HealingClay`, `M114_RiversideWoods`, `M120_RiverClay`, `M124_StoneWagon`, `M129_PlowhorseMarket`, `M130_Nosebag` |
| listener | `after.plow` | `A105_BarrowPusher`, `A144_Sequestrator`, `A017_ReclamationPlow`, `A040_PottersYard`, `B159_LieutenantGeneral`, `B177_StoneClawer`, `C172_FieldCounter`, `C080_RockyTerrain`, `D104_Cultivator`, `E164_MountainPlowman` |
| listener | `after.receive` | `A048_ShavingHorse`, `B021_HayloftBarn`, `C120_AgriculturalLabourer`, `C052_HuntsmansHat`, `E053_BoarSpear` |
| listener | `after.renovate-house` | `A110_Roughcaster`, `A120_ClayHutBuilder`, `A037_Bucksaw`, `A045_FireProtectionPond`, `B107_Manservant`, `B134_HousebookMaster`, `B168_PastureMaster`, `B016_MiningHammer`, `B055_MaintenancePremium`, `B076_Ceilings`, `C119_SkillfulRenovator`, `C132_TimberShingleMaker`, `C146_WorkshopAssistant`, `C149_ResourceRecycler`, `C153_PatternMaker`, `D111_InteriorDecorator`, `D161_CabbageBuyer`, `D163_JourneymanBricklayer`, `D027_Retraining`, `D077_RecycledBrick`, `D081_RoofLadder`, `E123_ResourceHoarder`, `E154_Margrave`, `E087_MasterRenovator` |
| listener | `after.reorganize` | `C148_MudWallower` |
| listener | `after.sow` | `A079_GardenHoe`, `B115_TinsmithMaster`, `B054_Tumbrel`, `C073_SeaweedFertilizer`, `D058_Gritter`, `E050_WildGreens`, `E071_CowPatty`, `E079_FieldSpade`, `M095_FallowFields` |
| listener | `after.stables` | `A167_BreederBuyer`, `A040_PottersYard`, `A043_FarmyardManure`, `A073_AgriculturalFertilizers`, `A074_StableTree`, `B140_FarmyardWorker`, `B027_Toolbox`, `C056_FeedFence`, `D166_StableMilker`, `D168_Stockman`, `E114_ShedBuilder` |
| listener | `after.store-on-card` | `E027_PiggyBank` |
| listener | `after.take-from-card` | `E027_PiggyBank` |
| listener | `after.wish-children` | `E113_Godmother` |
| listener | `anytime.*` | `A102_Grocer`, `A153_PigOwner`, `A071_ClearingSpade`, `B154_SheepKeeper`, `B157_Salter`, `B173_Sweeper`, `B035_HookKnife`, `B069_PottersMarket`, `B083_MuddyPuddles`, `B085_FarmHand`, `C101_StallHolder`, `C115_Sower`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C172_FieldCounter`, `C018_RollOverPlow`, `C046_Mandoline`, `C057_Crudite`, `C064_CornSchnappsDistillery`, `C069_LandConsolidation`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C094_StableCleaner`, `D106_WhiskyDistiller`, `D114_SeedTrader`, `D122_ClayCarrier`, `D124_Emissary`, `D013_Trowel`, `D173_TownClerk`, `D046_PelletPress`, `D053_TeaHouse`, `D071_Changeover`, `D087_MasterBuilder`, `E013_StoneHouseReconstruction`, `E014_WoodSaw`, `E022_GuestRoom`, `E027_PiggyBank`, `E062_SourDough`, `E086_PenBuilder`, `E091_PlowBuilder`, `M090_WinterStorehouse`, `M111_NoTillFarming`, `M125_HardwareStore`, `M126_CooperativeStore` |
| listener | `before.*` | `A124_Knapper`, `A126_MasterWorkman`, `B120_Sweep` |
| listener | `before.bake-bread` | `B067_HandTruck`, `C060_SmallPottersOven`, `D066_PotterCeramics` |
| listener | `before.collect` | `A107_Catcher`, `A115_ChiefForester`, `A052_ThrowingAxe`, `A081_InterimStorage`, `A091_ShiftingCultivator`, `B122_Mineralogist`, `B138_ForestGuardian`, `B146_Illusionist`, `B034_SpecialFood`, `B051_DiggingSpade`, `C051_FishingNet`, `C076_WoodCart`, `D105_Sculptor`, `D125_ForestTrader` |
| listener | `before.construct` | `A040_PottersYard`, `A073_AgriculturalFertilizers`, `D119_WoodBarterer` |
| listener | `before.cut-peat` | `M112_PeatAshFertilizer` |
| listener | `before.cultivation` | `C112_Thresher` |
| listener | `before.exchange` | `D056_FatstockStretcher`, `E085_MasterTanner` |
| listener | `before.family-growth` | `E130_Overachiever` |
| listener | `before.farmland` | `C112_Thresher` |
| listener | `before.fence` | `A040_PottersYard`, `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `B094_StockProtector`, `D119_WoodBarterer`, `E074_AshTrees` |
| listener | `before.grain-utilization` | `C112_Thresher` |
| listener | `before.improvement` | `B075_WoodWorkshop` |
| listener | `before.lessons` | `B063_Tasting` |
| listener | `before.lessons-3` | `B063_Tasting` |
| listener | `before.lessons-4` | `B063_Tasting` |
| listener | `before.meeting-place` | `D139_Chairman` |
| listener | `before.occupation` | `D152_Patron`, `D049_Bookshelf`, `E051_WhaleOil` |
| listener | `before.place-farmer` | `A092_AdoptiveParents`, `C154_TwinResearcher`, `C158_ForestCampaigner`, `C015_Trellis`, `C160_Outrider`, `C028_TeachersDesk`, `C048_Farmstead`, `D110_FishFarmer`, `D147_TrapBuilder`, `D016_WoodenWheyBucket`, `D028_WritingDesk`, `D083_Pigswill`, `D090_PlowMaker`, `E121_HillCultivator`, `E137_FlaxFarmer`, `E141_VegetableVendor`, `E166_Roastmaster`, `E017_SkimmerPlow`, `E055_StoneWeir`, `E059_CombandCutter`, `E067_GrainBag` |
| listener | `before.plow` | `A040_PottersYard` |
| listener | `before.renovate-house` | `D014_HammerCrusher` |
| listener | `before.sow` | `A132_Publican`, `A065_SeedPellets`, `D017_DrillHarrow` |
| listener | `before.stables` | `A040_PottersYard`, `A073_AgriculturalFertilizers` |
| listener | `computeArgs.place-farmer` | `A130_MummysBoy`, `A025_Bassinet`, `A026_SleepingCorner`, `A028_ForestSchool`, `A094_LazySowman`, `B129_Seatmate`, `B151_LittlePeasant`, `C129_SecondSpouse`, `C150_ParrotBreeder`, `D112_YoungFarmer`, `D024_BrotherlyLove`, `D050_ForeignAid`, `E129_Imitator`, `E150_RockBeater`, `E021_SheepRug` |
| listener | `computeChoiceCandidates.improvement` | `C027_Blueprint`, `D131_CraftsmanshipPromoter`, `E161_ElderBaker` |
| listener | `computeChoiceCandidates.renovate-house` | `A087_Conservator`, `D013_Trowel` |
| listener | `computeCosts.construct` | `A128_RiparianBuilder`, `A149_HouseArtist`, `B126_Carpenter`, `B013_CarpentersParlor`, `C128_WoodenHutExtender`, `C088_CarpentersApprentice`, `D121_ClayPlasterer`, `E123_ResourceHoarder`, `E150_RockBeater` |
| listener | `computeCosts.fence` | `C016_FieldFences`, `C088_CarpentersApprentice`, `D082_HuntingTrophy`, `E016_BriarHedge` |
| listener | `computeCardCostCandidates.improvement` | `A027_OvenSite`, `A143_Stonecutter`, `A075_LumberMill`, `B095_MasterBricklayer`, `C122_Bricklayer`, `C027_Blueprint`, `C095_BasketWeaver`, `D117_WoodExpert`, `D095_SiteManager`, `D096_Furnisher`, `E109_BraidMaker`, `E027_PiggyBank` |
| base cost | `getBaseCosts.improvement` | `A020_DoubleTurnPlow`, `B036_Bottles` |
| listener | `computeCosts.improvement` | `D082_HuntingTrophy`, `E123_ResourceHoarder`, `E130_Overachiever` |
| listener | `computeCosts.occupation` | `B109_PaperMaker`, `B155_ArtTeacher` |
| listener | `computeCosts.plow` | `C037_DwellingMound` |
| listener | `computeCosts.renovate-house` | `B128_Plumber`, `D121_ClayPlasterer`, `D013_Trowel`, `D154_ChimneySweep`, `D081_RoofLadder`, `E123_ResourceHoarder` |
| listener | `computeCosts.stables` | `C088_CarpentersApprentice` |
| listener | `computeExchanges.*` | `C062_CookeryExtension`, `M107_PotRoastRecipe` |
| listener | `computeReplace.bake-bread` | `A097_Freshman`, `B026_AgrarianFences` |
| listener | `computeReplace.collect` | `D138_PetLover` |
| listener | `computeReplace.family-growth` | `E151_DeliveryNurse`, `E092_FieldDoctor` |
| listener | `computeReplace.gain` | `C168_AnimalCatcher` |
| listener | `computeReplace.improvement` | `B103_FieldMerchant`, `C140_PackagingArtist`, `D021_Recruitment`, `E024_Ambition` |
| listener | `computeReplace.renovate-house` | `M032_PeatHut` |
| listener | `computeReplace.sow` | `A094_LazySowman`, `B026_AgrarianFences` |
| listener | `during.improvement` | `A055_JunkRoom` |
| listener | `during.place-farmer` | `D112_YoungFarmer`, `E077_Mattock` |
| listener | `immediatelyAfter.*` | `C025_SteamMachine` |
| listener | `immediatelyAfter.collect` | `A108_MushroomCollector`, `A056_Basket`, `C036_ClayDeposit`, `C058_Woodcraft`, `E033_BeaverColony`, `E075_StoneAxe` |
| listener | `immediatelyAfter.construct` | `B132_EstateMaster` |
| listener | `immediatelyAfter.fence` | `A083_ShepherdsCrook`, `B132_EstateMaster` |
| listener | `immediatelyAfter.fencing` | `B132_EstateMaster` |
| listener | `immediatelyAfter.gain` | `A092_AdoptiveParents`, `E033_BeaverColony` |
| listener | `immediatelyAfter.improvement` | `C096_Merchant`, `D026_CarpentersYard`, `E146_Reseller` |
| listener | `immediatelyAfter.plow` | `B132_EstateMaster` |
| listener | `immediatelyAfter.reap` | `B132_EstateMaster` |
| listener | `immediatelyAfter.renovate-house` | `C144_ReedRoofRenovator` |
| listener | `immediatelyAfter.stables` | `B132_EstateMaster` |
| listener | `immediatelyAfter.trade-applied` | `C053_GypsysCrock`, `E091_PlowBuilder`, `M069_LeatherSaddle`, `M091_RoutineWork` |
| listener | `isDoable.*` | `A126_MasterWorkman` |
| listener | `isDoable.bake-bread` | `A097_Freshman`, `B026_AgrarianFences`, `B067_HandTruck`, `C060_SmallPottersOven`, `D066_PotterCeramics` |
| listener | `isDoable.collect` | `C051_FishingNet` |
| listener | `isDoable.construct` | `D119_WoodBarterer` |
| listener | `isDoable.family-growth` | `E155_Visionary` |
| listener | `isDoable.fence` | `B094_StockProtector`, `C088_CarpentersApprentice`, `D119_WoodBarterer`, `D082_HuntingTrophy`, `E074_AshTrees` |
| listener | `isDoable.fishing` | `C051_FishingNet` |
| listener | `isDoable.improvement` | `B103_FieldMerchant`, `B075_WoodWorkshop`, `C140_PackagingArtist`, `D021_Recruitment` |
| listener | `isDoable.lessons` | `B093_Confidant` |
| listener | `isDoable.lessons-3` | `B093_Confidant` |
| listener | `isDoable.lessons-4` | `B093_Confidant` |
| listener | `isDoable.occupation` | `B093_Confidant`, `D152_Patron`, `D049_Bookshelf`, `E101_Blighter` |
| listener | `isDoable.place-farmer` | `E125_DelayedWayfarer` |
| listener | `isDoable.renovate-house` | `A087_Conservator`, `D014_HammerCrusher`, `M032_PeatHut` |
| listener | `isDoable.sow` | `A065_SeedPellets`, `A094_LazySowman`, `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B026_AgrarianFences`, `B068_Beanfield`, `B072_LoveforAgriculture`, `C112_Thresher`, `C070_LettucePatch`, `D017_DrillHarrow`, `D025_WitchesDanceFloor`, `D075_WoodField`, `E068_CherryOrchard`, `E069_MelonPatch`, `E070_CropRotationField`, `E072_ArtichokeField`, `E080_RockGarden` |
| specialKind | `add-farmyard-space-state` | `M070_MoorArchaeology`, `M092_AridField`, `M095_FallowFields`, `M096_FallowLand`, `M111_NoTillFarming` |
| specialKind | `add-resource-to-space` | `C130_OutskirtsDirector`, `C093_InnerDistrictsDirector`, `D101_SugarBaker` |
| specialKind | `build-stable-on-first-empty-tile` | `E148_Lazybones` |
| specialKind | `card-field` | `C008_PlantFertilizer` |
| specialKind | `choice` | `B146_Illusionist`, `C104_Collector`, `C146_WorkshopAssistant`, `D023_PioneeringSpirit` |
| specialKind | `claim-farmyard-goods-tokens` | `M092_AridField`, `M096_FallowLand` |
| specialKind | `claim-field-goods-tokens` | `M095_FallowFields` |
| specialKind | `clear-pending-fence-bonus` | `E074_AshTrees` |
| specialKind | `consume-pending-extra-turns` | 通用 pending extra-turn 消费（C25 等） |
| specialKind | `consume-fence` | `C001_Overhaul` |
| specialKind | `consume-supply-token` | `M070_MoorArchaeology` |
| specialKind | `emit-card-triggered` | `A092_AdoptiveParents` |
| specialKind | `field` | `C008_PlantFertilizer` |
| specialKind | `grain` | `E112_GrainThief` |
| specialKind | `grow-field-and-non-field-crops` | `M112_PeatAshFertilizer` |
| specialKind | `increment-counter` | `B132_EstateMaster`, `C132_TimberShingleMaker` |
| specialKind | `increment-extra-data` | `C104_Collector`, `D134_OysterEater`, `D092_ChildOmbudsman`, `E038_RodCollection` |
| specialKind | `move-resource-between-spaces` | `E166_Roastmaster` |
| specialKind | `plant-additional-good` | `C008_PlantFertilizer` |
| specialKind | `pop-card-stack-top` | `E103_Wolf` |
| specialKind | `promote-first-newborn` | `A092_AdoptiveParents` |
| specialKind | `remove-field-crop` | `C063_CraftBrewery` |
| specialKind | `remove-field-crops` | `C057_Crudite` |
| specialKind | `remove-future-meeples` | `B076_Ceilings` |
| specialKind | `record-scoring-reserve-bonus` | `A136_DrudgeryReeve`, `C133_Soldier` |
| specialKind | `resource-quantity-select` | `B157_Salter` |
| specialKind | `resourceExchange` | `E005_NightLoot` |
| specialKind | `return-card-to-board` | `C060_SmallPottersOven` |
| specialKind | `set-counter` | `A144_Sequestrator`, `B048_ForestStone`, `C148_MudWallower`, `D158_BeanCounter` |
| specialKind | `set-extra-data` | `A068_AsparagusGift`, `A073_AgriculturalFertilizers`, `A092_AdoptiveParents`, `A177_Middleman`, `B124_Trimmer`, `B132_EstateMaster`, `B137_Wholesaler`, `B021_HayloftBarn`, `B034_SpecialFood`, `B048_ForestStone`, `B055_MaintenancePremium`, `B093_Confidant`, `C150_ParrotBreeder`, `C016_FieldFences`, `C048_Farmstead`, `C053_GypsysCrock`, `D156_RetailDealer`, `D036_BreedRegistry`, `D056_FatstockStretcher`, `D074_RoyalWood`, `E148_Lazybones`, `E149_MidnightFencer`, `E051_WhaleOil`, `E053_BoarSpear`, `E058_LunchtimeBeer`, `E085_MasterTanner`, `E091_PlowBuilder`, `M091_RoutineWork` |
| specialKind | `set-flag` | `A130_MummysBoy`, `A153_PigOwner`, `A017_ReclamationPlow`, `A018_WheelPlow`, `A045_FireProtectionPond`, `A097_Freshman`, `B124_Trimmer`, `B140_FarmyardWorker`, `B154_SheepKeeper`, `B163_Pastor`, `B024_Lasso`, `B034_SpecialFood`, `B035_HookKnife`, `B076_Ceilings`, `B085_FarmHand`, `C101_StallHolder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C042_RavenousHunger`, `C046_Mandoline`, `C051_FishingNet`, `C064_CornSchnappsDistillery`, `C084_PerennialRye`, `C085_DenBuilder`, `C087_Mason`, `C094_StableCleaner`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D027_Retraining`, `D046_PelletPress`, `D053_TeaHouse`, `D087_MasterBuilder`, `D093_SheepInspector`, `E013_StoneHouseReconstruction`, `E146_Reseller`, `E151_DeliveryNurse`, `E022_GuestRoom`, `E027_PiggyBank`, `E062_SourDough`, `E091_PlowBuilder`, `E092_FieldDoctor` |
| specialKind | `set-infobox` | `A017_ReclamationPlow`, `B021_HayloftBarn`, `B048_ForestStone`, `B055_MaintenancePremium`, `C115_Sower`, `C148_MudWallower`, `D126_FieldCultivator`, `D036_BreedRegistry`, `E110_Dentist`, `E022_GuestRoom`, `E027_PiggyBank`, `E051_WhaleOil`, `E074_AshTrees` |
| specialKind | `stone` | `C006_StoneClearing` |
| specialKind | `swap-improvement-with-board` | `D027_Retraining` |
| specialKind | `vegetable` | `A113_HeresyTeacher` |

## 11. 源码排除项

| 来源 | 原因 |
|---|---|
| `C054_MarketStall` | `C054_MarketBooth` 的 BGA legacy 源文件。 |
| `C071_SlurrySpreader` | `C071_Slurry` 的 BGA legacy/错误命名源文件。 |
| `D011_LawnFertilzer` | `D011_LawnFertilizer` 的 BGA typo 源文件。 |
| `E132_Shearer` | `E132_VeggieLover` 的 BGA legacy 源文件。 |
| BGA `implemented=false` 且无运行时行为的卡牌 | 除非 OA 明确作为产品扩展实现，否则排除出行为对齐范围。 |

## 12. 单卡附录

状态值：`已对齐`、`已接受差异`、`需复核`、`排除`。

`需复核` 表示未对齐：已经发现 BGA 差异或高置信行为风险，需要修复或补测试确认后才能改为 `已对齐`；它不是“已接受差异”。

| 卡牌 | 状态 | 备注 |
|---|---|---|
| `M015_PeatBurnOff` | 已对齐 | onBuy 得 1 fuel，并可按 moor-to-field adjacency 规则把 1 个 visible moor 换成 field。 |
| `M016_ClearFelling` | 已对齐 | 前置 at most 3 forests；onBuy 得 2 wood，并可把最多 2 个 visible forest 改成 moor。 |
| `M017_Reforestation` | 已对齐 | onBuy 在 unused farmyard 放置 1 个 forest。 |
| `M021_PeatCuttingExpedition` | 已对齐 | 支付 4 food；可移除任意 visible moors，每个给 2 fuel 和 1 bonus VP；每 2 匹 horse 额外给 1 fuel。 |
| `M023_EdgeOfTheForest` | 已对齐 | onBuy 用 terrain-adjacency helper 统计 fenced forest-field edge 得 food、fenced forest-moor edge 得 fuel；重复 fence segment 不重复计数。 |
| `M036_PeatMoss` | 已对齐 | no visible moors 前置；木房建房成本通过 construct `scope:'unit'` trade modifier 降为每房 3 wood + 1 reed。 |
| `M037_BuildingPlan` | 已对齐 | 每次一次建至少 2 rooms 后，可选以 `trueAction:false` 建最多 2 个免费 stables。 |
| `M038_NatureReserve` | 已对齐 | onBuy 通过 `fencePolicy` 免费围住 1 个含 visible/Covered terrain 且邻接既有 pasture 的格；terrain 全清前只记录在本卡 `cardStates`，清空后转为普通 pasture；Slash and Burn 形成的 field 不会转为 pasture。 |
| `M039_SpecialPasture` | 已对齐 | onBuy 通过 `fencePolicy.connectionPolicy:'allowDisconnected'` 免费围 1 个不邻接既有 pasture 的单格，且限制为 4 根 fence；后续普通 fence 仍使用默认连接规则。 |
| `M040_MoorFire` | 已对齐 | 前置 2 moors；只在剩 1 个 visible moor 时暴露 anytime moor-to-field flow。 |
| `M041_CattleCollar` | 已对齐 | round 8+ 前置；Farmland / Cultivation / Slash and Burn 后如有 cattle，可选额外 `plow`。 |
| `M042_DeepPlow` | 已对齐 | 前置 2 improvements；onBuy 可放 1 个 moor；使用 Farmland / Cultivation 后可按 adjacency 规则把 1 个 moor 换成 field。 |
| `M043_WildFields` | 已对齐 | onBuy 提供最多 2 次 optional plow，使用 `adjacencyPolicy:'notAdjacentToFields'` 只允许非邻接 field；后续普通 plow 仍按默认邻接。 |
| `M044_Swamp` | 已对齐 | 前置 round <= 4；onBuy 预约 round 12 的 optional moor future terrain token。 |
| `M045_TreeNursery` | 已对齐 | no improvements 前置；onBuy 预约 round 12 / 13 的 optional forest future terrain token。 |
| `M046_Thicket` | 已对齐 | 4 visible forests 前置；onBuy 可选择最多 2 个 visible forest，在其上放 1 个 visible forest，原 terrain 作为 Covered Farm Terrain；Slash and Burn 不可用，Fell Trees 移除 top 后 reveal covered terrain 且不触发 cleared-space token。 |
| `M047_BogForest` | 已对齐 | 3 improvements 前置；onBuy 可选择任意数量 visible moor，在其上放 1 个 visible forest，原 moor 作为 Covered Farm Terrain；covered moor 不参与 visible moor、Cut Peat 或 Slash and Burn，Fell Trees 后 reveal。 |
| `M048_ForestSwamp` | 已对齐 | Cut Peat 后预约 current round + 4 的 optional forest future terrain token，超过 round 14 不预约。 |
| `M049_SurveyorsMap` | 已对齐 | 前置 round <= 2；onBuy 预约 round 11 field、round 12 moor、round 13 forest future terrain token。 |
| `M050_FarmExtension` | 已对齐 | onBuy 通过 farm-position selection 在现有农场边缘放置相邻 2 格 farmyard extension；新增格写入 `player.farmyardExtensions`，后续 used/unused、plow、fence、terrain、scoring 和 FarmBoard 均按真实坐标读取。 |
| `M051_MoorEnclosures` | 已对齐 | clay house 前置；onBuy 放置相邻 2 格 farmyard extension，并在新格各放 1 个 visible moor；session 测试覆盖扩展、moor 占用和非法重叠拒绝。 |
| `M054_AgriculturalImplement` | 已对齐 | Farmland / Cultivation 后可拿一张 face-up special action card；market card 免费，对手 face-up card 付 2 food。 |
| `M055_ToolShed` | 已对齐 | 每轮一次，Cut Peat / Slash and Burn 后可执行另一种 special action，不移动额外 worker 或 special action card。 |
| `M058_PeatFertilizer` | 已对齐 | 2+ fields 前置；Cut Peat 后可选普通 `sow`，复用 sow farm interaction。 |
| `M059_NaturesFertilizer` | 已对齐 | Slash and Burn 或小改良把 moor 换 field 后，可选只在新 field sow；通过 `allowedFields:'fromSelectedFields'` 同时排除普通旧田和 card field。 |
| `M060_SowingMachine` | 已对齐 | 1 horse 前置；任意 FoM special action 后若最终有 2+ horses 可选 `sow`；Horse Market 路径按动物重整后的 horse count 再检查；Black Market / Illicit Work follow-up 前冻结 listener 名单，follow-up 新买的本卡不会追溯触发同一次 special action。 |
| `M061_HayWagon` | 已对齐 | 2 horses 前置；从 accumulation space 拿 wood 3 / clay 3 / reed 2 / stone 2 后，可选 `trueAction:false` Build Rooms 或 Renovation，不额外消耗工人。 |
| `M066_LandParcel` | 已对齐 | 前置 at most 2 improvements；onBuy 放 1 个 forest；按 unused farmyard spaces 1/2/3+ 计 +2/-1/-3 card bonus VP。 |
| `M103_ForestKindergarten` | 已对齐 | 前置 at most 3 forests；after family-growth listener 按 visible forest count 给 food，覆盖有房 / 无房 family growth，非 family-growth 不触发。 |
| `M088_PeatIron` | 已对齐 | 收获开始时拥有至少 2 个 visible moors 得 1 fuel；少于 2 个不触发。 |
| `M089_BirthingHouse` | 已对齐 | Family Growth with/without room 后得 1 fuel、1 food、1 bonus VP；非 family-growth 行动不触发。 |
| `M090_WinterStorehouse` | 已对齐 | onBuy 初始化 3 个 usage counters；anytime 消耗 1 个 counter，把 fuel / food 补到至少 2；counter 用尽或无需补给时不暴露。 |
| `M091_RoutineWork` | 已对齐 | harvest-local 记录本 harvest 已用来把 building resource 换 food 的 craft building；feeding 末每个未用 craft building 可选 1 fuel 或 1 food。 |
| `M098_FishSmokehouse` | 已对齐 | Fishing collect 后可选支付 1 fuel 得 3 food；无 fuel 时不出现 optional pending。 |
| `M125_HardwareStore` | 已对齐 | onBuy 初始化 3 个 usage counters；anytime 消耗 1 个 counter，获得每种当前为 0 的 building resource 各 1 个；无缺口或 counter 用尽时不暴露。 |
| `M126_CooperativeStore` | 已对齐 | onBuy 初始化 4 个 usage counters；anytime 消耗 1 个 counter 和 1 个 building resource，换任意其他非 stone building resource；counter 用尽或无可付资源时不暴露。 |
| `A001_Shelter` | 已对齐 |  |
| `A002_ShiftingCultivation` | 已对齐 |  |
| `A003_PaperKnife` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `A004_Baseboards` | 已对齐 |  |
| `A005_ClayEmbankment` | 已对齐 |  |
| `A006_StorageBarn` | 已对齐 |  |
| `A007_GardenersKnife` | 已对齐 |  |
| `A008_FoodBasket` | 已对齐 |  |
| `A009_YoungAnimalMarket` | 已对齐 |  |
| `A010_WoodenShed` | 已对齐 |  |
| `A011_MudPatch` | 已对齐 |  |
| `A012_DrinkingTrough` | 已对齐 | pasture capacity additive 走 `computePastureCapacityModifiers`，在 replacement 后应用。 |
| `A013_RenovationCompany` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修。 |
| `A014_CarpentersHammer` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A015_CarpentersAxe` | 已对齐 |  |
| `A016_RammedClay` | 已对齐 | fence clay-for-wood 走 `scope:'unit'` trade，先生成 BGA `addCost` clay cost row，再允许 D88 等 bonus choice 继续替换。 |
| `A017_ReclamationPlow` | 已对齐 |  |
| `A018_WheelPlow` | 已对齐 |  |
| `A019_Handplow` | 已对齐 |  |
| `A020_DoubleTurnPlow` | 已对齐 | BGA `getBaseCosts()` 对齐为 `CardImpl.getBaseCosts()`，round > 3 时在进入 card-purchase pipeline 前生成 `{grain:1, food:1}` base candidate；不再用 `computeCosts.improvement` modifier 表达。 |
| `A021_FamilyFriendHome` | 已对齐 |  |
| `A022_Telegram` | 已对齐 | turn-start optional extraPlacement 的 skip/use session 路径已覆盖，行为等价于 BGA flag 后并入放人选择 |
| `A023_StoneCompany` | 已对齐 |  |
| `A024_ThreshingBoard` | 已对齐 |  |
| `A025_Bassinet` | 已对齐 |  |
| `A026_SleepingCorner` | 已对齐 |  |
| `A027_OvenSite` | 已对齐 | prerequisite 改用 `fireplaceIdentity` / `cookingHearthIdentity` played-card capability；不再直接枚举 A060_OrientalFireplace。onBuy 期间购买 Clay/Stone Oven 的 1 clay + 1 stone 固定价改走 card-purchase candidate replacement，不保留 printed oven cost candidate。 |
| `A028_ForestSchool` | 已对齐 |  |
| `A029_AleBenches` | 已对齐 |  |
| `A030_BakingSheet` | 已对齐 |  |
| `A031_DebtSecurity` | 已对齐 |  |
| `A032_Manger` | 已对齐 |  |
| `A033_BigCountry` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A034_Loppers` | 已对齐 |  |
| `A035_SwimmingClass` | 已对齐 |  |
| `A036_FacadesCarving` | 已对齐 |  |
| `A037_Bucksaw` | 已对齐 |  |
| `A038_WoolBlankets` | 已对齐 |  |
| `A039_Chapel` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A040_PottersYard` | 已对齐 |  |
| `A041_VegetableSlicer` | 已对齐 |  |
| `A042_ForestLakeHut` | 已对齐 |  |
| `A043_FarmyardManure` | 已对齐 |  |
| `A044_PondHut` | 已对齐 |  |
| `A045_FireProtectionPond` | 已对齐 |  |
| `A046_ClawKnife` | 已对齐 |  |
| `A047_Trellises` | 已对齐 |  |
| `A048_ShavingHorse` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A049_NestSite` | 已对齐 |  |
| `A050_MilkJug` | 已对齐 |  |
| `A051_DriftNetBoat` | 已对齐 |  |
| `A052_ThrowingAxe` | 已对齐 |  |
| `A053_Claypipe` | 已对齐 |  |
| `A054_Credit` | 已对齐 |  |
| `A055_JunkRoom` | 已对齐 |  |
| `A056_Basket` | 已对齐 |  |
| `A057_MilkingParlor` | 已对齐 |  |
| `A058_AsparagusKnife` | 已对齐 |  |
| `A059_PotatoRidger` | 已对齐 |  |
| `A060_OrientalFireplace` | 已对齐 |  |
| `A061_WinnowingFan` | 已对齐 |  |
| `A062_BeerKeg` | 已对齐 |  |
| `A063_DutchWindmill` | 已对齐 |  |
| `A064_BarleyMill` | 已对齐 |  |
| `A065_SeedPellets` | 已对齐 |  |
| `A066_FeedingDish` | 已对齐 |  |
| `A067_CornScoop` | 已对齐 |  |
| `A068_AsparagusGift` | 已对齐 |  |
| `A069_LargeGreenhouse` | 已对齐 |  |
| `A070_LiftingMachine` | 已对齐 |  |
| `A071_ClearingSpade` | 已对齐 |  |
| `A072_CalciumFertilizers` | 已对齐 |  |
| `A073_AgriculturalFertilizers` | 已对齐 |  |
| `A074_StableTree` | 已对齐 |  |
| `A075_LumberMill` | 已对齐 | improvement wood 折扣走 card-purchase candidate derivation；resolver 层保留原始候选并追加 sourced discounted candidate，支付层再由 dominance 隐藏严格劣势原价支付项。 |
| `A076_Cob` | 已对齐 |  |
| `A077_Hod` | 已对齐 |  |
| `A078_Canoe` | 已对齐 |  |
| `A079_GardenHoe` | 已对齐 |  |
| `A080_StoneTongs` | 已对齐 |  |
| `A081_InterimStorage` | 已对齐 |  |
| `A082_WorkCertificate` | 已接受差异 | BGA banned，但 OA 按产品策略保留；runtime 使用共享 partial-take helper 从 accumulation space 移除资源 |
| `A083_ShepherdsCrook` | 已对齐 |  |
| `A084_Silage` | 已对齐 |  |
| `A085_Homekeeper` | 已对齐 |  |
| `A086_AnimalTamer` | 已对齐 |  |
| `A087_Conservator` | 已对齐 |  |
| `A088_HedgeKeeper` | 已对齐 |  |
| `A089_StablePlanner` | 已对齐 |  |
| `A090_PlowDriver` | 已对齐 |  |
| `A091_ShiftingCultivator` | 已对齐 |  |
| `A092_AdoptiveParents` | 已对齐 | BGA pull model：玩家普通工人耗尽但仍持未激活后代时 `contributeExtraTurn` 贡献一次额外放工 XOR[use, forfeit]（#203+#204）；A92 own-prompt anytime suppression、stacked/beyond-player-count skip per-opportunity consumption、failed/auto-resolved/pending-context target rollback by placedWorkerId、forfeit visible log、多 newborn / adult-feeding 覆盖已补齐 |
| `A093_BedMaker` | 已对齐 |  |
| `A094_LazySowman` | 已对齐 |  |
| `A095_Angler` | 已对齐 |  |
| `A096_TaskArtisan` | 已对齐 |  |
| `A097_Freshman` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A098_StableArchitect` | 已对齐 |  |
| `A099_FellowGrazer` | 已对齐 |  |
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
| `A169_OffSiter` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。统计 owner 已建 major improvement 与 alsoCountsAs major 小改的 printed wood/clay/reed/stone cost（含 fee cost），总数首次达到 9+ 后锁定提供 1 extra room capacity。 |
| `A170_Hayward` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 可在 fencing legal 时通过 anytime action 触发普通 fence flow，不放置工人；该实现仍保留普通 fence listener 语义。 |
| `A171_Sidekick` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 在版图行动格放人后，可选支付 1 food，通过 `place-farmer-on-space` 在物理左邻行动格放置另一个可用工人并执行目标行动；左邻按当前玩家数版图坐标解析，包含 round action card 与固定/扩展行动格，不跳过未揭示 round slot；target doability 按预留/支付该 1 food 后的资源判断，并复用 flow child doability 覆盖目标行动的 hook/listener veto，避免付费后目标行动无可执行选项；每步目标行动完成后再激活 cascaded after-place-farmer listener，继续向左检查，停止于无左邻、无 food、无工人、目标 occupied / blocked / 未开放 / 不可执行或 `sidekickChain` 已访问。 |
| `A172_BoatPainter` | 已对齐 | 5+ 产品扩展实现：work phase return home 前，Fishing 与 Traveling Players（含 5-6 扩展格）均被占用时，选择 1 grain 或 2 food。 |
| `A173_ClayThief` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。round start 资源累积后若 hollow-56 有 clay 且未使用，可选标记 used / 更新 infobox，并收取 hollow-56 当前全部 clay；无 clay 或已 used 不触发。 |
| `A174_MasterHora` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 在六个 5/6 灰色农夫 linked extension spaces 放人前（含 card-granted extra `place-farmer` 目标选择）可选 1 food -> 1 vegetable；不做单卡支付后宿主可执行性预检查，若 before flow 后宿主行动异常不可执行，进入 engine-blocked undo-only 状态。 |
| `A175_HollowGardener` | 已对齐 | 5+ 产品扩展实现：after collect 读取 Hollow（含 hollow-56）实际 clay provenance，3-5 clay 给 grain，6+ clay 给 vegetable。 |
| `A176_Wheelmaker` | 已对齐 | 5+ 产品扩展实现：onBuy 要求已有另一个职业，且自身 wood 严格大于其他玩家合计 wood，低于 15 时补到 15。 |
| `A177_Middleman` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。打出时在当前 meeple-symbol extension spaces 放置 owner-only 1 stone + 1 food 附件；owner 后续精确使用该行动格时领取并清除该格附件，linked partner 不隐式领取，非 owner 不领取也不消耗；前端仅渲染后端序列化的附件资源和 owner hover 文本。 |
| `A178_CarpentersBoy` | 已对齐 | 5+ 产品扩展实现：opponent construct 后按本次建房数量给 owner 同等 wood。 |
| `A179_MountainShepherd` | 已对齐 | 5+ 产品扩展实现：使用任一 Quarry 后获得 1 sheep。 |
| `A180_AnimalBrander` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。animal-market-56 各原动物分支在本地 flow 表达；owner 选择具体分支并完成原结果后，可选额外付 1 food 重放同一 option。cattle 分支本地 pay/gain，不再注册独立 action；接受后总付 3 food 得 2 cattle，跳过则只保留原结果。 |
| `B001_UpscaleLifestyle` | 已对齐 | 即时翻修子行动使用当前 `renovate-house` action id。 |
| `B002_MiniPasture` | 已对齐 | BGA `formatCost([WOOD => 0])` / `miniPasture` 通过 nested `fencePolicy` 表达免费 fence、最多 4 段总 fence、恰好 1 个 1 格新牧场，不走 `fencing` wrapper 丢 params。 |
| `B003_Moonshine` | 已对齐 |  |
| `B004_WoodPile` | 已对齐 |  |
| `B005_StoreofExperience` | 已对齐 |  |
| `B006_ExcursiontotheQuarry` | 已对齐 |  |
| `B007_Wage` | 已对齐 |  |
| `B008_MarketStall` | 已对齐 |  |
| `B009_BeatingRod` | 已对齐 |  |
| `B010_Caravan` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B011_Feedyard` | 已对齐 |  |
| `B012_Stockyard` | 已对齐 |  |
| `B013_CarpentersParlor` | 已对齐 | 木房固定 2 wood + 2 reed 建房成本走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 候选。 |
| `B014_Hawktower` | 已对齐 |  |
| `B015_CarpentersBench` | 已接受差异 | BGA banned，但 OA 按产品策略保留；BGA `formatCost([WOOD => 1])` / `max` / `benchWood` 通过 `reserve-fence-bonus` + nested `fencePolicy` 表达：只建普通 fence、恰好 1 个新牧场、1 段免费，并用 `paymentBudget: { wood: collectedWood }` 限制最终实付普通 wood；通过 `fencePolicy.promptHintKey` 给前端提示“只能 1 个新牧场”；不注册全局 `fencing` 折扣，避免和 E16/C16 等 `computeCosts.fence` 再次叠加；不再用 `collectedWood + 1` 段数上限裁剪合法形状。 |
| `B016_MiningHammer` | 已对齐 | onBuy 使用 CardEffect；翻修后仍监听 `after.renovate-house` 并免费建 1 个 stable |
| `B017_ForestPlow` | 已对齐 |  |
| `B018_GrasslandHarrow` | 已对齐 |  |
| `B019_MoldboardPlow` | 已对齐 | optional extra plow 先执行 `plow`，成功后再 `pop-card-stack`；optional 跳过走 `__skip__`，接受后 `plow` confirm-only 且 direct `cancel` 被通用 guard 拒绝 |
| `B020_ChainFloat` | 已对齐 |  |
| `B021_HayloftBarn` | 已接受差异 | BGA banned，但 OA 按产品策略保留；通过 resource exchange 获得的 grain 已由 provenance helper 触发；空卡 family-growth 使用 `hasInactiveWorkerInSupply`，不会在仅剩 removed worker 时暴露生人 flow |
| `B022_WalkingBoots` | 已接受差异 | BGA banned，但 OA 按产品策略保留；临时 from-supply worker 归还时标记 `removedFromSupply`，后续 family-growth supply 与玩家面板家庭成员上限都不再计入该 token |
| `B023_FinalScenario` | 已对齐 | 第 14 轮行动 reveal / exclusive gate / clear event 已由后端权威建模 |
| `B024_Lasso` | 已对齐 | 任意首次放人后先用 placement availability 计算合法 second-placement target；非动物市场首放仅在有合法动物市场时触发，动物市场首放仅在有任意合法 target 时触发，并经通用 target action flow 执行目标行动 |
| `B025_BreadPaddle` | 已对齐 |  |
| `B026_AgrarianFences` | 已对齐 |  |
| `B027_Toolbox` | 已对齐 | 重审未见实质行为差异；建 room/stable/fence 后可买 Joinery/Pottery/Basket，子行动 `trueAction=false` |
| `B028_ForestryStudies` | 已对齐 |  |
| `B029_CookeryLesson` | 已对齐 | lessons-3 行动格覆盖已由共享 lessons-space helper 对齐 |
| `B030_WoodPalisades` | 已对齐 |  |
| `B031_PotteryYard` | 已对齐 | prerequisite 改用 `potteryIdentity` played-card capability；D060_LargePottery 通过 dual-type major 身份参与判断。 |
| `B032_Kettle` | 已对齐 |  |
| `B033_Mantlepiece` | 已对齐 | desc/cost/vp/prereq/onBuy 得分对齐；BGA/OA 均未见 runtime 禁止 renovate 逻辑 |
| `B034_SpecialFood` | 已对齐 | 行动格动物 provenance 已收敛到 `sumActionSpaceMovedToTriggerPlayer()`；保留动物检查改用 assigned animal 口径，bonus VP 只记一次并在牌面显示累计值 |
| `B035_HookKnife` | 已对齐 |  |
| `B036_Bottles` | 已对齐 | BGA `getBaseCosts()` 对齐为 `CardImpl.getBaseCosts()`，按当前 family size 在进入 card-purchase pipeline 前生成 `{clay:N, food:N}` base candidate；不再用 `computeCosts.improvement` modifier 表达。 |
| `B037_Grange` | 已对齐 |  |
| `B038_FutureBuildingSite` | 已对齐 |  |
| `B039_Loom` | 已对齐 |  |
| `B040_BreweryPond` | 已对齐 |  |
| `B041_Hauberg` | 已对齐 |  |
| `B042_ForestInn` | 已对齐 |  |
| `B043_Chophouse` | 已对齐 |  |
| `B044_ChickStable` | 已对齐 |  |
| `B045_StrawberryPatch` | 已对齐 |  |
| `B046_ClubHouse` | 已对齐 |  |
| `B047_HerringPot` | 已对齐 |  |
| `B048_ForestStone` | 已对齐 |  |
| `B049_Scales` | 已对齐 | `after.occupation` / `after.improvement` 用 trigger snapshot helper 判断触发时职业/改良平衡；连续打职业/改良导致 live count 改变时仍按触发帧结算。 |
| `B050_ButterChurn` | 已对齐 |  |
| `B051_DiggingSpade` | 已对齐 |  |
| `B052_GrowingFarm` | 已对齐 |  |
| `B053_SculptureCourse` | 已对齐 |  |
| `B054_Tumbrel` | 已对齐 | #186 sow 后“每座畜栏 1 food”改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`） |
| `B055_MaintenancePremium` | 已对齐 |  |
| `B056_Brook` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B057_Scullery` | 已对齐 |  |
| `B058_CrackWeeder` | 已对齐 |  |
| `B059_FoodChest` | 已对齐 |  |
| `B060_BrewingWater` | 已对齐 |  |
| `B061_ThreeFieldRotation` | 已对齐 |  |
| `B062_Pitchfork` | 已对齐 |  |
| `B063_Tasting` | 已对齐 | lessons-3 行动格覆盖已由共享 lessons-space helper 对齐 |
| `B064_MillWheel` | 已对齐 |  |
| `B065_GrainDepot` | 已对齐 | wood/clay/stone base paths 作为 card-purchase candidates 进入 ComputeCardCosts；派生候选支付后 onBuy 使用 `originalFeeIndex` 保持原路径身份，wood/clay/stone 仍分别排 2/3/4 个 future grain。 |
| `B066_SackCart` | 已对齐 |  |
| `B067_HandTruck` | 已对齐 | bake 前先 optional gain grain，随后保留 mandatory bake continuation；无 bake provider 时不触发 |
| `B068_Beanfield` | 已对齐 |  |
| `B069_PottersMarket` | 已对齐 |  |
| `B070_NewPurchase` | 已对齐 |  |
| `B071_HarvestHouse` | 已对齐 |  |
| `B072_LoveforAgriculture` | 已对齐 | 已播种 pasture 的容量扣减走 additive pasture capacity modifier；即使 B72 先打出，也在 D11 replacement / A12 additive 后按 modifier 顺序计算。 |
| `B073_GiftBasket` | 已对齐 |  |
| `B074_ThickForest` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B075_WoodWorkshop` | 已对齐 | 使用通用 before-reachability opt-in；B75 session 覆盖 gain wood 后打出小改、经 A48 转换后打出 food-cost 小改，以及最终仍不可达时 engine-blocked / undo-only |
| `B076_Ceilings` | 已对齐 |  |
| `B077_LoamPit` | 已对齐 |  |
| `B078_ReedBelt` | 已对齐 |  |
| `B079_Corf` | 已对齐 |  |
| `B080_HardPorcelain` | 已对齐 |  |
| `B081_Handcart` | 已对齐 | 使用共享 partial-take helper 生成 `collect` leaf，从 accumulation space 移除 1 个资源并记录 `resource.moved` 来源 |
| `B082_ValueAssets` | 已对齐 |  |
| `B083_MuddyPuddles` | 已对齐 |  |
| `B084_AcornsBasket` | 已对齐 |  |
| `B085_FarmHand` | 已接受差异 | FarmHand stable 通过 Farm Expansion 的 `stables` leaf wrapper（`actionContext.farmHand`）进入共享 stables 付费 / `farm.stableBuilt` 事件 / after-stables listener 链路，cost = 2 wood 并随 C88 等折扣统一生效；OA 允许同一次 stables leaf 混合建造普通 stable 与 FarmHand 特殊 stable。差异：FarmHand 位置不进 `stableTiles`（不计入动物 zone / loose stable 容量），仅经 `computeExtraRoomCapacity` +1 住房，stable count 口径由 `shared/domain/stables.ts` 单独派生。`farm.stableBuilt` item 加 `kind: 'normal' \| 'special'`，special 带 `sourceCardId`。Return-stable（D102 / E76 经 `stable-removal` helper）把 FarmHand 列为候选并清 `extraData.position`、释放 1 个 stable supply、住房容量回 0，但保留 `flagged`（once-per-game，回收后不再 offer），不产生动物重整 flow。前端接线（#189 P1-1）：`useFarmSelection` 加 `pendingFarmHand` 状态（最多 1 个特殊位点）；FarmBoard 把 farm-select 的 `farmHandPositions` 渲染为可点击目标；InteractionBar confirm 在 `pendingStableTilesLength === 0 && !pendingFarmHand` 才禁用（只选 FarmHand 也可确认）；提交经 `buildStableCommitPayload` 走 `commitSelection({ stables, farmHand })`。UI 候选/选中态（#199）：候选不再标在 2×2 左上角田格，而是渲染在 2×2 几何中心的 `post` cell（纯函数 `client/components/board/farmHandCenter.ts` 做 top-left↔center-post 坐标映射），用半透明紫色中心框 overlay（`.farmhand-center-overlay`，热区 ≈0.7×`--tile` 易点、不抢外圈普通 stable 候选），点中心经 `toggleFarmHand(top-left)`，选中加粗实心框。已建常驻态（#200）：后端通用 card-effect hook `getBuiltSpecialStables(player)` + 聚合 `collectBuiltSpecialStables` 派生 snapshot 展示字段 `SerializedPlayerState.specialStables`（不进领域顶层、`rehydrateState` 剥离）；前端 `GameContainerApi` 从 `displayPlayer.specialStables` 派生 built top-left 集合传给 FarmBoard，在 2×2 中心 post 渲染 `.farmhand-center-built` 常驻 stable 图标（无脉动、不可再选），随 snapshot 自然更新——D102/E76 回收后 `specialStables` 空、overlay 消失。2026-05-30 UI 修正：InteractionBar 摘要把 FarmHand 计入 selected 并显示 `Max +` 语义；farm post 父级不再用 `opacity: 0` 隐藏自身；选择态只显示中心框、不显示 stable 图标，建成态只显示 stable 图标、不保留选择框；`farm.stableBuilt` 高亮跳过 `kind:'special'`，避免把 top-left 存储坐标高亮成普通田格。前端零单卡耦合（不读 `cardStates['B085_FarmHand']`、不 import `shared/cards`）。 |
| `B086_TruffleSearcher` | 已对齐 |  |
| `B087_Cottager` | 已对齐 |  |
| `B088_EstablishedPerson` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修；后续 ordinary fence 直接走 `fence`。 |
| `B089_Groom` | 已对齐 |  |
| `B090_CooperativePlower` | 已对齐 |  |
| `B091_AssistantTiller` | 已对齐 |  |
| `B092_LittleStickKnitter` | 已对齐 |  |
| `B093_Confidant` | 已对齐 | onBuy 必须选择 2/3/4 个未来 round 之一；`isDoable.occupation` 按可选 occupation 支付方案过滤，并通过 `reserveResources` 要求职业支付后仍有最低 2 个真实 food 支付 future schedule；`isDoable.lessons*` 在 B93 是唯一且不可支付的职业时 veto lessons action space，避免占格后无职业可打；future receive 后可选 `sow` 或 `fence`，其中 BGA `formatCost([WOOD => 1])` 通过 nested `fencePolicy.costPolicy` 显式表达，并继续叠加 E16 / C16 等 `computeCosts.fence` 折扣。 |
| `B094_StockProtector` | 已对齐 |  |
| `B095_MasterBricklayer` | 已对齐 | major-only stone 折扣走 `computeCardCostCandidates`，按当前房间数追加 sourced candidates；minor improvement 不产生 candidate pipeline 输出。 |
| `B096_TreeFarmJoiner` | 已对齐 | future wood 到期走通用 Future Receive；卡内 `after.receive` listener 检查本卡来源 wood 后追加 optional `minor-improvement`，不在 round-start 核心路径写单卡分支。 |
| `B097_Scholar` | 已对齐 |  |
| `B098_OrganicFarmer` | 已对齐 |  |
| `B099_Tutor` | 已对齐 |  |
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
| `B167_StableSergeant` | 已对齐 | onBuy 使用共享最终总量动物容纳 helper；不能同时容纳 sheep / boar / cattle 时不弹支付奖励 flow。 |
| `B168_PastureMaster` | 已对齐 |  |
| `B169_LivestockSustainer` | 已对齐 | 5+ 产品扩展实现：按其他玩家当前 major identity 数量提供混养 animal-holder card zone，含 `alsoCountsAs: ['major']` 的 minor，不计 owner 自己的 major，容量上限 8，major 离场后动态缩容；animal zone 计算只读回显 `animalCounts`，animal reorg 后从通用 card-zone `animalCounts` 恢复各物种，容量归零或缩容后的失效存储在 reorg 写回时清理。 |
| `B170_CorralBuilder` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。Pig Market / Cattle Market reveal 的 round start 独立触发，可选执行 B2-style 免费恰好 1 格牧场 non-action fence flow；若一格牧场非法则不补偿。 |
| `B171_GreenhouseBuilder` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。注册 owner-only dynamic action space，只按当前 round 之前已 reveal 且 owner 可执行的 `fencing` / `house-redevelopment` / `vegetable-seeds` printed spaces 暴露对应分支。 |
| `B172_CattleCaregiver` | 已对齐 | 5+ 产品扩展实现：round start 按当前可见且归一化后的动物区域和 animal-holder card zone 统计拥有 cattle 的玩家，3/4/5+ 人分别给 1/2/3 food。 |
| `B173_Sweeper` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 使用 meeple-symbol extension space 后通过 shared stored-food cashout helper 在卡上放 1 food；一次性 anytime cashout 取走卡上 food、标记 used，职业仍计为已打出且后续不再累计。 |
| `B174_RiverbankGardener` | 已对齐 | 5+ 产品扩展实现：Riverbank Forest collect 后额外获得 1 vegetable。 |
| `B175_FieldOverseer` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。harvest field phase 结束时只统计其他玩家 `harvestReapSummary` 中的 grain field 数，3/4/6+ 按最高阈值给 food/grain/vegetable。 |
| `B176_VillageIdiot` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。通过 hand/played `occupation.isDoable` 与 `providesOccupation` minor 拦截保证其必须是且保持为 lone occupation，并在 opponent 使用 `meeting-place` 后给 owner 1 wood + 1 food。 |
| `B177_StoneClawer` | 已对齐 | 5+ 产品扩展实现：每个成功 plow leaf 结算后给 1 stone。 |
| `B178_TagAlong` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。对手使用 Resource Market 变体后，owner 可选通过 `place-farmer-on-space` 把可用工人放到同一 occupied action space 并执行该行动；owner 自己使用、非 Resource Market、无可用工人或目标 blocked / 不可执行时不触发。 |
| `B179_WildBoarHunter` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。return home 前按实际 `takenBy` 占用统计 wood accumulation spaces，3+ 且 owner 有 wood 时可选 1 wood -> 1 boar。 |
| `B180_GameTeaser` | 已对齐 | 5+ 产品扩展实现：只统计从 food accumulation space 本身移动的 food，1/2/3 food 分别给 cattle/boar/sheep，4+ 不触发。 |
| `C001_Overhaul` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理；rebuild 只计数/回收/重建 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy` |
| `C002_Stable` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 `stables` `actionContext.exactCost` 表达免费 stable。 |
| `C003_CarriageTrip` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C004_WritingBoards` | 已对齐 |  |
| `C005_Remodeling` | 已对齐 |  |
| `C006_StoneClearing` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `C007_BladeShears` | 已对齐 |  |
| `C008_PlantFertilizer` | 已对齐 |  |
| `C009_AutomaticWaterTrough` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理；可购买动物候选使用共享最终总量动物容纳 helper。 |
| `C010_BunkBeds` | 已对齐 |  |
| `C011_WildlifeReserve` | 已对齐 | Farmers of the Moor 启用时仍只允许 sheep / boar / cattle 各 1，horse 会被 card-zone invalid-animal 校验拒绝。 |
| `C012_CattleFarm` | 已对齐 |  |
| `C013_WoodSlideHammer` | 已对齐 | wood house 且至少 5 rooms 的直接翻修到 stone 折扣走 mandatory sourced bonus modifier，不保留原始 stone 翻修成本分支。 |
| `C014_StrawThatchedRoof` | 已对齐 | construct / renovation 移除 reed 通过 `capDiscountAtCost` 表达，不再依赖过量折扣被 payment 枚举器截断。 |
| `C015_Trellis` | 已对齐 | BGA ordinary `FENCING` 子行动映射到内部 `fence` leaf。 |
| `C016_FieldFences` | 已对齐 |  |
| `C017_NewlyPlowedField` | 已对齐 |  |
| `C018_RollOverPlow` | 已对齐 | discard selection 默认至少选 1 个有作物田，空提交或选择空田不会绕过 discard 直接进入 plow。 |
| `C019_SwingPlow` | 已对齐 |  |
| `C020_MolePlow` | 已对齐 |  |
| `C021_HeartofStone` | 已对齐 |  |
| `C022_BasketChair` | 已对齐 | 回收 Day Laborer 工人后按 linked-occupancy metadata 清理同 linked worker 的 synthetic occupancy，并保留真实 / 不匹配 lessons 占格 |
| `C023_JobContract` | 已对齐 | lessons fake occupancy 写入 `WorkerRef.synthetic.kind='linked-occupancy'`，source card 与 linked worker id 都在 action-space state 上表达 |
| `C024_BedintheGrainField` | 已对齐 | 下一次 harvest 有空房时提供 optional `family-growth`，skip/accept 后都清理一次性 marker；无空房也消费 marker |
| `C025_SteamMachine` | 已对齐 | 最后一个普通工人使用 accumulation space 后返回 `SEQ[optional bake-bread, special-effect.consume-pending-extra-turns]`；消费步骤走通用 pending extra-turn 聚合，不引用 A92。无 pending/不可支付时 silent no-op；有多个 pending opportunity 时全部写入 `_extraTurnConsumedCount`，并只在实际消费时由 C25 发 `card.triggered`。Card-sourced follow-up leaf 通过 `sourceCard` 守卫避免 immediatelyAfter 自触发循环，也不把卡牌额外放人当作“普通工人最后行动”。 |
| `C026_Flail` | 已对齐 |  |
| `C027_Blueprint` | 已对齐 | 三张 workshop major 保留原支付 candidate，并追加 Blueprint stone-discount candidate；minor-improvement 入口维持 `computeChoiceCandidates` listener 模式，payment option 通过 candidate metadata 显示来源。 |
| `C028_TeachersDesk` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C029_BeerTable` | 已对齐 |  |
| `C030_HalfTimberedHouse` | 已对齐 |  |
| `C031_WritingChamber` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C032_AbortOriel` | 已对齐 |  |
| `C033_GreeningPlan` | 已对齐 |  |
| `C034_ElephantgrassPlant` | 已对齐 |  |
| `C035_LanternHouse` | 已对齐 |  |
| `C036_ClayDeposit` | 已对齐 |  |
| `C037_DwellingMound` | 已对齐 |  |
| `C038_Christianity` | 已对齐 |  |
| `C039_StudioBoat` | 已对齐 |  |
| `C040_CanvasSack` | 已对齐 |  |
| `C041_FarmStore` | 已对齐 | #241 改为卡内 `REWARD_OPTIONS` 表生成 optional pay/gain XOR。 |
| `C042_RavenousHunger` | 已对齐 | Vegetable Seeds 后先用 placement availability 过滤实际可进入的累积格；有合法 target 才创建 optional second placement，目标 collect 通过 `after.collect` flag 追加对应累积资源 +1，并在结算后 unflag |
| `C043_FarmBuilding` | 已对齐 |  |
| `C044_ChickenCoop` | 已对齐 |  |
| `C045_Stew` | 已对齐 |  |
| `C046_Mandoline` | 已对齐 |  |
| `C047_GardenClaw` | 已对齐 |  |
| `C048_Farmstead` | 已对齐 |  |
| `C049_BeerStall` | 已对齐 | #186 “空未围畜栏”改用 `getEmptyUnfencedStableCountForCards`（B85 永远算 1 个 empty，对齐 BGA `getEmptyUnfencedStables`） |
| `C050_StableYard` | 已对齐 |  |
| `C051_FishingNet` | 已对齐 |  |
| `C052_HuntsmansHat` | 已对齐 | cooking prerequisite 与 action-space boar/pig gain 得 food 路径对齐；未见当前 OA action-space 差异 |
| `C053_GypsysCrock` | 已对齐 |  |
| `C054_MarketBooth` | 已对齐 | printed cost 为 1 stable；收获 exchange 支付 grain + reserve fence |
| `C055_Studio` | 已对齐 |  |
| `C056_FeedFence` | 已对齐 | stable clay-for-wood 走 `scope:'unit'` trade + `groupMax:1`，只替换一座原本 2 wood 的 stable，并能先生成 BGA `addCost` clay cost row 再被 D88 替换；#186 “第 4 座畜栏 +2 food”bonus 口径改用 `getStableCountForCards === 4`（含 B85，对齐 BGA `countStablesForCards()==4`）；本次建造数仍走 `getStableTilesBuiltThisAction`（归 #185） |
| `C057_Crudite` | 已对齐 |  |
| `C058_Woodcraft` | 已对齐 |  |
| `C059_SchnappsDistillery` | 已对齐 |  |
| `C060_SmallPottersOven` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C061_BeerStein` | 已对齐 |  |
| `C062_CookeryExtension` | 已对齐 |  |
| `C063_CraftBrewery` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C064_CornSchnappsDistillery` | 已对齐 |  |
| `C065_Granary` | 已对齐 |  |
| `C066_EternalRyeCultivation` | 已对齐 |  |
| `C067_MineralFeeder` | 已对齐 | turn start 先提供 optional reorganize，再按 reorganize 后 pasture sheep 状态发放奖励 |
| `C068_Bookcase` | 已对齐 |  |
| `C069_LandConsolidation` | 已对齐 | extra-crop placement pending 期间通过 `actionContext.extraCropPlacement` 禁用 anytime，避免嵌套 swap |
| `C070_LettucePatch` | 已对齐 |  |
| `C071_Slurry` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C072_FestivalPlanning` | 已对齐 | onBuy 先执行 `reap` private trigger 收获普通田和 Card Field，再进入 optional improvement |
| `C073_SeaweedFertilizer` | 已对齐 |  |
| `C074_PrivateForest` | 已对齐 |  |
| `C075_Firewood` | 已对齐 | 按 `fireplaceIdentity` / `cookingHearthIdentity` / `ovenIdentity` 触发；D025_WitchesDanceFloor 触发，D064_BakingCourse 不触发。 |
| `C076_WoodCart` | 已对齐 |  |
| `C077_ClaySupply` | 已对齐 |  |
| `C078_ReedHattedToad` | 已对齐 |  |
| `C079_StoneCart` | 已对齐 |  |
| `C080_RockyTerrain` | 已对齐 |  |
| `C081_MaterialHub` | 已对齐 |  |
| `C082_HardwareStore` | 已对齐 |  |
| `C083_EarlyCattle` | 已对齐 |  |
| `C084_PerennialRye` | 已对齐 |  |
| `C085_DenBuilder` | 已对齐 |  |
| `C086_LivestockFeeder` | 已对齐 |  |
| `C087_Mason` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `C088_CarpentersApprentice` | 已对齐 | 木房建房 -2 wood 走 sourced `scope:'unit'` trade，保留原始建房成本并追加 BGA `addCost` 折扣候选。第 13–15 根 fence 免费区间走 `computeCosts.fence`，doability 通过免费 `fencePolicy` 复用真实布局门禁。Build Stables 的 `maxSelections` 用 count-aware total cost 计算（#191）：`stables.ts` 的 `buildStableFarmSelection` 对 count=1..reserve 逐一算 `resolveStableTotalCostWithDiscount`（与结算同一总额，含 C88 第 3/4 座 -1 的 non-uniform 折扣）+ `canAffordTypedFlatCost`，取最大可负担数覆写 `farm.maxSelections`，不再 probe `stableCount:1` 折后注入 farmyard 的 per-unit `costOverride`（non-uniform 折扣下会少让一座，如 1 card-facing stable + 3 wood + C88 应能建 2 座）。total 对 count 单调（每多一座 ≥+1 wood），首个不可负担即终止扫描。`actionContext.max`（A1 Shelter）/`zoneFilter='pasture-1'`/`exactCost`（C94）路径不受影响。 |
| `C089_StableMaster` | 已对齐 | onBuy 的 1 wood stable 走 `stables` exactCost，入口不做 raw wood gate，允许 C88 等 `computeCosts.stables` 折扣叠加。 |
| `C090_FieldWatchman` | 已对齐 |  |
| `C091_PlowHero` | 已对齐 |  |
| `C092_AutumnMother` | 已对齐 |  |
| `C093_InnerDistrictsDirector` | 已对齐 | 放 stone 与可选额外放人已作为整段 optional，skip 不再强制放 stone |
| `C094_StableCleaner` | 已对齐 | anytime 入口用 stables preview + `computeCosts.stables` 判断可用性，1 wood + 1 food exactCost 可叠加 C88 等 stable cost modifier。 |
| `C095_BasketWeaver` | 已对齐 | onBuy 期间 Basketmaker's Workshop 的 1 reed + 1 stone 固定价改走 card-purchase candidate append，保留原价 candidate，并在 payment option 展示来源；fixed-price listener 在 candidate pipeline 中先于普通折扣执行，避免组合来源污染。 |
| `C096_Merchant` | 已对齐 |  |
| `C097_SeedResearcher` | 已对齐 |  |
| `C098_CubeCutter` | 已对齐 |  |
| `C099_GardenDesigner` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
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
| `C169_FastMason` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner collect clay/stone accumulation 后，可选执行匹配材质 renovation：clay collection 只到 clay，stone collection 仅 clay house 到 stone，`exactCost` 去掉 reed。 |
| `C170_AmateurFencer` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。onBuy 时若 owner 无 pasture 且 one-space fence legal，可选执行 B2-style 免费恰好 1 格牧场 non-action fence flow。 |
| `C171_YoungArtist` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。returning home phase owner 有 food 且至少一个分支可行时，可选付 1 food 后执行无工人 Minor Improvement action，或直接从 ordinary minor deck 抽最多 2 张小改良入手；Minor Improvement 分支按预留/支付该 1 food 后的资源判断，不会展示付费后无可买牌的分支；不可行分支隐藏，不走 keep-one 选择。 |
| `C172_FieldCounter` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。opponent 每 plow 1 field 在卡上放 1 food，按 `farm.fieldPlowed.fields` 数量累计；owner 自己 plow 不触发；cashout 复用 shared stored-food helper。 |
| `C173_TopOuter` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。任意玩家使用 house-building-56 后，owner 收取 linked traveling-players-56 当前全部 food；空 food 或非 house-building-56 不触发。 |
| `C174_StoneCustodian` | 已对齐 | 5+ 产品扩展实现：work phase return home 前统计有 stone 的 stone accumulation space，1 个给 1 grain，2+ 个给 1 vegetable。 |
| `C175_VillageTeacher` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 使用 Lessons 后按当前回合实际 occupied Lessons 数量 1/2/3 给 food/grain/vegetable；linked blocked 格不计数。 |
| `C176_Cleanacre` | 已对齐 | 5+ 产品扩展实现：Farmland/Cultivation/Farming Supplies 顶层行动完成后给 2 clay；Farming Supplies 多分支每次行动只触发一次。 |
| `C177_MountainHiker` | 已对齐 | 5+ 产品扩展实现：5-6 extension accumulation space collect 后可选付 1 food 买 1 stone；不含 instant-gain extension spaces。 |
| `C178_OnSiteReverend` | 已对齐 | 5+ 产品扩展实现：harvest start 强制选择 1 个 building resource。 |
| `C179_BovinePioneer` | 已对齐 | 5+ 产品扩展实现：fence action 产生至少 1 个 newPasture 时给 1 cattle；一次 fence action 最多触发一次。 |
| `C180_Trapper` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。owner 使用 wood accumulation 后，若实际 occupied wood accumulation 数量为 2/3/4，可选 1 food 购买 sheep/boar/cattle。 |
| `D001_ZigzagHarrow` | 已对齐 | 使用 generic `plow.actionContext.allowedTiles` 对齐 BGA zigzag 目标限制；accepted divergence：raw zigzag candidates 不预过滤越界/占用，最终由 plow validation / `allowedTiles` 交集处理；empty intersection optional leaf auto-skip |
| `D002_DwellingPlan` | 已对齐 | 即时翻修子行动使用当前 `renovate-house` action id。 |
| `D003_Furrows` | 已对齐 |  |
| `D004_CrossCutWood` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D005_FieldClay` | 已对齐 |  |
| `D006_PetrifiedWood` | 已对齐 |  |
| `D007_Trident` | 已对齐 |  |
| `D008_FernSeeds` | 已对齐 |  |
| `D009_GameTrade` | 已对齐 |  |
| `D010_StorksNest` | 已对齐 |  |
| `D011_LawnFertilizer` | 已对齐 | size-one pasture replacement 走 `computePastureCapacityModifiers`；先替换为 `3 * (stables + 1)`，再叠加 A12/B72 等 additive。 |
| `D012_MilkingPlace` | 已对齐 | 通过 `blocksHouseAnimalZones` metadata 触发 `computeAnimalZones()` 通用过滤，不再直接读取 D148。 |
| `D013_Trowel` | 已对齐 | anytime 直接翻修到 stone 通过 `params.selectedOption='stone'` 进入真实 `renovate-house`；wood→stone / clay→stone 固定成本用 sourced mandatory bonus 表达，payment option 保留 Trowel 来源。 |
| `D014_HammerCrusher` | 已对齐 |  |
| `D015_ClaySupports` | 已对齐 |  |
| `D016_WoodenWheyBucket` | 已对齐 | BGA `formatCost(['max' => 1, WOOD => 1])` / `formatCost(['max' => 1])` 通过 `stables` `actionContext.exactCost` 表达羊市场 1 wood、牛市场免费，且最多 1 个 stable。 |
| `D017_DrillHarrow` | 已对齐 |  |
| `D018_SteamPlow` | 已对齐 |  |
| `D019_PulverizerPlow` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D020_TurnwrestPlow` | 已对齐 | 购买本卡的支付不记为 Turnwrest Plow 自身 PAID；Wood Expert 等 card-purchase Cost Attribution 归因到对应 source card。 |
| `D021_Recruitment` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D022_WorkPermit` | 已对齐 |  |
| `D023_PioneeringSpirit` | 已对齐 |  |
| `D024_BrotherlyLove` | 已对齐 |  |
| `D025_WitchesDanceFloor` | 已接受差异 | 已接受的行为 / 产品差异 |
| `D026_CarpentersYard` | 已对齐 |  |
| `D027_Retraining` | 已对齐 |  |
| `D028_WritingDesk` | 已对齐 |  |
| `D029_MuckRake` | 已对齐 |  |
| `D030_ArtisanDistrict` | 已对齐 |  |
| `D031_Storeroom` | 已对齐 |  |
| `D032_WoodRake` | 已对齐 |  |
| `D033_SummerHouse` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D034_LuxuriousHostel` | 已对齐 |  |
| `D035_FodderChamber` | 已对齐 |  |
| `D036_BreedRegistry` | 已对齐 | 使用 zone-aware hand listener 在 D36 存在于手牌/已打出时维护本卡 `boardSheep` / `cardSheep` / `sheepConvertedToFood`；买入时初始化 infobox；No Sheep 走当前 animal zones。 |
| `D037_Sculpture` | 已对齐 |  |
| `D038_MilkingStool` | 已对齐 |  |
| `D039_TruffleSlicer` | 已对齐 |  |
| `D040_Cesspit` | 已对齐 |  |
| `D041_HorseDrawnBoat` | 已对齐 |  |
| `D042_EducationBonus` | 已对齐 | after.occupation 奖励改读 trigger snapshot 职业数量；E97 连续额外打职业时按各自 host action 的触发帧发放资源。 |
| `D043_Hutch` | 已对齐 |  |
| `D044_ForestWell` | 已对齐 |  |
| `D045_SheepWell` | 已对齐 |  |
| `D046_PelletPress` | 已对齐 |  |
| `D047_Churchyard` | 已对齐 |  |
| `D048_CivicFacade` | 已对齐 |  |
| `D049_Bookshelf` | 已对齐 |  |
| `D050_ForeignAid` | 已对齐 |  |
| `D051_Archway` | 已对齐 |  |
| `D052_RollingPin` | 已对齐 |  |
| `D053_TeaHouse` | 已对齐 |  |
| `D054_TroutPool` | 已对齐 |  |
| `D055_NewMarket` | 已对齐 |  |
| `D056_FatstockStretcher` | 已对齐 |  |
| `D057_WholesaleMarket` | 已对齐 |  |
| `D058_Gritter` | 已对齐 |  |
| `D059_EarthOven` | 已对齐 |  |
| `D060_LargePottery` | 已对齐 |  |
| `D061_BaleofStraw` | 已对齐 |  |
| `D062_BeerTap` | 已对齐 |  |
| `D063_Lynchet` | 已对齐 |  |
| `D064_BakingCourse` | 已对齐 |  |
| `D065_GrainSieve` | 已对齐 |  |
| `D066_PotterCeramics` | 已对齐 |  |
| `D067_ReapHook` | 已对齐 |  |
| `D068_SmallBasket` | 已对齐 |  |
| `D069_SmallGreenhouse` | 已对齐 |  |
| `D070_StrawManure` | 已对齐 |  |
| `D071_Changeover` | 已对齐 |  |
| `D072_StableManure` | 已对齐 | 额外收获选择门槛走 `computeHarvestSelectionThreshold()`；选中田通过 Harvest Count modifier 增加 count，并在 top stack 收空后继续收同田下一层 stack，在 `harvestCountApplications` 记录来源。#186 “未围畜栏数”改用 `getUnfencedStableCountForCards`（含 B85，对齐 BGA `countUnfencedStablesForCards`） |
| `D073_SupplyBoat` | 已对齐 |  |
| `D074_RoyalWood` | 已接受差异 | BGA banned，但 OA 按产品策略保留；stables 支付因 afterHost slot 通过 after-pay provenance 统计 |
| `D075_WoodField` | 已对齐 |  |
| `D076_SocialBenefits` | 已对齐 |  |
| `D077_RecycledBrick` | 已对齐 |  |
| `D078_ReedPond` | 已对齐 |  |
| `D079_CarrotMuseum` | 已对齐 |  |
| `D080_BrickHammer` | 已对齐 | after-improvement 判断改用 `getPrintedImprovementResourceCost(..., 'clay')`；`cost` 与 `altCosts` 是 base cost 候选，取最大 clay，不再把 minor `cost.clay` 与 `altCosts[].clay` 相加。 |
| `D081_RoofLadder` | 已对齐 | 翻修少付 1 reed 走 sourced mandatory bonus；after.renovate-house 仍给 1 stone。 |
| `D082_HuntingTrophy` | 已对齐 | House Redevelopment 的 improvement 折扣走 mandatory sourced resource choice；Farm Redevelopment 的 fence 总计最多 3 wood 折扣走 sourced action trade，保留原始围栏成本并追加 BGA `addCost` 折扣候选；fence farm-choice settlement 会保留该 trade 并传入 `pay:fence`。 |
| `D083_Pigswill` | 已对齐 |  |
| `D084_FeedPellets` | 已对齐 |  |
| `D085_Reader` | 已对齐 |  |
| `D086_SheepAgent` | 已对齐 | 容量扣除通过 `animalHolder` metadata + occupation identity 过滤；D86 自身仍计入容量，minor animal-holder 不扣容量。 |
| `D087_MasterBuilder` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `D088_Millwright` | 已对齐 | 用两个 sequential optional `BonusModifier.choices` 表达最多 2 次 building-resource→grain replacement；在 A16/C56 这类 unit cost alternative 之后应用，保留 BGA 组合来源；无状态 replacement 不设置 `choiceAffectsState`，可被 payment dominance pruning 合并。 |
| `D089_Stablehand` | 已对齐 |  |
| `D090_PlowMaker` | 已对齐 |  |
| `D091_Plowman` | 已对齐 |  |
| `D092_ChildOmbudsman` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D093_SheepInspector` | 已对齐 |  |
| `D094_HenpeckedHusband` | 已对齐 |  |
| `D095_SiteManager` | 已对齐 | onBuy 期间 major improvement 支付改走 card-purchase candidate append；对当前候选中已有 wood/clay/stone/reed 的每个非空 subset 生成“每类最多 1 个 building resource -> 1 food”replacement candidate，保留原候选。 |
| `D096_Furnisher` | 已对齐 | `actionCardId === D096_Furnisher` 的 improvement 追加 wood-discount candidate；普通 improvement 不产生 candidate pipeline 输出；选择折扣候选后记录 Furnisher saved wood；折到 0 的 wood 不保留零值键。 |
| `D097_BeggingStudent` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D098_Transactor` | 已对齐 |  |
| `D099_EarthenwarePotter` | 已对齐 |  |
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
| `D169_Plowsmith` | 已对齐 | 5+ 产品扩展实现：opponent 从 wood accumulation space 本身拿走至少 4 wood 后，可选付 1 food 立即 plow 1 field；含 5/6 Riverbank Forest，非累积来源、低于阈值或 owner 无合法 plow tile 不触发。 |
| `D170_FoldBuilder` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。注册 all-player dynamic action space；non-owner 先支付 owner 1 food，再执行 forbid-cancel fence flow 并获得 1 sheep；owner 使用不自付。 |
| `D171_SeniorTeacher` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。监听 opponent Lessons occupation payment 的 `pay.after`，通过 `sumActualPaidResource()` 按 `paymentSources` 还原实际 food 支付；非 Lessons、owner 自付、非 food replacement 不触发，实际付 food 时 owner 固定获得 exactly 1 food。 |
| `D172_PutcherMaker` | 已对齐 | 5+ 产品扩展实现：metadata-driven anytime exchange，1 reed -> 2 food，无每次上限。 |
| `D173_TownClerk` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。任意玩家 built card `cardCountsAs(..., 'major')` 后在 owner 卡上放 1 food，包含 `alsoCountsAs: ['major']` 的 minor；ordinary minor 不触发；cashout 复用 shared stored-food helper。 |
| `D174_LoessGardener` | 已对齐 | 5+ 产品扩展实现：Clay Pit collect 后可选付 1 food 买 1 vegetable。 |
| `D175_Countryman` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。任意玩家的 renovation-providing action space 后，owner 可选 sow exactly one field；非 renovation action-space、card-granted 非翻修空间伪装或无合法一田播种不触发。 |
| `D176_Woodshacker` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。work phase 中 owner 本回合第 1/2 次使用 wood accumulation 额外给 1/2 clay，按本轮实际使用次数计数（同一空间重复使用也计次），随回家重置。 |
| `D177_Graduate` | 已对齐 | 5+ 产品扩展实现：onBuy 有 1 food 时强制支付 1 food；支付成功后获得 2 stone + 2 reed，不能支付则不触发奖励。 |
| `D178_SubstituteTeacher` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。注册 owner-only action space，三个可见 Lessons 格都实际 occupied 后可用，奖励为 1 building resource 或 grain+vegetable。 |
| `D179_Bullcatcher` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。注册 owner-only action space，round slot 3 与 round slot 6 对应行动格都 occupied 且 owner 仍有可用工人时可用，使用后获得 1 cattle + 2 food。 |
| `D180_PartTimeWorker` | 已接受差异 | BGA implemented=false；OA 作为 5+ 扩展产品实现。after collect 读取本次从该 accumulation space 移到玩家的 `resource.moved` goods map，exact 2/4/6 分别可选返还 1/2/3 goods 到该格并获得 sheep/boar/cattle；`return-to-space` leaf 显式携带被收取格的 `targetSpaceId`，card-granted placement 收取非外层行动格时也返还到正确格；混合资源枚举所有合法返还组合，且与其他 `return-to-space` optional flow 串行共存，不把后续返还资源计入触发。 |
| `E001_PoleBarns` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 `stables` `actionContext.exactCost` 表达最多 3 个免费 stable。 |
| `E002_RenovationMaterials` | 已对齐 | BGA `formatCost([])` 通过 `renovate-house` `actionContext.exactCost` 表达免费翻修到 clay。 |
| `E003_TeaTime` | 已对齐 |  |
| `E004_Thunderbolt` | 已对齐 |  |
| `E005_NightLoot` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `E006_Recount` | 已对齐 |  |
| `E007_Pumpernickel` | 已对齐 |  |
| `E008_FarmersMarket` | 已对齐 |  |
| `E009_BarteringHut` | 已对齐 |  |
| `E010_StrawHat` | 已对齐 | 第 3/6 轮 return-home 返回 mandatory XOR；food 分支始终存在，有 Farmland worker 且有合法目标时追加 move 分支，move 真实移走 Farmland worker 并执行目标行动 flow；移动已有 Farmland worker 不要求家中另有可用工人 |
| `E011_PettingZoo` | 已对齐 |  |
| `E012_AnimalBedding` | 已对齐 |  |
| `E013_StoneHouseReconstruction` | 已对齐 | anytime 翻修子行动使用当前 `renovate-house` action id。 |
| `E014_WoodSaw` | 已对齐 |  |
| `E015_NailBasket` | 已对齐 |  |
| `E016_BriarHedge` | 已对齐 | prerequisite 改用 `getAssignedAnimalsByType()`，house/pasture/stable/animal-holder 口径统一；fence discount 保留本卡 listener。 |
| `E017_SkimmerPlow` | 已对齐 |  |
| `E018_SeedAlmanac` | 已对齐 |  |
| `E019_OxGoad` | 已对齐 |  |
| `E020_IronHoe` | 已对齐 |  |
| `E021_SheepRug` | 已对齐 |  |
| `E022_GuestRoom` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E023_Apiary` | 已对齐 |  |
| `E024_Ambition` | 已对齐 |  |
| `E025_BumperCrop` | 已对齐 | onBuy 走 `reap` private trigger；`2 Grain Fields` 前置同时计入普通 grain field 与带 grain 的 Card Field |
| `E026_Sundial` | 已对齐 |  |
| `E027_PiggyBank` | 已对齐 | flagged free-major 支付改走 card-purchase candidate append，追加 free major candidate 并保留原价 candidate；free candidate 在 pipeline 中先于普通折扣执行。 |
| `E028_Bookmark` | 已对齐 |  |
| `E029_Heirloom` | 已对齐 |  |
| `E030_ChildsToy` | 已对齐 |  |
| `E031_Upholstery` | 已对齐 |  |
| `E032_Nave` | 已对齐 |  |
| `E033_BeaverColony` | 已对齐 |  |
| `E034_LandRegister` | 已对齐 |  |
| `E035_Misanthropy` | 已对齐 |  |
| `E036_HerbalGarden` | 已对齐 |  |
| `E037_OxSkull` | 已对齐 |  |
| `E038_RodCollection` | 已对齐 |  |
| `E039_Paintbrush` | 已对齐 |  |
| `E040_BeeStatue` | 已对齐 |  |
| `E041_MuddyWaters` | 已对齐 |  |
| `E042_WaterGully` | 已对齐 |  |
| `E043_BarnCats` | 已对齐 | #186 prerequisite（1 stable）与 onBuy 的“你拥有畜栏数”改用 `getStableCountForCards`（含 B85，对齐 BGA `countStablesForCards`） |
| `E044_FodderBeets` | 已对齐 |  |
| `E045_FruitLadder` | 已对齐 |  |
| `E046_WaterlilyPond` | 已对齐 |  |
| `E047_SyrupTap` | 已对齐 | 已响应来自 action-space 的 gain provenance，并防止自触发递归 |
| `E048_TownHall` | 已对齐 |  |
| `E049_Twibil` | 已对齐 |  |
| `E050_WildGreens` | 已对齐 |  |
| `E051_WhaleOil` | 已对齐 |  |
| `E052_Cubbyhole` | 已对齐 |  |
| `E053_BoarSpear` | 已对齐 | listener 只允许本次新获得的 boar 次数参与兑换；Animal Payment Preference 按来源 prefer / avoid C148 held，C148 来源扣 C148，本体 action-space / B137 来源优先扣新获得的非 C148 boar，decline 不改变来源 |
| `E054_Contraband` | 已对齐 |  |
| `E055_StoneWeir` | 已对齐 |  |
| `E056_RomanPot` | 已对齐 |  |
| `E057_CheeseFondue` | 已对齐 |  |
| `E058_LunchtimeBeer` | 已对齐 |  |
| `E059_CombandCutter` | 已对齐 |  |
| `E060_WorkingGloves` | 已对齐 | Card Source 代表迁移；4 条 occupation trade modifiers 已移入 `impl.modifiers`，session payment 覆盖 |
| `E061_RaisedBed` | 已对齐 |  |
| `E062_SourDough` | 已对齐 |  |
| `E063_IronOven` | 已对齐 |  |
| `E064_SimpleOven` | 已对齐 |  |
| `E065_Almsbag` | 已对齐 |  |
| `E066_BarnShed` | 已对齐 | Card Source listener 代表迁移；session 覆盖 opponent forest trigger |
| `E067_GrainBag` | 已对齐 |  |
| `E068_CherryOrchard` | 已对齐 | 描述恢复 BGA sow/harvest-as-grain 语义，session 覆盖 wood field harvest |
| `E069_MelonPatch` | 已对齐 |  |
| `E070_CropRotationField` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E071_CowPatty` | 已对齐 | 单个 eligible 也走 optional selection，多田使用精确 selectableTiles |
| `E072_ArtichokeField` | 已对齐 | Card Field 在私人田地阶段只收作物；harvest-only 1 food 奖励仅在 Harvest field phase 触发 |
| `E073_Scythe` | 已对齐 | 选择时记录 `fullReapPosition`，普通 reap 通过 Harvest Count override 收完整块田，并用 `full-field-reap` tag / `field` scope 写入 `harvestCountApplications`；位置保留到 EndHarvest 清理 |
| `E074_AshTrees` | 已对齐 |  |
| `E075_StoneAxe` | 已对齐 |  |
| `E076_LumberPile` | 已对齐 |  |
| `E077_Mattock` | 已对齐 |  |
| `E078_SleightofHand` | 已对齐 | 已迁到原子 batch exchange，覆盖 UI/private/replay |
| `E079_FieldSpade` | 已对齐 |  |
| `E080_RockGarden` | 已对齐 |  |
| `E081_AlchemistsLab` | 已对齐 |  |
| `E082_Profiteering` | 已对齐 |  |
| `E083_ShepherdsWhistle` | 已对齐 |  |
| `E084_DollysMother` | 已对齐 | 通过 `computeBreedThreshold` 仅让 harvest-source sheep breeding threshold=1；breed phase 直接产生 newborn sheep 并写入 summary，不再使用 virtual sheep 状态 |
| `E085_MasterTanner` | 已对齐 |  |
| `E086_PenBuilder` | 已对齐 |  |
| `E087_MasterRenovator` | 已对齐 |  |
| `E088_MasterFencer` | 已对齐 | BGA `formatCost([WOOD => 0])` 通过 nested `fencePolicy` 表达付 2/3 wood 后最多 3/4 段总免费 fence。 |
| `E089_Stallwright` | 已对齐 | BGA `formatCost(['max' => 1])` 通过 `stables` `actionContext.exactCost` 表达；第 2/3/5/7 张职业判断改读 trigger snapshot，不依赖 E97 内嵌特判或执行时 live 数量。 |
| `E090_DungCollector` | 已对齐 |  |
| `E091_PlowBuilder` | 已对齐 |  |
| `E092_FieldDoctor` | 已对齐 |  |
| `E093_Motivator` | 已对齐 |  |
| `E094_Prophet` | 已对齐 | 即时翻修 / fencing 子行动使用当前 `renovate-house` / `fence` action id。 |
| `E095_Miller` | 已对齐 |  |
| `E096_Elder` | 已对齐 |  |
| `E097_Beneficiary` | 已对齐 | 额外 occupation 保留 `params.exactCost: { food: 1 }`；已删除 E89 stable 内嵌分支，E89/D42/B49 等 trailing listener 由 trigger snapshot 自行结算。 |
| `E098_Prodigy` | 已对齐 |  |
| `E099_UncaringParents` | 已对齐 |  |
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
| `M018_RegisterOfCraftsmen` | 已对齐 | 打出后从当前 visible Joinery / Pottery / Basketmaker 中选择可支付的一张，不放人购买并少付 1 stone；passing 后仍由 `actionCardId` 作用域折扣；session 测试覆盖 hidden stack 不可选与资源不足过滤。 |
| `M019_LawnTurf` | 已对齐 | onBuy 按 unused farmyard spaces - 2 获得 fuel，4+ improvement 前置由 `prerequisiteCheck` 守卫；session 测试覆盖奖励上限与不可打出路径。 |
| `M020_PeatPellets` | 已对齐 | onBuy 按 visible moor 数获得 fuel，major improvement 前置由 metadata 守卫；session 测试覆盖公开 `farmTerrain` 计数。 |
| `M022_EcologicalNiche` | 已对齐 | onBuy 按唯一最多动物种类、已生长 grain/vegetable、唯一最多 forest/moor 结算 food/fuel；grain/vegetable 同时统计普通田和 card field；session 测试覆盖平局不触发与 card field 作物。 |
| `M024_BasicSupplies` | 已对齐 | onBuy 将 fuel / food / wood / clay / reed / stone / grain 补到至少 1；session 测试覆盖已有资源不重复给。 |
| `M025_HouseholdInventory` | 已对齐 | 需要至少 1 field / pasture / stable，onBuy 按 unused farmyard spaces 依序给 reed / grain / cattle / stone / vegetable / horse；session 测试覆盖前置条件与奖励截断。 |
| `M026_ChimneyHood` | 已对齐 | onBuy 按当前最佳 bake rate 给 food，不消耗 grain；session 测试覆盖无 baking improvement 时不触发。 |
| `M028_OutOnTheWallaby` | 已对齐 | onBuy 根据已拥有 Joinery / Pottery / Basketmaker 家族 major 给 wood / clay / reed；session 测试覆盖无 craft building 时不触发。 |
| `M029_Tinker` | 已对齐 | 需要 3+ major improvement；只有拥有 craft building 时 onBuy 给 wood / clay / reed / stone 各 1；session 测试覆盖无 craft building 可打出但无奖励。 |
| `M030_FarmAnimalMarket` | 已对齐 | onBuy 可选通过 exchange 支付 2 sheep 获得 1 cattle 和 1 horse，已安置 sheep 会从 pasture / house / stable / animal-holder 同步移除；session 测试覆盖无 sheep 时不弹选择与已安置 sheep。 |
| `M031_LivestockMarket` | 已对齐 | 5 animals 前置通过 inline prerequisite 执行；onBuy 枚举最多 3 只 sheep / boar / cattle 同时升档交换，只保留共享最终总量动物容纳 helper 判定可容纳的候选；支付 boar 的 exchange 通过 generic `animalPaymentPreference` 先用普通 board boar、必要时才消耗 C148 held counter；选择后通过普通 exchange 触发系统 animal-reorg。 |
| `M032_PeatHut` | 已对齐 | 提供 1 点 extra room capacity，供暖需求 +1；可替代 Renovation action 免费给 wood house 加 1 wooden room，只有存在合法 room tile 时才暴露，且建房成功后才移除此牌；session 测试覆盖 capacity、转换 room flow 与满农场不退牌。 |
| `M036_PeatMoss` | 已对齐 | no visible moors 前置；木房建房成本通过 active construct `scope:'unit'` trade modifier 降为每房 3 wood + 1 reed，覆盖 action-space 可行动性、单房和多房支付。 |
| `M037_BuildingPlan` | 已对齐 | after construct 读取 action snapshot，本次至少建 2 rooms 才触发；可选以 `trueAction:false` 建最多 2 个免费 stables。 |
| `M061_HayWagon` | 已对齐 | 2 horses 前置；after collect 只统计本次从 actionSpace 移给玩家的 building resources，达到 wood 3 / clay 3 / reed 2 / stone 2 后可选非 worker Build Rooms 或 Renovation。 |
| `M062_HearthBrush` | 已对齐 | onBuy 将 Tiled Oven move up；从下一轮起每次 person action 后可选购买 Tiled Oven，special action 不触发；拥有 Tiled Oven 终局 +1；session 测试覆盖本轮不触发、下一轮 person action 触发、special action 不触发、资源门槛和 supply move-up。 |
| `M063_PastoralLetter` | 已对齐 | onBuy 将 Village Church move up；从下一轮起每次 person action 后可选购买 Village Church，special action 不触发；Church 和 Village Church 各 +1；session 测试覆盖触发上下文、supply move-up 与计分。 |
| `M064_FamilyBurialPlot` | 已对齐 | stone house 前置；onBuy 可选在 unused farmyard space 放置 blocked farmyard space state，计为占用且终局 +1 bonus VP；session 测试覆盖接受/跳过、阻塞占用和计分。 |
| `M065_FireBrigade` | 已对齐 | 需要 4+ food 和 4+ fuel，onBuy 给 2 food，并按 2-5 visible forests 给 1-4 bonus VP；session 测试覆盖 bonus VP。 |
| `M067_ChamberOfCommerce` | 已对齐 | onBuy 给 1 wood 和 1 reed，终局按 Joinery / Pottery / Basketmaker 家族建筑数量给分；session 测试覆盖即时资源与 craft 计分。 |
| `M068_Church` | 已对齐 | 通过 `returnCards` 升级 Village Church，打出得 2 food；returning home 每轮可选支付 1 fuel 得 1 bonus VP；session 测试覆盖升级、即时 food 和返回家阶段 flow。 |
| `M069_LeatherSaddle` | 已对齐 | 需要 2+ horse；通过 per-trade `immediatelyAfter.trade-applied` 的 `preResources` 判断每笔 cattle 转 food 发生前是否有 3+ horse，并用 immediate `special-effect` counter 等量给 bonus VP；session 测试覆盖真实 exchange 入账、horse 门槛与非 cattle 不触发。 |
| `M070_MoorArchaeology` | 已对齐 | clay house 前置；Cut Peat 后可选消费 1 个 fence supply token，在被清空格写入 blocked farmyard space state，计为占用且终局 +1 bonus VP；session 测试覆盖 optional 接受、fence supply 消费、阻塞占用和计分。 |
| `M071_BogBody` | 已对齐 | `computeSharedPostScore` 给 Museum of the Moors / Living History Museum 拥有者各 +1；同一玩家同时拥有两张目标牌时得 2 分，session 测试覆盖跨玩家共享计分和双目标叠加。 |
| `M072_OvenDamper` | 已对齐 | onBuy 给 3 fuel，终局按 clay / stone / heating / tiled oven 与 Oven Installation 数量给分；session 测试覆盖即时资源和目标 oven 计数。 |
| `M073_StockBreedingPrize` | 已对齐 | 终局按 sheep / boar / cattle / horse 完整套数，乘以其他玩家数给分，上限 3 套；session 测试覆盖玩家数乘数和截断。 |
| `M074_Administration` | 已对齐 | 需要手牌不超过 4 张；onBuy 给 2 food，round 14 feeding 可按 major 数量上限把 food 换 bonus VP；session 测试覆盖前置和延迟选择。 |
| `M080_AdvancePayment` | 已对齐 | onBuy 一次性给 fuel / food / wood / clay / reed / stone / sheep / grain 各 1；session 测试覆盖完整资源包。 |
| `M081_PeatBoat` | 已对齐 | metadata anytime exchange 支持 fuel 换 wood / clay / reed / stone / sheep / food；session 测试覆盖注册的 exact exchange。 |
| `M082_Firewood` | 已对齐 | onBuy 给 1 fuel；供暖支付中本次 wood-to-fuel 转换大于 0 时总需求 -1，wood 转 fuel 只作为本次供暖支付，不落入持久 fuel；折扣按折扣前需求扣 wood，session 测试覆盖动态折扣、1 fuel 需求必须支付 1 wood、以及原本 0 需求不造 fuel。 |
| `M085_OvenInstallation` | 已对齐 | 用 `heatingFuelCap: 0` 表达无需供暖；Heating Oven stack 仍由 major supply / returnCards metadata 表达；session 测试覆盖 cap 0、真实购买并把 Heating Oven 归还 FoM stack。 |
| `M086_SpinningMill` | 已对齐 | `1 Sheep` 前置走通用 prerequisite parser；harvest field phase 按已安置 sheep 的 `floor(sheep / 2)` 写入 `cardStates` heating 折扣，feeding/heating phase 读取；session 测试覆盖 sheep 数变化。 |
| `M091_RoutineWork` | 已对齐 | `No Improvements` 前置走通用 prerequisite parser，major/minor 都会阻止打出；本 harvest food craft building 通过 `resource.exchanged.exchangeSource` 或 trade-applied fallback 标记已用，feeding 末每个未用 Joinery / Pottery / Basketmaker 家族建筑可选 1 fuel 或 1 food，FoM Stall 不触发。 |
| `M092_AridField` | 已对齐 | 3 improvements 前置；Cut Peat 后在清空格放 fuel+food goods token，该格仍未使用；后续格子被 field/room/stable/pasture/blocked state 等占用时通过 claim special-effect 发放资源并移除 token；session 测试覆盖 delayed claim。 |
| `M095_FallowFields` | 已对齐 | onBuy 可在最多 3 个 empty field 放 field goods token；普通 sow 对应田或 private-field-phase reap 该田时领取 food，普通 harvest 不领取；session 测试覆盖 delayed claim。 |
| `M096_FallowLand` | 已对齐 | 2 improvements 前置；Cut Peat / Fell Trees 后在清空格放 food goods token，该格仍未使用；后续格子被使用时发放 food 并移除 token；session 测试覆盖 Fell Trees delayed claim。 |
| `M100_Pheromones` | 已对齐 | 需要已打出 improvement 不超过 2 张，onBuy 拥有者得 1 food，所有有 stable 或 pasture 的玩家得 2 food；session 测试覆盖跨玩家奖励与前置限制。 |
| `M104_WildHarvest` | 已对齐 | onBuy 给 1 food；每次 harvest start 以缓存起始卡牌序号对比 visible forest 数，命中得 1 food；session 测试覆盖命中与未命中。 |
| `M105_OpenGrill` | 已对齐 | 标记 cookery / baking，metadata exchange 支持 anytime 烹饪和 bake-bread grain -> 2 food；session 测试覆盖 exchange 注册。 |
| `M106_HorseButchery` | 已对齐 | 标记 cookery，metadata exchange 支持 sheep / boar / cattle / horse / 2 horses 烹饪；Horse Slaughterhouses 仍由 FoM major supply 放在 Fireplaces 下；session 测试覆盖 horse 与 2 horses exchange。 |
| `M107_PotRoastRecipe` | 已对齐 | 需要 2+ horse，且拥有 fireplace / cooking hearth 家族时通过 computeExchanges 增加 horse -> 2 food；session 测试覆盖 cookery 门槛。 |
| `M108_GrainDistillery` | 已对齐 | harvest exchange 每次最多 fuel + grain -> 5 food；终局用 `computeCostedBonus` 按 fuel + grain 成对换 VP，不能和 Peat-charcoal Kiln 等 costed bonus 双重占用同一份资源；session 测试覆盖 exchange、costed 计分和竞争选择。 |
| `M109_Malthouse` | 已对齐 | Cut Peat 后可选准确支付 1 grain 获得 4 food；无 grain 时不弹选择。 |
| `M111_NoTillFarming` | 已对齐 | 2 fields 前置；通过 extra sowable field 在 unused farmyard spaces 种 grain/vegetable，状态仍算 unused；FarmBoard 在真实 farmyard tile 上渲染 on-board extra sow 控件；有 crop 时 placement lock 阻止 build/plow/fence/terrain 覆盖，harvest field phase 收获 non-field crop，anytime selection 可丢弃选中 crop。 |
| `M112_PeatAshFertilizer` | 已对齐 | Cut Peat 前可选让普通田和 non-field crop space 中已有 grain/vegetable 各加 1 同类 crop；空田/空 non-field space 不增长，Cut Peat 仍正常结算。 |
| `M113_LivingHistoryMuseum` | 已对齐 | clay house 前置；按 Museum of the Moors cost listener 模式给 FoM major upgrade 按对应 building resource -1；session 测试覆盖前置和 Tiled Oven / Riding Stables 折扣。 |
| `M115_OakBark` | 已对齐 | `2 Major Improvements` 前置走通用 prerequisite parser，含 `alsoCountsAs: ['major']` 的 dual-type minor；onBuy 给 2 wood，boar / cattle / horse 换 food 后用 `resource.exchanged` 等量给 wood；session 测试覆盖资源事件触发。 |
| `M117_DraughtHorses` | 已对齐 | 有 horse 且有 food 时，after.collect 木头累积格可选支付 1 food，按 3/4+ wood 给 1/2 wood；session 测试覆盖可选支付和门槛。 |
