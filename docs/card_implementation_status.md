# 卡牌实现现状报告

> 生成/更新日期：2026-06-01。本文件替代 `docs/card_desc_audit.md`、`docs/card_progress.md`、`docs/master-plan.md`、`docs/bad-smell.md`。BGA 唯一基准：`/data00/home/xuxinhao.titan/raw/bga-agricola`。

## 1. 当前快照

| 项目 | 状态 |
|---|---:|
| BGA A-E canonical 卡牌 | 888 |
| OA A-E canonical 卡牌定义 | 888 |
| 自动 metadata 脚本 literal mismatch | 0 |
| 自动 metadata 脚本 complex mismatch | 4 |
| 其中 schema-up 已接受差异 | 4 |
| 需要实现复核的卡牌 | 3 |
| 已接受 / 产品策略差异 | 41 |
| 排除的 BGA legacy 或未实现行为目标 | 51 |
| 本轮审计视为已对齐 | 793 |

说明：`scripts/audit-bga-metadata-diff.ts` 现在会解析 BGA `STABLE` 打印成本和 `passing`。当前 literal mismatch 0（passing 已全部对齐）。当前 complex mismatch 是 4 个已接受的 schema-up prerequisite 差异。

审计规则：优先核对卡牌描述文本、custom description、cost、prerequisite、passing、职业/小改 metadata，以及游戏规则行为。BGA 平台/工坊字段如 `banned`、`implemented`、`isCorbariusOrDulcinaria`、`isArtifexOrBubulcus` 不作为对齐要求；如果它们影响产品策略，只记录为已接受差异或排除项，不记为实现 bug。

## 2. 问题优先汇总

BGA PHP 路径默认相对 `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards`；OA 路径默认相对本仓库。

| 卡牌 | 严重度 | 领域 | 差异 | 证据 | 方向 |
|---|---|---|---|---|---|
| `A136_DrudgeryReeve` | 高 | shared scoring | BGA `sharedScoring`，每位玩家可选 0..max sets 并 reserve 资源；OA 仅持卡玩家自动最优计分。 | BGA `A/A136_DrudgeryReeve.php`; OA `shared/cards/A/A136_DrudgeryReeve.ts`, `shared/domain/scoring.ts` | 支持 shared costed scoring / before-end choice。 |
| `C133_Soldier` | 低 | 终局计分选择 | BGA 玩家选择 0..max 对并 reserve wood/stone；OA 自动最优。 | BGA `C/C133_Soldier.php`; OA `shared/cards/C/C133_Soldier.ts`, `shared/domain/scoring.ts` | 若要严格对齐，改成 before-end choice。 |

## 3. 已接受差异

除非产品方向改变，以下内容不算当前 bug。

2026-05-25 重审后，旧 `docs/card_progress.md` §5/§6 的“已接受简化 / 刻意行为差异”不再作为接受依据；相关卡牌已改列 §2 / §11，或在重审后改为已对齐。

| 类别 | 卡牌 |
|---|---|
| 用 schema-up metadata 替代 BGA custom `isBuyable` | `A3_PaperKnife`, `B56_Brook`, `B74_ThickForest`, `B154_SheepKeeper` |
| field/cardField 作物约束差异 | `E70_CropRotationField` |
| BGA 未实现，但 OA 有产品扩展/重写 | `A113_HeresyTeacher`, `D25_WitchesDanceFloor` |
| BGA banned，但 OA 保留 | `A131_CraftTeacher`, `A133_Braggart`, `A14_CarpentersHammer`, `A33_BigCountry`, `A39_Chapel`, `A48_ShavingHorse`, `A82_WorkCertificate`, `A97_Freshman`, `B10_Caravan`, `B117_Informant`, `B132_EstateMaster`, `B151_LittlePeasant`, `B15_CarpentersBench`, `B161_Weakling`, `B22_WalkingBoots`, `C102_TreeGuard`, `C125_Nightworker`, `C28_TeachersDesk`, `C31_WritingChamber`, `C3_CarriageTrip`, `C60_SmallPottersOven`, `C63_CraftBrewery`, `C99_GardenDesigner`, `D137_TradeTeacher`, `D19_PulverizerPlow`, `D21_Recruitment`, `D33_SummerHouse`, `D4_CrossCutWood`, `D74_RoyalWood`, `D92_ChildOmbudsman`, `D97_BeggingStudent`, `E22_GuestRoom` |

## 4. 简洁度审阅

行数只是信号，不是结论。下表列出 OA display+implementation 的非空非注释行数至少为 BGA PHP 2 倍的卡牌。

| 卡牌 | BGA 行数 | OA 行数 | 比例 | 备注 |
|---|---:|---:|---:|---|
| `E161_ElderBaker` | 24 | 73 | 3.04 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `A41_VegetableSlicer` | 24 | 63 | 2.62 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `A87_Conservator` | 21 | 54 | 2.57 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `E16_BriarHedge` | 27 | 68 | 2.52 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `C88_CarpentersApprentice` | 41 | 99 | 2.41 | fence 折扣已从 `reserve-fence-bonus` 机制改为单个 `computeCosts.fence` listener；修复「第 13 个起」下界 bug（旧实现 `freeFences = 15 − getFenceCount` 导致第 13 之前的 fence 也免费，新实现用 `min(end,15) − max(start,13) + 1` 只释放第 13–15 fence）；第 13–15 根免费早退也走 `fencePolicy` 布局门禁，避免无 legal commit 的 confirm-only fence prompt。stable 折扣按 **card-facing stable count**（`getStableCountForCards`，含 B85 FarmHand）计：对齐 BGA `countCarpenterDiscounts(before, totalBuilt)`，只有第 3、4 座各 −1 wood。`computeCosts.stables` listener 读 `params.stableCount`（本次建造总数，含 FarmHand）返回**总额**折扣（非 per-unit，因为部分座折扣无法用单价 delta × count 表达）；dispatcher 的 per-unit computeCosts pass 不带 `stableCount` → 不折扣，折扣统一由 `stables.ts` 的 `applyStableBuildDiscount`（经 `collectComputeCostsForFarmChoice`）按真实 `totalUnits` 重算，避免与 per-unit `ctx.costs` 双算；`buildStableFarmSelection` 额外把「下一座」折扣注入 farm-select 的 maxSelections affordability 扫描。混合建造（1 普通 + B85）跨第 3/4 座时总折扣 −2。 |
| `E118_KindlingGatherer` | 34 | 77 | 2.26 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `D131_CraftsmanshipPromoter` | 25 | 56 | 2.24 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `B18_GrasslandHarrow` | 38 | 82 | 2.16 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `C150_ParrotBreeder` | 74 | 159 | 2.15 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `D1_ZigzagHarrow` | 38 | 80 | 2.11 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `B137_Wholesaler` | 57 | 117 | 2.05 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `D36_BreedRegistry` | 50 | 101 | 2.02 | 已通过 zone-aware hand listener 收敛到本卡局部状态；后续只复核是否还能进一步压缩实现。 |

比例不是唯一信号：`E123_ResourceHoarder`（85/136 = 0.62）和 `E78_SleightofHand`（42/73 = 0.57）已远低于 BGA，是已完成的简化案例；表里高比例卡也要先看是否伴随行为风险再决定优先级。

## 5. 架构审阅

本轮审阅没有发现新的“仅前端裁定规则”路径。主要架构风险来自既有或新暴露的基础设施缺口：

| 风险 | 证据 / 卡牌 | 方向 |
|---|---|---|
| Metadata 审计覆盖需要随字段演进同步 | `scripts/audit-bga-metadata-diff.ts` 已覆盖 `STABLE` cost 和 `passing` | 新增 BGA metadata 字段时同步加 parser/diff fixture，避免统计口径回退。 |
| 主路径 prefix namespace 检查 | 旧 bad-smell 文档中的 `CUSTOM_`、`card_` 模式 | 保留为 helper 常量/函数，避免散落的 startsWith 检查。 |
| Payment provenance 守卫已落地 | construct/renovate bonus choice 已通过 `resource.paid` 携带 selected index；`shared/cards/__tests__/provenance-result-audit.test.ts` 禁止生产卡牌从 `context.result` 读取资源事实 | 新增支付类卡时优先消费 `resource.paid` / `bonusChoiceIndex`，不要读 action result。 |
| 行动格生命周期已进入后端事件层 | `B23_FinalScenario` | 后端持有 reveal/exclusive-use 状态，round-start 统一清理并 emit `action.exclusiveUseCleared`。 |
| Linked action-space occupancy 已进入通用行动格状态 | `WorkerRef.synthetic.kind='linked-occupancy'`、C23_JobContract、C22_BasketChair | 由创建者在 `takenBy` worker ref 上写 source card + linked worker id；后续清理只按同玩家同 linked worker 的 synthetic metadata 删除，不跨读外卡 id，也不删除真实 worker occupancy。 |
| Log / notification provenance | `shared/events/event-mapping-policy.ts` 覆盖全部 public/private event type；`shared/cards/__tests__/provenance-result-audit.test.ts` 守住生产卡牌的 `context.result` 资源事实读取 | 结构化事件层是卡牌判定、UI log、private notification 和 replay 的统一来源；新增支付/资源/farm metadata 路径必须先 emit 事件再让 listener 消费，不要回退到 action result。 |
| Fence segment source/type policy 已进入通用基础设施 | `FenceSegment.type` / `source`、`consume-fence` ownOnly、fencing `fencePolicy`、borrowed `sourcePolicy` / `fenceSources` | 普通 fence / palisade / borrowed source 不通过主路径卡牌分支表达；C1 rebuild、B30 palisade、E149 borrowed fence 都走 segment type/source + generic policy。 |
| Supply token payment 已进入通用资源基础设施 | `PaymentResourceMap`、`supplyTokensConsumed`、payment solver、`resource.paid` | fence / stable 作为支付资源处理；C54/A34 消耗 reserve fence，B149 消耗 stable supply，后续读取可建上限必须走 supply-token helper。 |
| BGA `formatCost` exact/free/paid unit semantics 已进入通用基础设施 | `ExactCost`、`readExactCost()`、`resolveUnitCostWithDelta()`、`reserveResources`；construct / renovation / stables / plow / occupation / fencing policy 的 exact/free 单位成本回归 | 卡牌不再用 `costOverride`、`freeCost`、old `params.cost` path、old `renovation` / `fencing` leaf 表达精确免费/付费单位成本；除已登记 allowlist 的 `E27_PiggyBank` 外，不新增 `-99` 免费成本表达；`{ max: 1 }` 这类 BGA 语义用 `exactCost.max` / action policy 表达；B93 这类“先付职业费、随后强制 future schedule”的支付后资源保留用 `reserveResources` 过滤 payment solutions；nested `fencePolicy.costPolicy` 仍叠加 `computeCosts.fence` 折扣。 |
| 额外放人目标行动语义已进入通用基础设施 | `place-farmer` constraints / `targetSpaceId` actionContext、ActionNode `expandFlow`、`move-farmer-to-space` relocation | B24/C42 额外放人不在卡牌内手写目标行动；选择目标格后由通用 flow 执行目标 action，并让 downstream hooks 用真实目标 space。E10/D51 的 worker relocation 也走同一目标行动 flow。 |
| Plow allowlist 已进入通用行动上下文 | `plow.actionContext.allowedTiles`、D1_ZigzagHarrow | 通用 plow allowlist 同时约束 `selectableTiles`、availability、resolveChoice/payment-stage 校验；D1 raw zigzag candidates 不预过滤越界/占用，最终由 plow validation / `allowedTiles` 交集处理，empty intersection optional leaf auto-skip。 |
| Extra-crop placement provenance 已进入通用行动上下文 | `actionContext.extraCropPlacement`、B115_TinsmithMaster、E71_CowPatty、C69_LandConsolidation | 额外加作物的 selection leaf 通过语义 marker 表达 provenance；pending / anytime 构造从 `contextSnapshot.actionContext` 传递 marker，C69 不再判断 B115/E71 sourceCard id。 |
| Action-level cancel policy 已进入通用基础设施 | `shared/engine/engine-resolve.ts`、farm-select actions、`reorganize`、internal `selection` | 非 `exchange` / `bake-bread` 的 protected atomic action 直接 `cancel` 会在 hook / action resolve 前被 recoverable reject，pending 保持；optional 只走 parent node 的 `__skip__`。当前 protected set 是 `plow` / `sow` / `construct` / `stables` / `fence` / `reorganize` / `selection`。`selection` 默认至少选 1 项，只有显式 `minSelections: 0` 才允许空提交，并且提交路径按 `positionFilter` / `selectableTiles` 校验可选位置。`construct` / `fence` entry guard 还会过滤无 reachable room / 无 legal fence commit 的真实 state，包括 C88 这类 cloned preview player，避免 confirm-only prompt 进入死路；fence layout feasibility 复用缓存的 connected tile sets，避免 availability 检查反复枚举农场组合。 |
| Pasture capacity modifier 已进入通用动物容量基础设施 | `computePastureCapacityModifiers()`、A12/D11/B72 | pasture zone 创建时先按打出顺序应用 replacement，再按打出顺序应用 additive；D11 不再读取 A12 id，A12/B72 不再依赖 `onComputeAnimalZones` 执行顺序或 scratch marker。 |
| Breeding threshold modifier 已进入通用动物繁殖基础设施 | `getBreedThreshold()`、`CardImpl.effect.computeBreedThreshold`、E84 | breed 主路径对每种动物统一计算 source-aware threshold，默认 2，同一动物多个 modifier 取最小值；E84 只在 `sourceCard === 'harvest'` 时把 sheep threshold 降为 1，breed phase 直接写 newborn summary，不再写 virtual sheep 状态。 |
| Private Field Phase 已进入通用收获基础设施 | `private-field-phase` internal action、`reap` trigger metadata、Card Field reaper registry | C72/E25 不再返回未注册 `reap` leaf；普通田和 Card Field 都走 `reason: 'reap'` 事件与同一套 `immediatelyAfter.reap` listener，并用普通 `parallel` flow 承载反应。 |
| Harvest field stage hook parallel 已进入通用收获基础设施 | `onStartHarvestFieldPhase` / `onHarvestFieldPhase` / `onEndHarvestFieldPhase`、`stageResume`、stage-level auto / trigger-select split | 三个 field phase hook 进入阶段时先收集全部可触发 card flows；mandatory non-interactive flow 自动执行，optional / OR / XOR / choice-bearing flow 继续走玩家交互；普通 `reap` 仍在 `onHarvestFieldPhase` reactions 后发生，并保留 `immediatelyAfter.reap` 反应 flow 的 owner。 |
| Harvest feeding requirement modifier 已进入通用收获基础设施 | `computeHarvestFeedingRequirement()`、`registerHarvestFeedingRequirementModifier()`、E30/E159 | E30/E159 对齐 BGA `Player::getHarvestCost()` 公式扩展，不再通过 `onBeforeFeed` / `onAfterFeed` 临时改资源或 worker 标记；喂食主路径只读取通用公式结果。 |
| Harvest count applications 已进入通用收获基础设施 | `HarvestReapSummary.harvestCountApplications`、`HarvestCountModifierResult.tags`、`computeHarvestSelectionThreshold()` | 普通 reap 记录 field/crop/count/source/tag/scope；Harvest Count 可在 top stack 收空后继续消费同田下一层 stack；E73 full-field 使用 `full-field-reap` tag，E112 supply-style 使用 `supply-instead-of-field` tag；`override`（E73 full-field-reap）生效时 `sources` 只记 override 自身来源，被覆盖的 delta-only modifier（如同田 E112）来源不计入、但 tag 仍保留供下游判断；E112 end field phase 只读本次 applications，不再读取 E73 状态；A112/D72 的额外收获选择门槛走通用 threshold modifier。 |
| Harvest outcome helper 已进入通用收获基础设施 | `getHarvestOutcome()`、`harvestReapSummary`、`harvestBreedSummary`、E134 | reap/breed summary 保留到 `onAfterHarvest` 完成后再清理；helper 从本次实际 harvested crop 与 newborn animal summary 组合 outcome；E134 只在 after-harvest 读取 outcome，不再读 live resources 或 E84。 |
| Trailing trigger snapshot 已进入通用 listener 基础设施 | `TriggerSnapshot`、`ActivateCardActionParams.triggerSnapshot`、deferred host cursor、B49/D42/E89/E97 | host action commit 后、trailing listener 执行前冻结每位玩家的已打出 occupation/minor/major/improvement/played 列表与派生 count；activation cursor 持久化 snapshot，按第 N 张职业/改良或平衡数量判断的 listener 读 snapshot helper，不读执行时 live count。 |
| Cross-player undo boundary 已进入通用基础设施 | `confirm-player-switch`、SessionResponse undo availability、`undoStep` / `undoAction` boundary guard | opponent-scope trigger 切到 owner prompt 后不暴露 undo；后续 undo 只能回到切换后的 prompt，不能跨回触发玩家行动状态。 |
| Before-endgame hook flow 已进入通用基础设施 | `onBeforeEndGame?: FlowEffectHandler`、`stageResume.hook='onBeforeEndGame'`、D132_HideFarmer | round 14 的 `onAfterRoundEnd` 完成后先运行 before-endgame hook flow，再进入 `gameover`；hook pending 可通过 stage resume 回到同一终局前链。`anytime-policy` 仅对白名单 D132 optional choice prompt 放开 anytime，数量选择 prompt 仍保持 stage hook chain 锁定。 |
| Card capability metadata 已进入通用基础设施 | `CardDefinition.preventsHandDiscard` / `fireplaceIdentity` / `cookingHearthIdentity` / `ovenIdentity` / `potteryIdentity` / `animalHolder` / `blocksHouseAnimalZones` / `waresSalesmanGains`、`playerHasCardCapability()`、`getPlayedCardDefinitions()`、`collectCardDefinitionsAs()` | 运行时跨卡身份/能力读取不再直接读外卡 id；helper 只扫已打出区，并通过 `asType` 复用 `cardCountsAs`。B146/C35、B153 major identity、C75/A27 fireplace/hearth/oven identity、B31 pottery identity、E144 wares gain、D86 animal-holder occupation filtering、D12 house animal zone blocking 都已迁到 metadata/helper。 |
| Card implementation boundary guard 已进入常规验证 | `pnpm run check:card-impl-boundaries`、`.github/workflows/ci.yml` verify job、`scripts/check-card-impl-boundaries.ts` | 生产 `shared/cards/A-E/*.ts` 中的运行时跨非 Major 卡 id 读取默认失败；`Major_*`、`reaches`、`allowedPurchases`、prerequisite candidate list 仍是明确例外。 |
| House animal zone tag 已进入通用动物分区基础设施 | `AnimalZone.houseAnimalZone`、`isHouseAnimalZone()`、`countHouseAnimals()`、D12/D148/D164 | D148 house-edge card zone 标记为 house animal zone；`computeAnimalZones()` 在所有卡牌 zone 添加后统一用 `blocksHouseAnimalZones` 过滤普通 house zone 和 tagged house zone；D164 统计 house 动物时走 tagged zone helper。 |
| DevMode 卡牌注入/回收路径已对齐 played-card 模型 | `devPlayCard`、`devDrawCard`、`player.improvements`、`availableMajorImprovements` | 调试面板打出/回收卡牌时先清理所有玩家旧 hand/played/improvements/cardStates/activeModifiers/virtual occupation 状态；major 不允许重复归属，draw 已打出 minor/occupation 回目标手牌，major 回公共供应区，PlayerActionCard 动态行动格随旧 owner 一起移除。 |
| 旧兼容路径清理 | old engine choice snapshot/restore、encoded choice shortcut、old field/state backfill、old fence `string[]` coercion 已移除；current farm/selection flow 走 `commitSelection`/structured payload | 不维护旧 pending cursor / old state shape；后续新增交互必须通过 `allowedCommands` / `options` 显式暴露并验证 current typed request，不再把非广告 choice value 当便捷入口。 |
| 注释里的非阻塞 card-id 示例 | `shared/actions/effects/breed.ts`、`shared/contract/types.ts` 仅把 `A165_PigBreeder` / `D95_SiteManager` 作为例子提到 | 除非附近代码变动，否则保留；它们不是可执行的单卡分支。 |

注：React/Suspense、CDN、browser fallback 等属于平台/浏览器正常术语，不视为卡牌架构风险。

## 6. 基础设施待办

当前没有开放的基础设施 umbrella 待办。已完成的历史条目已从本节移除；仍需持续关注的通用机制记录在 §5 架构审阅。

本轮新增已完成基础设施：Extra-turn 轮转扩展点（A92_AdoptiveParents，#203+#204）。`CardEffect` 新增 `contributeExtraTurn?: (state, player) => ActionFlow | void` hook（返回 XOR `[use, forfeit]` flow）；`shared/cards/card-effects.ts` 提供聚合谓词 `hasPendingExtraTurn(state, player)` 与 flow 收集器 `collectExtraTurnFlow(state, player)`——该 hook 不经 `runCardEffectHook` 自动执行，而是被 `shared/session/phases/round.ts` 主动消费（单一真相源，gating 与 flow 不会漂移）。round.ts 三处 gating 据此判定：选下一活跃玩家（`workersAvailable > 0 || hasPendingExtraTurn`）、round-work 完成谓词（全员 `workersAvailable <= 0 && !hasPendingExtraTurn`）、轮转 skip 循环（0-worker 玩家若 `hasPendingExtraTurn` 则停轮）——普通工人耗尽但被卡牌欠一次额外回合的玩家不再被提前跳过，而是收到 `collectExtraTurnFlow` 推送的 XOR[用, 放弃]（Forfeit=放弃该额外放工）。A92 是首个使用者（BGA pull model，对齐 BGA `stLabor` 的 adoptive supply-placement）；任何想换取轮转额外行动的卡可复用。后续 hardening 已补齐：A92 自身 extra-turn prompt 内不再暴露 A92 anytime grow；mandatory skip-turn 通过内部 `_extraTurnSkipCount` / `countExtraTurns` 逐个消费 extra-turn opportunity（含 stacked skip 与超过玩家数的 same-seat skip 链）；`countPendingExtraTurns` / `consumePendingExtraTurns` 通过同一聚合顺序计算并消耗剩余 pending extra-turn，forced consume 记录在 session-transient `_extraTurnConsumedCount`，并由 `special-effect.consume-pending-extra-turns` 暴露给卡牌 flow；失败的 extra-turn 目标行动会按 `placedWorkerId` 回滚真实 target space（含 auto-resolved target failure 与 pending-context fallback）；forfeit 写入可见 declined-card log；多 newborn 与 promoted adult feeding 均有 session 覆盖。

本轮新增已完成基础设施：Family-growth availability 与执行条件对齐。`family-growth.canBeExecutedByPlayer` 现在先检查玩家是否仍有 inactive worker；普通 `wish-children` 继续检查房间容量，`urgent-wish-children` / 卡牌注入的 `skipRoomCheck` 路径只跳过房间要求，不跳过 worker supply 要求。B151_LittlePeasant 这类允许进入已占用行动格的 computeArgs 路径因此不会在玩家已经没有可激活 worker 时继续暴露 occupied `urgent-wish-children`，避免 place-farmer 选择进入必失败的 family-growth flow。

本轮新增已完成基础设施：Special-effect description preview 仅展示玩家语义动作。`special-effect` 继续按 `params.kind` 为 `promote-first-newborn`、`pop-card-stack-top`、`set-extra-data` 等可理解步骤提供描述；纯卡面提示同步 `set-infobox` 不进入 `descriptionPreview`，避免 C115_Sower 这类选项把内部状态刷新显示成额外行动。

本轮新增已完成基础设施：Card implementation boundary guard。`pnpm run check:card-impl-boundaries` 使用 TypeScript AST 扫描生产 `shared/cards/A-E/*.ts` 中的运行时跨卡 id 读取，并已接入 CI verify job；默认阻断违规，只有显式 `--warn-only` 才作为本地审计模式运行。

本轮新增已完成基础设施：Pasture capacity modifier。`computeAnimalZones()` 在构造 pasture zone 时收集已打出卡的 `computePastureCapacityModifiers()`，先应用 replacement，再应用 additive，同类按打出顺序。A12_DrinkingTrough、D11_LawnFertilizer、B72_LoveforAgriculture 已迁入该机制；size-one pasture replacement 不再通过 D11 直接读取 A12，也不再用 `lawnFertilized` scratch marker 避免 double-add。

本轮新增已完成基础设施：Card capability metadata 与 played-card helper。`CardDefinition` 增加 typed runtime metadata，`CardBase.toJSON()` 原样保留；`getPlayedCardDefinitions()` / `collectCardDefinitionsAs()` / `playerHasCardCapability()` 只检查已打出区，`asType` 复用 `cardCountsAs`。B146/C35 的 hand-discard prevention 已从直接 C35 id 读取迁到 `preventsHandDiscard`；B153、C75/A27、B31、E144、D86、D12 已分别迁到 major identity collection、fireplace/hearth/oven identity、pottery identity、wares gain metadata、animal-holder occupation filtering、house animal zone blocking。

本轮新增已完成基础设施：House animal zone tag。`AnimalZone.houseAnimalZone` 标记“视作 house 动物区”的非 house zone；`computeAnimalZones()` 在所有 `onComputeAnimalZones` 完成后，如果玩家有 `blocksHouseAnimalZones` capability，就统一移除 `zoneType === 'house'` 或 `houseAnimalZone === true` 的 zone。`countHouseAnimals()` 用同一判定统计 D164 这类 house-zone 规则，避免 D164 读取 D148 id。

本轮新增已完成基础设施：Harvest count applications 与 harvest selection threshold modifier。`reap()` 在本次 `HarvestReapSummary.harvestCountApplications` 中记录 field/crop/count/source/tag/scope；`HarvestCountModifierResult.tags` 表达 full-field reap、supply-instead-of-field 这类语义标签；E112 end field phase 只读取本次 applications 判断是否补 grain，不再读取 E73 状态；A112/D72 的可选田门槛改由 `computeHarvestSelectionThreshold()` 统一计算，E112 通过注册 modifier 把 grain field 门槛降为 1。

本轮新增已完成基础设施：Breeding threshold modifier。`breed()` 对每个 animal type 调 `getBreedThreshold(state, player, animalType, { sourceCard })`；默认 threshold=2，多个已打出卡返回同一动物门槛时取最小值。E84_DollysMother 已迁为 `computeBreedThreshold`，仅 harvest-source sheep breeding 降为 1；card-triggered breed 不受影响，且不再写 `virtualSheepAdded` 或临时改 live 资源。

本轮新增已完成基础设施：Harvest outcome helper。`harvestReapSummary` 不再在 field phase 后清理，而是和 `harvestBreedSummary` 一起保留到 `onAfterHarvest` 完成后清理；`getHarvestOutcome(state, playerId)` 从两份 summary 组合本次实际 harvested crop types 与 newborn animal types。E134_Omnifarmer 已迁到 `onAfterHarvest` 读取 outcome，提交选择时重新校验 outcome、stored goods 和当前可支付资源。

本轮新增已完成基础设施：Trailing trigger snapshot。`activate-card` params 携带 `TriggerSnapshot`，deferred host continuation 在 onBuy / afterHostCommit flow 前冻结 snapshot 并随 cursor 恢复；B49_Scales、D42_EducationBonus、E89_Stallwright 改用 snapshot helper 读取触发时 played-card count，E97_Beneficiary 不再内嵌 E89 stable 分支。

本轮新增已完成基础设施：Action-level cancel policy。`plow` / `sow` / `construct` / `stables` / `fence` / `reorganize` / internal `selection` 均不再把 direct `cancel` 当 action-level success path；可选跳过由父级 optional node 的 `__skip__` 表达。`selection` 默认至少选 1 项，只有显式 `minSelections: 0` 才允许空提交，并且提交路径按 `positionFilter` / `selectableTiles` 校验可选位置。`construct` / `fence` 的 doability 会在真实 state 中排除无可提交布局，包括 cloned preview player，避免 direct cancel 被拒绝后出现不可完成 pending；fence layout feasibility 复用缓存的 connected tile sets，避免 availability 检查反复枚举农场组合。

本轮新增已完成基础设施：zone-aware card listener。listener 默认只匹配已打出卡，显式 `zones: ['hand', 'played']` 才能在手牌中监听；匹配结果向 handler 透传 `ownerCardZone`。D36 这类单卡历史需求落在本卡 `cardStates`，不新增全局 sheep stats；手牌卡的局部 `cardStates` / 以该手牌卡为 source 的 public events / 派生 log entry / 过滤后的 event/archive seq cursor / runtime `publicEventCancellations` / 按手牌 id keyed 的 `cardAvailability` 在非 owner snapshot 中隐藏。收获喂食转食物通过通用 `harvest-feed-conversion` synthetic listener dispatch 暴露 `harvest.feedConverted` 事件；future meeple 结算通过通用 `future-meeple-resolved` synthetic listener dispatch 暴露 `futureMeeple.resolved` 事件。两者都不在 session core 写单卡分支。

本轮新增已完成基础设施：Private Field Phase。`private-field-phase` 是内部行动，按来源卡触发只收获玩家自己的普通田和 Card Field，不启动完整 Harvest；事件统一使用 `reason: 'reap'`，并携带 `trigger.phase` 区分 `harvest` / `private-field-phase`。普通田和 Card Field 的 `immediatelyAfter.reap` listener 结果统一收集进普通 `parallel` flow，避免在 dispatch 阶段直接改状态。

本轮新增已完成基础设施：Harvest field stage hook parallel。`onStartHarvestFieldPhase` / `onHarvestFieldPhase` / `onEndHarvestFieldPhase` 进入阶段时先收集全部可触发 card flows；mandatory non-interactive flow 走普通 `parallel` 自动执行，optional / OR / XOR / choice-bearing flow 仍走 `trigger-select` 交互。`immediatelyAfter.reap` 反应 flow 在普通收获和私有田收获汇总前都按 reacting owner 写入 target，避免多人 harvest 中跨玩家写 `cardStates`。

本轮新增已完成基础设施：before-endgame hook flow。`onBeforeEndGame` 作为 `FlowEffectHandler` 在 round 14 后、gameover 前运行，允许卡牌生成终局前 pending 并通过 `stageResume` 恢复；D132 的 optional prompt 是 stage hook chain 中唯一放开 anytime 的 before-endgame choice prompt，后续数量选择不放开，避免 stale max。

保留的后续边界：`C23_JobContract`、`B152_JuniorArtist`、`C117_Legworker` 与 space-pairing 的 cost / jump / adjacency 语义相关，不属于 shared lessons action-space id helper 关闭范围。

本轮新增已完成基础设施：Stable count semantics helper。`shared/domain/stables.ts` 集中畜栏计数口径：`getOrdinaryStableCount`（普通 stable tile，用于动物容量 / placement / supply）、`getStableCountForCards`、`getUnfencedStableCountForCards`、`getEmptyUnfencedStableCountForCards`（card-facing 口径在 helper 内部封装 B85 FarmHand position 读取，B85 永远算 1 个 unfenced / empty-unfenced stable）。`getFarmHandStableInUseCount` 从 `supply-tokens.ts` 移入本 helper，`getAvailableStableSupplyCount` 改用 `getOrdinaryStableCount`。业务代码不再直接读 `player.stableTiles.length`，由 `shared/domain/__tests__/stable-count-guardrail.test.ts` 静态扫描 `shared/cards/**` 与 `shared/domain/**` 阻断（白名单仅 `shared/domain/stables.ts` 与测试/fixture）。#184：C88 折扣口径已校准为 card-facing（`getStableCountForCards`，含 B85），混合普通 + B85 stable 建造经 `stables.ts` 的 `applyStableBuildDiscount`（`collectComputeCostsForFarmChoice` 按真实 `params.stableCount` 重算总额折扣）统一结算，详见 §C88 appendix。#186：完成其余 card-facing 口径校准——`B54`/`E43`/`D168`/`E114`/`C56` 改用 `getStableCountForCards`（“你拥有畜栏 / 第 N 座畜栏”序数定位含 B85），`C101`/`D72` 改用 `getUnfencedStableCountForCards`，`C49` 改用 `getEmptyUnfencedStableCountForCards`（B85 永远算 1 个 empty unfenced）；动物容量 / placement / supply / `getStableTilesBuiltThisAction`（after-stables 本次建造数，归 #185）继续用 `getOrdinaryStableCount`，B85 不获得动物容量。

本轮新增已完成基础设施：After-stables built-count card semantics（#185）。`shared/cards/helpers/action-snapshot.ts` 的 `recordActionSnapshot` / `getStableTilesBuiltThisAction` 改用 `getStableCountForCards`（含 B85），使「本次建造畜栏数」delta = card-facing 座数（对齐 BGA `numStablesBuiltThisTurn`：B85 solo 算 1 座、mixed 普通 + B85 算总数）。「建 ≥1 座」listener（`A43_FarmyardManure` / `A74_StableTree` / `A167_BreederBuyer` / `B27_Toolbox`）与「建 ≥2 座」listener（`D166_StableMilker`）对 B85 solo / mixed 正确触发。「第几座」序号卡 `D168_Stockman` / `E114_ShedBuilder` 与 4th-stable bonus 卡 `C56_FeedFence` 的 `nAfter` 改用 `getStableCountForCards`（对齐 BGA `countStablesForCards()`），B85 占一个建造序号位。B85 不计入 animal / pasture capacity（仍走 `getOrdinaryStableCount` / animal-zone）。after-stables payment ordering（stable-built event → after-stables effects → stables payment）保持不变。

本轮新增已完成基础设施：Special-stable card-effect 扩展点（#189 解耦）。核心 `shared/actions/effects/stables.ts` 不再 import 任何具体卡牌——B85 专属逻辑（`getFarmHandStablePositions` / `applyFarmHandStable` / `FARM_HAND_CARD_ID`）经 card-effect 聚合机制收口到卡牌文件。`CardEffect` 新增可选 `getSpecialStablePositions(state, player) => FarmTilePosition[]` 与 `applySpecialStable(state, player, position) => boolean`；`card-effects.ts` 新增聚合 `collectSpecialStablePositions`（遍历所有卡候选，每项带 `sourceCardId`）与 `applySpecialStableAt`（委派结算，返回 `sourceCardId`）。`stables.ts` 的 `buildStableFarmSelection` 用 `collectSpecialStablePositions` 注入协议字段 `farmHandPositions`（字段名为前端兼容保留不变），`finalizeStables` 用 `applySpecialStableAt` 结算并以其返回的 `sourceCardId` 填 `farm.stableBuilt` 的 `kind:'special'` item。门控通用化为 `isSpecialStableEntry`（`actionContext.farmHand === true`，仅 Farm-Expansion stables leaf 设置；E148 / A089 / C94 不提供）。B85_FarmHand 的 `effect` 实现这两个方法封装原 helper，`sourceCardId = 'B85_FarmHand'`。`check:card-impl-boundaries` 通过，核心 stables 文件 0 单卡 import。

本轮新增已完成基础设施：Built-special-stable snapshot 展示派生（#200）。`CardEffect` 第三个并列方法 `getBuiltSpecialStables?(player) => FarmTilePosition[]` 返回该卡当前矗立的特殊 stable（建造前 / 回收后空）；`card-effects.ts` 聚合 `collectBuiltSpecialStables(player) => { position, sourceCardId }[]`。`serializeState` 据此给每个序列化玩家派生展示字段 `SerializedPlayerState.specialStables`——领域真相仍在 `cardStates`，仅进 snapshot，不进 `PlayerState`/`GameState`；`rehydrateState` 显式剥离避免泄漏回权威态。前端只读该通用字段渲染已建 overlay，后端聚合无 B85-specific 分支，B85 的 effect 实现封装 `readFarmHandPosition`。

## 7. Log 系统对比

BGA 的日志是两层结构：`Core/Notifications.php` 负责玩家可见 gamelog 和客户端状态/动画通知，`Helpers/Log.php` 负责数据库变更、checkpoint/step/engine 边界、undo 后取消旧 gamelog packet 并发 `clearTurn` / `refreshUI` / `refreshHand`。

OA 没有照抄 notification-as-rule-source，而是建了一个比 `GameState.log` 更底层的**结构化事件层**：规则执行时 emit 事件，再由事件统一派生 UI log、瞬时通知、高亮、资源动画、审计和 replay。后端 state 仍是唯一权威。

### 事件层组成

- **GameState 字段**（`shared/contract/types.ts`）：`log`（i18n key + params 的可见日志）、`events`（`GameEvent[]` 结构化事件流）、`nextEventSeq`、`publicEventArchive`（`PublicEventArchivePacket[]`）、`nextPublicEventArchivePacketSeq`。
- **Public events**（`shared/contract/events.ts`）：49 种事件类型，覆盖 resource / farm / worker / action / card / futureMeeple / 生命周期（round / work / returnHome / harvest / game）。统一 `GameEventBase`（`schemaVersion` / `id` / `seq` / `round` / `phase` / `type` / actor / target / source / `trigger`），经 `EventSink.emit` / `emitMany` 写入。
- **Private events**（`shared/contract/private-events.ts`）：`private.promptShown` / `private.handChanged` / `private.draftUpdated` 三种，带 `recipientPlayerId` 做 per-viewer masking——非目标玩家看到 redaction，draft picks 被遮蔽。
- **Mapping policy**（`shared/events/event-mapping-policy.ts`）：每个事件类型声明四个消费通道（log / notification / highlight / resourceAnimation）和 replay 归类（`replayable` / `metadataOnly`），通道可带条件。
- **Log mapper**（`shared/events/log-mapper.ts`）：`eventsToLogEntries()` 把 `GameEvent[]` 批量转 `LogEntry[]`。
- **Archive packet**（`shared/events/archive.ts`）：`publicEvents.committed` 持久化已提交事件序列；`publicEvents.canceled` 在 undoStep / undoAction 时记录被撤销事件的完整副本和 seq 窗口。

### 卡牌判定

Card listener（`shared/cards/card-listeners.ts`）收到 `transactionEvents`（整个工作事务的事件）、`actionEvents`（当前行动/阶段切片）和类型化 `eventQuery`（`has` / `find` / `filter`）。资源类卡牌优先读 `actionEvents`、回退 `transactionEvents`。`resource.paid` 携带 `paymentFor` / `paymentSources` / `bonusSources` / `bonusChoiceIndex` / `returnedCardId`，支付折扣 / 退卡类卡牌据此判定，不依赖 action result 资源事实。

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
| effect | `computeCostedBonus` | `A136_DrudgeryReeve`, `C133_Soldier`, `C99_GardenDesigner`, `E132_VeggieLover` |
| effect | `computeExtraRoomCapacity` | `A10_WoodenShed`, `A127_Lodger`, `A85_Homekeeper`, `B10_Caravan`, `B85_FarmHand`, `C10_BunkBeds`, `D85_Reader`, `E85_MasterTanner` |
| effect | `computeLockedFarmTiles` | `B38_FutureBuildingSite` |
| effect | `computeSharedPostScore` | `A135_AnimalReeve`, `B136_HouseSteward`, `C136_RanchProvost` |
| effect | `getInvalidAnimals` | `B11_Feedyard`, `C11_WildlifeReserve`, `C12_CattleFarm`, `C148_MudWallower`, `C86_LivestockFeeder`, `E11_PettingZoo`, `E33_BeaverColony`, `E36_HerbalGarden`, `E86_PenBuilder` |
| effect | `onAfterHarvest` | `B82_ValueAssets`, `C34_ElephantgrassPlant`, `C66_EternalRyeCultivation`, `D99_EarthenwarePotter`, `E134_Omnifarmer`, `E91_PlowBuilder` |
| effect | `onAfterReap` | `A106_SlurrySpreader`, `A59_PotatoRidger`, `A64_BarleyMill`, `B21_HayloftBarn`, `B58_CrackWeeder`, `C106_PotatoHarvester`, `C120_AgriculturalLabourer`, `D113_FoodMerchant`, `D126_FieldCultivator`, `D63_Lynchet`, `D65_GrainSieve` |
| effect | `onAfterRoundEnd` | `A165_PigBreeder`, `A54_Credit`, `B53_SculptureCourse`, `D167_PureBreeder`, `D64_BakingCourse`, `D79_CarrotMuseum`, `E87_MasterRenovator` |
| effect | `onAllWorkersPlaced` | `E125_DelayedWayfarer` |
| effect | `onBeforeEndGame` | `B133_VillagePeasant`, `D132_HideFarmer` |
| effect | `onBeforeHarvest` | `A166_Haydryer`, `C92_AutumnMother`, `D32_WoodRake`, `D98_Transactor` |
| effect | `onBeforePlayerTurn` | `D134_OysterEater`（non-flow skip-control，labor turn 入口同步消费 `{ skipTurn?: true }`） |
| effect | `contributeExtraTurn` | `A92_AdoptiveParents`（轮转额外行动：玩家普通工人耗尽但仍持未激活后代时返回 XOR[use, forfeit] flow；被 round.ts 主动消费、order-independent；轮转据此不提前跳过该玩家；内部 `countExtraTurns` 让 skip-turn / forced consume 逐个 opportunity 消费） |
| effect | `onBeforeReturnHome` | `B117_Informant`, `B140_FarmyardWorker`, `B158_DistrictManager`, `B160_PubOwner`, `D130_RecreationalCarpenter`, `D142_PotatoPlanter`, `D51_Archway`, `E10_StrawHat`, `E143_Hewer`, `E158_StoneCustodian`, `E23_Apiary`, `E26_Sundial`, `E27_PiggyBank` |
| effect | `onBeforeStartOfTurn` | `A130_MummysBoy`, `A22_Telegram`, `A49_NestSite`, `B106_MoralCrusader`, `B124_Trimmer`, `B140_FarmyardWorker`, `B70_NewPurchase`, `B89_Groom`, `C101_StallHolder`, `C111_SmallAnimalBreeder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C157_ResourceAnalyzer`, `C46_Mandoline`, `C64_CornSchnappsDistillery`, `C67_MineralFeeder`, `C84_PerennialRye`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D46_PelletPress`, `D48_CivicFacade`, `D53_TeaHouse`, `E162_Entrepreneur`, `E22_GuestRoom`, `E28_Bookmark`, `E56_RomanPot`, `E62_SourDough`, `E93_Motivator`, `E96_Elder` |
| effect | `onBuy` | `A102_Grocer`, `A112_ScytheWorker`, `A117_WoodCarrier`, `A11_MudPatch`, `A120_ClayHutBuilder`, `A121_ClayPuncher`, `A125_Priest`, `A127_Lodger`, `A134_FullFarmer`, `A135_AnimalReeve`, `A136_DrudgeryReeve`, `A13_RenovationCompany`, `A144_Sequestrator`, `A162_ForestTallyman`, `A165_PigBreeder`, `A167_BreederBuyer`, `A16_RammedClay`, `A19_Handplow`, `A1_Shelter`, `A20_DoubleTurnPlow`, `A22_Telegram`, `A27_OvenSite`, `A2_ShiftingCultivation`, `A33_BigCountry`, `A36_FacadesCarving`, `A39_Chapel`, `A3_PaperKnife`, `A40_PottersYard`, `A43_FarmyardManure`, `A44_PondHut`, `A47_Trellises`, `A4_Baseboards`, `A53_Claypipe`, `A54_Credit`, `A57_MilkingParlor`, `A5_ClayEmbankment`, `A69_LargeGreenhouse`, `A6_StorageBarn`, `A74_StableTree`, `A77_Hod`, `A7_GardenersKnife`, `A86_AnimalTamer`, `A89_StablePlanner`, `A8_FoodBasket`, `A9_YoungAnimalMarket`, `B102_Consultant`, `B105_CaseBuilder`, `B107_Manservant`, `B113_PatchCaregiver`, `B116_Shoreforester`, `B117_Informant`, `B119_Lumberjack`, `B123_RoofBallaster`, `B124_Trimmer`, `B125_EstateWorker`, `B127_Seducer`, `B136_HouseSteward`, `B137_Wholesaler`, `B141_FieldCaretaker`, `B148_PetBroker`, `B149_OpenAirFarmer`, `B14_Hawktower`, `B160_PubOwner`, `B163_Pastor`, `B164_SheepWhisperer`, `B167_StableSergeant`, `B16_MiningHammer`, `B18_GrasslandHarrow`, `B19_MoldboardPlow`, `B1_UpscaleLifestyle`, `B20_ChainFloat`, `B21_HayloftBarn`, `B22_WalkingBoots`, `B23_FinalScenario`, `B25_BreadPaddle`, `B27_Toolbox`, `B29_CookeryLesson`, `B2_MiniPasture`, `B33_Mantlepiece`, `B37_Grange`, `B38_FutureBuildingSite`, `B3_Moonshine`, `B41_Hauberg`, `B42_ForestInn`, `B44_ChickStable`, `B45_StrawberryPatch`, `B46_ClubHouse`, `B48_ForestStone`, `B4_WoodPile`, `B52_GrowingFarm`, `B54_Tumbrel`, `B55_MaintenancePremium`, `B58_CrackWeeder`, `B59_FoodChest`, `B5_StoreofExperience`, `B65_GrainDepot`, `B66_SackCart`, `B6_ExcursiontotheQuarry`, `B71_HarvestHouse`, `B73_GiftBasket`, `B74_ThickForest`, `B76_Ceilings`, `B78_ReedBelt`, `B7_Wage`, `B83_MuddyPuddles`, `B84_AcornsBasket`, `B88_EstablishedPerson`, `B89_Groom`, `B8_MarketStall`, `B93_Confidant`, `B96_TreeFarmJoiner`, `B99_Tutor`, `B9_BeatingRod`, `C104_Collector`, `C106_PotatoHarvester`, `C107_Baker`, `C108_Layabout`, `C113_WinterCaretaker`, `C116_FurnitureMaker`, `C118_WoodCollector`, `C119_SkillfulRenovator`, `C121_ClayKneader`, `C127_Lover`, `C135_Constable`, `C136_RanchProvost`, `C139_BasketmakersWife`, `C140_PackagingArtist`, `C143_StoneBuyer`, `C144_ReedRoofRenovator`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C155_FoodDistributor`, `C156_HoofCaregiver`, `C161_PotatoDigger`, `C162_ForestOwner`, `C165_GameCatcher`, `C166_CattleWhisperer`, `C16_FieldFences`, `C17_NewlyPlowedField`, `C19_SwingPlow`, `C1_Overhaul`, `C22_BasketChair`, `C24_BedintheGrainField`, `C26_Flail`, `C2_Stable`, `C38_Christianity`, `C39_StudioBoat`, `C3_CarriageTrip`, `C40_CanvasSack`, `C44_ChickenCoop`, `C47_GardenClaw`, `C4_WritingBoards`, `C50_StableYard`, `C57_Crudite`, `C5_Remodeling`, `C60_SmallPottersOven`, `C65_Granary`, `C6_StoneClearing`, `C72_FestivalPlanning`, `C74_PrivateForest`, `C77_ClaySupply`, `C78_ReedHattedToad`, `C79_StoneCart`, `C7_BladeShears`, `C81_MaterialHub`, `C83_EarlyCattle`, `C86_LivestockFeeder`, `C87_Mason`, `C89_StableMaster`, `C8_PlantFertilizer`, `C98_CubeCutter`, `C9_AutomaticWaterTrough`, `D109_SowingMaster`, `D114_SeedTrader`, `D116_TreeInspector`, `D117_WoodExpert`, `D118_Bonehead`, `D120_ClayDeliveryman`, `D122_ClayCarrier`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D131_CraftsmanshipPromoter`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D141_SeedSeller`, `D145_RoofExaminer`, `D156_RetailDealer`, `D162_ClayFirer`, `D166_StableMilker`, `D167_PureBreeder`, `D1_ZigzagHarrow`, `D20_TurnwrestPlow`, `D22_WorkPermit`, `D23_PioneeringSpirit`, `D2_DwellingPlan`, `D3_Furrows`, `D40_Cesspit`, `D41_HorseDrawnBoat`, `D43_Hutch`, `D44_ForestWell`, `D45_SheepWell`, `D47_Churchyard`, `D4_CrossCutWood`, `D50_ForeignAid`, `D51_Archway`, `D57_WholesaleMarket`, `D5_FieldClay`, `D60_LargePottery`, `D62_BeerTap`, `D67_ReapHook`, `D69_SmallGreenhouse`, `D6_PetrifiedWood`, `D74_RoyalWood`, `D78_ReedPond`, `D7_Trident`, `D84_FeedPellets`, `D88_Millwright`, `D8_FernSeeds`, `D91_Plowman`, `D96_Furnisher`, `D97_BeggingStudent`, `D99_EarthenwarePotter`, `D9_GameTrade`, `E103_Wolf`, `E104_SpiceTrader`, `E105_Pioneer`, `E106_EmergencySeller`, `E119_LandHeir`, `E120_ScrapCollector`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E127_DiligentFarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E138_LivestockExpert`, `E139_BunnyBreeder`, `E140_Carter`, `E145_Parvenu`, `E148_Lazybones`, `E155_Visionary`, `E161_ElderBaker`, `E167_DairyCrier`, `E1_PoleBarns`, `E22_GuestRoom`, `E25_BumperCrop`, `E28_Bookmark`, `E2_RenovationMaterials`, `E33_BeaverColony`, `E3_TeaTime`, `E40_BeeStatue`, `E41_MuddyWaters`, `E42_WaterGully`, `E43_BarnCats`, `E44_FodderBeets`, `E45_FruitLadder`, `E46_WaterlilyPond`, `E4_Thunderbolt`, `E51_WhaleOil`, `E56_RomanPot`, `E5_NightLoot`, `E60_WorkingGloves`, `E63_IronOven`, `E64_SimpleOven`, `E65_Almsbag`, `E6_Recount`, `E74_AshTrees`, `E76_LumberPile`, `E78_SleightofHand`, `E7_Pumpernickel`, `E81_AlchemistsLab`, `E82_Profiteering`, `E8_FarmersMarket`, `E94_Prophet`, `E97_Beneficiary`, `E98_Prodigy`, `E9_BarteringHut` |
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
| effect | `onRoundStart` | `A19_Handplow`, `A76_Cob`, `A81_InterimStorage`, `A89_StablePlanner`, `A90_PlowDriver`, `A96_TaskArtisan`, `B110_Pavior`, `B114_Childless`, `B116_Shoreforester`, `B118_SmallscaleFarmer`, `B135_NutritionExpert`, `B18_GrasslandHarrow`, `B23_FinalScenario`, `B29_CookeryLesson`, `B57_Scullery`, `B69_PottersMarket`, `B81_Handcart`, `B93_Confidant`, `B97_Scholar`, `C103_GreenGrocer`, `C123_Freemason`, `C125_Nightworker`, `C159_FishermansFriend`, `C21_HeartofStone`, `C39_StudioBoat`, `D116_TreeInspector`, `D22_WorkPermit`, `D54_TroutPool`, `D69_SmallGreenhouse`, `D91_Plowman`, `D93_SheepInspector`, `E100_MuseumCaretaker`, `E102_Acquirer`, `E111_Recluse`, `E126_TaxCollector`, `E152_BargainHunter`, `E168_AnimalTamersApprentice`, `E88_MasterFencer` |
| effect | `onSowExtraField` | `B113_PatchCaregiver`, `B141_FieldCaretaker`, `B68_Beanfield`, `B72_LoveforAgriculture`, `C70_LettucePatch`, `D25_WitchesDanceFloor`, `D75_WoodField`, `E68_CherryOrchard`, `E69_MelonPatch`, `E70_CropRotationField`, `E72_ArtichokeField`, `E80_RockGarden` |
| effect | `onStartHarvest` | `C24_BedintheGrainField`, `C62_CookeryExtension`, `D129_LumberVirtuoso`, `D153_WealthyMan`, `D61_BaleofStraw`, `D97_BeggingStudent`, `E110_Dentist`, `E111_Recluse`, `E117_PipeSmoker`, `E147_AnimalDriver`, `E149_MidnightFencer`, `E58_LunchtimeBeer`, `E61_RaisedBed` |
| effect | `onStartHarvestFeedingPhase` | `C107_Baker`, `E52_Cubbyhole` |
| effect | `onStartHarvestFieldPhase` | `A112_ScytheWorker`, `B165_GameProvider`, `B61_ThreeFieldRotation`, `C57_Crudite`, `D70_StrawManure`, `D72_StableManure`, `E112_GrainThief`, `E73_Scythe` |
| effect | `onStartReturnHome` | `A100_Curator`, `A127_Lodger`, `A141_TurnipFarmer`, `A151_Minstrel`, `A152_NightSchoolStudent`, `A157_Bohemian`, `A35_SwimmingClass`, `A58_AsparagusKnife`, `C155_FoodDistributor`, `C97_SeedResearcher`, `D102_SampleStableMaker`, `D107_Bellfounder`, `D10_StorksNest`, `D18_SteamPlow`, `E20_IronHoe`, `E87_MasterRenovator` |
| effect | `resolveChoice` | `B146_Illusionist`, `B157_Salter`, `B3_Moonshine`, `C104_Collector`, `C146_WorkshopAssistant`, `D23_PioneeringSpirit`, `E134_Omnifarmer`, `E148_Lazybones` |
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
| listener | `computeCosts.improvement` | `A143_Stonecutter`, `A20_DoubleTurnPlow`, `A27_OvenSite`, `A75_LumberMill`, `B36_Bottles`, `B95_MasterBricklayer`, `C122_Bricklayer`, `C27_Blueprint`, `C95_BasketWeaver`, `D117_WoodExpert`, `D82_HuntingTrophy`, `D95_SiteManager`, `D96_Furnisher`, `E109_BraidMaker`, `E123_ResourceHoarder`, `E130_Overachiever`, `E27_PiggyBank` |
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
| specialKind | `resource-quantity-select` | `B157_Salter` |
| specialKind | `resourceExchange` | `E5_NightLoot` |
| specialKind | `return-card-to-board` | `C60_SmallPottersOven` |
| specialKind | `set-counter` | `A144_Sequestrator`, `B48_ForestStone`, `C148_MudWallower`, `D158_BeanCounter` |
| specialKind | `set-extra-data` | `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `A89_StablePlanner`, `A92_AdoptiveParents`, `B124_Trimmer`, `B132_EstateMaster`, `B137_Wholesaler`, `B18_GrasslandHarrow`, `B21_HayloftBarn`, `B34_SpecialFood`, `B48_ForestStone`, `B55_MaintenancePremium`, `B93_Confidant`, `C150_ParrotBreeder`, `C16_FieldFences`, `C48_Farmstead`, `C53_GypsysCrock`, `D156_RetailDealer`, `D36_BreedRegistry`, `D56_FatstockStretcher`, `D74_RoyalWood`, `E148_Lazybones`, `E149_MidnightFencer`, `E51_WhaleOil`, `E53_BoarSpear`, `E58_LunchtimeBeer`, `E85_MasterTanner`, `E91_PlowBuilder` |
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
| `A16_RammedClay` | 已对齐 |  |
| `A17_ReclamationPlow` | 已对齐 |  |
| `A18_WheelPlow` | 已对齐 |  |
| `A19_Handplow` | 已对齐 |  |
| `A20_DoubleTurnPlow` | 已对齐 |  |
| `A21_FamilyFriendHome` | 已对齐 |  |
| `A22_Telegram` | 已对齐 | turn-start optional extraPlacement 的 skip/use session 路径已覆盖，行为等价于 BGA flag 后并入放人选择 |
| `A23_StoneCompany` | 已对齐 |  |
| `A24_ThreshingBoard` | 已对齐 |  |
| `A25_Bassinet` | 已对齐 |  |
| `A26_SleepingCorner` | 已对齐 |  |
| `A27_OvenSite` | 已对齐 | prerequisite 改用 `fireplaceIdentity` / `cookingHearthIdentity` played-card capability；不再直接枚举 A60_OrientalFireplace。 |
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
| `A75_LumberMill` | 已对齐 |  |
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
| `A128_RiparianBuilder` | 已对齐 |  |
| `A129_Swagman` | 已对齐 |  |
| `A130_MummysBoy` | 已对齐 |  |
| `A131_CraftTeacher` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A132_Publican` | 已对齐 |  |
| `A133_Braggart` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A134_FullFarmer` | 已对齐 |  |
| `A135_AnimalReeve` | 已对齐 |  |
| `A136_DrudgeryReeve` | 需复核 | BGA sharedScoring 每位玩家可选 0..max sets 并 reserve 资源；OA 仅持卡玩家自动最优计分 |
| `A137_RiverineShepherd` | 已对齐 | optional extra good 使用另一个累积格的 partial collect，会扣除来源格并保留 action-space provenance |
| `A138_Harpooner` | 已对齐 |  |
| `A139_HollowWarden` | 已对齐 |  |
| `A140_ShovelBearer` | 已对齐 |  |
| `A141_TurnipFarmer` | 已对齐 |  |
| `A142_Cordmaker` | 已对齐 |  |
| `A143_Stonecutter` | 已对齐 |  |
| `A144_Sequestrator` | 已对齐 |  |
| `A145_Ropemaker` | 已对齐 |  |
| `A146_StorehouseSteward` | 已对齐 |  |
| `A147_AnimalDealer` | 已对齐 |  |
| `A148_Woolgrower` | 已对齐 |  |
| `A149_HouseArtist` | 已对齐 |  |
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
| `A169_OffSiter` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
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
| `B13_CarpentersParlor` | 已对齐 |  |
| `B14_Hawktower` | 已对齐 |  |
| `B15_CarpentersBench` | 已接受差异 | BGA banned，但 OA 按产品策略保留；BGA `formatCost([WOOD => 1])` / `max` / `benchWood` 通过 `reserve-fence-bonus` + nested `fencePolicy` 表达：只建普通 fence、最多 `n+1` 段、恰好 1 个新牧场、1 段免费。 |
| `B16_MiningHammer` | 已对齐 | onBuy 使用 CardEffect；翻修后仍监听 `after.renovate-house` 并免费建 1 个 stable |
| `B17_ForestPlow` | 已对齐 |  |
| `B18_GrasslandHarrow` | 已对齐 |  |
| `B19_MoldboardPlow` | 已对齐 | optional extra plow 先执行 `plow`，成功后再 `pop-card-stack`；optional 跳过走 `__skip__`，接受后 `plow` confirm-only 且 direct `cancel` 被通用 guard 拒绝 |
| `B20_ChainFloat` | 已对齐 |  |
| `B21_HayloftBarn` | 已对齐 | 通过 resource exchange 获得的 grain 已由 provenance helper 触发 |
| `B22_WalkingBoots` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
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
| `B34_SpecialFood` | 已对齐 | A137/Riverine Shepherd 式行动格动物移动 provenance 已有定向 session 覆盖，bonus VP 只记一次并在牌面显示累计值 |
| `B35_HookKnife` | 已对齐 |  |
| `B36_Bottles` | 已对齐 |  |
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
| `B65_GrainDepot` | 已对齐 |  |
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
| `B95_MasterBricklayer` | 已对齐 |  |
| `B96_TreeFarmJoiner` | 已对齐 |  |
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
| `B126_Carpenter` | 已对齐 |  |
| `B127_Seducer` | 已对齐 |  |
| `B128_Plumber` | 已对齐 |  |
| `B129_Seatmate` | 已对齐 | 4p 用 `(ownerIdx+⌊n/2⌋)%n` 计算对座，对座未占 r13 且 owner 自己未在 r13 时才注入 allow-occupied；3p 任一邻座占且 owner 自己未在 r13 时注入；round<13 / 其他人数不注入。state.players 顺序约定与 C150_ParrotBreeder 一致。 |
| `B130_FullPeasant` | 已对齐 |  |
| `B131_Equipper` | 已对齐 |  |
| `B132_EstateMaster` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B133_VillagePeasant` | 已对齐 |  |
| `B134_HousebookMaster` | 已对齐 |  |
| `B135_NutritionExpert` | 已对齐 |  |
| `B136_HouseSteward` | 已对齐 |  |
| `B137_Wholesaler` | 已对齐 |  |
| `B138_ForestGuardian` | 已对齐 |  |
| `B139_ForestScientist` | 已对齐 |  |
| `B140_FarmyardWorker` | 已对齐 |  |
| `B141_FieldCaretaker` | 已对齐 |  |
| `B142_Greengrocer` | 已对齐 |  |
| `B143_ClayWarden` | 已对齐 |  |
| `B144_Collier` | 已对齐 |  |
| `B145_BrushwoodCollector` | 已对齐 |  |
| `B146_Illusionist` | 已对齐 |  |
| `B147_Huntsman` | 已对齐 |  |
| `B148_PetBroker` | 已对齐 |  |
| `B149_OpenAirFarmer` | 已对齐 | pay 3 stable supply token；fixed 2 wood 建一个 2格 pasture；`segmentBounds.total.max=6`，B30 palisade 计入总段数且可补足 ordinary fence supply |
| `B150_LargeScaleFarmer` | 已对齐 |  |
| `B151_LittlePeasant` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B152_JuniorArtist` | 已对齐 |  |
| `B153_Housemaster` | 已对齐 | 终局计分按 major identity 汇总真实 major 与 `alsoCountsAs: ['major']` 的 minor，不再保留 A60 单卡特判。 |
| `B154_SheepKeeper` | 已接受差异 | schema-up prerequisite / isBuyable metadata 差异 |
| `B155_ArtTeacher` | 已对齐 |  |
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
| `C13_WoodSlideHammer` | 已对齐 |  |
| `C14_StrawThatchedRoof` | 已对齐 |  |
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
| `C27_Blueprint` | 已对齐 | 三张 workshop major 保留原支付 trade，并追加 Blueprint 折扣 trade；minor-improvement 入口维持 listener 模式 |
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
| `C41_FarmStore` | 已对齐 |  |
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
| `C56_FeedFence` | 已对齐 | #186 “第 4 座畜栏 +2 food”bonus 口径改用 `getStableCountForCards === 4`（含 B85，对齐 BGA `countStablesForCards()==4`）；本次建造数仍走 `getStableTilesBuiltThisAction`（归 #185） |
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
| `C88_CarpentersApprentice` | 已对齐 | 第 13–15 根 fence 免费区间走 `computeCosts.fence`，doability 通过免费 `fencePolicy` 复用真实布局门禁。Build Stables 的 `maxSelections` 用 count-aware total cost 计算（#191）：`stables.ts` 的 `buildStableFarmSelection` 对 count=1..reserve 逐一算 `resolveStableTotalCostWithDiscount`（与结算同一总额，含 C88 第 3/4 座 -1 的 non-uniform 折扣）+ `canAffordTypedFlatCost`，取最大可负担数覆写 `farm.maxSelections`，不再 probe `stableCount:1` 折后注入 farmyard 的 per-unit `costOverride`（non-uniform 折扣下会少让一座，如 1 card-facing stable + 3 wood + C88 应能建 2 座）。total 对 count 单调（每多一座 ≥+1 wood），首个不可负担即终止扫描。`actionContext.max`（A1 Shelter）/`zoneFilter='pasture-1'`/`exactCost`（C94）路径不受影响。 |
| `C89_StableMaster` | 已对齐 | onBuy 的 1 wood stable 走 `stables` exactCost，入口不做 raw wood gate，允许 C88 等 `computeCosts.stables` 折扣叠加。 |
| `C90_FieldWatchman` | 已对齐 |  |
| `C91_PlowHero` | 已对齐 |  |
| `C92_AutumnMother` | 已对齐 |  |
| `C93_InnerDistrictsDirector` | 已对齐 | 放 stone 与可选额外放人已作为整段 optional，skip 不再强制放 stone |
| `C94_StableCleaner` | 已对齐 | anytime 入口用 stables preview + `computeCosts.stables` 判断可用性，1 wood + 1 food exactCost 可叠加 C88 等 stable cost modifier。 |
| `C95_BasketWeaver` | 已对齐 |  |
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
| `C122_Bricklayer` | 已对齐 |  |
| `C123_Freemason` | 已对齐 |  |
| `C124_StoneImporter` | 已对齐 |  |
| `C125_Nightworker` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C126_Excavator` | 已对齐 |  |
| `C127_Lover` | 已对齐 |  |
| `C128_WoodenHutExtender` | 已对齐 |  |
| `C129_SecondSpouse` | 已对齐 |  |
| `C130_OutskirtsDirector` | 已对齐 |  |
| `C131_PrivateTeacher` | 已对齐 |  |
| `C132_TimberShingleMaker` | 已对齐 |  |
| `C133_Soldier` | 需复核 | BGA 终局前玩家选择 0..max 对并 reserve wood/stone；OA scoring solver 自动最优 |
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
| `C148_MudWallower` | 已对齐 |  |
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
| `D13_Trowel` | 已对齐 |  |
| `D14_HammerCrusher` | 已对齐 |  |
| `D15_ClaySupports` | 已对齐 |  |
| `D16_WoodenWheyBucket` | 已对齐 | BGA `formatCost(['max' => 1, WOOD => 1])` / `formatCost(['max' => 1])` 通过 `stables` `actionContext.exactCost` 表达羊市场 1 wood、牛市场免费，且最多 1 个 stable。 |
| `D17_DrillHarrow` | 已对齐 |  |
| `D18_SteamPlow` | 已对齐 |  |
| `D19_PulverizerPlow` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D20_TurnwrestPlow` | 已对齐 |  |
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
| `D80_BrickHammer` | 已对齐 |  |
| `D81_RoofLadder` | 已对齐 |  |
| `D82_HuntingTrophy` | 已对齐 |  |
| `D83_Pigswill` | 已对齐 |  |
| `D84_FeedPellets` | 已对齐 |  |
| `D85_Reader` | 已对齐 |  |
| `D86_SheepAgent` | 已对齐 | 容量扣除通过 `animalHolder` metadata + occupation identity 过滤；D86 自身仍计入容量，minor animal-holder 不扣容量。 |
| `D87_MasterBuilder` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `D88_Millwright` | 已对齐 |  |
| `D89_Stablehand` | 已对齐 |  |
| `D90_PlowMaker` | 已对齐 |  |
| `D91_Plowman` | 已对齐 |  |
| `D92_ChildOmbudsman` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D93_SheepInspector` | 已对齐 |  |
| `D94_HenpeckedHusband` | 已对齐 |  |
| `D95_SiteManager` | 已对齐 |  |
| `D96_Furnisher` | 已对齐 |  |
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
| `D117_WoodExpert` | 已对齐 |  |
| `D118_Bonehead` | 已对齐 |  |
| `D119_WoodBarterer` | 已对齐 |  |
| `D120_ClayDeliveryman` | 已对齐 |  |
| `D121_ClayPlasterer` | 已对齐 |  |
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
| `D154_ChimneySweep` | 已对齐 |  |
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
| `E16_BriarHedge` | 已对齐 |  |
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
| `E27_PiggyBank` | 已对齐 |  |
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
| `E53_BoarSpear` | 已对齐 |  |
| `E54_Contraband` | 已对齐 |  |
| `E55_StoneWeir` | 已对齐 |  |
| `E56_RomanPot` | 已对齐 |  |
| `E57_CheeseFondue` | 已对齐 |  |
| `E58_LunchtimeBeer` | 已对齐 |  |
| `E59_CombandCutter` | 已对齐 |  |
| `E60_WorkingGloves` | 已对齐 |  |
| `E61_RaisedBed` | 已对齐 |  |
| `E62_SourDough` | 已对齐 |  |
| `E63_IronOven` | 已对齐 |  |
| `E64_SimpleOven` | 已对齐 |  |
| `E65_Almsbag` | 已对齐 |  |
| `E66_BarnShed` | 已对齐 |  |
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
| `E109_BraidMaker` | 已对齐 |  |
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
| `E123_ResourceHoarder` | 已对齐 | after-pay 优先读取 `resource.paid` 的 bonusSources / bonusChoiceIndex，并保留旧 `_activeActionBonusSources` 直接监听路径 |
| `E124_MayorCandidate` | 已对齐 |  |
| `E125_DelayedWayfarer` | 已对齐 |  |
| `E126_TaxCollector` | 已对齐 |  |
| `E127_DiligentFarmer` | 已对齐 | BGA `CONSTRUCT + formatCost(['max'=>1])` 走真实 `construct` + `exactCost: { max: 1 }`，会放置 room tile，不再用 `build-farmhand-room` 虚拟房间。 |
| `E128_Saddler` | 已对齐 |  |
| `E129_Imitator` | 已对齐 |  |
| `E130_Overachiever` | 已对齐 |  |
| `E131_MarketMaster` | 已对齐 |  |
| `E132_VeggieLover` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `E133_ChampionBreeder` | 已对齐 |  |
| `E134_Omnifarmer` | 已对齐 | 在 `onAfterHarvest` 通过 `getHarvestOutcome()` 基于本次实际 harvested crops / newborn animals 提供一次存 goods 选择；提交时重新校验 outcome、stored goods 和当前资源，不再读取 E84 或 live 阈值 |
| `E135_Pickler` | 已对齐 |  |
| `E136_AnimalHusbandryWorker` | 已对齐 | BGA ordinary `FENCING` 子行动映射到内部 `fence` leaf。 |
| `E137_FlaxFarmer` | 已对齐 |  |
| `E138_LivestockExpert` | 已对齐 |  |
| `E139_BunnyBreeder` | 已对齐 |  |
| `E140_Carter` | 已对齐 |  |
| `E141_VegetableVendor` | 已对齐 |  |
| `E142_Smuggler` | 已对齐 |  |
| `E143_Hewer` | 已对齐 |  |
| `E144_WaresSalesman` | 已对齐 | 按 `waresSalesmanGains` metadata 读取 single/multiple gain options，不再维护硬编码 improvement id 分组。 |
| `E145_Parvenu` | 已对齐 |  |
| `E146_Reseller` | 已对齐 |  |
| `E147_AnimalDriver` | 已对齐 |  |
| `E148_Lazybones` | 已对齐 | reserved stable action spaces 计入 stable supply helper；无空地时仍可清理 marker，不把 no-op 清理计为卡牌 use |
| `E149_MidnightFencer` | 已对齐 | 第 14 轮 harvest start 提供 optional real borrowed `fence` leaf；donor cap 按其他玩家 own ordinary reserve 各最多 2，跳过或建造均不再产生 owed-fence bonus VP |
| `E150_RockBeater` | 已对齐 |  |
| `E151_DeliveryNurse` | 已对齐 |  |
| `E152_BargainHunter` | 已对齐 |  |
| `E153_StoneSculptor` | 已对齐 |  |
| `E154_Margrave` | 已对齐 |  |
| `E155_Visionary` | 已对齐 |  |
| `E156_ClaypitOwner` | 已对齐 |  |
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
