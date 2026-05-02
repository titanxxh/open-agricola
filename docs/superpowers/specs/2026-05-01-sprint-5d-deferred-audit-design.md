# Sprint 5d — Deferred Audit & Cleanup

**Date:** 2026-05-01
**Branch / Worktree:** `sprint-5d-deferred-audit` at `.worktree/sprint-5d-deferred-audit`
**Scope:** Audit-only sprint. Confirm `card_progress.md §2.3` Sprint-5-deferred residual entries are actually fixed (per §5.7 wide-scan tail review) and propagate the strikethrough/✅ marks to §2.3 / §0 / §8. Newly-discovered bugs (if any) become follow-up sprints, NOT in-scope here.
**Effort estimate:** ~1.5 day (4 sub-agents in parallel + manual spot-check + docs sync). Could compress to 0.5 day if §5.7 conclusions hold and 0 bugs surface.

## 0. Goal

Drive `master-plan.md §0` "⚠ 残留" count to **0** so the only items remaining on the strict "对齐 BGA 完成" checklist are i18n (437 BGA `clienttranslate`) and Sprint 7 P3 decision. Combined with sprint-6e closing the ❌ stub count to 0, this is the closing book-end on the BGA-alignment work captured in master-plan §0.

This sprint is intentionally **audit-only**: it does not implement card behavior. If audit finds new behavior bugs, those land in a follow-up Sprint 5e spec, not here.

## 1. Background

`docs/card_progress.md §2.3` lists Sprint 5 PR-5 deferred items. Strikethrough/✅ has been propagated for most cards (mech-A / B / C / D / E + Sprint 5b + 5c collectively closed 13+ items), but **four entries already fixed by Sprint 5b never had the strikethrough/✅ added**:

- C23 JobContract — fixed in Sprint 5b (drop `occupationHand.length === 0` guard)
- A1 Shelter — fixed in Sprint 5b (stables `actionContext.zoneFilter` + `max`)
- A22 Telegram — fixed in Sprint 5b (`workersAvailable === 0` guard)
- A38 WoolBlankets — fixed in Sprint 5b (prereq `Wooden House → 5 Sheep`)

Plus two aggregated entries that pointed to lost sub-agent reports (`output/tmp/audit-agent-b7.md` / `b10.md` are gitignored and have been overwritten):

- **B 牌组 wide-scan 11 张** (no individual list extant in `card_progress.md`)
- **E 牌组 wide-scan 4 张** (no individual list extant)

`docs/card_desc_audit.md §5.7` (2026-04-30) re-ran the audit on a superset (B 17 + E 20 = 37 cards, picked by mechanical signals after excluding mech-A/B/C/D + Sprint 6 fixes) and concluded "all aligned, 0 ⚠/❌ deviations." That conclusion is the basis for closing the deferred entries — but the §5.7 review used compact mode (≤90s/card), so master-plan §0 still conservatively reads "~1 张 P1 行为偏差" pending stronger validation.

This sprint provides that validation: deeper per-card pass (≥120s/card, full 5-dimension comparison), in parallel via 4 sub-agents.

## 2. Audit scope (19 + superset)

### 2.1 Already-fixed-needs-strikethrough (4 cards)

| Card | Sprint 5b fix summary | Verification target |
| ---- | --------------------- | ------------------- |
| C23 JobContract | drop `occupationHand.length === 0` guard | `shared/cards/C/C23_*.ts` `isDoable` listener no longer reads occupationHand emptiness; lessons-listener cards fire correctly |
| A1 Shelter | stables effect `actionContext.zoneFilter='pasture-1' + max:1` | onBuy injects exactly one free stable on a size-1 pasture only |
| A22 Telegram | `workersAvailable(state, player) === 0` guard | extraPlacement leaf only fires when reserve farmers exhausted |
| A38 WoolBlankets | prereq `5 Sheep` registered + `countSheepOnBoard` helper | buy is gated on board+stable+pasture sheep total ≥ 5 |

### 2.2 §5.7 superset (37 cards) for deep verification

**B-deck 17 cards:** B103, B107, B108, B111, B128, B134, B137, B151, B156, B163, B26, B3, B30, B68, B72, B75, B82.

**E-deck 20 cards:** E101, E116, E118, E12, E142, E144, E156, E16, E160, E161, E165, E30, E36, E49, E68, E69, E70, E72, E91, E95, E96.

Note: §2.3 said "B 11" + "E 4" (15 total). The §5.7 superset of 37 absorbs that ambiguity — if all 37 audit ✅, the original 15 are necessarily ✅.

## 3. Audit method

### 3.1 Parallel sub-agent dispatch

Four `general-purpose` sub-agents run in parallel (single message, multiple Agent tool blocks):

- **agent-1**: B 17 cards (prefix half: B103, B107, B108, B111, B128, B134, B137, B151, B156)
- **agent-2**: B 17 cards (suffix half: B163, B26, B3, B30, B68, B72, B75, B82) + C23, A1, A22, A38 (4 already-fixed verifies)
- **agent-3**: E 20 cards (prefix half: E101, E116, E118, E12, E142, E144, E156, E16, E160, E161)
- **agent-4**: E 20 cards (suffix half: E165, E30, E36, E49, E68, E69, E70, E72, E91, E95, E96)

Each agent runs in **read-only mode** (no file writes). Output goes to a structured JSON file in `output/tmp/sprint-5d-audit/`.

Each agent's prompt includes:
- BGA SHA reference: `output/bga-agricola` baseline at HEAD
- Our SHA reference: worktree HEAD (`f91e0f27` post sprint-6d merge)
- Full card list assigned to that agent
- 5-dimension verdict template (see §3.2)
- Time budget: ≥120s/card (matches Sprint 4-deep audit cadence, deeper than §5.7's 90s/card)

### 3.2 Per-card 5-dimension verdict template

Output one JSON line per card to `output/tmp/sprint-5d-audit/agent-N.jsonl`:

```json
{
  "cardId": "B103_FooBar",
  "bgaPath": "modules/php/Cards/B/B103_FooBar.php",
  "oursPath": "shared/cards/B/B103_FooBar.ts",
  "verdict": "✅" | "⚠" | "❌" | "🟡" | "🔍",
  "dimensionsAligned": ["cost", "desc", "listeners", "cardStates"],
  "deviations": [
    {
      "dimension": "cost" | "desc" | "effect" | "listener" | "cardStates" | "rulings",
      "bgaSays": "...",
      "oursSays": "...",
      "severity": "P0" | "P1" | "P2" | "P3",
      "suggestedFix": "...",
      "evidence": "bga:Cards/B/B103.php:L23 vs ours:shared/cards/B/B103_FooBar.ts:L45"
    }
  ],
  "notes": "any nuance the agent wants to flag"
}
```

The 5 dimensions:

1. **Cost / players / prerequisite** vs BGA `__construct` (`$this->cost`, `$this->players`, `$this->prerequisite`)
2. **Desc** vs BGA `$this->desc[]` `clienttranslate(...)` strings — exact text match (or registered as deliberate divergence)
3. **Effect / listener / action wiring** — BGA `on*` methods, `getEffects()`, `getExchanges()`, plus inheritance chain. Our side: `effect.*`, `listeners[]`, `_impl` exports
4. **runtime cardStates / counters / globals** — BGA `Globals::*` writes vs our `cardStates[CARD_ID].*` writes; counter parity
5. **Edge cases**:
   - BGA `$this->rulings`
   - non-trigger guards (e.g. `isPrincipalAction`, `if ($player->isStarter())`)
   - special trigger conditions (round number, phase, opponent state)
   - `isCorbariusOrDulcinaria` / `isDecker` style expansion-flag carve-outs (skipped if not implemented)

### 3.3 Aggregation

After all 4 agents complete, merge JSONL files. Compute summary:

- Total cards audited: 41 (37 §5.7 superset + 4 already-fixed verifies; A1/A22/A38 may be already in B/E if they're in superset, dedupe)
- Verdict distribution
- New deviations found, by severity
- Cards confirming §5.7 conclusion
- Cards contradicting §5.7 conclusion (if any)

Save merged report to `docs/sprint-5d-audit-report.md` (committed — useful reference for future `card_desc_audit.md` regenerations).

### 3.4 Manual spot-check (5 cards)

To guard against systematic agent miss, manually verify 5 cards from the audit (the 5 with highest `bgaPath` LOC, indicating most logic surface). Reuse the same 5-dimension template, written by hand.

If any of the 5 spot-checks contradict the agent's verdict for that card, expand spot-check to the agent's full assignment and re-audit if needed.

## 4. Bug-handling policy

If audit produces **0 new ⚠/❌ deviations** (the expected case per §5.7):

- Sprint 5d closes with docs sync only (§2.3 strikethroughs, §0 ⚠=0, §8 timeline row).
- Total real work: ~3 hours.

If audit produces **>0 new deviations**:

| Severity | In-sprint action |
| -------- | ---------------- |
| P0 (gameplay-incorrect, frequent path) | Document in audit report; create Sprint 5e spec stub; Sprint 5d still closes ⚠=N where N is the count |
| P1 (rule deviation, cornering) | Same as P0 — log + Sprint 5e |
| P2 (metadata / cosmetic / numerical edge case) | Add to §2.4 (numerical) or §2.5 (deliberate divergence) per category |
| P3 (purely informational) | Just §2.0 changelog mention |

**No fixes are written in Sprint 5d.** Audit-only sprint discipline keeps scope clean and lets follow-up bug fixes go through their own brainstorm → spec → plan → impl cycle. If we cave on this and start fixing bugs found mid-audit, we lose the audit's clean signal.

Master-plan §0 ⚠ count after this sprint = number of P0/P1 deviations newly found. If 0, master-plan §0 reads "⚠ 残留：0 张".

## 5. Deliverables

| Artifact | Path | Purpose |
| -------- | ---- | ------- |
| Per-agent audit jsonl | `output/tmp/sprint-5d-audit/agent-{1..4}.jsonl` | gitignored intermediate, agents write here |
| Merged audit report | `docs/sprint-5d-audit-report.md` | committed; full per-card verdict table + summary; survives `output/tmp` cleanup |
| `card_progress.md §2.0` changelog | append Sprint 5d entry | docs sync gate |
| `card_progress.md §2.3` table + deferred list | strikethrough/✅ for 4 + 15 entries | propagate Sprint 5b/5c fixes that were not previously marked |
| `card_progress.md §8` timeline | new Sprint 5d row | per CLAUDE.md gate |
| `master-plan.md §0` | ⚠ residual count → 0 (or N if bugs found) | strict-completion criterion update |
| `master-plan.md §8` | new Sprint 5d row | per CLAUDE.md gate |
| (conditional) `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md` | only if audit finds bugs | spec stub for next sprint |

## 6. Out of scope

- Implementing card-behavior fixes (those go to Sprint 5e if needed)
- Re-running §5.7 wide-scan on cards outside the 37-card superset
- Touching i18n (Sprint 5d does not touch the 437-clienttranslate gap)
- Changing master-plan §0's i18n / Sprint 7 lines (only ⚠ residual count)
- Re-validating ❌ stub cards (those are sprint-6e's domain, currently in flight)

## 7. Risk / open questions

- **§5.7 was 90s/card; we say ≥120s.** That's not a huge step up; if §5.7 missed something, our 120s pass might also miss it. Mitigation: 5 manual spot-checks at >10 min/card on the highest-surface cards, to catch systematic agent blind spots.
- **Sub-agent context window**: each agent gets 9-11 cards. BGA file reads + our file reads = ~30-50K tokens per card pair. Within context, but watch token usage — agent might truncate output. Mitigation: structured JSONL output (one line per card) lets us re-dispatch a single card if needed.
- **Lost original 11+4 lists**: §5.7 superset (17 + 20 = 37) covers more than the original 11 + 4. The audit confirms or refutes the broader claim. If audit finds a bug in (say) B156 that wasn't in the original "B 11" set, that's still a real bug worth surfacing — we don't filter audit findings to the original list.
- **Schedule coupling with sprint-6e**: This audit runs while sprint-6e (C62) is implementing in parallel. They're in separate worktrees, no shared state, no merge conflict expected. Sprint 5d landing first is fine; landing after 6e is fine. Sprint 5d does not depend on 6e merge state.

## 8. Definition of Done

- [ ] 4 sub-agents dispatched in parallel; all return verdict JSONL
- [ ] Manual spot-check of top-5 cards complete; spot-check matches agent verdicts
- [ ] Merged audit report committed to `docs/sprint-5d-audit-report.md`
- [ ] `card_progress.md §2.0` changelog appended (Sprint 5d row)
- [ ] `card_progress.md §2.3` 4 already-fixed entries marked ✅ Sprint 5b
- [ ] `card_progress.md §2.3` "B 11 张" + "E 4 张" entries replaced with full 17-B + 20-E ✅ list (per audit verdicts)
- [ ] `card_progress.md §8` timeline row added
- [ ] `master-plan.md §0` ⚠ residual count updated (0 in expected case, N otherwise)
- [ ] `master-plan.md §8` Sprint 5d row added
- [ ] If bugs found: Sprint 5e spec stub committed at `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md` summarizing each bug
- [ ] PR opened, CI green, rebase merged to main

## 9. Sequence (high-level — full plan via writing-plans)

1. Pre-flight: confirm worktree clean, fast tests green (1933 expected post sprint-6e merge; 1911 if 6e not yet merged — both acceptable since this sprint touches no test code).
2. Build merged card list + per-agent assignment files in `output/tmp/sprint-5d-audit/inputs/`.
3. Dispatch 4 agents in parallel (single message, 4 Agent tool blocks).
4. Wait for completion (~30-60 min).
5. Merge agent outputs; compute summary.
6. Manual spot-check 5 cards (highest-LOC).
7. Write `docs/sprint-5d-audit-report.md`.
8. Update `card_progress.md` §2.0 / §2.3 / §8.
9. Update `master-plan.md` §0 / §8.
10. (conditional) Write Sprint 5e spec stub.
11. Commit + push + open PR + wait CI + rebase merge.
