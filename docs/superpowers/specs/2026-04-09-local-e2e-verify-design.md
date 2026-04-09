# Local E2E Verification Workflow — Design Spec

## Goal

A unified `npm run verify` command that starts fresh servers, runs Playwright E2E tests, and cleans up. Works for both human developers and AI agents. Also refactors existing E2E tests to remove duplicated helpers and per-test server spawning.

## Command Interface

```bash
npm run verify                                  # Run all E2E tests
npm run verify -- --grep "workshop"             # Filter by test name
npm run verify -- e2e-tests/platform.spec.ts    # Run specific file
```

`npm run test:e2e` continues to work as before (assumes servers are already running).

## Components

### 1. `scripts/verify.sh` — Server lifecycle + test runner

Shell script that manages the full lifecycle:

1. **Kill existing servers** on ports 5173 and 5175 (using `lsof -ti :PORT | xargs kill` or similar). This prevents port collisions if `restart-intranet.sh` is running.
2. **Start backend**: `npm run server` in background, capture PID.
3. **Start frontend**: `npx vite` in background, capture PID.
4. **Health-check loop**: Poll `http://localhost:5175/api/health` (backend) and `http://localhost:5173` (frontend) every 1 second, timeout after 30 seconds. Fail with clear error if either doesn't respond.
5. **Run Playwright**: `npx playwright test "$@"` — pass through all arguments.
6. **Capture exit code** from Playwright.
7. **Kill servers** using saved PIDs. Also cleanup any orphaned processes on the ports.
8. **Exit** with Playwright's exit code.

Trap `EXIT` signal to ensure cleanup runs even if the script is interrupted (Ctrl+C).

### 2. `e2e-tests/fixtures.ts` — Shared test helpers

A single file exporting all helpers currently duplicated across specs:

**URL constants:**
- `BACKEND_URL`: `process.env.BACKEND_URL ?? 'http://localhost:5175'`
- `FRONTEND_URL`: `process.env.FRONTEND_URL ?? 'http://localhost:5173'`

**API helpers:**
- `postJson(request, path, body?)` — POST to `BACKEND_URL + path`, return parsed JSON
- `getJson(request, path)` — GET from `BACKEND_URL + path`, return parsed JSON

**Dev panel helpers:**
- `giveResource(page, resource, amount)` — interact with dev panel to set a resource
- `advanceRound(page, targetRound)` — interact with dev panel to jump to a round

**Output helpers:**
- `saveScreenshot(page, name)` — save to `output/playwright/` with consistent naming
- `saveState(name, data)` — write JSON to `output/playwright/`

All helpers use the URL constants so they work with both default localhost and custom env vars.

### 3. `package.json` — New script

```json
"verify": "bash scripts/verify.sh"
```

### 4. Existing test refactoring

All 9 active E2E specs in `e2e-tests/` are refactored:

**Remove per-test server spawning** (affects 6 specs: `actions.spec.ts`, `farm-select.spec.ts`, `harvest.spec.ts`, `C75_Firewood.spec.ts`, `E21_SheepRug.spec.ts`, `E21_SheepRug_effect.spec.ts`):
- Delete `test.beforeAll` blocks that `spawn('npm', ['run', 'server'])` / `spawn('npm', ['run', 'dev'])`
- Delete `test.afterAll` blocks that kill the spawned processes
- Delete `child_process` imports

**Replace hard-coded URLs** (affects most specs):
- Replace `http://localhost:5173` with `FRONTEND_URL` from fixtures
- Replace `http://localhost:5175` with `BACKEND_URL` from fixtures

**Replace inline helpers** (affects `platform.spec.ts`, `farm-select.spec.ts`, `E21_SheepRug_effect.spec.ts`, `C52_HuntsmansHat.spec.ts`, `round-end-flow.spec.ts`, `ws-dual-player.spec.ts`):
- Delete inline `postJson`, `getJson`, `screenshot`/`shot`, `saveState`, `giveResource`, `advanceRound` definitions
- Import from `./fixtures`

**Update `playwright.config.ts` `baseURL` to use env var:**
- Change `baseURL` from hard-coded `'http://localhost:5173'` to `process.env.FRONTEND_URL ?? 'http://localhost:5173'`
- This is Playwright's official recommended approach — `page.goto('/')` and relative paths will resolve against `baseURL`, which stays in sync with `FRONTEND_URL`
- Tests should use `page.goto('/')` or relative paths for frontend navigation (resolved via `baseURL`), and `BACKEND_URL` from fixtures for API calls

**What stays unchanged:**
- All test logic, assertions, and selectors
- `playwright.config.ts` core settings (timeout 120s, viewport 1920x1080, headless, `testDir: './e2e-tests'`)
- The `.bak` file is left as-is (not active)

## Constraints

- `scripts/verify.sh` must work on Linux (the development environment). macOS compatibility is nice-to-have but not required.
- The script must handle `SIGINT`/`SIGTERM` gracefully — always kill servers on exit.
- Health checks must use actual HTTP requests, not hard-coded `sleep`.
- Playwright browsers must already be installed (`npx playwright install`). The verify script should check and print a clear error if not.

## Non-goals

- CI integration (can be added later by calling `npm run verify` in a GitHub Actions workflow)
- Parallelizing E2E tests across multiple workers
- Auto-detecting which tests to run based on changed files
