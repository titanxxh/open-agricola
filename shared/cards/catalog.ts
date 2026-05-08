import { getCustomMinorImprovement, getCustomOccupation } from './custom-registry'
import {
  registerCardLookups,
  MinorImprovement,
  Occupation,
  PlayerActionCard,
} from './types'
import type { CardDefinition } from './types'
import { majorCardDefinitions } from './major'
import { allCommunityCards } from './community/auto-catalog'
import { A10_WoodenShed } from '../cards-display/A/A10_WoodenShed'
import { A11_MudPatch } from '../cards-display/A/A11_MudPatch'
import { A102_Grocer } from '../cards-display/A/A102_Grocer'
import { A25_Bassinet } from '../cards-display/A/A25_Bassinet'
import { A105_BarrowPusher } from '../cards-display/A/A105_BarrowPusher'
import { A106_SlurrySpreader } from '../cards-display/A/A106_SlurrySpreader'
import { A108_MushroomCollector } from '../cards-display/A/A108_MushroomCollector'
import { A109_SmallTrader } from '../cards-display/A/A109_SmallTrader'
import { A110_Roughcaster } from '../cards-display/A/A110_Roughcaster'
import { A112_ScytheWorker } from '../cards-display/A/A112_ScytheWorker'
import { A113_HeresyTeacher } from '../cards-display/A/A113_HeresyTeacher'
import { A119_FirewoodCollector } from '../cards-display/A/A119_FirewoodCollector'
import { A123_FrameBuilder } from '../cards-display/A/A123_FrameBuilder'
import { A126_MasterWorkman } from '../cards-display/A/A126_MasterWorkman'
import { A132_Publican } from '../cards-display/A/A132_Publican'
import { A127_Lodger } from '../cards-display/A/A127_Lodger'
import { A128_RiparianBuilder } from '../cards-display/A/A128_RiparianBuilder'
import { A136_DrudgeryReeve } from '../cards-display/A/A136_DrudgeryReeve'
import { A137_RiverineShepherd } from '../cards-display/A/A137_RiverineShepherd'
import { A14_CarpentersHammer } from '../cards-display/A/A14_CarpentersHammer'
import { A143_Stonecutter } from '../cards-display/A/A143_Stonecutter'
import { A144_Sequestrator } from '../cards-display/A/A144_Sequestrator'
import { A156_Buyer } from '../cards-display/A/A156_Buyer'
import { A148_Woolgrower } from '../cards-display/A/A148_Woolgrower'
import { A150_Stagehand } from '../cards-display/A/A150_Stagehand'
import { A162_ForestTallyman } from '../cards-display/A/A162_ForestTallyman'
import { A165_PigBreeder } from '../cards-display/A/A165_PigBreeder'
import { A17_ReclamationPlow } from '../cards-display/A/A17_ReclamationPlow'
import { A22_Telegram } from '../cards-display/A/A22_Telegram'
import { A15_CarpentersAxe } from '../cards-display/A/A15_CarpentersAxe'
import { A21_FamilyFriendHome } from '../cards-display/A/A21_FamilyFriendHome'
import { A23_StoneCompany } from '../cards-display/A/A23_StoneCompany'
import { A30_BakingSheet } from '../cards-display/A/A30_BakingSheet'
import { A34_Loppers } from '../cards-display/A/A34_Loppers'
import { A45_FireProtectionPond } from '../cards-display/A/A45_FireProtectionPond'
import { A56_Basket } from '../cards-display/A/A56_Basket'
import { A63_DutchWindmill } from '../cards-display/A/A63_DutchWindmill'
import { A68_AsparagusGift } from '../cards-display/A/A68_AsparagusGift'
import { A93_BedMaker } from '../cards-display/A/A93_BedMaker'
import { A95_Angler } from '../cards-display/A/A95_Angler'
import { A103_Portmonger } from '../cards-display/A/A103_Portmonger'
import { A131_CraftTeacher } from '../cards-display/A/A131_CraftTeacher'
import { A146_StorehouseSteward } from '../cards-display/A/A146_StorehouseSteward'
import { A164_WoodWorker } from '../cards-display/A/A164_WoodWorker'
import { A28_ForestSchool } from '../cards-display/A/A28_ForestSchool'
import { A31_DebtSecurity } from '../cards-display/A/A31_DebtSecurity'
import { A29_AleBenches } from '../cards-display/A/A29_AleBenches'
import { A3_PaperKnife } from '../cards-display/A/A3_PaperKnife'
import { A37_Bucksaw } from '../cards-display/A/A37_Bucksaw'
import { A39_Chapel } from '../cards-display/A/A39_Chapel'
import { A40_PottersYard } from '../cards-display/A/A40_PottersYard'
import { A41_VegetableSlicer } from '../cards-display/A/A41_VegetableSlicer'
import { A48_ShavingHorse } from '../cards-display/A/A48_ShavingHorse'
import { A53_Claypipe } from '../cards-display/A/A53_Claypipe'
import { A55_JunkRoom } from '../cards-display/A/A55_JunkRoom'
import { A58_AsparagusKnife } from '../cards-display/A/A58_AsparagusKnife'
import { A59_PotatoRidger } from '../cards-display/A/A59_PotatoRidger'
import { A64_BarleyMill } from '../cards-display/A/A64_BarleyMill'
import { A65_SeedPellets } from '../cards-display/A/A65_SeedPellets'
import { A70_LiftingMachine } from '../cards-display/A/A70_LiftingMachine'
import { A71_ClearingSpade } from '../cards-display/A/A71_ClearingSpade'
import { A72_CalciumFertilizers } from '../cards-display/A/A72_CalciumFertilizers'
import { A73_AgriculturalFertilizers } from '../cards-display/A/A73_AgriculturalFertilizers'
import { A74_StableTree } from '../cards-display/A/A74_StableTree'
import { A79_GardenHoe } from '../cards-display/A/A79_GardenHoe'
import { A81_InterimStorage } from '../cards-display/A/A81_InterimStorage'
import { A82_WorkCertificate } from '../cards-display/A/A82_WorkCertificate'
import { A83_ShepherdsCrook } from '../cards-display/A/A83_ShepherdsCrook'
import { A84_Silage } from '../cards-display/A/A84_Silage'
import { A85_Homekeeper } from '../cards-display/A/A85_Homekeeper'
import { A86_AnimalTamer } from '../cards-display/A/A86_AnimalTamer'
import { A87_Conservator } from '../cards-display/A/A87_Conservator'
import { A88_HedgeKeeper } from '../cards-display/A/A88_HedgeKeeper'
import { A75_LumberMill } from '../cards-display/A/A75_LumberMill'
import { A26_SleepingCorner } from '../cards-display/A/A26_SleepingCorner'
import { A60_OrientalFireplace } from '../cards-display/A/A60_OrientalFireplace'
import { A89_StablePlanner } from '../cards-display/A/A89_StablePlanner'
import { A92_AdoptiveParents } from '../cards-display/A/A92_AdoptiveParents'
import { A94_LazySowman } from '../cards-display/A/A94_LazySowman'
import { A133_Braggart } from '../cards-display/A/A133_Braggart'
import { A134_FullFarmer } from '../cards-display/A/A134_FullFarmer'
import { A97_Freshman } from '../cards-display/A/A97_Freshman'
import { A1_Shelter } from '../cards-display/A/A1_Shelter'
import { A2_ShiftingCultivation } from '../cards-display/A/A2_ShiftingCultivation'
import { A4_Baseboards } from '../cards-display/A/A4_Baseboards'
import { A5_ClayEmbankment } from '../cards-display/A/A5_ClayEmbankment'
import { A6_StorageBarn } from '../cards-display/A/A6_StorageBarn'
import { A7_GardenersKnife } from '../cards-display/A/A7_GardenersKnife'
import { A8_FoodBasket } from '../cards-display/A/A8_FoodBasket'
import { A9_YoungAnimalMarket } from '../cards-display/A/A9_YoungAnimalMarket'
import { A13_RenovationCompany } from '../cards-display/A/A13_RenovationCompany'
import { A19_Handplow } from '../cards-display/A/A19_Handplow'
import { A33_BigCountry } from '../cards-display/A/A33_BigCountry'
import { A36_FacadesCarving } from '../cards-display/A/A36_FacadesCarving'
import { A44_PondHut } from '../cards-display/A/A44_PondHut'
import { A47_Trellises } from '../cards-display/A/A47_Trellises'
import { A57_MilkingParlor } from '../cards-display/A/A57_MilkingParlor'
import { A69_LargeGreenhouse } from '../cards-display/A/A69_LargeGreenhouse'
import { A12_DrinkingTrough } from '../cards-display/A/A12_DrinkingTrough'
import { A32_Manger } from '../cards-display/A/A32_Manger'
import { A38_WoolBlankets } from '../cards-display/A/A38_WoolBlankets'
import { A98_StableArchitect } from '../cards-display/A/A98_StableArchitect'
import { A99_FellowGrazer } from '../cards-display/A/A99_FellowGrazer'
import { A101_CookeryOutfitter } from '../cards-display/A/A101_CookeryOutfitter'
import { A166_Haydryer } from '../cards-display/A/A166_Haydryer'
import { A169_OffSiter } from '../cards-display/A/A169_OffSiter'
import { A170_Hayward } from '../cards-display/A/A170_Hayward'
import { A171_Sidekick } from '../cards-display/A/A171_Sidekick'
import { A172_BoatPainter } from '../cards-display/A/A172_BoatPainter'
import { A173_ClayThief } from '../cards-display/A/A173_ClayThief'
import { A174_MasterHora } from '../cards-display/A/A174_MasterHora'
import { A175_HollowGardener } from '../cards-display/A/A175_HollowGardener'
import { A176_Wheelmaker } from '../cards-display/A/A176_Wheelmaker'
import { A177_Middleman } from '../cards-display/A/A177_Middleman'
import { A178_CarpentersBoy } from '../cards-display/A/A178_CarpentersBoy'
import { A179_MountainShepherd } from '../cards-display/A/A179_MountainShepherd'
import { A180_AnimalBrander } from '../cards-display/A/A180_AnimalBrander'
import { A117_WoodCarrier } from '../cards-display/A/A117_WoodCarrier'
import { A125_Priest } from '../cards-display/A/A125_Priest'
import { A135_AnimalReeve } from '../cards-display/A/A135_AnimalReeve'
import { A18_WheelPlow } from '../cards-display/A/A18_WheelPlow'
import { A24_ThreshingBoard } from '../cards-display/A/A24_ThreshingBoard'
import { A46_ClawKnife } from '../cards-display/A/A46_ClawKnife'
import { A51_DriftNetBoat } from '../cards-display/A/A51_DriftNetBoat'
import { A52_ThrowingAxe } from '../cards-display/A/A52_ThrowingAxe'
import { A66_FeedingDish } from '../cards-display/A/A66_FeedingDish'
import { A67_CornScoop } from '../cards-display/A/A67_CornScoop'
import { A78_Canoe } from '../cards-display/A/A78_Canoe'
import { A91_ShiftingCultivator } from '../cards-display/A/A91_ShiftingCultivator'
import { A107_Catcher } from '../cards-display/A/A107_Catcher'
import { A114_SeasonalWorker } from '../cards-display/A/A114_SeasonalWorker'
import { A115_ChiefForester } from '../cards-display/A/A115_ChiefForester'
import { A122_PanBaker } from '../cards-display/A/A122_PanBaker'
import { A138_Harpooner } from '../cards-display/A/A138_Harpooner'
import { A140_ShovelBearer } from '../cards-display/A/A140_ShovelBearer'
import { A147_AnimalDealer } from '../cards-display/A/A147_AnimalDealer'
import { A155_Conjurer } from '../cards-display/A/A155_Conjurer'
import { A161_PatchCaretaker } from '../cards-display/A/A161_PatchCaretaker'
import { A163_BuildingExpert } from '../cards-display/A/A163_BuildingExpert'
import { A168_AnimalTeacher } from '../cards-display/A/A168_AnimalTeacher'
import { A16_RammedClay } from '../cards-display/A/A16_RammedClay'
import { A149_HouseArtist } from '../cards-display/A/A149_HouseArtist'
import { B14_Hawktower } from '../cards-display/B/B14_Hawktower'
import { B20_ChainFloat } from '../cards-display/B/B20_ChainFloat'
import { B22_WalkingBoots } from '../cards-display/B/B22_WalkingBoots'
import { B27_Toolbox } from '../cards-display/B/B27_Toolbox'
import { B31_PotteryYard } from '../cards-display/B/B31_PotteryYard'
import { B32_Kettle } from '../cards-display/B/B32_Kettle'
import { B33_Mantlepiece } from '../cards-display/B/B33_Mantlepiece'
import { B37_Grange } from '../cards-display/B/B37_Grange'
import { B38_FutureBuildingSite } from '../cards-display/B/B38_FutureBuildingSite'
import { B39_Loom } from '../cards-display/B/B39_Loom'
import { B41_Hauberg } from '../cards-display/B/B41_Hauberg'
import { B44_ChickStable } from '../cards-display/B/B44_ChickStable'
import { B45_StrawberryPatch } from '../cards-display/B/B45_StrawberryPatch'
import { B46_ClubHouse } from '../cards-display/B/B46_ClubHouse'
import { B10_Caravan } from '../cards-display/B/B10_Caravan'
import { B11_Feedyard } from '../cards-display/B/B11_Feedyard'
import { B52_GrowingFarm } from '../cards-display/B/B52_GrowingFarm'
import { B59_FoodChest } from '../cards-display/B/B59_FoodChest'
import { B66_SackCart } from '../cards-display/B/B66_SackCart'
import { B71_HarvestHouse } from '../cards-display/B/B71_HarvestHouse'
import { B73_GiftBasket } from '../cards-display/B/B73_GiftBasket'
import { B74_ThickForest } from '../cards-display/B/B74_ThickForest'
import { B78_ReedBelt } from '../cards-display/B/B78_ReedBelt'
import { B80_HardPorcelain } from '../cards-display/B/B80_HardPorcelain'
import { B84_AcornsBasket } from '../cards-display/B/B84_AcornsBasket'
import { B88_EstablishedPerson } from '../cards-display/B/B88_EstablishedPerson'
import { B93_Confidant } from '../cards-display/B/B93_Confidant'
import { B96_TreeFarmJoiner } from '../cards-display/B/B96_TreeFarmJoiner'
import { B102_Consultant } from '../cards-display/B/B102_Consultant'
import { B104_SheepWalker } from '../cards-display/B/B104_SheepWalker'
import { B105_CaseBuilder } from '../cards-display/B/B105_CaseBuilder'
import { B113_PatchCaregiver } from '../cards-display/B/B113_PatchCaregiver'
import { B119_Lumberjack } from '../cards-display/B/B119_Lumberjack'
import { B123_RoofBallaster } from '../cards-display/B/B123_RoofBallaster'
import { B125_EstateWorker } from '../cards-display/B/B125_EstateWorker'
import { B127_Seducer } from '../cards-display/B/B127_Seducer'
import { B141_FieldCaretaker } from '../cards-display/B/B141_FieldCaretaker'
import { B164_SheepWhisperer } from '../cards-display/B/B164_SheepWhisperer'
import { B167_StableSergeant } from '../cards-display/B/B167_StableSergeant'
import { B169_LivestockSustainer } from '../cards-display/B/B169_LivestockSustainer'
import { B170_CorralBuilder } from '../cards-display/B/B170_CorralBuilder'
import { B171_GreenhouseBuilder } from '../cards-display/B/B171_GreenhouseBuilder'
import { B172_CattleCaregiver } from '../cards-display/B/B172_CattleCaregiver'
import { B173_Sweeper } from '../cards-display/B/B173_Sweeper'
import { B174_RiverbankGardener } from '../cards-display/B/B174_RiverbankGardener'
import { B175_FieldOverseer } from '../cards-display/B/B175_FieldOverseer'
import { B176_VillageIdiot } from '../cards-display/B/B176_VillageIdiot'
import { B177_StoneClawer } from '../cards-display/B/B177_StoneClawer'
import { B178_TagAlong } from '../cards-display/B/B178_TagAlong'
import { B179_WildBoarHunter } from '../cards-display/B/B179_WildBoarHunter'
import { B180_GameTeaser } from '../cards-display/B/B180_GameTeaser'
import { B100_Clutterer } from '../cards-display/B/B100_Clutterer'
import { B103_FieldMerchant } from '../cards-display/B/B103_FieldMerchant'
import { B109_PaperMaker } from '../cards-display/B/B109_PaperMaker'
import { B115_TinsmithMaster } from '../cards-display/B/B115_TinsmithMaster'
import { B124_Trimmer } from '../cards-display/B/B124_Trimmer'
import { B146_Illusionist } from '../cards-display/B/B146_Illusionist'
import { B148_PetBroker } from '../cards-display/B/B148_PetBroker'
import { B149_OpenAirFarmer } from '../cards-display/B/B149_OpenAirFarmer'
import { B13_CarpentersParlor } from '../cards-display/B/B13_CarpentersParlor'
import { B15_CarpentersBench } from '../cards-display/B/B15_CarpentersBench'
import { B126_Carpenter } from '../cards-display/B/B126_Carpenter'
import { B128_Plumber } from '../cards-display/B/B128_Plumber'
import { B151_LittlePeasant } from '../cards-display/B/B151_LittlePeasant'
import { B153_Housemaster } from '../cards-display/B/B153_Housemaster'
import { B154_SheepKeeper } from '../cards-display/B/B154_SheepKeeper'
import { B165_GameProvider } from '../cards-display/B/B165_GameProvider'
import { B19_MoldboardPlow } from '../cards-display/B/B19_MoldboardPlow'
import { B2_MiniPasture } from '../cards-display/B/B2_MiniPasture'
import { B21_HayloftBarn } from '../cards-display/B/B21_HayloftBarn'
import { B23_FinalScenario } from '../cards-display/B/B23_FinalScenario'
import { B30_WoodPalisades } from '../cards-display/B/B30_WoodPalisades'
import { B3_Moonshine } from '../cards-display/B/B3_Moonshine'
import { B34_SpecialFood } from '../cards-display/B/B34_SpecialFood'
import { B35_HookKnife } from '../cards-display/B/B35_HookKnife'
import { B42_ForestInn } from '../cards-display/B/B42_ForestInn'
import { B48_ForestStone } from '../cards-display/B/B48_ForestStone'
import { B55_MaintenancePremium } from '../cards-display/B/B55_MaintenancePremium'
import { B65_GrainDepot } from '../cards-display/B/B65_GrainDepot'
import { B67_HandTruck } from '../cards-display/B/B67_HandTruck'
import { B70_NewPurchase } from '../cards-display/B/B70_NewPurchase'
import { B72_LoveforAgriculture } from '../cards-display/B/B72_LoveforAgriculture'
import { B75_WoodWorkshop } from '../cards-display/B/B75_WoodWorkshop'
import { B76_Ceilings } from '../cards-display/B/B76_Ceilings'
import { B81_Handcart } from '../cards-display/B/B81_Handcart'
import { B83_MuddyPuddles } from '../cards-display/B/B83_MuddyPuddles'
import { B85_FarmHand } from '../cards-display/B/B85_FarmHand'
import { B86_TruffleSearcher } from '../cards-display/B/B86_TruffleSearcher'
import { B12_Stockyard } from '../cards-display/B/B12_Stockyard'
import { B69_PottersMarket } from '../cards-display/B/B69_PottersMarket'
import { B95_MasterBricklayer } from '../cards-display/B/B95_MasterBricklayer'
import { B101_FurnitureCarpenter } from '../cards-display/B/B101_FurnitureCarpenter'
import { B129_Seatmate } from '../cards-display/B/B129_Seatmate'
import { B157_Salter } from '../cards-display/B/B157_Salter'
import { B98_OrganicFarmer } from '../cards-display/B/B98_OrganicFarmer'
import { B99_Tutor } from '../cards-display/B/B99_Tutor'
import { B132_EstateMaster } from '../cards-display/B/B132_EstateMaster'
import { B136_HouseSteward } from '../cards-display/B/B136_HouseSteward'
import { B94_StockProtector } from '../cards-display/B/B94_StockProtector'
import { B1_UpscaleLifestyle } from '../cards-display/B/B1_UpscaleLifestyle'
import { B4_WoodPile } from '../cards-display/B/B4_WoodPile'
import { B5_StoreofExperience } from '../cards-display/B/B5_StoreofExperience'
import { B6_ExcursiontotheQuarry } from '../cards-display/B/B6_ExcursiontotheQuarry'
import { B7_Wage } from '../cards-display/B/B7_Wage'
import { B8_MarketStall } from '../cards-display/B/B8_MarketStall'
import { B9_BeatingRod } from '../cards-display/B/B9_BeatingRod'
import { B17_ForestPlow } from '../cards-display/B/B17_ForestPlow'
import { B24_Lasso } from '../cards-display/B/B24_Lasso'
import { B28_ForestryStudies } from '../cards-display/B/B28_ForestryStudies'
import { B111_Rustic } from '../cards-display/B/B111_Rustic'
import { B131_Equipper } from '../cards-display/B/B131_Equipper'
import { B134_HousebookMaster } from '../cards-display/B/B134_HousebookMaster'
import { B147_Huntsman } from '../cards-display/B/B147_Huntsman'
import { B40_BreweryPond } from '../cards-display/B/B40_BreweryPond'
import { B43_Chophouse } from '../cards-display/B/B43_Chophouse'
import { B47_HerringPot } from '../cards-display/B/B47_HerringPot'
import { B56_Brook } from '../cards-display/B/B56_Brook'
import { B60_BrewingWater } from '../cards-display/B/B60_BrewingWater'
import { B61_ThreeFieldRotation } from '../cards-display/B/B61_ThreeFieldRotation'
import { B62_Pitchfork } from '../cards-display/B/B62_Pitchfork'
import { B64_MillWheel } from '../cards-display/B/B64_MillWheel'
import { B77_LoamPit } from '../cards-display/B/B77_LoamPit'
import { B87_Cottager } from '../cards-display/B/B87_Cottager'
import { B90_CooperativePlower } from '../cards-display/B/B90_CooperativePlower'
import { B91_AssistantTiller } from '../cards-display/B/B91_AssistantTiller'
import { B92_LittleStickKnitter } from '../cards-display/B/B92_LittleStickKnitter'
import { B112_Silokeeper } from '../cards-display/B/B112_Silokeeper'
import { B142_Greengrocer } from '../cards-display/B/B142_Greengrocer'
import { B144_Collier } from '../cards-display/B/B144_Collier'
import { B145_BrushwoodCollector } from '../cards-display/B/B145_BrushwoodCollector'
import { B166_CattleFeeder } from '../cards-display/B/B166_CattleFeeder'
import { C16_FieldFences } from '../cards-display/C/C16_FieldFences'
import { C56_FeedFence } from '../cards-display/C/C56_FeedFence'
import { C30_HalfTimberedHouse } from '../cards-display/C/C30_HalfTimberedHouse'
import { C62_CookeryExtension } from '../cards-display/C/C62_CookeryExtension'
import { C33_GreeningPlan } from '../cards-display/C/C33_GreeningPlan'
import { C35_LanternHouse } from '../cards-display/C/C35_LanternHouse'
import { C38_Christianity } from '../cards-display/C/C38_Christianity'
import { C40_CanvasSack } from '../cards-display/C/C40_CanvasSack'
import { C44_ChickenCoop } from '../cards-display/C/C44_ChickenCoop'
import { C46_Mandoline } from '../cards-display/C/C46_Mandoline'
import { C47_GardenClaw } from '../cards-display/C/C47_GardenClaw'
import { C48_Farmstead } from '../cards-display/C/C48_Farmstead'
import { C49_BeerStall } from '../cards-display/C/C49_BeerStall'
import { C50_StableYard } from '../cards-display/C/C50_StableYard'
import { C59_SchnappsDistillery } from '../cards-display/C/C59_SchnappsDistillery'
import { C65_Granary } from '../cards-display/C/C65_Granary'
import { C72_FestivalPlanning } from '../cards-display/C/C72_FestivalPlanning'
import { C74_PrivateForest } from '../cards-display/C/C74_PrivateForest'
import { C77_ClaySupply } from '../cards-display/C/C77_ClaySupply'
import { C78_ReedHattedToad } from '../cards-display/C/C78_ReedHattedToad'
import { C79_StoneCart } from '../cards-display/C/C79_StoneCart'
import { C83_EarlyCattle } from '../cards-display/C/C83_EarlyCattle'
import { C108_Layabout } from '../cards-display/C/C108_Layabout'
import { C118_WoodCollector } from '../cards-display/C/C118_WoodCollector'
import { C127_Lover } from '../cards-display/C/C127_Lover'
import { C128_WoodenHutExtender } from '../cards-display/C/C128_WoodenHutExtender'
import { C136_RanchProvost } from '../cards-display/C/C136_RanchProvost'
import { C139_BasketmakersWife } from '../cards-display/C/C139_BasketmakersWife'
import { C161_PotatoDigger } from '../cards-display/C/C161_PotatoDigger'
import { C165_GameCatcher } from '../cards-display/C/C165_GameCatcher'
import { C166_CattleWhisperer } from '../cards-display/C/C166_CattleWhisperer'
import { C169_FastMason } from '../cards-display/C/C169_FastMason'
import { C170_AmateurFencer } from '../cards-display/C/C170_AmateurFencer'
import { C171_YoungArtist } from '../cards-display/C/C171_YoungArtist'
import { C69_LandConsolidation } from '../cards-display/C/C69_LandConsolidation'
import { C70_LettucePatch } from '../cards-display/C/C70_LettucePatch'
import { C100_Butler } from '../cards-display/C/C100_Butler'
import { C134_CowPrince } from '../cards-display/C/C134_CowPrince'
import { C1_Overhaul } from '../cards-display/C/C1_Overhaul'
import { C10_BunkBeds } from '../cards-display/C/C10_BunkBeds'
import { C11_WildlifeReserve } from '../cards-display/C/C11_WildlifeReserve'
import { C12_CattleFarm } from '../cards-display/C/C12_CattleFarm'
import { C101_StallHolder } from '../cards-display/C/C101_StallHolder'
import { C104_Collector } from '../cards-display/C/C104_Collector'
import { C115_Sower } from '../cards-display/C/C115_Sower'
import { C120_AgriculturalLabourer } from '../cards-display/C/C120_AgriculturalLabourer'
import { C122_Bricklayer } from '../cards-display/C/C122_Bricklayer'
import { C13_WoodSlideHammer } from '../cards-display/C/C13_WoodSlideHammer'
import { C14_StrawThatchedRoof } from '../cards-display/C/C14_StrawThatchedRoof'
import { C130_OutskirtsDirector } from '../cards-display/C/C130_OutskirtsDirector'
import { C133_Soldier } from '../cards-display/C/C133_Soldier'
import { C135_Constable } from '../cards-display/C/C135_Constable'
import { C141_SheepProvider } from '../cards-display/C/C141_SheepProvider'
import { C144_ReedRoofRenovator } from '../cards-display/C/C144_ReedRoofRenovator'
import { C142_MarketCrier } from '../cards-display/C/C142_MarketCrier'
import { C143_StoneBuyer } from '../cards-display/C/C143_StoneBuyer'
import { C146_WorkshopAssistant } from '../cards-display/C/C146_WorkshopAssistant'
import { C148_MudWallower } from '../cards-display/C/C148_MudWallower'
import { C156_HoofCaregiver } from '../cards-display/C/C156_HoofCaregiver'
import { C162_ForestOwner } from '../cards-display/C/C162_ForestOwner'
import { C168_AnimalCatcher } from '../cards-display/C/C168_AnimalCatcher'
import { C17_NewlyPlowedField } from '../cards-display/C/C17_NewlyPlowedField'
import { C18_RollOverPlow } from '../cards-display/C/C18_RollOverPlow'
import { C19_SwingPlow } from '../cards-display/C/C19_SwingPlow'
import { C23_JobContract } from '../cards-display/C/C23_JobContract'
import { C24_BedintheGrainField } from '../cards-display/C/C24_BedintheGrainField'
import { C25_SteamMachine } from '../cards-display/C/C25_SteamMachine'
import { C27_Blueprint } from '../cards-display/C/C27_Blueprint'
import { C29_BeerTable } from '../cards-display/C/C29_BeerTable'
import { C31_WritingChamber } from '../cards-display/C/C31_WritingChamber'
import { C37_DwellingMound } from '../cards-display/C/C37_DwellingMound'
import { C51_FishingNet } from '../cards-display/C/C51_FishingNet'
import { C52_HuntsmansHat } from '../cards-display/C/C52_HuntsmansHat'
import { C57_Crudite } from '../cards-display/C/C57_Crudite'
import { C53_GypsysCrock } from '../cards-display/C/C53_GypsysCrock'
import { C60_SmallPottersOven } from '../cards-display/C/C60_SmallPottersOven'
import { C63_CraftBrewery } from '../cards-display/C/C63_CraftBrewery'
import { C64_CornSchnappsDistillery } from '../cards-display/C/C64_CornSchnappsDistillery'
import { C67_MineralFeeder } from '../cards-display/C/C67_MineralFeeder'
import { C71_Slurry } from '../cards-display/C/C71_Slurry'
import { C71_SlurrySpreader } from '../cards-display/C/C71_SlurrySpreader'
import { C75_Firewood } from '../cards-display/C/C75_Firewood'
import { C81_MaterialHub } from '../cards-display/C/C81_MaterialHub'
import { C8_PlantFertilizer } from '../cards-display/C/C8_PlantFertilizer'
import { C84_PerennialRye } from '../cards-display/C/C84_PerennialRye'
import { C85_DenBuilder } from '../cards-display/C/C85_DenBuilder'
import { C86_LivestockFeeder } from '../cards-display/C/C86_LivestockFeeder'
import { C87_Mason } from '../cards-display/C/C87_Mason'
import { C88_CarpentersApprentice } from '../cards-display/C/C88_CarpentersApprentice'
import { C89_StableMaster } from '../cards-display/C/C89_StableMaster'
import { C93_InnerDistrictsDirector } from '../cards-display/C/C93_InnerDistrictsDirector'
import { C94_StableCleaner } from '../cards-display/C/C94_StableCleaner'
import { C96_Merchant } from '../cards-display/C/C96_Merchant'
import { C98_CubeCutter } from '../cards-display/C/C98_CubeCutter'
import { C99_GardenDesigner } from '../cards-display/C/C99_GardenDesigner'
import { C2_Stable } from '../cards-display/C/C2_Stable'
import { C3_CarriageTrip } from '../cards-display/C/C3_CarriageTrip'
import { C4_WritingBoards } from '../cards-display/C/C4_WritingBoards'
import { C5_Remodeling } from '../cards-display/C/C5_Remodeling'
import { C6_StoneClearing } from '../cards-display/C/C6_StoneClearing'
import { C7_BladeShears } from '../cards-display/C/C7_BladeShears'
import { C9_AutomaticWaterTrough } from '../cards-display/C/C9_AutomaticWaterTrough'
import { C15_Trellis } from '../cards-display/C/C15_Trellis'
import { C20_MolePlow } from '../cards-display/C/C20_MolePlow'
import { C45_Stew } from '../cards-display/C/C45_Stew'
import { C76_WoodCart } from '../cards-display/C/C76_WoodCart'
import { C82_HardwareStore } from '../cards-display/C/C82_HardwareStore'
import { C90_FieldWatchman } from '../cards-display/C/C90_FieldWatchman'
import { C91_PlowHero } from '../cards-display/C/C91_PlowHero'
import { C126_Excavator } from '../cards-display/C/C126_Excavator'
import { C131_PrivateTeacher } from '../cards-display/C/C131_PrivateTeacher'
import { C138_AnimalFeeder } from '../cards-display/C/C138_AnimalFeeder'
import { C147_Cowherd } from '../cards-display/C/C147_Cowherd'
import { D30_ArtisanDistrict } from '../cards-display/D/D30_ArtisanDistrict'
import { D31_Storeroom } from '../cards-display/D/D31_Storeroom'
import { D35_FodderChamber } from '../cards-display/D/D35_FodderChamber'
import { D38_MilkingStool } from '../cards-display/D/D38_MilkingStool'
import { D40_Cesspit } from '../cards-display/D/D40_Cesspit'
import { D41_HorseDrawnBoat } from '../cards-display/D/D41_HorseDrawnBoat'
import { D43_Hutch } from '../cards-display/D/D43_Hutch'
import { D44_ForestWell } from '../cards-display/D/D44_ForestWell'
import { D45_SheepWell } from '../cards-display/D/D45_SheepWell'
import { D46_PelletPress } from '../cards-display/D/D46_PelletPress'
import { D47_Churchyard } from '../cards-display/D/D47_Churchyard'
import { D57_WholesaleMarket } from '../cards-display/D/D57_WholesaleMarket'
import { D60_LargePottery } from '../cards-display/D/D60_LargePottery'
import { D62_BeerTap } from '../cards-display/D/D62_BeerTap'
import { D67_ReapHook } from '../cards-display/D/D67_ReapHook'
import { D69_SmallGreenhouse } from '../cards-display/D/D69_SmallGreenhouse'
import { D78_ReedPond } from '../cards-display/D/D78_ReedPond'
import { D81_RoofLadder } from '../cards-display/D/D81_RoofLadder'
import { D82_HuntingTrophy } from '../cards-display/D/D82_HuntingTrophy'
import { D91_Plowman } from '../cards-display/D/D91_Plowman'
import { D99_EarthenwarePotter } from '../cards-display/D/D99_EarthenwarePotter'
import { D113_FoodMerchant } from '../cards-display/D/D113_FoodMerchant'
import { D114_SeedTrader } from '../cards-display/D/D114_SeedTrader'
import { D118_Bonehead } from '../cards-display/D/D118_Bonehead'
import { D119_WoodBarterer } from '../cards-display/D/D119_WoodBarterer'
import { D15_ClaySupports } from '../cards-display/D/D15_ClaySupports'
import { D121_ClayPlasterer } from '../cards-display/D/D121_ClayPlasterer'
import { D120_ClayDeliveryman } from '../cards-display/D/D120_ClayDeliveryman'
import { D145_RoofExaminer } from '../cards-display/D/D145_RoofExaminer'
import { D152_Patron } from '../cards-display/D/D152_Patron'
import { D154_ChimneySweep } from '../cards-display/D/D154_ChimneySweep'
import { D162_ClayFirer } from '../cards-display/D/D162_ClayFirer'
import { D29_MuckRake } from '../cards-display/D/D29_MuckRake'
import { D33_SummerHouse } from '../cards-display/D/D33_SummerHouse'
import { D34_LuxuriousHostel } from '../cards-display/D/D34_LuxuriousHostel'
import { D135_GardeningHeadOfficial } from '../cards-display/D/D135_GardeningHeadOfficial'
import { D136_AnimalActivist } from '../cards-display/D/D136_AnimalActivist'
import { D10_StorksNest } from '../cards-display/D/D10_StorksNest'
import { D100_LordoftheManor } from '../cards-display/D/D100_LordoftheManor'
import { D101_SugarBaker } from '../cards-display/D/D101_SugarBaker'
import { D102_SampleStableMaker } from '../cards-display/D/D102_SampleStableMaker'
import { D103_CanalBoatman } from '../cards-display/D/D103_CanalBoatman'
import { D107_Bellfounder } from '../cards-display/D/D107_Bellfounder'
import { D115_FodderPlanter } from '../cards-display/D/D115_FodderPlanter'
import { D116_TreeInspector } from '../cards-display/D/D116_TreeInspector'
import { D117_WoodExpert } from '../cards-display/D/D117_WoodExpert'
import { D122_ClayCarrier } from '../cards-display/D/D122_ClayCarrier'
import { D124_Emissary } from '../cards-display/D/D124_Emissary'
import { D126_FieldCultivator } from '../cards-display/D/D126_FieldCultivator'
import { D127_HardworkingMan } from '../cards-display/D/D127_HardworkingMan'
import { D131_CraftsmanshipPromoter } from '../cards-display/D/D131_CraftsmanshipPromoter'
import { D132_HideFarmer } from '../cards-display/D/D132_HideFarmer'
import { D134_OysterEater } from '../cards-display/D/D134_OysterEater'
import { D137_TradeTeacher } from '../cards-display/D/D137_TradeTeacher'
import { D139_Chairman } from '../cards-display/D/D139_Chairman'
import { D13_Trowel } from '../cards-display/D/D13_Trowel'
import { D14_HammerCrusher } from '../cards-display/D/D14_HammerCrusher'
import { D150_GodlySpouse } from '../cards-display/D/D150_GodlySpouse'
import { D157_PartyOrganizer } from '../cards-display/D/D157_PartyOrganizer'
import { D158_BeanCounter } from '../cards-display/D/D158_BeanCounter'
import { D161_CabbageBuyer } from '../cards-display/D/D161_CabbageBuyer'
import { D164_PetGrower } from '../cards-display/D/D164_PetGrower'
import { D16_WoodenWheyBucket } from '../cards-display/D/D16_WoodenWheyBucket'
import { D28_WritingDesk } from '../cards-display/D/D28_WritingDesk'
import { D68_SmallBasket } from '../cards-display/D/D68_SmallBasket'
import { D83_Pigswill } from '../cards-display/D/D83_Pigswill'
import { D90_PlowMaker } from '../cards-display/D/D90_PlowMaker'
import { D105_Sculptor } from '../cards-display/D/D105_Sculptor'
import { D110_FishFarmer } from '../cards-display/D/D110_FishFarmer'
import { D125_ForestTrader } from '../cards-display/D/D125_ForestTrader'
import { D147_TrapBuilder } from '../cards-display/D/D147_TrapBuilder'
import { D148_DomesticianExpert } from '../cards-display/D/D148_DomesticianExpert'
import { D151_SpinDoctor } from '../cards-display/D/D151_SpinDoctor'
import { D165_PigStalker } from '../cards-display/D/D165_PigStalker'
import { D167_PureBreeder } from '../cards-display/D/D167_PureBreeder'
import { D20_TurnwrestPlow } from '../cards-display/D/D20_TurnwrestPlow'
import { D22_WorkPermit } from '../cards-display/D/D22_WorkPermit'
import { D23_PioneeringSpirit } from '../cards-display/D/D23_PioneeringSpirit'
import { D26_CarpentersYard } from '../cards-display/D/D26_CarpentersYard'
import { D27_Retraining } from '../cards-display/D/D27_Retraining'
import { D36_BreedRegistry } from '../cards-display/D/D36_BreedRegistry'
import { D49_Bookshelf } from '../cards-display/D/D49_Bookshelf'
import { D51_Archway } from '../cards-display/D/D51_Archway'
import { D53_TeaHouse } from '../cards-display/D/D53_TeaHouse'
import { D59_EarthOven } from '../cards-display/D/D59_EarthOven'
import { D86_SheepAgent } from '../cards-display/D/D86_SheepAgent'
import { D106_WhiskyDistiller } from '../cards-display/D/D106_WhiskyDistiller'
import { D138_PetLover } from '../cards-display/D/D138_PetLover'
import { D55_NewMarket } from '../cards-display/D/D55_NewMarket'
import { D66_PotterCeramics } from '../cards-display/D/D66_PotterCeramics'
import { D70_StrawManure } from '../cards-display/D/D70_StrawManure'
import { D71_Changeover } from '../cards-display/D/D71_Changeover'
import { D72_StableManure } from '../cards-display/D/D72_StableManure'
import { D74_RoyalWood } from '../cards-display/D/D74_RoyalWood'
import { D75_WoodField } from '../cards-display/D/D75_WoodField'
import { D84_FeedPellets } from '../cards-display/D/D84_FeedPellets'
import { D85_Reader } from '../cards-display/D/D85_Reader'
import { D87_MasterBuilder } from '../cards-display/D/D87_MasterBuilder'
import { D88_Millwright } from '../cards-display/D/D88_Millwright'
import { D92_ChildOmbudsman } from '../cards-display/D/D92_ChildOmbudsman'
import { D93_SheepInspector } from '../cards-display/D/D93_SheepInspector'
import { D94_HenpeckedHusband } from '../cards-display/D/D94_HenpeckedHusband'
import { D98_Transactor } from '../cards-display/D/D98_Transactor'
import { D1_ZigzagHarrow } from '../cards-display/D/D1_ZigzagHarrow'
import { D2_DwellingPlan } from '../cards-display/D/D2_DwellingPlan'
import { D3_Furrows } from '../cards-display/D/D3_Furrows'
import { D4_CrossCutWood } from '../cards-display/D/D4_CrossCutWood'
import { D5_FieldClay } from '../cards-display/D/D5_FieldClay'
import { D6_PetrifiedWood } from '../cards-display/D/D6_PetrifiedWood'
import { D7_Trident } from '../cards-display/D/D7_Trident'
import { D8_FernSeeds } from '../cards-display/D/D8_FernSeeds'
import { D9_GameTrade } from '../cards-display/D/D9_GameTrade'
import { D11_LawnFertilizer } from '../cards-display/D/D11_LawnFertilizer'
import { D12_MilkingPlace } from '../cards-display/D/D12_MilkingPlace'
import { D25_WitchesDanceFloor } from '../cards-display/D/D25_WitchesDanceFloor'
import { D37_Sculpture } from '../cards-display/D/D37_Sculpture'
import { D108_StoneCarver } from '../cards-display/D/D108_StoneCarver'
import { D155_Ebonist } from '../cards-display/D/D155_Ebonist'
import { D156_RetailDealer } from '../cards-display/D/D156_RetailDealer'
import { D159_ReedSeller } from '../cards-display/D/D159_ReedSeller'
import { D169_Plowsmith } from '../cards-display/D/D169_Plowsmith'
import { D170_FoldBuilder } from '../cards-display/D/D170_FoldBuilder'
import { D171_SeniorTeacher } from '../cards-display/D/D171_SeniorTeacher'
import { D172_PutcherMaker } from '../cards-display/D/D172_PutcherMaker'
import { D173_TownClerk } from '../cards-display/D/D173_TownClerk'
import { D174_LoessGardener } from '../cards-display/D/D174_LoessGardener'
import { D175_Countryman } from '../cards-display/D/D175_Countryman'
import { D176_Woodshacker } from '../cards-display/D/D176_Woodshacker'
import { D177_Graduate } from '../cards-display/D/D177_Graduate'
import { D178_SubstituteTeacher } from '../cards-display/D/D178_SubstituteTeacher'
import { D179_Bullcatcher } from '../cards-display/D/D179_Bullcatcher'
import { D180_PartTimeWorker } from '../cards-display/D/D180_PartTimeWorker'
import { C32_AbortOriel } from '../cards-display/C/C32_AbortOriel'
import { C105_BasketCarrier } from '../cards-display/C/C105_BasketCarrier'
import { C109_SchnappsDistiller } from '../cards-display/C/C109_SchnappsDistiller'
import { C172_FieldCounter } from '../cards-display/C/C172_FieldCounter'
import { C173_TopOuter } from '../cards-display/C/C173_TopOuter'
import { C174_StoneCustodian } from '../cards-display/C/C174_StoneCustodian'
import { C175_VillageTeacher } from '../cards-display/C/C175_VillageTeacher'
import { C176_Cleanacre } from '../cards-display/C/C176_Cleanacre'
import { C177_MountainHiker } from '../cards-display/C/C177_MountainHiker'
import { C178_OnSiteReverend } from '../cards-display/C/C178_OnSiteReverend'
import { C179_BovinePioneer } from '../cards-display/C/C179_BovinePioneer'
import { C180_Trapper } from '../cards-display/C/C180_Trapper'
import { E135_Pickler } from '../cards-display/E/E135_Pickler'
import { E136_AnimalHusbandryWorker } from '../cards-display/E/E136_AnimalHusbandryWorker'
import { E154_Margrave } from '../cards-display/E/E154_Margrave'
import { E10_StrawHat } from '../cards-display/E/E10_StrawHat'
import { E11_PettingZoo } from '../cards-display/E/E11_PettingZoo'
import { E21_SheepRug } from '../cards-display/E/E21_SheepRug'
import { E103_Wolf } from '../cards-display/E/E103_Wolf'
import { E109_BraidMaker } from '../cards-display/E/E109_BraidMaker'
import { E110_Dentist } from '../cards-display/E/E110_Dentist'
import { E112_GrainThief } from '../cards-display/E/E112_GrainThief'
import { E123_ResourceHoarder } from '../cards-display/E/E123_ResourceHoarder'
import { E124_MayorCandidate } from '../cards-display/E/E124_MayorCandidate'
import { E130_Overachiever } from '../cards-display/E/E130_Overachiever'
import { E132_VeggieLover } from '../cards-display/E/E132_VeggieLover'
import { E133_ChampionBreeder } from '../cards-display/E/E133_ChampionBreeder'
import { E134_Omnifarmer } from '../cards-display/E/E134_Omnifarmer'
import { E148_Lazybones } from '../cards-display/E/E148_Lazybones'
import { E150_RockBeater } from '../cards-display/E/E150_RockBeater'
import { E151_DeliveryNurse } from '../cards-display/E/E151_DeliveryNurse'
import { E12_AnimalBedding } from '../cards-display/E/E12_AnimalBedding'
import { E13_StoneHouseReconstruction } from '../cards-display/E/E13_StoneHouseReconstruction'
import { E14_WoodSaw } from '../cards-display/E/E14_WoodSaw'
import { E24_Ambition } from '../cards-display/E/E24_Ambition'
import { E129_Imitator } from '../cards-display/E/E129_Imitator'
import { E153_StoneSculptor } from '../cards-display/E/E153_StoneSculptor'
import { E155_Visionary } from '../cards-display/E/E155_Visionary'
import { E159_OldMiser } from '../cards-display/E/E159_OldMiser'
import { E16_BriarHedge } from '../cards-display/E/E16_BriarHedge'
import { E161_ElderBaker } from '../cards-display/E/E161_ElderBaker'
import { E162_Entrepreneur } from '../cards-display/E/E162_Entrepreneur'
import { E166_Roastmaster } from '../cards-display/E/E166_Roastmaster'
import { E17_SkimmerPlow } from '../cards-display/E/E17_SkimmerPlow'
import { E19_OxGoad } from '../cards-display/E/E19_OxGoad'
import { E55_StoneWeir } from '../cards-display/E/E55_StoneWeir'
import { E58_LunchtimeBeer } from '../cards-display/E/E58_LunchtimeBeer'
import { E59_CombandCutter } from '../cards-display/E/E59_CombandCutter'
import { E60_WorkingGloves } from '../cards-display/E/E60_WorkingGloves'
import { E67_GrainBag } from '../cards-display/E/E67_GrainBag'
import { E68_CherryOrchard } from '../cards-display/E/E68_CherryOrchard'
import { E115_SeedServant } from '../cards-display/E/E115_SeedServant'
import { E121_HillCultivator } from '../cards-display/E/E121_HillCultivator'
import { E131_MarketMaster } from '../cards-display/E/E131_MarketMaster'
import { E137_FlaxFarmer } from '../cards-display/E/E137_FlaxFarmer'
import { E140_Carter } from '../cards-display/E/E140_Carter'
import { E141_VegetableVendor } from '../cards-display/E/E141_VegetableVendor'
import { E167_DairyCrier } from '../cards-display/E/E167_DairyCrier'
import { E22_GuestRoom } from '../cards-display/E/E22_GuestRoom'
import { E27_PiggyBank } from '../cards-display/E/E27_PiggyBank'
import { E30_ChildsToy } from '../cards-display/E/E30_ChildsToy'
import { E33_BeaverColony } from '../cards-display/E/E33_BeaverColony'
import { E36_HerbalGarden } from '../cards-display/E/E36_HerbalGarden'
import { E38_RodCollection } from '../cards-display/E/E38_RodCollection'
import { E40_BeeStatue } from '../cards-display/E/E40_BeeStatue'
import { E4_Thunderbolt } from '../cards-display/E/E4_Thunderbolt'
import { E5_NightLoot } from '../cards-display/E/E5_NightLoot'
import { E51_WhaleOil } from '../cards-display/E/E51_WhaleOil'
import { E52_Cubbyhole } from '../cards-display/E/E52_Cubbyhole'
import { E53_BoarSpear } from '../cards-display/E/E53_BoarSpear'
import { E62_SourDough } from '../cards-display/E/E62_SourDough'
import { E63_IronOven } from '../cards-display/E/E63_IronOven'
import { E64_SimpleOven } from '../cards-display/E/E64_SimpleOven'
import { E69_MelonPatch } from '../cards-display/E/E69_MelonPatch'
import { E70_CropRotationField } from '../cards-display/E/E70_CropRotationField'
import { E71_CowPatty } from '../cards-display/E/E71_CowPatty'
import { E72_ArtichokeField } from '../cards-display/E/E72_ArtichokeField'
import { E73_Scythe } from '../cards-display/E/E73_Scythe'
import { E74_AshTrees } from '../cards-display/E/E74_AshTrees'
import { E75_StoneAxe } from '../cards-display/E/E75_StoneAxe'
import { E76_LumberPile } from '../cards-display/E/E76_LumberPile'
import { E78_SleightofHand } from '../cards-display/E/E78_SleightofHand'
import { E80_RockGarden } from '../cards-display/E/E80_RockGarden'
import { E81_AlchemistsLab } from '../cards-display/E/E81_AlchemistsLab'
import { E82_Profiteering } from '../cards-display/E/E82_Profiteering'
import { E83_ShepherdsWhistle } from '../cards-display/E/E83_ShepherdsWhistle'
import { E84_DollysMother } from '../cards-display/E/E84_DollysMother'
import { E85_MasterTanner } from '../cards-display/E/E85_MasterTanner'
import { E86_PenBuilder } from '../cards-display/E/E86_PenBuilder'
import { E87_MasterRenovator } from '../cards-display/E/E87_MasterRenovator'
import { E90_DungCollector } from '../cards-display/E/E90_DungCollector'
import { E91_PlowBuilder } from '../cards-display/E/E91_PlowBuilder'
import { E92_FieldDoctor } from '../cards-display/E/E92_FieldDoctor'
import { E93_Motivator } from '../cards-display/E/E93_Motivator'
import { E95_Miller } from '../cards-display/E/E95_Miller'
import { E1_PoleBarns } from '../cards-display/E/E1_PoleBarns'
import { E2_RenovationMaterials } from '../cards-display/E/E2_RenovationMaterials'
import { E3_TeaTime } from '../cards-display/E/E3_TeaTime'
import { E6_Recount } from '../cards-display/E/E6_Recount'
import { E7_Pumpernickel } from '../cards-display/E/E7_Pumpernickel'
import { E8_FarmersMarket } from '../cards-display/E/E8_FarmersMarket'
import { E9_BarteringHut } from '../cards-display/E/E9_BarteringHut'
import { E25_BumperCrop } from '../cards-display/E/E25_BumperCrop'
import { E28_Bookmark } from '../cards-display/E/E28_Bookmark'
import { E29_Heirloom } from '../cards-display/E/E29_Heirloom'
import { E32_Nave } from '../cards-display/E/E32_Nave'
import { E34_LandRegister } from '../cards-display/E/E34_LandRegister'
import { E35_Misanthropy } from '../cards-display/E/E35_Misanthropy'
import { E37_OxSkull } from '../cards-display/E/E37_OxSkull'
import { E41_MuddyWaters } from '../cards-display/E/E41_MuddyWaters'
import { E42_WaterGully } from '../cards-display/E/E42_WaterGully'
import { E43_BarnCats } from '../cards-display/E/E43_BarnCats'
import { E44_FodderBeets } from '../cards-display/E/E44_FodderBeets'
import { E45_FruitLadder } from '../cards-display/E/E45_FruitLadder'
import { E46_WaterlilyPond } from '../cards-display/E/E46_WaterlilyPond'
import { E56_RomanPot } from '../cards-display/E/E56_RomanPot'
import { E57_CheeseFondue } from '../cards-display/E/E57_CheeseFondue'
import { E65_Almsbag } from '../cards-display/E/E65_Almsbag'
import { E94_Prophet } from '../cards-display/E/E94_Prophet'
import { E96_Elder } from '../cards-display/E/E96_Elder'
import { E97_Beneficiary } from '../cards-display/E/E97_Beneficiary'
import { E98_Prodigy } from '../cards-display/E/E98_Prodigy'
import { E101_Blighter } from '../cards-display/E/E101_Blighter'
import { E104_SpiceTrader } from '../cards-display/E/E104_SpiceTrader'
import { E106_EmergencySeller } from '../cards-display/E/E106_EmergencySeller'
import { E119_LandHeir } from '../cards-display/E/E119_LandHeir'
import { E120_ScrapCollector } from '../cards-display/E/E120_ScrapCollector'
import { E127_DiligentFarmer } from '../cards-display/E/E127_DiligentFarmer'
import { E128_Saddler } from '../cards-display/E/E128_Saddler'
import { E138_LivestockExpert } from '../cards-display/E/E138_LivestockExpert'
import { E139_BunnyBreeder } from '../cards-display/E/E139_BunnyBreeder'
import { E145_Parvenu } from '../cards-display/E/E145_Parvenu'
// Batch: after-action listener cards
import { C36_ClayDeposit } from '../cards-display/C/C36_ClayDeposit'
import { C43_FarmBuilding } from '../cards-display/C/C43_FarmBuilding'
import { C58_Woodcraft } from '../cards-display/C/C58_Woodcraft'
import { C61_BeerStein } from '../cards-display/C/C61_BeerStein'
import { C68_Bookcase } from '../cards-display/C/C68_Bookcase'
import { C73_SeaweedFertilizer } from '../cards-display/C/C73_SeaweedFertilizer'
import { C21_HeartofStone } from '../cards-display/C/C21_HeartofStone'
import { C102_TreeGuard } from '../cards-display/C/C102_TreeGuard'
import { C114_SoilScientist } from '../cards-display/C/C114_SoilScientist'
import { D19_PulverizerPlow } from '../cards-display/D/D19_PulverizerPlow'
import { D42_EducationBonus } from '../cards-display/D/D42_EducationBonus'
import { D58_Gritter } from '../cards-display/D/D58_Gritter'
import { D73_SupplyBoat } from '../cards-display/D/D73_SupplyBoat'
import { D80_BrickHammer } from '../cards-display/D/D80_BrickHammer'
import { D89_Stablehand } from '../cards-display/D/D89_Stablehand'
import { D104_Cultivator } from '../cards-display/D/D104_Cultivator'
import { D111_InteriorDecorator } from '../cards-display/D/D111_InteriorDecorator'
import { D123_RenovationPreparer } from '../cards-display/D/D123_RenovationPreparer'
import { D140_Loudmouth } from '../cards-display/D/D140_Loudmouth'
import { D168_Stockman } from '../cards-display/D/D168_Stockman'
import { E15_NailBasket } from '../cards-display/E/E15_NailBasket'
import { E18_SeedAlmanac } from '../cards-display/E/E18_SeedAlmanac'
import { E31_Upholstery } from '../cards-display/E/E31_Upholstery'
import { E50_WildGreens } from '../cards-display/E/E50_WildGreens'
import { E54_Contraband } from '../cards-display/E/E54_Contraband'
import { E79_FieldSpade } from '../cards-display/E/E79_FieldSpade'
import { E89_Stallwright } from '../cards-display/E/E89_Stallwright'
import { E108_BlackberryFarmer } from '../cards-display/E/E108_BlackberryFarmer'
import { E113_Godmother } from '../cards-display/E/E113_Godmother'
import { E114_ShedBuilder } from '../cards-display/E/E114_ShedBuilder'
import { E122_Cottar } from '../cards-display/E/E122_Cottar'
import { E146_Reseller } from '../cards-display/E/E146_Reseller'
import { E157_Usufructuary } from '../cards-display/E/E157_Usufructuary'
import { E163_Patroness } from '../cards-display/E/E163_Patroness'
import { E164_MountainPlowman } from '../cards-display/E/E164_MountainPlowman'
// Harvest listener cards (batch)
import { A61_WinnowingFan } from '../cards-display/A/A61_WinnowingFan'
import { A62_BeerKeg } from '../cards-display/A/A62_BeerKeg'
import { A104_WoodHarvester } from '../cards-display/A/A104_WoodHarvester'
import { A118_Treegardener } from '../cards-display/A/A118_Treegardener'
import { A145_Ropemaker } from '../cards-display/A/A145_Ropemaker'
import { B50_ButterChurn } from '../cards-display/B/B50_ButterChurn'
import { B53_SculptureCourse } from '../cards-display/B/B53_SculptureCourse'
import { B82_ValueAssets } from '../cards-display/B/B82_ValueAssets'
import { C34_ElephantgrassPlant } from '../cards-display/C/C34_ElephantgrassPlant'
import { C41_FarmStore } from '../cards-display/C/C41_FarmStore'
import { C54_MarketBooth } from '../cards-display/C/C54_MarketBooth'
import { C55_Studio } from '../cards-display/C/C55_Studio'
import { C66_EternalRyeCultivation } from '../cards-display/C/C66_EternalRyeCultivation'
import { C92_AutumnMother } from '../cards-display/C/C92_AutumnMother'
import { C110_HomeBrewer } from '../cards-display/C/C110_HomeBrewer'
import { C124_StoneImporter } from '../cards-display/C/C124_StoneImporter'
import { D32_WoodRake } from '../cards-display/D/D32_WoodRake'
import { D61_BaleofStraw } from '../cards-display/D/D61_BaleofStraw'
import { D64_BakingCourse } from '../cards-display/D/D64_BakingCourse'
import { D76_SocialBenefits } from '../cards-display/D/D76_SocialBenefits'
import { D79_CarrotMuseum } from '../cards-display/D/D79_CarrotMuseum'
import { D133_BeerTentOperator } from '../cards-display/D/D133_BeerTentOperator'
import { D153_WealthyMan } from '../cards-display/D/D153_WealthyMan'
import { E39_Paintbrush } from '../cards-display/E/E39_Paintbrush'
import { E47_SyrupTap } from '../cards-display/E/E47_SyrupTap'
import { E48_TownHall } from '../cards-display/E/E48_TownHall'
import { E61_RaisedBed } from '../cards-display/E/E61_RaisedBed'
import { E99_UncaringParents } from '../cards-display/E/E99_UncaringParents'
import { E107_LandSurveyor } from '../cards-display/E/E107_LandSurveyor'
import { E117_PipeSmoker } from '../cards-display/E/E117_PipeSmoker'
import { E142_Smuggler } from '../cards-display/E/E142_Smuggler'
import { E147_AnimalDriver } from '../cards-display/E/E147_AnimalDriver'
import { E149_MidnightFencer } from '../cards-display/E/E149_MidnightFencer'
// Round/work phase trigger cards (batch 3)
import { A35_SwimmingClass } from '../cards-display/A/A35_SwimmingClass'
import { A49_NestSite } from '../cards-display/A/A49_NestSite'
import { A76_Cob } from '../cards-display/A/A76_Cob'
import { A90_PlowDriver } from '../cards-display/A/A90_PlowDriver'
import { A100_Curator } from '../cards-display/A/A100_Curator'
import { A141_TurnipFarmer } from '../cards-display/A/A141_TurnipFarmer'
import { A151_Minstrel } from '../cards-display/A/A151_Minstrel'
import { A152_NightSchoolStudent } from '../cards-display/A/A152_NightSchoolStudent'
import { A153_PigOwner } from '../cards-display/A/A153_PigOwner'
import { A157_Bohemian } from '../cards-display/A/A157_Bohemian'
import { B57_Scullery } from '../cards-display/B/B57_Scullery'
import { B97_Scholar } from '../cards-display/B/B97_Scholar'
import { B106_MoralCrusader } from '../cards-display/B/B106_MoralCrusader'
import { B114_Childless } from '../cards-display/B/B114_Childless'
import { B118_SmallscaleFarmer } from '../cards-display/B/B118_SmallscaleFarmer'
import { B133_VillagePeasant } from '../cards-display/B/B133_VillagePeasant'
import { B135_NutritionExpert } from '../cards-display/B/B135_NutritionExpert'
import { B137_Wholesaler } from '../cards-display/B/B137_Wholesaler'
import { B139_ForestScientist } from '../cards-display/B/B139_ForestScientist'
import { B140_FarmyardWorker } from '../cards-display/B/B140_FarmyardWorker'
import { B158_DistrictManager } from '../cards-display/B/B158_DistrictManager'
import { C97_SeedResearcher } from '../cards-display/C/C97_SeedResearcher'
import { C103_GreenGrocer } from '../cards-display/C/C103_GreenGrocer'
import { C111_SmallAnimalBreeder } from '../cards-display/C/C111_SmallAnimalBreeder'
import { C123_Freemason } from '../cards-display/C/C123_Freemason'
import { C125_Nightworker } from '../cards-display/C/C125_Nightworker'
import { C157_ResourceAnalyzer } from '../cards-display/C/C157_ResourceAnalyzer'
import { C159_FishermansFriend } from '../cards-display/C/C159_FishermansFriend'
import { D48_CivicFacade } from '../cards-display/D/D48_CivicFacade'
import { D52_RollingPin } from '../cards-display/D/D52_RollingPin'
import { D56_FatstockStretcher } from '../cards-display/D/D56_FatstockStretcher'
import { D54_TroutPool } from '../cards-display/D/D54_TroutPool'
import { D129_LumberVirtuoso } from '../cards-display/D/D129_LumberVirtuoso'
import { D130_RecreationalCarpenter } from '../cards-display/D/D130_RecreationalCarpenter'
import { D142_PotatoPlanter } from '../cards-display/D/D142_PotatoPlanter'
import { E20_IronHoe } from '../cards-display/E/E20_IronHoe'
import { E23_Apiary } from '../cards-display/E/E23_Apiary'
import { E26_Sundial } from '../cards-display/E/E26_Sundial'
import { E88_MasterFencer } from '../cards-display/E/E88_MasterFencer'
import { E100_MuseumCaretaker } from '../cards-display/E/E100_MuseumCaretaker'
import { E102_Acquirer } from '../cards-display/E/E102_Acquirer'
import { E126_TaxCollector } from '../cards-display/E/E126_TaxCollector'
import { E152_BargainHunter } from '../cards-display/E/E152_BargainHunter'
import { E158_StoneCustodian } from '../cards-display/E/E158_StoneCustodian'
import { E168_AnimalTamersApprentice } from '../cards-display/E/E168_AnimalTamersApprentice'
import { A50_MilkJug } from '../cards-display/A/A50_MilkJug'
import { A77_Hod } from '../cards-display/A/A77_Hod'
import { A80_StoneTongs } from '../cards-display/A/A80_StoneTongs'
import { A116_WoodCutter } from '../cards-display/A/A116_WoodCutter'
import { A121_ClayPuncher } from '../cards-display/A/A121_ClayPuncher'
import { B54_Tumbrel } from '../cards-display/B/B54_Tumbrel'
import { B58_CrackWeeder } from '../cards-display/B/B58_CrackWeeder'
import { B79_Corf } from '../cards-display/B/B79_Corf'
import { B110_Pavior } from '../cards-display/B/B110_Pavior'
import { B116_Shoreforester } from '../cards-display/B/B116_Shoreforester'
import { B117_Informant } from '../cards-display/B/B117_Informant'
import { B160_PubOwner } from '../cards-display/B/B160_PubOwner'
import { C106_PotatoHarvester } from '../cards-display/C/C106_PotatoHarvester'
import { C121_ClayKneader } from '../cards-display/C/C121_ClayKneader'
import { C164_GermanHeathKeeper } from '../cards-display/C/C164_GermanHeathKeeper'
import { D65_GrainSieve } from '../cards-display/D/D65_GrainSieve'
import { D109_SowingMaster } from '../cards-display/D/D109_SowingMaster'
import { D141_SeedSeller } from '../cards-display/D/D141_SeedSeller'
import { D143_TreeCutter } from '../cards-display/D/D143_TreeCutter'
import { D146_Porter } from '../cards-display/D/D146_Porter'
import { E66_BarnShed } from '../cards-display/E/E66_BarnShed'
import { A120_ClayHutBuilder } from '../cards-display/A/A120_ClayHutBuilder'
import { A139_HollowWarden } from '../cards-display/A/A139_HollowWarden'
import { A142_Cordmaker } from '../cards-display/A/A142_Cordmaker'
import { B25_BreadPaddle } from '../cards-display/B/B25_BreadPaddle'
import { B49_Scales } from '../cards-display/B/B49_Scales'
import { B89_Groom } from '../cards-display/B/B89_Groom'
import { B107_Manservant } from '../cards-display/B/B107_Manservant'
import { B108_OvenFiringBoy } from '../cards-display/B/B108_OvenFiringBoy'
import { B162_ForestClearer } from '../cards-display/B/B162_ForestClearer'
import { B168_PastureMaster } from '../cards-display/B/B168_PastureMaster'
import { C107_Baker } from '../cards-display/C/C107_Baker'
import { C113_WinterCaretaker } from '../cards-display/C/C113_WinterCaretaker'
import { C145_ForestReviewer } from '../cards-display/C/C145_ForestReviewer'
import { C163_MaterialDeliveryman } from '../cards-display/C/C163_MaterialDeliveryman'
import { D39_TruffleSlicer } from '../cards-display/D/D39_TruffleSlicer'
import { D63_Lynchet } from '../cards-display/D/D63_Lynchet'
import { D97_BeggingStudent } from '../cards-display/D/D97_BeggingStudent'
import { D166_StableMilker } from '../cards-display/D/D166_StableMilker'
import { E111_Recluse } from '../cards-display/E/E111_Recluse'
import { E116_FirCutter } from '../cards-display/E/E116_FirCutter'
import { E165_MasterHuntsman } from '../cards-display/E/E165_MasterHuntsman'
import { A54_Credit } from '../cards-display/A/A54_Credit'
import { A96_TaskArtisan } from '../cards-display/A/A96_TaskArtisan'
import { A129_Swagman } from '../cards-display/A/A129_Swagman'
import { A130_MummysBoy } from '../cards-display/A/A130_MummysBoy'
import { A167_BreederBuyer } from '../cards-display/A/A167_BreederBuyer'
import { B16_MiningHammer } from '../cards-display/B/B16_MiningHammer'
import { B29_CookeryLesson } from '../cards-display/B/B29_CookeryLesson'
import { C42_RavenousHunger } from '../cards-display/C/C42_RavenousHunger'
import { C80_RockyTerrain } from '../cards-display/C/C80_RockyTerrain'
import { C116_FurnitureMaker } from '../cards-display/C/C116_FurnitureMaker'
import { C119_SkillfulRenovator } from '../cards-display/C/C119_SkillfulRenovator'
import { C132_TimberShingleMaker } from '../cards-display/C/C132_TimberShingleMaker'
import { C155_FoodDistributor } from '../cards-display/C/C155_FoodDistributor'
import { D96_Furnisher } from '../cards-display/D/D96_Furnisher'
import { D112_YoungFarmer } from '../cards-display/D/D112_YoungFarmer'
import { D144_WaterWorker } from '../cards-display/D/D144_WaterWorker'
import { E77_Mattock } from '../cards-display/E/E77_Mattock'
import { E118_KindlingGatherer } from '../cards-display/E/E118_KindlingGatherer'
import { E143_Hewer } from '../cards-display/E/E143_Hewer'
import { A154_Paymaster } from '../cards-display/A/A154_Paymaster'
import { A158_CulinaryArtist } from '../cards-display/A/A158_CulinaryArtist'
import { A159_JoineroftheSea } from '../cards-display/A/A159_JoineroftheSea'
import { A160_Lutenist } from '../cards-display/A/A160_Lutenist'
import { B138_ForestGuardian } from '../cards-display/B/B138_ForestGuardian'
import { B143_ClayWarden } from '../cards-display/B/B143_ClayWarden'
import { B159_LieutenantGeneral } from '../cards-display/B/B159_LieutenantGeneral'
import { B163_Pastor } from '../cards-display/B/B163_Pastor'
import { C137_CharcoalBurner } from '../cards-display/C/C137_CharcoalBurner'
import { C149_ResourceRecycler } from '../cards-display/C/C149_ResourceRecycler'
import { C151_SowingDirector } from '../cards-display/C/C151_SowingDirector'
import { C152_Puppeteer } from '../cards-display/C/C152_Puppeteer'
import { C153_PatternMaker } from '../cards-display/C/C153_PatternMaker'
import { C167_CattleBuyer } from '../cards-display/C/C167_CattleBuyer'
import { D77_RecycledBrick } from '../cards-display/D/D77_RecycledBrick'
import { D128_BuildingTycoon } from '../cards-display/D/D128_BuildingTycoon'
import { D149_CasualWorker } from '../cards-display/D/D149_CasualWorker'
import { D160_Midwife } from '../cards-display/D/D160_Midwife'
import { D163_JourneymanBricklayer } from '../cards-display/D/D163_JourneymanBricklayer'
import { E49_Twibil } from '../cards-display/E/E49_Twibil'
import { E144_WaresSalesman } from '../cards-display/E/E144_WaresSalesman'
import { E156_ClaypitOwner } from '../cards-display/E/E156_ClaypitOwner'
import { E160_KelpGatherer } from '../cards-display/E/E160_KelpGatherer'
import { A20_DoubleTurnPlow } from '../cards-display/A/A20_DoubleTurnPlow'
import { B26_AgrarianFences } from '../cards-display/B/B26_AgrarianFences'
import { B36_Bottles } from '../cards-display/B/B36_Bottles'
import { B68_Beanfield } from '../cards-display/B/B68_Beanfield'
import { C112_Thresher } from '../cards-display/C/C112_Thresher'
import { C129_SecondSpouse } from '../cards-display/C/C129_SecondSpouse'
import { C158_ForestCampaigner } from '../cards-display/C/C158_ForestCampaigner'
import { D17_DrillHarrow } from '../cards-display/D/D17_DrillHarrow'
import { D18_SteamPlow } from '../cards-display/D/D18_SteamPlow'
import { D24_BrotherlyLove } from '../cards-display/D/D24_BrotherlyLove'
import { D50_ForeignAid } from '../cards-display/D/D50_ForeignAid'
import { E105_Pioneer } from '../cards-display/E/E105_Pioneer'
// Wave 1: LISTENER_SIMPLE cards (2026-04-17)
import { A42_ForestLakeHut } from '../cards-display/A/A42_ForestLakeHut'
import { A43_FarmyardManure } from '../cards-display/A/A43_FarmyardManure'
import { A111_WallBuilder } from '../cards-display/A/A111_WallBuilder'
import { A124_Knapper } from '../cards-display/A/A124_Knapper'
import { B18_GrasslandHarrow } from '../cards-display/B/B18_GrasslandHarrow'
import { B51_DiggingSpade } from '../cards-display/B/B51_DiggingSpade'
import { B63_Tasting } from '../cards-display/B/B63_Tasting'
import { B120_Sweep } from '../cards-display/B/B120_Sweep'
import { B121_Geologist } from '../cards-display/B/B121_Geologist'
import { B122_Mineralogist } from '../cards-display/B/B122_Mineralogist'
import { B156_StorehouseKeeper } from '../cards-display/B/B156_StorehouseKeeper'
import { B161_Weakling } from '../cards-display/B/B161_Weakling'
import { C26_Flail } from '../cards-display/C/C26_Flail'
import { C28_TeachersDesk } from '../cards-display/C/C28_TeachersDesk'
import { C117_Legworker } from '../cards-display/C/C117_Legworker'
import { C140_PackagingArtist } from '../cards-display/C/C140_PackagingArtist'
import { C154_TwinResearcher } from '../cards-display/C/C154_TwinResearcher'
import { C160_Outrider } from '../cards-display/C/C160_Outrider'
import { D21_Recruitment } from '../cards-display/D/D21_Recruitment'
// Wave 3: COMPUTE_COST cards (2026-04-17)
import { A27_OvenSite } from '../cards-display/A/A27_OvenSite'
import { B155_ArtTeacher } from '../cards-display/B/B155_ArtTeacher'
import { C95_BasketWeaver } from '../cards-display/C/C95_BasketWeaver'
import { D95_SiteManager } from '../cards-display/D/D95_SiteManager'
// Wave 4: PLAYER_ACTION_CARD chain cards (2026-04-17)
import { B130_FullPeasant } from '../cards-display/B/B130_FullPeasant'
import { B150_LargeScaleFarmer } from '../cards-display/B/B150_LargeScaleFarmer'
import { B152_JuniorArtist } from '../cards-display/B/B152_JuniorArtist'
// Wave 8: HIGH complexity cards (simplified) (2026-04-17)
import { C22_BasketChair } from '../cards-display/C/C22_BasketChair'
import { C150_ParrotBreeder } from '../cards-display/C/C150_ParrotBreeder'
import { E125_DelayedWayfarer } from '../cards-display/E/E125_DelayedWayfarer'
import './C/C39_StudioBoat'

export const minorImprovementCards = [
  A10_WoodenShed,
  A25_Bassinet,
  A48_ShavingHorse,
  A106_SlurrySpreader,
  A14_CarpentersHammer,
  A17_ReclamationPlow,
  A22_Telegram,
  A15_CarpentersAxe,
  A16_RammedClay,
  A21_FamilyFriendHome,
  A23_StoneCompany,
  A30_BakingSheet,
  A34_Loppers,
  A45_FireProtectionPond,
  A56_Basket,
  A63_DutchWindmill,
  A68_AsparagusGift,
  A28_ForestSchool,
  A29_AleBenches,
  A31_DebtSecurity,
  A3_PaperKnife,
  A37_Bucksaw,
  A39_Chapel,
  A40_PottersYard,
  A41_VegetableSlicer,
  A53_Claypipe,
  A55_JunkRoom,
  A58_AsparagusKnife,
  A64_BarleyMill,
  A65_SeedPellets,
  A70_LiftingMachine,
  A71_ClearingSpade,
  A72_CalciumFertilizers,
  A73_AgriculturalFertilizers,
  A74_StableTree,
  A75_LumberMill,
  A26_SleepingCorner,
  A60_OrientalFireplace,
  A79_GardenHoe,
  A81_InterimStorage,
  A82_WorkCertificate,
  A83_ShepherdsCrook,
  A84_Silage,
  A1_Shelter,
  A2_ShiftingCultivation,
  A4_Baseboards,
  A5_ClayEmbankment,
  A6_StorageBarn,
  A7_GardenersKnife,
  A8_FoodBasket,
  A9_YoungAnimalMarket,
  A12_DrinkingTrough,
  A13_RenovationCompany,
  A19_Handplow,
  A32_Manger,
  A33_BigCountry,
  A36_FacadesCarving,
  A38_WoolBlankets,
  A44_PondHut,
  A47_Trellises,
  A57_MilkingParlor,
  A69_LargeGreenhouse,
  A18_WheelPlow,
  A24_ThreshingBoard,
  A46_ClawKnife,
  A51_DriftNetBoat,
  A52_ThrowingAxe,
  A66_FeedingDish,
  A67_CornScoop,
  A78_Canoe,
  B14_Hawktower,
  B20_ChainFloat,
  B22_WalkingBoots,
  B27_Toolbox,
  B31_PotteryYard,
  B32_Kettle,
  B33_Mantlepiece,
  B37_Grange,
  B38_FutureBuildingSite,
  B39_Loom,
  B41_Hauberg,
  B44_ChickStable,
  B45_StrawberryPatch,
  B46_ClubHouse,
  B10_Caravan,
  B13_CarpentersParlor,
  B15_CarpentersBench,
  B12_Stockyard,
  B69_PottersMarket,
  B19_MoldboardPlow,
  B2_MiniPasture,
  B21_HayloftBarn,
  B23_FinalScenario,
  B3_Moonshine,
  B30_WoodPalisades,
  B34_SpecialFood,
  B42_ForestInn,
  B48_ForestStone,
  B52_GrowingFarm,
  B55_MaintenancePremium,
  B59_FoodChest,
  B65_GrainDepot,
  B66_SackCart,
  B67_HandTruck,
  B70_NewPurchase,
  B71_HarvestHouse,
  B72_LoveforAgriculture,
  B73_GiftBasket,
  B74_ThickForest,
  B75_WoodWorkshop,
  B76_Ceilings,
  B78_ReedBelt,
  B80_HardPorcelain,
  B81_Handcart,
  B83_MuddyPuddles,
  B1_UpscaleLifestyle,
  B4_WoodPile,
  B5_StoreofExperience,
  B6_ExcursiontotheQuarry,
  B7_Wage,
  B8_MarketStall,
  B9_BeatingRod,
  B17_ForestPlow,
  B24_Lasso,
  B28_ForestryStudies,
  B40_BreweryPond,
  B43_Chophouse,
  B47_HerringPot,
  B56_Brook,
  B60_BrewingWater,
  B62_Pitchfork,
  B64_MillWheel,
  B77_LoamPit,
  C1_Overhaul,
  C10_BunkBeds,
  C13_WoodSlideHammer,
  C14_StrawThatchedRoof,
  C16_FieldFences,
  C56_FeedFence,
  C17_NewlyPlowedField,
  C18_RollOverPlow,
  C19_SwingPlow,
  C23_JobContract,
  C24_BedintheGrainField,
  C25_SteamMachine,
  C27_Blueprint,
  C29_BeerTable,
  C30_HalfTimberedHouse,
  C32_AbortOriel,
  C33_GreeningPlan,
  C35_LanternHouse,
  C38_Christianity,
  C40_CanvasSack,
  C44_ChickenCoop,
  C47_GardenClaw,
  C48_Farmstead,
  C50_StableYard,
  C59_SchnappsDistillery,
  C62_CookeryExtension,
  C65_Granary,
  C69_LandConsolidation,
  C31_WritingChamber,
  C37_DwellingMound,
  C51_FishingNet,
  C52_HuntsmansHat,
  C57_Crudite,
  C60_SmallPottersOven,
  C63_CraftBrewery,
  C67_MineralFeeder,
  C71_Slurry,
  C71_SlurrySpreader,
  C72_FestivalPlanning,
  C74_PrivateForest,
  C75_Firewood,
  C77_ClaySupply,
  C78_ReedHattedToad,
  C79_StoneCart,
  C81_MaterialHub,
  C8_PlantFertilizer,
  C84_PerennialRye,
  C2_Stable,
  C3_CarriageTrip,
  C4_WritingBoards,
  C5_Remodeling,
  C6_StoneClearing,
  C7_BladeShears,
  C9_AutomaticWaterTrough,
  C15_Trellis,
  C20_MolePlow,
  C45_Stew,
  C76_WoodCart,
  C82_HardwareStore,
  C21_HeartofStone,
  C36_ClayDeposit,
  C43_FarmBuilding,
  C58_Woodcraft,
  C61_BeerStein,
  C68_Bookcase,
  C73_SeaweedFertilizer,
  D19_PulverizerPlow,
  D42_EducationBonus,
  D58_Gritter,
  D73_SupplyBoat,
  D80_BrickHammer,
  E15_NailBasket,
  E18_SeedAlmanac,
  E31_Upholstery,
  E50_WildGreens,
  E54_Contraband,
  E79_FieldSpade,
  D10_StorksNest,
  D11_LawnFertilizer,
  D13_Trowel,
  D14_HammerCrusher,
  D15_ClaySupports,
  D20_TurnwrestPlow,
  D22_WorkPermit,
  D23_PioneeringSpirit,
  D25_WitchesDanceFloor,
  D26_CarpentersYard,
  D27_Retraining,
  D29_MuckRake,
  D30_ArtisanDistrict,
  D31_Storeroom,
  D33_SummerHouse,
  D34_LuxuriousHostel,
  D35_FodderChamber,
  D36_BreedRegistry,
  D37_Sculpture,
  D38_MilkingStool,
  D40_Cesspit,
  D41_HorseDrawnBoat,
  D43_Hutch,
  D44_ForestWell,
  D45_SheepWell,
  D47_Churchyard,
  D49_Bookshelf,
  D51_Archway,
  D53_TeaHouse,
  D59_EarthOven,
  D55_NewMarket,
  D57_WholesaleMarket,
  D60_LargePottery,
  D62_BeerTap,
  D66_PotterCeramics,
  D67_ReapHook,
  D69_SmallGreenhouse,
  D70_StrawManure,
  D71_Changeover,
  D72_StableManure,
  D74_RoyalWood,
  D75_WoodField,
  D78_ReedPond,
  D81_RoofLadder,
  D82_HuntingTrophy,
  D16_WoodenWheyBucket,
  D28_WritingDesk,
  D68_SmallBasket,
  D83_Pigswill,
  D1_ZigzagHarrow,
  D2_DwellingPlan,
  D3_Furrows,
  D4_CrossCutWood,
  D5_FieldClay,
  D6_PetrifiedWood,
  D7_Trident,
  D8_FernSeeds,
  D9_GameTrade,
 E10_StrawHat,
  E17_SkimmerPlow,
  E19_OxGoad,
  E55_StoneWeir,
  E59_CombandCutter,
  E60_WorkingGloves,
  E67_GrainBag,
  E68_CherryOrchard,
  E21_SheepRug,
  E16_BriarHedge,
  E22_GuestRoom,
  E27_PiggyBank,
  E30_ChildsToy,
  E33_BeaverColony,
  E36_HerbalGarden,
  E38_RodCollection,
  E40_BeeStatue,
  E4_Thunderbolt,
  E5_NightLoot,
  E51_WhaleOil,
  E52_Cubbyhole,
  E53_BoarSpear,
  E62_SourDough,
  E12_AnimalBedding,
  E13_StoneHouseReconstruction,
  E14_WoodSaw,
  E24_Ambition,
  E63_IronOven,
  E64_SimpleOven,
  E71_CowPatty,
  E73_Scythe,
  E74_AshTrees,
  E75_StoneAxe,
  E76_LumberPile,
  E78_SleightofHand,
  E80_RockGarden,
  E25_BumperCrop,
  E29_Heirloom,
  E32_Nave,
  E34_LandRegister,
  E35_Misanthropy,
  E37_OxSkull,
  E41_MuddyWaters,
  E42_WaterGully,
  E43_BarnCats,
  E44_FodderBeets,
  E45_FruitLadder,
  E46_WaterlilyPond,
  E57_CheeseFondue,
  E65_Almsbag,
  E81_AlchemistsLab,
  E82_Profiteering,
  E83_ShepherdsWhistle,
  E84_DollysMother,
  E1_PoleBarns,
  E2_RenovationMaterials,
  E3_TeaTime,
  E6_Recount,
  E7_Pumpernickel,
  E8_FarmersMarket,
  E9_BarteringHut,
  // Harvest listener minor improvements
  A61_WinnowingFan,
  A62_BeerKeg,
  B50_ButterChurn,
  B53_SculptureCourse,
  B82_ValueAssets,
  C34_ElephantgrassPlant,
  C41_FarmStore,
  C54_MarketBooth,
  C55_Studio,
  C66_EternalRyeCultivation,
  D32_WoodRake,
  D61_BaleofStraw,
  D64_BakingCourse,
  D76_SocialBenefits,
  D79_CarrotMuseum,
  E39_Paintbrush,
  E48_TownHall,
  E61_RaisedBed,
  // Round/work phase trigger cards (batch 3) — minor improvements
  A35_SwimmingClass,
  A49_NestSite,
  A76_Cob,
  B57_Scullery,
  D48_CivicFacade,
  D52_RollingPin,
  D54_TroutPool,
  E20_IronHoe,
  E23_Apiary,
  E26_Sundial,
  // Batch 13 wave 1 — minor improvements
  A50_MilkJug,
  A77_Hod,
  A80_StoneTongs,
  B54_Tumbrel,
  B58_CrackWeeder,
  B79_Corf,
  D65_GrainSieve,
  E66_BarnShed,
  // Batch 13 wave 2 — minor improvements
  B25_BreadPaddle,
  B49_Scales,
  D39_TruffleSlicer,
  D63_Lynchet,
  // Batch 13 wave 3 — minor improvements
  A54_Credit,
  B16_MiningHammer,
  B29_CookeryLesson,
  C42_RavenousHunger,
  C80_RockyTerrain,
  E77_Mattock,
  // Batch 15 — minor improvements (opponent interaction)
  D77_RecycledBrick,
  E49_Twibil,
  // Batch 16 — minor improvements
  A20_DoubleTurnPlow,
  B26_AgrarianFences,
  B36_Bottles,
  B68_Beanfield,
  D17_DrillHarrow,
  D18_SteamPlow,
  D24_BrotherlyLove,
  D50_ForeignAid,
  // Wave 1 (2026-04-17)
  A42_ForestLakeHut,
  A43_FarmyardManure,
  B18_GrasslandHarrow,
  B51_DiggingSpade,
  B63_Tasting,
  C26_Flail,
  C28_TeachersDesk,
  D21_Recruitment,
  // Wave 3 (2026-04-17)
  A27_OvenSite,
  // Wave 8 (2026-04-17)
  C22_BasketChair,
  // Fix #10: relocated from occupationCards (mis-classified)
  A11_MudPatch,
  A162_ForestTallyman,
  A59_PotatoRidger,
  B11_Feedyard,
  B35_HookKnife,
  B61_ThreeFieldRotation,
  B84_AcornsBasket,
  C104_Collector,
  C11_WildlifeReserve,
  C12_CattleFarm,
  C162_ForestOwner,
  C46_Mandoline,
  C49_BeerStall,
  C53_GypsysCrock,
  C64_CornSchnappsDistillery,
  C70_LettucePatch,
  C83_EarlyCattle,
  D116_TreeInspector,
  D127_HardworkingMan,
  D12_MilkingPlace,
  D46_PelletPress,
  D56_FatstockStretcher,
  D84_FeedPellets,
  E11_PettingZoo,
  E161_ElderBaker,
  E28_Bookmark,
  E47_SyrupTap,
  E56_RomanPot,
  E58_LunchtimeBeer,
  E69_MelonPatch,
  E70_CropRotationField,
  E72_ArtichokeField,
]
export const occupationCards = [
  A93_BedMaker,
  A95_Angler,
  A103_Portmonger,
  A131_CraftTeacher,
  A146_StorehouseSteward,
  A164_WoodWorker,
  A102_Grocer,
  A105_BarrowPusher,
  A108_MushroomCollector,
  A109_SmallTrader,
  A110_Roughcaster,
  A112_ScytheWorker,
  A113_HeresyTeacher,
  A119_FirewoodCollector,
  A123_FrameBuilder,
  A126_MasterWorkman,
  A127_Lodger,
  A132_Publican,
  A133_Braggart,
  A134_FullFarmer,
  A136_DrudgeryReeve,
  A137_RiverineShepherd,
  A143_Stonecutter,
  A144_Sequestrator,
  A148_Woolgrower,
  A150_Stagehand,
  A156_Buyer,
  A165_PigBreeder,
  A85_Homekeeper,
  A87_Conservator,
  A88_HedgeKeeper,
  A89_StablePlanner,
  A117_WoodCarrier,
  A125_Priest,
  A135_AnimalReeve,
  A92_AdoptiveParents,
  A94_LazySowman,
  A97_Freshman,
  A98_StableArchitect,
  A99_FellowGrazer,
  A101_CookeryOutfitter,
  A166_Haydryer,
  A169_OffSiter,
  A170_Hayward,
  A171_Sidekick,
  A172_BoatPainter,
  A173_ClayThief,
  A174_MasterHora,
  A175_HollowGardener,
  A176_Wheelmaker,
  A177_Middleman,
  A178_CarpentersBoy,
  A179_MountainShepherd,
  A180_AnimalBrander,
  B100_Clutterer,
  B103_FieldMerchant,
  B109_PaperMaker,
  B115_TinsmithMaster,
  B124_Trimmer,
  B146_Illusionist,
  B149_OpenAirFarmer,
  B151_LittlePeasant,
  B153_Housemaster,
  B165_GameProvider,
  B86_TruffleSearcher,
  B95_MasterBricklayer,
  B101_FurnitureCarpenter,
  B129_Seatmate,
  B157_Salter,
  B88_EstablishedPerson,
  B93_Confidant,
  B94_StockProtector,
  B96_TreeFarmJoiner,
  B98_OrganicFarmer,
  B99_Tutor,
  B102_Consultant,
  B104_SheepWalker,
  B105_CaseBuilder,
  B113_PatchCaregiver,
  B111_Rustic,
  B119_Lumberjack,
  B123_RoofBallaster,
  B131_Equipper,
  B134_HousebookMaster,
  B147_Huntsman,
  B125_EstateWorker,
  B126_Carpenter,
  B127_Seducer,
  B128_Plumber,
  B132_EstateMaster,
  B136_HouseSteward,
  B141_FieldCaretaker,
  B164_SheepWhisperer,
  B167_StableSergeant,
  B169_LivestockSustainer,
  B170_CorralBuilder,
  B171_GreenhouseBuilder,
  B172_CattleCaregiver,
  B173_Sweeper,
  B174_RiverbankGardener,
  B175_FieldOverseer,
  B176_VillageIdiot,
  B177_StoneClawer,
  B178_TagAlong,
  B179_WildBoarHunter,
  B180_GameTeaser,
  B87_Cottager,
  B90_CooperativePlower,
  B91_AssistantTiller,
  B92_LittleStickKnitter,
  B112_Silokeeper,
  B142_Greengrocer,
  B144_Collier,
  B145_BrushwoodCollector,
  B166_CattleFeeder,
  C85_DenBuilder,
  C86_LivestockFeeder,
  C87_Mason,
  C88_CarpentersApprentice,
  C93_InnerDistrictsDirector,
  C94_StableCleaner,
  C96_Merchant,
  C99_GardenDesigner,
  C100_Butler,
  C108_Layabout,
  C115_Sower,
  C118_WoodCollector,
  C120_AgriculturalLabourer,
  C122_Bricklayer,
  C127_Lover,
  C128_WoodenHutExtender,
  C133_Soldier,
  C134_CowPrince,
  C135_Constable,
  C136_RanchProvost,
  C139_BasketmakersWife,
  C141_SheepProvider,
  C142_MarketCrier,
  C144_ReedRoofRenovator,
  C146_WorkshopAssistant,
  C148_MudWallower,
  C156_HoofCaregiver,
  C161_PotatoDigger,
  C165_GameCatcher,
  C166_CattleWhisperer,
  C168_AnimalCatcher,
  C105_BasketCarrier,
  C109_SchnappsDistiller,
  C169_FastMason,
  C170_AmateurFencer,
  C171_YoungArtist,
  C172_FieldCounter,
  C173_TopOuter,
  C174_StoneCustodian,
  C175_VillageTeacher,
  C176_Cleanacre,
  C177_MountainHiker,
  C178_OnSiteReverend,
  C179_BovinePioneer,
  C180_Trapper,
  C90_FieldWatchman,
  C91_PlowHero,
  C126_Excavator,
  C102_TreeGuard,
  C114_SoilScientist,
  C131_PrivateTeacher,
  C138_AnimalFeeder,
  C147_Cowherd,
  D100_LordoftheManor,
  D101_SugarBaker,
  D102_SampleStableMaker,
  D103_CanalBoatman,
  D107_Bellfounder,
  D114_SeedTrader,
  D115_FodderPlanter,
  D117_WoodExpert,
  D122_ClayCarrier,
  D124_Emissary,
  D126_FieldCultivator,
  D131_CraftsmanshipPromoter,
  D132_HideFarmer,
  D134_OysterEater,
  D135_GardeningHeadOfficial,
  D136_AnimalActivist,
  D137_TradeTeacher,
  D139_Chairman,
  D150_GodlySpouse,
  D157_PartyOrganizer,
  D158_BeanCounter,
  D161_CabbageBuyer,
  D164_PetGrower,
  D167_PureBreeder,
  D90_PlowMaker,
  D105_Sculptor,
  D110_FishFarmer,
  D125_ForestTrader,
  D147_TrapBuilder,
  D151_SpinDoctor,
  D165_PigStalker,
  D85_Reader,
  D86_SheepAgent,
  D106_WhiskyDistiller,
  D138_PetLover,
  D88_Millwright,
  D91_Plowman,
  D92_ChildOmbudsman,
  D93_SheepInspector,
  D94_HenpeckedHusband,
  D89_Stablehand,
  D104_Cultivator,
  D111_InteriorDecorator,
  D123_RenovationPreparer,
  D140_Loudmouth,
  D168_Stockman,
  D98_Transactor,
  D99_EarthenwarePotter,
  D119_WoodBarterer,
  D120_ClayDeliveryman,
  D121_ClayPlasterer,
  D145_RoofExaminer,
  D152_Patron,
  D154_ChimneySweep,
  D108_StoneCarver,
  D155_Ebonist,
  D159_ReedSeller,
  D162_ClayFirer,
  D169_Plowsmith,
  D170_FoldBuilder,
  D171_SeniorTeacher,
  D172_PutcherMaker,
  D173_TownClerk,
  D174_LoessGardener,
  D175_Countryman,
  D176_Woodshacker,
  D177_Graduate,
  D178_SubstituteTeacher,
  D179_Bullcatcher,
  D180_PartTimeWorker,
  E103_Wolf,
  E109_BraidMaker,
  E112_GrainThief,
  E123_ResourceHoarder,
  E124_MayorCandidate,
  E130_Overachiever,
  E133_ChampionBreeder,
  E134_Omnifarmer,
  E135_Pickler,
  E136_AnimalHusbandryWorker,
  E148_Lazybones,
  E150_RockBeater,
  E151_DeliveryNurse,
  E153_StoneSculptor,
  E155_Visionary,
  E159_OldMiser,
  E162_Entrepreneur,
  E115_SeedServant,
  E121_HillCultivator,
  E131_MarketMaster,
  E137_FlaxFarmer,
  E141_VegetableVendor,
  E166_Roastmaster,
  E167_DairyCrier,
  E85_MasterTanner,
  E86_PenBuilder,
  E87_MasterRenovator,
  E90_DungCollector,
  E91_PlowBuilder,
  E92_FieldDoctor,
  E129_Imitator,
  E93_Motivator,
  E94_Prophet,
  E95_Miller,
  E96_Elder,
  E97_Beneficiary,
  E98_Prodigy,
  E101_Blighter,
  E104_SpiceTrader,
  E106_EmergencySeller,
  E119_LandHeir,
  E120_ScrapCollector,
  E127_DiligentFarmer,
  E128_Saddler,
  E138_LivestockExpert,
  E139_BunnyBreeder,
  E145_Parvenu,
  E154_Margrave,
  E89_Stallwright,
  E108_BlackberryFarmer,
  E113_Godmother,
  E114_ShedBuilder,
  E122_Cottar,
  E146_Reseller,
  E157_Usufructuary,
  E163_Patroness,
  E164_MountainPlowman,
  A91_ShiftingCultivator,
  A107_Catcher,
  A114_SeasonalWorker,
  A115_ChiefForester,
  A122_PanBaker,
  A138_Harpooner,
  A140_ShovelBearer,
  A147_AnimalDealer,
  A155_Conjurer,
  A149_HouseArtist,
  A161_PatchCaretaker,
  A163_BuildingExpert,
  A168_AnimalTeacher,
  // Harvest listener occupations
  A104_WoodHarvester,
  A118_Treegardener,
  A145_Ropemaker,
  C92_AutumnMother,
  C110_HomeBrewer,
  C124_StoneImporter,
  D133_BeerTentOperator,
  D153_WealthyMan,
  E99_UncaringParents,
  E107_LandSurveyor,
  E117_PipeSmoker,
  E142_Smuggler,
  E147_AnimalDriver,
  E149_MidnightFencer,
  // Round/work phase trigger cards (batch 3) — occupations
  A90_PlowDriver,
  A100_Curator,
  A141_TurnipFarmer,
  A151_Minstrel,
  A152_NightSchoolStudent,
  A157_Bohemian,
  B97_Scholar,
  B106_MoralCrusader,
  B114_Childless,
  B118_SmallscaleFarmer,
  B133_VillagePeasant,
  B135_NutritionExpert,
  B139_ForestScientist,
  B140_FarmyardWorker,
  B158_DistrictManager,
  C97_SeedResearcher,
  C103_GreenGrocer,
  C111_SmallAnimalBreeder,
  C123_Freemason,
  C125_Nightworker,
  C157_ResourceAnalyzer,
  C159_FishermansFriend,
  D130_RecreationalCarpenter,
  D142_PotatoPlanter,
  E88_MasterFencer,
  E100_MuseumCaretaker,
  E102_Acquirer,
  E126_TaxCollector,
  E152_BargainHunter,
  E158_StoneCustodian,
  E168_AnimalTamersApprentice,
  A153_PigOwner,
  B154_SheepKeeper,
  C101_StallHolder,
  C143_StoneBuyer,
  D87_MasterBuilder,
  D129_LumberVirtuoso,
  A86_AnimalTamer,
  B148_PetBroker,
  C89_StableMaster,
  D148_DomesticianExpert,
  B137_Wholesaler,
  D118_Bonehead,
  D156_RetailDealer,
  E110_Dentist,
  E140_Carter,
  C98_CubeCutter,
  D113_FoodMerchant,
  E132_VeggieLover,
  // Batch 13 wave 1 — occupations
  A116_WoodCutter,
  A121_ClayPuncher,
  B110_Pavior,
  B116_Shoreforester,
  B117_Informant,
  B160_PubOwner,
  C106_PotatoHarvester,
  C121_ClayKneader,
  C164_GermanHeathKeeper,
  D109_SowingMaster,
  D141_SeedSeller,
  D143_TreeCutter,
  D146_Porter,
  // Batch 13 wave 2 — occupations
  A120_ClayHutBuilder,
  A139_HollowWarden,
  A142_Cordmaker,
  B89_Groom,
  B107_Manservant,
  B108_OvenFiringBoy,
  B162_ForestClearer,
  B168_PastureMaster,
  C107_Baker,
  C113_WinterCaretaker,
  C145_ForestReviewer,
  C163_MaterialDeliveryman,
  D97_BeggingStudent,
  D166_StableMilker,
  E111_Recluse,
  E116_FirCutter,
  E165_MasterHuntsman,
  // Batch 13 wave 3 — occupations
  A96_TaskArtisan,
  A129_Swagman,
  A130_MummysBoy,
  A167_BreederBuyer,
  C116_FurnitureMaker,
  C119_SkillfulRenovator,
  C132_TimberShingleMaker,
  C155_FoodDistributor,
  D96_Furnisher,
  D112_YoungFarmer,
  D144_WaterWorker,
  E118_KindlingGatherer,
  E143_Hewer,
  // Batch 15 — occupations (opponent interaction)
  A154_Paymaster,
  A158_CulinaryArtist,
  A159_JoineroftheSea,
  A160_Lutenist,
  B138_ForestGuardian,
  B143_ClayWarden,
  B159_LieutenantGeneral,
  B163_Pastor,
  C137_CharcoalBurner,
  C149_ResourceRecycler,
  C151_SowingDirector,
  C152_Puppeteer,
  C153_PatternMaker,
  C167_CattleBuyer,
  D128_BuildingTycoon,
  D149_CasualWorker,
  D160_Midwife,
  D163_JourneymanBricklayer,
  E144_WaresSalesman,
  E156_ClaypitOwner,
  E160_KelpGatherer,
  // Batch 16 — occupations
  C112_Thresher,
  C129_SecondSpouse,
  C158_ForestCampaigner,
  E105_Pioneer,
  // Wave 1 (2026-04-17)
  A111_WallBuilder,
  A124_Knapper,
  B120_Sweep,
  B121_Geologist,
  B122_Mineralogist,
  B156_StorehouseKeeper,
  B161_Weakling,
  C117_Legworker,
  C140_PackagingArtist,
  C154_TwinResearcher,
  C160_Outrider,
  // Wave 3 (2026-04-17)
  B155_ArtTeacher,
  C95_BasketWeaver,
  D95_SiteManager,
  // Wave 4 (2026-04-17)
  B130_FullPeasant,
  B150_LargeScaleFarmer,
  B152_JuniorArtist,
  // Wave 8 (2026-04-17)
  C150_ParrotBreeder,
  E125_DelayedWayfarer,
  // Fix #10: relocated from minorImprovementCards (mis-classified)
  A128_RiparianBuilder,
  B85_FarmHand,
  C130_OutskirtsDirector,
]

// Community cards (auto-generated by scripts/generate-register-all.ts)
const communityMinors = allCommunityCards.filter(
  (c): c is MinorImprovement => c instanceof MinorImprovement || c instanceof PlayerActionCard,
)
const communityOccupations = allCommunityCards.filter(
  (c): c is Occupation => c instanceof Occupation,
)

// All cards for reference and developer mode
export const allMinorImprovementCards = [...minorImprovementCards, ...communityMinors]
export const allOccupationCards = [...occupationCards, ...communityOccupations]

// Only implemented cards for normal game dealing
const isImplemented = (card: { implemented?: boolean }) => card.implemented !== false

export const implementedMinorImprovementCards = minorImprovementCards.filter(isImplemented)
export const implementedOccupationCards = occupationCards.filter(isImplemented)
export const implementedCommunityMinors = communityMinors.filter(isImplemented)
export const implementedCommunityOccupations = communityOccupations.filter(isImplemented)

export const minorImprovementIds = implementedMinorImprovementCards.map((card) => card.id)
export const occupationIds = implementedOccupationCards.map((card) => card.id)
export const getMinorImprovementCard = (id: string) => {
  return allMinorImprovementCards.find((card) => card.id === id)
    ?? getCustomMinorImprovement(id)
}
export const getOccupationCard = (id: string) => {
  return allOccupationCards.find((card) => card.id === id)
    ?? getCustomOccupation(id)
}

/**
 * Unified lookup entry for any card definition (occupation / minor / major).
 * Returns the CardDefinition view; for majors the underlying object is
 * MajorCardData (a CardDefinition superset). Callers needing majors-only
 * fields (e.g. `scoring`) may type-narrow via `as MajorCardData`.
 *
 * Replaces the role getMajorCardEffect played for metadata queries.
 */
export const getCardDefinition = (id: string): CardDefinition | undefined => {
  return (
    getMinorImprovementCard(id)
    ?? getOccupationCard(id)
    ?? majorCardDefinitions.find((c) => c.id === id)
  )
}

/**
 * Mirror of BGA `Card::isField()`: returns true when the played card carries
 * the `isField` metadata flag (set on minor improvements / occupations that
 * BGA marks `$this->field = true`). Used by C80 Rocky Terrain so it can
 * fire its plow trigger on Improvement / Occupation events whose card is
 * itself a field.
 */
export const isFieldCard = (id: string): boolean => {
  return getCardDefinition(id)?.isField === true
}

// Install the lookups on `types.ts` so `getRegisteredMinorImprovement` /
// `getRegisteredOccupation` work without module-level side effects in the card
// constructors. This runs once when catalog.ts is first imported.
//
// Class-type filters replicate the previous `CardBase` constructor side effect
// (which keyed by `this instanceof MinorImprovement | Occupation | PlayerActionCard`).
// All cards now live in the correct array (issue #10). The dual-array scan
// below is kept as a defensive belt-and-suspenders; `scripts/check-catalog-types.ts`
// is the authoritative regression guard.
const cardMatchesMinor = (c: unknown): c is MinorImprovement =>
  c instanceof MinorImprovement || c instanceof PlayerActionCard
const cardMatchesOccupation = (c: unknown): c is Occupation =>
  c instanceof Occupation
const allCards = [...allMinorImprovementCards, ...allOccupationCards]
registerCardLookups({
  minor: (id) =>
    allCards.find((c) => c.id === id && cardMatchesMinor(c))
    ?? getCustomMinorImprovement(id)
    ?? undefined,
  occupation: (id) =>
    allCards.find((c) => c.id === id && cardMatchesOccupation(c))
    ?? getCustomOccupation(id)
    ?? undefined,
})
