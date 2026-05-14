# Card Description Audit

> Current-only audit note for card descriptions, metadata, and BGA name mapping.
> Completed sprint notes are omitted.

## 1. Current Verdict

Open Agricola has full canonical coverage against the current BGA card metadata:

| Check | Result |
|---|---:|
| BGA canonical cards scanned | 888 |
| OA canonical card buckets scanned | 888 |
| BGA-only canonical buckets | 0 |
| OA-only canonical buckets | 0 |
| Literal metadata mismatches | 0 |
| Complex metadata/schema-up mismatches | 4 |
| BGA-banned cards present in OA | 33 |

The card-description audit is clean at the literal metadata level. Remaining
work is either behavior/registration work tracked in `docs/card_progress.md` or
policy/schema-up divergence listed below.

## 2. Canonical Name Mapping

The audit normalizes known BGA legacy names before comparing coverage.

| Canonical card | Legacy / alternate source name | Current handling |
|---|---|---|
| `C54_MarketBooth` | `C54_MarketStall` | Treat `MarketBooth` as canonical. |
| `C71_Slurry` | `C71_SlurrySpreader` | Treat `Slurry` as canonical; duplicate TS registration remains a fix item. |
| `D11_LawnFertilizer` | `D11_LawnFertilzer` | Treat correctly spelled `LawnFertilizer` as canonical. |
| `E132_VeggieLover` | `E132_Shearer` | Treat `VeggieLover` as canonical. |

`D159_ReedSeller` is also not a missing implementation: BGA marks it
`implemented=false`, and OA keeps it data-only.

## 3. Complex Metadata Differences

BGA expresses these buyability rules inside custom code instead of a plain
metadata prerequisite. OA keeps explicit prerequisite metadata for UI and test
clarity.

| Card | OA field | BGA shape | Status |
|---|---|---|---|
| `A3_PaperKnife` | Explicit `prerequisite` label/handler. | Custom `isBuyable`, no plain prerequisite field. | Accepted schema-up divergence. |
| `B154_SheepKeeper` | Explicit `prerequisite` label/handler. | Custom `isBuyable`, no plain prerequisite field. | Accepted schema-up divergence. |
| `B56_Brook` | Explicit `prerequisite` label/handler. | Custom `isBuyable`, no plain prerequisite field. | Accepted schema-up divergence. |
| `B74_ThickForest` | Explicit `prerequisite` label/handler. | Custom `isBuyable`, no plain prerequisite field. | Accepted schema-up divergence. |

## 4. BGA-Banned Cards Present In OA

BGA marks these cards as banned/non-standard, but OA currently keeps them
available by product policy. They should not be counted as metadata mismatches.

`A131_GuestRoom`, `A133_ClappingArea`, `A14_CarpentersHammer`,
`A33_RecycledBrick`, `A39_Smallholding`, `A48_StableDeliveryman`,
`A82_Wintercrafter`, `A97_BreadCarrier`, `B10_ChickenCoop`,
`B117_Mastermind`, `B132_FestivalManager`, `B151_Tradesperson`, `B15_Flail`,
`B161_Trident`, `B21_FarmSchoolGraduate`, `B22_Punner`, `C102_SackCart`,
`C125_Educator`, `C28_FishingNet`, `C31_ShepherdsPipe`,
`C3_CarpentersBench`, `C60_CatLover`, `C63_GoatCatcher`,
`C99_GardenDesigner`, `D137_Countryman`, `D19_DrinkerOfAbsinthe`,
`D21_BrushwoodRoof`, `D33_MasterBreeder`, `D4_ChickenFeeder`,
`D74_TenantFarmer`, `D92_SnackTime`, `D97_AutonomousPicker`,
`E22_FieldWatchman`.

## 5. Behavior Audit Handoff

The description audit does not decide runtime equivalence. Current behavior
gaps are tracked in `docs/card_progress.md` section 2. As of this audit, that
queue contains:

`A148_Woolgrower`, `B86_TruffleSearcher`, `B157_Salter`,
`C8_PlantFertilizer`, `C57_Crudite`, `C71_Slurry`, `C140_PackagingArtist`,
`D13_Trowel`, `D15_ClaySupports`, `D66_PotterCeramics`, `E5_NightLoot`.

## 6. Reproduce

Run the mechanical metadata report:

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

Expected current summary:

```text
Total BGA cards scanned: 888
Total TS cards scanned: 888
literal: 0
complex: 4
BGA-only canonical ids: 0
TS-only canonical ids: 0
Banned-but-present cards: 33
```
