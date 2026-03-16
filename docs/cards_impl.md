# 卡牌实现与 Hook 覆盖清单

## 原子行动 Hook 覆盖矩阵

每个原子行动在各 Hook 点至少给出一张卡牌示例。一张卡牌如果注册了多个 hook，应在所有对应的格子中出现。

| 原子行动 | Before | During | ImmediatelyAfter | After | ComputeCosts | ComputeArgs | ComputeReplace | IsDoable |
|---|---|---|---|---|---|---|---|---|
| PlaceFarmer | [A126_MasterWorkman](../shared/cards/A/A126_MasterWorkman.ts) | — | [C25_SteamMachine](../shared/cards/C/C25_SteamMachine.ts) | — | — | [E21_SheepRug](../shared/cards/E/E21_SheepRug.ts) | — | — |
| Collect | [B34_SpecialFood](../shared/cards/B/B34_SpecialFood.ts) | [E53_BoarSpear](../shared/cards/E/E53_BoarSpear.ts) | [A108_MushroomCollector](../shared/cards/A/A108_MushroomCollector.ts)、[C52_HuntsmansHat](../shared/cards/C/C52_HuntsmansHat.ts) | [A17_ReclamationPlow](../shared/cards/A/A17_ReclamationPlow.ts)、[B34_SpecialFood](../shared/cards/B/B34_SpecialFood.ts) | — | — | — | — |
| Gain | — | [E33_BeaverColony](../shared/cards/E/E33_BeaverColony.ts)、[E53_BoarSpear](../shared/cards/E/E53_BoarSpear.ts) | — | [A53_Claypipe](../shared/cards/A/A53_Claypipe.ts) | — | — | — | — |
| Construct | — | — | — | [A110_Roughcaster](../shared/cards/A/A110_Roughcaster.ts) | [A128_RiparianBuilder](../shared/cards/A/A128_RiparianBuilder.ts)、[C88_CarpentersApprentice](../shared/cards/C/C88_CarpentersApprentice.ts) | — | — | [D119_WoodBarterer](../shared/cards/D/D119_WoodBarterer.ts) |
| Plow | — | — | — | [A105_BarrowPusher](../shared/cards/A/A105_BarrowPusher.ts) | [C37_DwellingMound](../shared/cards/C/C37_DwellingMound.ts) | — | — | — |
| FirstPlayer | — | — | — | — | — | — | — | — |
| Improvement | [B75_WoodWorkshop](../shared/cards/B/B75_WoodWorkshop.ts) | [A55_JunkRoom](../shared/cards/A/A55_JunkRoom.ts) | [C96_Merchant](../shared/cards/C/C96_Merchant.ts) | [A109_SmallTrader](../shared/cards/A/A109_SmallTrader.ts)、[C75_Firewood](../shared/cards/C/C75_Firewood.ts)、[E128_Saddler](../shared/cards/E/E128_Saddler.ts) | — | — | [B103_FieldMerchant](../shared/cards/B/B103_FieldMerchant.ts) | [B75_WoodWorkshop](../shared/cards/B/B75_WoodWorkshop.ts) |
| Sow | [A65_SeedPellets](../shared/cards/A/A65_SeedPellets.ts) | — | — | [A79_GardenHoe](../shared/cards/A/A79_GardenHoe.ts) | — | — | [A94_LazySowman](../shared/cards/A/A94_LazySowman.ts) | [A94_LazySowman](../shared/cards/A/A94_LazySowman.ts) |
| Stables | — | — | — | [A74_StableTree](../shared/cards/A/A74_StableTree.ts) | [C88_CarpentersApprentice](../shared/cards/C/C88_CarpentersApprentice.ts) | — | — | — |
| Renovation | [D14_HammerCrusher](../shared/cards/D/D14_HammerCrusher.ts) | — | [C144_ReedRoofRenovator](../shared/cards/C/C144_ReedRoofRenovator.ts) | [A37_Bucksaw](../shared/cards/A/A37_Bucksaw.ts)、[A110_Roughcaster](../shared/cards/A/A110_Roughcaster.ts) | [A123_FrameBuilder](../shared/cards/A/A123_FrameBuilder.ts) | — | — | [D14_HammerCrusher](../shared/cards/D/D14_HammerCrusher.ts) |
| Fencing | [E74_AshTrees](../shared/cards/E/E74_AshTrees.ts)、[B94_StockProtector](../shared/cards/B/B94_StockProtector.ts) | — | [A83_ShepherdsCrook](../shared/cards/A/A83_ShepherdsCrook.ts) | [A144_Sequestrator](../shared/cards/A/A144_Sequestrator.ts)、[B94_StockProtector](../shared/cards/B/B94_StockProtector.ts) | [A88_HedgeKeeper](../shared/cards/A/A88_HedgeKeeper.ts)、[C88_CarpentersApprentice](../shared/cards/C/C88_CarpentersApprentice.ts)、[E74_AshTrees](../shared/cards/E/E74_AshTrees.ts) | — | — | [B94_StockProtector](../shared/cards/B/B94_StockProtector.ts)、[D119_WoodBarterer](../shared/cards/D/D119_WoodBarterer.ts) |
| WishChildren | — | — | — | [D150_GodlySpouse](../shared/cards/D/D150_GodlySpouse.ts)、[E130_Overachiever](../shared/cards/E/E130_Overachiever.ts) | — | — | — | — |
| Pay | — | — | — | [B65_GrainDepot](../shared/cards/B/B65_GrainDepot.ts) | — | — | — | — |
| Reorganize | — | — | — | — | — | — | — | — |
| Exchange | — | — | — | [E57_CheeseFondue](../shared/cards/E/E57_CheeseFondue.ts)、[A53_Claypipe](../shared/cards/A/A53_Claypipe.ts) | — | — | — | — |
| Occupation | [B109_PaperMaker](../shared/cards/B/B109_PaperMaker.ts)、[D152_Patron](../shared/cards/D/D152_Patron.ts)、[D49_Bookshelf](../shared/cards/D/D49_Bookshelf.ts) | — | — | [B100_Clutterer](../shared/cards/B/B100_Clutterer.ts) | [A28_ForestSchool](../shared/cards/A/A28_ForestSchool.ts) | — | — | [E101_Blighter](../shared/cards/E/E101_Blighter.ts)、[B109_PaperMaker](../shared/cards/B/B109_PaperMaker.ts)、[D152_Patron](../shared/cards/D/D152_Patron.ts)、[D49_Bookshelf](../shared/cards/D/D49_Bookshelf.ts) |
| ActivateCard | — | — | — | — | — | — | — | — |
| SpecialEffect | — | — | — | — | — | — | — | — |
| Receive | — | [C120_AgriculturalLabourer](../shared/cards/C/C120_AgriculturalLabourer.ts)、[E53_BoarSpear](../shared/cards/E/E53_BoarSpear.ts) | — | [E128_Saddler](../shared/cards/E/E128_Saddler.ts)、[A53_Claypipe](../shared/cards/A/A53_Claypipe.ts) | — | — | — | — |
| Reap | — | — | — | [A64_BarleyMill](../shared/cards/A/A64_BarleyMill.ts) | — | — | — | — |
| PlaceFutureMeeples | — | — | — | — | — | — | — | — |
| PlaceMeeplesFromSupply | — | — | — | — | — | — | — | — |
| Harvest | [A166_Haydryer](../shared/cards/A/A166_Haydryer.ts) | — | — | [D99_EarthenwarePotter](../shared/cards/D/D99_EarthenwarePotter.ts) | — | — | — | — |
| EndOfGame | [C133_Soldier](../shared/cards/C/C133_Soldier.ts) | — | — | — | — | — | — | — |
| StartOfTurn | [B70_NewPurchase](../shared/cards/B/B70_NewPurchase.ts) | — | — | — | — | — | — | — |
| BakeBread | [B67_HandTruck](../shared/cards/B/B67_HandTruck.ts) | — | — | [E57_CheeseFondue](../shared/cards/E/E57_CheeseFondue.ts) | — | — | [A97_Freshman](../shared/cards/A/A97_Freshman.ts) | — |

## Hook 类型说明

| Hook 类型 | 触发时机 | 典型用途 |
|---|---|---|
| Before | 行动执行前 | 获得资源、修改行动参数、添加额外效果 |
| During | 行动执行中 | 修改行动结果、触发连锁效果 |
| ImmediatelyAfter | 行动刚完成后 | 立即触发额外行动或效果 |
| After | 行动完全结束后 | 获得奖励、触发后续效果 |
| ComputeCosts | 计算行动成本时 | 修改资源成本、提供折扣 |
| ComputeArgs | 计算行动参数时 | 修改行动可选参数 |
| ComputeReplace | 判断行动替代时 | 允许用其他行动替代当前行动 |
| IsDoable | 判断行动可行性时 | 放宽行动执行条件 |

注：部分顶层行动卡的开放性不再单独手写，而是由 `flow` 递归合成。当前已接入顶层 `or` / `xor` 行动格，以及一批安全 `seq` 包装行动格；递归到 `leaf` 时会继续应用子行动自己的 `IsDoable` hook / CardListener，因此诸如 `A94_LazySowman` 挂在 `sow` 上的放宽效果、`B75_WoodWorkshop` 挂在 `improvement-any` 上的放宽效果，也能反映到顶层复合行动格的可执行性上。
注：本矩阵现在同时保留“已接入示例”和“排期目标示例”。实际完成状态以 `docs/card_progress.md` 为准；其中 `Harvest`、`StartOfTurn` 等格子当前可能由 `card-effects.ts` 承担，而不是原子行动 listener。
注：`card-choice` 与农场类选择现在统一走服务端 `interaction` 协议对外暴露；前端不再依赖本地 `promptKey` 规则推导可选格/可选边，只消费服务端下发的白名单 args。
注：当前 `anytime` 入口也并入同一协议层，前端通过 `interaction.anytimeActions` 渲染，服务端用根前插 flow 恢复到原选择流程。
注：如 C75_Firewood 的 After/Improvement Hook 会返回通用 `cardEffectGain` 的 logKey，用于生成独立的行动日志条目（不进入 actionDetail）。
注：近期新增了几层 BGA 风格卡牌 helper：`payGainNode/payThenGainFlow/payThenActionFlow/returnToSpaceThenGainFlow`、`pending-choice`、`stage-effects`、`card-state/round-placement`、`action-snapshot`，并给 flow 叶子节点补了自定义 choice label。像 `A108_MushroomCollector`、`B109_PaperMaker`、`C96_Merchant`、`E128_Saddler`、`A37_Bucksaw`、`C75_Firewood`、`D119_WoodBarterer` 已从单卡手写流程收敛到公共抽象；`A17_ReclamationPlow`、`D150_GodlySpouse`、`A74_StableTree` 这类时序卡也不再手写散落的 `flagged/placedThisTurn/usedRound` 过程状态；同时 `B70_NewPurchase`、`A166_Haydryer`、`D99_EarthenwarePotter` 的阶段型 hook 已切到服务端 `Engine` 驱动的 `ActionFlow`，不再走即时 imperative 结算。
注：`fence` 的提交链现已把“本次新建 pasture delta”连同 `newEdges` 一起挂到 `ActionExecutionResult.extraData`，因此 `ImmediatelyAfter(Fencing)` / `After(Fencing)` listener 可以直接读取 `result.extraData.newPastures` / `result.extraData.newEdges`。`A83_ShepherdsCrook` 已切到这条通用链路，不再维护额外的累计 pasture 计数。
注：e2e 回归默认使用 2 人局，减少回合内放置次数与状态噪声。

## 卡牌效果 Hook 覆盖矩阵

卡牌效果 Hook 在特定游戏阶段触发，不属于原子行动 Hook 体系。定义在 `shared/cards/card-effects.ts`。

| 效果阶段 | 已实现的卡牌 | 接入状态 | 说明 |
|---|---|---|---|
| onBuy | [Major_ClayOven](../shared/cards/major/index.ts)、[Major_StoneOven](../shared/cards/major/index.ts)、[Major_Well](../shared/cards/major/index.ts)、[E74_AshTrees](../shared/cards/E/E74_AshTrees.ts)、[D99_EarthenwarePotter](../shared/cards/D/D99_EarthenwarePotter.ts)、[B65_GrainDepot](../shared/cards/B/B65_GrainDepot.ts) | 已接入 | 建造/购买时立即触发 |
| onRoundStart | — | 已接入 | 每回合开始时触发（仅 Major_Well 通过 futureMeeples 间接使用） |
| onHarvest | [Major_Pottery](../shared/cards/major/index.ts)、[Major_Basket](../shared/cards/major/index.ts)、[Major_Joinery](../shared/cards/major/index.ts) | 已接入 | 收获阶段触发，现由 `GameSession` 统一按阶段 flow 推进 |
| onRoundEnd | — | 已接入 | game-session finalizeRound 中调用 |
| onBeforeReturnHome | — | 已接入 | 回家阶段最先触发（BGA: D51_Archway） |
| onStartReturnHome | — | 已接入 | 回家阶段工人返回前（BGA: A151_Minstrel 等 11 张卡） |
| onReturnHome | [C75_Firewood](../shared/cards/C/C75_Firewood.ts)、[A84_Silage](../shared/cards/A/A84_Silage.ts) | 已接入 | 每回合回家阶段触发 |
| onAfterRoundEnd | — | 已接入 | 回合结束后触发（BGA: D167_PureBreeder） |
| onBeforeHarvest | [A166_Haydryer](../shared/cards/A/A166_Haydryer.ts) | 已接入 | 收获前触发，支持返回可暂停/恢复的 `ActionFlow` |
| onStartHarvest | — | 已接入 | 收获开始时触发（BGA: D97_BeggingStudent 等 16 张卡） |
| onStartHarvestFieldPhase | — | 已接入 | 田地阶段开始（BGA: E73_Scythe 等 7 张卡） |
| onHarvestFieldPhase | — | 已接入 | 田地阶段中（BGA: A112_ScytheWorker 等 10 张卡） |
| onEndHarvestFieldPhase | — | 已接入 | 田地阶段结束（BGA: E112_GrainThief 等 6 张卡） |
| onAfterReap | [A64_BarleyMill](../shared/cards/A/A64_BarleyMill.ts) | 已接入 | 收获田地后触发 |
| onStartHarvestFeedingPhase | — | 已接入 | 喂食阶段开始（BGA: C107_Baker 等 3 张卡） |
| onHarvestFeedingPhase | — | 已接入 | 喂食阶段中（BGA: D84_FeedPellets 等 11 张卡） |
| onEndHarvestFeedingPhase | — | 已接入 | 喂食阶段结束（BGA: E83_ShepherdsWhistle 等 4 张卡） |
| onBeforeFeed | — | 已接入 | 喂食前触发 |
| onAfterFeed | — | 已接入 | 喂食后触发 |
| onEndHarvest | — | 已接入 | 收获结束/繁殖前（BGA: E73_Scythe 等 9 张卡） |
| onAfterHarvest | [D99_EarthenwarePotter](../shared/cards/D/D99_EarthenwarePotter.ts) | 已接入 | 收获阶段结束后触发，支持返回可暂停/恢复的 `ActionFlow` |
| onBeforeStartOfTurn | [B70_NewPurchase](../shared/cards/B/B70_NewPurchase.ts) | 已接入 | 每回合开始前触发，支持返回可暂停/恢复的 `ActionFlow` |

## 行动卡 Hook 示例

| Hook 类型 | 示例卡牌 | 说明 |
|---|---|---|
| isActionCardEvent | [E82_Profiteering](../shared/cards/E/E82_Profiteering.ts) | 指定行动卡 ID 触发 |
| isActionCardEvent（多空间） | [D74_RoyalWood](../shared/cards/D/D74_RoyalWood.ts) | 多个行动空间触发 |
| isActionCardTurnEvent | [D55_NewMarket](../shared/cards/D/D55_NewMarket.ts) | 指定回合区间的行动卡触发 |
| isActionCardTurnEvent（1-4轮） | [C23_JobContract](../shared/cards/C/C23_JobContract.ts) | 指定轮次范围触发 |
| isCollectEvent | [E75_StoneAxe](../shared/cards/E/E75_StoneAxe.ts) | 累积格/收取事件触发 |

## 卡牌文件索引

### A 系列
- [A10_WoodenShed](../shared/cards/A/A10_WoodenShed.ts)
- [A14_CarpentersHammer](../shared/cards/A/A14_CarpentersHammer.ts)
- [A17_ReclamationPlow](../shared/cards/A/A17_ReclamationPlow.ts)
- [A22_Telegram](../shared/cards/A/A22_Telegram.ts)
- [A23_StoneCompany](../shared/cards/A/A23_StoneCompany.ts)
- [A28_ForestSchool](../shared/cards/A/A28_ForestSchool.ts)
- [A37_Bucksaw](../shared/cards/A/A37_Bucksaw.ts)
- [A39_Chapel](../shared/cards/A/A39_Chapel.ts)
- [A40_PottersYard](../shared/cards/A/A40_PottersYard.ts)
- [A41_VegetableSlicer](../shared/cards/A/A41_VegetableSlicer.ts)
- [A53_Claypipe](../shared/cards/A/A53_Claypipe.ts)
- [A55_JunkRoom](../shared/cards/A/A55_JunkRoom.ts)
- [A64_BarleyMill](../shared/cards/A/A64_BarleyMill.ts)
- [A65_SeedPellets](../shared/cards/A/A65_SeedPellets.ts)
- [A70_LiftingMachine](../shared/cards/A/A70_LiftingMachine.ts)
- [A71_ClearingSpade](../shared/cards/A/A71_ClearingSpade.ts)
- [A72_CalciumFertilizers](../shared/cards/A/A72_CalciumFertilizers.ts)
- [A74_StableTree](../shared/cards/A/A74_StableTree.ts)
- [A79_GardenHoe](../shared/cards/A/A79_GardenHoe.ts)
- [A81_InterimStorage](../shared/cards/A/A81_InterimStorage.ts)
- [A82_WorkCertificate](../shared/cards/A/A82_WorkCertificate.ts)
- [A83_ShepherdsCrook](../shared/cards/A/A83_ShepherdsCrook.ts)
- [A84_Silage](../shared/cards/A/A84_Silage.ts)
- [A85_Homekeeper](../shared/cards/A/A85_Homekeeper.ts)
- [A87_Conservator](../shared/cards/A/A87_Conservator.ts)
- [A88_HedgeKeeper](../shared/cards/A/A88_HedgeKeeper.ts)
- [A89_StablePlanner](../shared/cards/A/A89_StablePlanner.ts)
- [A92_AdoptiveParents](../shared/cards/A/A92_AdoptiveParents.ts)
- [A94_LazySowman](../shared/cards/A/A94_LazySowman.ts)
- [A97_Freshman](../shared/cards/A/A97_Freshman.ts)
- [A105_BarrowPusher](../shared/cards/A/A105_BarrowPusher.ts)
- [A106_SlurrySpreader](../shared/cards/A/A106_SlurrySpreader.ts)
- [A108_MushroomCollector](../shared/cards/A/A108_MushroomCollector.ts)
- [A109_SmallTrader](../shared/cards/A/A109_SmallTrader.ts)
- [A110_Roughcaster](../shared/cards/A/A110_Roughcaster.ts)
- [A112_ScytheWorker](../shared/cards/A/A112_ScytheWorker.ts)
- [A119_FirewoodCollector](../shared/cards/A/A119_FirewoodCollector.ts)
- [A123_FrameBuilder](../shared/cards/A/A123_FrameBuilder.ts)
- [A126_MasterWorkman](../shared/cards/A/A126_MasterWorkman.ts)
- [A127_Lodger](../shared/cards/A/A127_Lodger.ts)
- [A128_RiparianBuilder](../shared/cards/A/A128_RiparianBuilder.ts)
- [A136_DrudgeryReeve](../shared/cards/A/A136_DrudgeryReeve.ts)
- [A137_RiverineShepherd](../shared/cards/A/A137_RiverineShepherd.ts)
- [A144_Sequestrator](../shared/cards/A/A144_Sequestrator.ts)
- [A148_Woolgrower](../shared/cards/A/A148_Woolgrower.ts)
- [A162_ForestTallyman](../shared/cards/A/A162_ForestTallyman.ts)
- [A165_PigBreeder](../shared/cards/A/A165_PigBreeder.ts)

### B 系列
- [B2_MiniPasture](../shared/cards/B/B2_MiniPasture.ts)
- [B3_Moonshine](../shared/cards/B/B3_Moonshine.ts)
- [B10_Caravan](../shared/cards/B/B10_Caravan.ts)
- [B15_CarpentersBench](../shared/cards/B/B15_CarpentersBench.ts)
- [B19_MoldboardPlow](../shared/cards/B/B19_MoldboardPlow.ts)
- [B21_HayloftBarn](../shared/cards/B/B21_HayloftBarn.ts)
- [B23_FinalScenario](../shared/cards/B/B23_FinalScenario.ts)
- [B34_SpecialFood](../shared/cards/B/B34_SpecialFood.ts)
- [B42_ForestInn](../shared/cards/B/B42_ForestInn.ts)
- [B48_ForestStone](../shared/cards/B/B48_ForestStone.ts)
- [B55_MaintenancePremium](../shared/cards/B/B55_MaintenancePremium.ts)
- [B65_GrainDepot](../shared/cards/B/B65_GrainDepot.ts)
- [B67_HandTruck](../shared/cards/B/B67_HandTruck.ts)
- [B75_WoodWorkshop](../shared/cards/B/B75_WoodWorkshop.ts)
- [B76_Ceilings](../shared/cards/B/B76_Ceilings.ts)
- [B81_Handcart](../shared/cards/B/B81_Handcart.ts)
- [B86_TruffleSearcher](../shared/cards/B/B86_TruffleSearcher.ts)
- [B94_StockProtector](../shared/cards/B/B94_StockProtector.ts)
- [B100_Clutterer](../shared/cards/B/B100_Clutterer.ts)
- [B103_FieldMerchant](../shared/cards/B/B103_FieldMerchant.ts)
- [B109_PaperMaker](../shared/cards/B/B109_PaperMaker.ts)
- [B115_TinsmithMaster](../shared/cards/B/B115_TinsmithMaster.ts)
- [B124_Trimmer](../shared/cards/B/B124_Trimmer.ts)
- [B146_Illusionist](../shared/cards/B/B146_Illusionist.ts)
- [B149_OpenAirFarmer](../shared/cards/B/B149_OpenAirFarmer.ts)
- [B151_LittlePeasant](../shared/cards/B/B151_LittlePeasant.ts)
- [B165_GameProvider](../shared/cards/B/B165_GameProvider.ts)

### C 系列
- [C1_Overhaul](../shared/cards/major/overhaul.ts)
- [C8_PlantFertilizer](../shared/cards/C/C8_PlantFertilizer.ts)
- [C10_BunkBeds](../shared/cards/C/C10_BunkBeds.ts)
- [C13_WoodSlideHammer](../shared/cards/C/C13_WoodSlideHammer.ts)
- [C17_NewlyPlowedField](../shared/cards/C/C17_NewlyPlowedField.ts)
- [C18_RollOverPlow](../shared/cards/C/C18_RollOverPlow.ts)
- [C19_SwingPlow](../shared/cards/C/C19_SwingPlow.ts)
- [C23_JobContract](../shared/cards/C/C23_JobContract.ts)
- [C24_BedintheGrainField](../shared/cards/C/C24_BedintheGrainField.ts)
- [C25_SteamMachine](../shared/cards/C/C25_SteamMachine.ts)
- [C27_Blueprint](../shared/cards/C/C27_Blueprint.ts)
- [C29_BeerTable](../shared/cards/C/C29_BeerTable.ts)
- [C31_WritingChamber](../shared/cards/C/C31_WritingChamber.ts)
- [C37_DwellingMound](../shared/cards/C/C37_DwellingMound.ts)
- [C51_FishingNet](../shared/cards/C/C51_FishingNet.ts)
- [C52_HuntsmansHat](../shared/cards/C/C52_HuntsmansHat.ts)
- [C57_Crudite](../shared/cards/C/C57_Crudite.ts)
- [C63_CraftBrewery](../shared/cards/major/craft-brewery.ts)
- [C71_Slurry](../shared/cards/C/C71_Slurry.ts)
- [C71_SlurrySpreader](../shared/cards/C/C71_SlurrySpreader.ts)
- [C75_Firewood](../shared/cards/C/C75_Firewood.ts)
- [C84_PerennialRye](../shared/cards/C/C84_PerennialRye.ts)
- [C85_DenBuilder](../shared/cards/C/C85_DenBuilder.ts)
- [C86_LivestockFeeder](../shared/cards/C/C86_LivestockFeeder.ts)
- [C87_Mason](../shared/cards/C/C87_Mason.ts)
- [C88_CarpentersApprentice](../shared/cards/C/C88_CarpentersApprentice.ts)
- [C93_InnerDistrictsDirector](../shared/cards/C/C93_InnerDistrictsDirector.ts)
- [C96_Merchant](../shared/cards/C/C96_Merchant.ts)
- [C99_GardenDesigner](../shared/cards/C/C99_GardenDesigner.ts)
- [C104_Collector](../shared/cards/C/C104_Collector.ts)
- [C115_Sower](../shared/cards/C/C115_Sower.ts)
- [C120_AgriculturalLabourer](../shared/cards/C/C120_AgriculturalLabourer.ts)
- [C130_OutskirtsDirector](../shared/cards/C/C130_OutskirtsDirector.ts)
- [C133_Soldier](../shared/cards/C/C133_Soldier.ts)
- [C135_Constable](../shared/cards/C/C135_Constable.ts)
- [C142_MarketCrier](../shared/cards/C/C142_MarketCrier.ts)
- [C144_ReedRoofRenovator](../shared/cards/C/C144_ReedRoofRenovator.ts)
- [C148_MudWallower](../shared/cards/C/C148_MudWallower.ts)
- [C156_HoofCaregiver](../shared/cards/C/C156_HoofCaregiver.ts)
- [C162_ForestOwner](../shared/cards/C/C162_ForestOwner.ts)
- [C168_AnimalCatcher](../shared/cards/C/C168_AnimalCatcher.ts)

### D 系列
- [D10_StorksNest](../shared/cards/D/D10_StorksNest.ts)
- [D14_HammerCrusher](../shared/cards/D/D14_HammerCrusher.ts)
- [D20_TurnwrestPlow](../shared/cards/D/D20_TurnwrestPlow.ts)
- [D22_WorkPermit](../shared/cards/D/D22_WorkPermit.ts)
- [D23_PioneeringSpirit](../shared/cards/D/D23_PioneeringSpirit.ts)
- [D26_CarpentersYard](../shared/cards/major/carpenters-yard.ts)
- [D27_Retraining](../shared/cards/D/D27_Retraining.ts)
- [D36_BreedRegistry](../shared/cards/D/D36_BreedRegistry.ts)
- [D51_Archway](../shared/cards/D/D51_Archway.ts)
- [D53_TeaHouse](../shared/cards/D/D53_TeaHouse.ts)
- [D55_NewMarket](../shared/cards/D/D55_NewMarket.ts)
- [D66_PotterCeramics](../shared/cards/major/pottery.ts)
- [D70_StrawManure](../shared/cards/D/D70_StrawManure.ts)
- [D71_Changeover](../shared/cards/D/D71_Changeover.ts)
- [D72_StableManure](../shared/cards/D/D72_StableManure.ts)
- [D74_RoyalWood](../shared/cards/D/D74_RoyalWood.ts)
- [D85_Reader](../shared/cards/D/D85_Reader.ts)
- [D92_ChildOmbudsman](../shared/cards/D/D92_ChildOmbudsman.ts)
- [D93_SheepInspector](../shared/cards/D/D93_SheepInspector.ts)
- [D94_HenpeckedHusband](../shared/cards/D/D94_HenpeckedHusband.ts)
- [D98_Transactor](../shared/cards/D/D98_Transactor.ts)
- [D100_LordoftheManor](../shared/cards/D/D100_LordoftheManor.ts)
- [D101_SugarBaker](../shared/cards/D/D101_SugarBaker.ts)
- [D102_SampleStableMaker](../shared/cards/D/D102_SampleStableMaker.ts)
- [D103_CanalBoatman](../shared/cards/D/D103_CanalBoatman.ts)
- [D107_Bellfounder](../shared/cards/major/bellfounder.ts)
- [D115_FodderPlanter](../shared/cards/D/D115_FodderPlanter.ts)
- [D116_TreeInspector](../shared/cards/D/D116_TreeInspector.ts)
- [D124_Emissary](../shared/cards/D/D124_Emissary.ts)
- [D126_FieldCultivator](../shared/cards/D/D126_FieldCultivator.ts)
- [D127_HardworkingMan](../shared/cards/D/D127_HardworkingMan.ts)
- [D131_CraftsmanshipPromoter](../shared/cards/D/D131_CraftsmanshipPromoter.ts)
- [D132_HideFarmer](../shared/cards/D/D132_HideFarmer.ts)
- [D134_OysterEater](../shared/cards/D/D134_OysterEater.ts)
- [D137_TradeTeacher](../shared/cards/D/D137_TradeTeacher.ts)
- [D150_GodlySpouse](../shared/cards/D/D150_GodlySpouse.ts)
- [D157_PartyOrganizer](../shared/cards/D/D157_PartyOrganizer.ts)
- [D158_BeanCounter](../shared/cards/D/D158_BeanCounter.ts)
- [D164_PetGrower](../shared/cards/D/D164_PetGrower.ts)
- [D167_PureBreeder](../shared/cards/D/D167_PureBreeder.ts)

### E 系列
- [E4_Thunderbolt](../shared/cards/E/E4_Thunderbolt.ts)
- [E5_NightLoot](../shared/cards/E/E5_NightLoot.ts)
- [E10_StrawHat](../shared/cards/E/E10_StrawHat.ts)
- [E16_BriarHedge](../shared/cards/E/E16_BriarHedge.ts)
- [E22_GuestRoom](../shared/cards/E/E22_GuestRoom.ts)
- [E27_PiggyBank](../shared/cards/E/E27_PiggyBank.ts)
- [E30_ChildsToy](../shared/cards/E/E30_ChildsToy.ts)
- [E33_BeaverColony](../shared/cards/E/E33_BeaverColony.ts)
- [E36_HerbalGarden](../shared/cards/E/E36_HerbalGarden.ts)
- [E51_WhaleOil](../shared/cards/E/E51_WhaleOil.ts)
- [E52_Cubbyhole](../shared/cards/E/E52_Cubbyhole.ts)
- [E53_BoarSpear](../shared/cards/E/E53_BoarSpear.ts)
- [E62_SourDough](../shared/cards/E/E62_SourDough.ts)
- [E71_CowPatty](../shared/cards/E/E71_CowPatty.ts)
- [E73_Scythe](../shared/cards/E/E73_Scythe.ts)
- [E74_AshTrees](../shared/cards/E/E74_AshTrees.ts)
- [E75_StoneAxe](../shared/cards/E/E75_StoneAxe.ts)
- [E76_LumberPile](../shared/cards/E/E76_LumberPile.ts)
- [E78_SleightofHand](../shared/cards/E/E78_SleightofHand.ts)
- [E81_AlchemistsLab](../shared/cards/major/alchemists-lab.ts)
- [E82_Profiteering](../shared/cards/E/E82_Profiteering.ts)
- [E84_DollysMother](../shared/cards/E/E84_DollysMother.ts)
- [E85_MasterTanner](../shared/cards/E/E85_MasterTanner.ts)
- [E86_PenBuilder](../shared/cards/E/E86_PenBuilder.ts)
- [E90_DungCollector](../shared/cards/E/E90_DungCollector.ts)
- [E91_PlowBuilder](../shared/cards/E/E91_PlowBuilder.ts)
- [E92_FieldDoctor](../shared/cards/E/E92_FieldDoctor.ts)
- [E93_Motivator](../shared/cards/E/E93_Motivator.ts)
- [E103_Wolf](../shared/cards/E/E103_Wolf.ts)
- [E109_BraidMaker](../shared/cards/E/E109_BraidMaker.ts)
- [E112_GrainThief](../shared/cards/E/E112_GrainThief.ts)
- [E123_ResourceHoarder](../shared/cards/E/E123_ResourceHoarder.ts)
- [E124_MayorCandidate](../shared/cards/E/E124_MayorCandidate.ts)
- [E130_Overachiever](../shared/cards/E/E130_Overachiever.ts)
- [E133_ChampionBreeder](../shared/cards/E/E133_ChampionBreeder.ts)
- [E134_Omnifarmer](../shared/cards/E/E134_Omnifarmer.ts)
- [E148_Lazybones](../shared/cards/E/E148_Lazybones.ts)
- [E151_DeliveryNurse](../shared/cards/E/E151_DeliveryNurse.ts)
- [E153_StoneSculptor](../shared/cards/E/E153_StoneSculptor.ts)
- [E155_Visionary](../shared/cards/E/E155_Visionary.ts)
- [E159_OldMiser](../shared/cards/E/E159_OldMiser.ts)
- [E161_ElderBaker](../shared/cards/E/E161_ElderBaker.ts)
- [E162_Entrepreneur](../shared/cards/E/E162_Entrepreneur.ts)
- [E166_Roastmaster](../shared/cards/E/E166_Roastmaster.ts)
- [E167_DairyCrier](../shared/cards/E/E167_DairyCrier.ts)

## 支付系统 (Payment System)

### 概述

支付系统支持复杂的资源支付场景，包括：
- 多选一费用 (fees)
- 可重复交易 (trades)
- 一次性折扣 (bonuses)
- 卡牌抵换 (cards)
- 卡牌修改器 (modifiers)

### ComplexCost 类型

```typescript
type ComplexCost = {
  fee?: Partial<Resource>           // 单一必付费用
  fees?: Partial<Resource>[]        // 多选一费用（任选其一）
  trades?: Trade[]                  // 可重复的交易选项
  cards?: {                         // 卡牌抵换
    type: string                    // 卡牌类型 (Major/Minor/Occ)
    list: string[]                  // 可用的卡牌 ID 列表
    cost?: Partial<Resource>        // 归还卡牌时额外支付的资源
  }
  bonuses?: Bonus[]                 // 一次性折扣
}
```

### PaymentSolution 类型

```typescript
type PaymentSolution = {
  resourcesPaid: Partial<Resource>   // 实际支付的资源
  tradesUsed: { trade: Trade; times: number }[]  // 使用的交易及次数
  bonusUsed?: string                // 使用的折扣来源 ID
  cardUsed?: string                 // 使用的卡牌 ID（用于抵换）
}
```

### 支付流程

1. **canPayCost**: 检查玩家是否能支付 ComplexCost
2. **computeAllBuyableCombinations**: 计算所有可行的支付方案
3. **executePaymentSolution**: 执行选定的支付方案

### 卡牌修改器系统

卡牌可以通过 `modifier` 字段修改支付成本：

#### TradeModifier（资源转换）

```typescript
// 示例：A123_FrameBuilder - 建造/翻新时 2 Clay → 1 Wood（每行动至多 1 次）
modifier: {
  type: 'trade',
  cardId: 'A123_FrameBuilder',
  appliesTo: ['construct', 'renovation'],
  from: { clay: 2 },
  to: { wood: 1 },
  max: 1,
}
```

#### BonusModifier（资源折扣）

```typescript
// 示例：A88_HedgeKeeper - 围栏时 -3 Wood
modifier: {
  type: 'bonus',
  cardId: 'A88_HedgeKeeper',
  appliesTo: ['fencing'],
  discount: { wood: 3 },
}
```

### 卡牌抵换机制

大改良支持从其他大改良升级（归还旧卡 + 支付折扣价）：

```typescript
// Major_CookingHearth1 - 从 Fireplace1/2 升级
const Major_CookingHearth1: MajorCardDefinition = {
  id: 'Major_CookingHearth1',
  effect: {
    cost: {
      fees: [{ clay: 4 }],  // 全价：4 Clay
      cards: {
        type: 'Major',
        list: ['Major_Fireplace1', 'Major_Fireplace2'],
        cost: { clay: 2 }   // 升级价：2 Clay + 归还 Fireplace
      }
    },
    returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],  // 可归还的卡牌
  }
}
```

### 支付相关卡牌索引

#### 资源转换卡 (TradeModifier)

| 卡牌 | 成本类型 | 转换规则 |
|------|----------|----------|
| [A123_FrameBuilder](../shared/cards/A/A123_FrameBuilder.ts) | 房间建造/翻新 | 2 Clay → 1 Wood（每行动至多 1 次） |

#### 资源折扣卡 (BonusModifier)

| 卡牌 | 成本类型 | 折扣 |
|------|----------|------|
| [A88_HedgeKeeper](../shared/cards/A/A88_HedgeKeeper.ts) | 围栏 | -3 Wood |
| [A128_RiparianBuilder](../shared/cards/A/A128_RiparianBuilder.ts) | 房间建造 | 芦苇河岸赠送建房时，泥屋 -1 Clay / 石屋 -2 Stone |
| [B15_CarpentersBench](../shared/cards/B/B15_CarpentersBench.ts) | 围栏 | -1 Wood |
| [C88_CarpentersApprentice](../shared/cards/C/C88_CarpentersApprentice.ts) | 房间建造 | -2 Wood（木屋时） |

#### 卡牌升级类 (returnCards)

| 卡牌 | 可升级自 | 升级成本 |
|------|----------|----------|
| [Major_CookingHearth1](../shared/cards/major/cooking-hearth.ts) | Major_Fireplace1/2 | 2 Clay |
| [Major_CookingHearth2](../shared/cards/major/cooking-hearth.ts) | Major_Fireplace1/2 | 3 Clay |

## 前端展示 (UI)

- **行动区布局**：`ActionBoard.tsx` 完全还原 BGA 棋盘布局。板面 1000×795px，`central.png` 作为主背景（偏移 170px），`add_2p.png` 作为左侧边栏背景。不论几人局，始终显示所有 4 人局行动位（含左侧 Copse、Grove、Resource Market、Hollow、Lessons-4、Traveling Players）。卡牌采用 BGA 3 段式渲染（header/desc/footer），每段分别引用 `action_frame.png` 或 `action_frame_s.png` 的不同 `background-position` 切片。累积类行动卡体内显示每回合获取量（数字 + 资源图标），非累积行动卡显示文字描述。箭头通过 `action_frame_arrow.png` CSS 伪元素显示方向（left/right/bottom），累积资源以 `.resource-holder` 显示在卡片外部，带橙色圆形数量徽章（`#f9a63b`）。Round 行动卡的 holder 使用 `actions_background.png` sprite（5×3 网格），hover 时通过 `position: fixed` tooltip 显示 `actions.jpg` 大图预览及描述。棋盘通过 ResizeObserver + CSS `transform: scale()` 响应式缩放。字体使用 BGA 的 Dominican（标题/卡牌）+ CalibriB（加粗文本）。
- **资源图标**：`ResourceLine.tsx` 使用 BGA meeple sprite 图标（`res-icon-*`）替代文字标签，`ActionBoard` 累积资源通过堆叠 `res-icon` sprite 显示在 `.resource-holder` 中，卡牌体内通过 `.gain-display` 显示数字 + 内联资源图标。
- **日志卡牌 hover**：`LogPanel.tsx` 检测日志中的卡牌引用，hover 显示卡牌徽章与 tooltip（名称、描述）。
- **卡牌关键字图标**：`PlayerCard.tsx` 的 `.card-category` 图标增加中英文 tooltip（8 个类别）。Passing 小牌增加 `.card-passing-badge` 可视标识。
- **对局状态指示**：`GameHeader.tsx` 增加"轮到你了"/"等待对方"状态徽章（pulse 动画），显示玩家身份，回合进度（N/14）。My-turn 时 header 绿色高亮，not-my-turn 时 action 区域变暗并禁用交互。

## 相关核心文件

### 类型定义
- [types.ts](../shared/game/types.ts) - 游戏类型定义（ComplexCost, PaymentSolution, TradeModifier, BonusModifier）
- [cards/types.ts](../shared/cards/types.ts) - 卡牌类型定义
- [cards/card-modifiers.ts](../shared/cards/card-modifiers.ts) - 卡牌修改器查找（getCardModifier / getCardModifiers，从卡牌定义读取）

### 行动效果
- [pay.ts](../shared/actions/effects/pay.ts) - 支付系统核心（computeAllBuyableCombinations, executePaymentSolution）
- [exchange.ts](../shared/actions/effects/exchange.ts) - 交易系统（canAffordTrade, applyTrade）
- [house.ts](../shared/actions/effects/house.ts) - 建筑系统
- [fencing.ts](../shared/actions/effects/fencing.ts) - 围栏系统
- [plow.ts](../shared/actions/effects/plow.ts) - 犁地系统
- [sow.ts](../shared/actions/effects/sow.ts) - 播种系统
- [stables.ts](../shared/actions/effects/stables.ts) - 马厩系统
- [improvement.ts](../shared/actions/effects/improvement.ts) - 改良系统（支持多支付方式选择）

### 游戏逻辑
- [scoring.ts](../shared/logic/scoring.ts) - 计分系统
- [state.ts](../shared/logic/state.ts) - 状态管理
- [round.ts](../shared/logic/round.ts) - 回合逻辑

### Hook 系统
- [hooks.ts](../shared/actions/hooks.ts) - Hook 定义
- [card-listeners.ts](../shared/cards/card-listeners.ts) - 卡牌监听器
- [card-effects.ts](../shared/cards/card-effects.ts) - 卡牌效果

### 测试文件
- [pay.test.ts](../shared/actions/effects/__tests__/pay.test.ts) - 支付系统测试
- [exchange.test.ts](../shared/actions/effects/__tests__/exchange.test.ts) - 交易系统测试

## BGA 阶段性 Hook 参考

以下整理自 `bga-agricola` 的完整 hook 体系，作为 open-agricola 扩展 hook 点位的参考。

### 游戏流程与 Hook 触发顺序

```
回合开始:
  BeforeStartOfTurn → StartOfTurn

工作阶段:
  PlaceFarmer → 各原子行动（Collect, Gain, Improvement, ...）
  （原子行动 Hook 矩阵已覆盖）

回家阶段:
  BeforeReturnHome → StartReturnHome → ReturnHome

回合结束:
  EndOfRound → AfterEndOfRound

收获阶段（仅收获轮 4/7/9/11/13/14）:
  BeforeHarvest
  → StartHarvest
  → StartHarvestFieldPhase → HarvestFieldPhase → EndHarvestFieldPhase
  → StartHarvestFeedingPhase → HarvestFeedingPhase → EndHarvestFeedingPhase
  → Breeding
  → EndHarvest
  → AfterHarvest
```

### BGA 各阶段注册卡牌数量

| 阶段 | BGA 卡牌数 | Open 对应 | 差距 | 典型示例 |
|---|---|---|---|---|
| onBuy | 100+ | onBuy（已接入） | Major 已覆盖，Minor/Occ 待补 | E53_BoarSpear, E74_AshTrees, Major_Well |
| BeforeStartOfTurn | 6 | onBeforeStartOfTurn（已接入） | 仅 B70 | B70_NewPurchase, D48_CivicFacade, C157_ResourceAnalyzer |
| StartOfTurn | 30+ | onRoundStart（已接入） | 仅 Major 间接使用 | A81_InterimStorage, E126_TaxCollector, D53_TeaHouse |
| BeforeReturnHome | 1 | onBeforeReturnHome（已接入） | 暂无卡牌注册 | D51_Archway |
| StartReturnHome | 11 | onStartReturnHome（已接入） | 暂无卡牌注册 | A151_Minstrel, E20_IronHoe, C97_SeedResearcher, A100_Curator |
| ReturnHome | 12 | onReturnHome（已接入） | C75_Firewood, A84_Silage | A53_Claypipe, A29_AleBenches, B139_ForestScientist |
| EndOfRound | 7 | onRoundEnd（已接入） | 暂无卡牌注册 | A70_LiftingMachine, A54_Credit, A165_PigBreeder |
| AfterEndOfRound | 1 | onAfterRoundEnd（已接入） | 暂无卡牌注册 | D167_PureBreeder |
| BeforeHarvest | 3 | onBeforeHarvest（已接入） | A166_Haydryer | D98_Transactor, D32_WoodRake, C92_AutumnMother |
| StartHarvest | 16 | onStartHarvest（已接入） | 暂无卡牌注册 | D97_BeggingStudent, E58_LunchtimeBeer, E61_RaisedBed |
| StartHarvestFieldPhase | 7 | onStartHarvestFieldPhase（已接入） | 暂无卡牌注册 | E73_Scythe, E112_GrainThief, D70_StrawManure |
| HarvestFieldPhase | 10+ | onHarvestFieldPhase（已接入） | 暂无卡牌注册 | A112_ScytheWorker, B39_Loom, E107_LandSurveyor |
| EndHarvestFieldPhase | 6 | onEndHarvestFieldPhase（已接入） | 暂无卡牌注册 | E112_GrainThief, C110_HomeBrewer |
| StartHarvestFeedingPhase | 3 | onStartHarvestFeedingPhase（已接入） | 暂无卡牌注册 | C107_Baker, E52_Cubbyhole, E110_Dentist |
| HarvestFeedingPhase | 10+ | onHarvestFeedingPhase（已接入） | 暂无卡牌注册 | D84_FeedPellets, E132_VeggieLover, D133_BeerTentOperator |
| EndHarvestFeedingPhase | 4 | onEndHarvestFeedingPhase（已接入） | 暂无卡牌注册 | E83_ShepherdsWhistle, E91_PlowBuilder, D76_SocialBenefits |
| EndHarvest | 9 | onEndHarvest（已接入） | 暂无卡牌注册 | E73_Scythe, E99_UncaringParents, D72_StableManure |
| AfterHarvest | 3 | onAfterHarvest（已接入） | D99_EarthenwarePotter | E134_Omnifarmer, D129_LumberVirtuoso |

### 扩展优先级建议

**P0 - 全部阶段性 Hook 已接入**：
- 所有 22 个 CardEffect Hook 均已定义并在 `game-session.ts` 中按 BGA 顺序调用
- 架构机制已就绪（ActivateCardNode、PlayerSwitchNode、computeCardCosts、costOverride、gain params）

**P1 - 待实现具体卡牌**：
- ReturnHome 子阶段（BeforeReturnHome/StartReturnHome）：BGA 有 12 张卡待接入
- Harvest 子阶段（StartHarvest 等 8 个阶段）：BGA 有 50+ 张卡待接入
- StartOfTurn：BGA 有 30+ 张卡待接入
