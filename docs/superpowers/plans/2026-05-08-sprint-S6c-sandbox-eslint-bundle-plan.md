# Sprint S6c: Sandbox + ESLint + Bundle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `client/sandbox/` entry that hosts the workshop hot-seat behind a `dynamic import('shared/session/...')` boundary; add 5 ESLint error-level rules to harden the new layering; tighten `check-bundle-size` limits (main 550→400 KB raw / 170→130 KB gz) given S6b dropped main bundle below 400 KB; add a Playwright smoke test confirming workshop opens with lazy-loaded session.

**Architecture:** Workshop currently lazy-imports `WorkshopPage` (already 110 KB chunked). S6c adds a thin `client/sandbox/SandboxApp.tsx` shell that does an additional `await import('../../shared/session/...')` so session/engine/cards-impl land in the sandbox chunk, not the main bundle. ESLint rules enforce cards-display/contract/utils boundaries plus block main client (excl. sandbox) from importing session/engine.

**Tech Stack:** TypeScript, Vite/Rollup (dynamic import → automatic chunk), React Suspense, ESLint flat config, Playwright (e2e smoke).

**Spec:** `docs/superpowers/specs/2026-05-08-sprint-S6-physical-layering-design.md` §3.

**Setup:** worktree `.worktree/sprint-S6c` on branch `sprint-S6c-sandbox`. **Prerequisite:** S6a + S6b merged on main; main bundle already below 400 KB.

---

## File Structure

| File | Action |
|------|--------|
| `client/sandbox/index.tsx` | Create — exports `SandboxAppLazy = React.lazy(() => import('./SandboxApp'))` |
| `client/sandbox/SandboxApp.tsx` | Create — async-imports `shared/session/...`, mounts existing workshop UI |
| `client/sandbox/README.md` | Create — boundary documentation |
| `client/app/WorkshopPage.tsx` | Modify — replace synchronous `import GameSession from ...` with `await import(...)` |
| `eslint.config.js` | Modify — append 4 new error-level boundary rules (rule for cards-display already added in S6b) |
| `scripts/check-bundle-size.ts` | Modify — tighten default limits (main 400/130, sandbox 700) |
| `e2e-tests/workshop-smoke.spec.ts` | Create — Playwright smoke: open workshop, confirm session loads |
| `docs/ENGINE_NEW_ARCHITECTURE.md` | Modify — §15 S6 closeout block + progress header |

---

## Phase A: Sandbox skeleton + Workshop rewire

### Task A1: Create `client/sandbox/` skeleton files

**Files:**
- Create: `client/sandbox/index.tsx`
- Create: `client/sandbox/SandboxApp.tsx`
- Create: `client/sandbox/README.md`

- [ ] **Step 1: Recon — read current WorkshopPage to understand session imports**

```bash
grep -nE "^import.*shared/session|^import.*shared/engine|^import.*GameSession" client/app/WorkshopPage.tsx | head -10
ls client/app/workshop/
```

Note which imports need to move behind dynamic import.

- [ ] **Step 2: Create `client/sandbox/SandboxApp.tsx`**

```tsx
import { useEffect, useState } from 'react'
// Static imports allowed: contract types, cards-display, plain UI.
// Session/engine/cards-impl loaded dynamically below to keep main bundle clean.

import type { GameSession as GameSessionType } from '../../shared/session/session-core'

type SessionFactory = () => GameSessionType
type LoadedSandboxModule = { GameSession: SessionFactory }

interface SandboxAppProps {
  initialCustomCards?: unknown[]  // matches WorkshopPage prop
}

export default function SandboxApp({ initialCustomCards }: SandboxAppProps) {
  const [mod, setMod] = useState<LoadedSandboxModule | null>(null)
  const [WorkshopPage, setWorkshopPage] = useState<React.ComponentType<SandboxAppProps> | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      // Both end up in the same async chunk (Rollup groups dynamic imports per call site)
      import('../../shared/session/session-core'),
      import('../app/WorkshopPage'),
    ]).then(([sessionMod, workshopMod]) => {
      if (cancelled) return
      setMod({ GameSession: () => new sessionMod.GameSession() })
      setWorkshopPage(() => workshopMod.default)
    })
    return () => { cancelled = true }
  }, [])

  if (!WorkshopPage || !mod) {
    return <div data-testid="sandbox-loading">Loading sandbox…</div>
  }

  return <WorkshopPage initialCustomCards={initialCustomCards} />
}
```

(Engineer adapts the prop name and the `WorkshopPage` invocation to match the real signature. Inspect `client/app/WorkshopPage.tsx` exports first.)

- [ ] **Step 3: Create `client/sandbox/index.tsx`**

```tsx
import { lazy } from 'react'

export const SandboxAppLazy = lazy(() => import('./SandboxApp'))
```

- [ ] **Step 4: Create `client/sandbox/README.md`**

```markdown
# client/sandbox

Boundary: this directory is the only place in `client/` that may import
`shared/session/`, `shared/engine/`, or `shared/cards/<deck>/...` impl files
(for the workshop hot-seat single-player mode).

ESLint rule (`eslint.config.js`) enforces this — main `client/**` files
outside `client/sandbox/` get a lint error if they reach into session/engine.

The dynamic import boundary at `SandboxApp.tsx` ensures Rollup splits
session+engine+cards-impl into a separate chunk so the main bundle stays small.
Workshop users incur a one-time async download when entering the workshop.
```

- [ ] **Step 5: Run tsc**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10
```

Expected: 0 errors. If type signature mismatches `GameSession`, adjust import or stub.

- [ ] **Step 6: Commit**

```bash
git add client/sandbox/
git commit -m "feat(s6c): add client/sandbox/ skeleton — lazy entry for workshop session"
```

---

### Task A2: Rewire `client/app/WorkshopPage.tsx` to be sandbox-only

**Files:**
- Modify: `client/app/WorkshopPage.tsx` — replace synchronous session imports with dynamic; OR move session-touching code into `SandboxApp.tsx` instead.

**Decision:** Easier path — keep `WorkshopPage.tsx` unchanged, but the Workshop entry routing layer lazy-loads `SandboxAppLazy` instead of `WorkshopPage`. WorkshopPage continues to use static imports of session, but is itself reached only via the sandbox lazy chunk, so its bundle is the sandbox bundle.

- [ ] **Step 1: Find Workshop entry point in app routing**

```bash
grep -rn "WorkshopPage\|/workshop" client/main.tsx client/App.tsx client/app/ 2>&1 | head -10
```

- [ ] **Step 2: Replace WorkshopPage import with SandboxAppLazy at the routing layer**

Identify file (e.g. `client/main.tsx` or `client/App.tsx`) that lazy-loads `WorkshopPage`. Change:

```tsx
// OLD
const WorkshopPage = lazy(() => import('./app/WorkshopPage'))
// ...
<Route path="/workshop" element={<Suspense fallback={...}><WorkshopPage /></Suspense>} />

// NEW
import { SandboxAppLazy } from './sandbox'
// ...
<Route path="/workshop" element={<Suspense fallback={...}><SandboxAppLazy /></Suspense>} />
```

- [ ] **Step 3: Run tsc + test:fast**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm test:fast 2>&1 | tail -3
```

Expected: 0 errors / tests green.

- [ ] **Step 4: Run build, observe chunks**

```bash
pnpm run build 2>&1 | grep -E "dist/.*\.js\s|dist/.*\.css\s" | head -20
```

Expected: a `dist/assets/SandboxApp-*.js` (or `sandbox-*.js`) chunk exists, large (containing session+engine+cards-impl). Main `index-*.js` chunk shrunk further OR unchanged from S6b (depending on whether WorkshopPage was already chunked).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6c): route workshop entry through SandboxAppLazy boundary"
```

---

## Phase B: ESLint error-level boundary rules (4 new)

### Task B1: Rule 6 — `shared/contract/**` zero runtime deps

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Append rule block**

Insert before the final closing `]`:

```javascript
// S6c: shared/contract/** is type-only; runtime imports forbidden.
{
  files: ['shared/contract/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '../actions/**', '../engine/**', '../session/**',
            '../cards/**', '../cards-display/**', '../domain/**',
            '../utils/**',
            '../../actions/**', '../../engine/**', '../../session/**',
            '../../cards/**', '../../cards-display/**', '../../domain/**',
            '../../utils/**',
          ],
          message: 'shared/contract/** is type-only; do not import runtime modules.',
        },
      ],
    }],
  },
},
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint 2>&1 | grep "shared/contract" | head -10
```

Expected: 0 errors. If any contract file violates, decide: (a) the violation is a real type-only import that ESLint flagged false-positive (refactor to `import type` if not already), or (b) the file accidentally imports runtime — move that file out of contract/.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "lint(s6c): rule 6 — contract zero runtime deps (error)"
```

---

### Task B2: Rule 7 — main client (excl. sandbox + tests) cannot import session/engine

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Append rule block**

```javascript
// S6c: main client may not import session/engine. Use client/sandbox/ for hot-seat.
{
  files: ['client/**/*.{ts,tsx}'],
  ignores: ['client/sandbox/**', 'client/**/__tests__/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/shared/session/**', '**/shared/engine/**'],
          message: 'Main client cannot import shared/session/** or shared/engine/**. Use client/sandbox/ for workshop hot-seat.',
        },
      ],
    }],
  },
},
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint 2>&1 | grep "client.*shared/session\|client.*shared/engine" | head -10
```

Expected: 0 errors (Workshop now goes through sandbox; recon at start showed zero non-test client imports of session/engine in S6 spec §0). If any:

- If a main client file imports a `type` from session/engine: change to `import type` and add to allowed list (or move type to contract).
- If a main client file imports runtime: move it to `client/sandbox/` OR refactor.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "lint(s6c): rule 7 — main client cannot import session/engine (error)"
```

---

### Task B3: Rule 8 — actions/engine/session cannot import cards-display

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Append rule block**

```javascript
// S6c: impl layers should consume card metadata via getCardDefinition/registry-runtime,
// not reach into cards-display directly (would couple impl to display chunk).
{
  files: [
    'shared/actions/**/*.ts',
    'shared/engine/**/*.ts',
    'shared/session/**/*.ts',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/cards-display/**', '../cards-display/**', '../../cards-display/**'],
          message: 'session/engine/actions should consume metadata via shared/cards/registry-runtime (getCardDefinition / getCardEffect), not import cards-display directly.',
        },
      ],
    }],
  },
},
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint 2>&1 | grep -E "(actions|engine|session).*cards-display" | head -20
```

Expected: most likely 0 violations. If any, look at the specific call site — typical fix: read metadata via `getCardDefinition(id)` from `shared/cards/registry-runtime` instead of importing the const directly.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "lint(s6c): rule 8 — impl layers cannot import cards-display (error)"
```

---

### Task B4: Rule 9 — `shared/utils/**` zero domain/runtime deps

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Append rule block**

```javascript
// S6c: shared/utils/** is pure helper. No game/session/engine/cards/domain imports.
{
  files: ['shared/utils/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/shared/cards/**',
            '**/shared/cards-display/**',
            '**/shared/session/**',
            '**/shared/engine/**',
            '**/shared/actions/**',
            '**/shared/domain/**',
            '**/server/**',
            '**/client/**',
          ],
          message: 'shared/utils/** is pure helper; no domain/runtime/UI imports.',
        },
      ],
    }],
  },
},
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint 2>&1 | grep "shared/utils" | head -10
```

Expected: 0 errors (currently only `rng.ts` lives in utils per S6a; it has zero deps).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "lint(s6c): rule 9 — shared/utils zero domain/runtime deps (error)"
```

---

## Phase C: Bundle limit tightening

### Task C1: Tighten `scripts/check-bundle-size.ts` defaults

**Files:**
- Modify: `scripts/check-bundle-size.ts`

- [ ] **Step 1: Read current limits**

```bash
grep -nE "MAIN_RAW|MAIN_GZIP|WORKSHOP_RAW|SANDBOX|400|550|170" scripts/check-bundle-size.ts | head -10
```

Expected current defaults: `MAIN_RAW=550`, `MAIN_GZIP=170`, `WORKSHOP_RAW=400`.

- [ ] **Step 2: Measure actual main bundle**

```bash
pnpm run build 2>&1 | grep -E "dist/.*\.js\s" | head -10
```

Note actual `index-*.js` size (raw + gz) and `SandboxApp-*.js` size.

- [ ] **Step 3: Pick new limits**

If actual main is, say, 320 KB raw / 100 KB gz, set new limits to 400 / 130 (provide ~80 KB / 30 KB headroom). If actual main is closer to 380 KB, set 420 / 135.

Edit `scripts/check-bundle-size.ts`:

```typescript
const MAIN_RAW = limitKb('MAIN_RAW_LIMIT_KB', 400)   // was 550
const MAIN_GZIP = limitKb('MAIN_GZIP_LIMIT_KB', 130) // was 170
```

If `WORKSHOP_RAW_LIMIT_KB` should now cover the larger sandbox chunk:

```typescript
const WORKSHOP_RAW = limitKb('WORKSHOP_RAW_LIMIT_KB', 700) // was 400 — now includes session/engine/cards-impl
```

(Adjust based on actual sandbox chunk size from build output.)

- [ ] **Step 4: Run check**

```bash
pnpm run check:bundle-size 2>&1 | tail -5
```

Expected: PASS with new tighter limits. If FAIL, the chunks aren't where expected — investigate Rollup chunking output.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-bundle-size.ts
git commit -m "perf(s6c): tighten bundle limits — main 550→400 KB raw / 170→130 KB gz"
```

---

## Phase D: Playwright smoke test

### Task D1: Add workshop-smoke spec

**Files:**
- Create: `e2e-tests/workshop-smoke.spec.ts`

- [ ] **Step 1: Inspect existing e2e setup**

```bash
ls e2e-tests/
cat e2e-tests/playwright.config.ts 2>/dev/null || cat playwright.config.ts | head -30
```

Note baseURL pattern, how dev server is started.

- [ ] **Step 2: Write smoke spec**

```typescript
import { test, expect } from '@playwright/test'

test('workshop opens with lazy-loaded session bundle', async ({ page }) => {
  // Navigate to workshop
  await page.goto('/?page=workshop')

  // Initial loading state from SandboxApp's `<div data-testid="sandbox-loading">`
  // appears, then the actual workshop UI replaces it.
  await expect(page.getByTestId('sandbox-loading')).toBeVisible({ timeout: 5000 })
  // Wait for sandbox bundle to load and workshop to render. Use a stable
  // workshop UI marker (engineer to confirm).
  await page.waitForSelector('[data-testid="workshop-root"], [data-test="workshop-page"]', {
    timeout: 30000,
  })

  // Verify workshop loaded without errors
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
```

Engineer: adjust selectors to match actual workshop DOM (inspect `client/app/WorkshopPage.tsx` for stable testids).

- [ ] **Step 3: Verify dev server is running, then run smoke**

```bash
# In another terminal: pnpm run server && pnpm run dev (or ./restart-intranet.sh)
pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts 2>&1 | tail -10
```

Expected: 1 test passed.

- [ ] **Step 4: Commit**

```bash
git add e2e-tests/workshop-smoke.spec.ts
git commit -m "test(s6c): add Playwright smoke for sandbox lazy-loading"
```

---

## Phase E: Documentation + closeout

### Task E1: Update `docs/ENGINE_NEW_ARCHITECTURE.md`

**Files:**
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md`

- [ ] **Step 1: Update progress header (around L18)**

```bash
grep -n "S4c\|S5\|S6\|S7\|当前 sprint 进度" docs/ENGINE_NEW_ARCHITECTURE.md | head -5
```

Edit the line that lists sprint statuses:
- Replace `S6–S7 待启动` with `S6 ✅（2026-05-XX，物理分层 + cards split + dual bundle）/ S7 待启动`

- [ ] **Step 2: Append S6 closeout section**

Insert after the existing S5 closeout block, before the S6 description in §15:

```markdown
### Sprint S6：物理分层 ✅ 完成（2026-05-XX）

> **完成总结**：
> - ✅ S6a: `shared/contract/`、`shared/utils/`、`client/utils/` 三个新目录创建；`shared/game/`、`shared/logic/`、`shared/protocol/` 物理删除；`shared/cards/types.ts` 拆三份（contract/cards.ts + cards-display/types.ts + cards/registry-runtime.ts）
> - ✅ S6b: `scripts/codemod-cards-display.ts` 写好并跑过；824 张卡 split 成 cards-display + cards-impl 两份；catalog 改 import cards-display；ESLint cards-display 隔离规则落地
> - ✅ S6c: `client/sandbox/{index,SandboxApp}.tsx` 入口创建；workshop 路由改用 SandboxAppLazy；4 套新 ESLint error 级规则（contract / main-client / impl-no-cards-display / utils）；bundle limit 紧缩 main 550→400 KB raw / 170→130 KB gz；Playwright workshop smoke 验证 lazy-loading

#### Sprint S6 整体 DoD

- ✅ D1: 4 个新目录 + 3 个旧目录消失
- ✅ D2: 824 张卡 split 完成
- ✅ D3: 5 套新 ESLint error 级规则（cards-display 在 S6b、其他 4 套在 S6c）
- ✅ D4: main bundle ≤ 400 KB raw / 130 KB gz
- ✅ D5: `dist/assets/SandboxApp-*.js` 独立 chunk 含 session/engine/cards-impl
- ✅ D6: `pnpm test:fast` 2271 pass / 0 fail（行为零变化）
- ✅ D7: tsc app+server / lint / build / check:bundle-size 全绿
- ✅ D8: Playwright workshop smoke pass
- ✅ D9: GitHub Actions 全绿

#### 关键演进

1. **物理边界 vs 逻辑边界**：S6 之前 ESLint 多为 warn 级、有 5 套规则；S6 后 error 级硬阻断 + 物理目录隔离 — 无法误导入。
2. **Bundle 失控的根因**：每张卡 top-level import impl-side helper（B30 → fencing），ESM tree-shake 干不掉副作用；split 后 main 不再拖 824 张卡的 helper 链。
3. **codemod 一次性脚本**：`scripts/codemod-cards-display.ts` 完成施工后留作文档；新卡靠 ESLint 规则自然守门。
```

- [ ] **Step 3: Commit**

```bash
git add docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "docs(sprint-S6): closeout — DoD + ENGINE_NEW_ARCHITECTURE update"
```

---

## Phase F: Final CI + push

### Task F1: Full local CI

- [ ] **Step 1: Run all checks**

```bash
echo "=== lint ===" && pnpm run lint 2>&1 | tail -3
echo "=== lint:i18n ===" && pnpm run lint:i18n 2>&1 | tail -3
echo "=== tsc app ===" && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
echo "=== tsc server ===" && pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -5
echo "=== test:fast ===" && pnpm test:fast 2>&1 | tail -3
echo "=== build ===" && pnpm run build 2>&1 | tail -5
echo "=== bundle-size ===" && pnpm run check:bundle-size 2>&1 | tail -3
echo "=== check:reaches ===" && pnpm run check:reaches 2>&1 | tail -2
echo "=== check:no-dsl ===" && pnpm run check:no-dsl 2>&1 | tail -2
echo "=== check:catalog-types ===" && pnpm run check:catalog-types 2>&1 | tail -2
echo "=== check:community-deck ===" && pnpm run check:community-deck 2>&1 | tail -2
echo "=== check:prompt-sync ===" && pnpm run check:prompt-sync 2>&1 | tail -2
```

Expected: all 0 errors (warnings OK).

- [ ] **Step 2: If any failure, diagnose + fix + commit**

For lint errors: review which rule fires, decide if rule is wrong (revise rule) or code is wrong (refactor).

For test failures: that's a regression — investigate which file change broke a test. Most likely a leftover stale import path; sed-fix and re-run.

For bundle-size failure: chunks larger than expected. Inspect `dist/assets/` and adjust limit OR find the leak (a card display imports an impl helper).

- [ ] **Step 3: Commit any fix(es)**

```bash
git add -A
git commit -m "fix(s6c): <specific fix description>"
```

---

### Task F2: Push and wait for CI

- [ ] **Step 1: Push branch + fast-forward main**

```bash
git fetch origin main
git checkout main
git merge --ff-only sprint-S6c-sandbox
git push origin main
```

- [ ] **Step 2: Wait for GitHub Actions**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
HEAD_SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5" | jq -r ".workflow_runs[] | select(.head_sha == \"$HEAD_SHA\") | \"\\(.name) | \\(.status) | \\(.conclusion) | \\(.html_url)\""
```

Expected (after ~5–10 min): CI / Deploy Backend / Deploy Frontend all `success`.

- [ ] **Step 3: If CI fails, fetch logs**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
RUN_ID=<from prev output>
curl -s -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/$RUN_ID/jobs" | jq -r '.jobs[] | "\(.name) | \(.status) | \(.conclusion)"'
gh run view $RUN_ID --log-failed 2>&1 | tail -50
```

Diagnose, fix, push again.

---

## DoD Checklist

- [ ] D1: `client/sandbox/{index,SandboxApp}.tsx` + README created
- [ ] D2: Workshop routes through `SandboxAppLazy`
- [ ] D3: 4 new ESLint error-level rules (rule 6/7/8/9 — contract / main-client / impl-no-cards-display / utils) added; rule 5 (cards-display) was added in S6b
- [ ] D4: `pnpm run lint` 0 errors
- [ ] D5: `scripts/check-bundle-size.ts` defaults tightened (main 400/130, sandbox/workshop ~700)
- [ ] D6: `pnpm run check:bundle-size` PASS with new limits
- [ ] D7: `pnpm run build` produces `dist/assets/SandboxApp-*.js` chunk containing session+engine+cards-impl
- [ ] D8: Playwright `e2e-tests/workshop-smoke.spec.ts` passes
- [ ] D9: `pnpm test:fast` 2271 pass / 0 fail
- [ ] D10: `tsc app+server` 0 errors, `build` success, all `check:*` scripts green
- [ ] D11: `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S6 closeout block + progress header updated
- [ ] D12: GitHub Actions CI / Deploy Backend / Deploy Frontend all green

S6 fully complete after S6c lands. Skip-tracker still has 2 active skips (E70 + B104) — handle in S7 (behavior-regression batch).
