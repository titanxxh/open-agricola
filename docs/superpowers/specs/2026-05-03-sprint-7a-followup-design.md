# Sprint 7a — Follow-up: Sprint 7 audit P0/P1 deviations

**Date:** 2026-05-03
**Trigger:** Sprint 7 audit (`docs/sprint-7-audit-report.md`, 2026-05-02) surfaced **61 P0/P1 deviations** (50 ⚠ + 11 ❌) in the §2.2 simplification re-validation. These are real behavioral bugs in cards previously labeled "acceptable simplification".
**Effort estimate:** TBD until Phase 0 banned-filter runs. Upper bound 61×0.5 day = ~30 day; expected after filter 20-40 cards × 0.5 day ≈ 10-20 day.

## 0. Goal

Fix the actionable subset of the 61 P0/P1 deviations so master-plan §0 ⚠/❌ residual returns to 0.

After Sprint 7a, master-plan §0 strict criterion (⚠=0 / ❌=0 / Sprint 7 done) is met; only i18n gap remains.

## 1. Phase 0 — Banned-filter (PREREQUISITE)

**Critical**: Sprint 7 audit prompt did NOT instruct agents to check BGA `banned=true` field or expansion-flag carve-outs (`isCorbarius/isBubulcus/isArtifex/isDecker`). spot-check of B22 WalkingBoots showed ❌ P0 verdict was literally true but functionally moot — BGA bans the card and our side has `passing: true`.

**Phase 0 task**: For each of the 61 P0/P1 cards in `output/tmp/sprint-7-audit/merged.jsonl` filter on verdict ⚠/❌:

1. Read BGA file, look for `$this->banned = true;` or `$this->isCorbarius/Bubulcus/Artifex/Decker = true;`
2. Read our file, check for `passing: true`, `players: '5+'`, or expansion-flag equivalents
3. Classify each card:
   - **(a) Both sides agree on banned/expansion exclusion** → demote to §2.5 "deliberate divergence: banned-on-both-sides, intentionally minimal implementation". No code fix needed.
   - **(b) BGA bans, ours doesn't** → either (i) implement the missing behavior to match deck participation OR (ii) add equivalent banning (less work). Sprint 7a only does (ii).
   - **(c) Neither side bans** → real Sprint 7a fix candidate. Implement the missing behavior.

Expected output: 61 cards split as ~20-30 (a)/(b) demote + ~20-40 (c) real fix.

**Estimate**: ~0.5 day (single sub-agent batch verifying banned/expansion state + writing classification list).

## 2. Phase 1 — Fix the (c) subset

After Phase 0 produces the (c) "real fix" list, group by mechanism family for efficiency. Per Sprint 7 audit notable themes:

### 2.1 ❌ P0 (~5-8 cards after Phase 0)

The 11 ❌ verdicts include:

- **B22 WalkingBoots** — likely (a) demote (BGA banned).
- **C112 Thresher** — cost/gain reversed (pay grain→food vs BGA pay food→grain). 0.2 day flip cost/gain.
- **C135 Constable** — missing onBuy wood reward + sharedScoring downgraded. 0.4 day.
- **C16 FieldFences** — free-fence-next-to-fields missing. 0.5 day (need `actionContext.fieldFences` flag in fencing flow).
- **C1 Overhaul** — no return-fence + rebuild +3. 0.6 day (need fence-return phase).
- **C54 MarketBooth** — cost+fence not paid. 0.3 day fix `cost: { stable: 1 }`.
- **C6 StoneClearing** — instant gain vs field-stone. 0.4 day (createResourceInLocation pattern).
- **C89 StableMaster** — missing onBuy stable. 0.3 day add `effect.onBuy` returning optional STABLES leaf.
- **D106 WhiskyDistiller** — timing wrong (need futureMeeplesNode with offset). 0.6 day.
- **D114 SeedTrader** — onBuy needs to place GRAIN/VEGETABLE meeples on card; anytime XOR exchange. 0.8 day (significant rewrite).
- **E60 WorkingGloves** — needs trade alternatives in occupation cost (1 building resource → -3 food). 0.4 day.

### 2.2 ⚠ P1 (~15-30 cards after Phase 0)

50 ⚠ verdicts, themes from `merged.jsonl`:

- **Sheep / animal counted from supply not farmyard (B-deck multiple)**: B39 Loom, B50 ButterChurn, etc. — shared helper opportunity (`getEffectiveExchangeAnimals` from §5.4.3 of `card_desc_audit.md`).
- **Missing place-farmer or family-growth triggers**: B11 Feedyard, B21 HayloftBarn, etc.
- **Counter / extraData write missing**: B32 Kettle (no bonus VP), C132 TimberShingleMaker (computeBonusScore reads counter nothing writes).
- **Cost / fence / capacity flag mismatches**: B15 CarpentersBench (wrong fence-discount scope), C9 AutomaticWaterTrough (capacity check missing), D100 LordoftheManor (stables category), C94 StableCleaner (cost not applied).

Per-card detail in `output/tmp/sprint-7-audit/merged.jsonl` `deviations` field.

## 3. Approach

After Phase 0 produces the (c) list, this sprint **does NOT auto-fix all of them**. Instead:

- Group by mechanism family (sheep-from-farmyard / place-farmer-missing / counter-write / etc.)
- For each family, decide: shared helper extraction OR per-card fix
- Implement family-by-family with TDD

Each family becomes a sub-task. Group sizes are unknown until Phase 0 runs.

## 4. Out of scope

- The 27 🟡 cards already moved to §2.5 by Sprint 7. Don't re-audit.
- The 29 ✅ cards already moved to §2.0 by Sprint 7.
- The 14 stale-name entries cleaned up by Sprint 7.
- Anything not in the 61 P0/P1 list (modulo Phase 0 demotion).

## 5. Definition of Done

- [ ] Phase 0 banned-filter classification list produced; (a)/(b)/(c) split documented
- [ ] (a)/(b) cards demoted to §2.5 in `card_progress.md`
- [ ] (c) cards fixed with TDD; tests added per fix
- [ ] `card_progress.md` §2.0 changelog row + §2.3 (c) cards moved to ✅ Sprint 7a
- [ ] `master-plan.md` §0 ⚠/❌ residual back to 0 (or remaining count if Sprint 7a partial)
- [ ] PR opened, local CI green, rebase merged to main

## 6. Sequence

1. Phase 0: dispatch one sub-agent to filter banned/expansion state for the 61 cards. Output (a)/(b)/(c) classification.
2. Demote (a)/(b) cards to §2.5 (docs-only).
3. Group (c) cards by mechanism family.
4. Fix family-by-family with TDD.
5. Final docs sync.
6. PR + rebase merge.

(Detailed plan via writing-plans skill once this spec is reviewed.)
