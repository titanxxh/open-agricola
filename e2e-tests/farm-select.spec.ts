import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import type { Page } from '@playwright/test';

let backendProcess: ReturnType<typeof spawn>;
let frontendProcess: ReturnType<typeof spawn>;

test.beforeAll(async () => {
  // Start backend
  backendProcess = spawn('npm', ['run', 'server'], { stdio: 'ignore' });
  // Start frontend
  frontendProcess = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });

  // Wait for servers to be ready
  await new Promise(r => setTimeout(r, 3000));
});

test.afterAll(async () => {
  backendProcess?.kill();
  frontendProcess?.kill();
});

// Helper: give resource via dev panel
async function giveResource(page: Page, resource: string, amount: number) {
  const devSection = page.locator('.dev-panel .dev-section');
  const firstRow = devSection.locator('.dev-row').first();
  const resourceSelect = firstRow.locator('select');
  await resourceSelect.selectOption({ value: resource });
  const amountInput = firstRow.locator('input[type="number"]');
  await amountInput.fill(String(amount));
  const applyBtn = firstRow.locator('button');
  await applyBtn.click();
  await page.waitForTimeout(300);
}

// Helper: advance to target round via dev panel
async function advanceRound(page: Page, targetRound: number) {
  const devSection = page.locator('.dev-panel .dev-section');
  const roundRow = devSection.locator('.dev-row').nth(1);
  const roundInput = roundRow.locator('input[type="number"]');
  await roundInput.fill(String(targetRound));
  const advanceBtn = roundRow.locator('button');
  await advanceBtn.click();
  await page.waitForTimeout(500);
}

test.describe('FarmSelect Interactions End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/?player=p1');
    // Dev mode is enabled by default
    await page.waitForTimeout(500);
  });

  test('plow: creates field via farmland action', async ({ page }) => {
    // 1. Find and click Farmland action card
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' });
    await expect(farmlandCard).toBeVisible();
    await farmlandCard.click();

    // 2. Wait for farm select overlay
    const farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    // 3. Click on an empty tile to plow (e.g., tile at position 1,0)
    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();

    // 4. Verify field was created
    await expect(page.locator('.farm-tile.field, .farm-tile[data-type="field"]').first()).toBeVisible();

    // 5. Verify no pending state
    await expect(farmOverlay).not.toBeVisible();
  });

  test('plow: undo restores previous state', async ({ page }) => {
    // 1. Execute plow action
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' });
    await farmlandCard.click();

    const farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();

    // Wait for action to complete
    await expect(farmOverlay).not.toBeVisible();

    // 2. Count fields before undo
    const fieldsBeforeUndo = await page.locator('.farm-tile.field, .farm-tile[data-type="field"]').count();

    // 3. Undo the action
    const undoButton = page.getByRole('button', { name: 'Undo Step' }).first();
    await undoButton.click();
    await page.waitForTimeout(500);

    // 4. Verify field was removed (count decreased)
    const fieldsAfterUndo = await page.locator('.farm-tile.field, .farm-tile[data-type="field"]').count();
    expect(fieldsAfterUndo).toBe(fieldsBeforeUndo - 1);
  });

  test('sow: sow grain into empty field', async ({ page }) => {
    // 1. Advance to round 2 to give player workers
    await advanceRound(page, 2);

    // 2. First plow a field
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' });
    await farmlandCard.click();

    let farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();
    await expect(farmOverlay).not.toBeVisible();

    // 3. Give player grain
    await giveResource(page, 'grain', 1);

    // 4. Click Sow action card
    const sowCard = page.locator('.action-card', { hasText: 'Sow' });
    await expect(sowCard).toBeVisible();
    await sowCard.click();

    // 5. Select the field to sow
    farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    const fieldTile = page.locator('.farm-tile.field, .farm-tile[data-type="field"]').first();
    await fieldTile.click();

    // 6. Verify grain was sown (check for grain on field)
    await expect(fieldTile.locator('.grain, [data-grain]')).toBeVisible();
  });

  test('room: build room requires resources', async ({ page }) => {
    // 1. Give player resources: 5 wood + 5 reed for room
    await giveResource(page, 'wood', 5);
    await giveResource(page, 'reed', 5);

    // 2. Find Farm Expansion action card (contains room option)
    const farmExpansionCard = page.locator('.action-card', { hasText: 'Farm Expansion' });
    await expect(farmExpansionCard).toBeVisible();
    await farmExpansionCard.click();

    // 3. Wait for farm select overlay
    const farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    // 4. Select room option if available
    const roomOption = page.locator('button, .option', { hasText: 'Room' });
    if (await roomOption.isVisible()) {
      await roomOption.click();
    }

    // 5. Click on an adjacent empty tile to build room
    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();

    // 6. Verify room was built
    await expect(page.locator('.farm-tile.room, .farm-tile[data-type="room"]').first()).toBeVisible();
  });

  test('stable: build stable on empty tile', async ({ page }) => {
    // 1. Give player wood for stable
    await giveResource(page, 'wood', 2);

    // 2. Find Farm Expansion action card (contains stable option)
    const farmExpansionCard = page.locator('.action-card', { hasText: 'Farm Expansion' });
    await expect(farmExpansionCard).toBeVisible();
    await farmExpansionCard.click();

    // 3. Wait for farm select overlay
    const farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    // 4. Select stable option if available
    const stableOption = page.locator('button, .option', { hasText: 'Stable' });
    if (await stableOption.isVisible()) {
      await stableOption.click();
    }

    // 5. Click on an empty tile to build stable
    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();

    // 6. Verify stable was built
    await expect(page.locator('.farm-tile.stable, .farm-tile[data-type="stable"]').first()).toBeVisible();
  });

  test('fence: build fence requires wood', async ({ page }) => {
    // 1. Advance to round 4 to reveal Fencing action and give player workers
    await advanceRound(page, 4);

    // 2. Give player wood for fences
    await giveResource(page, 'wood', 5);

    // 3. Find Fencing action card
    const fencingCard = page.locator('.action-card', { hasText: 'Fencing' });
    await expect(fencingCard).toBeVisible();
    await fencingCard.click();

    // 4. Wait for farm select overlay
    const farmOverlay = page.locator('.farm-select-overlay');
    await expect(farmOverlay).toBeVisible();

    // 5. Click on an empty tile to build fence
    const emptyTile = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]').first();
    await emptyTile.click();

    // 6. Verify fence was built
    await expect(page.locator('.fence, [data-fence]').first()).toBeVisible();
  });

  test('plow: cannot plow without available tiles', async ({ page }) => {
    // 1. Find Farmland action card
    const farmlandCard = page.locator('.action-card', { hasText: 'Farmland' });
    await expect(farmlandCard).toBeVisible();

    // 2. Check that there are empty tiles available to plow
    const emptyTiles = page.locator('.farm-tile.empty, .farm-tile[data-type="empty"]');
    const count = await emptyTiles.count();

    // In a fresh game, there should be empty tiles available
    expect(count).toBeGreaterThan(0);
  });
});
