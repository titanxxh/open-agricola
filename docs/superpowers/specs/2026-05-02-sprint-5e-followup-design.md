# Sprint 5e — Follow-up: Sprint 5d audit deviations

**Date:** 2026-05-02
**Trigger:** Sprint 5d audit (`docs/sprint-5d-audit-report.md`, 2026-05-01) surfaced 4 P1 deviations not previously logged in `card_progress.md §2.3`.
**Effort estimate:** ~1.5 day total (per-card breakdown below).

## 0. Goal

Fix the 4 P1 deviations newly identified by Sprint 5d's deeper-than-§5.7 audit so `master-plan.md §0` ⚠ residual returns to **0**.

After Sprint 5e + Sprint 6e (already merged), strict "对齐 BGA 完成" criterion reads ⚠=0 / ❌=0; only i18n (437 BGA `clienttranslate`) and Sprint 7 P3 decision remain.

## 1. Deviations to fix

### 1.1 B163 Pastor — `effect.onBuy` missing immediate evaluation — P1 (~0.2 day)

- **BGA says:** `onBuy($player) { return $this->onAfterConstruct($player, []); }` — purchase triggers the same evaluation as a construct event.
- **Ours says:** Listener attached only to `actions:['construct'], phases:['after']`. No `effect.onBuy`. Buying the card while already in a 2-room house (with no opponent at 2 rooms) does NOT immediately award resources.
- **Fix sketch:**
  - Add `effect.onBuy: (state, player) => { ... evaluate same predicates as listener handler; if conditions met, return SEQ(gainLeaf({wood:3,clay:2,reed:1,stone:1}), set-flag) }`.
  - Reuse the existing inline check from `B163_Pastor.ts:30-37` (rooms === 2 + no opponent at rooms === 2).
- **Tests:** session test for "buy B163 in 2-room house with sole-2-room ownership" → 立即 +3w +2c +1r +1s + flag set. Plus regression: existing construct-trigger test still passes.
- **Risk:** None — `effect.onBuy` is a standard hook, no main-path changes.

### 1.2 E161 ElderBaker — Stone Oven during Minor-Improvement carve-out missing — P1 (~0.4 day)

- **BGA says:** Desc: "You can build the **Stone Oven** major improvement even when taking a Minor Improvement action."
- **Ours says:** `effect.onBuy` only registers the private grain-3 action space. No carve-out for Stone Oven during minor-improvement.
- **Fix sketch:**
  - Add `computeChoiceCandidates` listener on `actions:['minor-improvement']` that injects `Major_StoneOven` as a candidate when owner has E161 in play.
  - **Reuses Sprint 6d D131 CraftsmanshipPromoter pattern verbatim** — see `shared/cards/D/D131_CraftsmanshipPromoter.ts:23-41` for the candidateListener template.
- **Tests:** session test for "owner of E161 takes minor-improvement action; Major_StoneOven appears in choice list and is buyable".
- **Risk:** None — `computeChoiceCandidates` is established (Sprint 6d).

### 1.3 E72 ArtichokeField — Reap event vs phase callback structural deviation — P1 (~0.3 day, may downgrade to P2/P3)

- **BGA says:** `isListeningTo`: Reap event with `trigger==HARVEST` and `harvested($event)`; `onPlayerAfterReap` returns `gainNode([FOOD => 1])`. One Reap event per harvest field phase per field.
- **Ours says:** `onHarvestFieldPhase` adds `food += 1` after consuming 1 unit of crop.
- **Caveat (per spot-check):** the food-output totals are equal between the two implementations (3-grain field over 3 harvests yields +3 food in both). The structural deviation may not manifest in any observable behavior.
- **Step 1 (verify):** write a session test that explicitly counts food gained from E72 across a full game sequence with multiple harvest rounds. Compare against BGA's expected output. If totals match → demote to P2/P3 in §2.5 as "structural difference, no behavioral impact" and close.
- **Step 2 (fix iff bug):** if a discrepancy is observed, route the +1 food through the proper Reap dispatch path so it shares timing with other Reap-listening cards.
- **Risk:** Step 2 may touch Reap dispatch; if it does, scope creep — escalate before fixing.

### 1.4 E91 PlowBuilder — anytime not gated on `usedJoinery` flag — P1 (~0.5 day)

- **BGA says:** `isListeningTo` checks Exchange events, sets per-harvest `usedJoinery` flag only if Joinery (or upgrade) was actually used. Anytime gates on `isFlagged('usedJoinery') && !isFlagged()`. Flags clear at `EndHarvestFeedingPhase`.
- **Ours says:** Anytime listener only checks `player.improvements.some(id => JOINERY_CARDS.includes(id))`. Plus `JOINERY_CARDS = ['Major_Joinery']` — no upgrades.
- **Fix sketch:**
  - Add Exchange-event listener that sets `cardStates.E91.extraData.usedJoinery=true` when `trade.sourceId.startsWith('Major_Joinery')` (use sourceId prefix to catch upgrades).
  - Anytime listener gates on `cardStates.E91.usedJoinery === true` AND `!isCardFlagged(player, 'E91')`.
  - `effect.onAfterHarvest` clears both flags.
  - Expand `JOINERY_CARDS` to include any upgrade cards with `joineryIdentity: true` field on minor improvements (or use sourceId match).
- **Tests:** session test for "owner cooks via Joinery in harvest A → +1 plow available; harvest B without Joinery use → +1 plow not available". Plus regression for existing Joinery-only check (still works).
- **Risk:** Need to define how Joinery upgrades are detected. If no upgrades exist in this codebase yet, just match `Major_Joinery` literal for now and leave a TODO. Keep scope tight.

## 2. Out of scope

- P2/P3 deviations from Sprint 5d audit (B103/B26/E95 ⚠ P2; B108/B128/B137/E118/E142/E16/E36/E68/E70 🟡): these go to `card_progress.md §2.4` (numerical) or `§2.5` (deliberate divergence) directly via Sprint 5d's docs sync — NOT in Sprint 5e.
- Anything outside the 4 P1 list.
- Refactoring the Reap dispatch path (E72 Step 2) unless it's a small, contained change.

## 3. Open questions

- **Joinery upgrades**: does this codebase have any `Major_Joinery` upgrade card? If not, simplify the E91 fix to just match `Major_Joinery` literal. Verify before implementation.
- **E72 false positive**: is the structural deviation actually observable? Write the test first, decide based on results.

## 4. Definition of Done

- [ ] B163 Pastor `effect.onBuy` added; session test for purchase-time trigger
- [ ] E161 ElderBaker computeChoiceCandidates listener added; session test for Stone Oven via minor-improvement
- [ ] E72 ArtichokeField behavior verified — either fix or demote to §2.5
- [ ] E91 PlowBuilder Exchange listener + usedJoinery gate; session test for usage-gated anytime
- [ ] `card_progress.md §2.3` 4 P1 entries marked ✅
- [ ] `master-plan.md §0` ⚠ residual back to 0
- [ ] `card_progress.md §8` Sprint 5e timeline row
- [ ] `master-plan.md §8` Sprint 5e progress row
- [ ] PR opened, CI green, rebase merged to main

## 5. Sequence

(Detailed plan via writing-plans skill once this spec is reviewed.)

1. B163 fix (smallest, no risk). Commit + test green.
2. E161 fix (D131 pattern, low risk). Commit + test green.
3. E72 verification test. If reveals real bug, fix; if not, demote to §2.5. Commit.
4. E91 fix (largest scope, defines Joinery-upgrade detection). Commit + test green.
5. Docs sync. PR.
