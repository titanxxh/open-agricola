# 卡牌实现示例与Hook覆盖清单

## 原子行动 Hook 覆盖矩阵

说明：每个原子行动在各 Hook 点至少给出一张卡牌示例；无示例则标记为“—”。

| 原子行动 | Before | During | ImmediatelyAfter | After | ComputeCosts | ComputeArgs | ComputeReplace | IsDoable |
|---|---|---|---|---|---|---|---|---|
| PlaceFarmer | — | [A126_MasterWorkman](../src/actions/cards/A/A126_MasterWorkman.ts)（实现状态：false） | [C25_SteamMachine](../src/actions/cards/C/C25_SteamMachine.ts)（实现状态：false） | [A119_FirewoodCollector](../src/actions/cards/A/A119_FirewoodCollector.ts)（实现状态：false） | — | [A126_MasterWorkman](../src/actions/cards/A/A126_MasterWorkman.ts)（实现状态：false） | — | — |
| Collect | — | [E53_BoarSpear](../src/actions/cards/E/E53_BoarSpear.ts)（实现状态：false） | [A108_MushroomCollector](../src/actions/cards/A/A108_MushroomCollector.ts)（实现状态：false） | [A17_ReclamationPlow](../src/actions/cards/A/A17_ReclamationPlow.ts)（实现状态：false） | — | — | — | — |
| Gain | — | [E53_BoarSpear](../src/actions/cards/E/E53_BoarSpear.ts)（实现状态：false） | — | [A53_Claypipe](../src/actions/cards/A/A53_Claypipe.ts)（实现状态：false） | — | — | — | — |
| Construct | — | — | — | [A110_Roughcaster](../src/actions/cards/A/A110_Roughcaster.ts)（实现状态：false） | [A128_RiparianBuilder](../src/actions/cards/A/A128_RiparianBuilder.ts)（实现状态：false） | — | — | — |
| Plow | — | — | — | [A105_BarrowPusher](../src/actions/cards/A/A105_BarrowPusher.ts)（实现状态：false） | [C37_DwellingMound](../src/actions/cards/C/C37_DwellingMound.ts)（实现状态：false） | — | — | — |
| FirstPlayer | — | — | — | — | — | — | — | — |
| Improvement | [B75_WoodWorkshop](../src/actions/cards/B/B75_WoodWorkshop.ts)（实现状态：false） | [A55_JunkRoom](../src/actions/cards/A/A55_JunkRoom.ts)（实现状态：false） | [C96_Merchant](../src/actions/cards/C/C96_Merchant.ts)（实现状态：false） | [A109_SmallTrader](../src/actions/cards/A/A109_SmallTrader.ts)（实现状态：false） | — | — | [B103_FieldMerchant](../src/actions/cards/B/B103_FieldMerchant.ts)（实现状态：false） | [B75_WoodWorkshop](../src/actions/cards/B/B75_WoodWorkshop.ts)（实现状态：false） |
| Sow | [A65_SeedPellets](../src/actions/cards/A/A65_SeedPellets.ts)（实现状态：false） | — | — | [A79_GardenHoe](../src/actions/cards/A/A79_GardenHoe.ts)（实现状态：false） | — | — | [A94_LazySowman](../src/actions/cards/A/A94_LazySowman.ts)（实现状态：false） | [A94_LazySowman](../src/actions/cards/A/A94_LazySowman.ts)（实现状态：false） |
| Stables | — | — | — | [A74_StableTree](../src/actions/cards/A/A74_StableTree.ts)（实现状态：false） | [C88_CarpentersApprentice](../src/actions/cards/C/C88_CarpentersApprentice.ts)（实现状态：false） | — | — | — |
| Renovation | [D14_HammerCrusher](../src/actions/cards/D/D14_HammerCrusher.ts)（实现状态：false） | — | — | [A37_Bucksaw](../src/actions/cards/A/A37_Bucksaw.ts)（实现状态：false） | [A123_FrameBuilder](../src/actions/cards/A/A123_FrameBuilder.ts)（实现状态：false） | — | — | [D14_HammerCrusher](../src/actions/cards/D/D14_HammerCrusher.ts)（实现状态：false） |
| Fencing | [E74_AshTrees](../src/actions/cards/E/E74_AshTrees.ts)（实现状态：false） | — | [A83_ShepherdsCrook](../src/actions/cards/A/A83_ShepherdsCrook.ts)（实现状态：false） | [A144_Sequestrator](../src/actions/cards/A/A144_Sequestrator.ts)（实现状态：false） | [A88_HedgeKeeper](../src/actions/cards/A/A88_HedgeKeeper.ts)（实现状态：false） | — | — | [B94_StockProtector](../src/actions/cards/B/B94_StockProtector.ts)（实现状态：false） |
| WishChildren | — | — | — | [D150_GodlySpouse](../src/actions/cards/D/D150_GodlySpouse.ts)（实现状态：false） | — | — | — | [E130_Overachiever](../src/actions/cards/E/E130_Overachiever.ts)（实现状态：false） |
| Pay | — | — | — | [B65_GrainDepot](../src/actions/cards/B/B65_GrainDepot.ts)（实现状态：false） | — | — | — | — |
| Reorganize | — | — | — | [C71_SlurrySpreader](../src/actions/cards/C/C71_SlurrySpreader.ts)（实现状态：false） | — | — | — | — |
| Exchange | [B67_HandTruck](../src/actions/cards/B/B67_HandTruck.ts)（实现状态：false） | — | — | [A53_Claypipe](../src/actions/cards/A/A53_Claypipe.ts)（实现状态：false） | — | — | [A97_Freshman](../src/actions/cards/A/A97_Freshman.ts)（实现状态：false） | [A97_Freshman](../src/actions/cards/A/A97_Freshman.ts)（实现状态：false） |
| Occupation | [B109_PaperMaker](../src/actions/cards/B/B109_PaperMaker.ts)（实现状态：false） | — | — | [B100_Clutterer](../src/actions/cards/B/B100_Clutterer.ts)（实现状态：false） | [A28_ForestSchool](../src/actions/cards/A/A28_ForestSchool.ts)（实现状态：false） | — | — | [B109_PaperMaker](../src/actions/cards/B/B109_PaperMaker.ts)（实现状态：false） |
| ActivateCard | — | — | — | — | — | — | — | — |
| SpecialEffect | [A17_ReclamationPlow](../src/actions/cards/A/A17_ReclamationPlow.ts)（实现状态：false） | — | — | — | — | — | — | — |
| Receive | — | [E53_BoarSpear](../src/actions/cards/E/E53_BoarSpear.ts)（实现状态：false） | — | [A53_Claypipe](../src/actions/cards/A/A53_Claypipe.ts)（实现状态：false） | — | — | — | — |
| Reap | — | — | — | [A64_BarleyMill](../src/actions/cards/A/A64_BarleyMill.ts)（实现状态：false） | — | — | — | — |
| PlaceFutureMeeples | — | — | — | — | — | — | — | — |
| PlaceMeeplesFromSupply | — | — | — | — | — | — | — | — |

## 行动卡 Hook 示例

| Hook 类型 | 示例卡牌 | 说明 |
|---|---|---|
| isActionCardEvent | [E82_Profiteering](../src/actions/cards/E/E82_Profiteering.ts)（实现状态：false） | 指定行动卡 ID 触发 |
| isActionCardEvent（多空间） | [D74_RoyalWood](../src/actions/cards/D/D74_RoyalWood.ts)（实现状态：false） | 多个行动空间触发 |
| isActionCardTurnEvent | [D55_NewMarket](../src/actions/cards/D/D55_NewMarket.ts)（实现状态：false） | 指定回合区间的行动卡触发 |
| isActionCardTurnEvent（1-4轮） | [A126_MasterWorkman](../src/actions/cards/A/A126_MasterWorkman.ts)（实现状态：false） | 指定轮次范围触发 |
| isCollectEvent | [E75_StoneAxe](../src/actions/cards/E/E75_StoneAxe.ts)（实现状态：false） | 累积格/收取事件触发 |

## SpecialEffect 卡牌清单

### 交互型（需 SpecialEffect.js 前端处理）

这些卡牌在前端交互层存在同名处理器：

- [A3_PaperKnife](../src/actions/cards/A/A3_PaperKnife.ts)（实现状态：false）
- [B146_Illusionist](../src/actions/cards/B/B146_Illusionist.ts)（实现状态：false）
- [A58_AsparagusKnife](../src/actions/cards/A/A58_AsparagusKnife.ts)（实现状态：false）
- [A70_LiftingMachine](../src/actions/cards/A/A70_LiftingMachine.ts)（实现状态：false）
- [D71_Changeover](../src/actions/cards/D/D71_Changeover.ts)（实现状态：false）
- [A84_Silage](../src/actions/cards/A/A84_Silage.ts)（实现状态：false）
- [B165_GameProvider](../src/actions/cards/B/B165_GameProvider.ts)（实现状态：false）
- [C18_RollOverPlow](../src/actions/cards/C/C18_RollOverPlow.ts)（实现状态：false）
- [D70_StrawManure](../src/actions/cards/D/D70_StrawManure.ts)（实现状态：false）
- [D72_StableManure](../src/actions/cards/D/D72_StableManure.ts)（实现状态：false）
- [A71_ClearingSpade](../src/actions/cards/A/A71_ClearingSpade.ts)（实现状态：false）
- [A112_ScytheWorker](../src/actions/cards/A/A112_ScytheWorker.ts)（实现状态：false）
- [C57_Crudite](../src/actions/cards/C/C57_Crudite.ts)（实现状态：false）
- [C63_CraftBrewery](../src/actions/cards/C/C63_CraftBrewery.ts)（实现状态：false）
- [C104_Collector](../src/actions/cards/C/C104_Collector.ts)（实现状态：false）
- [D132_HideFarmer](../src/actions/cards/D/D132_HideFarmer.ts)（实现状态：false）
- [D137_TradeTeacher](../src/actions/cards/D/D137_TradeTeacher.ts)（实现状态：false）
- [E22_GuestRoom](../src/actions/cards/E/E22_GuestRoom.ts)（实现状态：false）
- [A136_DrudgeryReeve](../src/actions/cards/A/A136_DrudgeryReeve.ts)（实现状态：false）
- [B115_TinsmithMaster](../src/actions/cards/B/B115_TinsmithMaster.ts)（实现状态：false）
- [C133_Soldier](../src/actions/cards/C/C133_Soldier.ts)（实现状态：false）
- [D51_Archway](../src/actions/cards/D/D51_Archway.ts)（实现状态：false）
- [D93_SheepInspector](../src/actions/cards/D/D93_SheepInspector.ts)（实现状态：false）
- [D102_SampleStableMaker](../src/actions/cards/D/D102_SampleStableMaker.ts)（实现状态：false）
- [E4_Thunderbolt](../src/actions/cards/E/E4_Thunderbolt.ts)（实现状态：false）
- [E10_StrawHat](../src/actions/cards/E/E10_StrawHat.ts)（实现状态：false）
- [E71_CowPatty](../src/actions/cards/E/E71_CowPatty.ts)（实现状态：false）
- [E73_Scythe](../src/actions/cards/E/E73_Scythe.ts)（实现状态：false）
- [E76_LumberPile](../src/actions/cards/E/E76_LumberPile.ts)（实现状态：false）
- [E78_SleightofHand](../src/actions/cards/E/E78_SleightofHand.ts)（实现状态：false）
- [E148_Lazybones](../src/actions/cards/E/E148_Lazybones.ts)（实现状态：false）
- [E74_AshTrees](../src/actions/cards/E/E74_AshTrees.ts)（实现状态：false）
- [E112_GrainThief](../src/actions/cards/E/E112_GrainThief.ts)（实现状态：false）
- [E85_MasterTanner](../src/actions/cards/E/E85_MasterTanner.ts)（实现状态：false）

### 自动型（Cards 内使用 SPECIAL_EFFECT）

#### A
- [A92_AdoptiveParents](../src/actions/cards/A/A92_AdoptiveParents.ts)（实现状态：false）
- [A89_StablePlanner](../src/actions/cards/A/A89_StablePlanner.ts)（实现状态：false）
- [A84_Silage](../src/actions/cards/A/A84_Silage.ts)（实现状态：false）
- [A82_WorkCertificate](../src/actions/cards/A/A82_WorkCertificate.ts)（实现状态：false）
- [A81_InterimStorage](../src/actions/cards/A/A81_InterimStorage.ts)（实现状态：false）
- [A72_CalciumFertilizers](../src/actions/cards/A/A72_CalciumFertilizers.ts)（实现状态：false）
- [A71_ClearingSpade](../src/actions/cards/A/A71_ClearingSpade.ts)（实现状态：false）
- [A70_LiftingMachine](../src/actions/cards/A/A70_LiftingMachine.ts)（实现状态：false）
- [A58_AsparagusKnife](../src/actions/cards/A/A58_AsparagusKnife.ts)（实现状态：false）
- [A53_Claypipe](../src/actions/cards/A/A53_Claypipe.ts)（实现状态：false）
- [A40_PottersYard](../src/actions/cards/A/A40_PottersYard.ts)（实现状态：false）
- [A3_PaperKnife](../src/actions/cards/A/A3_PaperKnife.ts)（实现状态：false）
- [A39_Chapel](../src/actions/cards/A/A39_Chapel.ts)（实现状态：false）
- [A29_AleBenches](../src/actions/cards/A/A29_AleBenches.ts)（实现状态：false）
- [A22_Telegram](../src/actions/cards/A/A22_Telegram.ts)（实现状态：false）
- [A17_ReclamationPlow](../src/actions/cards/A/A17_ReclamationPlow.ts)（实现状态：false）
- [A165_PigBreeder](../src/actions/cards/A/A165_PigBreeder.ts)（实现状态：false）
- [A162_ForestTallyman](../src/actions/cards/A/A162_ForestTallyman.ts)（实现状态：false）
- [A144_Sequestrator](../src/actions/cards/A/A144_Sequestrator.ts)（实现状态：false）
- [A137_RiverineShepherd](../src/actions/cards/A/A137_RiverineShepherd.ts)（实现状态：false）
- [A136_DrudgeryReeve](../src/actions/cards/A/A136_DrudgeryReeve.ts)（实现状态：false）
- [A112_ScytheWorker](../src/actions/cards/A/A112_ScytheWorker.ts)（实现状态：false）

#### B
- [B81_Handcart](../src/actions/cards/B/B81_Handcart.ts)（实现状态：false）
- [B76_Ceilings](../src/actions/cards/B/B76_Ceilings.ts)（实现状态：false）
- [B67_HandTruck](../src/actions/cards/B/B67_HandTruck.ts)（实现状态：false）
- [B55_MaintenancePremium](../src/actions/cards/B/B55_MaintenancePremium.ts)（实现状态：false）
- [B48_ForestStone](../src/actions/cards/B/B48_ForestStone.ts)（实现状态：false）
- [B42_ForestInn](../src/actions/cards/B/B42_ForestInn.ts)（实现状态：false）
- [B3_Moonshine](../src/actions/cards/B/B3_Moonshine.ts)（实现状态：false）
- [B23_FinalScenario](../src/actions/cards/B/B23_FinalScenario.ts)（实现状态：false）
- [B21_HayloftBarn](../src/actions/cards/B/B21_HayloftBarn.ts)（实现状态：false）
- [B19_MoldboardPlow](../src/actions/cards/B/B19_MoldboardPlow.ts)（实现状态：false）
- [B165_GameProvider](../src/actions/cards/B/B165_GameProvider.ts)（实现状态：false）
- [B146_Illusionist](../src/actions/cards/B/B146_Illusionist.ts)（实现状态：false）
- [B124_Trimmer](../src/actions/cards/B/B124_Trimmer.ts)（实现状态：false）
- [B115_TinsmithMaster](../src/actions/cards/B/B115_TinsmithMaster.ts)（实现状态：false）

#### C
- [C99_GardenDesigner](../src/actions/cards/C/C99_GardenDesigner.ts)（实现状态：false）
- [C93_InnerDistrictsDirector](../src/actions/cards/C/C93_InnerDistrictsDirector.ts)（实现状态：false）
- [C8_PlantFertilizer](../src/actions/cards/C/C8_PlantFertilizer.ts)（实现状态：false）
- [C87_Mason](../src/actions/cards/C/C87_Mason.ts)（实现状态：false）
- [C85_DenBuilder](../src/actions/cards/C/C85_DenBuilder.ts)（实现状态：false）
- [C84_PerennialRye](../src/actions/cards/C/C84_PerennialRye.ts)（实现状态：false）
- [C75_Firewood](../src/actions/cards/C/C75_Firewood.ts)（实现状态：false）
- [C63_CraftBrewery](../src/actions/cards/C/C63_CraftBrewery.ts)（实现状态：false）
- [C57_Crudite](../src/actions/cards/C/C57_Crudite.ts)（实现状态：false）
- [C51_FishingNet](../src/actions/cards/C/C51_FishingNet.ts)（实现状态：false）
- [C29_BeerTable](../src/actions/cards/C/C29_BeerTable.ts)（实现状态：false）
- [C25_SteamMachine](../src/actions/cards/C/C25_SteamMachine.ts)（实现状态：false）
- [C24_BedintheGrainField](../src/actions/cards/C/C24_BedintheGrainField.ts)（实现状态：false）
- [C23_JobContract](../src/actions/cards/C/C23_JobContract.ts)（实现状态：false）
- [C1_Overhaul](../src/actions/cards/C/C1_Overhaul.ts)（实现状态：false）
- [C19_SwingPlow](../src/actions/cards/C/C19_SwingPlow.ts)（实现状态：false）
- [C18_RollOverPlow](../src/actions/cards/C/C18_RollOverPlow.ts)（实现状态：false）
- [C168_AnimalCatcher](../src/actions/cards/C/C168_AnimalCatcher.ts)（实现状态：false）
- [C162_ForestOwner](../src/actions/cards/C/C162_ForestOwner.ts)（实现状态：false）
- [C156_HoofCaregiver](../src/actions/cards/C/C156_HoofCaregiver.ts)（实现状态：false）
- [C148_MudWallower](../src/actions/cards/C/C148_MudWallower.ts)（实现状态：false）
- [C142_MarketCrier](../src/actions/cards/C/C142_MarketCrier.ts)（实现状态：false）
- [C133_Soldier](../src/actions/cards/C/C133_Soldier.ts)（实现状态：false）
- [C130_OutskirtsDirector](../src/actions/cards/C/C130_OutskirtsDirector.ts)（实现状态：false）
- [C120_AgriculturalLabourer](../src/actions/cards/C/C120_AgriculturalLabourer.ts)（实现状态：false）
- [C115_Sower](../src/actions/cards/C/C115_Sower.ts)（实现状态：false）
- [C104_Collector](../src/actions/cards/C/C104_Collector.ts)（实现状态：false）

#### D
- [D98_Transactor](../src/actions/cards/D/D98_Transactor.ts)（实现状态：false）
- [D94_HenpeckedHusband](../src/actions/cards/D/D94_HenpeckedHusband.ts)（实现状态：false）
- [D93_SheepInspector](../src/actions/cards/D/D93_SheepInspector.ts)（实现状态：false）
- [D92_ChildOmbudsman](../src/actions/cards/D/D92_ChildOmbudsman.ts)（实现状态：false）
- [D74_RoyalWood](../src/actions/cards/D/D74_RoyalWood.ts)（实现状态：false）
- [D72_StableManure](../src/actions/cards/D/D72_StableManure.ts)（实现状态：false）
- [D71_Changeover](../src/actions/cards/D/D71_Changeover.ts)（实现状态：false）
- [D70_StrawManure](../src/actions/cards/D/D70_StrawManure.ts)（实现状态：false）
- [D66_PotterCeramics](../src/actions/cards/D/D66_PotterCeramics.ts)（实现状态：false）
- [D51_Archway](../src/actions/cards/D/D51_Archway.ts)（实现状态：false）
- [D27_Retraining](../src/actions/cards/D/D27_Retraining.ts)（实现状态：false）
- [D26_CarpentersYard](../src/actions/cards/D/D26_CarpentersYard.ts)（实现状态：false）
- [D23_PioneeringSpirit](../src/actions/cards/D/D23_PioneeringSpirit.ts)（实现状态：false）
- [D22_WorkPermit](../src/actions/cards/D/D22_WorkPermit.ts)（实现状态：false）
- [D20_TurnwrestPlow](../src/actions/cards/D/D20_TurnwrestPlow.ts)（实现状态：false）
- [D167_PureBreeder](../src/actions/cards/D/D167_PureBreeder.ts)（实现状态：false）
- [D158_BeanCounter](../src/actions/cards/D/D158_BeanCounter.ts)（实现状态：false）
- [D157_PartyOrganizer](../src/actions/cards/D/D157_PartyOrganizer.ts)（实现状态：false）
- [D150_GodlySpouse](../src/actions/cards/D/D150_GodlySpouse.ts)（实现状态：false）
- [D14_HammerCrusher](../src/actions/cards/D/D14_HammerCrusher.ts)（实现状态：false）
- [D137_TradeTeacher](../src/actions/cards/D/D137_TradeTeacher.ts)（实现状态：false）
- [D134_OysterEater](../src/actions/cards/D/D134_OysterEater.ts)（实现状态：false）
- [D132_HideFarmer](../src/actions/cards/D/D132_HideFarmer.ts)（实现状态：false）
- [D127_HardworkingMan](../src/actions/cards/D/D127_HardworkingMan.ts)（实现状态：false）
- [D126_FieldCultivator](../src/actions/cards/D/D126_FieldCultivator.ts)（实现状态：false）
- [D124_Emissary](../src/actions/cards/D/D124_Emissary.ts)（实现状态：false）
- [D116_TreeInspector](../src/actions/cards/D/D116_TreeInspector.ts)（实现状态：false）
- [D10_StorksNest](../src/actions/cards/D/D10_StorksNest.ts)（实现状态：false）
- [D107_Bellfounder](../src/actions/cards/D/D107_Bellfounder.ts)（实现状态：false）
- [D103_CanalBoatman](../src/actions/cards/D/D103_CanalBoatman.ts)（实现状态：false）
- [D102_SampleStableMaker](../src/actions/cards/D/D102_SampleStableMaker.ts)（实现状态：false）
- [D101_SugarBaker](../src/actions/cards/D/D101_SugarBaker.ts)（实现状态：false）

#### E
- [E86_PenBuilder](../src/actions/cards/E/E86_PenBuilder.ts)（实现状态：false）
- [E85_MasterTanner](../src/actions/cards/E/E85_MasterTanner.ts)（实现状态：false）
- [E81_AlchemistsLab](../src/actions/cards/E/E81_AlchemistsLab.ts)（实现状态：false）
- [E78_SleightofHand](../src/actions/cards/E/E78_SleightofHand.ts)（实现状态：false）
- [E76_LumberPile](../src/actions/cards/E/E76_LumberPile.ts)（实现状态：false）
- [E74_AshTrees](../src/actions/cards/E/E74_AshTrees.ts)（实现状态：false）
- [E73_Scythe](../src/actions/cards/E/E73_Scythe.ts)（实现状态：false）
- [E71_CowPatty](../src/actions/cards/E/E71_CowPatty.ts)（实现状态：false）
- [E5_NightLoot](../src/actions/cards/E/E5_NightLoot.ts)（实现状态：false）
- [E53_BoarSpear](../src/actions/cards/E/E53_BoarSpear.ts)（实现状态：false）
- [E52_Cubbyhole](../src/actions/cards/E/E52_Cubbyhole.ts)（实现状态：false）
- [E51_WhaleOil](../src/actions/cards/E/E51_WhaleOil.ts)（实现状态：false）
- [E4_Thunderbolt](../src/actions/cards/E/E4_Thunderbolt.ts)（实现状态：false）
- [E27_PiggyBank](../src/actions/cards/E/E27_PiggyBank.ts)（实现状态：false）
- [E22_GuestRoom](../src/actions/cards/E/E22_GuestRoom.ts)（实现状态：false）
- [E167_DairyCrier](../src/actions/cards/E/E167_DairyCrier.ts)（实现状态：false）
- [E166_Roastmaster](../src/actions/cards/E/E166_Roastmaster.ts)（实现状态：false）
- [E162_Entrepreneur](../src/actions/cards/E/E162_Entrepreneur.ts)（实现状态：false）
- [E148_Lazybones](../src/actions/cards/E/E148_Lazybones.ts)（实现状态：false）
- [E134_Omnifarmer](../src/actions/cards/E/E134_Omnifarmer.ts)（实现状态：false）
- [E123_ResourceHoarder](../src/actions/cards/E/E123_ResourceHoarder.ts)（实现状态：false）
- [E112_GrainThief](../src/actions/cards/E/E112_GrainThief.ts)（实现状态：false）
- [E10_StrawHat](../src/actions/cards/E/E10_StrawHat.ts)（实现状态：false）
- [E103_Wolf](../src/actions/cards/E/E103_Wolf.ts)（实现状态：false）

## 主路径特判卡牌清单（非Hook机制）

### Models

- 行动位占用规则：[B151_LittlePeasant](../src/actions/cards/B/B151_LittlePeasant.ts)（实现状态：false）
- 动物摆放合法性：[E33_BeaverColony](../src/actions/cards/E/E33_BeaverColony.ts)（实现状态：false）、[E36_HerbalGarden](../src/actions/cards/E/E36_HerbalGarden.ts)（实现状态：false）
- 犁地能力：[C17_NewlyPlowedField](../src/actions/cards/C/C17_NewlyPlowedField.ts)（实现状态：false）
- 空田计分修正：[C99_GardenDesigner](../src/actions/cards/C/C99_GardenDesigner.ts)（实现状态：false）
- 房间容量/额外房间：[A10_WoodenShed](../src/actions/cards/A/A10_WoodenShed.ts)（实现状态：false）、[B10_Caravan](../src/actions/cards/B/B10_Caravan.ts)（实现状态：false）、[D85_Reader](../src/actions/cards/D/D85_Reader.ts)（实现状态：false）、[C10_BunkBeds](../src/actions/cards/C/C10_BunkBeds.ts)（实现状态：false）、[A85_Homekeeper](../src/actions/cards/A/A85_Homekeeper.ts)（实现状态：false）、[C85_DenBuilder](../src/actions/cards/C/C85_DenBuilder.ts)（实现状态：false）、[E85_MasterTanner](../src/actions/cards/E/E85_MasterTanner.ts)（实现状态：false）、[A127_Lodger](../src/actions/cards/A/A127_Lodger.ts)（实现状态：false）
- 额外放置农夫来源：[E22_GuestRoom](../src/actions/cards/E/E22_GuestRoom.ts)（实现状态：false）
- 收获喂食与繁殖特判：[E30_ChildsToy](../src/actions/cards/E/E30_ChildsToy.ts)（实现状态：false）、[E159_OldMiser](../src/actions/cards/E/E159_OldMiser.ts)（实现状态：false）
- 繁殖后强制整理白名单：[E90_DungCollector](../src/actions/cards/E/E90_DungCollector.ts)（实现状态：false）、[D115_FodderPlanter](../src/actions/cards/D/D115_FodderPlanter.ts)（实现状态：false）、[E134_Omnifarmer](../src/actions/cards/E/E134_Omnifarmer.ts)（实现状态：false）、[E133_ChampionBreeder](../src/actions/cards/E/E133_ChampionBreeder.ts)（实现状态：false）、[C71_Slurry](../src/actions/cards/C/C71_Slurry.ts)（实现状态：false）
- 繁殖猪触发特效：[E53_BoarSpear](../src/actions/cards/E/E53_BoarSpear.ts)（实现状态：false）
- 潜在条件错误：[E84_DollysMother](../src/actions/cards/E/E84_DollysMother.ts)（实现状态：false）

### Actions

- WishChildren 特判：[E155_Visionary](../src/actions/cards/E/E155_Visionary.ts)（实现状态：false）、[E151_DeliveryNurse](../src/actions/cards/E/E151_DeliveryNurse.ts)（实现状态：false）、[E92_FieldDoctor](../src/actions/cards/E/E92_FieldDoctor.ts)（实现状态：false）、[D92_ChildOmbudsman](../src/actions/cards/D/D92_ChildOmbudsman.ts)（实现状态：false）
- Reorganize 特判：[A17_ReclamationPlow](../src/actions/cards/A/A17_ReclamationPlow.ts)（实现状态：false）、[B34_SpecialFood](../src/actions/cards/B/B34_SpecialFood.ts)（实现状态：false）、[D164_PetGrower](../src/actions/cards/D/D164_PetGrower.ts)（实现状态：false）、[E36_HerbalGarden](../src/actions/cards/E/E36_HerbalGarden.ts)（实现状态：false）、[E33_BeaverColony](../src/actions/cards/E/E33_BeaverColony.ts)（实现状态：false）
- Reorganize 收获繁殖特判：[E84_DollysMother](../src/actions/cards/E/E84_DollysMother.ts)（实现状态：false）
- Renovation 特判：[A87_Conservator](../src/actions/cards/A/A87_Conservator.ts)（实现状态：false）、[C13_WoodSlideHammer](../src/actions/cards/C/C13_WoodSlideHammer.ts)（实现状态：false）、[D14_HammerCrusher](../src/actions/cards/D/D14_HammerCrusher.ts)（实现状态：false）
- Reap 特判：[A106_SlurrySpreader](../src/actions/cards/A/A106_SlurrySpreader.ts)（实现状态：false）
- Pay 特判：[A41_VegetableSlicer](../src/actions/cards/A/A41_VegetableSlicer.ts)（实现状态：false）
- Improvement 特判：[C27_Blueprint](../src/actions/cards/C/C27_Blueprint.ts)（实现状态：false）、[D26_CarpentersYard](../src/actions/cards/D/D26_CarpentersYard.ts)（实现状态：false）、[D131_CraftsmanshipPromoter](../src/actions/cards/D/D131_CraftsmanshipPromoter.ts)（实现状态：false）、[E91_PlowBuilder](../src/actions/cards/E/E91_PlowBuilder.ts)（实现状态：false）、[E109_BraidMaker](../src/actions/cards/E/E109_BraidMaker.ts)（实现状态：false）、[E161_ElderBaker](../src/actions/cards/E/E161_ElderBaker.ts)（实现状态：false）
- Improvement purchaseCondition 特判：[A23_StoneCompany](../src/actions/cards/A/A23_StoneCompany.ts)（实现状态：false）
- Fencing 特判：[E16_BriarHedge](../src/actions/cards/E/E16_BriarHedge.ts)（实现状态：false）、[E74_AshTrees](../src/actions/cards/E/E74_AshTrees.ts)（实现状态：false）
- Fencing 约束名特判：[B2_MiniPasture](../src/actions/cards/B/B2_MiniPasture.ts)（实现状态：false）、[B15_CarpentersBench](../src/actions/cards/B/B15_CarpentersBench.ts)（实现状态：false）、[B149_OpenAirFarmer](../src/actions/cards/B/B149_OpenAirFarmer.ts)（实现状态：false）
- Exchange 特判：[E124_MayorCandidate](../src/actions/cards/E/E124_MayorCandidate.ts)（实现状态：false）
- Construct 特判：[A14_CarpentersHammer](../src/actions/cards/A/A14_CarpentersHammer.ts)（实现状态：false）
- Gain 特判：[C86_LivestockFeeder](../src/actions/cards/C/C86_LivestockFeeder.ts)（实现状态：false）

### States

- TurnTrait 特判：[A22_Telegram](../src/actions/cards/A/A22_Telegram.ts)（实现状态：false）、[D53_TeaHouse](../src/actions/cards/D/D53_TeaHouse.ts)（实现状态：false）、[D22_WorkPermit](../src/actions/cards/D/D22_WorkPermit.ts)（实现状态：false）、[E22_GuestRoom](../src/actions/cards/E/E22_GuestRoom.ts)（实现状态：false）、[E62_SourDough](../src/actions/cards/E/E62_SourDough.ts)（实现状态：false）、[E93_Motivator](../src/actions/cards/E/E93_Motivator.ts)（实现状态：false）
- HarvestTrait 特判：[E153_StoneSculptor](../src/actions/cards/E/E153_StoneSculptor.ts)（实现状态：false）、[A148_Woolgrower](../src/actions/cards/A/A148_Woolgrower.ts)（实现状态：false）、[B86_TruffleSearcher](../src/actions/cards/B/B86_TruffleSearcher.ts)（实现状态：false）

### Managers

- Scores 特判：[D132_HideFarmer](../src/actions/cards/D/D132_HideFarmer.ts)（实现状态：false）、[E159_OldMiser](../src/actions/cards/E/E159_OldMiser.ts)（实现状态：false）、[C135_Constable](../src/actions/cards/C/C135_Constable.ts)（实现状态：false）、[D100_LordoftheManor](../src/actions/cards/D/D100_LordoftheManor.ts)（实现状态：false）、[C31_WritingChamber](../src/actions/cards/C/C31_WritingChamber.ts)（实现状态：false）、[A39_Chapel](../src/actions/cards/A/A39_Chapel.ts)（实现状态：false）

### Core

- Stats 特判：[D36_BreedRegistry](../src/actions/cards/D/D36_BreedRegistry.ts)（实现状态：false）
