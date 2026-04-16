# 5+ 人卡开发分析

基于 `shared/cards/A/*169-180*.ts`、`shared/cards/B/*169-180*.ts`、`shared/cards/C/*169-180*.ts`、`shared/cards/D/*169-180*.ts` 的 `desc` 文本，以及当前仓库中的 `registerCardEffect`、`registerCardListener`、`registerPlayerActionSpace`、`ActionFlow`、`cardStates`、`anytime`、`onComputeAnimalZones` 等基础设施做的实现评估。

这份文档的目标不是复述 BGA，而是回答三个问题：

1. 这张卡在 `open-agricola` 里现在实现起来是低、中还是高难度。
2. 最可能落在什么机制上。
3. 是单卡逻辑复杂，还是先卡在通用基础设施缺失。

现状补充：

- 这 48 张卡当前都只有数据定义，没有对应的 `listener` / `effect` / `player action space` 注册。
- `shared/actions/index.ts` 和 `shared/logic/state.ts` 当前仍只创建基础版行动位；部分 5+/6+ 专用行动位还没有进入权威 `actionSpaces` 模型。

## 难度定义

| 难度 | 含义 |
|---|---|
| 低 | 现有 hook / flow / action 已足够，最多补一个很小的 helper |
| 中 | 需要补一个可复用 helper、轻量通用语义，或写一个稍复杂的链式 flow |
| 高 | 需要新增明显的通用基础设施，或当前 board/deck/setup 模型还不支持 |

## 当前已有能力

- `registerPlayerActionSpace`：已经能做 owner-only / all-player 的动态行动格。
- `anytime`：已经能做随时动作、随时交换、带 flag 的一次性动作。
- 阶段 hook：已有 `onRoundStart`、`onBeforeReturnHome`、`onStartReturnHome`、`onStartHarvest`、`onAfterHarvest`。
- 对手触发：`CardListener` 已支持 `scope: 'player' | 'opponent' | 'any'`。
- 动物卡槽：`onComputeAnimalZones` 已支持 card zone、混养、动态容量。
- 行动后资源回填：已有 `return-to-space`，可把资源放回行动位。
- 实际支付追踪：支付路径已有 `resourcesPaid`，适合做“按实际支付奖励”。
- 额外房间容量：已有 `computeExtraRoomCapacity` / `getExtraRoomCapacity()`。

## 主要前置缺口

| 能力 | 当前现状 | 直接影响 |
|---|---|---|
| 5+/6+ 行动位建模 | `shared/actions/index.ts` / `shared/logic/state.ts` 当前没有 `lessons-2`、`house-building`、`farming-supplies`、`riverbank-forest`、`animal-market`、extension meeple spaces | A174, A177, A180, B174, C173, C175, C176, C177, D178, D179，且 D171 全量正确性也受影响 |
| `meeple symbol` 元数据 | 当前 `ActionDefinition` 上没有统一的 “带 meeple 符号” 标记 | A174, A177, B173 |
| Minor Improvement 运行时牌库 / 抽牌 | 当前状态里有 `minorHand`，但没有通用的 runtime draw pile / discard pile 语义 | C171 |
| 本轮第 N 次同类行动计数 | 没有统一的 “本轮第几次 Lessons / 第几次木累积格” helper | C175, C180 |
| Partial collect / 留货在格上 | `shared/actions/effects/collect.ts` 当前是“全拿并清空” | D180 |
| `lone occupation` 约束 | 还没有“这张必须是你唯一职业”的通用 setup / rules enforcement | B176 |
| 主建筑 printed cost 求和 | 有额外房间容量 hook，但没有“major 印刷建材成本总和” helper | A169 |
| 一次性翻面兑现模式 | 可用 `cardStates` 自己做，但还没有统一 helper | A173, B173, C172, D173 |
| 单次翻修免芦苇 | 可用 `computeCosts`，但还没有“只对这次 renovate 生效”的 scoped helper | C169 |
| 新牧场创建信号 | 围栏逻辑可复用，但还没有明确的 “this action created a new pasture” 通用事件 | C179 |

## 按 Deck 汇总

| Deck | 低 | 中 | 高 | 有前置阻塞 | 适合先做 | 高风险 |
|---|---|---|---|---|---|---|
| A | 5 | 4 | 3 | 3 | A172, A176, A178 | A170, A171, A177 |
| B | 4 | 6 | 2 | 3 | B169, B172, B177 | B175, B176, B178 |
| C | 4 | 6 | 2 | 5 | C170, C174, C178 | C171, C173, C180 |
| D | 3 | 7 | 2 | 2 | D172, D174, D177 | D170, D179, D180 |
| **总计** | **16** | **23** | **9** | **13** |  |  |

## 建议开发顺序

1. 先补 5+/6+ 行动位模型：至少把 `lessons-2`、`house-building`、`farming-supplies`、`riverbank-forest`、`animal-market`、extension meeple spaces 放进权威 `actionSpaces`。
2. 再补 4 个通用 helper：`meeple symbol` 元数据、本轮第 N 次同类行动计数、partial collect、minor deck draw。
3. 然后优先清低难度且无阻塞的卡：A172, A176, A178, A179, B169, B172, B177, C174, C178, D172, D174, D177。
4. 最后处理高风险卡：A170, A171, A177, B175, B176, B178, C171, C173, C180, D170, D179, D180。

## Deck A

| 卡牌 | 难度 | 效果摘要 | 建议落点 / 先例 | 缺少基础设施 / 备注 |
|---|---|---|---|---|
| `A169_OffSiter` | 中 | 主建筑 printed cost 总和达到 9 后，额外提供 1 room | `computeExtraRoomCapacity`；先例 `getExtraRoomCapacity()`、`D21_Recruitment`、`E85_MasterTanner` | 需补 “major 印刷建材成本求和” helper |
| `A170_Hayward` | 高 | 任意时刻建栅栏，不占工人位，也不算普通 `Build Fences` | `anytime` + `fencing` flow；先例 `E91_PlowBuilder`、`B85_FarmHand` | 需统一 “非标准建栅栏行动” 语义，避免污染普通围栏流程 |
| `A171_Sidekick` | 高 | 用 round action card 后，可付 1 food 连锁往左邻 round card 再放工人 | `place-farmer` after + 递归 extra placement；先例 `D151_SpinDoctor`、`B130_FullPeasant`、`C23_JobContract`、`D165_PigStalker` | 需稳妥处理左邻关系、工人耗尽、pending 链和停止条件 |
| `A172_BoatPainter` | 低 | `fishing` 和 `traveling-players` 都被占用时，二选一奖励 | `onBeforeReturnHome` + xor gain；先例 `A141_TurnipFarmer`、`E143_Hewer` | 无结构性缺口 |
| `A173_ClayThief` | 中 | 一次性在工作阶段开始拿走 `hollow-4` 全部 clay | `onBeforeStartOfTurn` / `onRoundStart` + flagged card state；先例 `A139_HollowWarden`、`C22_BasketChair` | 最好抽一个 once-game / face-down helper |
| `A174_MasterHora` | 中 | 用 extension meeple action 前，可 1 food 买 1 vegetable | before `place-farmer` + optional pay/gain；先例 `D138_PetLover` | 缺 extension meeple-space 列表和 `meeple symbol` metadata |
| `A175_HollowGardener` | 低 | 从 `hollow-4` 拿 3/6 clay 时，额外 grain / vegetable | after `place-farmer` on hollow + `context.result.resourcesGained.clay`；先例 `A139_HollowWarden` | 无大缺口 |
| `A176_Wheelmaker` | 低 | 打出时若木头多于其他玩家总和且已打过别的职业，则补到 15 wood | `play-occupation` after / on-play resource flow；先例常规 on-play gain cards | 无结构性缺口 |
| `A177_Middleman` | 高 | 在 extension meeple spaces 放 food + stone，下次自己落位领走 | on-play seed per-space rewards + `place-farmer` after collect；先例 `C39_StudioBoat`、`A174_MasterHora` | 缺 extension meeple-space model；还需可复用的 “per-space per-owner attached goods” 语义 |
| `A178_CarpentersBoy` | 低 | 他人建房时得 1 wood | `construct` after + opponent scope；先例 `D128_BuildingTycoon` | 无 |
| `A179_MountainShepherd` | 低 | 用 quarry 时额外得 1 sheep | after `place-farmer` on `western-quarry` / `eastern-quarry`；先例 `A80_StoneTongs`、`D149_CasualWorker` | 无 |
| `A180_AnimalBrander` | 中 | 用 `animal-market` 时可付 1 food，把同一选项执行两次 | before / `computeReplace` wrap action option；先例 `D138_PetLover` | 缺 `animal-market` 行动位；建议顺便抽 “repeat selected branch once” helper |

## Deck B

| 卡牌 | 难度 | 效果摘要 | 建议落点 / 先例 | 缺少基础设施 / 备注 |
|---|---|---|---|---|
| `B169_LivestockSustainer` | 低 | 对手每建 1 座 major，多 1 个混养动物位，上限 8 | `onComputeAnimalZones`；先例 `E11_PettingZoo`、`B148_PetBroker`、`E86_PenBuilder` | 无大缺口，确认 major 统计口径即可 |
| `B170_CorralBuilder` | 中 | `pig-market` / `cattle-market` 揭示时，可各免费 fence exactly 1 space | `onRoundStart` + revealed action check + free fencing；先例 `A96_TaskArtisan`、`A89_StablePlanner` | 最好补一个 “本轮揭示的是哪张 round card” helper |
| `B171_GreenhouseBuilder` | 中 | owner-only action space；若对应 action 已在场上则三选一 | `registerPlayerActionSpace`；先例 `D127_HardworkingMan`、`E161_ElderBaker`、`D23_PioneeringSpirit` | 需把 `fencing` / `house-redevelopment` / `vegetable-seeds` 映射到正确 actionId |
| `B172_CattleCaregiver` | 低 | 每轮开始按全桌 cattle 覆盖人数给 food | `onRoundStart` scan players；先例常规 `onRoundStart` resource cards | 无 |
| `B173_Sweeper` | 中 | 每次用 meeple-symbol action 在卡上放 1 food，一次性全部取回 | after `place-farmer` + card counters/stack + cashout；先例 `C172_FieldCounter`、`D173_TownClerk` | 缺 `meeple symbol` metadata；最好顺手抽 shared cashout helper |
| `B174_RiverbankGardener` | 低 | 用 `riverbank-forest` 时额外得 1 vegetable | after `place-farmer` on named space；先例 `A139_HollowWarden` | 缺 `riverbank-forest` action space 建模 |
| `B175_FieldOverseer` | 高 | 对手 harvest grain fields 合计达 3/4/6 时，给 food / grain / vegetable | harvest-phase aggregation across opponents；已有 harvest hooks 但无同款先例 | 缺跨玩家 harvest-field-count 聚合信号 |
| `B176_VillageIdiot` | 中 | 他人用 `meeting-place` 时得 1 wood + 1 food | `scope: 'opponent'` after `place-farmer`；先例 `A50_MilkJug`、`A158_CulinaryArtist` | 缺通用 `lone occupation` setup / enforcement |
| `B177_StoneClawer` | 低 | plow 后得 1 stone | `actions: ['plow']` after；先例 `E164_MountainPlowman` | 无 |
| `B178_TagAlong` | 高 | 他人用 `resource-market-4` 后，你可再派一人去同格 | opponent after + extra `place-farmer` / `playerSwitch`；先例 `D151_SpinDoctor`、`C150_ParrotBreeder`、`E129_Imitator` | 需统一跨玩家插入放工人的顺序与占用语义 |
| `B179_WildBoarHunter` | 中 | 回家阶段若至少 3 个 wood accumulation spaces 被占用，可 1 wood -> 1 boar | `onStartReturnHome` + count occupied wood accumulation spaces；先例 `B161_Weakling`、`E143_Hewer` | 最好抽 `countOccupiedAccumulation(resource)` helper |
| `B180_GameTeaser` | 中 | 从 food accumulation space 拿 1/2/3 food 时，额外 cattle / boar / sheep | after collect / `place-farmer` + inspect `resourcesGained.food`；先例 `E118_KindlingGatherer`、`A154_Paymaster` | 最好抽 “food accumulation space” helper |

## Deck C

| 卡牌 | 难度 | 效果摘要 | 建议落点 / 先例 | 缺少基础设施 / 备注 |
|---|---|---|---|---|
| `C169_FastMason` | 中 | clay / stone accumulation 之后，可不付 reed 直接 renovate 到 clay / stone | after listener + scoped renovate cost override；先例 `E109_BraidMaker` 的 `computeCosts`、各类 renovate 折扣卡 | 需一个只对本次 renovate 生效的 no-reed helper |
| `C170_AmateurFencer` | 中 | 打出时若还没有 pasture，可免费围 exactly 1 space | on-play free fencing；先例 `E88_MasterFencer`、`B2_MiniPasture`、`B170_CorralBuilder` | 需和围栏校验对齐 “exactly one space” 语义 |
| `C171_YoungArtist` | 高 | returning home 付 1 food：minor-improvement 或 draw 2 minors | `onStartReturnHome` + xor；先例 `A96_TaskArtisan`、`D102_SampleStableMaker` | 缺 runtime minor deck / draw / discard infrastructure |
| `C172_FieldCounter` | 中 | opponent plow => +1 food on card；once-game cashout | opponent `plow` after + counters / stack；先例 `B173_Sweeper`、`D173_TownClerk` | 最好共用一次性兑现 helper |
| `C173_TopOuter` | 中 | `house-building` 被使用时，拿走 `traveling-players` 上全部 food | after specific space + drain other space resources；先例 `B152_JuniorArtist`、`C39_StudioBoat` | 缺 `house-building` action space 建模 |
| `C174_StoneCustodian` | 低 | stone accumulation spaces 剩 1 个有 stone -> grain；2 个都有 -> vegetable | `onBeforeReturnHome`；先例 `E158_StoneCustodian` | 无 |
| `C175_VillageTeacher` | 中 | Lessons 第 1/2/3 次被占用时给 food / grain / vegetable | after lessons + round-scope order counter；先例 `B63_Tasting`、`D28_WritingDesk` | 缺 `lessons-2` action space 和通用 nth-use counter |
| `C176_Cleanacre` | 低 | `farmland` / `cultivation` / `farming-supplies` 后得 2 clay | after specific spaces；先例 `A121_ClayPuncher`、`B90_CooperativePlower` | `farming-supplies` action space 缺失；可先部分实现前两项 |
| `C177_MountainHiker` | 低 | 用 extension accumulation space 后，可 1 food 买 1 stone | after trigger + optional pay/gain；先例 `D174_LoessGardener`、`A174_MasterHora` | 缺 extension accumulation-space 列表 |
| `C178_OnSiteReverend` | 低 | start of harvest 选 1 building resource | `onStartHarvest` + choice flow；先例现有 `onStartHarvest` cards | 无 |
| `C179_BovinePioneer` | 中 | 创建至少 1 个 new pasture 时得 1 cattle | fencing after + detect newly created pasture；已有围栏 hooks 可复用 | 最好抽 “pasture created this action” 通用信号 |
| `C180_Trapper` | 高 | wood accumulation 第 2/3/4 次被占用时，可 1 food 买 animal | after wood accumulation + global round counter + optional purchase；概念先例 `B63_Tasting`、`B179_WildBoarHunter` | 缺通用 nth-use counter |

## Deck D

| 卡牌 | 难度 | 效果摘要 | 建议落点 / 先例 | 缺少基础设施 / 备注 |
|---|---|---|---|---|
| `D169_Plowsmith` | 中 | opponent 一次拿走 >=4 wood 后，可付 1 food plow 1 field | opponent after collect / `place-farmer` + inspect `resourcesGained.wood`；先例 `B138_ForestGuardian`、`A108_MushroomCollector` | 无明显 blocker |
| `D170_FoldBuilder` | 中 | all-player action space：fencing 后再得 1 sheep；非主人先付主人 1 food | `registerPlayerActionSpace` + composite execute / flow；先例 `B42_ForestInn`、`D51_Archway` | 需复用 payment-to-owner + fencing 复合 flow |
| `D171_SeniorTeacher` | 中 | 其他玩家在 lessons 上支付 food 时，你获得其中 1 food | opponent lessons after + `resourcesPaid` / actual cost access；先例 `B155_ArtTeacher` | 全量 5+ 正确性最好补 `lessons-2`；另需便捷读取实际支付 food |
| `D172_PutcherMaker` | 低 | anytime 1 reed -> 2 food | card `exchanges` / anytime；先例 `E109_BraidMaker` | 无 |
| `D173_TownClerk` | 中 | 任意玩家建成 major 时 card 上 +1 food；once-game cashout | any-scope major build listener + card stack / counters；先例 `C115_Sower`、`C172_FieldCounter` | 最好共用 cashout helper，但不是 blocker |
| `D174_LoessGardener` | 低 | `clay-pit` 后可 1 food 买 1 vegetable | after `clay-pit` + optional pay/gain；先例 `A174_MasterHora` 的付费购买模式 | 无 |
| `D175_Countryman` | 中 | 任意玩家执行 renovation action 时，你可 sow exactly 1 field | any-scope after renovate + optional `sow`；先例 `D27_Retraining`、`B130_FullPeasant` | 需处理 `trueAction=false` / sow legality，但无硬 blocker |
| `D176_Woodshacker` | 中 | 每轮第 1/2 次用 wood accumulation space 时，额外得 1/2 clay | local per-round counter + `onRoundStart` reset；先例 `C148_MudWallower` | 无 blocker |
| `D177_Graduate` | 低 | on play 付 1 food，得 2 stone + 2 reed | `play-occupation` after + seq pay/gain | 无 |
| `D178_SubstituteTeacher` | 中 | 当三个 Lessons 都被占用时，可把此牌当行动格用人领奖励 | owner `PlayerActionCard` + dynamic availability；先例 `D127_HardworkingMan` | 缺 `lessons-2` / third lessons space 建模 |
| `D179_Bullcatcher` | 高 | 当 round spaces 3 和 6 上的两组行动格都被占满时，此牌变为可用行动格 | owner `PlayerActionCard` + stage occupancy check；先例 `C160_Outrider`、`D165_PigStalker` 的 `roundActionOrder` 用法 | 缺 5+ round-board topology；当前 `roundStageSlots` 的 stage 6 只有 1 个 slot |
| `D180_PartTimeWorker` | 高 | 用恰好有 2/4/6 goods 的 accumulation space 时，可留 1/2/3 在格上并得 animal | before / replace collect or partial-collect flow；先例 `D138_PetLover`、`return-to-space` | 缺通用 partial collect / leave-on-space semantics |

