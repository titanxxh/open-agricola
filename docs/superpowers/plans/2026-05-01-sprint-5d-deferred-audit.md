# Sprint 5d — Deferred Audit & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a deeper-than-§5.7 audit of 41 cards (B-deck 17 + E-deck 21 + 4 already-fixed verifies: C23/A1/A22/A38 — note E-deck count is 21, spec §2.2 lists 21 entries despite header reading "20") in parallel via 4 sub-agents, propagate Sprint 5b/5c strikethroughs to `card_progress.md §2.3`, drive `master-plan.md §0` ⚠ residual count to 0 (or N if real bugs surface).

**Architecture:** Audit-only sprint — no implementation code touched. Per CLAUDE.md, Agent tool launches multiple `general-purpose` sub-agents in a single message for parallelism. Each sub-agent writes a JSONL verdict file under `output/tmp/sprint-5d-audit/` (gitignored intermediate); a merge step in this plan aggregates JSONL → committed `docs/sprint-5d-audit-report.md`. Manual spot-check on top-5 highest-LOC cards guards against systematic agent miss. Bugs surfaced by the audit go to a follow-up Sprint 5e spec stub, NOT in-scope here.

**Tech Stack:** Bash for orchestration, Agent tool for sub-agents, jq for JSONL aggregation, no compile / test / lint changes (audit-only).

---

## File structure

| File | Role |
| ---- | ---- |
| `output/tmp/sprint-5d-audit/inputs/agent-{1..4}.md` | NEW — per-agent input prompt (card list + 5-dim template + paths). gitignored. |
| `output/tmp/sprint-5d-audit/agent-{1..4}.jsonl` | NEW — per-agent output. gitignored intermediate; merged into final report. |
| `output/tmp/sprint-5d-audit/merged.jsonl` | NEW — concat of agent outputs. gitignored. |
| `output/tmp/sprint-5d-audit/spotcheck-notes.md` | NEW — human spot-check notes during Task 4. gitignored. |
| `docs/sprint-5d-audit-report.md` | NEW — committed; full per-card verdict table + summary. |
| `docs/card_progress.md` | MODIFY — §2.0 changelog row, §2.3 strikethroughs, §8 timeline row. |
| `docs/master-plan.md` | MODIFY — §0 ⚠ residual update, §8 progress row. |
| `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md` | CONDITIONAL NEW — only if audit finds bugs. |

No code files touched. No tests added (audit-only).

---

## Pre-flight

- [ ] **Step 0.1: Confirm worktree baseline**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-5d-deferred-audit
git rev-parse --abbrev-ref HEAD                 # → sprint-5d-deferred-audit
git log --oneline -3                            # → spec commit on top of post-6d main
git status                                      # → clean
```

Expected: branch `sprint-5d-deferred-audit`, head is `2b14f0b4 docs(spec): Sprint 5d deferred audit ...`, working tree clean.

- [ ] **Step 0.2: Verify BGA reference exists**

```bash
ls -d /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/B 2>&1 | head -3
ls -d /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/E 2>&1 | head -3
ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/C/C23_*.php
```

Expected: directories exist; `C23_JobContract.php` listed. If missing, halt — audit cannot proceed without BGA reference.

- [ ] **Step 0.3: Verify our card files exist**

```bash
ls shared/cards/B/B103_*.ts shared/cards/E/E16_*.ts shared/cards/C/C23_*.ts
```

Expected: 3 files, no errors.

- [ ] **Step 0.4: Skip baseline test run**

Audit-only sprint. No test changes coming. Do not run `pnpm test:fast` — saves ~30 seconds and the result is irrelevant to audit fidelity. (If a curious worker insists, 1933 expected post sprint-6e merge or 1911 if 6e not yet merged.)

---

## Task 1: Build per-agent input prompts

**Files:**
- Create: `output/tmp/sprint-5d-audit/inputs/agent-1.md`
- Create: `output/tmp/sprint-5d-audit/inputs/agent-2.md`
- Create: `output/tmp/sprint-5d-audit/inputs/agent-3.md`
- Create: `output/tmp/sprint-5d-audit/inputs/agent-4.md`

> Each agent gets a focused prompt with card list, BGA + ours paths, 5-dim template, output format. No agent dispatch yet — that's Task 2.

- [ ] **Step 1.1: Make output directory**

```bash
mkdir -p output/tmp/sprint-5d-audit/inputs
```

- [ ] **Step 1.2: Write agent-1 input prompt (B-deck prefix half, 9 cards)**

Create `output/tmp/sprint-5d-audit/inputs/agent-1.md`:

````markdown
# Agent 1 — B-deck audit (9 cards)

You are a read-only audit sub-agent for the open-agricola project. Your job: compare 9 B-deck card implementations against the BGA reference and emit one structured JSONL verdict per card.

**Working directory:** `/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-5d-deferred-audit`
**BGA reference root:** `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/B/`
**Our card root:** `shared/cards/B/`

**Cards (9):**
- B103 (file pattern: `B103_*.php` / `B103_*.ts`)
- B107
- B108
- B111
- B128
- B134
- B137
- B151
- B156

**Output:** Write one JSON line per card to `output/tmp/sprint-5d-audit/agent-1.jsonl`. The file should contain exactly 9 lines.

**Per-card method:**

For each card:

1. Locate BGA file: `ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/B/B103_*.php` (then read it).
2. Locate our file: `ls shared/cards/B/B103_*.ts` (then read it).
3. If implementation is split (e.g. `*_impl.ts`, listener file elsewhere), follow imports.
4. Compare across 5 dimensions:
   - **D1: Cost / players / prerequisite** vs BGA `__construct` (`$this->cost`, `$this->players`, `$this->prerequisite`).
   - **D2: Desc** vs BGA `$this->desc[]` `clienttranslate(...)` strings (text alignment, even partial deviations are flagged).
   - **D3: Effect / listener / action wiring** — BGA `on*` methods, `getEffects()`, `getExchanges()`, plus class inheritance chain. Ours: `effect.*`, `listeners[]`, `_impl` exports. Compare semantically — name differences are fine if behavior matches.
   - **D4: Runtime cardStates / counters / globals** — BGA `Globals::*` writes vs our `cardStates[CARD_ID].*` writes; counter parity.
   - **D5: Edge cases** — BGA `$this->rulings`, special trigger guards (`isPrincipalAction`, `if ($player->isStarter())`), round/phase guards, `isCorbariusOrDulcinaria` carve-outs.
5. Spend ≥120s per card before emitting verdict (read both files fully; trace cross-references).
6. Append the verdict line to `output/tmp/sprint-5d-audit/agent-1.jsonl`.

**Output JSON schema (one line per card):**

```json
{
  "cardId": "B103_FullName",
  "bgaPath": "modules/php/Cards/B/B103_FullName.php",
  "oursPath": "shared/cards/B/B103_FullName.ts",
  "verdict": "✅" | "⚠" | "❌" | "🟡" | "🔍",
  "dimensionsAligned": ["D1", "D2", "D3", "D4", "D5"],
  "deviations": [
    {
      "dimension": "D1" | "D2" | "D3" | "D4" | "D5",
      "bgaSays": "concrete quote / behavior",
      "oursSays": "concrete quote / behavior",
      "severity": "P0" | "P1" | "P2" | "P3",
      "suggestedFix": "short imperative",
      "evidence": "bga:Cards/B/B103.php:L23 vs ours:shared/cards/B/B103.ts:L45"
    }
  ],
  "notes": "any nuance — empty string if none"
}
```

**Verdict rules:**
- `"✅"` — all 5 dimensions aligned (or only registered-as-deliberate-divergence misalignment)
- `"🟡"` — simplified implementation that intentionally drops a corner case (note in `deviations` with severity P2/P3)
- `"⚠"` — behavioral deviation that may misjudge a turn (P1+)
- `"❌"` — wrong rule, breaks a known scenario (P0)
- `"🔀"` — file exists in both sides but one wraps the other differently (e.g. our card delegates to a generic action — verify the delegation is correct)
- `"🔍"` — could not finish audit (e.g. BGA file missing); explain in `notes`

**Constraints:**
- Read-only. Do NOT write to `shared/`, `server/`, or anywhere outside `output/tmp/sprint-5d-audit/`.
- Do NOT fix bugs you find. Document them in the JSONL `deviations` array — Sprint 5d is audit-only.
- If a card's BGA file is missing or our file is missing, emit verdict `🔍` and continue.
- Total time budget: ~30 minutes for 9 cards (~3 min each, balancing reading depth + agent context window).

**Final output check:**
After all 9 cards, run:
```bash
wc -l output/tmp/sprint-5d-audit/agent-1.jsonl     # → 9
jq -c . output/tmp/sprint-5d-audit/agent-1.jsonl | head -3   # → valid JSON per line
```

Report a 50-word summary: "audited N cards, ✅ X / ⚠ Y / ❌ Z / 🟡 W / 🔍 V; notable deviations: [list]." Do not paste the JSONL back — it's already on disk.
````

- [ ] **Step 1.3: Write agent-2 input prompt (B-deck suffix + 4 verifies, 12 cards)**

Create `output/tmp/sprint-5d-audit/inputs/agent-2.md` with the same structure as agent-1, but card list:

```markdown
# Agent 2 — B-deck audit (8 cards) + already-fixed verifies (4 cards)

**Cards (8 B-deck):**
- B163, B26, B3, B30, B68, B72, B75, B82

**Cards (4 verify-already-fixed — Sprint 5b changelog claims these were fixed):**
- C23 (Sprint 5b: drop `occupationHand.length === 0` guard)
- A1 (Sprint 5b: stables `actionContext.zoneFilter='pasture-1' + max:1`)
- A22 (Sprint 5b: `workersAvailable === 0` guard)
- A38 (Sprint 5b: prereq `Wooden House → 5 Sheep` + `countSheepOnBoard` helper)

**Verify mode for the 4 already-fixed cards:**
For C23/A1/A22/A38 specifically, beyond the 5 dimensions, verify the Sprint 5b fix description matches what's actually in our code now. If our code does NOT yet contain the claimed fix, that's a real bug — verdict `❌` with severity P0 and a note "Sprint 5b changelog claim does not match code state."

**Output:** `output/tmp/sprint-5d-audit/agent-2.jsonl` (12 lines).

[Then duplicate the rest of agent-1 prompt verbatim from "**Per-card method:**" through "Final output check:" — just substitute paths and counts. Use `Cards/A/` and `Cards/C/` paths for the 4 verifies.]
```

Use the same schema, same constraints, same output check (`wc -l → 12`). Save the full prompt — do NOT abbreviate the per-card method or output schema. The agent reads this in isolation and won't have agent-1's prompt for context.

- [ ] **Step 1.4: Write agent-3 input prompt (E-deck prefix half, 10 cards)**

Create `output/tmp/sprint-5d-audit/inputs/agent-3.md` mirroring agent-1's structure. Card list:

```
E101, E116, E118, E12, E142, E144, E156, E16, E160, E161
```

Output: `output/tmp/sprint-5d-audit/agent-3.jsonl` (10 lines).

Paths: `bga-agricola/modules/php/Cards/E/` and `shared/cards/E/`.

- [ ] **Step 1.5: Write agent-4 input prompt (E-deck suffix half, 11 cards)**

Create `output/tmp/sprint-5d-audit/inputs/agent-4.md` mirroring agent-1's structure. Card list:

```
E165, E30, E36, E49, E68, E69, E70, E72, E91, E95, E96
```

Output: `output/tmp/sprint-5d-audit/agent-4.jsonl` (11 lines).

Note: E-deck total = 21 (10 in agent-3 + 11 in agent-4), differing from spec §2.2's "20" header (the bullet list under that header has 21 entries; trust the list).

- [ ] **Step 1.6: Verify all 4 input files exist**

```bash
ls -la output/tmp/sprint-5d-audit/inputs/
wc -l output/tmp/sprint-5d-audit/inputs/agent-*.md
```

Expected: 4 files, each non-trivial line count (each prompt should be 80-120 lines).

- [ ] **Step 1.7: Commit (note: input files are gitignored, so commit just the directory marker if any)**

`output/tmp/` is gitignored — agent inputs do not enter git. No commit needed for Task 1. Verify with:

```bash
git check-ignore output/tmp/sprint-5d-audit/inputs/agent-1.md
```

Expected: prints the path (confirms ignored).

---

## Task 2: Dispatch 4 sub-agents in parallel

**Files:**
- Read: `output/tmp/sprint-5d-audit/inputs/agent-{1..4}.md` (input prompts)
- Agent dispatches (the actual work — multiple `Agent` tool calls in one message per CLAUDE.md "make all independent calls in parallel")
- Output: `output/tmp/sprint-5d-audit/agent-{1..4}.jsonl`

> CRITICAL: launch all 4 in one message (single response with 4 Agent tool blocks) so they run in parallel. Sequential dispatch wastes ~3x time.

- [ ] **Step 2.1: Read input prompts to memory**

```bash
cat output/tmp/sprint-5d-audit/inputs/agent-1.md
cat output/tmp/sprint-5d-audit/inputs/agent-2.md
cat output/tmp/sprint-5d-audit/inputs/agent-3.md
cat output/tmp/sprint-5d-audit/inputs/agent-4.md
```

Quick sanity check: each prompt has card list, paths, schema, constraints, final-output check.

- [ ] **Step 2.2: Dispatch 4 agents in a single message**

In one assistant message, emit four Agent tool calls. Use `subagent_type: "general-purpose"` for each. The `prompt` field for each is the corresponding input file's contents verbatim, with one prepended sentence:

> "Working directory: `/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-5d-deferred-audit`. Operate read-only on shared/server/client trees; write only to `output/tmp/sprint-5d-audit/agent-N.jsonl`. Time budget ~30 min."

For agent-1: description `"Audit B-deck 9 cards"`, prompt = the contents of `inputs/agent-1.md`.
For agent-2: description `"Audit B-deck 8 + 4 verifies"`, prompt = `inputs/agent-2.md`.
For agent-3: description `"Audit E-deck 10 cards"`, prompt = `inputs/agent-3.md`.
For agent-4: description `"Audit E-deck 11 cards"`, prompt = `inputs/agent-4.md`.

DO NOT use `run_in_background: true`. We want all 4 to come back together (and the user is waiting on this sprint), not stream completions.

- [ ] **Step 2.3: Confirm all 4 returned**

When all 4 agents have completed, verify outputs:

```bash
ls -la output/tmp/sprint-5d-audit/
wc -l output/tmp/sprint-5d-audit/agent-{1..4}.jsonl
```

Expected counts:
- agent-1.jsonl: 9 lines
- agent-2.jsonl: 12 lines
- agent-3.jsonl: 10 lines
- agent-4.jsonl: 11 lines

Total: 42 lines. (Spec says 41; the +1 difference is because spec §2.2's E-list has 21 entries despite header claiming 20. Take 42 as the true count.)

- [ ] **Step 2.4: Validate JSONL syntax**

```bash
for f in output/tmp/sprint-5d-audit/agent-{1..4}.jsonl; do
  echo "=== $f ==="
  jq -c . "$f" 2>&1 | head -3 || echo "INVALID JSON in $f"
done
```

Expected: each file shows 3 valid JSON lines, no "INVALID JSON" message. If any file fails, re-dispatch that single agent in Step 2.5.

- [ ] **Step 2.5 (conditional): Re-dispatch agent on failure**

If a JSONL file is malformed or short, dispatch only that agent again (single Agent tool call), with the same input prompt + a corrective preamble: "Your previous run produced malformed JSONL or fewer lines than expected. Re-emit all N verdicts as one valid JSON line each, overwriting `output/tmp/sprint-5d-audit/agent-N.jsonl`."

- [ ] **Step 2.6: No commit for Task 2**

JSONL files are gitignored. Move to Task 3.

---

## Task 3: Aggregate JSONL → merged report

**Files:**
- Create: `output/tmp/sprint-5d-audit/merged.jsonl` (gitignored intermediate)
- Bash + jq aggregation

- [ ] **Step 3.1: Concatenate JSONL**

```bash
cat output/tmp/sprint-5d-audit/agent-{1..4}.jsonl > output/tmp/sprint-5d-audit/merged.jsonl
wc -l output/tmp/sprint-5d-audit/merged.jsonl
```

Expected: 42 lines.

- [ ] **Step 3.2: Compute verdict distribution**

```bash
jq -r '.verdict' output/tmp/sprint-5d-audit/merged.jsonl | sort | uniq -c
```

Example expected output (if §5.7 conclusion holds):
```
     42 ✅
```

If any other verdict appears, capture details for the report:

```bash
jq -c 'select(.verdict != "✅")' output/tmp/sprint-5d-audit/merged.jsonl
```

- [ ] **Step 3.3: Extract deviations**

```bash
jq -c '.deviations[] | select(.severity == "P0" or .severity == "P1")' output/tmp/sprint-5d-audit/merged.jsonl
```

Save to `output/tmp/sprint-5d-audit/p0p1-deviations.txt` for review.

```bash
jq -c '.deviations[] | select(.severity == "P0" or .severity == "P1")' output/tmp/sprint-5d-audit/merged.jsonl > output/tmp/sprint-5d-audit/p0p1-deviations.txt
wc -l output/tmp/sprint-5d-audit/p0p1-deviations.txt
```

The line count drives Sprint 5d's outcome path:
- 0 P0/P1 deviations → "audit confirms §5.7" closure path (Task 6 docs sync only)
- ≥1 P0/P1 → Task 8 conditional Sprint 5e spec stub kicks in

- [ ] **Step 3.4: List any 🔍 (could-not-finish) cards for follow-up**

```bash
jq -r 'select(.verdict == "🔍") | .cardId + ": " + .notes' output/tmp/sprint-5d-audit/merged.jsonl
```

If any cards have `🔍`, dispatch a single targeted re-audit agent for them in Step 3.5.

- [ ] **Step 3.5 (conditional): Targeted re-audit on 🔍 cards**

If any 🔍 verdicts came back, dispatch one more Agent tool call with a focused prompt listing only those cards and asking for a deeper look. Append results to `output/tmp/sprint-5d-audit/agent-retry.jsonl`, re-merge.

- [ ] **Step 3.6: No commit yet — gitignored intermediate**

Move to Task 4.

---

## Task 4: Manual spot-check of top-5 highest-LOC cards

**Files:**
- Create: `output/tmp/sprint-5d-audit/spotcheck-notes.md` (gitignored, but content is paraphrased into the committed audit report in Task 5)

> Goal: catch systematic agent blindspots. Pick 5 cards with the largest BGA file size — those have the most logic surface where a 120s skim could miss things. Read both files fully (10+ min each) and spot-check the agent verdict.

- [ ] **Step 4.1: Identify top-5 by LOC**

```bash
for card in $(jq -r '.cardId' output/tmp/sprint-5d-audit/merged.jsonl); do
  bga_file=$(ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/{A,B,C,D,E}/${card}*.php 2>/dev/null | head -1)
  [ -z "$bga_file" ] && continue
  loc=$(wc -l < "$bga_file")
  echo "$loc $card $bga_file"
done | sort -rn | head -5
```

Expected: 5 cards with line counts. The 5 highest are spot-check targets.

- [ ] **Step 4.2: Spot-check each of the 5 cards manually**

For each of the 5 cards:

1. Read the full BGA file: `cat <bga_file>`.
2. Read our card file (and follow imports if `_impl.ts`): `cat shared/cards/<deck>/<card>*.ts`.
3. For each of the 5 dimensions, write a 1-2 line judgment in `output/tmp/sprint-5d-audit/spotcheck-notes.md` under a heading per card.
4. Compare your judgment to the agent's JSONL verdict for that card.
5. Flag any mismatches.

Template for spot-check notes:

```markdown
## Spot-check: <CardId>
- **BGA LOC:** <N>
- **Agent verdict:** ✅ / ⚠ / ...
- **My verdict:** ✅ / ⚠ / ...
- **D1 Cost/players/prereq:** [my read]
- **D2 Desc:** [my read]
- **D3 Effect/listener wiring:** [my read]
- **D4 cardStates/counters:** [my read]
- **D5 Edge cases:** [my read]
- **Mismatch with agent?** No / Yes — [details]
```

- [ ] **Step 4.3: Decide expansion if mismatches found**

If 0 of 5 spot-checks contradict the agent: spot-check passed → proceed to Task 5.

If 1+ of 5 mismatch:
- If mismatch is in the same agent's batch: re-audit that agent's full batch with elevated time budget (`≥240s/card`). Update the merged.jsonl.
- If mismatches span multiple agents: systematic issue — escalate to the user before continuing. Do NOT silently proceed.

- [ ] **Step 4.4: No commit yet (gitignored)**

Spot-check notes are intermediate. Commit happens in Task 5 when notes are paraphrased into the public report.

---

## Task 5: Write `docs/sprint-5d-audit-report.md`

**Files:**
- Create: `docs/sprint-5d-audit-report.md` (committed)

- [ ] **Step 5.1: Write the report**

Create `docs/sprint-5d-audit-report.md` with the following structure. Fill in numbers and details from `merged.jsonl`, deviation files, and spot-check notes.

```markdown
# Sprint 5d Audit Report — Deferred Cards Re-Validation

**Date:** 2026-05-01
**Scope:** 42 cards across B-deck (17), E-deck (21), and 4 already-fixed verifies (C23 / A1 / A22 / A38).
**Method:** 4 parallel `general-purpose` sub-agents, ≥120s/card, 5-dimension JSONL output, manual spot-check of top-5 highest-LOC cards.
**Deeper-than-§5.7:** §5.7 (2026-04-30) used 90s/card compact mode. This audit doubles per-card time and adds spot-check.

## Summary

| Metric | Count |
| ------ | ----- |
| Total cards audited | 42 |
| ✅ aligned | <N> |
| 🟡 simplified (deliberate / acceptable) | <N> |
| ⚠ deviation (P1) | <N> |
| ❌ deviation (P0) | <N> |
| 🔀 reframed (delegates to generic action) | <N> |
| 🔍 could-not-finish | <N> |
| New P0/P1 deviations not previously logged | <N> |

## Verdict per agent

| Agent | Cards | ✅ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
| ----- | ----- | -- | -- | -- | -- | -- | -- |
| 1 (B prefix 9) | 9 | <N> | ... |
| 2 (B suffix 8 + 4 verifies) | 12 | <N> | ... |
| 3 (E prefix 10) | 10 | <N> | ... |
| 4 (E suffix 11) | 11 | <N> | ... |

## Already-fixed verify confirmations

| Card | Sprint 5b claimed fix | Audit confirmation |
| ---- | --------------------- | ------------------- |
| C23 | drop `occupationHand.length === 0` guard | <✅ confirmed / ❌ NOT in code> |
| A1 | stables `actionContext.zoneFilter='pasture-1' + max:1` | <...> |
| A22 | `workersAvailable === 0` guard | <...> |
| A38 | prereq `Wooden House → 5 Sheep` + `countSheepOnBoard` | <...> |

## New deviations found (P0/P1)

<If empty, write "None — §5.7 conclusion confirmed at deeper review.">
<Else, one entry per deviation:>

### <CardId> — <D1/D2/.../D5> — <P0/P1>

- BGA: ...
- Ours: ...
- Suggested fix: ...
- Evidence: ...

## Manual spot-check

Top-5 highest-LOC cards reviewed by hand:

| Card | BGA LOC | Agent verdict | Spot-check verdict | Match? |
| ---- | ------- | ------------- | ------------------ | ------ |
| <C1> | <N> | ✅ | ✅ | yes |
| <C2> | ... |

<If 0 mismatches: "All 5 spot-checks confirm agent verdicts. Spot-check passed.">
<If mismatches: enumerate.>

## Closure status

<If 0 new P0/P1 deviations:>
**Closed.** §5.7 wide-scan tail review confirmed at deeper level. `master-plan.md §0` ⚠ residual count drops from "~1 张" to "0 张". §2.3 Sprint 5 deferred entries propagated with ✅ Sprint 5b/5c marks per the audit. No follow-up sprint required.

<If >0:>
**Partial closure.** N P0/P1 deviations require fixes. Tracked in `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md`. `master-plan.md §0` ⚠ residual count: <N> 张 (down from ~1 张; new bugs surfaced by deeper audit).

## Per-card detail (full JSONL)

The 42-line JSONL is intermediate (`output/tmp/sprint-5d-audit/merged.jsonl`, gitignored). For each card with a non-`✅` verdict, the full deviation record is reproduced below for the historical record.

<For each non-✅ card:>

### <CardId>
- BGA path: ...
- Ours path: ...
- Verdict: ...
- Deviations: <copy from JSONL>
- Notes: ...

<End of report>
```

Replace all `<...>` placeholders with concrete values derived from `merged.jsonl`, `p0p1-deviations.txt`, and `spotcheck-notes.md`. Do not commit with placeholders.

- [ ] **Step 5.2: Sanity check**

```bash
grep -c "<.*>" docs/sprint-5d-audit-report.md
```

Expected: 0 (all placeholders filled). If non-zero, fix and re-grep.

- [ ] **Step 5.3: Commit the audit report**

```bash
git add docs/sprint-5d-audit-report.md
git commit -m "docs: Sprint 5d audit report (42 cards, ≥120s/card + spot-check)"
```

---

## Task 6: Update `card_progress.md`

**Files:**
- Modify: `docs/card_progress.md` (§1 totals, §2.0 changelog, §2.3 strikethroughs, §8 timeline)

- [ ] **Step 6.1: Update §1 — adjust ⚠ column if any new bugs surfaced**

Find the verdict-summary table near the top (around line 12-22). The "⚠" column total should reflect any new P1 bugs found by the audit. If audit found 0 new bugs, no change here. If audit found N new bugs, increment the appropriate deck's ⚠ column.

If no change needed, skip this step.

- [ ] **Step 6.2: Append §2.0 changelog entry**

Locate the §2.0 changelog section. Insert the following BEFORE the existing entries (newest-first ordering):

```markdown
- **2026-05-01 Sprint 5d — Deferred audit & cleanup (42 cards re-validated, audit-only)**:
  - Re-audited 42 cards (B-deck 17 + E-deck 21 + already-fixed verifies C23/A1/A22/A38) at ≥120s/card via 4 parallel sub-agents, deeper than §5.7's 90s/card compact mode. Top-5 highest-LOC cards spot-checked manually.
  - **Result:** <N> ✅ / <N> 🟡 / <N> ⚠ / <N> ❌ / <N> 🔀 / <N> 🔍. <If 0 new bugs:> §5.7 wide-scan tail conclusion confirmed at deeper review — Sprint 5 deferred queue empty.
  - **§2.3 propagation:** C23 / A1 / A22 / A38 entries marked ✅ Sprint 5b (Sprint 5b changelog already documented these fixes; this audit confirmed they are in code). "B 牌组 wide-scan 11 张" + "E 牌组 wide-scan 4 张" aggregate entries replaced with full ✅ markers per the audit verdict.
  - **§0 update (master-plan):** ⚠ residual count "~1 张" → "0 张" <if 0 new>. Strict "对齐 BGA 完成" criterion now reads ⚠=0 / ❌=0 (post sprint-6e) — only i18n + Sprint 7 P3 decision remain.
  - <If new bugs:> Spawned Sprint 5e follow-up spec at `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md` for the <N> P0/P1 deviations newly surfaced.
  - Audit report: `docs/sprint-5d-audit-report.md`. spec/plan: `docs/superpowers/specs/2026-05-01-sprint-5d-deferred-audit-design.md` / `docs/superpowers/plans/2026-05-01-sprint-5d-deferred-audit.md`.
```

Substitute `<N>` placeholders with actual numbers and remove conditional `<If ...>` text per the audit outcome.

- [ ] **Step 6.3: Update §2.3 deferred list — propagate strikethrough/✅**

Locate the "Sprint 5 PR-5 + mech-A + mech-D + mech-B deferred to follow-up" subsection. Update the four following bullets:

Before:

```
- **C23** — triggering condition deviation (need re-read of BGA file to identify)
```

After:

```
- ~~**C23 JobContract** — triggering condition deviation (need re-read of BGA file to identify)~~ — ✅ **Sprint 5b** done (drop `occupationHand.length === 0` guard; lessons-listener cards now fire correctly even when occupation hand is empty), confirmed by Sprint 5d audit
```

Before:

```
- **B 牌组 wide-scan 11 张** (audit-agent-b7.md) — holder/field metadata-driven behavior offsets, individual cases need re-read
```

After:

```
- ~~**B 牌组 wide-scan 11 张** (audit-agent-b7.md) — holder/field metadata-driven behavior offsets, individual cases need re-read~~ — ✅ **Sprint 5d audit** confirmed all aligned (full 17-B-deck §5.7 superset re-validated at ≥120s/card; original 11 names from lost agent-b7.md absorbed into superset). Audit report: `docs/sprint-5d-audit-report.md`.
```

Before:

```
- **A1 Shelter, A22 Telegram, A38 WoolBlankets, ~~A165 PigBreeder~~ ✅ Sprint 5c** wide-scan items — A1/A22/A38 partially fixed in Sprint 2 PR-2A; A165 fully aligned via onAfterRoundEnd + breedLeaf in Sprint 5c
```

After:

```
- ~~**A1 Shelter** ✅ Sprint 5b~~ (stables `actionContext.zoneFilter='pasture-1' + max:1`, confirmed by Sprint 5d audit), ~~**A22 Telegram** ✅ Sprint 5b~~ (`workersAvailable === 0` guard + reserve registration in §2.5, confirmed by Sprint 5d audit), ~~**A38 WoolBlankets** ✅ Sprint 5b~~ (prereq `Wooden House → 5 Sheep` + `countSheepOnBoard` helper, confirmed by Sprint 5d audit), ~~**A165 PigBreeder** ✅ Sprint 5c~~ — wide-scan items all closed
```

Before:

```
- **E 牌组 wide-scan 4 张** (audit-agent-b10.md) — pending detailed listing; aggregated under "E 牌组其余 4 张待详细列"
```

After:

```
- ~~**E 牌组 wide-scan 4 张** (audit-agent-b10.md) — pending detailed listing; aggregated under "E 牌组其余 4 张待详细列"~~ — ✅ **Sprint 5d audit** confirmed all aligned (full 21-E-deck §5.7 superset re-validated at ≥120s/card; original 4 names from lost agent-b10.md absorbed into superset). Audit report: `docs/sprint-5d-audit-report.md`.
```

Also update the §2.3 closing line that says:

```
These are all **bugs** (not deliberate divergences). Suggested next: pick a 4-day batch of medium-complexity items (B29 / B115) for a follow-up Sprint 5b.
```

To:

```
These are all **bugs** (not deliberate divergences). Sprint 5b/5c/5d collectively closed every entry. **Sprint 5 deferred queue is now empty** as of 2026-05-01 Sprint 5d audit.
```

- [ ] **Step 6.4: Update §2.3 individual table rows for C23**

The §2.3 table near line 281-283 has a "C23" row with verdict P1 (no ✅). Update to:

```
| **C23 JobContract** | 触发条件偏差 | P1 | ✅ **Sprint 5b** done (drop `occupationHand.length === 0` guard); confirmed by Sprint 5d audit |
```

Also check rows for A1/A22/A38 and add ✅ Sprint 5b markers if not already there. Search:

```bash
grep -n "A1 Shelter\|A22 Telegram\|A38 WoolBlankets" docs/card_progress.md
```

Add ✅ markers in any P1/P2 rows that are missing them.

- [ ] **Step 6.5: Append §8 timeline row**

Find the timeline table near the bottom of `card_progress.md`. Append after the most recent Sprint row (which should be Sprint 6e if 6e merged before 5d, or Sprint 6d if not):

```
| Sprint 5d (deferred audit & cleanup: 42 cards re-validated; §2.3 Sprint 5 deferred queue closed) | 05-01 | 0 | <unchanged> | <unchanged %> |
```

The `<unchanged>` cell preserves whatever the latest count was (e.g. 833 if Sprint 6e not yet merged, 834 if it is). 5d is audit-only — no card count changes.

- [ ] **Step 6.6: Commit**

```bash
git add docs/card_progress.md
git commit -m "docs(card_progress): Sprint 5d audit propagates §2.3 strikethroughs; deferred queue closed"
```

---

## Task 7: Update `master-plan.md`

**Files:**
- Modify: `docs/master-plan.md` (§0 sprint list + ⚠ residual + §8)

- [ ] **Step 7.1: Update §0 sprint list**

Find the sprint-list block (around line 25-35). Insert a Sprint 5d row after the Sprint 5c row:

```
Sprint 5d  done             Sprint 5 deferred audit (42 cards re-validated, §2.3 deferred queue closed)
```

(The exact column alignment matches the existing rows — preserve the spacing.)

- [ ] **Step 7.2: Update §0 ⚠ residual count**

Find the line:

```
- ⚠ 残留：~1 张 P1 行为偏差（Sprint 5 deferred — Sprint 5 主路径 + 5b/5c 已累计修 19/28 张外加 mech-* / sideEffect / breed leaf 通用扩展）
```

Replace with one of the two outcomes:

**If 0 new P0/P1 from audit:**

```
- ⚠ 残留：0 张 P1 行为偏差（Sprint 5 deferred queue closed by Sprint 5d audit; Sprint 5 主路径 + 5b/5c 累计修 19/28 张 + 5d audit confirmed 0 residual deviations on the remaining 42-card §5.7 superset）
```

**If N>0 new P0/P1 from audit:**

```
- ⚠ 残留：<N> 张 P1 行为偏差（Sprint 5d audit 在 42 card §5.7 superset deeper review 中新发现 <N> 张 deviation；spawn Sprint 5e follow-up at `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md`）
```

- [ ] **Step 7.3: Append §8 progress row**

Find the §8 table. Append after the most recent Sprint 5/6 row:

```
| 5d     | Sprint 5 deferred audit (42 cards re-validated)                            | 0 cards (audit-only) + 4 ✅-mark propagation + queue closure | 1.5 day | ~0.5 day (0 bugs) or ~1.5 day (with 5e spec stub) | done（4 sub-agents in parallel re-audited B-deck 17 + E-deck 21 + 4 already-fixed verifies (C23/A1/A22/A38) at ≥120s/card; manual spot-check on top-5 highest-LOC cards. <Result: N ✅ / N 🟡 / ...>. §2.3 Sprint 5 deferred queue closed; §0 ⚠ residual `~1 → 0`. Audit report: `docs/sprint-5d-audit-report.md`.） | docs/superpowers/specs/2026-05-01-sprint-5d-deferred-audit-design.md | docs/superpowers/plans/2026-05-01-sprint-5d-deferred-audit.md | sprint-5d-deferred-audit |
```

Substitute `<Result: ...>` with actual numbers. If bugs found, change the "queue closed" wording to "<N> P0/P1 spawned to Sprint 5e".

- [ ] **Step 7.4: Commit**

```bash
git add docs/master-plan.md
git commit -m "docs(master-plan): Sprint 5d closes deferred queue; §0 ⚠ residual → 0 (or N if bugs found)"
```

---

## Task 8 (conditional): Sprint 5e follow-up spec stub

**Files:**
- Conditional create: `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md`

> Only execute this task if `output/tmp/sprint-5d-audit/p0p1-deviations.txt` is non-empty (Task 3.3 file).

- [ ] **Step 8.1: Check if Sprint 5e is needed**

```bash
[ -s output/tmp/sprint-5d-audit/p0p1-deviations.txt ] && echo "needed" || echo "skip"
```

If "skip", skip to Task 9.

If "needed", proceed:

- [ ] **Step 8.2: Write Sprint 5e spec stub**

Create `docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md`:

```markdown
# Sprint 5e — Follow-up: Sprint 5d audit deviations

**Date:** 2026-05-02
**Trigger:** Sprint 5d audit (`docs/sprint-5d-audit-report.md`, 2026-05-01) surfaced <N> P0/P1 deviations not previously logged in §2.3.
**Effort estimate:** TBD per deviation; rough scope ~<N>×0.5 day.

## 0. Goal

Fix the <N> P0/P1 deviations newly identified by Sprint 5d's deeper-than-§5.7 audit so master-plan §0 ⚠ residual returns to 0.

## 1. Deviations to fix

<For each P0/P1 deviation in p0p1-deviations.txt:>

### <CardId> — <dimension> — <severity>

- **BGA says:** ...
- **Ours says:** ...
- **Suggested fix:** ...
- **Evidence:** bga:... vs ours:...

<End loop>

## 2. Out of scope

- P2/P3 deviations from Sprint 5d audit (those go to §2.4 or §2.5 directly via Sprint 5d's docs sync)
- Anything outside the <N> P0/P1 list

## 3. Open question

Decide whether each fix is its own card-local change or shares infra. If 2+ deviations cluster on the same mechanism, combine into a single sub-task.

## 4. Definition of Done

- [ ] All <N> P0/P1 deviations fixed
- [ ] Tests added per fix (session-level)
- [ ] §2.3 each card moved to ✅
- [ ] master-plan §0 ⚠ residual back to 0

(Detailed plan via writing-plans skill once this spec is reviewed.)
```

Substitute placeholders from `output/tmp/sprint-5d-audit/p0p1-deviations.txt`.

- [ ] **Step 8.3: Commit Sprint 5e spec stub**

```bash
git add -f docs/superpowers/specs/2026-05-02-sprint-5e-followup-design.md
git commit -m "docs(spec): Sprint 5e follow-up spec stub for Sprint 5d audit deviations"
```

(Note `-f` because `docs/superpowers/` is gitignored per project convention.)

---

## Task 9: Push, open PR, wait for CI, merge

**Files:**
- Open: GitHub PR sprint-5d-deferred-audit → main

- [ ] **Step 9.1: Push branch**

```bash
git push -u origin sprint-5d-deferred-audit 2>&1 | tail -5
```

Expected: branch pushed.

- [ ] **Step 9.2: Capture HEAD SHA + open PR**

```bash
HEAD_SHA=$(git rev-parse HEAD)
echo "HEAD: $HEAD_SHA"
```

Then open PR via API. The PR body adapts to whether bugs were found:

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -sX POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d "$(cat <<'EOF'
{
  "title": "Sprint 5d: Deferred audit & cleanup (42 cards re-validated)",
  "head": "sprint-5d-deferred-audit",
  "base": "main",
  "body": "## Summary\n- Audit-only sprint, no card behavior code touched.\n- 4 parallel sub-agents re-validated 42 cards (B-deck 17 + E-deck 21 + 4 already-fixed verifies C23/A1/A22/A38) at ≥120s/card.\n- Manual spot-check on top-5 highest-LOC cards.\n- Sprint 5b/5c-claimed fixes confirmed in code.\n\n## Audit result\n<Filled by implementer from Task 5 report — paste verdict distribution + closure status here>\n\n## Docs\n- card_progress.md §2.0 changelog + §2.3 strikethroughs/✅ + §8 timeline\n- master-plan.md §0 ⚠ residual update + §8 progress row\n- docs/sprint-5d-audit-report.md (full per-card breakdown)\n\n## Spec / Plan\n- docs/superpowers/specs/2026-05-01-sprint-5d-deferred-audit-design.md\n- docs/superpowers/plans/2026-05-01-sprint-5d-deferred-audit.md\n\n## Test plan\n- [x] No code changes; no test runs needed\n- [ ] CI green (verify post-push)\n"
}
EOF
)" | jq '{number, html_url}'
```

Expected: PR number returned (e.g. 46).

After PR opens, manually edit the PR body to fill in the "Audit result" placeholder using values from `docs/sprint-5d-audit-report.md` Summary table, OR include them in the initial body string.

- [ ] **Step 9.3: Poll CI**

```bash
PR_NUM=<from step 9.2>
SHA=<HEAD_SHA from step 9.2>

curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq ".workflow_runs[] | select(.head_sha==\"$SHA\") | {name, status, conclusion}"
```

For an audit-only sprint with no test changes, CI should be quick (typically docs-only changes don't even kick a heavy CI run on this repo, but the standard CI workflow still runs).

Wait until status==`completed` and conclusion==`success`.

- [ ] **Step 9.4: Rebase merge**

```bash
curl -sX PUT -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/titanxxh/open-agricola/pulls/$PR_NUM/merge" \
  -d '{"merge_method":"rebase"}' | jq '{merged, sha}'
```

Expected: `{ "merged": true, "sha": "..." }`.

- [ ] **Step 9.5: Verify**

```bash
git fetch origin
git log --oneline origin/main -5
```

Expected: top commit is the master-plan / card_progress sync from Sprint 5d (or rebased equivalent).

---

## Self-review checklist

After implementing all tasks, run this self-review before declaring done:

1. **Spec coverage:** spec §2.1 (4 already-fixed verifies) → T1+T2 agent-2 + T6.3 strikethroughs; spec §2.2 (37-card superset) → T1-T4 agents 1/2/3/4 + spot-check; spec §3 method → T1+T2; spec §4 bug-handling policy → T8 conditional; spec §5 deliverables → T5+T6+T7+T8; spec §8 DoD → T9 PR/merge gates.
2. **No code changes:** `git diff origin/main..HEAD --name-only -- 'shared/**' 'server/**' 'src/**'` should print nothing.
3. **Audit report has no placeholders:** `grep -c "<.*>" docs/sprint-5d-audit-report.md` returns 0.
4. **§2.3 strikethrough applied to all 4 already-fixed entries:** grep `~~\*\*C23` and `~~\*\*A1` etc. in `card_progress.md`.
5. **§0 ⚠ count:** `grep "⚠ 残留" docs/master-plan.md` shows the new count (0 or N).
6. **Sprint 5e spec stub created iff bugs found:** check `output/tmp/sprint-5d-audit/p0p1-deviations.txt` size matches presence/absence of the spec file.
7. **CI green before merge:** per CLAUDE.md hard requirement.
