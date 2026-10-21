# 卡牌实现现状报告

[English](card_implementation_status.md) | [中文](card_implementation_status_zh.md)

> 本文是 [`card_implementation_status.md`](card_implementation_status.md) 的中文镜像；英文版是规范文档。

> 更新日期：2026-10-21。规则权威为出版社卡牌文字和印刷图标、官方裁定及已记录的维护者决定。参考实现仅作实现对照。

> 本文只覆盖官方卡牌。Hook 归属由 `ALL_CARD_IMPLS` 派生，不在此镜像一份会漂移的副本；需要时直接查注册表。

## 1. 问题优先汇总

参考实现 PHP 路径相对参考实现源码树；OA 路径相对本仓库。

当前没有未决条目。

## 2. 已接受差异

除非产品方向改变，以下内容不算当前 bug。未在此处或[源码排除项](#5-源码排除项)列出的卡牌均为已对齐，其行为由 `shared/cards/` 下的卡牌文件定义、由相邻测试锁定。已经发现、仍需修复或补测试确认的参考实现差异或高置信行为风险属于未决问题，不是已接受差异。类别行写不下的细节见[单卡备注](#6-单卡备注)。

| 类别 | 卡牌 |
|---|---|
| 维护者裁定的普通牌堆耗尽边界：满足条件即可完成所选档位，每个适用牌类独立抽至多三张剩余牌并留一；空堆跳过，两类皆空也可完成，不降档、不洗牌、不后补。这是 OA 边界裁定，不是官方 FAQ。 | `PS03` |
| Reseller 排除包含畜栏或围栏组件的整条印刷费用候选；没有受支持候选时保留一次性机会。本期边界不排除未来支持组件返还，由 [#849](https://github.com/titanxxh/open-agricola/issues/849) 继续跟踪。 | `E146_Reseller` |
| 用 schema-up metadata 替代参考实现 custom `isBuyable` | `A003_PaperKnife`, `B056_Brook`, `B074_ThickForest` |
| 参考实现未实现，但 OA 有产品扩展/重写。编号 169–180 的卡是 5+ 扩展。 | `A113_HeresyTeacher`, `A169_OffSiter`, `A170_Hayward`, `A171_Sidekick`, `A172_BoatPainter`, `A173_ClayThief`, `A174_MasterHora`, `A175_HollowGardener`, `A176_Wheelmaker`, `A177_Middleman`, `A178_CarpentersBoy`, `A179_MountainShepherd`, `A180_AnimalBrander`, `B169_LivestockSustainer`, `B170_CorralBuilder`, `B171_GreenhouseBuilder`, `B172_CattleCaregiver`, `B173_Sweeper`, `B174_RiverbankGardener`, `B175_FieldOverseer`, `B176_VillageIdiot`, `B177_StoneClawer`, `B178_TagAlong`, `B179_WildBoarHunter`, `B180_GameTeaser`, `C169_FastMason`, `C170_AmateurFencer`, `C171_YoungArtist`, `C172_FieldCounter`, `C173_TopOuter`, `C174_StoneCustodian`, `C175_VillageTeacher`, `C176_Cleanacre`, `C177_MountainHiker`, `C178_OnSiteReverend`, `C179_BovinePioneer`, `C180_Trapper`, `D025_WitchesDanceFloor`, `D159_ReedSeller`, `D169_Plowsmith`, `D170_FoldBuilder`, `D171_SeniorTeacher`, `D172_PutcherMaker`, `D173_TownClerk`, `D174_LoessGardener`, `D175_Countryman`, `D176_Woodshacker`, `D177_Graduate`, `D178_SubstituteTeacher`, `D179_Bullcatcher`, `D180_PartTimeWorker` |
| 反应窗口内新打出的牌不加入该窗口，同一阶段内不会为本次宿主提供它的反应。参考实现可以在手牌打出后激活其节点。维护者 2026-10-20 决定；机制讨论在 [#1181](https://github.com/titanxxh/open-agricola/issues/1181) 继续。 | 在反应窗口内打出卡牌的卡，例如 `C131_PrivateTeacher` 在 Grain Seeds 中打出 `B142_Greengrocer` 时本次不得蔬菜 |
| 参考实现 banned，但 OA 保留 | `A131_CraftTeacher`, `A133_Braggart`, `A014_CarpentersHammer`, `A033_BigCountry`, `A039_Chapel`, `A048_ShavingHorse`, `A082_WorkCertificate`, `A097_Freshman`, `B010_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B015_CarpentersBench`, `B161_Weakling`, `B021_HayloftBarn`, `B022_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C028_TeachersDesk`, `C031_WritingChamber`, `C003_CarriageTrip`, `C060_SmallPottersOven`, `C063_CraftBrewery`, `C099_GardenDesigner`, `D137_TradeTeacher`, `D019_PulverizerPlow`, `D021_Recruitment`, `D033_SummerHouse`, `D004_CrossCutWood`, `D074_RoyalWood`, `D092_ChildOmbudsman`, `D097_BeggingStudent`, `E022_GuestRoom` |
| 参考实现 stable / FarmHand 模型差异 | `B085_FarmHand` |
| 卡牌驱动的工人移动复用普通放人合法性；即使牌面写着“未占用”，容量或 modifier 允许的已占用目标仍可选择，目标行动的普通 `isDoable` 否决仍然生效。E010 在 Farmland 上的每个工人分别选择获得 1 food 或精确移动该工人。D051 的移动以及 E010 每名实际移动的工人各自开启新的规则 Turn Scope，但不增加轮转机会；E010 的食物分支不开启 Turn。 | `D051_Archway`, `E010_StrawHat` |
| Candidate Closure：optional 分支候选集是参考实现单一 topo 序产物的合法超集；solver 层支配剪枝（ADR 0004）后玩家可选集合与参考实现 optimal 集一致，单选项 auto-resolve；卡牌提供的虚拟支付资源以自身 key 进入 `resourcesPaid`，与玩家库存资源不互相支配 | 全部 card-purchase / unit-trade cost 修改卡；B155 这类行动格支付资源 |
| Candidate Closure：等价候选行（同 resources + originalFeeIndex、仅 sources 不同）只保留一条代表行（sources 最少 → key 字典序，ADR 0004）；玩家不再看到仅归因不同的重复支付选项，未选中链的卡不进该选项 hover 归因 | 全部 card-purchase cost 修改卡（C95/E109 fixed-price 双子、A75/D117 bypass 链等） |
| B104 沿用系统 exchange 默认窗口，有意移除原独立入口的计分前机会；收获配方继续可用。 | `B104_SheepWalker` |
| OA 保留明确选择卡上围栏数量。跳过后普通库存不足时拒绝提交，不自动补用卡上库存。选中的实体独立于 B015 折扣：选四建四扣四，选五建四也只扣四。 | `E074_AshTrees` |
| 没有相反作物种子时，不可执行的可选播种分支自动跳过，不显示拒绝提示。 | `E070_CropRotationField` |

## 3. 基础设施待办

只登记尚未实现的跨卡机制。机制实现并有测试或门禁覆盖后删除该条，并把新的通用机制写进 `docs/architecture/` 中对应的 module 文档。已完成的工作记录在 PR、ADR 和测试里，不放在这里。

当前没有未决条目。

## 4. 参考实现坏味道：不要照抄

- 不把导入的前置条件元数据当作规则权威。前置条件以出版社卡牌文字、印刷图标和官方裁定为准；参考实现运行时未使用的字段，在 OA 通用校验中可能成为实际限制。
- 不用混合开轮扫描近似揭牌或开工反应；不靠牌区索引恢复准备窗口，也不在来源发现时按当前支付能力删掉合法反应。
- 不从最初放人格、外层 frame 或最后一个工人反推购买来源；新授予的购买保留自己的节点身份。
- 一次性自身打出效果不得用 `occupation` / `improvement.after` listener；文案要求成功打出或建造卡牌后生效时，不得监听 `pay.after`。自身生效用 `onBuy`，后续反应用已提交的 host 行动。
- 通用消费者不得读取固定单卡的原始状态或提示键，不得枚举内部字段生成展示，也不得把完整内部状态发送给本人。应添加来源只读规则／展示查询或可复用的显式 flow 契约；默认 card-state 架构门禁检查这些边界。
- 不把 `cardId` dispatch 集中到 `SpecialEffect.js` 或单卡 JS 方法；OA 保留 typed pending / action flow。
- 不在 action / main path 中写卡名或一次性逻辑，例如全局 Scythe-style flag 或 C88 的 stable / fence cost relocation；OA 优先使用卡牌本地 hooks / helpers。
- fencing 主路径不得为 C1 / B30 / E149 增加卡牌 id 分支或 `noWoodPalisades` / `midnightFencer` 一类单卡开关；用 `FenceSegment.type` / `source` 与通用 `fencePolicy` 表达差异。
- 不照抄 mutable PHP args 和原地 cost rewrite；OA 保留结构化 modifiers 和 payment enumeration。
- 可从权威计数派生的 infobox 使用卡牌自己的 `getStatePresentation`，不要用内部存取动作 listener 维护同步副本。
- 不要把参考实现在宿主之前结算的用格奖励放到 `after`。listener 阶段按 [ADR 0033](adr/0033-card-listener-timing-follows-the-reference.md) 选择，使 `before` 奖励在同一次行动内可用。
- 行动格使用前 / 完整结束后的反应订阅既有 `place-farmer` 生命周期并筛选 `context.space`，不得用内部节点通配反应近似整格完成。
- listener 资格由共享的封闭目标 / 阶段契约规定，不得从可执行动作注册推断，不得省略筛选条件或修改已注册的筛选对象。
- 参考实现平台状态字段如 `banned`、`implemented` 不应自动驱动 OA 产品行为。
- Moor Special Action 反应使用统一 `moor-action` before/after 身份和原生类型化触发事实；具体特殊行动 ID 仅用于执行、筛选和来源，不能作为 listener 目标。

## 5. 源码排除项

| 来源 | 原因 |
|---|---|
| `C054_MarketStall` | `C054_MarketBooth` 的参考实现 legacy 源文件。 |
| `C071_SlurrySpreader` | `C071_Slurry` 的参考实现 legacy/错误命名源文件。 |
| `D011_LawnFertilzer` | `D011_LawnFertilizer` 的参考实现 typo 源文件。 |
| `E132_Shearer` | `E132_VeggieLover` 的参考实现 legacy 源文件。 |
| 参考实现 `implemented=false` 且无运行时行为的卡牌，例如 `C071_Slurry` | 除非 OA 明确作为产品扩展实现，否则排除出行为对齐范围。 |

## 6. 单卡备注

[已接受差异](#2-已接受差异)中类别行写不下的单卡细节。

| 卡牌 | 备注 |
|---|---|
| `A082_WorkCertificate` | runtime 使用共享 partial-take helper 从 accumulation space 移除资源 |
| `A113_HeresyTeacher` | OA 按牌面对全部合格 Logical Field 在底部加菜，包含 Card Field。 |
| `A169_OffSiter` | 统计 owner 已建 major improvement 与 alsoCountsAs major 小改的 printed wood/clay/reed/stone cost（含 fee cost），总数首次达到 9+ 后锁定提供 1 extra room capacity。 |
| `A170_Hayward` | owner 可在 fencing legal 时通过 anytime action 触发普通 fence flow，不放置工人；该实现仍保留普通 fence listener 语义。 |
| `A171_Sidekick` | owner 在行动卡放人后，可选支付 1 food，通过 `place-farmer-on-space` 在紧邻左侧已揭示行动卡放置另一个可用工人；固定版图行动格既不能启动也不能成为连锁目标，不跳过未揭示 round slot；准入在预留该 1 food 后使用普通放置检查清单（`canPlaceWorkerOnSpace`），覆盖目标行动的 hook/listener veto，Farmers of the Moor 下还要求健康的人，避免付费后目标行动无可执行选项；每步目标用格完成后再激活 cascaded action-space after listener，继续向左检查，停止于无左邻、无 food、无可进入的人、目标 occupied / blocked / 未开放 / 不可执行或 `sidekickChain` 已访问。 |
| `A173_ClayThief` | round start 资源累积后若 hollow-56 有 clay 且未使用，可选标记 used / 更新 infobox，并收取 hollow-56 当前全部 clay；无 clay 或已 used 不触发。 |
| `A174_MasterHora` | owner 在六个 5/6 灰色农夫 linked extension spaces 放人前（含 card-granted extra `place-farmer` 目标选择）可选 1 food -> 1 vegetable；共享当前步骤准入允许通过此 before 尝试；宿主随后仍不可用时等待合法 anytime 或进入 blocked，由玩家显式 undo。 |
| `A177_Middleman` | 打出时在当前 meeple-symbol extension spaces 放置 owner-only 1 stone + 1 food 附件；owner 后续精确使用该行动格时领取并清除该格附件，linked partner 不隐式领取，非 owner 不领取也不消耗；前端仅渲染后端序列化的附件资源和 owner hover 文本。 |
| `A180_AnimalBrander` | animal-market-56 各原动物分支在本地 flow 表达；owner 选择具体分支并完成原结果后，可选额外付 1 food 重放同一 option。允许用原行动所得食物支付重复费用，零食物羊分支可最终得到二羊一食；cattle 分支本地 pay/gain，不再注册独立 action；接受后总付 3 food 得 2 cattle，跳过则只保留原结果。 |
| `B015_CarpentersBench` | 本牌授予的 fence 行动声明一次木材折扣、恰好一个新牧场且只建普通围栏；`paymentBudget: { wood: collectedWood }` 在其他合法费用效果之后约束最终实付，只能使用此次拿取的木材。不提供围栏实体，不安装全局折扣；`fencePolicy.promptHintKey` 提示一个牧场的限制。 |
| `B021_HayloftBarn` | 通过 resource exchange 获得的 grain 已由 provenance helper 触发；空卡 family-growth 使用 `hasInactiveWorkerInSupply`，不会在仅剩 removed worker 时暴露生人 flow |
| `B022_WalkingBoots` | 临时 from-supply worker 归还时标记 `removedFromSupply`，后续 family-growth supply 与玩家面板家庭成员上限都不再计入该 token |
| `B085_FarmHand` | FarmHand stable 通过 Farm Expansion 的 `stables` leaf wrapper（`actionContext.farmHand`）进入共享 stables 付费 / `farm.stableBuilt` 事件 / after-stables listener 链路，cost = 2 wood 并随 C88 等折扣统一生效；OA 允许同一次 stables leaf 混合建造普通 stable 与 FarmHand 特殊 stable。差异：FarmHand 位置不进 `stableTiles`（不计入动物 zone / loose stable 容量），仅经 `computeExtraRoomCapacity` +1 住房，stable count 口径由 `shared/domain/stables.ts` 单独派生。`farm.stableBuilt` item 带 `kind: 'normal' \| 'special'`，special 带 `sourceCardId`。Return-stable（D102 / E76 经 `stable-removal` helper）从通用聚合结果列出特殊 stable，并调用来源卡的 `returnSpecialStable` 归还；FarmHand 清 `extraData.position`、释放 1 个 stable supply、住房容量回 0，但保留 `flagged`（每局一次，回收后不再提供），不产生动物重整 flow。已建特殊 stable 经通用 `getBuiltSpecialStables(player)` hook 以 `SerializedPlayerState.specialStables` 投影给客户端；前端不读 `cardStates['B085_FarmHand']`，也不 import `shared/cards`。 |
| `B170_CorralBuilder` | Pig Market / Cattle Market reveal 的 round start 独立触发，可选执行 B2-style 免费恰好 1 格牧场 non-action fence flow；若一格牧场非法则不补偿。 |
| `B171_GreenhouseBuilder` | 注册 owner-only dynamic action space，只按当前 round 之前已 reveal 且 owner 可执行的 `fencing` / `house-redevelopment` / `vegetable-seeds` printed spaces 暴露对应分支。 |
| `B173_Sweeper` | owner 使用 meeple-symbol extension space 后通过 shared stored-food cashout helper 在卡上放 1 food；一次性 anytime cashout 取走卡上 food、标记 used，职业仍计为已打出且后续不再累计。 |
| `B175_FieldOverseer` | harvest field phase 结束时只统计其他玩家 `harvestReapSummary` 中的 grain field 数，3/4/6+ 按最高阈值给 food/grain/vegetable。 |
| `B176_VillageIdiot` | 打出时丢弃其余职业手牌；通过 hand/played `occupation.isDoable` 与 `providesOccupation` minor 拦截保证其必须是且保持为 lone occupation，并在 opponent 使用 `meeting-place` 后给 owner 1 wood + 1 food。 |
| `B178_TagAlong` | 对手使用 Resource Market 变体后，owner 可选通过 `place-farmer-on-space` 把可用工人放到同一 occupied action space 并执行该行动；owner 自己使用、非 Resource Market、无可进入的人（Farmers of the Moor 下须为健康的人）或目标 blocked / 不可执行时不触发。 |
| `B179_WildBoarHunter` | return home 前按实际 `takenBy` 占用统计 wood accumulation spaces，3+ 且 owner 有 wood 时可选 1 wood -> 1 boar。 |
| `C169_FastMason` | owner collect clay/stone accumulation 后，可选执行匹配材质 renovation：clay collection 只到 clay，stone collection 仅 clay house 到 stone，`exactCost` 去掉 reed。 |
| `C170_AmateurFencer` | onBuy 时若 owner 无 pasture 且 one-space fence legal，可选执行 B2-style 免费恰好 1 格牧场 non-action fence flow。 |
| `C171_YoungArtist` | returning home phase owner 有 food 且至少一个分支可行时，可选付 1 food 后执行无工人 Minor Improvement action，或直接从 ordinary minor deck 抽最多 2 张小改良入手；Minor Improvement 分支按预留/支付该 1 food 后的资源判断，不会展示付费后无可买牌的分支；不可行分支隐藏，不走 keep-one 选择。 |
| `C172_FieldCounter` | opponent 每 plow 1 field 在卡上放 1 food，按 `farm.fieldPlowed.fields` 数量累计；owner 自己 plow 不触发；cashout 复用 shared stored-food helper。 |
| `C173_TopOuter` | 任意玩家使用 house-building-56 后，owner 收取 linked traveling-players-56 当前全部 food；空 food 或非 house-building-56 不触发。 |
| `C175_VillageTeacher` | owner 使用 Lessons 后按当前回合实际 occupied Lessons 数量 1/2/3 给 food/grain/vegetable；linked blocked 格不计数。 |
| `C180_Trapper` | owner 使用 wood accumulation 后，若实际 occupied wood accumulation 数量为 2/3/4，可选 1 food 购买 sheep/boar/cattle。 |
| `D074_RoyalWood` | stables 支付因 afterHost slot 通过 after-pay provenance 统计 |
| `D159_ReedSeller` | OA 已实现公开逐席购买答复、卖方选买家和不预扣款的资源承诺，喂养中也可完成交易。 |
| `D170_FoldBuilder` | 注册 all-player dynamic action space；non-owner 先支付 owner 1 food，再执行 forbid-cancel fence flow 并获得 1 sheep；owner 使用不自付。 |
| `D171_SeniorTeacher` | 监听 opponent Lessons occupation payment 的 `pay.after`，通过 `sumActualPaidResource()` 按 `paymentSources` 还原实际 food 支付；非 Lessons、owner 自付、非 food replacement 不触发，实际付 food 时 owner 固定获得 exactly 1 food。 |
| `D173_TownClerk` | 任意玩家 built card `cardCountsAs(..., 'major')` 后在 owner 卡上放 1 food，包含 `alsoCountsAs: ['major']` 的 minor；ordinary minor 不触发；cashout 复用 shared stored-food helper。 |
| `D175_Countryman` | 任意玩家的 renovation-providing action space 后，owner 可选 sow exactly one field；非 renovation action-space、card-granted 非翻修空间伪装或无合法一田播种不触发。 |
| `D176_Woodshacker` | work phase 中 owner 本回合第 1/2 次使用 wood accumulation 额外给 1/2 clay，按本轮实际使用次数计数（同一空间重复使用也计次），随回家重置。 |
| `D178_SubstituteTeacher` | 注册 owner-only action space，三个可见 Lessons 格都实际 occupied 后可用，奖励为 1 building resource 或 grain+vegetable。 |
| `D179_Bullcatcher` | 注册 owner-only action space，round slot 3 与 round slot 6 对应行动格都 occupied 且 owner 仍有可用工人时可用，使用后获得 1 cattle + 2 food。 |
| `D180_PartTimeWorker` | 收取格上正好有 2/4/6 个货物的累积格时，`computeReplace` 替代方案提供只拿走其余货物、留下 1/2/3 个（混合货物时列出所有合法组合）并获得 sheep/boar/cattle。留下的货物从不进入玩家供给，"拿走至少 N 个"类卡只按实际拿走数判断。卡牌的部分拿取不算使用该格，不提供此选项。混合货物时每种拿走的货物是一次单独的部分拿取。 |
