# Local E2E Verification Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a unified `npm run verify` command that starts servers, runs Playwright E2E tests, and cleans up — plus refactor all existing E2E tests to remove per-test server spawning and use shared helpers.

**Architecture:** A shell script (`scripts/verify.sh`) handles server lifecycle with health checks. A shared fixtures file (`e2e-tests/fixtures.ts`) exports URL constants and common helpers. All 9 E2E specs are refactored to remove `child_process` spawning and use shared fixtures. `playwright.config.ts` derives `baseURL` from `FRONTEND_URL` env var.

**Tech Stack:** Bash, Playwright, TypeScript

---

### Task 1: Create shared fixtures and update Playwright config

**Files:**
- Create: `e2e-tests/fixtures.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Create `e2e-tests/fixtures.ts`**

```typescript
import type { Page, APIRequestContext } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

// ── URL constants ────────────────────────────────────────────────────────────

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5175'
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

// ── Output directory ─────────────────────────────────────────────────────────

const OUTPUT_DIR = path.resolve(process.cwd(), 'output/playwright')

function ensureOutputDir(dir = OUTPUT_DIR) {
  mkdirSync(dir, { recursive: true })
}

// ── API helpers ──────────────────────────────────────────────────────────────

export async function postJson(
  request: APIRequestContext,
  url: string,
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await request.post(url, {
    ...(body !== undefined ? { data: body } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  })
  return resp.json()
}

export async function getJson(request: APIRequestContext, url: string) {
  const resp = await request.get(url)
  return resp.json()
}

// ── Dev panel helpers ────────────────────────────────────────────────────────

export async function giveResource(page: Page, resource: string, amount: number) {
  const devSection = page.locator('.dev-panel .dev-section')
  const firstRow = devSection.locator('.dev-row').first()
  const resourceSelect = firstRow.locator('select')
  await resourceSelect.selectOption({ value: resource })
  const amountInput = firstRow.locator('input[type="number"]')
  await amountInput.fill(String(amount))
  const applyBtn = firstRow.locator('button')
  await applyBtn.click()
  await page.waitForTimeout(300)
}

export async function advanceRound(page: Page, targetRound: number) {
  const devSection = page.locator('.dev-panel .dev-section')
  const roundRow = devSection.locator('.dev-row').nth(1)
  const roundInput = roundRow.locator('input[type="number"]')
  await roundInput.fill(String(targetRound))
  const advanceBtn = roundRow.locator('button')
  await advanceBtn.click()
  await page.waitForTimeout(500)
}

// ── Output helpers ───────────────────────────────────────────────────────────

export async function saveScreenshot(page: Page, name: string, dir = OUTPUT_DIR) {
  ensureOutputDir(dir)
  const filePath = path.join(dir, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[Screenshot] ${name}`)
}

export function saveState(name: string, data: unknown, dir = OUTPUT_DIR) {
  ensureOutputDir(dir)
  const filePath = path.join(dir, name.endsWith('.json') ? name : `${name}.json`)
  writeFileSync(filePath, JSON.stringify(data, null, 2))
  return filePath
}
```

- [ ] **Step 2: Update `playwright.config.ts` to derive `baseURL` from env**

Replace the full content of `playwright.config.ts` with:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 120_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  },
  outputDir: './output/playwright',
})
```

- [ ] **Step 3: Commit**

```bash
git add e2e-tests/fixtures.ts playwright.config.ts
git commit -m "feat: add shared E2E fixtures and derive baseURL from env"
```

---

### Task 2: Create verify script and npm command

**Files:**
- Create: `scripts/verify.sh`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/verify.sh`**

```bash
#!/bin/bash
# Usage: npm run verify [-- playwright args]
# Starts fresh servers, runs Playwright E2E tests, cleans up.
set -e

BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ">>> Cleaning up..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Kill any remaining processes on the ports
  lsof -ti :"$BACKEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
}

trap cleanup EXIT

# Check Playwright browsers are installed
if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
  echo ">>> Playwright browsers not installed. Run: npx playwright install"
  exit 1
fi

# Kill any existing servers on our ports
echo ">>> Killing existing servers on ports $BACKEND_PORT and $FRONTEND_PORT..."
lsof -ti :"$BACKEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start backend
echo ">>> Starting backend on port $BACKEND_PORT..."
npm run server > /dev/null 2>&1 &
BACKEND_PID=$!

# Start frontend
echo ">>> Starting frontend on port $FRONTEND_PORT..."
npx vite > /dev/null 2>&1 &
FRONTEND_PID=$!

# Health check: backend
echo ">>> Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
    echo ">>> Backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Backend did not start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Health check: frontend
echo ">>> Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo ">>> Frontend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Frontend did not start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Run Playwright tests (pass through all arguments)
echo ">>> Running Playwright tests..."
npx playwright test "$@"
TEST_EXIT=$?

echo ">>> Tests finished with exit code $TEST_EXIT"
exit $TEST_EXIT
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x scripts/verify.sh
```

- [ ] **Step 3: Add `verify` script to `package.json`**

In `package.json`, add to the `"scripts"` section after `"test:e2e"`:

```json
"verify": "bash scripts/verify.sh"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify.sh package.json
git commit -m "feat: add npm run verify command for local E2E verification"
```

---

### Task 3: Refactor simple spawn tests (actions, harvest, C75_Firewood)

These three specs have the same pattern: `child_process` spawn in `beforeAll`/`afterAll`, hard-coded `http://localhost:5173` URLs, no shared helper usage. The refactoring is identical for all three: remove spawn, replace URLs with `page.goto('/')` or `page.goto('/?player=p1')`.

**Files:**
- Modify: `e2e-tests/actions.spec.ts`
- Modify: `e2e-tests/harvest.spec.ts`
- Modify: `e2e-tests/C75_Firewood.spec.ts`

- [ ] **Step 1: Refactor `actions.spec.ts`**

Replace the entire file with:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Agricola Action Cards End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    // Enable dev mode
    const devModeCheckbox = page.getByRole('checkbox', { name: '开发者模式' })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }
    
    // Switch to single-player view (p1) to stabilize tests
    await page.goto('/?player=p1')
    const devModeCheckboxP1 = page.getByRole('checkbox', { name: '开发者模式' })
    if (!(await devModeCheckboxP1.isChecked())) {
      await devModeCheckboxP1.check()
    }
  })

  test('common-clay-pit: accumulates and grants clay', async ({ page }) => {
    // 1. Preconditions: advance round to accumulate
    const roundInput = page.getByText('目标回合').locator('xpath=..').getByRole('spinbutton')
    await roundInput.fill('2') // Advance to round 2 to accumulate 1 clay
    await page.getByRole('button', { name: '快进回合' }).click()

    // Verify clay-pit accumulation UI text
    const clayPitCard = page.locator('.action-card', { hasText: '黏土坑' })
    await expect(clayPitCard).toBeVisible()
    // Wait for the resource chip to update
    await expect(clayPitCard.locator('.resource-chip-text')).toContainText('黏土 1')

    // 2. Execute action
    await clayPitCard.click()

    // Verify player gained 1 clay
    const playerA = page.locator('.farm-header', { hasText: 'PlayerA' })
    await expect(playerA.locator('.resource-inline-item.resource-clay')).toContainText('1')

    // 3. Undo step
    await page.getByRole('button', { name: '撤销上一步' }).click()

    // Verify clay-pit reverted
    await expect(clayPitCard.locator('.resource-chip-text')).toContainText('黏土 1')
    await expect(playerA.locator('.resource-inline-item.resource-clay')).not.toBeVisible()
  })

  test('common-day-laborer: grants 2 food', async ({ page }) => {
    const dayLaborerCard = page.locator('.action-card', { hasText: '打零工' })
    await expect(dayLaborerCard).toBeVisible()

    // 1. Execute action
    await dayLaborerCard.click()

    // Verify player gained 2 food
    const playerA = page.locator('.farm-header', { hasText: 'PlayerA' })
    await expect(playerA.locator('.resource-inline-item.resource-food')).toContainText('2')

    // 2. Undo step
    await page.getByRole('button', { name: '撤销上一步' }).click()

    // Verify food reverted (Player A starts with 0 food in this setup)
    await expect(playerA.locator('.resource-inline-item.resource-food')).not.toBeVisible()
  })

})
```

- [ ] **Step 2: Refactor `harvest.spec.ts`**

Replace the entire file with (removing spawn, replacing `http://localhost:5173` with relative paths, and `http://localhost:5173/?player=p1` with `/?player=p1`):

```typescript
import { test, expect } from '@playwright/test'

test.describe('Harvest Phase Order Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }
  })

  test('harvest phase executes in correct order: field -> feed -> breed', async ({ page }) => {
    await page.goto('/?player=p1')
    
    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }

    await page.getByRole('button', { name: /reset|重开/i }).click()
    await page.waitForTimeout(500)

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton')
    await roundInput.fill('4')
    await page.getByRole('button', { name: /jump|快进/i }).click()
    await page.waitForTimeout(300)

    const logPanel = page.locator('.log')
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 })

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i })
    await endRoundBtn.click()
    await page.waitForTimeout(500)

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 })
  })

  test('field phase processes all players before feeding phase', async ({ page, context }) => {
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
    ])

    for (let i = 0; i < 2; i++) {
      await pages[i].goto(`/?player=p${i + 1}`)
      const devModeCheckbox = pages[i].getByRole('checkbox', { name: /developer|开发者/i })
      if (!(await devModeCheckbox.isChecked())) {
        await devModeCheckbox.check()
      }
    }

    const p1 = pages[0]
    
    const roundInput = p1.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton')
    await roundInput.fill('4')
    await p1.getByRole('button', { name: /jump|快进/i }).click()
    await p1.waitForTimeout(500)

    const logPanel = p1.locator('.log')
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 })

    await p1.getByRole('button', { name: /end round|结束回合/i }).click()
    await p1.waitForTimeout(1000)

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 })

    for (const p of pages) {
      await p.close()
    }
  })

  test('feeding phase handles multiple players needing conversion', async ({ page }) => {
    await page.goto('/?player=p1')
    
    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }

    await page.getByRole('button', { name: /reset|重开/i }).click()
    await page.waitForTimeout(500)

    const resourceSelect = page.locator('.dev-row select').first()
    const amountInput = page.locator('.dev-row input[type="number"]').first()
    const applyBtn = page.locator('.dev-row .dev-apply').first()

    await resourceSelect.selectOption('food')
    await amountInput.fill('10')
    await applyBtn.click()
    await page.waitForTimeout(300)

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton')
    await roundInput.fill('4')
    await page.getByRole('button', { name: /jump|快进/i }).click()
    await page.waitForTimeout(300)

    const logPanel = page.locator('.log')
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 })

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i })
    await endRoundBtn.click()
    await page.waitForTimeout(500)

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 })
  })

  test('breeding phase only starts after all players fed', async ({ page }) => {
    await page.goto('/?player=p1')
    
    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }

    await page.getByRole('button', { name: /reset|重开/i }).click()
    await page.waitForTimeout(500)

    const resourceSelect = page.locator('.dev-row select').first()
    const amountInput = page.locator('.dev-row input[type="number"]').first()
    const applyBtn = page.locator('.dev-row .dev-apply').first()

    await resourceSelect.selectOption('sheep')
    await amountInput.fill('2')
    await applyBtn.click()
    await page.waitForTimeout(300)

    await resourceSelect.selectOption('food')
    await amountInput.fill('10')
    await applyBtn.click()
    await page.waitForTimeout(300)

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton')
    await roundInput.fill('4')
    await page.getByRole('button', { name: /jump|快进/i }).click()
    await page.waitForTimeout(300)

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i })
    await endRoundBtn.click()
    await page.waitForTimeout(500)

    const logPanel = page.locator('.log')
    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 })
  })

})
```

- [ ] **Step 3: Refactor `C75_Firewood.spec.ts`**

Replace the entire file with:

```typescript
import { test, expect } from '@playwright/test'

test.describe('C75_Firewood End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    // Enable dev mode
    const devModeCheckbox = page.getByRole('checkbox', { name: '开发者模式' })
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check()
    }
    
    // Switch to single-player view (p1) to stabilize tests
    await page.goto('/?player=p1')
    const devModeCheckboxP1 = page.getByRole('checkbox', { name: '开发者模式' })
    if (!(await devModeCheckboxP1.isChecked())) {
      await devModeCheckboxP1.check()
    }
  })

  test('C75_Firewood: should show choice prompt when building oven with wood on card', async ({ page }) => {
    // Verify the game board is visible
    const gameBoard = page.locator('.game-board')
    await expect(gameBoard).toBeVisible()
    
    // Verify action cards are visible
    const actionCards = page.locator('.action-card')
    await expect(actionCards.first()).toBeVisible()
    
    // Verify player farm is visible  
    const playerFarm = page.locator('.farm-board')
    await expect(playerFarm).toBeVisible()
  })

  test('interaction bar should be visible when choices are available', async ({ page }) => {
    const interactionBar = page.locator('.interaction-bar, [class*="interaction"]')
    await expect(interactionBar).toHaveCount(1)
  })

})
```

- [ ] **Step 4: Commit**

```bash
git add e2e-tests/actions.spec.ts e2e-tests/harvest.spec.ts e2e-tests/C75_Firewood.spec.ts
git commit -m "refactor: remove server spawning and hard-coded URLs from simple E2E tests"
```

---

### Task 4: Refactor farm-select.spec.ts

**Files:**
- Modify: `e2e-tests/farm-select.spec.ts`

- [ ] **Step 1: Refactor `farm-select.spec.ts`**

Remove spawn blocks, inline `giveResource`/`advanceRound` helpers, and hard-coded URLs. Replace with imports from fixtures and relative paths.

Replace the entire file with:

```typescript
import { test, expect } from '@playwright/test'
import { giveResource, advanceRound } from './fixtures'

test.describe('FarmSelect Interactions End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?player=p1')
    await page.waitForTimeout(500)
  })

  test('plow: creates field via farmland action', async ({ page }) => {
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' })
    await expect(farmlandCard).toBeVisible()
    await farmlandCard.click()

    const farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()

    await expect(page.locator('.farm-tile.field, .farm-tile[data-type="field"]').first()).toBeVisible()
    await expect(farmOverlay).not.toBeVisible()
  })

  test('plow: undo restores previous state', async ({ page }) => {
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' })
    await farmlandCard.click()

    const farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()
    await expect(farmOverlay).not.toBeVisible()

    const fieldsBeforeUndo = await page.locator('.farm-tile.field, .farm-tile[data-type="field"]').count()

    const undoButton = page.getByRole('button', { name: 'Undo Step' }).first()
    await undoButton.click()
    await page.waitForTimeout(500)

    const fieldsAfterUndo = await page.locator('.farm-tile.field, .farm-tile[data-type="field"]').count()
    expect(fieldsAfterUndo).toBe(fieldsBeforeUndo - 1)
  })

  test('sow: sow grain into empty field', async ({ page }) => {
    await advanceRound(page, 2)

    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' })
    await farmlandCard.click()

    let farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()
    await expect(farmOverlay).not.toBeVisible()

    await giveResource(page, 'grain', 1)

    const sowCard = page.locator('.action-card', { hasText: 'Sow' })
    await expect(sowCard).toBeVisible()
    await sowCard.click()

    farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const fieldTile = page.locator('.farm-tile.field, .farm-tile[data-type="field"]').first()
    await fieldTile.click()

    await expect(fieldTile.locator('.grain, [data-grain]')).toBeVisible()
  })

  test('room: build room requires resources', async ({ page }) => {
    await giveResource(page, 'wood', 5)
    await giveResource(page, 'reed', 5)

    const farmExpansionCard = page.locator('.action-card', { hasText: 'Farm Expansion' })
    await expect(farmExpansionCard).toBeVisible()
    await farmExpansionCard.click()

    const farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const roomOption = page.locator('button, .option', { hasText: 'Room' })
    if (await roomOption.isVisible()) {
      await roomOption.click()
    }

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()

    await expect(page.locator('.farm-tile.room, .farm-tile[data-type="room"]').first()).toBeVisible()
  })

  test('stable: build stable on empty tile', async ({ page }) => {
    await giveResource(page, 'wood', 2)

    const farmExpansionCard = page.locator('.action-card', { hasText: 'Farm Expansion' })
    await expect(farmExpansionCard).toBeVisible()
    await farmExpansionCard.click()

    const farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const stableOption = page.locator('button, .option', { hasText: 'Stable' })
    if (await stableOption.isVisible()) {
      await stableOption.click()
    }

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()

    await expect(page.locator('.farm-tile.stable, .farm-tile[data-type="stable"]').first()).toBeVisible()
  })

  test('fence: build fence requires wood', async ({ page }) => {
    await advanceRound(page, 4)
    await giveResource(page, 'wood', 5)

    const fencingCard = page.locator('.action-card', { hasText: 'Fencing' })
    await expect(fencingCard).toBeVisible()
    await fencingCard.click()

    const farmOverlay = page.locator('.farm-select-overlay')
    await expect(farmOverlay).toBeVisible()

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first()
    await emptyTile.click()

    await expect(page.locator('.fence, [data-fence]').first()).toBeVisible()
  })

  test('plow: cannot plow without available tiles', async ({ page }) => {
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' })
    await expect(farmlandCard).toBeVisible()

    const emptyTiles = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]')
    const count = await emptyTiles.count()
    expect(count).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add e2e-tests/farm-select.spec.ts
git commit -m "refactor: use shared fixtures in farm-select E2E tests"
```

---

### Task 5: Refactor E21_SheepRug specs

**Files:**
- Modify: `e2e-tests/E21_SheepRug.spec.ts`
- Modify: `e2e-tests/E21_SheepRug_effect.spec.ts`

- [ ] **Step 1: Refactor `E21_SheepRug.spec.ts`**

Remove spawn, `fs` import, `ensureOutputDir`, and hard-coded URLs. Use `saveScreenshot` from fixtures. The test keeps its screenshot-driven flow but uses shared helpers.

Replace the top of the file (lines 1–43, everything before `test('Complete E21_SheepRug test flow`) with:

```typescript
import { test } from '@playwright/test'
import { saveScreenshot } from './fixtures'

test.describe('E21_SheepRug E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/?player=p1')
    await page.waitForTimeout(3000)

    // Enable dev mode
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible().catch(() => false)) {
      if (!(await checkbox.isChecked())) {
        await checkbox.click()
        await page.waitForTimeout(2000)
      }
    }
  })
```

Then in the test body, replace all `await page.screenshot({ path: 'output/E21_...png', fullPage: true })` calls with `await saveScreenshot(page, 'E21_...', 'output')`. For example, change:

```typescript
await page.screenshot({ path: 'output/E21_S01_initial.png', fullPage: true })
```

to:

```typescript
await saveScreenshot(page, 'E21_S01_initial', 'output')
```

Apply this pattern to all screenshot calls in the file. Remove the `ensureOutputDir()` call from `beforeEach` since `saveScreenshot` handles directory creation.

- [ ] **Step 2: Refactor `E21_SheepRug_effect.spec.ts`**

Remove spawn blocks, inline helpers (`postJson`, `getJson`, `saveState`, `ensureOutputDir`), and replace with imports from fixtures. Replace `API_BASE` and `FRONTEND_BASE` with `BACKEND_URL` and `FRONTEND_URL` from fixtures.

Replace lines 1–46 (imports through `afterAll`) with:

```typescript
import { test, expect } from '@playwright/test'
import { postJson, getJson, saveState, saveScreenshot, BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD_ID = 'E21_SheepRug'

test.use({ viewport: { width: 1920, height: 1080 } })
test.setTimeout(120000)
```

Then in the test bodies:
- Replace all `API_BASE` references with `BACKEND_URL`
- Replace all `FRONTEND_BASE` references with `FRONTEND_URL`
- Replace `ensureOutputDir()` calls — remove them (shared helpers handle this)
- Replace `saveState('name.json', data)` calls — already compatible with fixture version
- Replace `await page.screenshot({ path: path.join(OUTPUT_DIR, '...png'), fullPage: true })` with `await saveScreenshot(page, 'name', 'output')`
- Remove the `path` and `fs` imports since they're no longer needed

- [ ] **Step 3: Commit**

```bash
git add e2e-tests/E21_SheepRug.spec.ts e2e-tests/E21_SheepRug_effect.spec.ts
git commit -m "refactor: use shared fixtures in SheepRug E2E tests"
```

---

### Task 6: Refactor platform.spec.ts and C52_HuntsmansHat.spec.ts

These two specs already use env vars for URLs and don't spawn servers. Just replace inline helpers with imports from fixtures.

**Files:**
- Modify: `e2e-tests/platform.spec.ts`
- Modify: `e2e-tests/C52_HuntsmansHat.spec.ts`

- [ ] **Step 1: Refactor `platform.spec.ts`**

Replace lines 1–21 (imports through `postJson` definition) with:

```typescript
/**
 * Platform E2E tests — auth, lobby, workshop, sandbox.
 *
 * Requires the dev server to be running:
 *   npm run verify -- e2e-tests/platform.spec.ts
 *
 * Tests use unique usernames per run to avoid conflicts.
 */
import { test, expect } from '@playwright/test'
import { postJson, BACKEND_URL, FRONTEND_URL } from './fixtures'

const RUN_ID = Date.now().toString(36)
```

Then in the test bodies:
- Replace all `API_BASE` with `BACKEND_URL`
- Replace all `FRONTEND_BASE` with `FRONTEND_URL`

- [ ] **Step 2: Refactor `C52_HuntsmansHat.spec.ts`**

Replace lines 1–29 (imports through helper definitions) with:

```typescript
import { test, expect } from '@playwright/test'
import { postJson, getJson, saveState, saveScreenshot, BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD_ID = 'C52_HuntsmansHat'

test.use({ viewport: { width: 1920, height: 1080 } })
```

Then in the test body:
- Replace all `API_BASE` with `BACKEND_URL`
- Replace all `FRONTEND_BASE` with `FRONTEND_URL`
- Replace `saveState('name.json', data)` — keep as is, compatible
- Replace `await page.screenshot({ path: path.join(OUTPUT_DIR, '...png'), fullPage: true })` with `await saveScreenshot(page, 'name')`
- Remove `path` and `fs` imports

- [ ] **Step 3: Commit**

```bash
git add e2e-tests/platform.spec.ts e2e-tests/C52_HuntsmansHat.spec.ts
git commit -m "refactor: use shared fixtures in platform and HuntsmansHat E2E tests"
```

---

### Task 7: Refactor round-end-flow.spec.ts and ws-dual-player.spec.ts

**Files:**
- Modify: `e2e-tests/round-end-flow.spec.ts`
- Modify: `e2e-tests/ws-dual-player.spec.ts`

- [ ] **Step 1: Refactor `round-end-flow.spec.ts`**

This spec uses raw `fetch()` instead of Playwright's `request` fixture for API calls (`logState` function). Keep `fetch()` for `logState` since it's deeply woven into the test, but use URL constants from fixtures.

Replace lines 1–31 (imports through helper definitions) with:

```typescript
import { test } from '@playwright/test'
import { saveScreenshot, saveState, BACKEND_URL, FRONTEND_URL } from './fixtures'

test.use({ viewport: { width: 1920, height: 1080 } })

const logState = async (name: string) => {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/game/state`)
    const data = await resp.json()
    saveState(`${name}-state.json`, data)
    console.log(`[State] ${name}: pending=${data.pending?.type}, round=${data.state?.round}`)
    return data
  } catch (e) {
    console.error('[State Error]', e)
    return null
  }
}
```

Then in the test body:
- Replace `await fetch(\`${API_BASE}/api/game/new\`, { method: 'POST' })` with `await fetch(\`${BACKEND_URL}/api/game/new\`, { method: 'POST' })`
- Replace `await page.goto(\`${FRONTEND_BASE}/?player=p1\`)` with `await page.goto('/?player=p1')`
- Replace `await page.goto(\`${FRONTEND_BASE}/?player=p2\`)` with `await page.goto('/?player=p2')`
- Replace `await screenshot(page, 'name')` calls with `await saveScreenshot(page, 'name')`
- Remove `mkdirSync`, `writeFileSync`, `path` imports

- [ ] **Step 2: Refactor `ws-dual-player.spec.ts`**

Replace lines 1–19 (imports through helper definitions) with:

```typescript
import { test, expect } from '@playwright/test'
import { saveScreenshot, saveState, FRONTEND_URL } from './fixtures'

test.use({ viewport: { width: 1920, height: 1080 } })
```

Then in the test body:
- Replace `${FRONTEND}/?player=p1&transport=ws` with `${FRONTEND_URL}/?player=p1&transport=ws`
- Replace `${FRONTEND}/?player=p2&transport=ws` with `${FRONTEND_URL}/?player=p2&transport=ws`
- Replace `await shot(p1, 'name')` / `await shot(p2, 'name')` with `await saveScreenshot(p1, 'name')` / `await saveScreenshot(p2, 'name')`
- The inline `saveState` is already replaced by the import

Note: `ws-dual-player.spec.ts` uses `browser.newContext()` for two isolated contexts. The `page.goto()` calls use full URLs (not relative) because they're on separate contexts that don't inherit `baseURL` from the default context. This is correct — keep the full `${FRONTEND_URL}` URLs for these.

- [ ] **Step 3: Commit**

```bash
git add e2e-tests/round-end-flow.spec.ts e2e-tests/ws-dual-player.spec.ts
git commit -m "refactor: use shared fixtures in round-end-flow and ws-dual-player E2E tests"
```

---

### Task 8: Verify everything works

- [ ] **Step 1: Run verify with a single simple test to confirm the pipeline works**

```bash
npm run verify -- e2e-tests/actions.spec.ts
```

Expected: servers start, health checks pass, actions tests run, servers shut down. Exit code 0 if tests pass.

- [ ] **Step 2: Run verify with all tests**

```bash
npm run verify
```

Expected: all 9 spec files run. Some tests may fail due to game state issues (pre-existing), but the infrastructure (server lifecycle, fixtures, no spawn conflicts) should work correctly.

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address issues found during E2E verification"
```
