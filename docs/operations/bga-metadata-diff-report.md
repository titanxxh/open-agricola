# BGA Metadata Diff Report (2026-05-12)

## Summary
- Total BGA cards scanned: 888
- Total TS cards scanned: 888
- ⚠ Literal deviations: 8
- ❌ Complex deviations: 42
- 🔍 BGA-only: 0
- 🔍 TS-only: 0
- 🔍 Banned-but-present: 33

## ⚠ Literal deviations (auto-fixable)
### extraVp
| Card | BGA | Ours |
|---|---|---|
| B132_EstateMaster | true | (missing) |
| C148_MudWallower | (missing) | true |
| C31_WritingChamber | true | (missing) |
| C63_CraftBrewery | true | (missing) |
| C99_GardenDesigner | true | (missing) |
| D33_SummerHouse | true | (missing) |
| D92_ChildOmbudsman | true | (missing) |

### vp
| Card | BGA | Ours |
|---|---|---|
| A39_Chapel | 3 | (missing) |

## ❌ Complex deviations (manual review)
### category
| Card | BGA | Ours |
|---|---|---|
| E22_GuestRoom | FARMYARD_-_PLACE_FOR_PERSON | (missing) |

### players
| Card | BGA | Ours |
|---|---|---|
| A133_Braggart | 3+ | 1+ |
| A134_FullFarmer | 3+ | 1+ |
| B132_EstateMaster | 3+ | 1+ |
| B153_Housemaster | 4+ | 1+ |
| D128_BuildingTycoon | 3+ | 4+ |
| D149_CasualWorker | 4+ | 3+ |

### cost
| Card | BGA | Ours |
|---|---|---|
| A1_Shelter | (missing) | `{"wood":0}` |
| A25_Bassinet | `{"wood":1,"reed":1}` | (missing) |
| A31_DebtSecurity | `{"food":2}` | (missing) |
| A64_BarleyMill | (missing) | `{"wood":1}` |
| B26_AgrarianFences | (missing) | `{"wood":1}` |
| B48_ForestStone | (missing) | `{"wood":2,"stone":1}` |
| B5_StoreofExperience | (missing) | `{"food":1}` |
| B7_Wage | (missing) | `{"food":1}` |
| B9_BeatingRod | (missing) | `{"wood":1}` |
| D80_BrickHammer | (missing) | `{"wood":1}` |
| D82_HuntingTrophy | (missing) | `{"boar":1}` |
| E30_ChildsToy | (missing) | `{"wood":1}` |
| E35_Misanthropy | `{"wood":1}` | (missing) |
| E38_RodCollection | (missing) | `{"wood":1}` |

### altCosts
| Card | BGA | Ours |
|---|---|---|
| B48_ForestStone | `[{"wood":2},{"stone":1}]` | (missing) |
| C40_CanvasSack | `[{"grain":1},{"reed":1}]` | (missing) |
| C44_ChickenCoop | `[{"clay":2},{"wood":2}]` | `[{"clay":2,"reed":1},{"wood":2,"reed":1}]` |
| D80_BrickHammer | `[{"wood":1},{"food":1}]` | `[{"food":1}]` |
| E30_ChildsToy | `[{"wood":1},{"clay":1}]` | `[{"clay":1}]` |
| E52_Cubbyhole | `[{"wood":1},{"clay":1}]` | (missing) |

### prerequisite
| Card | BGA | Ours |
|---|---|---|
| A20_DoubleTurnPlow | Play in Round 3 (5) or Before | Round 5 or Before |
| A3_PaperKnife | (missing) | 3 Occupations In Hand |
| B154_SheepKeeper | (missing) | Less Than 7 Sheep |
| B18_GrasslandHarrow | 2 Occ., 1 Resource After Payment | 2 Occupations |
| B56_Brook | (missing) | 1 Occupation |
| B74_ThickForest | (missing) | 5 Clay in Your Supply |
| C30_HalfTimberedHouse | (missing) | Stone House |
| C35_LanternHouse | No occupation | No Occupations |
| C54_MarketBooth | (missing) | 1 Stable in Reserve |
| D1_ZigzagHarrow | 3 Fields in an \"L\" Shape | 3 Fields in an  |
| D30_ArtisanDistrict | 3 Occupations | (missing) |
| D50_ForeignAid | Play in Round 11 or Before | (missing) |
| E37_OxSkull | 1 cattle | 1 Cattle |
| E38_RodCollection | 3 Occupations | (missing) |
| E39_Paintbrush | 1 pig | 1 Pig |

## 🔍 Single-sided
### BGA-only (no matching TS file)

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
