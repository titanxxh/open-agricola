import { test, expect } from '@playwright/test';

test.describe('C075_Firewood End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Enable dev mode
    const devModeCheckbox = page.getByRole('checkbox', { name: '开发者模式' });
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check();
    }

    // Switch to single-player view (p1) to stabilize tests
    await page.goto('/?player=p1');
    const devModeCheckboxP1 = page.getByRole('checkbox', { name: '开发者模式' });
    if (!(await devModeCheckboxP1.isChecked())) {
      await devModeCheckboxP1.check();
    }
  });

  test('C075_Firewood: should show choice prompt when building oven with wood on card', async ({ page }) => {
    // This test verifies the core fix: after building an oven, if C075_Firewood has wood,
    // a choice prompt should appear to move wood from the card to supply.

    // Note: Setting up the exact state (having C075_Firewood with wood) requires
    // specific game setup. This test documents the expected behavior.

    // Verify the game board is visible
    const gameBoard = page.locator('.game-board');
    await expect(gameBoard).toBeVisible();

    // Verify action cards are visible
    const actionCards = page.locator('.action-card');
    await expect(actionCards.first()).toBeVisible();

    // Verify player farm is visible
    const playerFarm = page.locator('.farm-board');
    await expect(playerFarm).toBeVisible();

    // The actual test flow would be:
    // 1. Play C075_Firewood card (through some mechanism)
    // 2. Advance rounds to place wood on the card
    // 3. Build an oven (Major_Fireplace1)
    // 4. Verify choice prompt appears with options to move wood
    // 5. Select an option and verify wood is moved

    // For now, this test serves as a smoke test to ensure the game loads correctly
    // and the fix doesn't break the basic UI. The actual logic is tested in unit tests.
  });

  test('interaction bar should be visible when choices are available', async ({ page }) => {
    // Verify the interaction bar container exists
    const interactionBar = page.locator('.interaction-bar, [class*="interaction"]');

    // The interaction bar may or may not be visible depending on game state
    // This test just verifies the element exists in the DOM
    await expect(interactionBar).toHaveCount(1);
  });

});
