# Sprint 7 Audit Report — §2.2 Simplification Re-Validation

**Date:** 2026-05-02
**Scope:** 131 cards on the deep-audit list (40 deep-pool + 117 wide-scan-reconstructed - 26 overlaps with sprint-5d/5e/6d/6e).
**Method:** Phase 0 (5 deck-wide sub-agents, ≤90s/card, name reconstruction since `audit-agent-b{6..10}.md` were lost) → Phase 1 (5 deep-audit sub-agents, ≥120s/card, 5-dimension JSONL) → spot-check on B22 + analysis-only.

## Summary

| Metric | Count |
| ------ | ----- |
| Total cards audited (deep) | **131** |
| ✅ now aligned (move §2.2 → §2.0) | **29** |
| 🟡 simplification confirmed (move §2.2 → §2.5) | **27** |
| ⚠ deviation (P1, → Sprint 7a) | **50** |
| ❌ deviation (P0, → Sprint 7a) | **11** |
| 🔍 could-not-finish (stale list / ID collision) | **14** |
| **New P0/P1 deviations to fix** | **61** |

**Outcome:** **§5.7 wide-scan tail conclusion ("130 cards are 🟡 simplifications") is materially wrong.** Deeper audit (≥120s/card) reveals **47% of "simplifications" are actual behavioral bugs** (50 ⚠ + 11 ❌). 29 cards turned out to be already aligned (misclassified). 27 cards confirmed as legitimate simplifications.

**master-plan §0 update:**
- ⚠ residual: `0 → 50` (post-5e was 0; Sprint 7 audit surfaces 50 P1)
- ❌ residual: `0 → 11` (post-6e was 0; Sprint 7 audit surfaces 11 P0)
- Sprint 7 line: "未启动" → "audit done; 61 P0/P1 spawn Sprint 7a"

## Verdict per agent

| Agent | Cards | ✅ | 🟡 | ⚠ | ❌ | 🔍 |
| ----- | ----- | -- | -- | -- | -- | -- |
| 1 | 27 | 3 | 6 | 17 | 1 | 0 |
| 2 | 27 | 6 | 4 | 9 | 2 | 6 |
| 3 | 27 | 6 | 9 | 6 | 4 | 2 |
| 4 | 27 | 8 | 4 | 8 | 3 | 4 |
| 5 | 23 | 5 | 4 | 11 | 1 | 2 |
| **Total** | **131** | **28** | **27** | **51** | **11** | **14** |

(Sums slightly off from §1 aggregate due to one verdict reclassified during merge dedup.)

## Cards now aligned (29 ✅) — move to §2.0 changelog

These were on the §2.2 simplification list but the audit found them aligned:

A19_Handplow, B53_SculptureCourse, B57_Scullery, C106_PotatoHarvester, C133_Soldier, C13_WoodSlideHammer, C143_StoneBuyer, C163_MaterialDeliveryman, C165_GameCatcher, C168_AnimalCatcher, C40_CanvasSack, C48_Farmstead, C59_SchnappsDistillery, C60_SmallPottersOven, C70_LettucePatch, C75_Firewood, C87_Mason, C99_GardenDesigner, D124_Emissary, D129_LumberVirtuoso, D135_GardeningHeadOfficial, D136_AnimalActivist, D148_DomesticianExpert, D38_MilkingStool, D45_SheepWell, D77_Forecaster, D84_FeedPellets, D87_Mansion, E66_BarnShed.

These move from §2.2 to §2.0 changelog with one-line note "previously misclassified as simplification, audit confirms aligned".

## Confirmed simplifications (27 🟡) — move to §2.5

A-deck (1): A10_WoodenShed (Major-improvement-action gate not enforced; deliberate)

B-deck (5): B104_SheepWalker, B129_Seatmate, B27_Toolbox, B33_Mantlepiece, B38_FutureBuildingSite (latter is actually aligned per agent — could promote on retry)

C-deck (15): C117_Legworker, C120_AgriculturalLabourer, C125_Nightworker (BGA banned), C154_TwinResearcher, C22_BasketChair, C24_BedintheGrainField, C25_SteamMachine, C3_CarriageTrip (BGA banned), C42_RavenousHunger, C51_FishingNet, C67_MineralFeeder, C69_LandConsolidation, C72_FestivalPlanning, C8_PlantFertilizer, C93_InnerDistrictsDirector

D-deck (3): D101_SugarBaker, D115_FodderPlanter, D21_Underground (BGA banned), D36_BreedRegistry

E-deck (2): E112_GrainThief, E78_SleightofHand

(Per-card simplification reason in `output/tmp/sprint-7-audit/merged.jsonl` — `simplificationReason` field.)

## Surprise deviations (61 P0/P1) — Sprint 7a backlog

### ❌ P0 (11 cards)

- B22_WalkingBoots — missing place-farmer + mark-for-removal (**but BGA banned=true; actual gameplay impact zero**, see Caveat below)
- C112_Thresher — cost/gain reversed (pay grain→food vs BGA pay food→grain)
- C135_Constable — missing onBuy wood reward + sharedScoring downgraded
- C16_FieldFences — free-fence-next-to-fields missing
- C1_Overhaul — no return-fence + rebuild +3
- C54_MarketBooth — cost+fence not paid
- C6_StoneClearing — instant gain vs field-stone
- C89_StableMaster — missing onBuy stable
- D106_WhiskyDistiller — timing wrong
- D114_SeedTrader — rule completely wrong
- E60_WorkingGloves — free -2 food, dropped exchange-for-building

### ⚠ P1 (50 cards)

A132_Publican, A82_WorkCertificate, B106_MoralCrusader, B10_Caravan, B117_Informant, B11_Feedyard, B132_EstateMaster, B133_VillagePeasant, B139_ForestScientist, B152_JuniorArtist, B15_CarpentersBench, B161_Weakling, B21_HayloftBarn, B32_Kettle, B39_Loom, B50_ButterChurn, B89_Groom, C116_FurnitureMaker, C11_WildlifeReserve, C130_OutskirtsDirector, C132_TimberShingleMaker, C140_PackagingArtist, C146_WorkshopAssistant, C148_MudWallower, C156_HoofCaregiver, C15_Trellis, C27_Blueprint, C39_StudioBoat, C52_HuntsmansHat, C53_GypsysCrock, C57_Crudite, C63_CraftBrewery, C80_RockyTerrain, C88_CarpentersApprentice, C94_StableCleaner, C9_AutomaticWaterTrough, D100_LordoftheManor, D127_HardworkingMan, D134_OysterEater, D1_ZigzagHarrow, D63_Rebel, D74_RoyalWood, D82_DroughtScare, E123_ResourceHoarder, E148_Lazybones, E166_Roastmaster, E5_NightLoot, E73_Scythe, E83_ShepherdsWhistle, E87_MasterRenovator.

(Full BGA/ours quote + suggested-fix per card in `output/tmp/sprint-7-audit/merged.jsonl`.)

## 🔍 Could-not-finish (14 cards) — stale list / ID collisions

These came from `card_desc_audit.md §4.6` which contained typos. The actual BGA card at that ID has a different name (BGA C70 is LettucePatch, not StableExpert; BGA C88 is CarpentersApprentice, not Coppicer; etc.). Audit rejected these list entries as bogus. They will be cleaned up by removing them from §2.2 and re-checking the actually-named cards (most of which got audited under their real names — e.g. C70_LettucePatch is in the ✅ list).

Stale entries: C117_TownCooperage, C120_BlanketChest, C135_HiredHand, C145_HouseweepLawn, C146_Witch, C164_TableCarpenter, C70_StableExpert, C71_BlackTruffle, C88_Coppicer, C89_PrivateForest, D128_Smithy, D12_Beanthistle, E132_LargeFamily (collision), E66_Spinney (collision).

## Manual spot-check + caveat

**1 deep spot-check + analysis:** B22_WalkingBoots (❌ P0 in agent verdict).
- Agent claim "missing place-farmer + mark-for-removal" is literally true.
- BUT: BGA file has `$this->banned = true;` — card is excluded from the deck. Behavioral divergence never reaches gameplay.
- Our side has `passing: true` field which is the equivalent.
- **Severity P0 is overstated**. Should be P3 / "deliberate divergence: banned on both sides, intentionally minimal implementation".

**Caveat applied to ALL 61 P0/P1 verdicts:** the Phase 1 audit prompt did not instruct agents to check BGA `banned` field or expansion-flag carve-outs (`isCorbarius/isBubulcus/isArtifex/isDecker`). Some ⚠/❌ verdicts may be moot if BGA bans the card or restricts to expansion characters we don't support. **Sprint 7a Phase 0 must filter the 61-card list against BGA `banned` and expansion-flag state**; cards confirmed banned-on-both-sides go to §2.5, not Sprint 7a fix.

**Estimated true Sprint 7a fix list:** 20-40 cards after the filter. Full 61 is upper bound.

## Closure status

**Sprint 7 audit done; partial closure.**

- §2.2 queue **reclassified**: 29 → §2.0 changelog (now-aligned), 27 → §2.5 (deliberate divergence), 61 → Sprint 7a (P0/P1 fix candidates), 14 → cleanup (stale ID).
- master-plan §0 ⚠/❌ residual increased post-audit: 50 ⚠ + 11 ❌. Sprint 7a closes them after banned-filter (estimated 20-40 actual fixes).
- Sprint 7 line on master-plan §0 reads "audit done"; §0 strict criterion now waits on Sprint 7a + i18n.

## Per-card detail (full JSONL)

The full 131-line JSONL is intermediate (`output/tmp/sprint-7-audit/merged.jsonl`, gitignored). For each ⚠/❌ card, the full deviation record (BGA quote + ours quote + suggested fix + evidence) is captured there. Sprint 7a spec stub will reproduce per-card detail for the actionable subset after banned-filter.
