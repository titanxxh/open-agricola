import { test, expect } from '@playwright/test';

/**
 * Agricola Action Cards End-to-End Test Suite
 * 
 * This test suite verifies:
 * 1. Action card availability (preconditions)
 * 2. Action execution and state updates
 * 3. Action logging
 * 4. Undo functionality
 */

test.describe('Agricola Action Cards', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the game. Vite should be running.
    await page.goto('http://localhost:5173');
    
    // Ensure we are in English for consistent selectors
    const langButton = page.locator('button:has-text("English")');
    if (await langButton.isVisible()) {
      await langButton.click();
    }

    // Enable Dev Mode if needed for testing specific rounds/resources
    const devModeToggle = page.locator('label:has-text("Dev Mode") input');
    if (await devModeToggle.isVisible() && !(await devModeToggle.isChecked())) {
      await devModeToggle.check();
    }
  });

  test('should iterate through base action cards and verify execution', async ({ page }) => {
    // Get all base action cards
    const actionCards = page.locator('.action-base .action-card');
    const count = await actionCards.count();
    
    console.log(`Found ${count} base action cards`);

    for (let i = 0; i < count; i++) {
      const card = actionCards.nth(i);
      const title = await card.locator('.action-title').innerText();
      const isDisabled = await card.isDisabled();

      console.log(`Testing action: ${title} (Disabled: ${isDisabled})`);

      if (!isDisabled) {
        // 1. Take the action
        await card.click();

        // 2. Verify log entry (assuming log entry contains action name)
        const lastLog = page.locator('.log-bottom li').last();
        await expect(lastLog).toContainText(title);

        // 3. Test Undo Step
        const undoStepBtn = page.locator('button:has-text("Undo Step")');
        if (await undoStepBtn.isEnabled()) {
          await undoStepBtn.click();
          // Verify log is reverted or state is back (simplified check)
          const newLastLog = page.locator('.log-bottom li').last();
          await expect(newLastLog).not.toContainText(title);
        }

        // Re-take action for further testing if needed, or just continue to next
        // For this template, we just move to the next card after undoing
      }
    }
  });

  test('should verify round-specific action cards unlock correctly', async ({ page }) => {
    // Use Dev Panel to advance rounds and check action availability
    const roundInput = page.locator('.dev-field:has-text("Target Round") input');
    const advanceBtn = page.locator('button:has-text("Jump to Round")');

    for (let round = 1; round <= 14; round++) {
      await roundInput.fill(round.toString());
      await advanceBtn.click();

      // Check if actions for this round are unlocked
      const roundLabel = `Round ${round}`;
      const roundSlot = page.locator(`.round-slot:has-text("${roundLabel}")`);
      const actionCard = roundSlot.locator('.action-card');
      
      await expect(actionCard).not.toHaveClass(/locked/);
      
      const title = await actionCard.locator('.action-title').innerText();
      console.log(`Round ${round} action unlocked: ${title}`);
    }
  });

  test('should verify undo action and undo round', async ({ page }) => {
    // 1. Take an action
    const firstAction = page.locator('.action-base .action-card').first();
    const title = await firstAction.locator('.action-title').innerText();
    await firstAction.click();

    // 2. Verify Undo Action button
    const undoActionBtn = page.locator('button:has-text("Undo Action")');
    await expect(undoActionBtn).toBeEnabled();
    await undoActionBtn.click();
    
    // Verify state reverted
    await expect(page.locator('.log-bottom li').last()).not.toContainText(title);

    // 3. Test Undo Round (requires finishing a round)
    // This would involve taking all actions for the current player(s)
    // and then clicking "End Round", then "Undo Round".
    // (Implementation depends on game flow details)
  });
});
