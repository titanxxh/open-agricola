# CI Test Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `pnpm test` into a fast tier (default CI, ~210 files) and a slow tier (per-card session tests, 254 files) so PR/push CI drops from ~10min to ~3-4min, while a new daily `CI Full` workflow keeps full coverage.

**Architecture:** Use vitest 4's multi-project mode (`projects` array in `vitest.config.ts`) keyed only on path globs — no test code changes, no per-test tags. `pnpm test` still runs everything (= the union of both projects); `pnpm test:fast` and `pnpm test:slow` filter via `--project`. The existing `ci.yml` switches its test step to `test:fast` and lowers its timeout; a new `ci-full.yml` runs the full suite + all check scripts on a daily cron + manual dispatch.

**Tech Stack:** vitest 4.1.4, GitHub Actions, pnpm 10.33.0.

**Spec:** `docs/superpowers/specs/2026-04-23-ci-test-tiering-design.md`

---

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `vitest.config.ts` | Modify | Define `fast` and `slow` projects with glob filters; preserve existing setupFiles + worktree exclude |
| `package.json` | Modify | Add `test:fast` / `test:slow` scripts; keep `test` as full-suite |
| `.github/workflows/ci.yml` | Modify | `Unit tests` step runs `pnpm run test:fast`; `verify` job timeout 20→10 |
| `.github/workflows/ci-full.yml` | Create | Daily cron + manual; runs lint + `pnpm test` (full) + build + all check scripts |
| `CLAUDE.md` | Modify | Document `test:fast` / `test:slow` in the 命令 section |

---

## Task 1: Vitest projects config (fast / slow split)

**Files:**
- Modify: `vitest.config.ts` (entire file — currently 25 lines)

**Background:** The current config wraps `viteConfig` with a single `test` block adding `setupFiles` and `exclude`. The new config keeps that wrapper but moves test-running into a `projects` array. Each project re-declares the shared `setupFiles` + `exclude`; project-level glob lives in `include`.

The slow tier glob `server/__tests__/[A-E][0-9]*_*-session.test.ts` matches **254** files (verified). The fast tier glob set was sized to 210 files (464 total − 254 slow).

- [ ] **Step 1.1: Sanity-check current file counts (so later verification has ground truth)**

Run from worktree root:

```bash
echo "slow tier files:" && find server/__tests__ -name '[A-E][0-9]*_*-session.test.ts' | wc -l
echo "fast tier files:" && {
  find shared -name '*.test.ts' -o -name '*.test.tsx'
  find client -name '*.test.ts' -o -name '*.test.tsx'
  find tests -name '*.test.ts'
  find scripts/__tests__ -name '*.test.ts'
  find server/__tests__ -name '*.test.ts' ! -name '[A-E][0-9]*_*-session.test.ts'
  find server/workshop-pr/__tests__ -name '*.test.ts'
} | sort -u | wc -l
echo "total tests:" && find . -name '*.test.ts' -o -name '*.test.tsx' 2>/dev/null | grep -v node_modules | grep -v '\./\.worktree/' | grep -v '\./e2e-tests' | sort -u | wc -l
```

Expected output:
```
slow tier files: 254
fast tier files: 210
total tests: 464
```

If the numbers differ (someone added/removed tests since spec authoring), record the actual numbers and use them as the new ground truth for Step 3.

- [ ] **Step 1.2: Replace `vitest.config.ts` with the projects-based version**

Overwrite the entire file with:

```ts
import { defineConfig, defaultExclude, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// React component tests under client/ that touch the DOM (use @testing-library/react's
// `render()`, expect `document`/`window`, etc.) MUST opt in to jsdom by adding this pragma
// at the top of the .test.tsx file:
//
//   // @vitest-environment jsdom
//
// Symptom if missing: "ReferenceError: document is not defined" / "window is not defined".
// (Vitest 4 removed `environmentMatchGlobs` — see https://vitest.dev/guide/migration .)
// Static-render tests using `renderToStaticMarkup` from `react-dom/server` do NOT need
// the pragma (e.g. client/components/common/__tests__/PlayerCard.test.tsx).

// Per-card session tests (server/__tests__/<Deck><Number>_<Name>-session.test.ts)
// are heavy and live in the `slow` project. The default CI runs `--project fast`;
// the daily `CI Full` workflow runs everything. See
// docs/superpowers/specs/2026-04-23-ci-test-tiering-design.md for the rationale.
const SLOW_INCLUDE = ['server/__tests__/[A-E][0-9]*_*-session.test.ts']
const FAST_INCLUDE = [
  'shared/**/*.test.ts',
  'shared/**/*.test.tsx',
  'client/**/*.test.ts',
  'client/**/*.test.tsx',
  'tests/**/*.test.ts',
  'scripts/**/__tests__/*.test.ts',
  'server/__tests__/*.test.ts',
  'server/workshop-pr/__tests__/*.test.ts',
]
const SHARED_EXCLUDE = [...defaultExclude, '**/.worktree/**']
const FAST_EXCLUDE = [...SHARED_EXCLUDE, ...SLOW_INCLUDE]
const SHARED_SETUP = [
  './shared/cards/__tests__/setup-register-all.ts',
  './client/__tests__/setup.ts',
]

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: SHARED_EXCLUDE,
      setupFiles: SHARED_SETUP,
      projects: [
        {
          extends: true,
          test: {
            name: 'fast',
            include: FAST_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: SHARED_SETUP,
          },
        },
        {
          extends: true,
          test: {
            name: 'slow',
            include: SLOW_INCLUDE,
            exclude: SHARED_EXCLUDE,
            setupFiles: SHARED_SETUP,
          },
        },
      ],
    },
  }),
)
```

Notes for the engineer:
- `extends: true` inherits the parent vite config (plugins, resolve aliases) so the projects don't need their own viteConfig merge.
- `setupFiles` is repeated at both top-level and per-project because vitest 4 treats project-level `test` as authoritative — do not assume inheritance for `setupFiles`.
- `SHARED_EXCLUDE` includes `**/.worktree/**` to prevent vitest from re-discovering test files inside sibling worktrees (this matters when running from a worktree).
- The slow project's `exclude` is `SHARED_EXCLUDE` (not `FAST_EXCLUDE`) — it should NOT exclude itself.

- [ ] **Step 1.3: Verify `--project fast` runs only fast files**

Run:

```bash
pnpm exec vitest run --project fast --reporter=verbose 2>&1 | tail -5
```

Expected: `Test Files  210 passed (210)` (or whatever the actual fast count is from Step 1.1; allow ±2 for skipped/dynamic files).

If failing because of "unknown option --project" or "projects is not a valid key", check vitest version:

```bash
pnpm list vitest
```

Should show `vitest 4.1.4` (or 4.x). If lower, escalate — the spec assumes vitest 4.

- [ ] **Step 1.4: Verify `--project slow` runs only slow files**

```bash
pnpm exec vitest run --project slow --reporter=verbose 2>&1 | tail -5
```

Expected: `Test Files  254 passed (254)` (allow small variance).

- [ ] **Step 1.5: Verify total = sum (no overlap, no missing files)**

```bash
pnpm exec vitest run --reporter=verbose 2>&1 | tail -5
```

Expected: `Test Files  464 passed (464)` — equal to fast + slow from Steps 1.3/1.4.

If total ≠ fast + slow:
- If total > fast + slow → some file matches BOTH projects (overlap). Tighten one glob.
- If total < fast + slow → impossible (would mean a project is dropping files). Re-check globs literally.

- [ ] **Step 1.6: Commit**

```bash
git add vitest.config.ts
git commit -m "feat(test): split vitest into fast / slow projects

Per-card session tests (server/__tests__/<Deck><N>_<Name>-session.test.ts,
254 files) move to the 'slow' project. Everything else stays in 'fast'
(210 files). Both projects share the existing setupFiles + worktree
exclude. \`pnpm exec vitest run\` (no --project) still runs everything
(= 464), preserving the default test command's semantics."
```

---

## Task 2: Add `test:fast` and `test:slow` scripts

**Files:**
- Modify: `package.json:17` (the `"test"` script line and surrounding test scripts)

- [ ] **Step 2.1: Edit package.json scripts**

Open `package.json` and find the `"scripts"` block. The current relevant lines are:

```json
"test": "vitest run --exclude e2e-tests --exclude scripts/test-actions.spec.ts",
"test:bench": "RUN_BENCHMARKS=1 vitest run tests/pay-dp.test.ts tests/pay-optimizations.test.ts --testTimeout=20000",
"test:e2e": "npx playwright test",
```

Change to:

```json
"test": "vitest run --exclude e2e-tests --exclude scripts/test-actions.spec.ts",
"test:fast": "vitest run --project fast --exclude e2e-tests --exclude scripts/test-actions.spec.ts",
"test:slow": "vitest run --project slow --exclude e2e-tests --exclude scripts/test-actions.spec.ts",
"test:bench": "RUN_BENCHMARKS=1 vitest run tests/pay-dp.test.ts tests/pay-optimizations.test.ts --testTimeout=20000",
"test:e2e": "npx playwright test",
```

Notes:
- `test` stays untouched: existing callers (CI before this change, local muscle memory, `pnpm exec vitest run` via `pretest` hooks) keep working. With the new projects config, `vitest run` without `--project` is the union of both projects = full suite.
- `test:fast` / `test:slow` carry the same `--exclude` flags that `test` does, so they behave identically to `test` aside from the project filter. (`--exclude e2e-tests` is redundant with the projects' includes, but harmless and consistent.)

- [ ] **Step 2.2: Verify each script returns the right file count**

```bash
pnpm test:fast 2>&1 | grep "Test Files"
pnpm test:slow 2>&1 | grep "Test Files"
pnpm test 2>&1 | grep "Test Files"
```

Expected: 210, 254, 464 (matching Step 1 ground truth).

- [ ] **Step 2.3: Commit**

```bash
git add package.json
git commit -m "feat(scripts): add test:fast / test:slow

\`pnpm test:fast\` and \`pnpm test:slow\` filter to the corresponding
vitest project. \`pnpm test\` continues to run the full suite (union of
fast + slow), preserving existing behaviour for local dev and ci-full."
```

---

## Task 3: Switch default CI to `test:fast` + lower timeout

**Files:**
- Modify: `.github/workflows/ci.yml:33` (timeout-minutes), `.github/workflows/ci.yml:52-53` (Unit tests step)

- [ ] **Step 3.1: Edit ci.yml — timeout**

Find:
```yaml
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
```

Change to:
```yaml
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

- [ ] **Step 3.2: Edit ci.yml — test step**

Find:
```yaml
      - name: Unit tests
        run: pnpm test
```

Change to:
```yaml
      - name: Unit tests (fast tier)
        run: pnpm run test:fast
```

(All other steps in the `verify` job — Lint, Build, check:reaches, check:no-dsl, check:bundle-size, check:catalog-types, check:community-deck — stay unchanged.)

- [ ] **Step 3.3: Lint the YAML locally**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "yaml ok"
```

Expected: `yaml ok`. If it errors, the indentation is off — re-check.

- [ ] **Step 3.4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: default verify job runs test:fast tier only

Push/PR CI now runs the fast vitest project (210 files; ~3-4min total
job). The slow tier (254 per-card session tests) is covered by the new
ci-full.yml on a daily cron. Job timeout drops 20→10min — fast tier
should comfortably fit."
```

---

## Task 4: Create `ci-full.yml` — daily full-suite workflow

**Files:**
- Create: `.github/workflows/ci-full.yml`

- [ ] **Step 4.1: Write the new workflow file**

Create `.github/workflows/ci-full.yml` with exactly this content:

```yaml
name: CI Full

on:
  schedule:
    - cron: '0 18 * * *'   # daily 18:00 UTC = 02:00 CST (Beijing) next day
  workflow_dispatch:

jobs:
  full:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v6

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm run lint

      - name: All tests (fast + slow)
        run: pnpm test

      - name: Build (includes cards manifest)
        run: pnpm run build

      - name: Check reaches (strict)
        run: pnpm run check:reaches -- --strict

      - name: Check no-DSL (strict — DSL path fully removed)
        run: pnpm run check:no-dsl -- --strict

      - name: Check bundle size (strict)
        run: pnpm run check:bundle-size

      - name: Check catalog types (issue #10)
        run: pnpm run check:catalog-types

      - name: Check community deck consistency
        run: pnpm run check:community-deck
```

Notes:
- Cron `0 18 * * *` = daily 18:00 UTC = 02:00 Beijing time (UTC+8) the next day.
- All check steps are duplicated from ci.yml deliberately — ci-full is a daily safety net, not a sub-workflow that depends on ci.yml. (Spec §4.2 / §3.)
- Timeout 25min: fast (~3-4min) + slow (~5-7min, dominated by 254 session tests) + lint/build/checks (~2min) + install (~1min). Should land well under 25min.

- [ ] **Step 4.2: Lint the YAML locally**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-full.yml'))" && echo "yaml ok"
```

Expected: `yaml ok`.

- [ ] **Step 4.3: Commit**

```bash
git add .github/workflows/ci-full.yml
git commit -m "ci: add ci-full.yml — daily full suite + checks

Runs lint + \`pnpm test\` (full, both vitest projects) + build + all
five check scripts. Triggered by daily cron (18:00 UTC = 02:00 Beijing)
and workflow_dispatch. Acts as both regression net and reverse-check
that the fast tier glob isn't accidentally dropping files."
```

---

## Task 5: Update CLAUDE.md command docs

**Files:**
- Modify: `CLAUDE.md` (the 命令 / 常用命令 section)

- [ ] **Step 5.1: Read the current 命令 block to locate the edit**

```bash
grep -n "pnpm test" CLAUDE.md | head -5
```

Find the line `pnpm test                                         # vitest 单元测试（排除 e2e 和 scripts/）` and the surrounding 命令 block.

- [ ] **Step 5.2: Update both the 命令 and 常用命令 sections**

In the 命令 block (around line ~110), replace:

```
pnpm test                                         # vitest 单元测试（排除 e2e 和 scripts/）
pnpm run test:e2e                                 # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run tests/path/to/file.spec.ts   # 单文件
```

with:

```
pnpm test                                         # 全量 vitest 单元测试（fast + slow 两个 project，本地默认 / ci-full 用）
pnpm test:fast                                    # 只跑 fast project（默认 CI 用，约 210 文件，~1-2 min）
pnpm test:slow                                    # 只跑 slow project（254 个单卡 session 测试）
pnpm run test:e2e                                 # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run tests/path/to/file.spec.ts   # 单文件
```

Then in the 常用命令 block further down, replace:

```
- `pnpm test`：vitest 单元测试（不含 e2e）
```

with:

```
- `pnpm test`：vitest 全量（fast + slow）；CI 默认走 `pnpm test:fast`，每日 ci-full.yml 跑全量
```

- [ ] **Step 5.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document test:fast / test:slow scripts

Mirror the new script split (Task 2) and the CI policy (default CI →
test:fast; nightly CI Full → pnpm test) so future contributors know
which command to reach for locally."
```

---

## Task 6: Push, observe CI, record real wall-time

**Files:** none (verification only)

- [ ] **Step 6.1: Push the branch**

From inside the worktree:

```bash
git push -u origin design/ci-test-tiering
```

This creates a remote branch and triggers `ci.yml` on push (since `push: branches: [main, ui]` only matches main/ui, but PRs do trigger). To force-trigger `ci.yml`'s `pull_request` handler, open a PR.

- [ ] **Step 6.2: Open a PR**

```bash
gh pr create --title "ci: split tests into fast/slow tiers" --body "$(cat <<'EOF'
## Summary

Implements docs/superpowers/specs/2026-04-23-ci-test-tiering-design.md.

- Fast project (default CI): ~210 files
- Slow project (per-card session tests): 254 files
- New ci-full.yml runs full suite + all checks daily at 02:00 Beijing
- Local default `pnpm test` unchanged (still runs everything)

## Test plan

- [ ] CI green on this PR (fast tier only)
- [ ] Manually trigger ci-full.yml via workflow_dispatch and confirm green
- [ ] Wall-time delta recorded below

## Wall-time

| Workflow | Before | After |
|---|---|---|
| `verify` job (test step) | TBD | TBD |
| `verify` job (total) | TBD | TBD |
| `ci-full` job | n/a | TBD |
EOF
)"
```

If `gh` is unavailable in the environment (CLAUDE.md notes the Cursor VM `gh` is not the GitHub CLI), use the API:

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d '{"title":"ci: split tests into fast/slow tiers","head":"design/ci-test-tiering","base":"main","body":"see plan doc"}'
```

- [ ] **Step 6.3: Wait for CI on the PR + record wall-time**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
SHA=$(git rev-parse HEAD)
until curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq -r ".workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\") | .conclusion" \
  | grep -q '^success$\|^failure$'; do
  sleep 30
done
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq ".workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\") | {conclusion, run_started_at, updated_at}"
```

Compute total wall-time = `updated_at - run_started_at`. Get per-step durations from:

```bash
RUN_ID=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq -r ".workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\") | .id")
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/$RUN_ID/jobs" \
  | jq '.jobs[] | {name, conclusion, steps: [.steps[] | {name, started_at, completed_at}]}'
```

Update the PR description's Wall-time table with the real numbers.

- [ ] **Step 6.4: Manually dispatch ci-full and verify it passes**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci-full.yml/dispatches \
  -d '{"ref":"design/ci-test-tiering"}'
```

Wait for it (same loop pattern as Step 6.3, filtering on `name=="CI Full"`). Confirm `conclusion: success` and record total wall-time in the PR description.

- [ ] **Step 6.5: Mark PR ready and merge**

After both CI runs are green and the wall-time table is updated, merge via the project's standard rebase-merge flow (squash is disabled per CLAUDE.md). No code commit in this step — just merge.

---

## Risk Notes

1. **Vitest 4 `projects` API**: The spec assumes vitest 4.1.4 (current). Steps 1.3-1.5 will surface incompatibilities immediately. If `projects` is rejected, the fallback is the older `workspace` API (`vitest.workspace.ts`); see https://vitest.dev/guide/migration .
2. **Setup file inheritance**: vitest 4 does not auto-inherit `setupFiles` from parent into projects. The plan repeats them explicitly in each project to be safe. Do NOT remove the duplication "for cleanliness" — it's defensive against API behavior.
3. **Glob escaping**: The slow include uses literal brackets `[A-E][0-9]*_*-session.test.ts`. Vitest delegates this to micromatch which treats `[A-E]` as a character class and `*` as glob. Verify this works in Step 1.3/1.4 before assuming the pattern is correct.
4. **Cron timing**: 02:00 Beijing time is intentionally off-peak (low GH Actions queue, low chance of hitting concurrent deploys). If the team works late nights / different timezones, adjust the cron.
