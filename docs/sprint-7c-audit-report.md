# Sprint 7c §2.5 Simplification Re-audit Report

**Date**: 2026-05-02
**Sprint**: 7c (audit-only — no implementation changes)
**Worktree / Branch**: `.worktree/sprint-7c-audit` / `sprint-7c-audit`
**Scope**: 27 cards classified as §2.5 simplifications by Sprint 7 wide-scan audit
  (`docs/card_progress.md` §2.5 sub-section "2026-05-02 Sprint 7 audit-classified simplifications").

The wide-scan that produced the original list had at least one known false positive
(B139 "onBuy" wrongly identified — it is actually onReturnHome), so every reason in
that table needs source-verification before it can be trusted.

---

## 1. Summary

| Verdict | Count | Cards |
| --- | --- | --- |
| §2.0 aligned (audit was over-cautious — ours actually matches BGA or is mathematically equivalent) | 6 | B38, C3, C22, C117, D115, E78 |
| §2.5 keep (real but acceptable simplification — corner case / equivalent-by-math / tied to unimplemented infra) | 16 | B27, B33, B129, C8, C24, C25, C42, C67, C69, C72, C93, C120, C154, D36, D101, E112 |
| §2.3 promote → real-fix backlog | 5 | A10, B104, C51, C125, D21 |

**5 cards promoted to §2.3 → recommend spawning Sprint 7d** (see §4 below).

BGA-banned cards in scope (`C125`, `C3`, `D21`): list verified against
BGA `$this->banned` field — list is correct. `C154` is `bannedWeak`,
`C125`/`C3`/`D21` are full `banned`. Sprint 7c's spec scope ("3 banned
cards: C125/C3/D21") is accurate.

### Wide-scan reason errors discovered

| Card | Wide-scan reason claim | Source-verified reality |
| --- | --- | --- |
| B38_FutureBuildingSite | "borderline — actually aligned ✅" | Confirmed aligned — `computeLockedFarmTiles` extension point covers all four BGA events (plow/construct/fencing/stables) via `collectLockedFarmTileKeys` (`shared/cards/card-effects.ts:495`, called from `farm-choice.ts`, `farm-interaction.ts`, `game-core.ts:2772`) |
| C3_CarriageTrip | "turn-id replay guard simplified" | `setTurnIdNode()` is BGA-internal bookkeeping; `onBuy` runs once and we don't re-trigger the same instance. No real divergence |
| C22_BasketChair | "same-turn replay guard + JobContract dummy cleanup" | Replay guard only matters because BGA installs Basket Chair as an action card with its own `flow`. Ours fires `onBuy` once and never re-enters. JobContract dummy isn't implemented at all, so cleanup is vacuous |
| C117_Legworker | "computeArgs UI hint not implemented" | Confirmed — we still award the wood after-place-farmer; BGA's `ignoreResources=true` is only a client hint, not a rule. Aligned in behaviour |
| D21_Recruitment | "Major Improvement action coverage + onBuy 'no farmer left' simplified" | **Half false**. Our listener registers on both `minor-improvement` and `improvement-any`, so the Major Improvement Action space (which dispatches `improvement-any` Major-or-Minor) is already covered. The real divergence is the **prerequisite handler** — `prerequisite: 'No People Left in the House'` is a string label only; nothing in `prerequisite-registry` enforces it (compare A10's `registerPrerequisite('Still in Wooden House', ...)`). Card is buyable any time |
| D115_FodderPlanter | "silent-kill subtraction depends on harvestBreedSummary; if accounted for, equivalent" | `breed.ts` only increments `summary.animalCount` while `freeCapacity > 0` — capacity-bound newborns. There are no silent kills to subtract; equivalent to BGA's `created - silentKills` |
| E78_SleightofHand | "4×1:1 vs single multi-pick — UX different but mathematically equivalent" | Confirmed equivalent — four sequential optional 1:1 building-resource swaps reach exactly the same set of post-states as BGA's single up-to-4 pay/receive pair |

So 7 of the 27 wide-scan reasons mis-state the situation in some way (B38/C3/C22/C117/D115/E78 over-flagged as simplification, D21 mis-located the real bug). The other 20 reasons describe a real divergence accurately.

---

## 2. Per-card verdicts

| Card | BGA behaviour | Our behaviour | Wide-scan reason | Verdict | Justification |
| --- | --- | --- | --- | --- | --- |
| A10_WoodenShed | `isBuyable` enforces `actionType ∈ {Major, MajorOrMinor}` (`A10_WoodenShed.php:43`) | Only enforces house-type via `prerequisite`; actionType not checked | Major-improvement-action gate not strictly enforced | **§2.3 real fix** | Card desc explicitly says "only via Major Improvement action"; we let it through pure-Minor channels, breaking a stated rule |
| B27_Toolbox | Listens on player + opponent AfterPlaceFarmer; flag set when build occurs (`B27_Toolbox.php:96-104`) | onEndTurn fires when flagged, then clears flag | Opponent-turn trigger path not modelled | **§2.5 keep** | Owner end-of-turn equals BGA's "first AfterPlaceFarmer post-build" — flag is already cleared by then in BGA, so opponent-AfterPlaceFarmer path is a no-op anyway |
| B33_Mantlepiece | `prerequisite=Clay/Stone House`; renovation block via desc only | Same `prerequisite` string; no renovation block | renovation-block simplified | **§2.5 keep** | Once in clay/stone house there's no upgrade target — only weird interaction is "renovate down to wood" cards which don't exist; deterrent is sufficient |
| B38_FutureBuildingSite | onBuy snapshots locked zones, throws on plow/construct/fencing/stables touching them (`B38_FutureBuildingSite.php:54-78`) | onBuy snapshots; `computeLockedFarmTiles` extension point applied uniformly via `collectLockedFarmTileKeys` in farm-choice/farm-interaction/game-core | borderline — already aligned | **§2.0 aligned** | All four BGA enforcement paths flow through the shared lockedTile collector — confirmed aligned |
| B104_SheepWalker | `getExchanges` returns empty when reserve > 0; `enforceReorganizeOnLastHarvest` mandates reorg final harvest (`B104_SheepWalker.php:38-51`) | Exchanges always visible; no last-harvest enforcement | reorg pending visibility + last-harvest enforcement simplified | **§2.3 real fix** | Player can sidestep feeding by exchanging sheep mid-reorg or skip last-harvest reorg entirely — that's a real rule bypass, not a UX gap |
| B129_Seatmate | 3p: always allow round-13 occupied; 4p: only when seat-opposite hasn't placed (`B129_Seatmate.php:38-65`) | players=3+; 4p path always allows | 3p free / 4p opposite-blocking simplification (no seat positions) | **§2.5 keep** | Real divergence only at 4p; default 2p makes card inactive; engine has no seating concept to leverage |
| C3_CarriageTrip | onBuy work-phase optional → `setTurnIdNode + PLACE_FARMER` (`C3_CarriageTrip.php:36-52`); `banned=true` | onBuy work-phase optional → place-farmer (no turn-id) | banned-from-supply + turn-id replay guard simplified | **§2.0 aligned** | Turn-id is BGA-internal bookkeeping; onBuy runs once per buy in our model. No real divergence |
| C8_PlantFertilizer | Groups fields, supports WOOD/STONE crops (`C8_PlantFertilizer.php:34-74`) | Only grain/vegetable per-field | Wood Field / Rock Garden grouping not modelled | **§2.5 keep** | Wood Field / Rock Garden are unshipped expansion cards; without them we can't grow wood/stone in fields |
| C22_BasketChair | onBuy optional → recall first farmer + place again; `canBePlayed` turnId guard; JobContract dummy cleanup branch (`C22_BasketChair.php:85-164`) | onBuy optional recall + place; no turnId guard / JobContract cleanup | same-turn replay guard + JobContract dummy cleanup simplified | **§2.0 aligned** | We don't install BasketChair as an action card with its own flow, so replay can't happen; JobContract dummy not implemented anywhere → cleanup vacuous |
| C24_BedintheGrainField | onPlayerStartHarvest returns SEQ with optional WISHCHILDREN — player can decline (`C24_BedintheGrainField.php:46-71`) | onStartHarvest returns non-optional family-growth leaf when room exists | BGA decline allowed, ours auto-fires | **§2.5 keep** | Family growth is essentially always optimal; declining is a corner case. Keep |
| C25_SteamMachine | When adoptive worker available, wraps Bake Bread with forceSkip (`C25_SteamMachine.php:113-138`) | Triggers bake-bread follow-up; no adoptive forceSkip | adoptive worker forceSkip corner case omitted | **§2.5 keep** | Adoptive worker mechanic itself is unimplemented — corner case is unreachable in our engine |
| C42_RavenousHunger | onPlayerImmediatelyAfterPlaceFarmer: SEQ with PLACE_FARMER constrained to 16-card whitelist (`C42_RavenousHunger.php:33-71`) | Place-farmer offered with no constraints; collect bonus gated on `gainPerRound` | place-farmer not constrained to accumulation | **§2.5 keep** | Whitelist gives mostly accumulation spaces; bonus only fires on accumulation anyway. Player's optimal play is still accumulation-target |
| C51_FishingNet | Owner uses `PAY` (must succeed → opponent must have ≥1 food) (`C51_FishingNet.php:41-58`); ReturnHome adds 2 food | Uses `gain {food: -1, payerId: opponent}` best-effort, doesn't block fishing | "must have food first" pre-condition simplified; transfer best-effort | **§2.3 real fix** | BGA blocks the entire Fishing action when opponent has no food; we let them fish anyway. That's a real rule bypass that affects normal multi-player play |
| C67_MineralFeeder | onPlayerStartOfTurn: if no sheep-in-pasture but has sheep + pasture, prompts REORGANIZE (`C67_MineralFeeder.php:67-87`) | Only checks current pasture state; no prompt | reorganize-then-grain prompt corner case omitted | **§2.5 keep** | Player typically pastures sheep on placement; the missing prompt is a friendly affordance, not a rule |
| C69_LandConsolidation | Anytime listener disables itself when Tinsmith Master / Cow Patty have pending reactions (`C69_LandConsolidation.php:38-44, 54-85`) | No pending-reaction guard | TinsmithMaster / CowPatty overlap guard omitted | **§2.5 keep** | Requires owner to hold C69 + (B115 or E71) simultaneously and trigger them in the same window — vanishingly rare |
| C72_FestivalPlanning | Mandatory REAP (when crops exist) with `PRIVATE_FIELD_PHASE` trigger flag, then optional improvement (`C72_FestivalPlanning.php:38-65`) | Optional reap + optional improvement, no PRIVATE_FIELD_PHASE trigger | reap optional vs mandatory + trigger flag missing | **§2.5 keep** | Reap is essentially always taken (free resources); PRIVATE_FIELD_PHASE only matters to listeners that care about distinguishing private vs full harvest, none of which are currently sensitive to it |
| C8 dup — already covered | — | — | — | — | — |
| C93_InnerDistrictsDirector | onPlayerAfterPlaceFarmer wraps placeStone + place-farmer in single optional SEQ — decline both or accept both (`C93_InnerDistrictsDirector.php:43-71`) | Stone always placed unconditionally in listener; place-farmer offered as optional follow-up | stone from unlimited supply; aggressive placement ≈ minor preference | **§2.5 keep** | Stone comes from supply, paired space is shared accumulation — net board effect is small. Real divergence (forced-feed stone to opponents who could collect it) but minor strategic impact |
| C117_Legworker | onPlayerComputeArgsPlaceFarmer hints `ignoreResources=true` for adjacent spaces (`C117_Legworker.php:80-93`); rule fires regardless | Listener fires after place-farmer with same adjacency map | computeArgs UI hint not implemented; JobContract interaction n/a | **§2.0 aligned** | `ignoreResources` is a client UI hint; gameplay rule is identical |
| C120_AgriculturalLabourer | Listens to Gain/Receive/Reap + Exchange (counting grain conversions); reap counts grain meeples (`C120_AgriculturalLabourer.php:38-101, 135-163`) | Listens to gain/receive + onAfterReap (counts grainFields, not grain crops); no Exchange listener | exchange-grain conversion + grain-multiplier-aware reap counting simplified | **§2.5 keep** | Default grain multiplier = 1 → reap-grainFields = reap-meeples. Exchange→grain is rare combo (would need cards that exchange-to-grain on the table) |
| C125_Nightworker | onPlayerStartOfWork: optional `PLACE_FARMER` constrained to building-resource accumulation spaces — costs a worker (`C125_Nightworker.php:32-52`); `banned=true` | onRoundStart: optional `gain` of all resources on a missing-type accumulation space (no worker cost) | banned — stub simplification acceptable | **§2.3 real fix** | Massive behavioural delta — free pickup vs costing a worker. Even though banned in BGA, this is the kind of "we shipped it" card we should be honest about |
| C154_TwinResearcher | Pairs include `CopseAdd` and `Hollow` non-4 spaces (`C154_TwinResearcher.php:38, 64`); `bannedWeak` | Pairs limited to shipped spaces (no CopseAdd / no Hollow non-4) | depends on unshipped spaces; uses extraVp | **§2.5 keep** | Genuinely blocked on unshipped action spaces; covers the ones we do ship |
| D21_Recruitment | onBuy throws if any farmer remaining (`D21_Recruitment.php:32-37`); replace-improvement on minor + Major Improvement space; isDoable forces availability | Replace-improvement listener on `minor-improvement` AND `improvement-any` (Major Improvement space already covered); isDoable listener present; **prerequisite string registered but no handler** | Major Improvement coverage + onBuy 'no farmer left' simplified | **§2.3 real fix** | Wide-scan **misidentified** the gap. Major Improvement coverage is already fine. The real bug: `prerequisite: 'No People Left in the House'` has no handler in `prerequisite-registry`, so the prerequisite never gates the buy. Card is buyable while farmers are still home. Compare A10 which actually calls `registerPrerequisite` |
| D36_BreedRegistry | Scoring uses `Stats::getBoardSheep + getCardsSheep` (current totals, not history); `getConvertedSheep > 0` blocks (`D36_BreedRegistry.php:42-58`) | Tracks `sheepGained` cumulatively (history); exchange-decreased sheep marks `sheepConverted` | Hut/StableShed cards-sheep + non-'exchange' trigger simplified | **§2.5 keep** | BGA itself deviates from card text (final count, not "gained"), and cards-sheep storage (Hut/StableShed) is a niche secondary-storage path; both sides use a stand-in metric for the desc condition |
| D101_SugarBaker | onPlayerAfterPlaceFarmer optional payGain + place 1 food on the action space for next visitor (`D101_SugarBaker.php:33-56`); `bannedWeak` | Optional payGain only; food disappears | "1 food bonus stays on action space" omitted | **§2.5 keep** | bannedWeak + accumulating-food-on-non-accumulation space is a BGA-only mechanic; unworth replicating |
| D115_FodderPlanter | Uses `createdAnimals - silentKills` (`D115_FodderPlanter.php:42-45`) | Uses `harvestBreedSummary.animalCount` | silent-kill subtraction; equivalent if already accounted | **§2.0 aligned** | `breed.ts` only increments animalCount within free capacity → no silent kills exist in our model. Mathematically equivalent |
| D21 dup — see above | — | — | — | — | — |
| E78_SleightofHand | Single multi-pick UI: discard 0..4, receive equal count (`E78_SleightofHand.php:59-82`) | 4 sequential optional 1:1 swaps | UX different but math equivalent | **§2.0 aligned** | Set of reachable post-states identical; player optimum identical |
| E112_GrainThief | StartHarvestFieldPhase: select fields to skip; harvest skips them via shared GrainThiefFields list; EndHarvestFieldPhase grains the count (`E112_GrainThief.php:36-69`) | StartHarvestFieldPhase: pop grain stack + add 1 grain immediately; EndHarvestFieldPhase restore stack | mid-reap mutation may affect field-aware hooks; balanced via restore | **§2.5 keep** | Several field-aware listeners exist (A104 / A106 / A112 / A118 / B50 / B101 / C110 / A61 / A64 / A59), but most check field counts (≥0) rather than per-stack remaining; intermediate mismatch is detectable only in pathological combos |

(Note: B129/B27 above appear before C-deck cards by alphabetic-id sort; the table preserves the §2.5 listing order as much as is readable.)

---

## 3. Doc updates committed alongside this report

- `docs/card_progress.md` §1 overall (counts unaffected — still 27 simplifications, just re-categorised internally)
- `docs/card_progress.md` §2.0 — adds 6 demoted cards (B38, C3, C22, C117, D115, E78)
- `docs/card_progress.md` §2.3 — adds 5 promoted cards (A10, B104, C51, C125, D21) with one-line description of the real divergence
- `docs/card_progress.md` §2.5 — keeps the 16 confirmed simplifications; rewords D21's reason in the audit report (and removes it from §2.5 entirely as it's now §2.3)

---

## 4. Sprint 7d candidate

5 cards landed in §2.3 — at the threshold the spec calls out for spawning a Sprint 7d.

Recommended Sprint 7d scope (one stub spec is sufficient, fixes are mostly small):

- **A10_WoodenShed** — register an `onBeforeBuy` / `isBuyable` hook that checks the action context; forbid pure-Minor channels. ~30-50 LOC.
- **B104_SheepWalker** — add a `getExchanges` filter that drops anytime exchanges while `pendingAnimalReorg` is active; add a `enforceReorganizeOnLastHarvest` hook (or recycle existing reorg-enforcement infrastructure if any). ~50 LOC + reorg-finalisation rework if needed.
- **C51_FishingNet** — convert the `gain food (payerId=opponent, best-effort)` into a real pay-blocking hook on the opponent's place-farmer-on-fishing path, so the fishing action fails when food = 0. Requires a `computeCosts` hook on opposite player's place-farmer pointed at fishing. Probably the largest of the five.
- **C125_Nightworker** — replace `onRoundStart → optional gain` with a real `place-farmer` action that consumes a worker. Touches our engine's "pre-work-phase placement" semantics, which currently have no other consumer; might be ROI-negative against BGA's `banned`. Worth a call-out before fixing.
- **D21_Recruitment** — register a `'No People Left in the House'` prerequisite handler (`registerPrerequisite('No People Left in the House', player => familySize(player) === player.rooms || player.rooms === 0)`). 5 LOC. Easiest win.

The cheapest two (A10, D21) are <30 minutes each and clearly worth doing. C51 is the highest-impact (real multiplayer rule bypass) but largest. B104 is mid-cost / mid-impact. C125 alone might justify staying §2.5 since it's `banned` and the fix touches our engine's placement infrastructure for a card that BGA itself excludes — recommend explicit triage before starting.

---

## 5. Surprises / cross-card observations

- **`prerequisite` field is dual-mode**: a simple string (display label) or a registered handler (gating logic). Several cards (D21 confirmed, possibly others not in scope) silently fail to enforce because they only set the label. Worth a one-shot grep next sprint to find any other card with `prerequisite: '<string>'` but no matching `registerPrerequisite` call. Not an audit task right now since out of scope.
- **`countAsUse: true` flag on BGA optional flows**: appears on B27, C42, C69, C93, D101, D115. We don't have a parallel concept; it's the BGA hook into "this counts as 'using' the card for once-per-game restrictions". No card in scope actually has a once-per-game restriction, so it's currently unused, but if we ship one in future, this is the BGA primitive to mirror.
- **`bannedWeak` cards in scope**: C154, D101 (we ship both anyway, which is the project policy). Distinct from full `banned` (C3, C125, D21).
- **`turn-id replay guard` is internal BGA bookkeeping**: appeared in three reasons (C3, C22, B27 indirectly via flagging) — none are real divergences in our model, since we don't re-enter onBuy or BasketChair as a player-action-card. Future audits can deprioritise turn-id reasons.
- **Field-aware listeners exposed by E112's mid-reap mutation** (10 cards: A104/A106/A112/A118/A59/A61/A64/B50/B101/C110): if E112 fix is ever attempted, switch the implementation to a "skip set" rather than mutate-then-restore, similar to BGA's `Globals::setGrainThiefFields([...])`.

---

## 6. Method notes

- Every BGA file under `/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/<deck>/<id>_*.php` was read in full alongside our `shared/cards/<deck>/<id>_*.ts`.
- Verdict took ~1-2 minutes per card; ~45 minutes total wall-clock as estimated in the spec.
- No code was modified — the only file touched besides this report is `docs/card_progress.md`.
