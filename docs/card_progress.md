# 卡牌实现进度追踪

本文追踪所有卡牌的实现状态，参考自 `../bga-agricola` 项目。

## 图例

- ✅ 已实现 - 卡牌已在 open-agricola 中实现
- ⏳ 进行中 - 卡牌正在实现中
- ❌ 未实现 - 卡牌尚未实现
- 🔧 部分实现 - 卡牌已定义但缺少部分功能（如 Hook）

## 统计概览

| 类型 | 总数 | 已实现 | 未实现 |
|------|------|--------|--------|
| Major Improvements | 10 | 10 | 0 |
| A Deck | 180 | 48 | 132 |
| B Deck | 180 | 27 | 153 |
| C Deck | 180 | 34 | 146 |
| D Deck | 180 | 28 | 152 |
| E Deck | 168 | 41 | 127 |
| **总计** | **898** | **188** | **710** |

---

## Major Improvements (大改良) - 10/10 ✅

| ID | 名称 | 状态 |
|----|------|------|
| Major_Basket | Basket | ✅ |
| Major_ClayOven | Clay Oven | ✅ |
| Major_CookingHearth1 | Cooking Hearth (1) | ✅ |
| Major_CookingHearth2 | Cooking Hearth (2) | ✅ |
| Major_Fireplace1 | Fireplace (1) | ✅ |
| Major_Fireplace2 | Fireplace (2) | ✅ |
| Major_Joinery | Joinery | ✅ |
| Major_Pottery | Pottery | ✅ |
| Major_StoneOven | Stone Oven | ✅ |
| Major_Well | Well | ✅ |

---

## Hook 覆盖矩阵代表性卡牌

以下卡牌在 Hook 覆盖矩阵中被选为代表性示例（无重复）：

### Before Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| B75_WoodWorkshop | Improvement | 打改良前获得木材 | 🔧 |
| A65_SeedPellets | Sow | 播种前获得谷物 | 🔧 |
| D14_HammerCrusher | Renovation | 翻新前获得资源 | 🔧 |
| E74_AshTrees | Fencing | 围栏前获得资源 | 🔧 |
| B67_HandTruck | Exchange | 交易前获得谷物 | 🔧 |
| E101_Blighter | Occupation | 打职业前效果 | ❌ |
| B34_SpecialFood | SpecialEffect | 特殊效果前 | 🔧 |
| A166_Haydryer | Harvest | 收获前效果 | ❌ |
| C133_Soldier | EndOfGame | 游戏结束时 | 🔧 |
| B70_NewPurchase | StartOfTurn | 回合开始时 | ❌ |

### During Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| A126_MasterWorkman | PlaceFarmer | 放置农夫时获得资源 | ✅ |
| E53_BoarSpear | Collect | 收取时交换资源 | ✅ |
| A55_JunkRoom | Improvement | 打改良时获得食物 | 🔧 |
| E33_BeaverColony | Gain | 获得资源时 | 🔧 |
| C52_HuntsmansHat | PlaceFarmer | 替换放置农夫 | ✅ |
| C120_AgriculturalLabourer | Receive | 接收资源时 | 🔧 |

### ImmediatelyAfter Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| C25_SteamMachine | PlaceFarmer | 放置后立即烤面包 | ✅ |
| A108_MushroomCollector | Collect | 收取后立即交换 | ✅ |
| C96_Merchant | Improvement | 打改良后可再行动 | 🔧 |
| A83_ShepherdsCrook | Fencing | 围栏后放置农夫 | 🔧 |

### After Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| C75_Firewood | Improvement | 打改良后触发搬木并记录 cardEffectGain 日志 | ✅ |
| A17_ReclamationPlow | Collect | 收取后获得动物 | ✅ |
| A53_Claypipe | Gain/Receive | 获得/接收后交换 | ✅ |
| A110_Roughcaster | Construct/Renovation | 建造/翻新后 | 🔧 |
| A105_BarrowPusher | Plow | 犁地后 | 🔧 |
| A109_SmallTrader | Improvement | 打改良后 | 🔧 |
| A79_GardenHoe | Sow | 播种后 | 🔧 |
| A74_StableTree | Stables | 建马厩后 | 🔧 |
| A37_Bucksaw | Renovation | 翻新后 | 🔧 |
| A144_Sequestrator | Fencing | 围栏后 | 🔧 |
| D150_GodlySpouse | WishChildren | 生孩子后 | 🔧 |
| B65_GrainDepot | Pay | 支付后 | 🔧 |
| C71_SlurrySpreader | Reorganize | 重组后 | 🔧 |
| B100_Clutterer | Occupation | 打职业后 | 🔧 |
| A64_BarleyMill | Reap | 收割后 | 🔧 |
| D99_EarthenwarePotter | Harvest | 收获后 | ❌ |
| E128_Saddler | Receive | 接收后 | ❌ |
| E57_CheeseFondue | Exchange | 交易后 | ❌ |

### ComputeCosts Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| A128_RiparianBuilder | Construct | 建造成本折扣 | 🔧 |
| C37_DwellingMound | Plow | 犁地成本折扣 | 🔧 |
| C88_CarpentersApprentice | Construct | 建造成本转换 | 🔧 |
| A123_FrameBuilder | Renovation/Construct | 翻新/建造成本 | 🔧 |
| A88_HedgeKeeper | Fencing | 围栏成本折扣 | 🔧 |
| A28_ForestSchool | Occupation | 职业成本折扣 | 🔧 |

### ComputeArgs Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| E21_SheepRug | PlaceFarmer | 修改放置参数 | ✅ |

### ComputeReplace Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| B103_FieldMerchant | Improvement | 替换改良行动 | 🔧 |
| A94_LazySowman | Sow | 替换播种行动 | 🔧 |
| A97_Freshman | Exchange | 替换交易行动 | 🔧 |

### IsDoable Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| D49_Bookshelf | Improvement | 放宽改良条件 | ❌ |
| C60_SmallPottersOven | Sow | 放宽播种条件 | ❌ |
| D152_Patron | Occupation | 放宽职业条件 | ❌ |
| B94_StockProtector | Fencing | 放宽围栏条件 | 🔧 |
| E130_Overachiever | WishChildren | 放宽生孩子条件 | 🔧 |
| D119_WoodBarterer | Exchange | 放宽交易条件 | ❌ |
| B109_PaperMaker | Occupation | 放宽职业条件 | 🔧 |

---

## A Deck 已实现卡牌 (48/180)

| ID | Hook 覆盖 |
|----|-----------|
| A10_WoodenShed | - |
| A14_CarpentersHammer | ComputeCosts(Construct) |
| A17_ReclamationPlow | After(Collect), Before(SpecialEffect) |
| A22_Telegram | - |
| A23_StoneCompany | - |
| A28_ForestSchool | ComputeCosts(Occupation) |
| A37_Bucksaw | After(Renovation) |
| A39_Chapel | - |
| A40_PottersYard | - |
| A41_VegetableSlicer | - |
| A53_Claypipe | After(Gain, Receive), ImmediatelyAfter(Obtain) |
| A55_JunkRoom | During(Improvement) |
| A64_BarleyMill | After(Reap) |
| A65_SeedPellets | Before(Sow) |
| A70_LiftingMachine | - |
| A71_ClearingSpade | - |
| A72_CalciumFertilizers | - |
| A74_StableTree | After(Stables) |
| A79_GardenHoe | After(Sow) |
| A81_InterimStorage | - |
| A82_WorkCertificate | After(PlaceFarmer) |
| A83_ShepherdsCrook | ImmediatelyAfter(Fencing) |
| A84_Silage | - |
| A85_Homekeeper | - |
| A87_Conservator | - |
| A88_HedgeKeeper | ComputeCosts(Fencing) |
| A89_StablePlanner | - |
| A92_AdoptiveParents | After(PlaceFarmer) |
| A94_LazySowman | ComputeReplace(Sow), IsDoable(Sow) |
| A97_Freshman | ComputeReplace(Exchange), IsDoable(Exchange) |
| A105_BarrowPusher | After(Plow) |
| A106_SlurrySpreader | - |
| A108_MushroomCollector | ImmediatelyAfter(Collect) |
| A109_SmallTrader | After(Improvement) |
| A110_Roughcaster | After(Construct, Renovation) |
| A112_ScytheWorker | - |
| A119_FirewoodCollector | - |
| A123_FrameBuilder | ComputeCosts(Construct, Renovation) |
| A126_MasterWorkman | During(PlaceFarmer), ComputeArgs(PlaceFarmer) |
| A127_Lodger | - |
| A128_RiparianBuilder | ComputeCosts(Construct) |
| A136_DrudgeryReeve | - |
| A137_RiverineShepherd | - |
| A144_Sequestrator | After(Fencing) |
| A148_Woolgrower | - |
| A162_ForestTallyman | - |
| A165_PigBreeder | - |

---

## B Deck 已实现卡牌 (27/180)

| ID | Hook 覆盖 |
|----|-----------|
| B2_MiniPasture | - |
| B3_Moonshine | - |
| B10_Caravan | - |
| B15_CarpentersBench | ComputeCosts(Fencing) |
| B19_MoldboardPlow | - |
| B21_HayloftBarn | - |
| B23_FinalScenario | - |
| B34_SpecialFood | Before(SpecialEffect) |
| B42_ForestInn | - |
| B48_ForestStone | - |
| B55_MaintenancePremium | - |
| B65_GrainDepot | After(Pay) |
| B67_HandTruck | Before(Exchange) |
| B75_WoodWorkshop | Before(Improvement), IsDoable(Improvement) |
| B76_Ceilings | - |
| B81_Handcart | - |
| B86_TruffleSearcher | - |
| B94_StockProtector | IsDoable(Fencing), After(PlaceFarmer) |
| B100_Clutterer | After(Occupation) |
| B103_FieldMerchant | ComputeReplace(Improvement) |
| B109_PaperMaker | Before(Occupation), IsDoable(Occupation) |
| B115_TinsmithMaster | - |
| B124_Trimmer | - |
| B146_Illusionist | - |
| B149_OpenAirFarmer | - |
| B151_LittlePeasant | - |
| B165_GameProvider | - |

---

## C Deck 已实现卡牌 (34/180)

| ID | Hook 覆盖 |
|----|-----------|
| C1_Overhaul | - |
| C8_PlantFertilizer | - |
| C10_BunkBeds | - |
| C13_WoodSlideHammer | ComputeCosts(Renovation) |
| C17_NewlyPlowedField | - |
| C18_RollOverPlow | - |
| C19_SwingPlow | - |
| C23_JobContract | - |
| C24_BedintheGrainField | - |
| C25_SteamMachine | ImmediatelyAfter(PlaceFarmer) |
| C27_Blueprint | - |
| C29_BeerTable | - |
| C31_WritingChamber | - |
| C37_DwellingMound | ComputeCosts(Plow) |
| C51_FishingNet | - |
| C52_HuntsmansHat | ComputeReplace(PlaceFarmer) |
| C57_Crudite | - |
| C63_CraftBrewery | - |
| C71_Slurry | - |
| C71_SlurrySpreader | After(Reorganize) |
| C75_Firewood | After(Improvement) |
| C84_PerennialRye | - |
| C85_DenBuilder | - |
| C86_LivestockFeeder | - |
| C87_Mason | - |
| C88_CarpentersApprentice | ComputeCosts(Construct) |
| C93_InnerDistrictsDirector | - |
| C96_Merchant | ImmediatelyAfter(Improvement) |
| C99_GardenDesigner | - |
| C104_Collector | - |
| C115_Sower | - |
| C120_AgriculturalLabourer | After(Obtain, Gain, Receive, Reap) |
| C130_OutskirtsDirector | - |
| C133_Soldier | Before(EndOfGame) |
| C135_Constable | - |
| C142_MarketCrier | - |
| C144_ReedRoofRenovator | - |
| C148_MudWallower | - |
| C156_HoofCaregiver | - |
| C162_ForestOwner | - |
| C168_AnimalCatcher | - |

---

## D Deck 已实现卡牌 (28/180)

| ID | Hook 覆盖 |
|----|-----------|
| D10_StorksNest | - |
| D14_HammerCrusher | Before(Renovation), IsDoable(Renovation) |
| D20_TurnwrestPlow | - |
| D22_WorkPermit | - |
| D23_PioneeringSpirit | - |
| D27_Retraining | - |
| D36_BreedRegistry | - |
| D51_Archway | Before(ReturnHome) |
| D53_TeaHouse | - |
| D55_NewMarket | - |
| D70_StrawManure | - |
| D71_Changeover | - |
| D72_StableManure | - |
| D74_RoyalWood | - |
| D85_Reader | - |
| D92_ChildOmbudsman | - |
| D93_SheepInspector | - |
| D94_HenpeckedHusband | - |
| D98_Transactor | Before(Harvest) |
| D100_LordoftheManor | - |
| D101_SugarBaker | - |
| D102_SampleStableMaker | - |
| D103_CanalBoatman | - |
| D115_FodderPlanter | - |
| D116_TreeInspector | - |
| D124_Emissary | - |
| D126_FieldCultivator | - |
| D127_HardworkingMan | - |
| D131_CraftsmanshipPromoter | - |
| D132_HideFarmer | Before(EndOfGame) |
| D134_OysterEater | - |
| D137_TradeTeacher | - |
| D150_GodlySpouse | After(WishChildren) |
| D157_PartyOrganizer | - |
| D158_BeanCounter | - |
| D164_PetGrower | - |
| D167_PureBreeder | - |

---

## E Deck 已实现卡牌 (42/168)

| ID | Hook 覆盖 |
|----|-----------|
| E4_Thunderbolt | - |
| E5_NightLoot | - |
| E10_StrawHat | - |
| E16_BriarHedge | - |
| E21_SheepRug | ComputeArgs(PlaceFarmer) |
| E22_GuestRoom | - |
| E27_PiggyBank | - |
| E30_ChildsToy | - |
| E33_BeaverColony | During(Gain, Collect) |
| E36_HerbalGarden | - |
| E51_WhaleOil | Before(Occupation), IsDoable(Occupation) |
| E52_Cubbyhole | - |
| E53_BoarSpear | During(Collect, Gain, Receive), After(Collect) |
| E62_SourDough | - |
| E71_CowPatty | - |
| E73_Scythe | - |
| E74_AshTrees | Before(Fencing) |
| E75_StoneAxe | - |
| E76_LumberPile | - |
| E78_SleightofHand | - |
| E82_Profiteering | - |
| E84_DollysMother | - |
| E85_MasterTanner | - |
| E86_PenBuilder | - |
| E90_DungCollector | - |
| E91_PlowBuilder | - |
| E92_FieldDoctor | - |
| E93_Motivator | - |
| E103_Wolf | After(Obtain, Gain, Receive, Reap, Collect) |
| E109_BraidMaker | - |
| E112_GrainThief | - |
| E123_ResourceHoarder | ComputeCosts(Renovation, Construct) |
| E124_MayorCandidate | - |
| E130_Overachiever | IsDoable(WishChildren) |
| E133_ChampionBreeder | - |
| E134_Omnifarmer | - |
| E148_Lazybones | - |
| E151_DeliveryNurse | - |
| E153_StoneSculptor | - |
| E155_Visionary | - |
| E159_OldMiser | - |
| E161_ElderBaker | - |
| E162_Entrepreneur | - |
| E166_Roastmaster | - |
| E167_DairyCrier | - |

---

## 待实现卡牌优先级

### 高优先级 (核心游戏机制)
1. A73_AgriculturalFertilizers - 多行动 After Hook
2. B27_Toolbox - 多行动 After Hook
3. B132_EstateMaster - 多行动 After Hook
4. C48_Farmstead - 多行动 After Hook

### 中优先级 (复杂 Hook)
1. D88_Millwright - 多类型 ComputeCosts
2. E87_MasterRenovator - ComputeCosts
3. D21_Recruitment - ComputeReplace + IsDoable
4. C140_PackagingArtist - ComputeReplace + IsDoable

### 低优先级 (简单效果)
- 其他无 Hook 的基础卡牌
