# Sprint 5d Audit Report — Deferred Cards Re-Validation

**Date:** 2026-05-01
**Scope:** 42 cards across B-deck (17), E-deck (21), and 4 already-fixed verifies (C23 / A1 / A22 / A38).
**Method:** 4 parallel `general-purpose` sub-agents, ≥120s/card, 5-dimension JSONL output, manual spot-check on 4 P1 deviations + sanity skim of top-3 LOC ✅ cards.
**Deeper-than-§5.7:** §5.7 (2026-04-30) used 90s/card compact mode. This audit doubles per-card time and adds spot-check.

## Summary

| Metric | Count |
| ------ | ----- |
| Total cards audited | 42 |
| ✅ aligned | 26 |
| 🟡 simplified (deliberate / acceptable) | 9 |
| ⚠ deviation (P1+P2) | 7 |
| ❌ deviation (P0) | 0 |
| 🔀 reframed | 0 |
| 🔍 could-not-finish | 0 |
| **New P0/P1 deviations not previously logged** | **4** |

The audit **does not confirm §5.7's "0 ⚠/❌ deviations" conclusion**. Four P1 bugs surfaced under deeper review (≥120s/card vs §5.7's 90s/card). Three additional P2 deviations are recorded as known simplifications.

## Verdict per agent

| Agent | Cards | ✅ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
| ----- | ----- | -- | -- | -- | -- | -- | -- |
| 1 (B prefix 9: B103/B107/B108/B111/B128/B134/B137/B151/B156) | 9 | 5 | 3 | 1 | 0 | 0 | 0 |
| 2 (B suffix 8 + 4 verifies) | 12 | 10 | 0 | 2 | 0 | 0 | 0 |
| 3 (E prefix 10: E101/E116/E118/E12/E142/E144/E156/E16/E160/E161) | 10 | 6 | 3 | 1 | 0 | 0 | 0 |
| 4 (E suffix 11: E165/E30/E36/E49/E68/E69/E70/E72/E91/E95/E96) | 11 | 5 | 3 | 3 | 0 | 0 | 0 |
| **Total** | **42** | **26** | **9** | **7** | **0** | **0** | **0** |

## Already-fixed verify confirmations (Sprint 5b changelog claims)

| Card | Sprint 5b claimed fix | Audit confirmation |
| ---- | --------------------- | ------------------- |
| C23 JobContract | drop `occupationHand.length === 0` guard | ✅ confirmed in code |
| A1 Shelter | stables `actionContext.zoneFilter='pasture-1' + max:1` | ✅ confirmed in code |
| A22 Telegram | `workersAvailable === 0` guard | ✅ confirmed in code |
| A38 WoolBlankets | prereq `Wooden House → 5 Sheep` + `countSheepOnBoard` | ✅ confirmed in code |

All 4 Sprint 5b claims match the current code state. No regressions, no missed fixes.

## New P1 deviations (Sprint 5e backlog)

### B163 Pastor — D3 effect/listener wiring — P1

- **BGA says:** `onBuy($player) { return $this->onAfterConstruct($player, []); }` — purchase triggers the same evaluation as a construct event. So if owner is already in a 2-room house with no opponent at 2 rooms when buying B163, they get 3 wood + 2 clay + 1 reed + 1 stone immediately.
- **Ours says:** Listener attached only to `actions:['construct'], phases:['after']`. No `effect.onBuy`. Buying the card waits for the next construct event before evaluating.
- **Suggested fix:** Add an `effect.onBuy` that mirrors the listener handler (check `rooms===2` + opponents not at 2 rooms; if true, gain + flag).
- **Evidence:** `bga:Cards/B/B163_Pastor.php:23-26` vs `ours:shared/cards/B/B163_Pastor.ts:18-50`
- **Effort:** 0.2 day

### E161 ElderBaker — D5 edge cases — P1

- **BGA says:** Desc: "You can build the **Stone Oven** major improvement even when taking a Minor Improvement action." BGA wires the carve-out via the buyability filter (`Improvement.php:getBuyableCards` chain).
- **Ours says:** `effect.onBuy` only registers the private grain-3 action space; no listener / carve-out lets Stone Oven appear in the minor-improvement action's option list.
- **Suggested fix:** `computeChoiceCandidates` listener on `actions:['minor-improvement']` that injects `Major_StoneOven` as a candidate when owner has E161 in play. Reuses the Sprint 6d D131 CraftsmanshipPromoter pattern verbatim.
- **Evidence:** `bga:Cards/E/E161_ElderBaker.php:17-25` vs `ours:shared/cards/E/E161_ElderBaker.ts:32-43`
- **Effort:** 0.4 day

### E72 ArtichokeField — D3 effect/listener wiring — P1 (mild caveat)

- **BGA says:** `isListeningTo`: Reap event with `trigger==HARVEST` AND `harvested($event)` (event has at least one crop with `originalLocation == this->id`); `onPlayerAfterReap` returns `gainNode([FOOD => 1])`. One Reap event per harvest field phase.
- **Ours says:** `onHarvestFieldPhase` adds `player.resources.food += 1` after consuming 1 unit of crop. Spot-check (`spotcheck-notes.md` §"Spot-check 2") notes the actual output totals are equal between the two implementations (3-grain field over 3 harvests yields +3 food in both).
- **Caveat:** Agent's example "3-grain field yields 3 food instead of 1" is misleading. The structural deviation is real (Reap event vs phase callback), but the apparent food-count math may already be correct.
- **Suggested fix:** Sprint 5e first re-verifies the actual divergence. If only structural (no math discrepancy), demote to P2/P3. If a real edge case exists (e.g. 2 cards interacting through Reap dispatch), implement bonus via the proper Reap dispatch path.
- **Evidence:** `bga:Cards/E/E72_ArtichokeField.php:37-55` vs `ours:E72_ArtichokeField.ts:91-105`
- **Effort:** 0.3 day (potentially zero if math turns out correct)

### E91 PlowBuilder — D3 effect/listener wiring — P1

- **BGA says:** `isListeningTo` checks Exchange events and sets a per-harvest `usedJoinery` flag only when the player actually used a Joinery exchange. Anytime is gated on `isFlagged('usedJoinery') && !isFlagged()`. Flags clear at `EndHarvestFeedingPhase`.
- **Ours says:** Anytime listener only checks `player.improvements.some(id => JOINERY_CARDS.includes(id))` plus `HARVEST_ROUNDS.includes(state.round)`. Does NOT track Joinery usage — fires every harvest regardless of whether the Joinery was actually used.
- **Plus secondary issue:** `JOINERY_CARDS = ['Major_Joinery']` — no upgrades-of-Joinery support (description says "Joinery (or an upgrade thereof)").
- **Suggested fix:** Exchange-event listener that sets `cardStates.E91.extraData.usedJoinery=true` on Joinery-source trade; anytime listener gates on it; reset on harvest end. Expand `JOINERY_CARDS` to include any upgrades.
- **Evidence:** `bga:Cards/E/E91_PlowBuilder.php:24-33,66-86` vs `ours:E91_PlowBuilder.ts:16-40`
- **Effort:** 0.5 day

## P2/P3 deviations (recorded, not Sprint 5e priority)

These are recorded for future review but do not require immediate fixing. Most fall under `card_progress.md §2.4` (numerical/metadata) or `§2.5` (deliberate divergence).

| Card | Verdict | Severity | Issue (one-line summary) |
| ---- | ------- | -------- | ------------------------ |
| B103 FieldMerchant | ⚠ | P2 | isDoableListener no `checkArgs(trueAction && !checkedReplaceAction)` guard |
| B26 AgrarianFences | ⚠ | P2 | grain-utilization split into two computeReplace vs BGA single XOR-of-OR |
| B30 WoodPalisades | ✅ | P3 | palisade replacement in game-core main path vs card-internal (behavior correct) |
| B108 OvenFiringBoy | 🟡 | P3 | hardcoded wood-space whitelist; expansion wood spaces would miss trigger |
| B128 Plumber | 🟡 | P3 | direct -2 discount vs BGA -1/-2 XOR + countAsUse not modeled |
| B137 Wholesaler | 🟡 | P3 | cardStates booleans instead of holder meeples (cross-card holder lookup limited) |
| E118 KindlingGatherer | 🟡 | P2 | several cross-deck triggers not wired |
| E142 Smuggler | 🟡 | P3 | unsurfaced ruling |
| E16 BriarHedge | 🟡 | P3 | missing `category` field |
| E36 HerbalGarden | 🟡 | P3 | text deviation |
| E68 CherryOrchard | 🟡 | P2 | simplification |
| E70 CropRotationField | 🟡 | P2 | simplification |
| E95 Miller | ⚠ | P2 | onBuy uses `improvement-any` vs BGA `IMPROVEMENT(MINOR+MAJOR)` filter |

These do not change the master-plan §0 ⚠ count beyond the 4 P1 cards above.

## Manual spot-check

| Card | Reviewed | Agent verdict | Spot-check verdict | Match? |
| ---- | -------- | ------------- | ------------------ | ------ |
| B163 Pastor (P1) | deep | ⚠ P1 | ⚠ P1 | yes |
| E72 ArtichokeField (P1) | deep | ⚠ P1 | ⚠ P1 (with caveat — see notes) | yes (modulo nuance) |
| E91 PlowBuilder (P1) | deep | ⚠ P1 | ⚠ P1 | yes |
| E161 ElderBaker (P1) | deep | ⚠ P1 | ⚠ P1 | yes |
| B72 LoveforAgriculture (LOC 221) | skim | ✅ | ✅ | yes |
| B3 Moonshine (LOC 163) | skim | ✅ | ✅ | yes |
| C23 JobContract (LOC 129) | skim | ✅ | ✅ | yes |

7 cards manually reviewed. 0 verdicts flipped. **Spot-check passed.**

Detailed notes: `output/tmp/sprint-5d-audit/spotcheck-notes.md` (gitignored intermediate).

## Closure status

**Partial closure.**

- **§5.7 conclusion ("0 ⚠/❌ deviations") not confirmed.** Deeper audit surfaced 4 P1 bugs that the 90s/card compact pass missed.
- §2.3 already-fixed entries (C23/A1/A22/A38): ✅ all 4 confirmed in code; eligible for §2.3 strikethrough.
- "B 牌组 wide-scan 11 张" + "E 牌组 wide-scan 4 张" aggregate entries: re-validated against the §5.7 superset. **Not all aligned** — 4 cards in the superset have P1 deviations (B163 in B-deck; E72/E91/E161 in E-deck).
- **master-plan.md §0 ⚠ residual count:** "~1 张" → **4 张** (B163 / E72 / E91 / E161). Sprint 5d **uncovers more bugs than it closes**, but the bugs are concrete and actionable.
- A Sprint 5e follow-up spec stub captures the 4 P1 cards with per-card fix sketches.

## Per-card detail (full JSONL)

The 42-line JSONL is intermediate (`output/tmp/sprint-5d-audit/merged.jsonl`, gitignored). For each card with a non-`✅` verdict, the full deviation record is reproduced below.

### B103 FieldMerchant — ⚠ P2

- **BGA path:** `modules/php/Cards/B/B103_FieldMerchant.php`
- **Ours path:** `shared/cards/B/B103_FieldMerchant.ts`
- **Deviation:** D5 — `isDoableListener` returns `doable=true` unconditionally; should mirror BGA `checkArgs(trueAction && !checkedReplaceAction)` to avoid mis-enabling in replace-action chains.
- **Severity:** P2

### B108 OvenFiringBoy — 🟡 P3

- Hardcoded wood-space whitelist; expansion wood spaces would miss trigger.

### B128 Plumber — 🟡 P3

- Direct -2 discount replaces BGA's -1/-2 XOR option. `countAsUse` semantics not modeled.

### B137 Wholesaler — 🟡 P3

- `cardStates` booleans replace BGA's holder-meeples; cross-card holder lookups are limited but the standalone behavior matches.

### B163 Pastor — ⚠ P1

(See "New P1 deviations" §)

### B26 AgrarianFences — ⚠ P2

- Grain-utilization flow split into two `computeReplace` listeners; BGA uses a single XOR-of-OR. Behavioral output equivalent in current cases.

### E118 KindlingGatherer — 🟡 P2

- Several cross-deck triggers not wired.

### E142 Smuggler — 🟡 P3

- Unsurfaced ruling.

### E16 BriarHedge — 🟡 P3

- Missing `category` field.

### E161 ElderBaker — ⚠ P1

(See "New P1 deviations" §)

### E36 HerbalGarden — 🟡 P3

- Text deviation.

### E68 CherryOrchard — 🟡 P2

- Simplification — see Sprint 5e candidate list if upgraded later.

### E70 CropRotationField — 🟡 P2

- Simplification.

### E72 ArtichokeField — ⚠ P1 (with caveat)

(See "New P1 deviations" §)

### E91 PlowBuilder — ⚠ P1

(See "New P1 deviations" §)

### E95 Miller — ⚠ P2

- `onBuy` uses `improvement-any` action; BGA uses `IMPROVEMENT(MINOR+MAJOR)` filter — minor difference in selectable list under current rule wiring.

---

End of report. Next step: Sprint 5e spec stub (`docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md`) covers the 4 P1 fixes.
