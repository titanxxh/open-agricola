# 卡牌实现现状报告

> 生成/更新日期：2026-05-23。本文件替代 `docs/card_desc_audit.md`、`docs/card_progress.md`、`docs/master-plan.md`、`docs/bad-smell.md`。BGA 唯一基准：`/data00/home/xuxinhao.titan/raw/bga-agricola`。

## 1. 当前快照

| 项目 | 状态 |
|---|---:|
| BGA A-E canonical 卡牌 | 888 |
| OA A-E canonical 卡牌定义 | 888 |
| 自动 metadata 脚本 literal mismatch | 0 |
| 自动 metadata 脚本 complex mismatch | 5 |
| 其中 schema-up 已接受差异 | 4 |
| 需要实现复核的卡牌 | 10 |
| 已接受 / 产品策略差异 | 65 |
| 排除的 BGA legacy 或未实现行为目标 | 52 |
| 本轮审计视为已对齐 | 761 |

说明：`scripts/audit-bga-metadata-diff.ts` 现在会解析 BGA `STABLE` 打印成本和 `passing`。当前 literal mismatch 0（passing 已全部对齐）。当前 complex mismatch 是 1 个 `cost` 差异（`C54_MarketBooth`）和 4 个已接受的 schema-up prerequisite 差异。

审计规则：优先核对卡牌描述文本、custom description、cost、prerequisite、passing、职业/小改 metadata，以及游戏规则行为。BGA 平台/工坊字段如 `banned`、`implemented`、`isCorbariusOrDulcinaria`、`isArtifexOrBubulcus` 不作为对齐要求；如果它们影响产品策略，只记录为已接受差异或排除项，不记为实现 bug。

## 2. 问题优先汇总

| 卡牌 | 严重度 | 领域 | 差异 | 方向 |
|---|---|---|---|---|
| `B24_Lasso` | 高 | 额外放人 | BGA 任意第一次放人后都提供触发；OA 只有第一次放人在动物市场时才触发。 | 始终提供触发；仅当第一次不是动物市场时限制第二次必须去动物市场。 |
| `C54_MarketBooth` | 高 | metadata/cost | BGA 成本是 1 个 stable；OA cost 为空，自动 metadata 脚本现在会报出该差异。 | 支持 stable-token cost，或明确记录为已接受差异。 |
| `D155_Ebonist` | 高 | exchange 触发窗口 | BGA exchange 仅收获期；OA 暴露为 anytime exchange。 | 改为 harvest trigger 并补回归测试。 |
| `B67_HandTruck` | 中 | bake 前 continuation | BGA 是 optional 拿谷物，然后 mandatory bake；OA 无条件给谷物。 | 建模 optional gain 分支，之后接 mandatory bake continuation。 |
| `B124_Trimmer` | 中 | 触发频率 | BGA 每次牧场覆盖数增加都奖励；OA 每个工作阶段第一次奖励后打 flag。 | 若要严格对齐，移除 after-reward flag。 |
| `B19_MoldboardPlow` | 中 | 成功顺序 | OA 在 plow 成功前消耗使用次数。 | plow 成功后再消耗使用次数。 |
| `E10_StrawHat` | 中 | mandatory 选择 | BGA 强制在移动或拿食物中选一项；OA 可以跳过。 | 移除 XOR 外层 optional。 |
| `E68_CherryOrchard` | 低 | 描述文本 | OA desc 写成收获 wood；BGA 表达为像 grain 一样 sow 和 harvest wood。 | 恢复 BGA 文案语义。 |
| `B34_SpecialFood` | 待验证 | 跨卡交互 | BGA 特判 A137；OA heuristic 可能覆盖，也可能遗漏。 | 增加 A137+B34 定向 session 测试。 |

### 需复核卡牌证据索引

下表记录每个差异核对过的位置。BGA PHP 路径默认位于 `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards`；BGA JS 路径默认位于 `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/js`。

| 卡牌 | BGA 证据 | OA 证据 | UI / 交互证据 |
|---|---|---|---|
| `B24_Lasso` | `B/B24_Lasso.php` | `shared/cards/B/B24_Lasso.ts` | 使用通用 extra-placement flow；遗漏的是后端触发条件，不是客户端渲染。 |
| `C54_MarketBooth` | `C/C54_MarketBooth.php` | `shared/cards-display/C/C54_MarketBooth.ts` | OA 数据缺少 stable cost，因此 metadata/cost 渲染也受影响。 |
| `D155_Ebonist` | `D/D155_Ebonist.php` | `shared/cards-display/D/D155_Ebonist.ts` | Harvest exchange 通过通用 exchange UI 暴露；OA 当前把它放进 anytime exchange UI。 |
| `B67_HandTruck` | `B/B67_HandTruck.php` | `shared/cards/B/B67_HandTruck.ts` | OA 使用通用 bake continuation，但缺少 mandatory bake 前的 optional grain 分支。 |
| `B124_Trimmer` | `B/B124_Trimmer.php` | `shared/cards/B/B124_Trimmer.ts` | 无特殊 UI gap；触发频率是后端 card state 问题。 |
| `B19_MoldboardPlow` | `B/B19_MoldboardPlow.php` | `shared/cards/B/B19_MoldboardPlow.ts` | OA 已消耗存储次数后，UI 仍可能取消或失败 plow 选择。 |
| `E10_StrawHat` | `E/E10_StrawHat.php` | `shared/cards/E/E10_StrawHat.ts` | OA 将整个 flow 标为 optional，导致通用 XOR UI 包含 skip 路径。 |
| `E68_CherryOrchard` | `E/E68_CherryOrchard.php` | `shared/cards-display/E/E68_CherryOrchard.ts` | 描述文本面向 UI；实现本身主要基于 cardField。 |
| `B34_SpecialFood` | `B/B34_SpecialFood.php` | `shared/cards/B/B34_SpecialFood.ts`; `shared/cards/A/A137_RiverineShepherd.ts` | 需要 A137 交互的定向 session/UI 覆盖后，才能判断 UI 行为是否分歧。 |

## 3. 已接受差异

除非产品方向改变，以下内容不算当前 bug。

| 类别 | 卡牌 |
|---|---|
| 用 schema-up metadata 替代 BGA custom `isBuyable` | `A3_PaperKnife`, `B56_Brook`, `B74_ThickForest`, `B154_SheepKeeper` |
| 旧文档已接受的简化实现 | `A22_Telegram`, `A136_DrudgeryReeve`, `B27_Toolbox`, `B33_Mantlepiece`, `B85_FarmHand`, `B129_Seatmate`, `C22_BasketChair`, `C24_BedintheGrainField`, `C25_SteamMachine`, `C27_Blueprint`, `C42_RavenousHunger`, `C52_HuntsmansHat`, `C67_MineralFeeder`, `C69_LandConsolidation`, `C72_FestivalPlanning`, `C93_InnerDistrictsDirector`, `C120_AgriculturalLabourer`, `C133_Soldier`, `C146_WorkshopAssistant`, `C154_TwinResearcher`, `D1_ZigzagHarrow`（passing 已对齐；harrow target 仍为简化）, `D36_BreedRegistry`, `D101_SugarBaker`, `D132_HideFarmer`, `D161_CabbageBuyer`, `E112_GrainThief`, `E149_MidnightFencer` |
| field/cardField 作物约束差异 | `E70_CropRotationField`, `E72_ArtichokeField` |
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
| `E118_KindlingGatherer` | 34 | 77 | 2.26 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `C88_CarpentersApprentice` | 40 | 90 | 2.25 | fence 折扣已从 `reserve-fence-bonus` 机制改为单个 `computeCosts.fence` listener；修复「第 13 个起」下界 bug（旧实现 `freeFences = 15 − getFenceCount` 导致第 13 之前的 fence 也免费，新实现用 `min(end,15) − max(start,13) + 1` 只释放第 13–15 fence）。 |
| `D131_CraftsmanshipPromoter` | 25 | 56 | 2.24 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `B18_GrasslandHarrow` | 38 | 82 | 2.16 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `C150_ParrotBreeder` | 74 | 159 | 2.15 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `D1_ZigzagHarrow` | 38 | 80 | 2.11 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `B137_Wholesaler` | 57 | 117 | 2.05 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |
| `D36_BreedRegistry` | 50 | 101 | 2.02 | 复核复杂度是否来自基础设施债，而不是后端权威建模所必需。 |

比例不是唯一信号：`E123_ResourceHoarder`（85/136 = 0.62）和 `E78_SleightofHand`（42/73 = 0.57）已远低于 BGA，是已完成的简化案例；表里高比例卡也要先看是否伴随行为风险再决定优先级。

## 5. 架构审阅

本轮审阅没有发现新的“仅前端裁定规则”路径。主要架构风险来自既有或新暴露的基础设施缺口：

| 风险 | 证据 / 卡牌 | 方向 |
|---|---|---|
| Metadata 审计覆盖需要随字段演进同步 | `scripts/audit-bga-metadata-diff.ts` 已覆盖 `STABLE` cost 和 `passing` | 新增 BGA metadata 字段时同步加 parser/diff fixture，避免统计口径回退。 |
| ~~单卡 internal leaf~~ ✅ 已泛化 | `build-farmhand-room` 已被 `B85_FarmHand`、`E127_DiligentFarmer`、`C87_Mason`、`C85_DenBuilder`、`D87_MasterBuilder` 复用 | 共享 helper，无需再视为单卡 leaf。 |
| 主路径 prefix namespace 检查 | 旧 bad-smell 文档中的 `CUSTOM_`、`card_` 模式 | 保留为 helper 常量/函数，避免散落的 startsWith 检查。 |
| Payment fallback 仍需继续收敛到事件 provenance | construct/renovate bonus choice 已能通过 `resource.paid` 携带 selected index；后续关注其他 direct payment caller | 新增支付类卡时优先消费 `resource.paid` / `bonusChoiceIndex`，不要读 action result fallback。 |
| 行动格生命周期已进入后端事件层 | `B23_FinalScenario` | 后端持有 reveal/exclusive-use 状态，round-start 统一清理并 emit `action.exclusiveUseCleared`。 |
| Log / notification provenance | `shared/events/event-mapping-policy.ts` 覆盖全部 public/private event type；`shared/cards/__tests__/provenance-result-audit.test.ts` 守住生产卡牌的 `context.result` 资源事实 fallback | 结构化事件层是卡牌判定、UI log、private notification 和 replay 的统一来源；新增支付/资源/farm metadata 路径必须先 emit 事件再让 listener 消费，不要回退到 action result。 |
| Fence segment source/type policy 已进入通用基础设施 | `FenceSegment.type` / `source`、`consume-fence` ownOnly、fencing `fencePolicy` | 普通 fence / palisade / borrowed source 不通过主路径卡牌分支表达；C1 rebuild、B30 palisade、未来 E149 borrowed fence 都走 segment type/source + generic policy。 |
| 注释里的非阻塞 card-id 示例 | `shared/actions/effects/breed.ts`、`shared/contract/types.ts` 仅把 `A165_PigBreeder` / `D95_SiteManager` 作为例子提到 | 除非附近代码变动，否则保留；它们不是可执行的单卡分支。 |
| Legacy/fallback 术语残留 | 旧 bad-smell 文档发现的剩余 fallback/direct-path 术语，主要在已迁移支付 flow 和测试中 | 将直接运行时 fallback 视为重构债；测试/baseline 名称除非真实迁移触及，否则不动。 |

## 6. 基础设施待办

1. ~~维护 metadata 审计 fixture 覆盖：`STABLE` cost 和 `passing` 已覆盖，后续新增 BGA metadata 字段时必须同步 parser/diff 测试。~~ ✅ 已落地：`scripts/__tests__/audit-bga-metadata-diff.test.ts` 的 "BGA metadata field coverage" 测试扫所有 BGA A-E 卡 PHP 中的 `$this->xxx =` 字段，对比 `COVERED_FIELDS`（parser 已识别）与 `IGNORED_FIELDS`（平台/runtime/typed-prerequisite 显式跳过），出现未分类新字段即 fail，强制更新 parser 或显式登记 ignored。
2. ~~增加精确 eligible farm-position selection，支持 selectableTiles、数量约束和非法选择原子失败。~~ ✅ 已落地：`selection` action / session commit 支持 `allowedSelectionCounts`，`B115_TinsmithMaster`、`E71_CowPatty` 基于 `farm.sown` event 计算本次 eligible 田，`B165_GameProvider` 使用当前 grain fields；三者均使用精确 `selectableTiles`，非法选择在 effect 前 recoverable fail。
3. ~~增加 batch resource exchange / resource quantity selection，用于 BGA SPECIAL_EFFECT 风格的 discard/receive 交互。~~ ✅ 已落地：`resource-batch-exchange-select` 支持私有 prompt redaction、HTTP/WS commit、E78 原子 discard/receive、UI 面板和 replay 回放。
4. ~~为“从多个替换中选一个”的卡增加 TradeModifier group 限制。~~ ✅ 已落地：`Trade` / `TradeModifier` 支持 `groupId` + `groupMax`，payment 枚举在 action-scope、unit-scope 和最终组合合并时按组累计 `times`，`E60_WorkingGloves` 的四个职业支付替代共享 `groupMax: 1`，避免一次职业支付内叠加多个替换。
5. ~~增加后端权威的 action-space reveal/exclusive-use 支持。~~ ✅ 已落地：ActionSpace 持有 `exclusiveUse`，round start 统一 emit `action.revealed` / `action.exclusiveUseCleared`，B23 使用该机制。
6. ~~扩大 accumulation-space partial-take 语义的复用范围；当前 `collect` 已支持指定行动格、资源和数量，`B81_Handcart` 已从行动格移除资源。~~ ✅ 已落地：新增 `createPartialTakeFromSpaceLeaf`，统一生成 `collect` partial-take leaf、choice label metadata 和可选 effect preview；`A82_WorkCertificate`、`B81_Handcart`、`E5_NightLoot` 已迁移到共享 helper，`collect` 执行语义不变。
7. ~~为 room/action bonus 增加 scope，避免 per-room 和 total-room cost modifier 双重应用~~ ✅ 已落地：`ComplexCost` 统一形状（`fees / unitFee + nb / trades / bonuses`），`Trade.scope: 'action' \| 'unit'` + `TradeModifier.scope` 区分 per-action 资源池转换和 per-unit cost row 有序替换（A123_FrameBuilder construct、D15_ClaySupports、B145_BrushwoodCollector construct 分支已迁移，B145 使用 `replaceUpTo` 覆盖 1/2 reed 行）；construct / renovation / fencing / plow / occupation / pay 全部走单一 `computeAllBuyableCombinations`；条件评估拆成 `evaluateStaticConditions` + `evaluateConditions(_, _, nb)` 两层（`getModifiersForCostType` static-only，nb-aware gate 延后到 enumerate）。
8. ~~增加通用处理：“before trigger 给资源后，原行动可能变得可达/mandatory”。~~ ✅ 已落地：before listener unlocker 通过 scoped `isDoable` opt-in 启动原本不可达的 action，`skipBeforeTriggers` continuation 不把 unlocker 自己当作可跳过依据；所有 before/after/optional 分支真实执行后，原 action 重新 strict doable，失败时进入 engine-blocked / undo-only。
9. ~~增加共享 lessons action-space id helper，覆盖 `lessons`、`lessons-3`、`lessons-4`。~~ ✅ 已落地：共享 helper 覆盖标准 lessons action-space id，并已用于 lessons identity 判定。
   Follow-up / exclusion：`C23_JobContract`、`B152_JuniorArtist`、`C117_Legworker` 与 space-pairing 的 cost / jump / adjacency 语义相关，不属于本 helper 关闭范围。
10. ~~继续扩大 gain/exchange/action-space provenance 覆盖；已覆盖 B21 exchange grain、E47 action-space gain、C162 player action space、E78 batch exchange，并补齐本轮 A2-A6 支付、动物、food、building-resource、farm metadata 卡牌对 `actionEvents` 优先、`transactionEvents` 回退的消费模型。本轮补齐 B21 HayloftBarn 与 E47 SyrupTap 的 action-frame 事件优先读取，防止同一 transaction 中较早资源事件误触发当前 listener；同时补上生产卡牌 `context.result` 资源事实 fallback 审计。~~ ✅ 已落地：生产卡牌 `context.result` 资源事实 fallback 已由 `shared/cards/__tests__/provenance-result-audit.test.ts` 和 `pnpm run check:provenance-result-audit` 守住；现存 `context.result` 用途仅限 A94/D50 的 request-shape 调整和 B18/C148 的 ok guard，不作为资源来源。
11. ~~决定 BGA `implemented=false` data-only 卡是否进入 OA 发牌池。~~ ✅ 已落地：`shared/session/state-bootstrap.ts` `dealHands()` 使用 `implementedMinorImprovementCards` / `implementedOccupationCards`，两者基于 `isImplementedCard(card.implemented !== false)` 过滤；`A169_OffSiter` 等 `implemented=false` 卡已排除出发牌池。
12. ~~扩展结构化 action event/log event~~ ✅ 已关闭：所有 public/private event type 由 `event-mapping-policy` 覆盖，log / public notification / highlight / resource animation / replay 的 mapped、conditional、silent 边界均由测试 fixture 守住；当前未进入 log mapper 的 card/farm/future/worker/lifecycle event 已补齐可读 log 或显式静默策略。后续更丰富动画属于 enhancement，不再是基础设施开放 umbrella。
13. ~~BGA-style pay child / internal children 机制~~ ✅ 已落地：public host action 负责业务 mutation，mandatory payment 通过 internal `pay` child 结算；`beforeHostListeners` / `afterHostCommitListeners` / `afterHostListeners` 保留 BGA pay slot 差异，improvement/occupation 的 onBuy 在 host commit 后、host after 前运行；public action 顺序已修正为 `computeReplace -> before -> strict isDoable -> computeCosts -> execute -> during -> immediatelyAfter -> after`；`activate-card-effect` 通过 internal result map 读取 `paymentInfo`；`architecture-guard` 守住 deleted apply effects，不允许新增 top-level `apply-*` effect 文件来堆叠多卡逻辑。
14. ~~Fence segment source/type + generic fencing policy~~ ✅ 已落地：`FenceSegment.type` 区分 ordinary fence / B30 palisade，`FenceSegment.source` 区分 own / borrowed；缺省普通 fence 视为 own ordinary source。fencing 主路径不按 `C1` / `B30` / `E149`、`noWoodPalisades`、`midnightFencer` 分支；卡牌通过 `fencePolicy` 表达 allowed segment types、source policy、bounds、cost、cancel、animal preservation。C1 rebuild 只计数/回收/重建 own ordinary fences，走 `consume-fence` ownOnly + generic `fencePolicy`。

影响回归覆盖：`B65_GrainDepot` paymentInfo fee index、before-phase cards、renovation、improvement、occupation、construct、stables、fencing、`A34_Loppers` exact-wood、stable paid/free log pairing。

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

Card listener（`shared/cards/card-listeners.ts`）收到 `transactionEvents`（整个工作事务的事件）、`actionEvents`（当前行动/阶段切片）和类型化 `eventQuery`（`has` / `find` / `filter`）。资源类卡牌优先读 `actionEvents`、回退 `transactionEvents`。`resource.paid` 携带 `paymentFor` / `paymentSources` / `bonusSources` / `bonusChoiceIndex` / `returnedCardId`，支付折扣 / 退卡类卡牌据此判定，不依赖 action result fallback。

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
| D | `D101_SugarBaker`, `D102_SampleStableMaker`, `D103_CanalBoatman`, `D107_Bellfounder`, `D10_StorksNest`, `D116_TreeInspector`, `D124_Emissary`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D129_LumberVirtuoso`, `D132_HideFarmer`, `D134_OysterEater`, `D137_TradeTeacher`, `D138_PetLover`, `D14_HammerCrusher`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D158_BeanCounter`, `D161_CabbageBuyer`, `D167_PureBreeder`, `D20_TurnwrestPlow`, `D22_WorkPermit`, `D23_PioneeringSpirit`, `D26_CarpentersYard`, `D27_Retraining`, `D51_Archway`, `D66_PotterCeramics`, `D70_StrawManure`, `D71_Changeover`, `D72_StableManure`, `D74_RoyalWood`, `D82_HuntingTrophy`, `D92_ChildOmbudsman`, `D93_SheepInspector`, `D94_HenpeckedHusband`, `D96_Furnisher`, `D98_Transactor` |
| E | `E103_Wolf`, `E106_EmergencySeller`, `E10_StrawHat`, `E112_GrainThief`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E134_Omnifarmer`, `E148_Lazybones`, `E162_Entrepreneur`, `E166_Roastmaster`, `E167_DairyCrier`, `E22_GuestRoom`, `E27_PiggyBank`, `E4_Thunderbolt`, `E51_WhaleOil`, `E52_Cubbyhole`, `E53_BoarSpear`, `E58_LunchtimeBeer`, `E5_NightLoot`, `E73_Scythe`, `E74_AshTrees`, `E76_LumberPile`, `E78_SleightofHand`, `E81_AlchemistsLab`, `E83_ShepherdsWhistle`, `E85_MasterTanner`, `E86_PenBuilder` |

## 10. Hook 点清单

下表从 `shared/cards/A-E` 机械抽取。`$dynamic` 表示 action id 来自本地常量/表达式，重构前需要回到对应卡牌文件确认。

| 类型 | Hook 点 | 卡牌 |
|---|---|---|
| effect | `computeBonusScore` | `A101_CookeryOutfitter`, `A133_Braggart`, `A134_FullFarmer`, `A31_DebtSecurity`, `A32_Manger`, `A38_WoolBlankets`, `A98_StableArchitect`, `A99_FellowGrazer`, `B132_EstateMaster`, `B153_Housemaster`, `B30_WoodPalisades`, `B31_PotteryYard`, `B32_Kettle`, `B39_Loom`, `B98_OrganicFarmer`, `B99_Tutor`, `C100_Butler`, `C132_TimberShingleMaker`, `C134_CowPrince`, `C135_Constable`, `C30_HalfTimberedHouse`, `C31_WritingChamber`, `C33_GreeningPlan`, `C35_LanternHouse`, `C39_StudioBoat`, `C59_SchnappsDistillery`, `D100_LordoftheManor`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D154_ChimneySweep`, `D157_PartyOrganizer`, `D29_MuckRake`, `D30_ArtisanDistrict`, `D31_Storeroom`, `D33_SummerHouse`, `D34_LuxuriousHostel`, `D35_FodderChamber`, `D36_BreedRegistry`, `D38_MilkingStool`, `D60_LargePottery`, `D92_ChildOmbudsman`, `E124_MayorCandidate`, `E134_Omnifarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E149_MidnightFencer`, `E153_StoneSculptor`, `E154_Margrave`, `E159_OldMiser`, `E32_Nave`, `E34_LandRegister`, `E35_Misanthropy`, `E37_OxSkull`, `E38_RodCollection` |
| effect | `computeCostedBonus` | `A136_DrudgeryReeve`, `C133_Soldier`, `C99_GardenDesigner`, `D132_HideFarmer`, `E132_VeggieLover` |
| effect | `computeExtraRoomCapacity` | `A10_WoodenShed`, `A127_Lodger`, `A85_Homekeeper`, `B10_Caravan`, `B85_FarmHand`, `C10_BunkBeds`, `D85_Reader`, `E85_MasterTanner` |
| effect | `computeLockedFarmTiles` | `B38_FutureBuildingSite` |
| effect | `computeSharedPostScore` | `A135_AnimalReeve`, `B136_HouseSteward`, `C136_RanchProvost` |
| effect | `getInvalidAnimals` | `B11_Feedyard`, `C11_WildlifeReserve`, `C12_CattleFarm`, `C148_MudWallower`, `C86_LivestockFeeder`, `E11_PettingZoo`, `E33_BeaverColony`, `E36_HerbalGarden`, `E86_PenBuilder` |
| effect | `onAfterFeed` | `E30_ChildsToy` |
| effect | `onAfterHarvest` | `B82_ValueAssets`, `C34_ElephantgrassPlant`, `C66_EternalRyeCultivation`, `D99_EarthenwarePotter`, `E134_Omnifarmer`, `E91_PlowBuilder` |
| effect | `onAfterReap` | `A106_SlurrySpreader`, `A59_PotatoRidger`, `A64_BarleyMill`, `B21_HayloftBarn`, `B58_CrackWeeder`, `C106_PotatoHarvester`, `C120_AgriculturalLabourer`, `D113_FoodMerchant`, `D126_FieldCultivator`, `D63_Lynchet`, `D65_GrainSieve`, `E134_Omnifarmer` |
| effect | `onAfterRoundEnd` | `A165_PigBreeder`, `A54_Credit`, `B53_SculptureCourse`, `D167_PureBreeder`, `D64_BakingCourse`, `D79_CarrotMuseum`, `E87_MasterRenovator` |
| effect | `onAllWorkersPlaced` | `E125_DelayedWayfarer` |
| effect | `onBeforeEndGame` | `B133_VillagePeasant` |
| effect | `onBeforeFeed` | `E159_OldMiser`, `E30_ChildsToy` |
| effect | `onBeforeHarvest` | `A166_Haydryer`, `C92_AutumnMother`, `D32_WoodRake`, `D98_Transactor` |
| effect | `onBeforePlayerTurn` | `D134_OysterEater` |
| effect | `onBeforeReturnHome` | `B117_Informant`, `B140_FarmyardWorker`, `B158_DistrictManager`, `B160_PubOwner`, `D130_RecreationalCarpenter`, `D142_PotatoPlanter`, `D51_Archway`, `E10_StrawHat`, `E143_Hewer`, `E158_StoneCustodian`, `E23_Apiary`, `E26_Sundial`, `E27_PiggyBank` |
| effect | `onBeforeStartOfTurn` | `A130_MummysBoy`, `A22_Telegram`, `A49_NestSite`, `B106_MoralCrusader`, `B124_Trimmer`, `B140_FarmyardWorker`, `B70_NewPurchase`, `B89_Groom`, `C101_StallHolder`, `C111_SmallAnimalBreeder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C157_ResourceAnalyzer`, `C46_Mandoline`, `C64_CornSchnappsDistillery`, `C67_MineralFeeder`, `C84_PerennialRye`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D46_PelletPress`, `D48_CivicFacade`, `D53_TeaHouse`, `E162_Entrepreneur`, `E22_GuestRoom`, `E28_Bookmark`, `E56_RomanPot`, `E62_SourDough`, `E93_Motivator`, `E96_Elder` |
| effect | `onBuy` | `A102_Grocer`, `A112_ScytheWorker`, `A117_WoodCarrier`, `A11_MudPatch`, `A120_ClayHutBuilder`, `A121_ClayPuncher`, `A125_Priest`, `A127_Lodger`, `A134_FullFarmer`, `A135_AnimalReeve`, `A136_DrudgeryReeve`, `A13_RenovationCompany`, `A144_Sequestrator`, `A162_ForestTallyman`, `A165_PigBreeder`, `A167_BreederBuyer`, `A16_RammedClay`, `A19_Handplow`, `A1_Shelter`, `A20_DoubleTurnPlow`, `A22_Telegram`, `A27_OvenSite`, `A2_ShiftingCultivation`, `A33_BigCountry`, `A36_FacadesCarving`, `A39_Chapel`, `A3_PaperKnife`, `A40_PottersYard`, `A43_FarmyardManure`, `A44_PondHut`, `A47_Trellises`, `A4_Baseboards`, `A53_Claypipe`, `A54_Credit`, `A57_MilkingParlor`, `A5_ClayEmbankment`, `A69_LargeGreenhouse`, `A6_StorageBarn`, `A74_StableTree`, `A77_Hod`, `A7_GardenersKnife`, `A86_AnimalTamer`, `A89_StablePlanner`, `A8_FoodBasket`, `A9_YoungAnimalMarket`, `B102_Consultant`, `B105_CaseBuilder`, `B107_Manservant`, `B113_PatchCaregiver`, `B116_Shoreforester`, `B117_Informant`, `B119_Lumberjack`, `B123_RoofBallaster`, `B124_Trimmer`, `B125_EstateWorker`, `B127_Seducer`, `B136_HouseSteward`, `B137_Wholesaler`, `B141_FieldCaretaker`, `B148_PetBroker`, `B149_OpenAirFarmer`, `B14_Hawktower`, `B160_PubOwner`, `B163_Pastor`, `B164_SheepWhisperer`, `B167_StableSergeant`, `B18_GrasslandHarrow`, `B19_MoldboardPlow`, `B1_UpscaleLifestyle`, `B20_ChainFloat`, `B21_HayloftBarn`, `B22_WalkingBoots`, `B23_FinalScenario`, `B25_BreadPaddle`, `B27_Toolbox`, `B29_CookeryLesson`, `B2_MiniPasture`, `B33_Mantlepiece`, `B37_Grange`, `B38_FutureBuildingSite`, `B3_Moonshine`, `B41_Hauberg`, `B42_ForestInn`, `B44_ChickStable`, `B45_StrawberryPatch`, `B46_ClubHouse`, `B48_ForestStone`, `B4_WoodPile`, `B52_GrowingFarm`, `B54_Tumbrel`, `B55_MaintenancePremium`, `B58_CrackWeeder`, `B59_FoodChest`, `B5_StoreofExperience`, `B65_GrainDepot`, `B66_SackCart`, `B6_ExcursiontotheQuarry`, `B71_HarvestHouse`, `B73_GiftBasket`, `B74_ThickForest`, `B76_Ceilings`, `B78_ReedBelt`, `B7_Wage`, `B83_MuddyPuddles`, `B84_AcornsBasket`, `B88_EstablishedPerson`, `B89_Groom`, `B8_MarketStall`, `B93_Confidant`, `B96_TreeFarmJoiner`, `B99_Tutor`, `B9_BeatingRod`, `C104_Collector`, `C106_PotatoHarvester`, `C107_Baker`, `C108_Layabout`, `C113_WinterCaretaker`, `C116_FurnitureMaker`, `C118_WoodCollector`, `C119_SkillfulRenovator`, `C121_ClayKneader`, `C127_Lover`, `C135_Constable`, `C136_RanchProvost`, `C139_BasketmakersWife`, `C140_PackagingArtist`, `C143_StoneBuyer`, `C144_ReedRoofRenovator`, `C146_WorkshopAssistant`, `C148_MudWallower`, `C155_FoodDistributor`, `C156_HoofCaregiver`, `C161_PotatoDigger`, `C162_ForestOwner`, `C165_GameCatcher`, `C166_CattleWhisperer`, `C16_FieldFences`, `C17_NewlyPlowedField`, `C19_SwingPlow`, `C1_Overhaul`, `C22_BasketChair`, `C24_BedintheGrainField`, `C26_Flail`, `C2_Stable`, `C38_Christianity`, `C39_StudioBoat`, `C3_CarriageTrip`, `C40_CanvasSack`, `C44_ChickenCoop`, `C47_GardenClaw`, `C4_WritingBoards`, `C50_StableYard`, `C57_Crudite`, `C5_Remodeling`, `C60_SmallPottersOven`, `C65_Granary`, `C6_StoneClearing`, `C72_FestivalPlanning`, `C74_PrivateForest`, `C77_ClaySupply`, `C78_ReedHattedToad`, `C79_StoneCart`, `C7_BladeShears`, `C81_MaterialHub`, `C83_EarlyCattle`, `C86_LivestockFeeder`, `C87_Mason`, `C89_StableMaster`, `C8_PlantFertilizer`, `C98_CubeCutter`, `C9_AutomaticWaterTrough`, `D109_SowingMaster`, `D114_SeedTrader`, `D116_TreeInspector`, `D117_WoodExpert`, `D118_Bonehead`, `D120_ClayDeliveryman`, `D122_ClayCarrier`, `D126_FieldCultivator`, `D127_HardworkingMan`, `D131_CraftsmanshipPromoter`, `D135_GardeningHeadOfficial`, `D136_AnimalActivist`, `D141_SeedSeller`, `D145_RoofExaminer`, `D156_RetailDealer`, `D162_ClayFirer`, `D166_StableMilker`, `D167_PureBreeder`, `D1_ZigzagHarrow`, `D20_TurnwrestPlow`, `D22_WorkPermit`, `D23_PioneeringSpirit`, `D2_DwellingPlan`, `D3_Furrows`, `D40_Cesspit`, `D41_HorseDrawnBoat`, `D43_Hutch`, `D44_ForestWell`, `D45_SheepWell`, `D47_Churchyard`, `D4_CrossCutWood`, `D50_ForeignAid`, `D51_Archway`, `D57_WholesaleMarket`, `D5_FieldClay`, `D60_LargePottery`, `D62_BeerTap`, `D67_ReapHook`, `D69_SmallGreenhouse`, `D6_PetrifiedWood`, `D74_RoyalWood`, `D78_ReedPond`, `D7_Trident`, `D84_FeedPellets`, `D88_Millwright`, `D8_FernSeeds`, `D91_Plowman`, `D96_Furnisher`, `D97_BeggingStudent`, `D99_EarthenwarePotter`, `D9_GameTrade`, `E103_Wolf`, `E104_SpiceTrader`, `E105_Pioneer`, `E106_EmergencySeller`, `E119_LandHeir`, `E120_ScrapCollector`, `E123_ResourceHoarder`, `E125_DelayedWayfarer`, `E127_DiligentFarmer`, `E135_Pickler`, `E136_AnimalHusbandryWorker`, `E138_LivestockExpert`, `E139_BunnyBreeder`, `E140_Carter`, `E145_Parvenu`, `E148_Lazybones`, `E155_Visionary`, `E161_ElderBaker`, `E167_DairyCrier`, `E1_PoleBarns`, `E22_GuestRoom`, `E25_BumperCrop`, `E28_Bookmark`, `E2_RenovationMaterials`, `E33_BeaverColony`, `E3_TeaTime`, `E40_BeeStatue`, `E41_MuddyWaters`, `E42_WaterGully`, `E43_BarnCats`, `E44_FodderBeets`, `E45_FruitLadder`, `E46_WaterlilyPond`, `E4_Thunderbolt`, `E51_WhaleOil`, `E56_RomanPot`, `E5_NightLoot`, `E60_WorkingGloves`, `E63_IronOven`, `E64_SimpleOven`, `E65_Almsbag`, `E6_Recount`, `E74_AshTrees`, `E76_LumberPile`, `E78_SleightofHand`, `E7_Pumpernickel`, `E81_AlchemistsLab`, `E82_Profiteering`, `E8_FarmersMarket`, `E94_Prophet`, `E97_Beneficiary`, `E98_Prodigy`, `E9_BarteringHut` |
| effect | `onComputeAnimalZones` | `A11_MudPatch`, `A12_DrinkingTrough`, `A148_Woolgrower`, `A86_AnimalTamer`, `B115_TinsmithMaster`, `B11_Feedyard`, `B12_Stockyard`, `B148_PetBroker`, `B72_LoveforAgriculture`, `B86_TruffleSearcher`, `C11_WildlifeReserve`, `C12_CattleFarm`, `C148_MudWallower`, `C86_LivestockFeeder`, `C89_StableMaster`, `D11_LawnFertilizer`, `D12_MilkingPlace`, `D148_DomesticianExpert`, `D86_SheepAgent`, `E11_PettingZoo`, `E12_AnimalBedding`, `E33_BeaverColony`, `E36_HerbalGarden`, `E86_PenBuilder` |
| effect | `onComputeSowableFields` | `B72_LoveforAgriculture` |
| effect | `onEndHarvest` | `A145_Ropemaker`, `B11_Feedyard`, `C113_WinterCaretaker`, `C124_StoneImporter`, `C71_Slurry`, `D115_FodderPlanter`, `E133_ChampionBreeder`, `E84_DollysMother`, `E90_DungCollector`, `E99_UncaringParents` |
| effect | `onEndHarvestFeedingPhase` | `C41_FarmStore`, `D76_SocialBenefits`, `E83_ShepherdsWhistle`, `E84_DollysMother` |
| effect | `onEndHarvestFieldPhase` | `A61_WinnowingFan`, `C110_HomeBrewer`, `C29_BeerTable`, `C54_MarketBooth`, `E112_GrainThief` |
| effect | `onEndTurn` | `B27_Toolbox`, `D74_RoyalWood` |
| effect | `onHarvestFeedingPhase` | `A62_BeerKeg`, `C49_BeerStall`, `C55_Studio`, `C63_CraftBrewery`, `D12_MilkingPlace`, `D133_BeerTentOperator`, `D84_FeedPellets`, `E110_Dentist`, `E132_VeggieLover`, `E134_Omnifarmer`, `E142_Smuggler`, `E39_Paintbrush`, `E48_TownHall` |
| effect | `onHarvestFieldPhase` | `A104_WoodHarvester`, `A112_ScytheWorker`, `A118_Treegardener`, `B101_FurnitureCarpenter`, `B39_Loom`, `B50_ButterChurn`, `B72_LoveforAgriculture`, `C98_CubeCutter`, `D38_MilkingStool`, `E107_LandSurveyor`, `E112_GrainThief` |
| effect | `onReturnHome` | `A29_AleBenches`, `A53_Claypipe`, `A70_LiftingMachine`, `A84_Silage`, `B124_Trimmer`, `B139_ForestScientist`, `B22_WalkingBoots`, `C51_FishingNet`, `C75_Firewood`, `D52_RollingPin` |
| effect | `onRoundEnd` | `A54_Credit` |
| effect | `onRoundStart` | `A19_Handplow`, `A76_Cob`, `A81_InterimStorage`, `A89_StablePlanner`, `A90_PlowDriver`, `A96_TaskArtisan`, `B110_Pavior`, `B114_Childless`, `B116_Shoreforester`, `B118_SmallscaleFarmer`, `B135_NutritionExpert`, `B18_GrasslandHarrow`, `B23_FinalScenario`, `B29_CookeryLesson`, `B57_Scullery`, `B69_PottersMarket`, `B81_Handcart`, `B97_Scholar`, `C103_GreenGrocer`, `C123_Freemason`, `C125_Nightworker`, `C159_FishermansFriend`, `C21_HeartofStone`, `C39_StudioBoat`, `D116_TreeInspector`, `D22_WorkPermit`, `D54_TroutPool`, `D69_SmallGreenhouse`, `D91_Plowman`, `D93_SheepInspector`, `E100_MuseumCaretaker`, `E102_Acquirer`, `E111_Recluse`, `E126_TaxCollector`, `E152_BargainHunter`, `E168_AnimalTamersApprentice`, `E88_MasterFencer` |
| effect | `onSowExtraField` | `B72_LoveforAgriculture` |
| effect | `onStartHarvest` | `C24_BedintheGrainField`, `C62_CookeryExtension`, `D129_LumberVirtuoso`, `D153_WealthyMan`, `D61_BaleofStraw`, `D97_BeggingStudent`, `E110_Dentist`, `E111_Recluse`, `E117_PipeSmoker`, `E147_AnimalDriver`, `E149_MidnightFencer`, `E58_LunchtimeBeer`, `E61_RaisedBed` |
| effect | `onStartHarvestFeedingPhase` | `C107_Baker`, `E52_Cubbyhole` |
| effect | `onStartHarvestFieldPhase` | `B165_GameProvider`, `B61_ThreeFieldRotation`, `C57_Crudite`, `D70_StrawManure`, `D72_StableManure`, `E73_Scythe` |
| effect | `onStartReturnHome` | `A100_Curator`, `A127_Lodger`, `A141_TurnipFarmer`, `A151_Minstrel`, `A152_NightSchoolStudent`, `A157_Bohemian`, `A35_SwimmingClass`, `A58_AsparagusKnife`, `C155_FoodDistributor`, `C97_SeedResearcher`, `D102_SampleStableMaker`, `D107_Bellfounder`, `D10_StorksNest`, `D18_SteamPlow`, `E20_IronHoe`, `E87_MasterRenovator` |
| effect | `resolveChoice` | `B146_Illusionist`, `B157_Salter`, `B3_Moonshine`, `C104_Collector`, `C146_WorkshopAssistant`, `D23_PioneeringSpirit`, `E134_Omnifarmer`, `E149_MidnightFencer` |
| exchange | `anytime` | `A60_OrientalFireplace`, `B80_HardPorcelain`, `D155_Ebonist`, `D59_EarthOven` |
| exchange | `bake-bread` | `A60_OrientalFireplace`, `D59_EarthOven` |
| exchange | `harvest` | `C105_BasketCarrier`, `C109_SchnappsDistiller`, `C62_CookeryExtension`, `D108_StoneCarver` |
| handHooks | `onBeforeStartOfTurn` | `E96_Elder` |
| listener | `after.$actionName` | `A40_PottersYard` |
| listener | `after.$dynamic` | `A144_Sequestrator`, `C52_HuntsmansHat`, `E53_BoarSpear` |
| listener | `after.*` | `E47_SyrupTap`, `E144_WaresSalesman` |
| listener | `after.bake-bread` | `A30_BakingSheet`, `A63_DutchWindmill`, `C61_BeerStein`, `E57_CheeseFondue` |
| listener | `after.collect` | `A103_Portmonger`, `A142_Cordmaker`, `A146_StorehouseSteward`, `A15_CarpentersAxe`, `A164_WoodWorker`, `A17_ReclamationPlow`, `A23_StoneCompany`, `A48_ShavingHorse`, `A95_Angler`, `B131_Equipper`, `B147_Huntsman`, `B15_CarpentersBench`, `B162_ForestClearer`, `B17_ForestPlow`, `B21_HayloftBarn`, `B34_SpecialFood`, `B48_ForestStone`, `B55_MaintenancePremium`, `B79_Corf`, `C102_TreeGuard`, `C114_SoilScientist`, `C163_MaterialDeliveryman`, `C42_RavenousHunger`, `C81_MaterialHub`, `D140_Loudmouth`, `D143_TreeCutter`, `D144_WaterWorker`, `D146_Porter`, `D19_PulverizerPlow`, `D36_BreedRegistry`, `D73_SupplyBoat`, `E103_Wolf`, `E118_KindlingGatherer`, `E140_Carter`, `E15_NailBasket`, `E38_RodCollection`, `E51_WhaleOil`, `E77_Mattock` |
| listener | `after.construct` | `A110_Roughcaster`, `A111_WallBuilder`, `A167_BreederBuyer`, `A21_FamilyFriendHome`, `A73_AgriculturalFertilizers`, `A93_BedMaker`, `B111_Rustic`, `B140_FarmyardWorker`, `B163_Pastor`, `B27_Toolbox`, `D123_RenovationPreparer`, `D128_BuildingTycoon`, `D163_JourneymanBricklayer`, `D74_RoyalWood`, `D94_HenpeckedHusband`, `D96_Furnisher`, `E123_ResourceHoarder`, `E49_Twibil`, `E52_Cubbyhole` |
| listener | `after.exchange` | `A48_ShavingHorse`, `B21_HayloftBarn`, `B29_CookeryLesson`, `C148_MudWallower`, `C53_GypsysCrock`, `D36_BreedRegistry`, `D56_FatstockStretcher`, `E85_MasterTanner` |
| listener | `after.family-growth` | `D150_GodlySpouse`, `D157_PartyOrganizer`, `E113_Godmother` |
| listener | `after.fence` | `A34_Loppers`, `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `B94_StockProtector`, `D89_Stablehand`, `E108_BlackberryFarmer`, `E74_AshTrees` |
| listener | `after.fencing` | `B124_Trimmer`, `B140_FarmyardWorker`, `B27_Toolbox` |
| listener | `after.gain` | `A48_ShavingHorse`, `B21_HayloftBarn`, `C120_AgriculturalLabourer`, `E103_Wolf`, `E118_KindlingGatherer` |
| listener | `after.improvement` | `A109_SmallTrader`, `A131_CraftTeacher`, `A41_VegetableSlicer`, `B100_Clutterer`, `C115_Sower`, `C137_CharcoalBurner`, `C43_FarmBuilding`, `C75_Firewood`, `C80_RockyTerrain`, `D118_Bonehead`, `D161_CabbageBuyer`, `D80_BrickHammer`, `E156_ClaypitOwner`, `E165_MasterHuntsman`, `E18_SeedAlmanac`, `E31_Upholstery` |
| listener | `after.pay` | `B18_GrasslandHarrow`, `C116_FurnitureMaker`, `C148_MudWallower`, `D74_RoyalWood`, `E122_Cottar`, `E123_ResourceHoarder`, `E128_Saddler`, `E54_Contraband` |
| listener | `after.place-farmer` | `A113_HeresyTeacher`, `A114_SeasonalWorker`, `A116_WoodCutter`, `A119_FirewoodCollector`, `A121_ClayPuncher`, `A122_PanBaker`, `A128_RiparianBuilder`, `A129_Swagman`, `A130_MummysBoy`, `A137_RiverineShepherd`, `A138_Harpooner`, `A139_HollowWarden`, `A140_ShovelBearer`, `A147_AnimalDealer`, `A149_HouseArtist`, `A150_Stagehand`, `A154_Paymaster`, `A155_Conjurer`, `A156_Buyer`, `A158_CulinaryArtist`, `A159_JoineroftheSea`, `A160_Lutenist`, `A161_PatchCaretaker`, `A163_BuildingExpert`, `A168_AnimalTeacher`, `A18_WheelPlow`, `A24_ThreshingBoard`, `A42_ForestLakeHut`, `A46_ClawKnife`, `A50_MilkJug`, `A51_DriftNetBoat`, `A66_FeedingDish`, `A67_CornScoop`, `A72_CalciumFertilizers`, `A77_Hod`, `A78_Canoe`, `A80_StoneTongs`, `A82_WorkCertificate`, `A92_AdoptiveParents`, `A97_Freshman`, `B108_OvenFiringBoy`, `B112_Silokeeper`, `B121_Geologist`, `B128_Plumber`, `B130_FullPeasant`, `B137_Wholesaler`, `B142_Greengrocer`, `B143_ClayWarden`, `B144_Collier`, `B150_LargeScaleFarmer`, `B151_LittlePeasant`, `B152_JuniorArtist`, `B156_StorehouseKeeper`, `B161_Weakling`, `B166_CattleFeeder`, `B19_MoldboardPlow`, `B24_Lasso`, `B28_ForestryStudies`, `B29_CookeryLesson`, `B40_BreweryPond`, `B43_Chophouse`, `B47_HerringPot`, `B56_Brook`, `B60_BrewingWater`, `B62_Pitchfork`, `B64_MillWheel`, `B77_LoamPit`, `B87_Cottager`, `B90_CooperativePlower`, `B91_AssistantTiller`, `B92_LittleStickKnitter`, `C117_Legworker`, `C121_ClayKneader`, `C126_Excavator`, `C130_OutskirtsDirector`, `C131_PrivateTeacher`, `C138_AnimalFeeder`, `C141_SheepProvider`, `C142_MarketCrier`, `C145_ForestReviewer`, `C147_Cowherd`, `C148_MudWallower`, `C150_ParrotBreeder`, `C151_SowingDirector`, `C152_Puppeteer`, `C164_GermanHeathKeeper`, `C167_CattleBuyer`, `C19_SwingPlow`, `C20_MolePlow`, `C23_JobContract`, `C26_Flail`, `C39_StudioBoat`, `C42_RavenousHunger`, `C45_Stew`, `C48_Farmstead`, `C51_FishingNet`, `C82_HardwareStore`, `C90_FieldWatchman`, `C91_PlowHero`, `C93_InnerDistrictsDirector`, `D101_SugarBaker`, `D103_CanalBoatman`, `D109_SowingMaster`, `D112_YoungFarmer`, `D134_OysterEater`, `D137_TradeTeacher`, `D141_SeedSeller`, `D144_WaterWorker`, `D149_CasualWorker`, `D151_SpinDoctor`, `D156_RetailDealer`, `D158_BeanCounter`, `D160_Midwife`, `D161_CabbageBuyer`, `D164_PetGrower`, `D165_PigStalker`, `D20_TurnwrestPlow`, `D27_Retraining`, `D39_TruffleSlicer`, `D55_NewMarket`, `D68_SmallBasket`, `D92_ChildOmbudsman`, `D93_SheepInspector`, `E105_Pioneer`, `E115_SeedServant`, `E116_FirCutter`, `E118_KindlingGatherer`, `E131_MarketMaster`, `E148_Lazybones`, `E160_KelpGatherer`, `E19_OxGoad`, `E40_BeeStatue`, `E66_BarnShed`, `E77_Mattock`, `E82_Profiteering`, `E95_Miller` |
| listener | `after.play-improvement` | `B16_MiningHammer`, `B49_Scales` |
| listener | `after.play-occupation` | `A139_HollowWarden`, `A96_TaskArtisan`, `B100_Clutterer`, `B103_FieldMerchant`, `B138_ForestGuardian`, `B151_LittlePeasant`, `B155_ArtTeacher`, `B25_BreadPaddle`, `B49_Scales`, `C120_AgriculturalLabourer`, `C68_Bookcase`, `C80_RockyTerrain`, `C95_BasketWeaver`, `D118_Bonehead`, `D163_JourneymanBricklayer`, `D42_EducationBonus`, `D95_SiteManager`, `E101_Blighter`, `E116_FirCutter`, `E157_Usufructuary`, `E163_Patroness`, `E165_MasterHuntsman`, `E89_Stallwright`, `E95_Miller` |
| listener | `after.plow` | `A105_BarrowPusher`, `A17_ReclamationPlow`, `B159_LieutenantGeneral`, `C80_RockyTerrain`, `D104_Cultivator`, `E164_MountainPlowman` |
| listener | `after.receive` | `A48_ShavingHorse`, `B21_HayloftBarn`, `C120_AgriculturalLabourer` |
| listener | `after.renovate-house` | `A110_Roughcaster`, `A120_ClayHutBuilder`, `A37_Bucksaw`, `A45_FireProtectionPond`, `B107_Manservant`, `B134_HousebookMaster`, `B168_PastureMaster`, `B16_MiningHammer`, `B55_MaintenancePremium`, `B76_Ceilings`, `C119_SkillfulRenovator`, `C132_TimberShingleMaker`, `C149_ResourceRecycler`, `C153_PatternMaker`, `D111_InteriorDecorator`, `D161_CabbageBuyer`, `D163_JourneymanBricklayer`, `D27_Retraining`, `D77_RecycledBrick`, `D81_RoofLadder`, `E123_ResourceHoarder`, `E154_Margrave`, `E87_MasterRenovator` |
| listener | `after.reorganize` | `C148_MudWallower` |
| listener | `after.sow` | `A79_GardenHoe`, `B115_TinsmithMaster`, `B54_Tumbrel`, `C73_SeaweedFertilizer`, `D58_Gritter`, `E50_WildGreens`, `E71_CowPatty`, `E79_FieldSpade` |
| listener | `after.stables` | `A167_BreederBuyer`, `A43_FarmyardManure`, `A73_AgriculturalFertilizers`, `A74_StableTree`, `B140_FarmyardWorker`, `B27_Toolbox`, `C56_FeedFence`, `D166_StableMilker`, `D168_Stockman`, `E114_ShedBuilder` |
| listener | `after.store-on-card` | `E27_PiggyBank` |
| listener | `after.take-from-card` | `E27_PiggyBank` |
| listener | `after.wish-children` | `E113_Godmother` |
| listener | `anytime.*` | `A102_Grocer`, `A153_PigOwner`, `A71_ClearingSpade`, `B154_SheepKeeper`, `B157_Salter`, `B35_HookKnife`, `B69_PottersMarket`, `B83_MuddyPuddles`, `B85_FarmHand`, `C101_StallHolder`, `C115_Sower`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C18_RollOverPlow`, `C46_Mandoline`, `C57_Crudite`, `C64_CornSchnappsDistillery`, `C69_LandConsolidation`, `C84_PerennialRye`, `C85_DenBuilder`, `C87_Mason`, `C94_StableCleaner`, `D106_WhiskyDistiller`, `D114_SeedTrader`, `D122_ClayCarrier`, `D124_Emissary`, `D13_Trowel`, `D46_PelletPress`, `D53_TeaHouse`, `D71_Changeover`, `D87_MasterBuilder`, `E13_StoneHouseReconstruction`, `E14_WoodSaw`, `E22_GuestRoom`, `E27_PiggyBank`, `E62_SourDough`, `E86_PenBuilder`, `E91_PlowBuilder` |
| listener | `before.*` | `A124_Knapper`, `A126_MasterWorkman`, `B120_Sweep`, `B63_Tasting` |
| listener | `before.bake-bread` | `B67_HandTruck`, `C60_SmallPottersOven`, `D66_PotterCeramics` |
| listener | `before.collect` | `A107_Catcher`, `A115_ChiefForester`, `A52_ThrowingAxe`, `A81_InterimStorage`, `A91_ShiftingCultivator`, `B122_Mineralogist`, `B138_ForestGuardian`, `B146_Illusionist`, `B34_SpecialFood`, `B51_DiggingSpade`, `C76_WoodCart`, `D105_Sculptor`, `D125_ForestTrader` |
| listener | `before.construct` | `A40_PottersYard`, `A73_AgriculturalFertilizers`, `D119_WoodBarterer`, `D74_RoyalWood` |
| listener | `before.cultivation` | `C112_Thresher` |
| listener | `before.exchange` | `D36_BreedRegistry`, `D56_FatstockStretcher`, `E85_MasterTanner` |
| listener | `before.family-growth` | `E130_Overachiever` |
| listener | `before.farmland` | `C112_Thresher` |
| listener | `before.fence` | `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `B94_StockProtector`, `D119_WoodBarterer`, `E74_AshTrees` |
| listener | `before.fencing` | `A40_PottersYard` |
| listener | `before.grain-utilization` | `C112_Thresher` |
| listener | `before.improvement` | `B75_WoodWorkshop` |
| listener | `before.meeting-place` | `D139_Chairman` |
| listener | `before.place-farmer` | `A92_AdoptiveParents`, `C154_TwinResearcher`, `C158_ForestCampaigner`, `C15_Trellis`, `C160_Outrider`, `C28_TeachersDesk`, `C48_Farmstead`, `D110_FishFarmer`, `D147_TrapBuilder`, `D16_WoodenWheyBucket`, `D28_WritingDesk`, `D83_Pigswill`, `D90_PlowMaker`, `E121_HillCultivator`, `E137_FlaxFarmer`, `E141_VegetableVendor`, `E166_Roastmaster`, `E17_SkimmerPlow`, `E55_StoneWeir`, `E59_CombandCutter`, `E67_GrainBag` |
| listener | `before.play-occupation` | `D152_Patron`, `D49_Bookshelf`, `E51_WhaleOil` |
| listener | `before.plow` | `A40_PottersYard` |
| listener | `before.renovate-house` | `D14_HammerCrusher` |
| listener | `before.sow` | `A132_Publican`, `A65_SeedPellets`, `D17_DrillHarrow` |
| listener | `before.stables` | `A40_PottersYard`, `A73_AgriculturalFertilizers`, `D74_RoyalWood` |
| listener | `computeArgs.place-farmer` | `A130_MummysBoy`, `A25_Bassinet`, `A26_SleepingCorner`, `A28_ForestSchool`, `A94_LazySowman`, `B129_Seatmate`, `B151_LittlePeasant`, `C129_SecondSpouse`, `C150_ParrotBreeder`, `D112_YoungFarmer`, `D24_BrotherlyLove`, `D50_ForeignAid`, `E129_Imitator`, `E150_RockBeater`, `E21_SheepRug` |
| listener | `computeChoiceCandidates.improvement` | `C27_Blueprint`, `D131_CraftsmanshipPromoter`, `E161_ElderBaker` |
| listener | `computeChoiceCandidates.renovate-house` | `A87_Conservator`, `D13_Trowel` |
| listener | `computeCosts.construct` | `A128_RiparianBuilder`, `A149_HouseArtist`, `B126_Carpenter`, `B13_CarpentersParlor`, `C128_WoodenHutExtender`, `C88_CarpentersApprentice`, `D121_ClayPlasterer`, `E123_ResourceHoarder`, `E150_RockBeater` |
| listener | `computeCosts.fence` | `C16_FieldFences`, `C88_CarpentersApprentice`, `D82_HuntingTrophy`, `E16_BriarHedge` |
| listener | `computeCosts.improvement` | `A143_Stonecutter`, `A20_DoubleTurnPlow`, `A27_OvenSite`, `A75_LumberMill`, `B36_Bottles`, `B95_MasterBricklayer`, `C122_Bricklayer`, `C27_Blueprint`, `C95_BasketWeaver`, `D117_WoodExpert`, `D82_HuntingTrophy`, `D95_SiteManager`, `D96_Furnisher`, `E109_BraidMaker`, `E123_ResourceHoarder`, `E130_Overachiever`, `E27_PiggyBank` |
| listener | `computeCosts.play-occupation` | `B109_PaperMaker`, `B155_ArtTeacher` |
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
| listener | `immediatelyAfter.$actionId` | `B132_EstateMaster` |
| listener | `immediatelyAfter.*` | `C25_SteamMachine` |
| listener | `immediatelyAfter.collect` | `A108_MushroomCollector`, `A56_Basket`, `C36_ClayDeposit`, `C58_Woodcraft`, `E33_BeaverColony`, `E75_StoneAxe` |
| listener | `immediatelyAfter.fence` | `A83_ShepherdsCrook` |
| listener | `immediatelyAfter.gain` | `A92_AdoptiveParents`, `E33_BeaverColony` |
| listener | `immediatelyAfter.improvement` | `C96_Merchant`, `D26_CarpentersYard`, `E146_Reseller` |
| listener | `immediatelyAfter.reap` | `B132_EstateMaster` |
| listener | `immediatelyAfter.renovate-house` | `C144_ReedRoofRenovator` |
| listener | `immediatelyAfter.trade-applied` | `C53_GypsysCrock`, `E91_PlowBuilder` |
| listener | `isDoable.*` | `A126_MasterWorkman` |
| listener | `isDoable.bake-bread` | `A97_Freshman`, `B26_AgrarianFences`, `B67_HandTruck`, `C60_SmallPottersOven`, `D66_PotterCeramics` |
| listener | `isDoable.collect` | `C51_FishingNet` |
| listener | `isDoable.construct` | `D119_WoodBarterer` |
| listener | `isDoable.family-growth` | `E155_Visionary` |
| listener | `isDoable.fence` | `B94_StockProtector`, `C88_CarpentersApprentice`, `D119_WoodBarterer`, `D82_HuntingTrophy`, `E74_AshTrees` |
| listener | `isDoable.fishing` | `C51_FishingNet` |
| listener | `isDoable.improvement` | `B103_FieldMerchant`, `B75_WoodWorkshop`, `C140_PackagingArtist`, `D21_Recruitment` |
| listener | `isDoable.place-farmer` | `E125_DelayedWayfarer` |
| listener | `isDoable.play-occupation` | `D152_Patron`, `D49_Bookshelf`, `E101_Blighter` |
| listener | `isDoable.renovate-house` | `A87_Conservator`, `D14_HammerCrusher` |
| listener | `isDoable.sow` | `A65_SeedPellets`, `A94_LazySowman`, `B26_AgrarianFences`, `B72_LoveforAgriculture`, `C112_Thresher`, `D17_DrillHarrow` |
| specialKind | `add-resource-to-space` | `C130_OutskirtsDirector`, `C93_InnerDistrictsDirector` |
| specialKind | `build-stable-on-first-empty-tile` | `E148_Lazybones` |
| specialKind | `card-field` | `C8_PlantFertilizer` |
| specialKind | `choice` | `B146_Illusionist`, `D23_PioneeringSpirit` |
| specialKind | `clear-pending-fence-bonus` | `E74_AshTrees` |
| specialKind | `consume-fence` | `C1_Overhaul`, `C54_MarketBooth` |
| specialKind | `field` | `C8_PlantFertilizer` |
| specialKind | `grain` | `E112_GrainThief` |
| specialKind | `increment-counter` | `B132_EstateMaster`, `C132_TimberShingleMaker` |
| specialKind | `increment-extra-data` | `C104_Collector`, `D134_OysterEater`, `D92_ChildOmbudsman`, `E149_MidnightFencer`, `E38_RodCollection` |
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
| specialKind | `set-extra-data` | `A68_AsparagusGift`, `A73_AgriculturalFertilizers`, `B124_Trimmer`, `B132_EstateMaster`, `B137_Wholesaler`, `B18_GrasslandHarrow`, `B21_HayloftBarn`, `B34_SpecialFood`, `B48_ForestStone`, `B55_MaintenancePremium`, `C150_ParrotBreeder`, `C16_FieldFences`, `C48_Farmstead`, `C53_GypsysCrock`, `D156_RetailDealer`, `D36_BreedRegistry`, `D56_FatstockStretcher`, `D74_RoyalWood`, `E148_Lazybones`, `E149_MidnightFencer`, `E51_WhaleOil`, `E53_BoarSpear`, `E58_LunchtimeBeer`, `E85_MasterTanner`, `E91_PlowBuilder` |
| specialKind | `set-flag` | `A130_MummysBoy`, `A153_PigOwner`, `A17_ReclamationPlow`, `A18_WheelPlow`, `A45_FireProtectionPond`, `A92_AdoptiveParents`, `A97_Freshman`, `B124_Trimmer`, `B140_FarmyardWorker`, `B154_SheepKeeper`, `B163_Pastor`, `B24_Lasso`, `B34_SpecialFood`, `B35_HookKnife`, `B76_Ceilings`, `B85_FarmHand`, `C101_StallHolder`, `C143_StoneBuyer`, `C150_ParrotBreeder`, `C42_RavenousHunger`, `C46_Mandoline`, `C51_FishingNet`, `C64_CornSchnappsDistillery`, `C84_PerennialRye`, `C85_DenBuilder`, `C87_Mason`, `C94_StableCleaner`, `D122_ClayCarrier`, `D150_GodlySpouse`, `D157_PartyOrganizer`, `D27_Retraining`, `D46_PelletPress`, `D53_TeaHouse`, `D87_MasterBuilder`, `D93_SheepInspector`, `E13_StoneHouseReconstruction`, `E146_Reseller`, `E151_DeliveryNurse`, `E22_GuestRoom`, `E27_PiggyBank`, `E62_SourDough`, `E91_PlowBuilder`, `E92_FieldDoctor` |
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
| `A12_DrinkingTrough` | 已对齐 |  |
| `A13_RenovationCompany` | 已对齐 |  |
| `A14_CarpentersHammer` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `A15_CarpentersAxe` | 已对齐 |  |
| `A16_RammedClay` | 已对齐 |  |
| `A17_ReclamationPlow` | 已对齐 |  |
| `A18_WheelPlow` | 已对齐 |  |
| `A19_Handplow` | 已对齐 |  |
| `A20_DoubleTurnPlow` | 已对齐 |  |
| `A21_FamilyFriendHome` | 已对齐 |  |
| `A22_Telegram` | 已接受差异 | 已接受的行为 / 产品差异 |
| `A23_StoneCompany` | 已对齐 |  |
| `A24_ThreshingBoard` | 已对齐 |  |
| `A25_Bassinet` | 已对齐 |  |
| `A26_SleepingCorner` | 已对齐 |  |
| `A27_OvenSite` | 已对齐 |  |
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
| `A92_AdoptiveParents` | 已对齐 |  |
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
| `A112_ScytheWorker` | 已对齐 |  |
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
| `A136_DrudgeryReeve` | 已接受差异 | 已接受的行为 / 产品差异 |
| `A137_RiverineShepherd` | 已对齐 |  |
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
| `B1_UpscaleLifestyle` | 已对齐 |  |
| `B2_MiniPasture` | 已对齐 |  |
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
| `B15_CarpentersBench` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B16_MiningHammer` | 已对齐 |  |
| `B17_ForestPlow` | 已对齐 |  |
| `B18_GrasslandHarrow` | 已对齐 |  |
| `B19_MoldboardPlow` | 需复核 | plow 成功前就消耗使用次数 |
| `B20_ChainFloat` | 已对齐 |  |
| `B21_HayloftBarn` | 已对齐 | 通过 resource exchange 获得的 grain 已由 provenance helper 触发 |
| `B22_WalkingBoots` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B23_FinalScenario` | 已对齐 | 第 14 轮行动 reveal / exclusive gate / clear event 已由后端权威建模 |
| `B24_Lasso` | 需复核 | 只在动物市场后触发，漏掉非动物市场首次放人路径 |
| `B25_BreadPaddle` | 已对齐 |  |
| `B26_AgrarianFences` | 已对齐 |  |
| `B27_Toolbox` | 已接受差异 | 已接受的简化实现 |
| `B28_ForestryStudies` | 已对齐 |  |
| `B29_CookeryLesson` | 已对齐 | lessons-3 行动格覆盖已由共享 lessons-space helper 对齐 |
| `B30_WoodPalisades` | 已对齐 |  |
| `B31_PotteryYard` | 已对齐 |  |
| `B32_Kettle` | 已对齐 |  |
| `B33_Mantlepiece` | 已接受差异 | 已接受的简化实现 |
| `B34_SpecialFood` | 需复核 | A137 Riverine Shepherd 交互需要定向验证 |
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
| `B49_Scales` | 已对齐 |  |
| `B50_ButterChurn` | 已对齐 |  |
| `B51_DiggingSpade` | 已对齐 |  |
| `B52_GrowingFarm` | 已对齐 |  |
| `B53_SculptureCourse` | 已对齐 |  |
| `B54_Tumbrel` | 已对齐 |  |
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
| `B67_HandTruck` | 需复核 | bake 前 optional grain 被建模为无条件 gain |
| `B68_Beanfield` | 已对齐 |  |
| `B69_PottersMarket` | 已对齐 |  |
| `B70_NewPurchase` | 已对齐 |  |
| `B71_HarvestHouse` | 已对齐 |  |
| `B72_LoveforAgriculture` | 已对齐 |  |
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
| `B85_FarmHand` | 已接受差异 | 已接受的行为 / 产品差异 |
| `B86_TruffleSearcher` | 已对齐 |  |
| `B87_Cottager` | 已对齐 |  |
| `B88_EstablishedPerson` | 已对齐 |  |
| `B89_Groom` | 已对齐 |  |
| `B90_CooperativePlower` | 已对齐 |  |
| `B91_AssistantTiller` | 已对齐 |  |
| `B92_LittleStickKnitter` | 已对齐 |  |
| `B93_Confidant` | 已对齐 |  |
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
| `B124_Trimmer` | 需复核 | 限制每工作阶段奖励一次；BGA 每次覆盖数增加都奖励 |
| `B125_EstateWorker` | 已对齐 |  |
| `B126_Carpenter` | 已对齐 |  |
| `B127_Seducer` | 已对齐 |  |
| `B128_Plumber` | 已对齐 |  |
| `B129_Seatmate` | 已接受差异 | 已接受的简化实现 |
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
| `B149_OpenAirFarmer` | 已对齐 |  |
| `B150_LargeScaleFarmer` | 已对齐 |  |
| `B151_LittlePeasant` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `B152_JuniorArtist` | 已对齐 |  |
| `B153_Housemaster` | 已对齐 |  |
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
| `C2_Stable` | 已对齐 |  |
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
| `C15_Trellis` | 已对齐 |  |
| `C16_FieldFences` | 已对齐 |  |
| `C17_NewlyPlowedField` | 已对齐 |  |
| `C18_RollOverPlow` | 已对齐 |  |
| `C19_SwingPlow` | 已对齐 |  |
| `C20_MolePlow` | 已对齐 |  |
| `C21_HeartofStone` | 已对齐 |  |
| `C22_BasketChair` | 已接受差异 | 已接受的行为 / 产品差异 |
| `C23_JobContract` | 已对齐 |  |
| `C24_BedintheGrainField` | 已接受差异 | 已接受的简化实现 |
| `C25_SteamMachine` | 已接受差异 | 已接受的简化实现 |
| `C26_Flail` | 已对齐 |  |
| `C27_Blueprint` | 已接受差异 | 已接受的简化实现 |
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
| `C42_RavenousHunger` | 已接受差异 | 已接受的简化实现 |
| `C43_FarmBuilding` | 已对齐 |  |
| `C44_ChickenCoop` | 已对齐 |  |
| `C45_Stew` | 已对齐 |  |
| `C46_Mandoline` | 已对齐 |  |
| `C47_GardenClaw` | 已对齐 |  |
| `C48_Farmstead` | 已对齐 |  |
| `C49_BeerStall` | 已对齐 |  |
| `C50_StableYard` | 已对齐 |  |
| `C51_FishingNet` | 已对齐 |  |
| `C52_HuntsmansHat` | 已接受差异 | 已接受的简化实现 |
| `C53_GypsysCrock` | 已对齐 |  |
| `C54_MarketBooth` | 需复核 | BGA printed cost 是 1 stable；OA cost 为空 |
| `C55_Studio` | 已对齐 |  |
| `C56_FeedFence` | 已对齐 |  |
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
| `C67_MineralFeeder` | 已接受差异 | 已接受的简化实现 |
| `C68_Bookcase` | 已对齐 |  |
| `C69_LandConsolidation` | 已接受差异 | 已接受的简化实现 |
| `C70_LettucePatch` | 已对齐 |  |
| `C71_Slurry` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `C72_FestivalPlanning` | 已接受差异 | 已接受的简化实现 |
| `C73_SeaweedFertilizer` | 已对齐 |  |
| `C74_PrivateForest` | 已对齐 |  |
| `C75_Firewood` | 已对齐 |  |
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
| `C87_Mason` | 已对齐 |  |
| `C88_CarpentersApprentice` | 已对齐 |  |
| `C89_StableMaster` | 已对齐 |  |
| `C90_FieldWatchman` | 已对齐 |  |
| `C91_PlowHero` | 已对齐 |  |
| `C92_AutumnMother` | 已对齐 |  |
| `C93_InnerDistrictsDirector` | 已接受差异 | 已接受的简化实现 |
| `C94_StableCleaner` | 已对齐 |  |
| `C95_BasketWeaver` | 已对齐 |  |
| `C96_Merchant` | 已对齐 |  |
| `C97_SeedResearcher` | 已对齐 |  |
| `C98_CubeCutter` | 已对齐 |  |
| `C99_GardenDesigner` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `C100_Butler` | 已对齐 |  |
| `C101_StallHolder` | 已对齐 |  |
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
| `C120_AgriculturalLabourer` | 已接受差异 | 已接受的简化实现 |
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
| `C133_Soldier` | 已接受差异 | 已接受的行为 / 产品差异 |
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
| `C146_WorkshopAssistant` | 已接受差异 | 已接受的简化实现 |
| `C147_Cowherd` | 已对齐 |  |
| `C148_MudWallower` | 已对齐 |  |
| `C149_ResourceRecycler` | 已对齐 |  |
| `C150_ParrotBreeder` | 已对齐 |  |
| `C151_SowingDirector` | 已对齐 |  |
| `C152_Puppeteer` | 已对齐 |  |
| `C153_PatternMaker` | 已对齐 |  |
| `C154_TwinResearcher` | 已接受差异 | 已接受的简化实现 |
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
| `D1_ZigzagHarrow` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `D2_DwellingPlan` | 已对齐 |  |
| `D3_Furrows` | 已对齐 |  |
| `D4_CrossCutWood` | 已接受差异 | BGA banned，但 OA 按产品策略保留 |
| `D5_FieldClay` | 已对齐 |  |
| `D6_PetrifiedWood` | 已对齐 |  |
| `D7_Trident` | 已对齐 |  |
| `D8_FernSeeds` | 已对齐 |  |
| `D9_GameTrade` | 已对齐 |  |
| `D10_StorksNest` | 已对齐 |  |
| `D11_LawnFertilizer` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `D12_MilkingPlace` | 已对齐 |  |
| `D13_Trowel` | 已对齐 |  |
| `D14_HammerCrusher` | 已对齐 |  |
| `D15_ClaySupports` | 已对齐 |  |
| `D16_WoodenWheyBucket` | 已对齐 |  |
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
| `D36_BreedRegistry` | 已接受差异 | 已接受的简化实现 |
| `D37_Sculpture` | 已对齐 |  |
| `D38_MilkingStool` | 已对齐 |  |
| `D39_TruffleSlicer` | 已对齐 |  |
| `D40_Cesspit` | 已对齐 |  |
| `D41_HorseDrawnBoat` | 已对齐 |  |
| `D42_EducationBonus` | 已对齐 |  |
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
| `D72_StableManure` | 已对齐 |  |
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
| `D86_SheepAgent` | 已对齐 |  |
| `D87_MasterBuilder` | 已对齐 |  |
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
| `D101_SugarBaker` | 已接受差异 | 已接受的简化实现 |
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
| `D132_HideFarmer` | 已接受差异 | 已接受的行为 / 产品差异 |
| `D133_BeerTentOperator` | 已对齐 |  |
| `D134_OysterEater` | 已对齐 |  |
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
| `D148_DomesticianExpert` | 已对齐 |  |
| `D149_CasualWorker` | 已对齐 |  |
| `D150_GodlySpouse` | 已对齐 |  |
| `D151_SpinDoctor` | 已对齐 |  |
| `D152_Patron` | 已对齐 |  |
| `D153_WealthyMan` | 已对齐 |  |
| `D154_ChimneySweep` | 已对齐 |  |
| `D155_Ebonist` | 需复核 | BGA exchange 仅 harvest；OA 暴露为 anytime exchange |
| `D156_RetailDealer` | 已对齐 |  |
| `D157_PartyOrganizer` | 已对齐 |  |
| `D158_BeanCounter` | 已对齐 |  |
| `D159_ReedSeller` | 排除 | BGA implemented=false；OA 保留 data-only 定义 |
| `D160_Midwife` | 已对齐 |  |
| `D161_CabbageBuyer` | 已接受差异 | 已接受的行为 / 产品差异 |
| `D162_ClayFirer` | 已对齐 |  |
| `D163_JourneymanBricklayer` | 已对齐 |  |
| `D164_PetGrower` | 已对齐 |  |
| `D165_PigStalker` | 已对齐 |  |
| `D166_StableMilker` | 已对齐 |  |
| `D167_PureBreeder` | 已对齐 |  |
| `D168_Stockman` | 已对齐 |  |
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
| `E1_PoleBarns` | 已对齐 |  |
| `E2_RenovationMaterials` | 已对齐 |  |
| `E3_TeaTime` | 已对齐 |  |
| `E4_Thunderbolt` | 已对齐 |  |
| `E5_NightLoot` | 已对齐 | BGA passing 行为由 improvement host action / pay child / activate-card-effect 处理 |
| `E6_Recount` | 已对齐 |  |
| `E7_Pumpernickel` | 已对齐 |  |
| `E8_FarmersMarket` | 已对齐 |  |
| `E9_BarteringHut` | 已对齐 |  |
| `E10_StrawHat` | 需复核 | BGA 要求选择移动或食物；OA 允许跳过整个 XOR |
| `E11_PettingZoo` | 已对齐 |  |
| `E12_AnimalBedding` | 已对齐 |  |
| `E13_StoneHouseReconstruction` | 已对齐 |  |
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
| `E25_BumperCrop` | 已对齐 |  |
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
| `E43_BarnCats` | 已对齐 |  |
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
| `E68_CherryOrchard` | 需复核 | desc 弱化了 BGA sow/harvest-as-grain 文案 |
| `E69_MelonPatch` | 已对齐 |  |
| `E70_CropRotationField` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E71_CowPatty` | 已对齐 | 单个 eligible 也走 optional selection，多田使用精确 selectableTiles |
| `E72_ArtichokeField` | 已接受差异 | 已接受的行为 / 产品差异 |
| `E73_Scythe` | 已对齐 |  |
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
| `E84_DollysMother` | 已对齐 |  |
| `E85_MasterTanner` | 已对齐 |  |
| `E86_PenBuilder` | 已对齐 |  |
| `E87_MasterRenovator` | 已对齐 |  |
| `E88_MasterFencer` | 已对齐 |  |
| `E89_Stallwright` | 已对齐 |  |
| `E90_DungCollector` | 已对齐 |  |
| `E91_PlowBuilder` | 已对齐 |  |
| `E92_FieldDoctor` | 已对齐 |  |
| `E93_Motivator` | 已对齐 |  |
| `E94_Prophet` | 已对齐 |  |
| `E95_Miller` | 已对齐 |  |
| `E96_Elder` | 已对齐 |  |
| `E97_Beneficiary` | 已对齐 |  |
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
| `E112_GrainThief` | 已接受差异 | 已接受的简化实现 |
| `E113_Godmother` | 已对齐 |  |
| `E114_ShedBuilder` | 已对齐 |  |
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
| `E127_DiligentFarmer` | 已对齐 |  |
| `E128_Saddler` | 已对齐 |  |
| `E129_Imitator` | 已对齐 |  |
| `E130_Overachiever` | 已对齐 |  |
| `E131_MarketMaster` | 已对齐 |  |
| `E132_VeggieLover` | 排除 | BGA implemented=false，本轮无运行时对齐目标 |
| `E133_ChampionBreeder` | 已对齐 |  |
| `E134_Omnifarmer` | 已对齐 |  |
| `E135_Pickler` | 已对齐 |  |
| `E136_AnimalHusbandryWorker` | 已对齐 |  |
| `E137_FlaxFarmer` | 已对齐 |  |
| `E138_LivestockExpert` | 已对齐 |  |
| `E139_BunnyBreeder` | 已对齐 |  |
| `E140_Carter` | 已对齐 |  |
| `E141_VegetableVendor` | 已对齐 |  |
| `E142_Smuggler` | 已对齐 |  |
| `E143_Hewer` | 已对齐 |  |
| `E144_WaresSalesman` | 已对齐 |  |
| `E145_Parvenu` | 已对齐 |  |
| `E146_Reseller` | 已对齐 |  |
| `E147_AnimalDriver` | 已对齐 |  |
| `E148_Lazybones` | 已对齐 |  |
| `E149_MidnightFencer` | 已接受差异 | 已接受的行为 / 产品差异 |
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
