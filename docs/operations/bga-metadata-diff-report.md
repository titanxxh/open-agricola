# BGA Metadata Diff Report (2026-05-19)

## Summary
- Total BGA cards scanned: 888
- Total TS cards scanned: 888
- ⚠ Literal deviations: 5
- ❌ Complex deviations: 5
- 🔍 BGA-only: 0
- 🔍 TS-only: 0
- 🔍 Banned-but-present: 33

## ⚠ Literal deviations (auto-fixable)
### passing
| Card | BGA | Ours |
|---|---|---|
| C1_Overhaul | true | (missing) |
| C6_StoneClearing | true | (missing) |
| C9_AutomaticWaterTrough | true | (missing) |
| D1_ZigzagHarrow | true | (missing) |
| E5_NightLoot | true | (missing) |

## ❌ Complex deviations (manual review)
### cost
| Card | BGA | Ours |
|---|---|---|
| C54_MarketBooth | `{"stable":1}` | (missing) |

### prerequisite
| Card | BGA | Ours |
|---|---|---|
| A3_PaperKnife | (missing) | 3 Occupations In Hand |
| B154_SheepKeeper | (missing) | Less Than 7 Sheep |
| B56_Brook | (missing) | Farmer on Fishing Space |
| B74_ThickForest | (missing) | 5 Clay in Your Supply |

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
