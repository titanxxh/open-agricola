# Sprint 7 — §2.2 Simplification Re-Validation Audit + Decision

**Date:** 2026-05-02
**Branch / Worktree:** `sprint-7-decision` at `.worktree/sprint-7-decision`
**Scope:** Audit-only sprint over the 130 cards listed in `card_progress.md §2.2` as 🟡 simplified implementations. Re-validate every card against BGA at deeper level (≥120s/card, 5-dimension verdict), make a per-card decision, and propagate results to `§2.5` (deliberate divergence) or — for surprise ⚠/❌ findings — to a follow-up Sprint 7a fix sprint.
**Effort estimate:** ~2-3 day total. Phase 0 (~30 min) + Phase 1 (~1 hour) + spot-check (~1 hour) + report + docs sync (~3-4 hour) + conditional Sprint 7a spec stub (~30 min).

## 0. Goal

Close the last `master-plan.md §0` open question — "Sprint 7 P3 130 张简化未启动" — by deciding per-card whether each simplification is acceptable. Combined with sprint-5e (post-merge) that closes ⚠ residual, this completes the BGA-alignment audit work captured in master-plan §0 except for the i18n gap (437 BGA `clienttranslate`).

This is **audit-only**. Newly surfaced ⚠/❌ deviations spawn Sprint 7a, NOT in-scope here.

## 1. Background

`card_progress.md §2.2` records 130 cards as 🟡 simplified implementations:

- **40 from 2026-04-28 deep pool** — names known, listed in `card_desc_audit.md §4.6`:
  - A (2): A132 Publican, A19 Handplow
  - B (7): B103, B128, B151, B152, B26, B163, B75
  - C (9): C71, C117, C120, C135, C145, C146, C70, C88, C89, C164 (typo in source — let audit re-list)
  - D (10): D12, D21, D36, D63, D77, D82, D87, D128, D134, D148
  - E (12): E30, E36, E49, E66, E72, E73, E91, E112, E118, E132, E148, E161
- **90 from 2026-04-29 wide-scan** — names lost (sub-agent reports `output/tmp/audit-agent-b{6..10}.md` are gitignored and have been overwritten). Per-deck verdict counts known from `card_desc_audit.md §5.1`:
  - A: 3 / B: 17 / C: 22 / D: 35 / E: 13

Some entries on the §2.2 list have already been re-classified in flight:

- E72/E91/E118/E16/E36/E68/E70/E142 etc. were re-audited in `sprint-5d-audit-report.md` (4 of these surfaced as new P1: E72, E91, E161 → already in Sprint 5e backlog; E16/E36/E68/E70/E118/E142 confirmed as legitimate 🟡)
- E30 (ChildsToy) and D12/D148 (mutual exclusion) were partly fixed in Sprint 6 — these may already be ✅ in code

So the live "still simplified, not yet re-audited at deeper level" set is somewhere between 100-120 cards. Exact count is the first deliverable.

## 2. Audit scope (130 cards, real names)

### 2.1 Known names (40 — deep pool)

Per §4.6 above. These have explicit names — agent does deep audit directly.

### 2.2 Unknown names (90 — wide-scan)

Lost from `audit-agent-b{6..10}.md`. **Phase 0 reconstructs the list** by re-running a compact wide-scan over each deck's full cards. Each deck has 137-152 cards total; wide-scan filters to 🟡 verdicts to produce the 90-name list (or whatever the new count is — wide-scan recounts may differ slightly from the original 90).

Phase 0 outputs `output/tmp/sprint-7-audit/wide-scan-relist.jsonl` (one line per card, fields `cardId, deck, verdict, oneline_reason`).

### 2.3 Cross-reference exclusions

After Phase 0 produces the 90 + 40 = ~130 list, exclude any card already covered by Sprint 5d / 6d / 6e / 5e:

- Sprint 5d superset (B 17 + E 21 + 4 verifies): if a card is in this set with verdict ✅ or 🟡 from 5d, mark it as "already deep-audited 5d" and inherit the verdict (no re-audit).
- Sprint 5e backlog (B163, E72, E91, E161): mark as "in 5e fix sprint" and skip.
- Sprint 6d/6e implementations (D131, E58, E153, C62): if any of these were on the original §2.2 list, they're now ✅ — mark and skip.

Net new cards to deep audit: estimated 70-90 unique.

## 3. Audit method

### 3.1 Phase 0 — Wide-scan re-list (~30 min, 5 sub-agents)

**Goal:** reconstruct the 90-name wide-scan list lost from `audit-agent-b{6..10}.md`.

**Method:** 5 `general-purpose` sub-agents in parallel, one per deck. Each agent does compact ≤90s/card audit over its full deck and emits one JSONL line per card with verdict.

```
agent-deck-A: 152 cards in shared/cards/A/ vs bga-agricola/.../Cards/A/
agent-deck-B: 150 cards
agent-deck-C: 150 cards
agent-deck-D: 152 cards
agent-deck-E: 137 cards
```

Output: `output/tmp/sprint-7-audit/wide-scan-relist-{A,B,C,D,E}.jsonl`. Filter 🟡 verdict lines → produces the wide-scan list.

This is a re-do of `audit-agent-b{6..10}.md` at the same precision. We accept the original ≤90s precision for name identification — the deep verdict is Phase 1.

### 3.2 Phase 1 — Deep audit (~1 hour, 5 sub-agents)

**Goal:** for every card on the merged list (Phase 0 wide-scan + §4.6 deep pool, minus 5d/5e/6d/6e overlaps), do a ≥120s/card 5-dimension audit identical to sprint-5d.

**Method:** 5 sub-agents in parallel, each handling ~20 cards. Same JSONL schema as sprint-5d:

```json
{
  "cardId": "...",
  "bgaPath": "...",
  "oursPath": "...",
  "verdict": "✅" | "⚠" | "❌" | "🟡" | "🔍",
  "dimensionsAligned": ["D1", "D2", "D3", "D4", "D5"],
  "deviations": [...],
  "notes": "..."
}
```

5 dimensions: D1 cost/players/prerequisite, D2 desc, D3 effect/listener wiring, D4 cardStates/counters/globals, D5 edge cases.

**Verdict semantics for §2.2 audit:**
- `"✅"`: actually aligned — simplification description was wrong, card is fully BGA-equivalent. Move from §2.2 to §2.0 changelog.
- `"🟡"`: simplification confirmed acceptable. Move from §2.2 to §2.5 deliberate divergence with reason.
- `"⚠"` / `"❌"`: simplification has a real behavioral cost — surfaces as Sprint 7a backlog item.
- `"🔍"`: agent could not audit (file missing, mismatched name). Re-dispatch.

### 3.3 Manual spot-check (~1 hour)

Top-5 highest-LOC cards from the deep audit + 5 random ⚠ verdicts (if any) get a manual read-through to catch systematic agent miss. Same protocol as sprint-5d §3.4.

If spot-check disagrees with agent verdict, re-dispatch the agent's full batch with elevated time budget (≥240s/card).

## 4. Decision matrix

Based on Phase 1 verdict distribution:

| Distribution | Action |
| ------------ | ------ |
| Mostly 🟡, 0-2 ⚠ | Bulk register §2.5; spawn Sprint 7a spec stub for the 0-2 ⚠ if any. **Expected outcome.** |
| Mostly 🟡, 5+ ⚠ | Same flow but Sprint 7a is more substantial. Decide between "fix now" vs "register and ship" per ⚠ card. |
| Many ✅ (re-aligned without us noticing) | Move ✅ from §2.2 to §2.0 changelog with note "previously misclassified as simplification, audit confirms aligned". §2.2 count drops. |
| Many ⚠/❌ | Surprise — should not happen for cards previously labeled "simplification". Investigate audit precision. |

After this sprint, master-plan §0 reads:

- ⚠ residual: 0 (post sprint-5e merge) [or N if 7a items exist]
- ❌ residual: 0 (post sprint-6e merge)
- i18n gap: 437 (unchanged)
- **Sprint 7 done**: §2.2 130 simplifications fully classified — N as deliberate divergence, M as previously-misclassified-now-aligned, K as Sprint 7a fixes

## 5. Deliverables

| Artifact | Path | Purpose |
| -------- | ---- | ------- |
| Phase 0 wide-scan relist | `output/tmp/sprint-7-audit/wide-scan-relist-{A,B,C,D,E}.jsonl` | Reconstruct lost 90-name list. gitignored. |
| Phase 1 per-agent JSONL | `output/tmp/sprint-7-audit/deep-audit-agent-{1..5}.jsonl` | gitignored intermediate. |
| Phase 1 merged | `output/tmp/sprint-7-audit/merged.jsonl` | gitignored. |
| Manual spot-check notes | `output/tmp/sprint-7-audit/spotcheck-notes.md` | gitignored. |
| **Audit report** | `docs/sprint-7-audit-report.md` | committed, full 130-card verdict table + decision per card |
| `card_progress.md §2.0` | append | Sprint 7 changelog row |
| `card_progress.md §2.2` | rewrite | Replace count "130 张" with explicit per-card list with verdict; many move to §2.5 |
| `card_progress.md §2.5` | append bulk | Receive cards classified as deliberate divergence with reason |
| `card_progress.md §8` | append | Sprint 7 timeline row |
| `master-plan.md §0` | rewrite Sprint 7 line | "未启动" → "done: classification complete" |
| `master-plan.md §8` | append | Sprint 7 progress row |
| `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md` | conditional | Only if audit finds ⚠/❌ |

## 6. Out of scope

- Implementing fixes for newly-surfaced ⚠/❌ deviations (those go to Sprint 7a).
- Touching cards that are not in the 130 §2.2 list.
- i18n work.
- Re-auditing cards already deep-audited by Sprint 5d (B 17 + E 21 superset + 4 verifies — those verdicts are inherited).
- Re-auditing the 4 cards in Sprint 5e backlog (B163/E72/E91/E161 — those are being fixed concurrently).

## 7. Risk / open questions

- **Phase 0 completeness**: re-running wide-scan may produce a slightly different 🟡 set than the original 90. We accept this — the goal is "audit current §2.2 candidates", not "match historical artifact". If Phase 0 finds ~85 instead of 90 cards, that's fine.
- **Phase 1 token budget**: 70-90 cards × ≥120s/card across 5 agents = manageable. If an agent runs out of context, re-dispatch with smaller batch.
- **🟡 bias**: cards that have been on the §2.2 list since 2026-04-28 may have been silently fixed in unrelated Sprint 5/6 work without §2.2 propagation. Audit will catch these as ✅. Expect 5-15 cards to drop out this way.
- **Concurrent sprint-5e**: Sprint 5e is fixing B163/E72/E91/E161 in parallel. If 5e merges before Sprint 7's audit finishes, the audit must read the post-5e code state. Coordinate via worktree base — Sprint 7 should rebase on latest main before each agent dispatch.
- **Schedule coupling with sprint-5e**: same as sprint-5d/6e timing — separate worktree, no merge conflict expected. 7 lands after 5e ideally; if before, no harm.

## 8. Definition of Done

- [ ] Phase 0: 5 deck-wide sub-agents complete; wide-scan relist contains ~90 cards
- [ ] Phase 1: 5 deep-audit sub-agents complete; merged.jsonl contains all cards (deep pool 40 + wide-scan rebuild ~90 - 5d/5e/6d/6e overlaps)
- [ ] Top-5 LOC + 5 random ⚠ spot-check complete; 0 verdict flips (or batched re-audit done)
- [ ] `docs/sprint-7-audit-report.md` committed, no placeholders, every card has a verdict
- [ ] `card_progress.md` §2.0 changelog + §2.2 rewritten + §2.5 bulk-appended + §8 timeline
- [ ] `master-plan.md` §0 Sprint 7 line + §8 row
- [ ] If ⚠/❌ found: `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md` committed
- [ ] PR opened, local CI green (fast + lint + build), rebase merged to main

## 9. Sequence

1. Pre-flight: confirm worktree clean, rebase on latest main (post sprint-5e merge ideally).
2. Build Phase 0 input prompts for 5 deck-wide agents.
3. Dispatch Phase 0 in parallel; wait ~30 min.
4. Merge Phase 0 outputs; dedupe overlaps with sprint-5d / 5e backlog.
5. Build Phase 1 input prompts for 5 deep-audit agents (assign ~20 cards each from the merged list).
6. Dispatch Phase 1 in parallel; wait ~1 hour.
7. Merge Phase 1 outputs.
8. Manual spot-check on top-5 LOC + 5 random ⚠.
9. Write audit report.
10. Docs sync (largest task — 130 cards to register).
11. Conditional: write Sprint 7a spec stub.
12. Local CI: fast + lint + build.
13. Push + open PR + rebase merge (per user preference: don't wait GitHub CI).
