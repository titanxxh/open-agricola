import { test, expect } from '@playwright/test';

test.describe('Agricola Action Cards End-to-End Tests', () => {

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

  test('common-clay-pit: accumulates and grants clay', async ({ page }) => {
    // 1. Preconditions: advance round to accumulate
    const roundInput = page.getByText('目标回合').locator('xpath=..').getByRole('spinbutton');
    await roundInput.fill('2'); // Advance to round 2 to accumulate 1 clay
    await page.getByRole('button', { name: '快进回合' }).click();

    // Verify clay-pit accumulation UI text
    const clayPitCard = page.locator('.action-card', { hasText: '黏土坑' });
    await expect(clayPitCard).toBeVisible();
    // Wait for the resource chip to update
    await expect(clayPitCard.locator('.resource-chip-text')).toContainText('黏土 1');

    // 2. Execute action
    await clayPitCard.click();

    // Verify player gained 1 clay
    const playerA = page.locator('.farm-header', { hasText: 'PlayerA' });
    await expect(playerA.locator('.resource-inline-item.resource-clay')).toContainText('1');

    // 3. Undo step
    await page.getByRole('button', { name: '撤销上一步' }).click();

    // Verify clay-pit reverted
    await expect(clayPitCard.locator('.resource-chip-text')).toContainText('黏土 1');
    await expect(playerA.locator('.resource-inline-item.resource-clay')).not.toBeVisible();
  });
  test('common-day-laborer: grants 2 food', async ({ page }) => {
    const dayLaborerCard = page.locator('.action-card', { hasText: '打零工' });
    await expect(dayLaborerCard).toBeVisible();

    // 1. Execute action
    await dayLaborerCard.click();

    // Verify player gained 2 food
    const playerA = page.locator('.farm-header', { hasText: 'PlayerA' });
    await expect(playerA.locator('.resource-inline-item.resource-food')).toContainText('2');

    // 2. Undo step
    await page.getByRole('button', { name: '撤销上一步' }).click();

    // Verify food reverted (Player A starts with 0 food in this setup)
    await expect(playerA.locator('.resource-inline-item.resource-food')).not.toBeVisible();
  });


});
