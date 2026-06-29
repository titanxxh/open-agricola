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
| C001_Overhaul | true | (missing) |
| C006_StoneClearing | true | (missing) |
| C009_AutomaticWaterTrough | true | (missing) |
| D001_ZigzagHarrow | true | (missing) |
| E005_NightLoot | true | (missing) |

## ❌ Complex deviations (manual review)
### cost
| Card | BGA | Ours |
|---|---|---|
| C054_MarketBooth | `{"stable":1}` | (missing) |

### prerequisite
| Card | BGA | Ours |
|---|---|---|
| A003_PaperKnife | (missing) | 3 Occupations In Hand |
| B154_SheepKeeper | (missing) | Less Than 7 Sheep |
| B056_Brook | (missing) | Farmer on Fishing Space |
| B074_ThickForest | (missing) | 5 Clay in Your Supply |

## 🔍 Single-sided
### BGA-only (no matching TS file)

### TS-only (no matching BGA file)

### Banned in BGA but present in TS (route to §2.5)
- A131_CraftTeacher
- A133_Braggart
- A014_CarpentersHammer
- A033_BigCountry
- A039_Chapel
- A048_ShavingHorse
- A082_WorkCertificate
- A097_Freshman
- B010_Caravan
- B117_Informant
- B132_EstateMaster
- B151_LittlePeasant
- B015_CarpentersBench
- B161_Weakling
- B021_HayloftBarn
- B022_WalkingBoots
- C102_TreeGuard
- C125_Nightworker
- C028_TeachersDesk
- C031_WritingChamber
- C003_CarriageTrip
- C060_SmallPottersOven
- C063_CraftBrewery
- C099_GardenDesigner
- D137_TradeTeacher
- D019_PulverizerPlow
- D021_Recruitment
- D033_SummerHouse
- D004_CrossCutWood
- D074_RoyalWood
- D092_ChildOmbudsman
- D097_BeggingStudent
- E022_GuestRoom
