# BGA Metadata Diff Report (2026-05-12)

## Summary
- Total BGA cards scanned: 888
- Total TS cards scanned: 888
- ⚠ Literal deviations: 1
- ❌ Complex deviations: 7
- 🔍 BGA-only: 0
- 🔍 TS-only: 0
- 🔍 Banned-but-present: 33

## ⚠ Literal deviations (auto-fixable)
### extraVp
| Card | BGA | Ours |
|---|---|---|
| C148_MudWallower | (missing) | true |

## ❌ Complex deviations (manual review)
### prerequisite
| Card | BGA | Ours |
|---|---|---|
| A3_PaperKnife | (missing) | 3 Occupations In Hand |
| B154_SheepKeeper | (missing) | Less Than 7 Sheep |
| B56_Brook | (missing) | 1 Occupation |
| B74_ThickForest | (missing) | 5 Clay in Your Supply |
| C30_HalfTimberedHouse | (missing) | Stone House |
| C54_MarketBooth | (missing) | 1 Stable in Reserve |
| D1_ZigzagHarrow | 3 Fields in an \"L\" Shape | 3 Fields in an  |

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

---

## Appendix: BGA same-deck-number multi-file

These BGA cards have 2 PHP files for the same deck+number; the parser canonical pick (TS-id-match > non-banned > alphabetic) selects the OA-aligned one:

- C54: BGA C54_MarketBooth (canonical) + C54_MarketStall (legacy name)
- D11: BGA D11_LawnFertilizer (canonical) + D11_LawnFertilzer (typo, legacy)
- E132: BGA E132_VeggieLover (canonical) + E132_Shearer (legacy name)
