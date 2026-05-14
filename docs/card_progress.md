# Card Progress

> Current-only status for BGA alignment. Completed sprint notes are omitted.

## 1. Current Snapshot

| Area | Current status |
|---|---:|
| BGA canonical cards scanned | 888 |
| Open Agricola canonical card buckets scanned | 888 |
| Canonical BGA-only / OA-only buckets | 0 / 0 |
| Physical TypeScript card files | 889 |
| Active BGA cards missing in OA | 0 |
| Behavior or registration gaps to fix | 11 |
| Metadata schema-up gaps | 4 |
| BGA-banned cards still present in OA by policy | 33 |
| Owner-confirmation queue | 0 |

The one extra physical TS file is the `C71` duplicate:
`C71_Slurry.ts` plus legacy `C71_SlurrySpreader.ts`. Canonically BGA uses
`C71_Slurry`; `C71_SlurrySpreader` is the legacy wrong-name entry.

## 2. Behavior And Registration Gaps

These are the remaining cards whose current implementation differs from BGA
runtime behavior or registration. They are implementation work, not owner-policy
questions.

| Card | Original behavior | Current OA behavior | BGA gap | Needed fix |
|---|---|---|---|---|
| `A148_Woolgrower` | Past feeding phases count toward sheep capacity. | Capacity is tracked from card-local `completedHarvests` after the card enters play. | BGA reads global completed feeding phases, so late play still benefits from earlier harvests. | Base capacity on global completed feeding/harvest count, not card-local post-play count. |
| `B86_TruffleSearcher` | Past feeding phases count toward boar capacity. | Same card-local post-play counter shape as `A148`. | BGA reads global completed feeding phases for late-play capacity. | Use the same global completed-feeding source as `A148`. |
| `B157_Salter` | Player may preserve multiple animal types/counts and gain future food by preserved amount. | Current flow is XOR/exactly one animal type and one animal. | BGA supports sheep/boar/cattle counts in one interaction. | Replace single-choice flow with explicit multi-type count selection and matching future food. |
| `C8_PlantFertilizer` | Works with logical field groups including grain/vegetable/wood/stone plantings. | Only physical grain/vegetable fields are handled. | BGA can apply to logical groups used by later cards such as wood/stone fields. | Make field lookup group-aware and include wood/stone plantable groups where active. |
| `C57_Crudite` | Optional harvest-time choice; player selects which vegetable source to remove. | Harvest handler directly mutates the first qualifying vegetable source and is effectively mandatory. | BGA presents an optional choice when multiple sources are possible. | Convert harvest behavior to explicit optional pending/flow selection. |
| `C71_Slurry` / `C71_SlurrySpreader` | Canonical card is `C71_Slurry`; legacy wrong-name entry is not implemented. | Both names are present as physical TS files. | Duplicate registration can expose the legacy name in places that should only use canonical `Slurry`. | Remove or quarantine the legacy `C71_SlurrySpreader` implementation path. |
| `C140_PackagingArtist` | Adds a Major Improvement action path to the replacement action pool. | Implements minor replacement / `isDoable`, but does not add Major Improvement to the replaceable action pool. | BGA lets the card extend the replacement action set. | Add the missing reusable action-pool extension. |
| `D13_Trowel` | Renovating from wood can go directly to stone. | Wood house can still only renovate to clay through the current renovate-house path. | BGA passes `toStone=true` for the wood-to-stone option. | Teach renovate flow to expose the wood-to-stone option when this card is active. |
| `D15_ClaySupports` | Offers an alternate clay trade that preserves the base renovation cost semantics. | Applies a mandatory cost delta. | BGA models this as an alternative cost trade, not a forced discount path. | Represent the BGA alternate-payment option explicitly. |
| `D66_PotterCeramics` | Clay-to-grain conversion requires baking. | Converts clay to grain, then baking can be skipped. | BGA makes the bake step mandatory for this effect. | Mark the generated bake continuation as mandatory. |
| `E5_NightLoot` | Player chooses the exact accumulation space/resource to steal. | Takes the first matching accumulation space for the selected resource. | BGA exposes explicit source selection. | Add source-space selection to the interaction. |

## 3. Metadata Schema-Up Gaps

The mechanical BGA metadata audit finds four cards where BGA expresses
buyability inside custom `isBuyable` logic instead of a plain prerequisite
label. OA has an explicit prerequisite label/handler for UI clarity. Behavior is
not currently known to be wrong.

| Card | OA metadata | BGA metadata gap | Current treatment |
|---|---|---|---|
| `A3_PaperKnife` | Explicit prerequisite label plus handler. | BGA has no plain prerequisite field; the logic lives in `isBuyable`. | Keep as schema-up metadata divergence. |
| `B154_SheepKeeper` | Explicit prerequisite label plus handler. | Same BGA shape. | Keep as schema-up metadata divergence. |
| `B56_Brook` | Explicit prerequisite label plus handler. | Same BGA shape. | Keep as schema-up metadata divergence. |
| `B74_ThickForest` | Explicit prerequisite label plus handler. | Same BGA shape. | Keep as schema-up metadata divergence. |

## 4. BGA-Banned Cards Present In OA

These cards are intentionally present in OA even though BGA metadata marks them
as banned or non-standard. They are policy differences, not BGA behavior gaps,
unless a separate row also appears in section 2.

| Cards |
|---|
| `A131_GuestRoom`, `A133_ClappingArea`, `A14_CarpentersHammer`, `A33_RecycledBrick`, `A39_Smallholding`, `A48_StableDeliveryman`, `A82_Wintercrafter`, `A97_BreadCarrier` |
| `B10_ChickenCoop`, `B117_Mastermind`, `B132_FestivalManager`, `B151_Tradesperson`, `B15_Flail`, `B161_Trident`, `B21_FarmSchoolGraduate`, `B22_Punner` |
| `C102_SackCart`, `C125_Educator`, `C28_FishingNet`, `C31_ShepherdsPipe`, `C3_CarpentersBench`, `C60_CatLover`, `C63_GoatCatcher`, `C99_GardenDesigner` |
| `D137_Countryman`, `D19_DrinkerOfAbsinthe`, `D21_BrushwoodRoof`, `D33_MasterBreeder`, `D4_ChickenFeeder`, `D74_TenantFarmer`, `D92_SnackTime` |
| `D97_AutonomousPicker`, `E22_FieldWatchman` |

## 5. Accepted Simplifications

These are known simplifications that are currently accepted. They should stay
out of the fix queue unless the product decision changes.

| Card | Current simplification | BGA difference |
|---|---|---|
| `B27_Toolbox` | Simplified current implementation retained. | BGA has richer handling. |
| `B33_Mantlepiece` | Simplified current implementation retained. | BGA has richer handling. |
| `B129_Seatmate` | Simplified current implementation retained. | BGA has richer handling. |
| `C24_BedintheGrainField` | Simplified current implementation retained. | BGA has richer handling. |
| `C25_SteamMachine` | Simplified current implementation retained. | BGA has richer handling. |
| `C42_RavenousHunger` | Simplified current implementation retained. | BGA has richer handling. |
| `C67_MineralFeeder` | Simplified current implementation retained. | BGA has richer handling. |
| `C69_LandConsolidation` | Simplified current implementation retained. | BGA has richer handling. |
| `C72_FestivalPlanning` | Simplified current implementation retained. | BGA has richer handling. |
| `C93_InnerDistrictsDirector` | Simplified current implementation retained. | BGA has richer handling. |
| `C120_AgriculturalLabourer` | Simplified current implementation retained. | BGA has richer handling. |
| `C154_TwinResearcher` | Simplified current implementation retained. | BGA has richer handling. |
| `D36_BreedRegistry` | Simplified current implementation retained. | BGA has richer handling. |
| `D101_SugarBaker` | Simplified current implementation retained. | BGA has richer handling. |
| `E112_GrainThief` | Simplified current implementation retained. | BGA has richer handling. |
| `C27_Blueprint` | Source-documented simplification. | BGA has extra details not mirrored. |
| `C52_HuntsmansHat` | Source-documented simplification. | BGA has extra details not mirrored. |
| `C146_WorkshopAssistant` | Source-documented simplification. | BGA has extra details not mirrored. |

## 6. Deliberate Behavior Differences

These non-banned cards intentionally differ from BGA today.

| Card | Current OA behavior | BGA behavior | Current decision |
|---|---|---|---|
| `C22_BasketChair` | Simplified trigger/payment behavior. | BGA has fuller interactive handling. | Keep simplification. |
| `D161_CabbageBuyer` | Simplified purchase/scoring behavior. | BGA has richer handling. | Keep simplification. |
| `B85_FarmHand` | Simplified worker/action behavior. | BGA has richer handling. | Keep simplification. |
| `A136_DrudgeryReeve` | Simplified scoring/condition handling. | BGA has richer handling. | Keep simplification. |
| `C133_Soldier` | Simplified interaction. | BGA has richer handling. | Keep simplification. |
| `D132_HideFarmer` | Simplified hide/farm behavior. | BGA has richer handling. | Keep simplification. |
| `E149_MidnightFencer` | Simplified fencing behavior. | BGA has richer handling. | Keep simplification. |
| `A22_Telegram` | Simplified timing/interaction behavior. | BGA has richer handling. | Keep simplification. |
| `E72_ArtichokeField` | Simplified field behavior. | BGA has richer handling. | Keep simplification. |
| `C1_Overhaul` | Uses OA min:n notation behavior. | BGA representation differs. | Keep current representation. |
| `C1_noWoodPalisades` | OA blocks wood palisade interaction. | BGA representation differs. | Keep current representation. |
| `D1_ZigzagHarrow` | Simplified harrow behavior. | BGA has richer handling. | Keep simplification. |

## 7. Legacy Names And Non-Missing Cards

| Item | Current conclusion |
|---|---|
| `D159_ReedSeller` | Not missing. BGA marks it `implemented=false`; OA keeps it data-only. |
| `E132_VeggieLover` | Implemented and aligned under the canonical OA/BGA name. The legacy BGA `E132_Shearer` name is not the active card. |
| `C54_MarketBooth` | Canonical name; legacy BGA alias `MarketStall` should not be treated as a missing OA card. |
| `C71_Slurry` | Canonical name; duplicate `SlurrySpreader` is tracked as a registration cleanup in section 2. |
| `D11_LawnFertilizer` | Canonical name; BGA legacy typo `LawnFertilzer` should not be treated as a missing OA card. |

## 8. Required Checks

Run the mechanical metadata audit after card metadata changes:

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

For behavior fixes, run the smallest relevant slow/session test first, then the
fast suite before opening or updating a PR:

```bash
pnpm exec vitest run <targeted-test-file>
pnpm test:fast
pnpm run lint
```
