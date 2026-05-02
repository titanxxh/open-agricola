# Sprint 7 — §2.2 Simplification Audit & Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-validate `card_progress.md §2.2` 130 simplification cards against BGA at ≥120s/card depth via 10 parallel sub-agents (5 wide-scan + 5 deep), produce a per-card decision report, propagate verdicts to `§2.5` deliberate divergence (or spawn Sprint 7a fix sprint for surprise ⚠/❌), close `master-plan.md §0` Sprint 7 line.

**Architecture:** Two-phase audit. Phase 0 (~30 min) reconstructs the 90-name wide-scan list lost from `output/tmp/audit-agent-b{6..10}.md` by re-running compact ≤90s/card scan over each deck's full ~140-card range, filtered to 🟡 verdicts. Phase 1 (~1 hour) takes the merged 130-card list (40 deep-pool + ~90 reconstructed - 5d/5e/6d/6e overlaps), assigns ~20 cards to each of 5 sub-agents, gets ≥120s/card 5-dimension JSONL verdicts. Manual spot-check on top-5 LOC + 5 random ⚠. Then docs sync — the largest single task — registers each card's verdict into §2.5 / §2.0 / §2.2 / Sprint 7a as appropriate.

**Tech Stack:** Bash for orchestration, Agent tool (general-purpose subagent type) for audit, jq for JSONL aggregation. No code changes.

---

## File structure

| File | Role |
| ---- | ---- |
| `output/tmp/sprint-7-audit/inputs/wide-scan-agent-{A,B,C,D,E}.md` | NEW — Phase 0 input prompts. gitignored. |
| `output/tmp/sprint-7-audit/wide-scan-{A,B,C,D,E}.jsonl` | NEW — Phase 0 raw output, one line per card per deck. gitignored. |
| `output/tmp/sprint-7-audit/wide-scan-relist.jsonl` | NEW — concatenated Phase 0; filtered to 🟡 produces the 90-name list. gitignored. |
| `output/tmp/sprint-7-audit/deep-list.txt` | NEW — final list of cards to deep-audit (40 + 90 - overlaps). gitignored. |
| `output/tmp/sprint-7-audit/inputs/deep-agent-{1..5}.md` | NEW — Phase 1 input prompts (~20 cards each). gitignored. |
| `output/tmp/sprint-7-audit/deep-agent-{1..5}.jsonl` | NEW — Phase 1 per-agent output. gitignored. |
| `output/tmp/sprint-7-audit/merged.jsonl` | NEW — all Phase 1 verdicts merged. gitignored. |
| `output/tmp/sprint-7-audit/spotcheck-notes.md` | NEW — manual spot-check notes. gitignored. |
| `docs/sprint-7-audit-report.md` | NEW — committed; full per-card verdict + decision per card. |
| `docs/card_progress.md` | MODIFY — §2.0 Sprint 7 changelog, §2.2 rewrite, §2.5 bulk-append, §8 timeline. Major edit. |
| `docs/master-plan.md` | MODIFY — §0 Sprint 7 line "未启动" → "done", §8 progress row. |
| `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md` | CONDITIONAL NEW — only if audit finds ⚠/❌ cards. |

No code files touched.

---

## Pre-flight

- [ ] **Step 0.1: Confirm worktree baseline**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-7-decision
git rev-parse --abbrev-ref HEAD          # → sprint-7-decision
git status                                # → clean
git log --oneline -3                      # → spec commit on top of post-6e main
```

- [ ] **Step 0.2: Rebase on latest main (catch sprint-5e merge if it landed)**

```bash
git fetch origin
git rebase origin/main 2>&1 | tail -3
git log --oneline -3
```

If sprint-5e merged, the worktree picks up B163 / E72 / E91 / E161 fixes — the audit will then read post-5e code state. Either order works for this sprint.

- [ ] **Step 0.3: Verify BGA reference exists**

```bash
ls -d /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/{A,B,C,D,E} 2>&1 | wc -l  # → 5
```

- [ ] **Step 0.4: Make working directory**

```bash
mkdir -p output/tmp/sprint-7-audit/inputs
git check-ignore output/tmp/sprint-7-audit/inputs  # → confirms ignored
```

---

## Task 1: Build Phase 0 wide-scan input prompts (5 deck-wide agents)

**Files:**
- Create: `output/tmp/sprint-7-audit/inputs/wide-scan-agent-A.md` through `wide-scan-agent-E.md`

> Each deck's wide-scan agent gets a focused prompt: scan the deck's full card range, do compact ≤90s/card audit, emit JSONL with verdict. Goal: identify 🟡 simplification cards across all decks.

- [ ] **Step 1.1: Write `wide-scan-agent-A.md`**

Create `output/tmp/sprint-7-audit/inputs/wide-scan-agent-A.md`:

````markdown
# Phase 0 Agent — A-deck wide-scan re-list

You are a read-only Phase 0 audit agent for Sprint 7. Your job: scan all A-deck cards, do compact ≤90s/card audit, emit one structured JSONL verdict per card.

**Working directory:** `/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-7-decision`
**BGA reference root:** `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/A/`
**Our card root:** `shared/cards/A/`

**Scan range:** All `.ts` files in `shared/cards/A/` matching `A*.ts`. Skip `*.test.ts` and `index.ts`. Expected ~152 cards.

**Output:** Write one JSON line per card to `output/tmp/sprint-7-audit/wide-scan-A.jsonl`.

**Per-card method (compact, ~90s/card):**

For each card:

1. Locate BGA file: `ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/A/{cardId}_*.php`. If missing, emit verdict `🔍`.
2. Locate our file: `ls shared/cards/A/{cardId}_*.ts`.
3. Quick read both — focus on cost / desc / effect / listener / cardStates wiring.
4. Emit verdict per the rules below.

**Verdict rules:**
- `"✅"` — full alignment with BGA
- `"⚪"` — pure-data card (cost+desc only, no listeners/effect; trivially aligned if both sides match)
- `"🟡"` — simplified implementation (intentionally drops a corner case but core behavior aligned). **This is the verdict we are hunting for — it goes into the §2.2 list.**
- `"⚠"` — behavioral deviation (not a simplification, an actual bug)
- `"❌"` — wrong rule
- `"🔀"` — file exists in both sides but our card delegates differently
- `"🔍"` — could not finish; explain in notes

**Output JSON schema (one line per card):**

```json
{
  "cardId": "A123_FullName",
  "deck": "A",
  "verdict": "✅" | "⚪" | "🟡" | "⚠" | "❌" | "🔀" | "🔍",
  "oneline": "one-sentence summary of why",
  "simplificationReason": "if 🟡: what corner case is dropped; else empty"
}
```

**Constraints:**
- Read-only. Do NOT write to `shared/`, `server/`, or anywhere outside `output/tmp/sprint-7-audit/`.
- Compact mode: ~90s/card target. Don't over-read.
- Emit one line per card; the file should have ~152 lines after completion.

**Final output check:**

```bash
wc -l output/tmp/sprint-7-audit/wide-scan-A.jsonl   # → ~152
jq -c . output/tmp/sprint-7-audit/wide-scan-A.jsonl | head -3
jq -r '.verdict' output/tmp/sprint-7-audit/wide-scan-A.jsonl | sort | uniq -c
```

Report a 50-word summary: "scanned N A-deck cards, ✅ X / ⚪ X / 🟡 Y / ⚠ Z / ❌ W / 🔀 V / 🔍 U; 🟡 list: cardA1, cardA2, ..."
````

- [ ] **Step 1.2: Write `wide-scan-agent-B.md`**

Same template as Step 1.1 but substitute deck letter `B`, path `shared/cards/B/`, BGA path `Cards/B/`, output file `wide-scan-B.jsonl`. Expected ~150 B-deck cards.

- [ ] **Step 1.3: Write `wide-scan-agent-C.md`**

Same template, deck `C`, ~150 cards, output `wide-scan-C.jsonl`.

- [ ] **Step 1.4: Write `wide-scan-agent-D.md`**

Same template, deck `D`, ~152 cards, output `wide-scan-D.jsonl`.

- [ ] **Step 1.5: Write `wide-scan-agent-E.md`**

Same template, deck `E`, ~137 cards, output `wide-scan-E.jsonl`.

- [ ] **Step 1.6: Verify all 5 input prompts exist**

```bash
ls -la output/tmp/sprint-7-audit/inputs/
wc -l output/tmp/sprint-7-audit/inputs/wide-scan-agent-*.md
```

Each prompt should be 60-80 lines.

No commit needed — `output/tmp/` is gitignored.

---

## Task 2: Dispatch Phase 0 — 5 deck-wide agents in parallel

**Files:**
- Read: `output/tmp/sprint-7-audit/inputs/wide-scan-agent-{A,B,C,D,E}.md`
- Output: `output/tmp/sprint-7-audit/wide-scan-{A,B,C,D,E}.jsonl`

> Single message, 5 Agent tool blocks. Same pattern as sprint-5d Task 2.

- [ ] **Step 2.1: Read each input prompt to memory (sanity check)**

```bash
cat output/tmp/sprint-7-audit/inputs/wide-scan-agent-A.md | head -20
cat output/tmp/sprint-7-audit/inputs/wide-scan-agent-B.md | head -20
cat output/tmp/sprint-7-audit/inputs/wide-scan-agent-C.md | head -20
cat output/tmp/sprint-7-audit/inputs/wide-scan-agent-D.md | head -20
cat output/tmp/sprint-7-audit/inputs/wide-scan-agent-E.md | head -20
```

- [ ] **Step 2.2: Dispatch 5 agents in a single message**

In one assistant message, emit 5 Agent tool calls. Each:
- `subagent_type: "general-purpose"`
- `description: "Phase 0 wide-scan deck X"` (X = A/B/C/D/E)
- `prompt`: the corresponding input file's content, prefixed with: "Working directory: `/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-7-decision`. Read-only — write only to output/tmp/sprint-7-audit/."

DO NOT use `run_in_background: true` — wait for all 5 to return.

- [ ] **Step 2.3: Verify outputs exist**

```bash
ls -la output/tmp/sprint-7-audit/wide-scan-*.jsonl
wc -l output/tmp/sprint-7-audit/wide-scan-*.jsonl
```

Expected: 5 files, line counts roughly 152/150/150/152/137 (deck card counts).

- [ ] **Step 2.4: Validate JSONL syntax**

```bash
for f in output/tmp/sprint-7-audit/wide-scan-{A,B,C,D,E}.jsonl; do
  echo "=== $f ==="
  jq -c . "$f" 2>&1 | head -2 || echo "INVALID"
done
```

- [ ] **Step 2.5 (conditional): Re-dispatch on malformed JSONL or short file**

If any file is malformed or has <100 lines, re-dispatch only that single deck's agent with corrective preamble.

---

## Task 3: Phase 0 aggregate — extract 🟡 list

**Files:**
- Create: `output/tmp/sprint-7-audit/wide-scan-relist.jsonl` (gitignored)

- [ ] **Step 3.1: Concatenate all 5 deck files**

```bash
cat output/tmp/sprint-7-audit/wide-scan-{A,B,C,D,E}.jsonl > output/tmp/sprint-7-audit/wide-scan-merged.jsonl
wc -l output/tmp/sprint-7-audit/wide-scan-merged.jsonl    # → ~741 (sum of decks)
```

- [ ] **Step 3.2: Filter to 🟡 verdicts**

```bash
jq -c 'select(.verdict == "🟡")' output/tmp/sprint-7-audit/wide-scan-merged.jsonl > output/tmp/sprint-7-audit/wide-scan-relist.jsonl
wc -l output/tmp/sprint-7-audit/wide-scan-relist.jsonl
```

Expected: ~80-100 cards (originally 90; current count may differ as some have been fixed in flight).

- [ ] **Step 3.3: Print the relist summary**

```bash
echo "Wide-scan 🟡 cards by deck:"
jq -r '.deck' output/tmp/sprint-7-audit/wide-scan-relist.jsonl | sort | uniq -c
echo ""
echo "Cards:"
jq -r '.cardId' output/tmp/sprint-7-audit/wide-scan-relist.jsonl | sort
```

---

## Task 4: Build deep-audit list — merge with deep-pool 40 + dedupe overlaps

**Files:**
- Create: `output/tmp/sprint-7-audit/deep-list.txt` (gitignored)

- [ ] **Step 4.1: Hard-code the 40 deep-pool cards (per `card_desc_audit.md §4.6`)**

```bash
cat > output/tmp/sprint-7-audit/deep-pool-40.txt <<'EOF'
A132_Publican
A19_Handplow
B103_FieldMerchant
B128_Plumber
B151_LittlePeasant
B152_FurriersWorkshop
B26_AgrarianFences
B163_Pastor
B75_WoodWorkshop
C71_BlackTruffle
C117_TownCooperage
C120_BlanketChest
C135_HiredHand
C145_HouseweepLawn
C146_Witch
C70_StableExpert
C88_Coppicer
C89_PrivateForest
C164_TableCarpenter
D12_Beanthistle
D21_Underground
D36_BreedRegistry
D63_Rebel
D77_Forecaster
D82_DroughtScare
D87_Mansion
D128_Smithy
D134_OysterEater
D148_DomesticianExpert
E30_ChildsToy
E36_HerbalGarden
E49_Twibil
E66_Spinney
E72_ArtichokeField
E73_Scythe
E91_PlowBuilder
E112_GrainThief
E118_KindlingGatherer
E132_LargeFamily
E148_Lazybones
E161_ElderBaker
EOF
wc -l output/tmp/sprint-7-audit/deep-pool-40.txt   # → 40
```

> Note: `card_desc_audit.md §4.6` lists C as 9 cards with 10 entries (typo). The list above takes the literal 10 entries. Audit will catch the actual count.

- [ ] **Step 4.2: Extract wide-scan card IDs**

```bash
jq -r '.cardId' output/tmp/sprint-7-audit/wide-scan-relist.jsonl > output/tmp/sprint-7-audit/wide-scan-ids.txt
```

- [ ] **Step 4.3: Combine + dedupe**

```bash
cat output/tmp/sprint-7-audit/deep-pool-40.txt output/tmp/sprint-7-audit/wide-scan-ids.txt | sort -u > output/tmp/sprint-7-audit/all-candidates.txt
wc -l output/tmp/sprint-7-audit/all-candidates.txt
```

Expected: ~120-130 unique cards.

- [ ] **Step 4.4: Subtract overlaps with sprint-5d / 5e / 6d / 6e**

Cards already deep-audited or fixed in concurrent sprints — exclude from Sprint 7 deep audit:

```bash
cat > output/tmp/sprint-7-audit/already-handled.txt <<'EOF'
B103_FieldMerchant
B107_Manservant
B108_OvenFiringBoy
B111_Rustic
B128_Plumber
B134_HousebookMaster
B137_Wholesaler
B151_LittlePeasant
B156_StorehouseKeeper
B163_Pastor
B26_AgrarianFences
B3_Moonshine
B30_WoodPalisades
B68_Beanfield
B72_LoveforAgriculture
B75_WoodWorkshop
B82_ValueAssets
C23_JobContract
A1_Shelter
A22_Telegram
A38_WoolBlankets
E101_Blighter
E116_FirCutter
E118_KindlingGatherer
E12_AnimalBedding
E142_Smuggler
E144_WaresSalesman
E156_ClaypitOwner
E16_BriarHedge
E160_KelpGatherer
E161_ElderBaker
E165_MasterHuntsman
E30_ChildsToy
E36_HerbalGarden
E49_Twibil
E68_CherryOrchard
E69_MelonPatch
E70_CropRotationField
E72_ArtichokeField
E91_PlowBuilder
E95_Miller
E96_Elder
D131_CraftsmanshipPromoter
E58_LunchtimeBeer
E153_StoneSculptor
C62_CookeryExtension
EOF
wc -l output/tmp/sprint-7-audit/already-handled.txt   # → ~46 (5d superset + 6d/6e implementations)
```

- [ ] **Step 4.5: Compute final deep-audit list**

```bash
comm -23 \
  <(sort output/tmp/sprint-7-audit/all-candidates.txt) \
  <(sort output/tmp/sprint-7-audit/already-handled.txt) \
  > output/tmp/sprint-7-audit/deep-list.txt
wc -l output/tmp/sprint-7-audit/deep-list.txt
```

Expected: ~75-90 unique cards needing fresh deep audit. (Already-handled cards inherit verdicts from 5d / 5e / 6d / 6e.)

- [ ] **Step 4.6: Print the deep-list for review**

```bash
echo "Deep-audit list (~$(wc -l < output/tmp/sprint-7-audit/deep-list.txt) cards):"
cat output/tmp/sprint-7-audit/deep-list.txt
```

---

## Task 5: Build Phase 1 deep-audit input prompts (5 agents, ~20 cards each)

**Files:**
- Create: `output/tmp/sprint-7-audit/inputs/deep-agent-{1..5}.md`

- [ ] **Step 5.1: Split deep-list into 5 batches**

```bash
total=$(wc -l < output/tmp/sprint-7-audit/deep-list.txt)
batch=$(( (total + 4) / 5 ))
echo "total=$total batch=$batch"

split -l $batch -d --suffix-length=1 \
  output/tmp/sprint-7-audit/deep-list.txt \
  output/tmp/sprint-7-audit/deep-batch-

# Rename to 1..5 (split outputs 0..4)
for i in 0 1 2 3 4; do
  mv output/tmp/sprint-7-audit/deep-batch-$i output/tmp/sprint-7-audit/deep-batch-$((i+1)).txt 2>/dev/null
done
ls output/tmp/sprint-7-audit/deep-batch-*.txt
wc -l output/tmp/sprint-7-audit/deep-batch-*.txt
```

- [ ] **Step 5.2: Write `deep-agent-1.md`**

Create `output/tmp/sprint-7-audit/inputs/deep-agent-1.md`:

````markdown
# Phase 1 Deep-Audit Agent 1

You are a read-only audit sub-agent for Sprint 7 Phase 1. Your job: deep-audit cards listed in `output/tmp/sprint-7-audit/deep-batch-1.txt` against BGA at ≥120s/card, 5-dimension JSONL verdict.

**Working directory:** `/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-7-decision`

**Cards:** Read your batch list:

```bash
cat output/tmp/sprint-7-audit/deep-batch-1.txt
```

**Output:** Write one JSON line per card to `output/tmp/sprint-7-audit/deep-agent-1.jsonl`.

**Per-card method (≥120s/card):**

For each card in your batch:

1. Determine deck from cardId prefix: A* → `Cards/A/`, B* → `Cards/B/`, etc.
2. Locate BGA file: `ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/{deck}/{cardId}_*.php`. If missing, emit verdict `🔍`.
3. Locate our file: `ls shared/cards/{deck}/{cardId}_*.ts`.
4. If implementation is split (e.g. `*_impl.ts`, listener file elsewhere), follow imports.
5. Compare across 5 dimensions:
   - **D1: Cost / players / prerequisite** vs BGA `__construct` (`$this->cost`, `$this->players`, `$this->prerequisite`)
   - **D2: Desc** vs BGA `$this->desc[]` `clienttranslate(...)` strings
   - **D3: Effect / listener / action wiring** — BGA `on*` methods, `getEffects()`, `getExchanges()`, plus class inheritance chain. Ours: `effect.*`, `listeners[]`, `_impl` exports
   - **D4: Runtime cardStates / counters / globals** — BGA `Globals::*` writes vs our `cardStates[CARD_ID].*` writes
   - **D5: Edge cases** — BGA `$this->rulings`, special trigger guards, round/phase guards, expansion-flag carve-outs
6. Spend ≥120s per card (read both files fully; trace cross-references).
7. Append the verdict line to `output/tmp/sprint-7-audit/deep-agent-1.jsonl`.

**Output JSON schema (one line per card):**

```json
{
  "cardId": "...",
  "bgaPath": "...",
  "oursPath": "...",
  "verdict": "✅" | "🟡" | "⚠" | "❌" | "🔀" | "🔍",
  "dimensionsAligned": ["D1", "D2", "D3", "D4", "D5"],
  "deviations": [
    {
      "dimension": "D1" | "D2" | "D3" | "D4" | "D5",
      "bgaSays": "concrete quote / behavior",
      "oursSays": "concrete quote / behavior",
      "severity": "P0" | "P1" | "P2" | "P3",
      "suggestedFix": "short imperative",
      "evidence": "bga:... vs ours:..."
    }
  ],
  "simplificationReason": "if 🟡: what corner case is intentionally dropped",
  "notes": "any nuance"
}
```

**Verdict rules:**
- `"✅"` — full BGA alignment. Card was misclassified as simplification — should move from §2.2 to §2.0 changelog.
- `"🟡"` — simplification confirmed acceptable. Document the dropped corner case in `simplificationReason`. Will be moved to §2.5 deliberate divergence.
- `"⚠"` (P1+) — simplification has actual behavioral cost. Will be Sprint 7a fix candidate.
- `"❌"` (P0) — wrong rule. Sprint 7a fix.
- `"🔀"` — file exists in both sides, our card delegates to a generic action — verify the delegation is correct. If correct, treat as ✅ for §2.2 propagation purposes.
- `"🔍"` — could not finish; re-dispatch later.

**Constraints:**
- Read-only. Do NOT modify `shared/`, `server/`, `client/`. Write only to `output/tmp/sprint-7-audit/`.
- Do NOT fix bugs you find. Document them in JSONL `deviations`.
- Time budget per card: ≥120s.

**Final output check:**

```bash
expected=$(wc -l < output/tmp/sprint-7-audit/deep-batch-1.txt)
got=$(wc -l < output/tmp/sprint-7-audit/deep-agent-1.jsonl)
echo "expected=$expected got=$got"
jq -c . output/tmp/sprint-7-audit/deep-agent-1.jsonl | head -3
```

Expected and got should match.

Report a 60-word summary: "audited N cards, ✅ X / 🟡 Y / ⚠ Z / ❌ W / 🔀 V / 🔍 U; notable ⚠/❌: [list with 1-line per card]; expected-🟡-now-✅: [list of cards previously labeled simplification but now align]."
````

- [ ] **Step 5.3: Write `deep-agent-2.md` through `deep-agent-5.md`**

Same template as Step 5.2 but substitute the batch number (`deep-batch-2.txt` → `deep-agent-2.jsonl`, etc.). Each prompt is otherwise identical — paste the full template per file (don't abbreviate; agents read in isolation).

- [ ] **Step 5.4: Verify all 5 input files exist**

```bash
ls -la output/tmp/sprint-7-audit/inputs/deep-agent-*.md
wc -l output/tmp/sprint-7-audit/inputs/deep-agent-*.md
```

---

## Task 6: Dispatch Phase 1 — 5 deep-audit agents in parallel

**Files:**
- Read: `output/tmp/sprint-7-audit/inputs/deep-agent-{1..5}.md`
- Output: `output/tmp/sprint-7-audit/deep-agent-{1..5}.jsonl`

- [ ] **Step 6.1: Dispatch 5 agents in a single message**

Same pattern as Task 2: single message, 5 Agent tool calls. Each:
- `subagent_type: "general-purpose"`
- `description: "Sprint 7 deep audit batch X"`
- `prompt`: corresponding input file content + working-directory preamble.

Wait for all 5 to return. NOT background.

- [ ] **Step 6.2: Verify all 5 returned**

```bash
ls -la output/tmp/sprint-7-audit/deep-agent-*.jsonl
for i in 1 2 3 4 5; do
  expected=$(wc -l < output/tmp/sprint-7-audit/deep-batch-$i.txt)
  got=$(wc -l < output/tmp/sprint-7-audit/deep-agent-$i.jsonl)
  echo "Agent $i: expected=$expected got=$got"
done
```

- [ ] **Step 6.3: Validate JSONL syntax**

```bash
for f in output/tmp/sprint-7-audit/deep-agent-{1..5}.jsonl; do
  echo "=== $f ==="
  jq -c . "$f" 2>&1 | head -2 || echo "INVALID"
done
```

- [ ] **Step 6.4 (conditional): Re-dispatch on JSONL error or count mismatch**

Same as Task 2 — re-dispatch single failing agent with corrective preamble.

---

## Task 7: Aggregate Phase 1 + spot-check

**Files:**
- Create: `output/tmp/sprint-7-audit/merged.jsonl`
- Create: `output/tmp/sprint-7-audit/spotcheck-notes.md`

- [ ] **Step 7.1: Merge JSONL**

```bash
cat output/tmp/sprint-7-audit/deep-agent-{1..5}.jsonl > output/tmp/sprint-7-audit/merged.jsonl
wc -l output/tmp/sprint-7-audit/merged.jsonl
```

Expected: matches `deep-list.txt` line count.

- [ ] **Step 7.2: Compute verdict distribution**

```bash
echo "Verdict distribution:"
jq -r '.verdict' output/tmp/sprint-7-audit/merged.jsonl | sort | uniq -c

echo ""
echo "P0/P1 deviations:"
jq -c '.deviations[] | select(.severity == "P0" or .severity == "P1")' output/tmp/sprint-7-audit/merged.jsonl > output/tmp/sprint-7-audit/p0p1-deviations.txt
wc -l output/tmp/sprint-7-audit/p0p1-deviations.txt
```

The line count of `p0p1-deviations.txt` drives Task 10 (Sprint 7a stub conditional).

- [ ] **Step 7.3: Identify cards now ✅ (previously 🟡)**

```bash
jq -r 'select(.verdict == "✅") | .cardId' output/tmp/sprint-7-audit/merged.jsonl > output/tmp/sprint-7-audit/now-aligned.txt
wc -l output/tmp/sprint-7-audit/now-aligned.txt
echo "Cards previously simplified, now aligned (move §2.2 → §2.0):"
cat output/tmp/sprint-7-audit/now-aligned.txt
```

- [ ] **Step 7.4: Identify ⚠/❌ for spot-check**

```bash
jq -r 'select(.verdict == "⚠" or .verdict == "❌") | .cardId' output/tmp/sprint-7-audit/merged.jsonl > output/tmp/sprint-7-audit/warn-list.txt
wc -l output/tmp/sprint-7-audit/warn-list.txt
```

If line count is 0, only the top-5 LOC spot-check is needed (Step 7.6). If >0, Step 7.5 covers them.

- [ ] **Step 7.5: Spot-check ⚠/❌ cards (up to 5)**

For each (up to 5) ⚠/❌ card from `warn-list.txt`, manually read:

1. The BGA file: `cat /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/{deck}/{cardId}_*.php`
2. Our file: `cat shared/cards/{deck}/{cardId}_*.ts`
3. Verify the deviation in agent's JSONL is real.

Append findings to `output/tmp/sprint-7-audit/spotcheck-notes.md`:

```markdown
## Spot-check: <CardId>
- **Agent verdict:** ⚠ / ❌
- **My verdict:** ⚠ / ❌ / ✅ / 🟡
- **Match?** Yes / No — [details]
```

- [ ] **Step 7.6: Spot-check top-5 LOC ✅/🟡 cards**

```bash
jq -r '.cardId' output/tmp/sprint-7-audit/merged.jsonl | while read cardId; do
  base="${cardId%%_*}"
  bga_file=$(ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/{A,B,C,D,E}/${base}_*.php 2>/dev/null | head -1)
  [ -z "$bga_file" ] && continue
  loc=$(wc -l < "$bga_file")
  echo "$loc $cardId $bga_file"
done | sort -rn | head -5
```

For each of these top-5, do a quick manual skim (~5 min each) and append to `spotcheck-notes.md`.

- [ ] **Step 7.7: Decide expansion if mismatches found**

Same protocol as sprint-5d Task 7.3:
- 0 mismatch → proceed to Task 8.
- 1 mismatch in same agent → re-audit that agent's full batch with elevated time budget (≥240s).
- Multiple agents mismatching → systematic issue, escalate to user.

---

## Task 8: Write `docs/sprint-7-audit-report.md`

**Files:**
- Create: `docs/sprint-7-audit-report.md` (committed)

- [ ] **Step 8.1: Write the report**

Create `docs/sprint-7-audit-report.md` with the following structure. Fill all `<...>` placeholders from `merged.jsonl`, `now-aligned.txt`, `warn-list.txt`, and `spotcheck-notes.md`:

```markdown
# Sprint 7 Audit Report — §2.2 Simplification Re-Validation

**Date:** 2026-05-02
**Scope:** ~<N> cards from `card_progress.md §2.2` (40 deep-pool + ~<M> wide-scan-reconstructed - <K> overlaps with sprint-5d/5e/6d/6e).
**Method:** Phase 0 (5 deck-wide sub-agents, ≤90s/card, name reconstruction) → Phase 1 (5 deep-audit sub-agents, ≥120s/card, 5-dimension JSONL) → manual spot-check on top-5 LOC + up to 5 ⚠/❌.

## Summary

| Metric | Count |
| ------ | ----- |
| Total cards audited (deep) | <N> |
| ✅ now aligned (move §2.2 → §2.0) | <N> |
| 🟡 simplification confirmed (move §2.2 → §2.5) | <N> |
| ⚠ deviation (P1, → Sprint 7a) | <N> |
| ❌ deviation (P0, → Sprint 7a) | <N> |
| 🔀 reframed | <N> |
| 🔍 could-not-finish | <N> |

<If 0 ⚠/❌:>
**Outcome:** Sprint 7 closes the §2.2 simplification queue. All cards classified. master-plan §0 Sprint 7 line: "未启动" → "done: classification complete; 0 follow-up needed".

<If >0 ⚠/❌:>
**Outcome:** Sprint 7 closes the bulk of §2.2 (N cards registered §2.5, M cards back to §2.0). <K> ⚠/❌ cards spawn Sprint 7a follow-up at `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md`.

## Verdict per agent

| Agent | Cards | ✅ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
| ----- | ----- | -- | -- | -- | -- | -- | -- |
| 1 | <N> | <N> | <N> | <N> | <N> | <N> | <N> |
| 2 | <N> | ... |
| 3 | <N> | ... |
| 4 | <N> | ... |
| 5 | <N> | ... |
| **Total** | <N> | <N> | <N> | <N> | <N> | <N> | <N> |

## Cards now aligned (✅, previously misclassified as simplification)

<List each ✅ cardId with one-line note about what aligned. These move to §2.0 changelog.>

### <CardId> — D<n> aligned

- BGA: ...
- Ours: ...
- Note: previously labeled simplification; this audit confirms full alignment.

## Confirmed simplifications (🟡, → §2.5)

<List by deck, one section per deck. For each card, record `simplificationReason` from JSONL. These bulk-move to §2.5.>

### A-deck

<list with cardId + 1-line simplification reason>

### B-deck

<list>

### C-deck

<list>

### D-deck

<list>

### E-deck

<list>

## Surprise deviations (⚠/❌, → Sprint 7a)

<If empty, write: "None — all simplifications were acceptable.">

<Else, one entry per ⚠/❌ card:>

### <CardId> — <D1/D2/.../D5> — <P0/P1>

- BGA: ...
- Ours: ...
- Suggested fix: ...
- Severity: ...
- Evidence: ...

## Manual spot-check

| Card | Reviewed | Agent verdict | Spot-check verdict | Match? |
| ---- | -------- | ------------- | ------------------ | ------ |
| ... |

<If 0 mismatches: "All spot-checks confirm agent verdicts. Spot-check passed.">

## Closure

<If 0 ⚠/❌:>
**Sprint 7 done.** §2.2 queue empty (all 130 cards classified). master-plan §0 reads ⚠=0/❌=0/Sprint 7 done; only i18n gap remains.

<If >0:>
**Sprint 7 partial.** Bulk classified; <N> ⚠/❌ in Sprint 7a. master-plan §0 ⚠ residual: <count> (sprint-7a backlog).

## Per-card detail (full JSONL)

The full <N>-line JSONL is intermediate (`output/tmp/sprint-7-audit/merged.jsonl`, gitignored). For ⚠/❌ cards, the full deviation record is reproduced in the "Surprise deviations" section above. For ✅/🟡 cards, the simplification reason is captured in the per-deck lists.
```

Replace all `<...>` placeholders with concrete values. Don't commit with placeholders.

- [ ] **Step 8.2: Sanity check**

```bash
grep -c "<.*>" docs/sprint-7-audit-report.md
```

Expected: 0.

- [ ] **Step 8.3: Commit**

```bash
git add docs/sprint-7-audit-report.md
git commit -m "docs: Sprint 7 audit report (~N cards re-validated, decisions per card)"
```

Substitute `~N` with the actual count.

---

## Task 9: Docs sync (largest task, ~3-4 hours)

**Files:**
- Modify: `docs/card_progress.md` (§2.0, §2.2, §2.5, §8)
- Modify: `docs/master-plan.md` (§0, §8)

> This is the bulk work. ~130 cards to register across §2.5. Use the audit report as the source — every card on the report goes somewhere.

- [ ] **Step 9.1: Append §2.0 changelog entry**

Add to `card_progress.md` §2.0 (after the most recent entry):

```markdown
- **2026-05-02 Sprint 7 — §2.2 simplification re-validation audit (audit-only)**:
  - 5 Phase-0 sub-agents reconstructed the wide-scan 90-name list (lost from `audit-agent-b{6..10}.md`); 5 Phase-1 sub-agents deep-audited <N> cards at ≥120s/card per `card_desc_audit.md §5.7` method. Manual spot-check on top-5 LOC + <M> ⚠/❌ candidates.
  - **Verdict distribution:** ✅ <N> / 🟡 <N> / ⚠ <N> / ❌ <N> / 🔀 <N> / 🔍 <N>.
  - **Result:** §2.2 queue closed. <N> cards moved to §2.5 (deliberate divergence with documented reason); <K> cards moved to §2.0 (previously misclassified, now confirmed aligned); <J> cards spawn Sprint 7a fix backlog [if any].
  - **master-plan §0 update:** "Sprint 7 P3 130 张简化未启动" → "Sprint 7 audit done: classification complete". <If 0 ⚠/❌: ⚠ residual unchanged at 0.> <Else: ⚠ residual `0 → J`.>
  - Audit report: `docs/sprint-7-audit-report.md`. spec / plan: `docs/superpowers/specs/2026-05-02-sprint-7-audit-design.md` / `docs/superpowers/plans/2026-05-02-sprint-7-audit.md`.
```

- [ ] **Step 9.2: Rewrite §2.2 — replace summary with explicit list**

Locate `card_progress.md §2.2` heading. Replace the loose "130 张" summary block with a concrete list. Use this template:

```markdown
### 2.2 🟡 简化实现 (post Sprint 7 audit: <N> 张, all classified)

> 2026-05-02 Sprint 7 audit re-validated all §2.2 simplification candidates. The list below is the audit-confirmed simplification set (verdict 🟡), moved from "needs review" to "documented deliberate divergence in §2.5".
>
> Cards previously listed here that turned out to be ✅ (audit found them aligned) moved to §2.0 changelog. Cards that turned out to be ⚠/❌ moved to Sprint 7a backlog.

**Deck-by-deck list of confirmed simplifications (verdict 🟡, see §2.5 for per-card reason):**

- A-deck (<N>): <list>
- B-deck (<N>): <list>
- C-deck (<N>): <list>
- D-deck (<N>): <list>
- E-deck (<N>): <list>

**Total:** <N> cards (down from 130).

> Per-card simplification reason is in §2.5. This section is a roll-up; §2.5 holds the detail.
```

The lists are extracted from `output/tmp/sprint-7-audit/merged.jsonl` filtered to 🟡 verdicts.

- [ ] **Step 9.3: Bulk-append §2.5 entries**

Locate `card_progress.md §2.5` (deliberate divergence section). After the existing entries, append a new subsection:

```markdown
### 2026-05-02 Sprint 7 audit-classified simplifications

The cards below were audited per Sprint 7 (`docs/sprint-7-audit-report.md`) and confirmed as acceptable simplifications. Each row records what corner case was intentionally dropped.

| Card | Simplification | Why acceptable |
| ---- | -------------- | -------------- |
| <CardId> | <one-line: what is dropped> | <one-line: why P3> |
| ... | ... | ... |
```

Generate the table from `merged.jsonl`:

```bash
jq -r 'select(.verdict == "🟡") | "| \(.cardId) | \(.simplificationReason // .notes // "TBD") | <reason> |"' output/tmp/sprint-7-audit/merged.jsonl
```

For each row, fill the third column manually (or with a default like "P3 acceptable per Sprint 7 audit"). Order rows by deck (A→E) for readability.

- [ ] **Step 9.4: Append §8 timeline row**

Append to `card_progress.md` §8 timeline:

```
| Sprint 7 (§2.2 simplification audit, ~N cards re-validated; <K> moved to §2.0, <M> to §2.5, <J> to 7a) | 05-02 | 0 | <unchanged> | <unchanged %> |
```

(Card count unchanged — audit-only. Use latest count from previous timeline row.)

- [ ] **Step 9.5: Update `master-plan.md` §0**

Find the "Sprint 7" line in the `§0` sprint list:

```
Sprint 7   not started     130 张 P3 简化（master plan §0 默认不做）
```

Replace with:

```
Sprint 7   done             §2.2 simplification audit done: <N> classified to §2.5, <K> to §2.0, <J> to Sprint 7a
```

Update the residual list directly below:

```
- ⚠ 残留：<count> 张 P1 行为偏差（<...explanation...>）
- ❌ 残留：0 张 stub 未实现
- i18n 缺口 437 BGA `clienttranslate` 未补
- ~~Sprint 7 P3 130 张简化未启动~~ — ✅ Sprint 7 audit 2026-05-02 done
```

If Sprint 5e merged before Sprint 7 (the expected order), ⚠ residual was 0 → updated to 0 (no change) or to 7a count.

- [ ] **Step 9.6: Append `master-plan.md` §8 row**

Append to §8 progress table:

```
| 7      | §2.2 simplification audit + classification (130 cards re-validated) | 0 cards (audit-only) + N classifications | 2-3 day | ~<actual> | done（Phase 0 5 deck-wide sub-agents reconstruct lost wide-scan list; Phase 1 5 deep-audit sub-agents at ≥120s/card; spot-check on top-5 LOC + N ⚠/❌. Result: ✅ <N> moved to §2.0 / 🟡 <N> moved to §2.5 / ⚠ <N> spawn Sprint 7a / ❌ <N>. master-plan §0 "Sprint 7 未启动" → "done: classification complete". Audit report: `docs/sprint-7-audit-report.md`.） | docs/superpowers/specs/2026-05-02-sprint-7-audit-design.md | docs/superpowers/plans/2026-05-02-sprint-7-audit.md | sprint-7-decision |
```

- [ ] **Step 9.7: Sanity check**

```bash
grep -c "<.*>" docs/card_progress.md docs/master-plan.md | grep -v ":0"
```

Expected: empty output (no remaining placeholders in modified files). If not, find and fill them.

- [ ] **Step 9.8: Commit**

```bash
git add docs/card_progress.md docs/master-plan.md
git commit -m "docs: Sprint 7 §2.2 audit propagates verdicts to §2.0/§2.5; closes master-plan §0 Sprint 7 line"
```

---

## Task 10 (conditional): Sprint 7a follow-up spec stub

**Files:**
- Conditional create: `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md`

> Only execute if `output/tmp/sprint-7-audit/p0p1-deviations.txt` is non-empty.

- [ ] **Step 10.1: Check if Sprint 7a is needed**

```bash
[ -s output/tmp/sprint-7-audit/p0p1-deviations.txt ] && echo "needed" || echo "skip"
```

If "skip", proceed to Task 11.

- [ ] **Step 10.2: Write Sprint 7a spec stub**

Create `docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md`:

```markdown
# Sprint 7a — Follow-up: Sprint 7 audit deviations

**Date:** 2026-05-03
**Trigger:** Sprint 7 audit (`docs/sprint-7-audit-report.md`, 2026-05-02) surfaced <N> P0/P1 deviations not previously logged in §2.3.
**Effort estimate:** ~<N>×0.5 day rough scope.

## 0. Goal

Fix the <N> P0/P1 deviations newly identified by Sprint 7's deeper-than-wide-scan audit.

## 1. Deviations to fix

<For each P0/P1 deviation in p0p1-deviations.txt:>

### <CardId> — <dimension> — <severity>

- **BGA says:** ...
- **Ours says:** ...
- **Suggested fix:** ...
- **Evidence:** bga:... vs ours:...

## 2. Out of scope

Anything outside the <N> P0/P1 list.

## 3. Definition of Done

- [ ] All <N> deviations fixed
- [ ] Tests added per fix
- [ ] §2.5 entries promoted from "deliberate" to "✅ fixed Sprint 7a"
- [ ] master-plan §0 ⚠ residual back to 0

(Detailed plan via writing-plans skill once this spec is reviewed.)
```

Substitute placeholders from `p0p1-deviations.txt`.

- [ ] **Step 10.3: Commit Sprint 7a spec stub**

```bash
git add -f docs/superpowers/specs/2026-05-03-sprint-7a-followup-design.md
git commit -m "docs(spec): Sprint 7a follow-up spec stub for Sprint 7 audit deviations"
```

---

## Task 11: Local CI + push + open PR + rebase merge

**Files:**
- Open: GitHub PR sprint-7-decision → main

> User preference (from sprint-5d execution): **don't wait GitHub CI**. Local fast + lint + build → push → rebase merge immediately. (Audit-only sprint has no code changes — local CI just confirms nothing accidentally regressed.)

- [ ] **Step 11.1: Rebase on latest main**

```bash
git fetch origin
git rebase origin/main 2>&1 | tail -5
```

If sprint-5e or other PRs landed during this audit, rebase picks them up.

- [ ] **Step 11.2: Local fast tests**

```bash
pnpm test:fast 2>&1 | tail -5
```

Expected: all green. Audit-only changes nothing — count should equal whatever's on main (1919-1934 depending on what's merged).

- [ ] **Step 11.3: Local lint**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: 0 errors (warnings count varies, that's fine).

- [ ] **Step 11.4: Local build**

```bash
pnpm run build 2>&1 | tail -5
```

Expected: ✓ built successfully.

- [ ] **Step 11.5: Push branch**

```bash
git push -u origin sprint-7-decision 2>&1 | tail -5
```

If first push, no force needed. If rebase happened above, may need `--force-with-lease`.

- [ ] **Step 11.6: Open PR**

```bash
HEAD_SHA=$(git rev-parse HEAD)
echo "HEAD: $HEAD_SHA"

export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -sX POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d "$(cat <<'EOF'
{
  "title": "Sprint 7: §2.2 simplification audit & decision (~130 cards re-validated)",
  "head": "sprint-7-decision",
  "base": "main",
  "body": "## Summary\n- Audit-only sprint, no code changes.\n- Phase 0: 5 deck-wide sub-agents reconstructed the wide-scan 90-name list lost from `audit-agent-b{6..10}.md`.\n- Phase 1: 5 deep-audit sub-agents at ≥120s/card validated all §2.2 simplification candidates.\n- Manual spot-check on top-5 LOC + ⚠/❌ deviations.\n\n## Audit result\n- **Verdict distribution:** <FILL FROM REPORT>\n- **Outcome:** §2.2 queue closed; cards distributed to §2.0 (now-aligned) / §2.5 (acceptable simplification) / Sprint 7a (P0/P1 surprises) per report.\n\n## Docs\n- `docs/sprint-7-audit-report.md` — full per-card breakdown\n- `docs/card_progress.md` §2.0 / §2.2 / §2.5 / §8 synced\n- `docs/master-plan.md` §0 Sprint 7 line + §8 row\n\n## Spec / Plan\n- `docs/superpowers/specs/2026-05-02-sprint-7-audit-design.md`\n- `docs/superpowers/plans/2026-05-02-sprint-7-audit.md`\n\n## Test plan\n- [x] No code changes; local fast/lint/build all green\n- [x] Per user preference, don't wait GitHub CI — rebase merge immediately after local CI passes\n"
}
EOF
)" | jq '{number, html_url}'
```

Edit the body to fill in actual verdict counts before opening — or open with placeholder and edit immediately after.

Capture PR number from response.

- [ ] **Step 11.7: Rebase merge (don't wait GitHub CI)**

```bash
PR_NUM=<from previous step>
curl -sX PUT -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/titanxxh/open-agricola/pulls/$PR_NUM/merge" \
  -d '{"merge_method":"rebase"}' | jq '{merged, sha}'
```

Expected: `{ "merged": true, "sha": "..." }`.

- [ ] **Step 11.8: Verify main and clean up worktree**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola
git fetch origin
git pull --ff-only
git log --oneline -5

# After confirming merge, clean up local artifacts:
git worktree remove .worktree/sprint-7-decision
git branch -D sprint-7-decision
git push origin --delete sprint-7-decision
```

---

## Self-review checklist

After all tasks complete, verify before declaring done:

1. **Spec coverage:** spec §2.1 (40 deep-pool) → Tasks 4-7; spec §2.2 (90 wide-scan reconstruction) → Tasks 1-3; spec §2.3 (overlap exclusion) → Task 4; spec §3 method → Tasks 1, 2, 5, 6, 7; spec §4 decision matrix → Task 8 report + Task 9 docs sync; spec §5 deliverables → all tasks; spec §8 DoD → Task 11 PR/merge gate.
2. **No code changes:** `git diff origin/main..HEAD --name-only -- 'shared/**' 'server/**' 'src/**'` should print nothing.
3. **Audit report has no placeholders:** `grep -c "<.*>" docs/sprint-7-audit-report.md` returns 0.
4. **§2.2 rewritten:** old "130 张" summary replaced with explicit per-deck enumeration.
5. **§2.5 bulk-appended:** has a "2026-05-02 Sprint 7 audit-classified simplifications" subsection with per-card row.
6. **§0 Sprint 7 line:** changed from "未启动" to "done".
7. **Sprint 7a spec stub created iff bugs found:** `output/tmp/sprint-7-audit/p0p1-deviations.txt` size matches presence/absence of the spec file.
8. **Local CI green before merge:** per user preference (sprint-5d execution).
