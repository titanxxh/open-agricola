# Sprint S7-前: Shape-Mismatch Skip Codemod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 29 shape-mismatch skips listed in `docs/skip-tracker.md` by mechanically updating test assertions from the pre-S1 `'choice'` discriminator to the current `'request' + request.kind === 'choice'` shape.

**Architecture:** Pure test refactor; zero production code changes. Each test file's skips get unskipped, the assertions on `result.type === 'choice'` / `result.options` are rewritten to narrow on `result.type === 'request'` then `result.request.kind === 'choice'` then `result.request.options`. After all 17 files land, move the 29 entries in `docs/skip-tracker.md` from "Active skips" to "Resolved skips".

**Tech Stack:** TypeScript, Vitest (`pnpm test:fast`), ESLint (`pnpm run lint`).

**Spec:** `docs/skip-tracker.md` (lines 27–58 contain the 29 shape-mismatch skips, plus 1 `private-field-access` skip on E70 that is OUT OF SCOPE for this PR).

**Setup:** Worktree `.worktree/sprint-S7-shape` on branch `sprint-S7-shape-codemod` (already created from `main`).

---

## Shape Codemod Pattern

Production return shape (already in code, e.g. `shared/actions/payment/internal/payment-choice-result.ts:82`):

```typescript
return {
  type: 'request',
  request: { kind: 'choice', options },
  promptKey: 'prompt.selectPayment',
}
```

Old (skipped) test pattern:

```typescript
expect(result.type).toBe('choice')
if (result.type !== 'choice') return
expect(result.options[0]?.labelKey).toBe('...')
```

New (post-codemod) test pattern:

```typescript
expect(result.type).toBe('request')
if (result.type !== 'request') return
expect(result.request.kind).toBe('choice')
if (result.request.kind !== 'choice') return
expect(result.request.options[0]?.labelKey).toBe('...')
```

For `EngineStepResult` (engine-side) shapes, the pattern is similar:

```typescript
// Old
if (step.type !== 'choice') throw new Error(...)
expect(step.choice.options).toContain(...)

// New
if (step.type !== 'request') throw new Error(...)
if (step.request.kind !== 'choice') throw new Error(...)
expect(step.request.options).toContain(...)
```

For `EngineStepResult` from session takeAction returns where the test asserted `pending.type === 'choice'`:

```typescript
// Old
expect(resp.pending.type).toBe('choice')
expect(resp.pending.options).toContain(...)

// New
expect(resp.interaction.stateId).toBe('wait')
if (resp.interaction.stateId !== 'wait') throw ...
expect(resp.interaction.request.kind).toBe('choice')
if (resp.interaction.request.kind !== 'choice') throw ...
expect(resp.interaction.options).toContain(...)
// (note: SessionResponse.interaction.options for wait state is a flattened convenience array)
```

When updating, **read the actual production code path** to confirm the shape — some sites may use `farm-select` or `selection` kinds rather than `choice`.

---

## File Structure

| File | Skipped tests | Notes |
|------|-------------:|-------|
| `shared/actions/effects/__tests__/pay.test.ts` | 5 | `buildPaymentChoiceResult` returns `{type:'request', request:{kind:'choice', options}}` |
| `shared/actions/effects/__tests__/selection.test.ts` | 2 | `selectionAction.execute` returns `{type:'request', request:{kind:'selection',...}}` (note: kind is `'selection'`, not `'choice'`) |
| `shared/actions/effects/__tests__/stables-resolveChoice.test.ts` | 1 | shape mismatch on first call result |
| `shared/actions/effects/__tests__/fence-resolveChoice.test.ts` | 1 | same |
| `shared/actions/effects/__tests__/exchange-effect-preview.test.ts` | 1 | same |
| `shared/cards/__stubs__/__tests__/hook-coverage-matrix.test.ts` | 1 | `EngineStepResult` choice→request mismatch |
| `shared/cards/__tests__/sourceCard-card-production.test.ts` | 3 | direct-choice path now `'request'` |
| `shared/cards/__tests__/D50_ForeignAid.test.ts` | 1 | `computeArgs` hook narrowing |
| `shared/cards/__tests__/A97_Freshman.test.ts` | 1 | play-occupation flow |
| `shared/cards/__tests__/D51_E10_cards.test.ts` | 2 | `move-farmer-to-space` execute returns `'request'` |
| `shared/cards/__tests__/priority-plan-implementation.test.ts` | 1 | C60 oven choice |
| `server/__tests__/farm-choice.test.ts` | 1 | farm payment choice |
| `server/__tests__/B104_SheepWalker-session.test.ts` | 1 | last-harvest animalReorg |
| `server/__tests__/B146_Illusionist-session.test.ts` | 1 | discard-from-hand action shape |
| `server/__tests__/C104_Collector-multiselect-session.test.ts` | 3 | multi-select session |
| `server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts` | 3 | multi-select pairs |
| `server/__tests__/D131_CraftsmanshipPromoter-session.test.ts` | 1 | bottom-row major filter |

**Total: 17 files / 29 skips**

---

## Execution Strategy

For each file:
1. Read the file, identify all `it.skip(...)` blocks tagged `// SKIP[S1]: 'choice'→'request' codemod pending`.
2. Replace the SKIP comment with no comment (or with `// S7-前: shape codemod applied 2026-05-08` if helpful for grep).
3. Change `it.skip(...)` → `it(...)`.
4. Read the matching production source to confirm the actual shape returned. Apply the codemod pattern above.
5. Run `pnpm exec vitest run <file>`. Verify all tests pass (unskipped tests now PASS, no regressions).
6. Commit: `test(s7-shape): unskip <test-area> <N> shape-mismatch tests (file <N>/17)`.

After all 17 files committed:
- Move 29 entries from `docs/skip-tracker.md` "Active skips" → "Resolved skips" with note `Resolved in: Sprint S7-shape-codemod 2026-05-08`.
- Run `pnpm test:fast` full suite — confirm no regressions, expected 2280 pass (2251 + 29).
- Run `pnpm run lint` (0 errors), `pnpm exec tsc -p tsconfig.app.json --noEmit`, `pnpm run build`.
- Final commit: `docs(skip-tracker): move 29 shape-mismatch entries to Resolved (S7 codemod complete)`.
- Fast-forward main + push.

---

## Tasks (per file)

### Task 1: pay.test.ts (5 skips)

**File:** `shared/actions/effects/__tests__/pay.test.ts`

- [ ] Step 1: Read file; locate 5 `it.skip` blocks tagged `// SKIP[S1]`.
- [ ] Step 2: Read `shared/actions/payment/internal/payment-choice-result.ts:70-87` to confirm `buildPaymentChoiceResult` returns `{type:'request', request:{kind:'choice', options}, promptKey}`.
- [ ] Step 3: Apply codemod to each `it.skip` block: unskip + narrow on `result.type === 'request'` then `result.request.kind === 'choice'`, replace `result.options` with `result.request.options`.
- [ ] Step 4: `pnpm exec vitest run shared/actions/effects/__tests__/pay.test.ts --reporter=verbose 2>&1 | tail -30` — verify all tests pass.
- [ ] Step 5: Commit: `test(s7-shape): unskip pay.test.ts 5 shape-mismatch tests (file 1/17)`.

### Task 2: selection.test.ts (2 skips)

**File:** `shared/actions/effects/__tests__/selection.test.ts`

- [ ] Step 1: Read file; locate 2 `it.skip` blocks.
- [ ] Step 2: Read selection action production source; the kind is `'selection'`, not `'choice'`. Confirm.
- [ ] Step 3: Apply codemod with `request.kind === 'selection'`. Update assertion paths accordingly.
- [ ] Step 4: Verify with vitest.
- [ ] Step 5: Commit: `test(s7-shape): unskip selection.test.ts 2 shape-mismatch tests (file 2/17)`.

### Task 3: stables-resolveChoice.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod, verify, commit (file 3/17).

### Task 4: fence-resolveChoice.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod, verify, commit (file 4/17).

### Task 5: exchange-effect-preview.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod, verify, commit (file 5/17).

### Task 6: hook-coverage-matrix.test.ts (1 skip)

**File:** `shared/cards/__stubs__/__tests__/hook-coverage-matrix.test.ts`

- [ ] Step 1-5: Read, codemod (note: `EngineStepResult` shape, not `ActionExecutionResult`), verify, commit (file 6/17).

### Task 7: sourceCard-card-production.test.ts (3 skips)

**File:** `shared/cards/__tests__/sourceCard-card-production.test.ts`

- [ ] Step 1-5: Read, codemod, verify, commit (file 7/17).

### Task 8: D50_ForeignAid.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod (computeArgs hook narrowing), verify, commit (file 8/17).

### Task 9: A97_Freshman.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod, verify, commit (file 9/17).

### Task 10: D51_E10_cards.test.ts (2 skips)

- [ ] Step 1-5: Read, codemod (move-farmer-to-space execute returns `'request'`), verify, commit (file 10/17).

### Task 11: priority-plan-implementation.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod (C60 Small Potter's Oven choice), verify, commit (file 11/17).

### Task 12: farm-choice.test.ts (1 skip)

**File:** `server/__tests__/farm-choice.test.ts`

- [ ] Step 1-5: Read, codemod (farm payment choice), verify, commit (file 12/17).

### Task 13: B104_SheepWalker-session.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod (last-harvest animalReorg), verify, commit (file 13/17). **Note: this file may live in slow project — verify via vitest project glob.**

### Task 14: B146_Illusionist-session.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod, verify, commit (file 14/17). Same slow-project caveat.

### Task 15: C104_Collector-multiselect-session.test.ts (3 skips)

- [ ] Step 1-5: Read, codemod, verify, commit (file 15/17). Same slow-project caveat.

### Task 16: C146_WorkshopAssistant-multiselect-session.test.ts (3 skips)

- [ ] Step 1-5: Read, codemod, verify, commit (file 16/17). Same slow-project caveat.

### Task 17: D131_CraftsmanshipPromoter-session.test.ts (1 skip)

- [ ] Step 1-5: Read, codemod (minor-improvement choice options narrowing), verify, commit (file 17/17). Same slow-project caveat.

---

## Closeout

### Task 18: Update skip-tracker.md

- [ ] Step 1: Move 29 shape-mismatch entries from "Active skips" table → "Resolved skips" table. Append `| Resolved in: Sprint S7-shape-codemod 2026-05-08 | bulk codemod` to each.
- [ ] Step 2: Verify only 1 active skip remains (E70_CropRotationField, `private-field-access`, S2 category).
- [ ] Step 3: Commit: `docs(skip-tracker): move 29 shape-mismatch entries to Resolved (S7 codemod complete)`.

### Task 19: Full local CI

- [ ] Step 1: `pnpm run lint 2>&1 | tail -3` — 0 errors.
- [ ] Step 2: `pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10` — 0 errors.
- [ ] Step 3: `pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -10` — 0 errors.
- [ ] Step 4: `pnpm test:fast 2>&1 | tail -5` — expect ~2280 pass / 0 fail / ~6 skipped (29 fewer than 35 skipped baseline).
- [ ] Step 5: `pnpm run build 2>&1 | tail -5` — success.
- [ ] Step 6: `pnpm run check:bundle-size` — OK.

### Task 20: Push

- [ ] Step 1: `git checkout main && git merge --ff-only sprint-S7-shape-codemod`.
- [ ] Step 2: `git push origin main`.
- [ ] Step 3: Wait for GitHub Actions all green.

---

## DoD

- [ ] D1: All 29 shape-mismatch skips unskipped and passing.
- [ ] D2: `docs/skip-tracker.md` Active skips reduced from 30 → 1 (E70 only).
- [ ] D3: `pnpm test:fast` fully green; total pass count rose by ~29.
- [ ] D4: lint / tsc / build all green.
- [ ] D5: Zero production code changes (test-only refactor).
- [ ] D6: GitHub Actions CI / Deploy Backend / Deploy Frontend (if triggered) all green.
