# BGA Metadata Diff Report (2026-05-12)

## Summary
- Total BGA cards scanned: 892
- Total TS cards scanned: 889
- ⚠ Literal deviations: 74
- ❌ Complex deviations: 644
- 🔍 BGA-only: 3
- 🔍 TS-only: 0
- 🔍 Banned-but-present: 33

## ⚠ Literal deviations (auto-fixable)
### extraVp
| Card | BGA | Ours |
|---|---|---|
| B100_Clutterer | true | (missing) |
| B101_FurnitureCarpenter | true | (missing) |
| B111_Rustic | true | (missing) |
| B134_HousebookMaster | true | (missing) |
| B135_NutritionExpert | true | (missing) |
| B153_Housemaster | true | (missing) |
| B154_SheepKeeper | true | (missing) |
| B30_WoodPalisades | true | (missing) |
| B31_PotteryYard | true | (missing) |
| B33_Mantlepiece | true | (missing) |
| B34_SpecialFood | true | (missing) |
| B35_HookKnife | true | (missing) |
| B39_Loom | true | (missing) |
| B98_OrganicFarmer | true | (missing) |
| B99_Tutor | true | (missing) |
| C100_Butler | true | (missing) |
| C101_StallHolder | true | (missing) |
| C110_HomeBrewer | true | (missing) |
| C133_Soldier | true | (missing) |
| C134_CowPrince | true | (missing) |
| C135_Constable | true | (missing) |
| C136_RanchProvost | true | (missing) |
| C148_MudWallower | (missing) | true |
| C153_PatternMaker | true | (missing) |
| C154_TwinResearcher | true | (missing) |
| C29_BeerTable | true | (missing) |
| C30_HalfTimberedHouse | true | (missing) |
| C33_GreeningPlan | true | (missing) |
| C34_ElephantgrassPlant | true | (missing) |
| C35_LanternHouse | true | (missing) |
| C36_ClayDeposit | true | (missing) |
| C39_StudioBoat | true | (missing) |
| C46_Mandoline | true | (missing) |
| C59_SchnappsDistillery | true | (missing) |
| C61_BeerStein | true | (missing) |
| C98_CubeCutter | true | (missing) |
| D101_SugarBaker | true | (missing) |
| D107_Bellfounder | true | (missing) |
| D133_BeerTentOperator | true | (missing) |
| D134_OysterEater | true | (missing) |
| D135_GardeningHeadOfficial | true | (missing) |
| D136_AnimalActivist | true | (missing) |
| D153_WealthyMan | true | (missing) |
| D154_ChimneySweep | true | (missing) |
| D157_PartyOrganizer | true | (missing) |
| D29_MuckRake | true | (missing) |
| D30_ArtisanDistrict | true | (missing) |
| D31_Storeroom | true | (missing) |
| D32_WoodRake | true | (missing) |
| D35_FodderChamber | true | (missing) |
| D36_BreedRegistry | true | (missing) |
| D38_MilkingStool | true | (missing) |
| D39_TruffleSlicer | true | (missing) |
| D99_EarthenwarePotter | true | (missing) |
| E100_MuseumCaretaker | true | (missing) |
| E101_Blighter | true | (missing) |
| E124_MayorCandidate | true | (missing) |
| E132_VeggieLover | true | (missing) |
| E133_ChampionBreeder | true | (missing) |
| E134_Omnifarmer | true | (missing) |
| E135_Pickler | true | (missing) |
| E136_AnimalHusbandryWorker | true | (missing) |
| E154_Margrave | true | (missing) |
| E31_Upholstery | true | (missing) |
| E32_Nave | true | (missing) |
| E33_BeaverColony | true | (missing) |
| E34_LandRegister | true | (missing) |
| E35_Misanthropy | true | (missing) |
| E37_OxSkull | true | (missing) |
| E38_RodCollection | true | (missing) |
| E39_Paintbrush | true | (missing) |
| E98_Prodigy | true | (missing) |
| E99_UncaringParents | true | (missing) |

### vp
| Card | BGA | Ours |
|---|---|---|
| E81_AlchemistsLab | 1 | (missing) |

## ❌ Complex deviations (manual review)
### category
| Card | BGA | Ours |
|---|---|---|
| B148_PetBroker | FARM_PLANNER | (missing) |
| D148_DomesticianExpert | FARM_PLANNER | (missing) |
| E103_Wolf | GOODS_-_GET | (missing) |
| E10_StrawHat | ACTION_-_GUEST | (missing) |
| E112_GrainThief | CROPS_-_GRAIN | (missing) |
| E123_ResourceHoarder | BUILDING_RESOURCES_-_CLAY_AND/OR_STONE | (missing) |
| E124_MayorCandidate | BUILDING_RESOURCES_-_STONE | (missing) |
| E133_ChampionBreeder | BONUS_POINTS | (missing) |
| E140_Carter | FOOD | (missing) |
| E148_Lazybones | FARMYARD_-_PLACE_FOR_ANIMALS | (missing) |
| E149_MidnightFencer | FARMYARD | (missing) |
| E151_DeliveryNurse | ACTION | (missing) |
| E161_ElderBaker | CROPS | (missing) |
| E162_Entrepreneur | BUILDING_RESOURCES | (missing) |
| E167_DairyCrier | ANIMALS_-_ALL | (missing) |
| E16_BriarHedge | FARMYARD_-__FENCING_OR_STABLE_BUILDING | (missing) |
| E27_PiggyBank | ACTION_-_IMPROVEMENT | (missing) |
| E28_Bookmark | ACTION_-_OCCUPATION | (missing) |
| E47_SyrupTap | FOOD | (missing) |
| E4_Thunderbolt | PASSING_-_IMPROVEMENT/OCC_-_WOOD | (missing) |
| E62_SourDough | FOOD_-_GRAIN | (missing) |
| E71_CowPatty | CROPS_-_GRAIN_AND_VEGETABLE | (missing) |
| E73_Scythe | CROPS_-_GRAIN_AND_VEGETABLE | (missing) |
| E74_AshTrees | BUILDING_RESOURCES_-_WOOD | (missing) |
| E75_StoneAxe | BUILDING_RESOURCES_-_WOOD | (missing) |
| E81_AlchemistsLab | BUILDING_RESOURCES_-_ALL | (missing) |
| E82_Profiteering | BUILDING_RESOURCES_-_ALL | (missing) |
| E84_DollysMother | ANIMALS_ | (missing) |
| E85_MasterTanner | FARMYARD_-_PLACE_FOR_PERSON | (missing) |
| E90_DungCollector | FARMYARD_-_PLOWING | (missing) |
| E91_PlowBuilder | FARMYARD_-_PLOWING | (missing) |
| E92_FieldDoctor | ACTION_-_FAMILY_GROWTH | (missing) |
| E93_Motivator | ACTION_-_GUEST | (missing) |

### players
| Card | BGA | Ours |
|---|---|---|
| A134_FullFarmer | 3+ | 1+ |
| B153_Housemaster | 4+ | 1+ |
| B70_NewPurchase | (missing) | 1+ |
| B83_MuddyPuddles | (missing) | 1+ |
| C42_RavenousHunger | (missing) | 1+ |
| C80_RockyTerrain | (missing) | 1+ |
| D128_BuildingTycoon | 3+ | 4+ |
| D149_CasualWorker | 4+ | 3+ |
| D49_Bookshelf | (missing) | 1+ |
| D50_ForeignAid | (missing) | 1+ |
| E40_BeeStatue | (missing) | 1+ |

### cost
| Card | BGA | Ours |
|---|---|---|
| A100_Curator | (missing) | `{}` |
| A101_CookeryOutfitter | (missing) | `{}` |
| A102_Grocer | (missing) | `{}` |
| A103_Portmonger | (missing) | `{}` |
| A104_WoodHarvester | (missing) | `{}` |
| A105_BarrowPusher | (missing) | `{}` |
| A106_SlurrySpreader | (missing) | `{}` |
| A107_Catcher | (missing) | `{}` |
| A108_MushroomCollector | (missing) | `{}` |
| A109_SmallTrader | (missing) | `{}` |
| A10_WoodenShed | `{}` | `{"wood":2,"reed":1}` |
| A110_Roughcaster | (missing) | `{}` |
| A111_WallBuilder | (missing) | `{}` |
| A112_ScytheWorker | (missing) | `{}` |
| A113_HeresyTeacher | (missing) | `{}` |
| A114_SeasonalWorker | (missing) | `{}` |
| A115_ChiefForester | (missing) | `{}` |
| A116_WoodCutter | (missing) | `{}` |
| A117_WoodCarrier | (missing) | `{}` |
| A118_Treegardener | (missing) | `{}` |
| A119_FirewoodCollector | (missing) | `{}` |
| A120_ClayHutBuilder | (missing) | `{}` |
| A121_ClayPuncher | (missing) | `{}` |
| A122_PanBaker | (missing) | `{}` |
| A123_FrameBuilder | (missing) | `{}` |
| A124_Knapper | (missing) | `{}` |
| A125_Priest | (missing) | `{}` |
| A126_MasterWorkman | (missing) | `{}` |
| A127_Lodger | (missing) | `{}` |
| A128_RiparianBuilder | (missing) | `{}` |
| A129_Swagman | (missing) | `{}` |
| A130_MummysBoy | (missing) | `{}` |
| A132_Publican | (missing) | `{}` |
| A134_FullFarmer | (missing) | `{}` |
| A135_AnimalReeve | (missing) | `{}` |
| A136_DrudgeryReeve | (missing) | `{}` |
| A137_RiverineShepherd | (missing) | `{}` |
| A138_Harpooner | (missing) | `{}` |
| A139_HollowWarden | (missing) | `{}` |
| A140_ShovelBearer | (missing) | `{}` |
| A141_TurnipFarmer | (missing) | `{}` |
| A142_Cordmaker | (missing) | `{}` |
| A143_Stonecutter | (missing) | `{}` |
| A144_Sequestrator | (missing) | `{}` |
| A145_Ropemaker | (missing) | `{}` |
| A146_StorehouseSteward | (missing) | `{}` |
| A147_AnimalDealer | (missing) | `{}` |
| A148_Woolgrower | (missing) | `{}` |
| A149_HouseArtist | (missing) | `{}` |
| A150_Stagehand | (missing) | `{}` |
| A151_Minstrel | (missing) | `{}` |
| A152_NightSchoolStudent | (missing) | `{}` |
| A153_PigOwner | (missing) | `{}` |
| A154_Paymaster | (missing) | `{}` |
| A155_Conjurer | (missing) | `{}` |
| A156_Buyer | (missing) | `{}` |
| A157_Bohemian | (missing) | `{}` |
| A158_CulinaryArtist | (missing) | `{}` |
| A159_JoineroftheSea | (missing) | `{}` |
| A160_Lutenist | (missing) | `{}` |
| A161_PatchCaretaker | (missing) | `{}` |
| A162_ForestTallyman | (missing) | `{}` |
| A163_BuildingExpert | (missing) | `{}` |
| A164_WoodWorker | (missing) | `{}` |
| A165_PigBreeder | (missing) | `{}` |
| A166_Haydryer | (missing) | `{}` |
| A167_BreederBuyer | (missing) | `{}` |
| A168_AnimalTeacher | (missing) | `{}` |
| A169_OffSiter | (missing) | `{}` |
| A16_RammedClay | (missing) | `{}` |
| A170_Hayward | (missing) | `{}` |
| A171_Sidekick | (missing) | `{}` |
| A172_BoatPainter | (missing) | `{}` |
| A173_ClayThief | (missing) | `{}` |
| A174_MasterHora | (missing) | `{}` |
| A175_HollowGardener | (missing) | `{}` |
| A176_Wheelmaker | (missing) | `{}` |
| A177_Middleman | (missing) | `{}` |
| A178_CarpentersBoy | (missing) | `{}` |
| A179_MountainShepherd | (missing) | `{}` |
| A180_AnimalBrander | (missing) | `{}` |
| A1_Shelter | (missing) | `{"wood":0}` |
| A20_DoubleTurnPlow | `{}` | `{"grain":1}` |
| A21_FamilyFriendHome | (missing) | `{}` |
| A23_StoneCompany | `{}` | `{"clay":2,"reed":1}` |
| A27_OvenSite | (missing) | `{}` |
| A29_AleBenches | `{"wood":1}` | `{}` |
| A30_BakingSheet | (missing) | `{}` |
| A31_DebtSecurity | `{"food":2}` | `{}` |
| A34_Loppers | `{}` | `{"wood":1}` |
| A37_Bucksaw | `{"wood":1}` | `{}` |
| A38_WoolBlankets | (missing) | `{}` |
| A41_VegetableSlicer | `{}` | `{"wood":1}` |
| A43_FarmyardManure | (missing) | `{}` |
| A53_Claypipe | `{"clay":1}` | `{}` |
| A55_JunkRoom | `{"wood":1,"clay":1}` | `{}` |
| A58_AsparagusKnife | `{}` | `{"wood":1}` |
| A60_OrientalFireplace | (missing) | `{}` |
| A61_WinnowingFan | `{}` | `{"reed":1}` |
| A64_BarleyMill | (missing) | `{"wood":1}` |
| A65_SeedPellets | (missing) | `{}` |
| A68_AsparagusGift | (missing) | `{}` |
| A6_StorageBarn | (missing) | `{}` |
| A72_CalciumFertilizers | (missing) | `{}` |
| A73_AgriculturalFertilizers | (missing) | `{}` |
| A74_StableTree | `{"wood":1}` | `{}` |
| A79_GardenHoe | `{"wood":1}` | `{}` |
| A81_InterimStorage | `{"food":2}` | `{}` |
| A83_ShepherdsCrook | `{"wood":1}` | `{}` |
| A84_Silage | (missing) | `{}` |
| A85_Homekeeper | (missing) | `{}` |
| A86_AnimalTamer | (missing) | `{}` |
| A87_Conservator | (missing) | `{}` |
| A88_HedgeKeeper | (missing) | `{}` |
| A89_StablePlanner | (missing) | `{}` |
| A90_PlowDriver | (missing) | `{}` |
| A91_ShiftingCultivator | (missing) | `{}` |
| A92_AdoptiveParents | (missing) | `{}` |
| A93_BedMaker | (missing) | `{}` |
| A94_LazySowman | (missing) | `{}` |
| A95_Angler | (missing) | `{}` |
| A96_TaskArtisan | (missing) | `{}` |
| A98_StableArchitect | (missing) | `{}` |
| A99_FellowGrazer | (missing) | `{}` |
| A9_YoungAnimalMarket | `{}` | `{"sheep":1}` |
| B100_Clutterer | (missing) | `{}` |
| B101_FurnitureCarpenter | (missing) | `{}` |
| B102_Consultant | (missing) | `{}` |
| B103_FieldMerchant | (missing) | `{}` |
| B104_SheepWalker | (missing) | `{}` |
| B105_CaseBuilder | (missing) | `{}` |
| B106_MoralCrusader | (missing) | `{}` |
| B107_Manservant | (missing) | `{}` |
| B108_OvenFiringBoy | (missing) | `{}` |
| B109_PaperMaker | (missing) | `{}` |
| B110_Pavior | (missing) | `{}` |
| B111_Rustic | (missing) | `{}` |
| B112_Silokeeper | (missing) | `{}` |
| B113_PatchCaregiver | (missing) | `{}` |
| B114_Childless | (missing) | `{}` |
| B115_TinsmithMaster | (missing) | `{}` |
| B116_Shoreforester | (missing) | `{}` |
| B118_SmallscaleFarmer | (missing) | `{}` |
| B119_Lumberjack | (missing) | `{}` |
| B120_Sweep | (missing) | `{}` |
| B121_Geologist | (missing) | `{}` |
| B122_Mineralogist | (missing) | `{}` |
| B123_RoofBallaster | (missing) | `{}` |
| B124_Trimmer | (missing) | `{}` |
| B125_EstateWorker | (missing) | `{}` |
| B126_Carpenter | (missing) | `{}` |
| B127_Seducer | (missing) | `{}` |
| B128_Plumber | (missing) | `{}` |
| B129_Seatmate | (missing) | `{}` |
| B130_FullPeasant | (missing) | `{}` |
| B131_Equipper | (missing) | `{}` |
| B133_VillagePeasant | (missing) | `{}` |
| B134_HousebookMaster | (missing) | `{}` |
| B135_NutritionExpert | (missing) | `{}` |
| B136_HouseSteward | (missing) | `{}` |
| B137_Wholesaler | (missing) | `{}` |
| B138_ForestGuardian | (missing) | `{}` |
| B139_ForestScientist | (missing) | `{}` |
| B140_FarmyardWorker | (missing) | `{}` |
| B141_FieldCaretaker | (missing) | `{}` |
| B142_Greengrocer | (missing) | `{}` |
| B143_ClayWarden | (missing) | `{}` |
| B144_Collier | (missing) | `{}` |
| B145_BrushwoodCollector | (missing) | `{}` |
| B146_Illusionist | (missing) | `{}` |
| B147_Huntsman | (missing) | `{}` |
| B148_PetBroker | (missing) | `{}` |
| B149_OpenAirFarmer | (missing) | `{}` |
| B150_LargeScaleFarmer | (missing) | `{}` |
| B152_JuniorArtist | (missing) | `{}` |
| B153_Housemaster | (missing) | `{}` |
| B154_SheepKeeper | (missing) | `{}` |
| B155_ArtTeacher | (missing) | `{}` |
| B156_StorehouseKeeper | (missing) | `{}` |
| B157_Salter | (missing) | `{}` |
| B158_DistrictManager | (missing) | `{}` |
| B159_LieutenantGeneral | (missing) | `{}` |
| B160_PubOwner | (missing) | `{}` |
| B162_ForestClearer | (missing) | `{}` |
| B163_Pastor | (missing) | `{}` |
| B164_SheepWhisperer | (missing) | `{}` |
| B165_GameProvider | (missing) | `{}` |
| B166_CattleFeeder | (missing) | `{}` |
| B167_StableSergeant | (missing) | `{}` |
| B168_PastureMaster | (missing) | `{}` |
| B169_LivestockSustainer | (missing) | `{}` |
| B170_CorralBuilder | (missing) | `{}` |
| B171_GreenhouseBuilder | (missing) | `{}` |
| B172_CattleCaregiver | (missing) | `{}` |
| B173_Sweeper | (missing) | `{}` |
| B174_RiverbankGardener | (missing) | `{}` |
| B175_FieldOverseer | (missing) | `{}` |
| B176_VillageIdiot | (missing) | `{}` |
| B177_StoneClawer | (missing) | `{}` |
| B178_TagAlong | (missing) | `{}` |
| B179_WildBoarHunter | (missing) | `{}` |
| B180_GameTeaser | (missing) | `{}` |
| B18_GrasslandHarrow | `{}` | `{"wood":2}` |
| B23_FinalScenario | (missing) | `{}` |
| B26_AgrarianFences | (missing) | `{"wood":1}` |
| B27_Toolbox | `{}` | `{"wood":1}` |
| B29_CookeryLesson | `{}` | `{"food":2}` |
| B30_WoodPalisades | `{}` | `{"food":1}` |
| B31_PotteryYard | (missing) | `{}` |
| B32_Kettle | `{}` | `{"clay":1}` |
| B34_SpecialFood | (missing) | `{}` |
| B36_Bottles | (missing) | `{}` |
| B37_Grange | (missing) | `{}` |
| B38_FutureBuildingSite | (missing) | `{}` |
| B3_Moonshine | (missing) | `{}` |
| B42_ForestInn | `{"clay":1,"reed":1}` | `{}` |
| B44_ChickStable | (missing) | `{}` |
| B46_ClubHouse | (missing) | `{}` |
| B48_ForestStone | (missing) | `{"wood":2,"stone":1}` |
| B4_WoodPile | (missing) | `{}` |
| B55_MaintenancePremium | (missing) | `{}` |
| B56_Brook | (missing) | `{}` |
| B5_StoreofExperience | (missing) | `{"food":1}` |
| B60_BrewingWater | (missing) | `{}` |
| B61_ThreeFieldRotation | (missing) | `{}` |
| B65_GrainDepot | (missing) | `{}` |
| B67_HandTruck | `{"wood":1}` | `{}` |
| B70_NewPurchase | (missing) | `{}` |
| B72_LoveforAgriculture | (missing) | `{}` |
| B74_ThickForest | (missing) | `{}` |
| B76_Ceilings | `{"clay":1}` | `{}` |
| B7_Wage | (missing) | `{"food":1}` |
| B81_Handcart | `{}` | `{"wood":1}` |
| B82_ValueAssets | (missing) | `{}` |
| B86_TruffleSearcher | (missing) | `{}` |
| B87_Cottager | (missing) | `{}` |
| B88_EstablishedPerson | (missing) | `{}` |
| B89_Groom | (missing) | `{}` |
| B90_CooperativePlower | (missing) | `{}` |
| B91_AssistantTiller | (missing) | `{}` |
| B92_LittleStickKnitter | (missing) | `{}` |
| B93_Confidant | (missing) | `{}` |
| B94_StockProtector | (missing) | `{}` |
| B95_MasterBricklayer | (missing) | `{}` |
| B96_TreeFarmJoiner | (missing) | `{}` |
| B97_Scholar | (missing) | `{}` |
| B98_OrganicFarmer | (missing) | `{}` |
| B99_Tutor | (missing) | `{}` |
| B9_BeatingRod | (missing) | `{"wood":1}` |
| C100_Butler | (missing) | `{}` |
| C101_StallHolder | (missing) | `{}` |
| C103_GreenGrocer | (missing) | `{}` |
| C104_Collector | (missing) | `{}` |
| C105_BasketCarrier | (missing) | `{}` |
| C106_PotatoHarvester | (missing) | `{}` |
| C107_Baker | (missing) | `{}` |
| C109_SchnappsDistiller | (missing) | `{}` |
| C10_BunkBeds | `{}` | `{"wood":1}` |
| C110_HomeBrewer | (missing) | `{}` |
| C111_SmallAnimalBreeder | (missing) | `{}` |
| C112_Thresher | (missing) | `{}` |
| C113_WinterCaretaker | (missing) | `{}` |
| C114_SoilScientist | (missing) | `{}` |
| C115_Sower | (missing) | `{}` |
| C116_FurnitureMaker | (missing) | `{}` |
| C117_Legworker | (missing) | `{}` |
| C119_SkillfulRenovator | (missing) | `{}` |
| C120_AgriculturalLabourer | (missing) | `{}` |
| C121_ClayKneader | (missing) | `{}` |
| C122_Bricklayer | (missing) | `{}` |
| C123_Freemason | (missing) | `{}` |
| C124_StoneImporter | (missing) | `{}` |
| C126_Excavator | (missing) | `{}` |
| C128_WoodenHutExtender | (missing) | `{}` |
| C129_SecondSpouse | (missing) | `{}` |
| C130_OutskirtsDirector | (missing) | `{}` |
| C131_PrivateTeacher | (missing) | `{}` |
| C132_TimberShingleMaker | (missing) | `{}` |
| C133_Soldier | (missing) | `{}` |
| C134_CowPrince | (missing) | `{}` |
| C135_Constable | (missing) | `{}` |
| C137_CharcoalBurner | (missing) | `{}` |
| C138_AnimalFeeder | (missing) | `{}` |
| C140_PackagingArtist | (missing) | `{}` |
| C141_SheepProvider | (missing) | `{}` |
| C142_MarketCrier | (missing) | `{}` |
| C143_StoneBuyer | (missing) | `{}` |
| C145_ForestReviewer | (missing) | `{}` |
| C146_WorkshopAssistant | (missing) | `{}` |
| C147_Cowherd | (missing) | `{}` |
| C148_MudWallower | (missing) | `{}` |
| C149_ResourceRecycler | (missing) | `{}` |
| C14_StrawThatchedRoof | (missing) | `{}` |
| C150_ParrotBreeder | (missing) | `{}` |
| C151_SowingDirector | (missing) | `{}` |
| C152_Puppeteer | (missing) | `{}` |
| C153_PatternMaker | (missing) | `{}` |
| C154_TwinResearcher | (missing) | `{}` |
| C155_FoodDistributor | (missing) | `{}` |
| C156_HoofCaregiver | (missing) | `{}` |
| C157_ResourceAnalyzer | (missing) | `{}` |
| C158_ForestCampaigner | (missing) | `{}` |
| C159_FishermansFriend | (missing) | `{}` |
| C15_Trellis | (missing) | `{}` |
| C160_Outrider | (missing) | `{}` |
| C162_ForestOwner | (missing) | `{}` |
| C163_MaterialDeliveryman | (missing) | `{}` |
| C164_GermanHeathKeeper | (missing) | `{}` |
| C167_CattleBuyer | (missing) | `{}` |
| C168_AnimalCatcher | (missing) | `{}` |
| C169_FastMason | (missing) | `{}` |
| C170_AmateurFencer | (missing) | `{}` |
| C171_YoungArtist | (missing) | `{}` |
| C172_FieldCounter | (missing) | `{}` |
| C173_TopOuter | (missing) | `{}` |
| C174_StoneCustodian | (missing) | `{}` |
| C175_VillageTeacher | (missing) | `{}` |
| C176_Cleanacre | (missing) | `{}` |
| C177_MountainHiker | (missing) | `{}` |
| C178_OnSiteReverend | (missing) | `{}` |
| C179_BovinePioneer | (missing) | `{}` |
| C17_NewlyPlowedField | (missing) | `{}` |
| C180_Trapper | (missing) | `{}` |
| C18_RollOverPlow | `{}` | `{"wood":2}` |
| C19_SwingPlow | `{}` | `{"wood":3}` |
| C22_BasketChair | `{}` | `{"reed":1}` |
| C23_JobContract | (missing) | `{}` |
| C24_BedintheGrainField | (missing) | `{}` |
| C25_SteamMachine | `{"wood":2}` | `{}` |
| C29_BeerTable | `{"wood":2}` | `{}` |
| C48_Farmstead | (missing) | `{}` |
| C49_BeerStall | `{}` | `{"wood":1}` |
| C51_FishingNet | `{"reed":1}` | `{}` |
| C52_HuntsmansHat | `{}` | `{"reed":1}` |
| C53_GypsysCrock | `{}` | `{"clay":2}` |
| C55_Studio | `{}` | `{"clay":1,"reed":1}` |
| C57_Crudite | (missing) | `{}` |
| C62_CookeryExtension | `{}` | `{"clay":2}` |
| C66_EternalRyeCultivation | (missing) | `{}` |
| C69_LandConsolidation | (missing) | `{}` |
| C70_LettucePatch | (missing) | `{}` |
| C71_Slurry | (missing) | `{}` |
| C71_SlurrySpreader | (missing) | `{}` |
| C72_FestivalPlanning | `{}` | `{"food":1}` |
| C75_Firewood | `{"food":2}` | `{}` |
| C85_DenBuilder | (missing) | `{}` |
| C86_LivestockFeeder | (missing) | `{}` |
| C87_Mason | (missing) | `{}` |
| C88_CarpentersApprentice | (missing) | `{}` |
| C89_StableMaster | (missing) | `{}` |
| C8_PlantFertilizer | (missing) | `{}` |
| C90_FieldWatchman | (missing) | `{}` |
| C91_PlowHero | (missing) | `{}` |
| C92_AutumnMother | (missing) | `{}` |
| C93_InnerDistrictsDirector | (missing) | `{}` |
| C94_StableCleaner | (missing) | `{}` |
| C95_BasketWeaver | (missing) | `{}` |
| C96_Merchant | (missing) | `{}` |
| C97_SeedResearcher | (missing) | `{}` |
| C98_CubeCutter | (missing) | `{}` |
| D100_LordoftheManor | (missing) | `{}` |
| D101_SugarBaker | (missing) | `{}` |
| D102_SampleStableMaker | (missing) | `{}` |
| D103_CanalBoatman | (missing) | `{}` |
| D104_Cultivator | (missing) | `{}` |
| D105_Sculptor | (missing) | `{}` |
| D106_WhiskyDistiller | (missing) | `{}` |
| D107_Bellfounder | (missing) | `{}` |
| D108_StoneCarver | (missing) | `{}` |
| D109_SowingMaster | (missing) | `{}` |
| D10_StorksNest | `{"reed":1}` | `{}` |
| D110_FishFarmer | (missing) | `{}` |
| D111_InteriorDecorator | (missing) | `{}` |
| D112_YoungFarmer | (missing) | `{}` |
| D113_FoodMerchant | (missing) | `{}` |
| D114_SeedTrader | (missing) | `{}` |
| D115_FodderPlanter | (missing) | `{}` |
| D116_TreeInspector | (missing) | `{}` |
| D117_WoodExpert | (missing) | `{}` |
| D118_Bonehead | (missing) | `{}` |
| D119_WoodBarterer | (missing) | `{}` |
| D11_LawnFertilizer | (missing) | `{}` |
| D120_ClayDeliveryman | (missing) | `{}` |
| D121_ClayPlasterer | (missing) | `{}` |
| D122_ClayCarrier | (missing) | `{}` |
| D123_RenovationPreparer | (missing) | `{}` |
| D124_Emissary | (missing) | `{}` |
| D125_ForestTrader | (missing) | `{}` |
| D126_FieldCultivator | (missing) | `{}` |
| D127_HardworkingMan | (missing) | `{}` |
| D128_BuildingTycoon | (missing) | `{}` |
| D129_LumberVirtuoso | (missing) | `{}` |
| D130_RecreationalCarpenter | (missing) | `{}` |
| D131_CraftsmanshipPromoter | (missing) | `{}` |
| D132_HideFarmer | (missing) | `{}` |
| D133_BeerTentOperator | (missing) | `{}` |
| D134_OysterEater | (missing) | `{}` |
| D135_GardeningHeadOfficial | (missing) | `{}` |
| D136_AnimalActivist | (missing) | `{}` |
| D138_PetLover | (missing) | `{}` |
| D139_Chairman | (missing) | `{}` |
| D140_Loudmouth | (missing) | `{}` |
| D141_SeedSeller | (missing) | `{}` |
| D142_PotatoPlanter | (missing) | `{}` |
| D143_TreeCutter | (missing) | `{}` |
| D144_WaterWorker | (missing) | `{}` |
| D145_RoofExaminer | (missing) | `{}` |
| D146_Porter | (missing) | `{}` |
| D147_TrapBuilder | (missing) | `{}` |
| D148_DomesticianExpert | (missing) | `{}` |
| D149_CasualWorker | (missing) | `{}` |
| D150_GodlySpouse | (missing) | `{}` |
| D151_SpinDoctor | (missing) | `{}` |
| D152_Patron | (missing) | `{}` |
| D153_WealthyMan | (missing) | `{}` |
| D154_ChimneySweep | (missing) | `{}` |
| D155_Ebonist | (missing) | `{}` |
| D156_RetailDealer | (missing) | `{}` |
| D158_BeanCounter | (missing) | `{}` |
| D159_ReedSeller | (missing) | `{}` |
| D160_Midwife | (missing) | `{}` |
| D161_CabbageBuyer | (missing) | `{}` |
| D162_ClayFirer | (missing) | `{}` |
| D163_JourneymanBricklayer | (missing) | `{}` |
| D164_PetGrower | (missing) | `{}` |
| D165_PigStalker | (missing) | `{}` |
| D166_StableMilker | (missing) | `{}` |
| D167_PureBreeder | (missing) | `{}` |
| D168_Stockman | (missing) | `{}` |
| D169_Plowsmith | (missing) | `{}` |
| D170_FoldBuilder | (missing) | `{}` |
| D171_SeniorTeacher | (missing) | `{}` |
| D172_PutcherMaker | (missing) | `{}` |
| D173_TownClerk | (missing) | `{}` |
| D174_LoessGardener | (missing) | `{}` |
| D175_Countryman | (missing) | `{}` |
| D176_Woodshacker | (missing) | `{}` |
| D177_Graduate | (missing) | `{}` |
| D178_SubstituteTeacher | (missing) | `{}` |
| D179_Bullcatcher | (missing) | `{}` |
| D17_DrillHarrow | `{}` | `{"wood":1}` |
| D180_PartTimeWorker | (missing) | `{}` |
| D1_ZigzagHarrow | `{}` | `{"wood":1}` |
| D23_PioneeringSpirit | (missing) | `{}` |
| D25_WitchesDanceFloor | (missing) | `{}` |
| D27_Retraining | `{}` | `{"food":1}` |
| D30_ArtisanDistrict | `{}` | `{"stone":1}` |
| D36_BreedRegistry | (missing) | `{}` |
| D3_Furrows | (missing) | `{}` |
| D40_Cesspit | (missing) | `{}` |
| D50_ForeignAid | (missing) | `{}` |
| D51_Archway | `{"clay":2}` | `{}` |
| D56_FatstockStretcher | `{}` | `{"wood":1}` |
| D59_EarthOven | (missing) | `{}` |
| D60_LargePottery | `{}` | `{"clay":1,"stone":1}` |
| D61_BaleofStraw | (missing) | `{}` |
| D63_Lynchet | (missing) | `{}` |
| D64_BakingCourse | (missing) | `{}` |
| D66_PotterCeramics | (missing) | `{}` |
| D68_SmallBasket | (missing) | `{}` |
| D6_PetrifiedWood | (missing) | `{}` |
| D70_StrawManure | (missing) | `{}` |
| D71_Changeover | (missing) | `{}` |
| D72_StableManure | (missing) | `{}` |
| D78_ReedPond | (missing) | `{}` |
| D80_BrickHammer | (missing) | `{"wood":1}` |
| D82_HuntingTrophy | (missing) | `{"boar":1}` |
| D84_FeedPellets | (missing) | `{}` |
| D85_Reader | (missing) | `{}` |
| D86_SheepAgent | (missing) | `{}` |
| D87_MasterBuilder | (missing) | `{}` |
| D88_Millwright | (missing) | `{}` |
| D89_Stablehand | (missing) | `{}` |
| D90_PlowMaker | (missing) | `{}` |
| D91_Plowman | (missing) | `{}` |
| D93_SheepInspector | (missing) | `{}` |
| D94_HenpeckedHusband | (missing) | `{}` |
| D95_SiteManager | (missing) | `{}` |
| D96_Furnisher | (missing) | `{}` |
| D98_Transactor | (missing) | `{}` |
| D99_EarthenwarePotter | (missing) | `{}` |
| E100_MuseumCaretaker | (missing) | `{}` |
| E101_Blighter | (missing) | `{}` |
| E102_Acquirer | (missing) | `{}` |
| E103_Wolf | (missing) | `{}` |
| E105_Pioneer | (missing) | `{}` |
| E107_LandSurveyor | (missing) | `{}` |
| E108_BlackberryFarmer | (missing) | `{}` |
| E109_BraidMaker | (missing) | `{}` |
| E10_StrawHat | `{"reed":1}` | `{}` |
| E110_Dentist | (missing) | `{}` |
| E111_Recluse | (missing) | `{}` |
| E112_GrainThief | (missing) | `{}` |
| E113_Godmother | (missing) | `{}` |
| E114_ShedBuilder | (missing) | `{}` |
| E115_SeedServant | (missing) | `{}` |
| E116_FirCutter | (missing) | `{}` |
| E117_PipeSmoker | (missing) | `{}` |
| E118_KindlingGatherer | (missing) | `{}` |
| E121_HillCultivator | (missing) | `{}` |
| E122_Cottar | (missing) | `{}` |
| E123_ResourceHoarder | (missing) | `{}` |
| E124_MayorCandidate | (missing) | `{}` |
| E125_DelayedWayfarer | (missing) | `{}` |
| E126_TaxCollector | (missing) | `{}` |
| E128_Saddler | (missing) | `{}` |
| E129_Imitator | (missing) | `{}` |
| E12_AnimalBedding | (missing) | `{}` |
| E130_Overachiever | (missing) | `{}` |
| E131_MarketMaster | (missing) | `{}` |
| E132_VeggieLover | (missing) | `{}` |
| E133_ChampionBreeder | (missing) | `{}` |
| E134_Omnifarmer | (missing) | `{}` |
| E135_Pickler | (missing) | `{}` |
| E136_AnimalHusbandryWorker | (missing) | `{}` |
| E137_FlaxFarmer | (missing) | `{}` |
| E140_Carter | (missing) | `{}` |
| E141_VegetableVendor | (missing) | `{}` |
| E142_Smuggler | (missing) | `{}` |
| E143_Hewer | (missing) | `{}` |
| E144_WaresSalesman | (missing) | `{}` |
| E146_Reseller | (missing) | `{}` |
| E147_AnimalDriver | (missing) | `{}` |
| E148_Lazybones | (missing) | `{}` |
| E149_MidnightFencer | (missing) | `{}` |
| E150_RockBeater | (missing) | `{}` |
| E151_DeliveryNurse | (missing) | `{}` |
| E152_BargainHunter | (missing) | `{}` |
| E153_StoneSculptor | (missing) | `{}` |
| E154_Margrave | (missing) | `{}` |
| E156_ClaypitOwner | (missing) | `{}` |
| E157_Usufructuary | (missing) | `{}` |
| E158_StoneCustodian | (missing) | `{}` |
| E160_KelpGatherer | (missing) | `{}` |
| E161_ElderBaker | (missing) | `{}` |
| E162_Entrepreneur | (missing) | `{}` |
| E163_Patroness | (missing) | `{}` |
| E164_MountainPlowman | (missing) | `{}` |
| E165_MasterHuntsman | (missing) | `{}` |
| E166_Roastmaster | (missing) | `{}` |
| E167_DairyCrier | (missing) | `{}` |
| E168_AnimalTamersApprentice | (missing) | `{}` |
| E16_BriarHedge | (missing) | `{}` |
| E23_Apiary | (missing) | `{}` |
| E24_Ambition | (missing) | `{}` |
| E27_PiggyBank | (missing) | `{}` |
| E29_Heirloom | (missing) | `{}` |
| E30_ChildsToy | (missing) | `{"wood":1}` |
| E31_Upholstery | (missing) | `{}` |
| E33_BeaverColony | (missing) | `{}` |
| E35_Misanthropy | `{"wood":1}` | `{}` |
| E37_OxSkull | (missing) | `{}` |
| E38_RodCollection | (missing) | `{"wood":1}` |
| E4_Thunderbolt | (missing) | `{}` |
| E50_WildGreens | (missing) | `{}` |
| E52_Cubbyhole | (missing) | `{}` |
| E58_LunchtimeBeer | (missing) | `{}` |
| E60_WorkingGloves | (missing) | `{}` |
| E62_SourDough | (missing) | `{}` |
| E63_IronOven | `{}` | `{"stone":3}` |
| E70_CropRotationField | (missing) | `{}` |
| E71_CowPatty | (missing) | `{}` |
| E73_Scythe | `{"wood":1}` | `{}` |
| E74_AshTrees | (missing) | `{}` |
| E81_AlchemistsLab | (missing) | `{}` |
| E82_Profiteering | (missing) | `{}` |
| E84_DollysMother | (missing) | `{}` |
| E85_MasterTanner | (missing) | `{}` |
| E86_PenBuilder | (missing) | `{}` |
| E87_MasterRenovator | (missing) | `{}` |
| E88_MasterFencer | (missing) | `{}` |
| E89_Stallwright | (missing) | `{}` |
| E90_DungCollector | (missing) | `{}` |
| E91_PlowBuilder | (missing) | `{}` |
| E92_FieldDoctor | (missing) | `{}` |
| E93_Motivator | (missing) | `{}` |
| E95_Miller | (missing) | `{}` |
| E96_Elder | (missing) | `{}` |
| E99_UncaringParents | (missing) | `{}` |

### prerequisite
| Card | BGA | Ours |
|---|---|---|
| A18_WheelPlow | ('2 Occupations') | 2 Occupations |
| A20_DoubleTurnPlow | Play in Round 3 (5) or Before | Round 5 or Before |
| A35_SwimmingClass | ('2 Occupations') | 2 Occupations |
| A3_PaperKnife | (missing) | 3 Occupations In Hand |
| A61_WinnowingFan | ('Baking Improvement') | Baking Improvement |
| B154_SheepKeeper | (missing) | Less Than 7 Sheep |
| B18_GrasslandHarrow | 2 Occ., 1 Resource After Payment | 2 Occupations |
| B56_Brook | (missing) | 1 Occupation |
| B74_ThickForest | (missing) | 5 Clay in Your Supply |
| C30_HalfTimberedHouse | (missing) | Stone House |
| C35_LanternHouse | No occupation | No Occupations |
| C54_MarketBooth | (missing) | 1 Stable in Reserve |
| C81_MaterialHub | ('1 reed and 1 stone in your supply') | 1 reed and 1 stone in your supply |
| D1_ZigzagHarrow | 3 Fields in an \"L\" Shape | 3 Fields in an  |
| D25_WitchesDanceFloor | ('see below') | see below |
| D30_ArtisanDistrict | 3 Occupations | (missing) |
| D50_ForeignAid | Play in Round 11 or Before | (missing) |
| D51_Archway | ('No Occupations') | No Occupations |
| E37_OxSkull | 1 cattle | 1 Cattle |
| E38_RodCollection | 3 Occupations | (missing) |
| E39_Paintbrush | 1 pig | 1 Pig |

## 🔍 Single-sided
### BGA-only (no matching TS file)
- C54_MarketStall
- D11_LawnFertilzer
- E132_Shearer

### TS-only (no matching BGA file)

### Banned in BGA but present in TS (route to §2.5)
- A131_CraftTeacher
- A133_Braggart
- A14_CarpentersHammer
- A33_BigCountry
- A39_Chapel
- A48_ShavingHorse
- A82_WorkCertificate
- A97_Freshman
- B10_Caravan
- B117_Informant
- B132_EstateMaster
- B151_LittlePeasant
- B15_CarpentersBench
- B161_Weakling
- B21_HayloftBarn
- B22_WalkingBoots
- C102_TreeGuard
- C125_Nightworker
- C28_TeachersDesk
- C31_WritingChamber
- C3_CarriageTrip
- C60_SmallPottersOven
- C63_CraftBrewery
- C99_GardenDesigner
- D137_TradeTeacher
- D19_PulverizerPlow
- D21_Recruitment
- D33_SummerHouse
- D4_CrossCutWood
- D74_RoyalWood
- D92_ChildOmbudsman
- D97_BeggingStudent
- E22_GuestRoom
