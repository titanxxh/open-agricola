# BGA Metadata Diff Report (2026-05-12)

## Summary
- Total BGA cards scanned: 892
- Total TS cards scanned: 889
- ⚠ Literal deviations: 1
- ❌ Complex deviations: 95
- 🔍 BGA-only: 3
- 🔍 TS-only: 0
- 🔍 Banned-but-present: 33

## ⚠ Literal deviations (auto-fixable)
### extraVp
| Card | BGA | Ours |
|---|---|---|
| C148_MudWallower | (missing) | true |

## ❌ Complex deviations (manual review)
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
| A10_WoodenShed | (missing) | `{"wood":2,"reed":1}` |
| A1_Shelter | (missing) | `{"wood":0}` |
| A20_DoubleTurnPlow | (missing) | `{"grain":1}` |
| A23_StoneCompany | (missing) | `{"clay":2,"reed":1}` |
| A29_AleBenches | `{"wood":1}` | (missing) |
| A31_DebtSecurity | `{"food":2}` | (missing) |
| A34_Loppers | (missing) | `{"wood":1}` |
| A37_Bucksaw | `{"wood":1}` | (missing) |
| A41_VegetableSlicer | (missing) | `{"wood":1}` |
| A53_Claypipe | `{"clay":1}` | (missing) |
| A55_JunkRoom | `{"wood":1,"clay":1}` | (missing) |
| A58_AsparagusKnife | (missing) | `{"wood":1}` |
| A61_WinnowingFan | (missing) | `{"reed":1}` |
| A64_BarleyMill | (missing) | `{"wood":1}` |
| A74_StableTree | `{"wood":1}` | (missing) |
| A79_GardenHoe | `{"wood":1}` | (missing) |
| A81_InterimStorage | `{"food":2}` | (missing) |
| A83_ShepherdsCrook | `{"wood":1}` | (missing) |
| A9_YoungAnimalMarket | (missing) | `{"sheep":1}` |
| B18_GrasslandHarrow | (missing) | `{"wood":2}` |
| B26_AgrarianFences | (missing) | `{"wood":1}` |
| B27_Toolbox | (missing) | `{"wood":1}` |
| B29_CookeryLesson | (missing) | `{"food":2}` |
| B30_WoodPalisades | (missing) | `{"food":1}` |
| B32_Kettle | (missing) | `{"clay":1}` |
| B42_ForestInn | `{"clay":1,"reed":1}` | (missing) |
| B48_ForestStone | (missing) | `{"wood":2,"stone":1}` |
| B5_StoreofExperience | (missing) | `{"food":1}` |
| B67_HandTruck | `{"wood":1}` | (missing) |
| B76_Ceilings | `{"clay":1}` | (missing) |
| B7_Wage | (missing) | `{"food":1}` |
| B81_Handcart | (missing) | `{"wood":1}` |
| B9_BeatingRod | (missing) | `{"wood":1}` |
| C10_BunkBeds | (missing) | `{"wood":1}` |
| C18_RollOverPlow | (missing) | `{"wood":2}` |
| C19_SwingPlow | (missing) | `{"wood":3}` |
| C22_BasketChair | (missing) | `{"reed":1}` |
| C25_SteamMachine | `{"wood":2}` | (missing) |
| C29_BeerTable | `{"wood":2}` | (missing) |
| C49_BeerStall | (missing) | `{"wood":1}` |
| C51_FishingNet | `{"reed":1}` | (missing) |
| C52_HuntsmansHat | (missing) | `{"reed":1}` |
| C53_GypsysCrock | (missing) | `{"clay":2}` |
| C55_Studio | (missing) | `{"clay":1,"reed":1}` |
| C62_CookeryExtension | (missing) | `{"clay":2}` |
| C72_FestivalPlanning | (missing) | `{"food":1}` |
| C75_Firewood | `{"food":2}` | (missing) |
| D10_StorksNest | `{"reed":1}` | (missing) |
| D17_DrillHarrow | (missing) | `{"wood":1}` |
| D1_ZigzagHarrow | (missing) | `{"wood":1}` |
| D27_Retraining | (missing) | `{"food":1}` |
| D30_ArtisanDistrict | (missing) | `{"stone":1}` |
| D51_Archway | `{"clay":2}` | (missing) |
| D56_FatstockStretcher | (missing) | `{"wood":1}` |
| D60_LargePottery | (missing) | `{"clay":1,"stone":1}` |
| D80_BrickHammer | (missing) | `{"wood":1}` |
| D82_HuntingTrophy | (missing) | `{"boar":1}` |
| E10_StrawHat | `{"reed":1}` | (missing) |
| E30_ChildsToy | (missing) | `{"wood":1}` |
| E35_Misanthropy | `{"wood":1}` | (missing) |
| E38_RodCollection | (missing) | `{"wood":1}` |
| E63_IronOven | (missing) | `{"stone":3}` |
| E73_Scythe | `{"wood":1}` | (missing) |

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
