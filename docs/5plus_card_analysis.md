# 5+ 职业牌基础设施分层分析

> 更新日期：2026-06-20。本文档重写旧版 `5plus_card_analysis.md`，不沿用旧难度表。判断基准是当前代码，而不是 5/6 行动格落地前的历史状态。

## 1. 当前现状

- 5/6 人行动格、linked action-space blocking、6 人 major improvement supply 已接入主规则路径。
- 5+ 职业牌范围是 A-D deck 的 `169-180`，共 48 张；当前均为 Card Source metadata-only，无运行时 `impl`。
- BGA 对这些 48 张卡标记为 `implemented=false`，因此没有可照抄的 BGA 运行时实现，只能按卡面描述和 OA 现有规则模型设计。
- issue #322 已把 19 张“不需要新平台基础设施”的简单牌列为独立批次，本文只分析剩余 29 张。

## 2. issue #322 已排除的简单批次

这些卡不在本文分类范围内：

| Deck | Cards |
|---|---|
| A | `A172_BoatPainter`, `A175_HollowGardener`, `A176_Wheelmaker`, `A178_CarpentersBoy`, `A179_MountainShepherd` |
| B | `B169_LivestockSustainer`, `B172_CattleCaregiver`, `B174_RiverbankGardener`, `B177_StoneClawer`, `B180_GameTeaser` |
| C | `C174_StoneCustodian`, `C176_Cleanacre`, `C177_MountainHiker`, `C178_OnSiteReverend`, `C179_BovinePioneer` |
| D | `D169_Plowsmith`, `D172_PutcherMaker`, `D174_LoessGardener`, `D177_Graduate` |

## 3. 判定口径

本文把“需要新基础设施”限定为：现有 CardImpl、CardListener、CardEffect、ActionFlow、player action space、payment/event provenance、animal zone、ordinary deck、action-space helper 组合无法可靠表达，必须新增通用语义、通用 action/effect、阶段信号或跨卡 helper。

不算新基础设施的情况：

- 卡内 `cardStates` 计数、flag、infobox。
- 卡内用现有 `onBeforeStartOfTurn`、`onAllWorkersPlaced`、`onBeforeReturnHome`、`onEndHarvestFieldPhase`、`onRoundStart` 等 hook。
- 用现有 `xor/or/seq/optional`、`pay/gain/collect/fence/sow/improvement/renovate` leaf 组合。
- 为 2 张以上卡补纯函数 category helper 或 predicate helper。
- 直接读取当前 `state.actionSpaces`、`state.roundActionOrder`、`state.harvestReapSummary`、public event provenance。

## 4. 剩余 29 张总览

| 分类 | Cards |
|---|---|
| 不需要新基础设施 | `A169`, `A170`, `A173`, `A174`, `A180`, `B170`, `B171`, `B175`, `B176`, `B179`, `C169`, `C170`, `C173`, `C175`, `C180`, `D170`, `D175`, `D176`, `D178` |
| 不需要引擎基础设施，但建议先抽共享 helper | `B173`, `C172`, `D173`, `A177` |
| 需要新或扩展基础设施 | `A171`, `B178`, `C171`, `D171`, `D179`, `D180` |

## 5. 不需要新基础设施

这些卡可以直接用现有 hook / flow / helper 表达。实现时仍应补测试，但不应先改核心 engine 或新增 pending 类型。

| Card | Card text (EN) | 可参考已有卡牌 id | 为什么不需要新基础设施 | 主要落点 |
|---|---|---|---|---|
| `A169_OffSiter` | `Once the total printed building cost of all the major improvements you have is at least 9 building resources, this card provides room for 1 person for the rest of the game.` | `A010_WoodenShed`, `E085_MasterTanner` | 额外住房容量已有 `computeExtraRoomCapacity`；major / dual-type minor 的 metadata 可从现有卡牌定义读取。 | `computeExtraRoomCapacity`，当前已打出卡牌扫描 |
| `A170_Hayward` | `You can build fences at any time without placing a person. (This is not considered a "Build Fences" action.)` | `C094_StableCleaner`, `A150_Stagehand` | 现有卡已能发起非普通行动格的 `fence` flow；anytime listener 也已存在。 | anytime listener + `fence` leaf，`trueAction:false` |
| `A173_ClayThief` | `Once this game, at the start of a work phase of your choice, you can turn this card face down to get all of the clay on the "Hollow" action space.` | `A139_HollowWarden`, `D087_MasterBuilder` | 一次性取 Hollow 资源可用 `cardStates` flag；`collect` 已支持指定 `spaceId/resource/amount`。 | `onBeforeStartOfTurn` + collect leaf |
| `A174_MasterHora` | `Immediately before each time you place a person on an action space with the (meeple) symbol on the game board extension, you can buy 1 vegetable for 1 food.` | `D138_PetLover`, `B063_Tasting` | 规则书里的灰色 meeple / farmer symbol 对应 5/6 扩展 linked spaces：Lessons/Copse、Lessons/Modest Wish for Children、House Building/Traveling Players；本卡只是这些格的 before placement optional pay/gain。 | `before.place-farmer` + linked extension-space category |
| `A180_AnimalBrander` | `Each time you use the "Animal Market" action space, you can pay 1 food to use the same option twice (instead of once).` | `C096_Merchant`, `B026_AgrarianFences` | `animal-market-56` 是带 optionId 的结构化 `xor` action；所选分支原结果完成后，可用 after listener 提供“支付 1 food 后重放同一 option”。 | card-local optional replay flow |
| `B170_CorralBuilder` | `When the "Pig Market" and "Cattle Market" action space cards are each revealed (and placed on the round space), you can immediately fence exactly 1 farmyard space without playing wood.` | `B002_MiniPasture`, `A089_StablePlanner` | 回合揭示信息可由 `roundActionOrder` + 当前 round 判断；免费 fence flow 已有先例。 | `onRoundStart` + `fence` leaf |
| `B171_GreenhouseBuilder` | `This is an action space for you only. It provides a choice of "Fencing", "House Redevelopment", or "Vegetable Seeds" if the corresponding action space is already in play.` | `D127_HardworkingMan`, `E161_ElderBaker`, `B042_ForestInn` | owner-only player action space 已支持动态可用性和自定义 flow。 | `registerPlayerActionSpace` |
| `B175_FieldOverseer` | `Each time the other players harvest grain from at least 3/4/6 fields combined, you get 1 food/grain/vegetable.` | `A064_BarleyMill`, `B021_HayloftBarn`, `C120_AgriculturalLabourer` | harvest field phase 已累计 `state.harvestReapSummary`，可在 field phase 结束时统计其他玩家 grain fields。 | `onEndHarvestFieldPhase` |
| `B176_VillageIdiot` | `The Village Idiot is your lone occupation. Each time another player uses the "Meeting Place" action space, you get 1 wood and 1 food.` | `A158_CulinaryArtist`, `C051_FishingNet` | “唯一职业”应同时作为出牌条件和后续职业禁用规则；现有 occupation `isDoable` listener 可卡内阻止其他职业选择，Meeting Place 对手监听已有模式。 | prerequisite / `occupation:isDoable` guard + `after.place-farmer` |
| `B179_WildBoarHunter` | `In the returning home phase of each round, if at least 3 wood accumulation spaces are occupied, you can pay 1 wood to get 1 wild boar.` | `B161_Weakling`, `E143_Hewer` | 回家前工人仍在格上；wood accumulation occupied 数量可从 `actionSpaces` 扫描。 | `onBeforeReturnHome` |
| `C169_FastMason` | `Immediately after each time you use a clay/stone accumulation space, you can renovate your house to clay/stone without paying reed.` | `D013_Trowel`, `A087_Conservator` | 翻修 flow 和 cost modifier 已存在；本卡只需要在触发后发起一次 scoped renovate。 | `after.collect` + renovate flow |
| `C170_AmateurFencer` | `When you play this card, if you have no pastures yet, you can immediately fence exactly 1 space in your farmyard without paying wood for the fences.` | `B002_MiniPasture`, `E088_MasterFencer` | 免费围正好 1 个 pasture 可复用现有 fencing 校验和 free fence flow。 | `onBuy` + `fence` leaf |
| `C173_TopOuter` | `Each time the "House Building" action space on the game board extension is used, you get all of the food from the "Traveling Players" accumulation space.` | `C039_StudioBoat`, `E166_Roastmaster` | `house-building-56` 与 Traveling Players 已建模；从另一行动格收食物可用指定 `spaceId` 的 `collect`。 | `after.place-farmer` + collect leaf |
| `C175_VillageTeacher` | `Immediately after each time you use a "Lessons" action space, if this is the 1st/2nd/3rd occupied Lessons action space that round, you get 1 food/grain/vegetable.` | `B063_Tasting`, `D028_WritingDesk` | 第几个 Lessons 被占用可从当前回合 occupied Lessons spaces 推导。 | `after.place-farmer` + Lessons category |
| `C180_Trapper` | `Each time after you use a wood accumulation space, if this is the 2nd/3rd/4th occupied wood accumulation space that round, you can buy 1 sheep/wild boar/cattle for 1 food.` | `A116_WoodCutter`, `B161_Weakling` | 第 2/3/4 个 wood accumulation occupied 可从当前回合 occupied spaces 推导。 | `after.place-farmer` + wood accumulation category |
| `D170_FoldBuilder` | `This card is an action space for all. It provides a "Build Fences" action and then 1 sheep. If another player uses it, they must first pay you 1 food.` | `B042_ForestInn`, `D051_Archway` | all-player player action space、非 owner 付 owner 1 food、复合 flow 都有先例。 | `registerPlayerActionSpace` + pay/gain target owner + fence |
| `D175_Countryman` | `Each time any player (including you) takes a "Renovation" action on an action space, you can sow crops in exactly 1 field.` | `D027_Retraining`, `B130_FullPeasant` | 任意玩家 renovate 后可选 sow 1 田，可用 existing sow leaf 和可选 flow。 | `after.renovate-house` + optional `sow` |
| `D176_Woodshacker` | `In the work phase of each round, the first and the second time you use a wood accumulation space, you also get 1 and 2 clay respectively.` | `A116_WoodCutter`, `C148_MudWallower` | owner 本回合第 1/2 次 wood accumulation 可用卡内 round counter 或 occupied scan。 | `after.place-farmer` + `onBeforeStartOfTurn` reset |
| `D178_SubstituteTeacher` | `Each time all three "Lessons" action spaces are occupied, you can use this card with a person to get your choice of 1 building resource or 1 crop of each type.` | `D127_HardworkingMan`, `E161_ElderBaker` | “三格 Lessons 都被占用”是动态可用性；owner-only player action space 已支持。 | `registerPlayerActionSpace` + Lessons occupied predicate |

## 6. 建议先抽共享 helper，但不需要新引擎语义

这些卡可以卡内闭环实现，但模式重复。建议先抽小 helper，避免 5+ 批次继续制造重复实现。

| Card | Card text (EN) | 建议 helper | 为什么 |
|---|---|---|---|
| `B173_Sweeper` | `Each time you use an action space with the (meeple) symbol, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.` | card cashout / once-game flip helper | meeple-symbol 格触发、卡上累积 food、一次性取回后失效，与 `C172` / `D173` 同模式。 |
| `C172_FieldCounter` | `Each time another player plows a field, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.` | card cashout / once-game flip helper | 对手 plow 后卡上累积 food、一次性取回。 |
| `D173_TownClerk` | `Each time a major improvement is built, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.` | card cashout / once-game flip helper | major 建成后卡上累积 food、一次性取回。 |
| `A177_Middleman` | `Place 1 stone and 1 food on all action spaces with the (meeple) symbol on the game board extension. Next time you place a person on them, you get the goods.` | per-owner action-space attached goods helper | 需要把 food/stone 附着到 extension meeple spaces，并保证只有 owner 下次使用对应格时取回。现有 reserved action-space token 只记录格子，不记录资源数量和归属。 |

建议 helper 形态：

- `card cashout`：统一 `cardStates[cardId]` 中的 `storedResources`、`cashedOut`、infobox 文案和一次性 take flow。
- `attached action-space goods`：记录 `{ spaceId, ownerPlayerId, resources }`，在对应 owner 使用格子后生成 collect/gain flow 并清理。
- `category predicates`：集中定义 extension meeple spaces、extension accumulation spaces、Lessons spaces、wood / stone / food accumulation spaces。

## 7. 需要新或扩展基础设施

这些卡触及现有模型缺口。建议先写小设计，再实现卡牌。

| Card | Card text (EN) | 缺口 | 需要的基础设施 |
|---|---|---|---|
| `A171_Sidekick` | `Immediately after each time you place a person on an action space card, you can pay 1 food to place another person on the card immediately left to it (and so on).` | 放在 round action card 后，可连续向左邻 round card 付费再放人；现有 `roundActionOrder` 只有发牌顺序，不表达“左邻可连续放置”的 board topology 和 continuation。 | round-board adjacency helper；链式 placement continuation；每步支付、工人供应、停止条件、linked block、undo boundary 的统一处理。 |
| `B178_TagAlong` | `Immediately after each time another player uses the "Resource Market" action space, you can also place a person there to take the action as well.` | 对手用 Resource Market 后，owner 立即插入一次同格放人并执行行动；这不是普通 extra turn，也不是单纯 occupied-space option。 | opponent-triggered piggyback placement 机制；跨玩家 prompt/turn owner；同格 occupied placement；执行原 action flow；失败/放弃/undo 语义。 |
| `C171_YoungArtist` | `In the returning home phase of each round, you can pay 1 food to either take a "Minor Improvement" action or to draw 2 new minor improvements.` | 现有 ordinary-card draw 支持 draw N keep 1；本卡需要 draw 2 minor improvements 并全部加入手牌，且与 returning-home minor improvement action 组成选择。 | ordinary draw-to-hand action/effect；私有 hand update event；return-home 阶段嵌套 minor-improvement / draw choice 的测试模板。 |
| `D171_SeniorTeacher` | `Each time another player pays food on a "Lessons" action space, you get exactly 1 of that food.` | Lessons 的最终支付可能被卡牌改价、替代或虚拟支付资源改变；只有最终实际支付为 food 时才触发，不能只按行动格或基础费用判断。 | Lessons occupation payment finalization provenance；需要能区分 nominal food cost、实际 paid food、替代支付与虚拟支付来源。 |
| `D179_Bullcatcher` | `When both action spaces on round spaces 3 and 6 are occupied, you can use this card with a person to get 1 cattle and 2 food.` | “round spaces 3 and 6 上的两个 action spaces 都被占用”需要 5/6 round-board group/topology；当前 `roundActionOrder` 不表达每个 round space 的 paired action spaces。 | 5/6 round-space topology model 或 helper；group occupied predicate；基于该 predicate 的 player action space availability。 |
| `D180_PartTimeWorker` | `Each time you use an accumulation space with exactly 2/4/6 goods on it, you can leave 1/2/3 goods on the space. If you do, you get 1 sheep/wild boar/cattle.` | 默认 accumulation action 是全拿；本卡要按 2/4/6 goods 留 1/2/3 在格上并给动物，必须在 collect 结算前替换默认收取数量。 | partial collect replacement policy；保留资源的事件 provenance；与 accumulation action flow、resource stats、card triggers 的一致语义。 |

## 8. 建议开发顺序

1. 先补纯 helper：5/6 action-space category predicates、occupied category count、card cashout、attached action-space goods。
2. 再实现 §5 中不需要新基础设施的 19 张，按同类行为分批测试。
3. 然后实现 §6 的 helper 卡，确保 helper 至少覆盖 2 张以上。
4. 最后为 §7 的 5 张分别做小设计：placement continuation、ordinary draw-to-hand、round-space topology、partial collect replacement。

## 9. 实现前测试说明要求

每张卡实现前仍需按 `docs/CARD_TEST_TEMPLATE.md` 写测试说明并确认：

- 从新的 2 人或 5/6 人 session 准备状态开始；5+ 卡默认用 5 人或 6 人局。
- 显式设置玩家手牌，避免随机发牌影响 pending。
- 断言 `state`、`pending/interaction`、events/log、动物区或计分结果。
- 负例要覆盖：非目标行动格、不满足人数/资源/occupied 条件、不应重复触发的情况。
