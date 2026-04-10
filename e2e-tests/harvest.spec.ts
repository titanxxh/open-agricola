import { test, expect } from '@playwright/test';

test.describe('Harvest Phase Order Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i });
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check();
    }
  });

  test('harvest phase executes in correct order: field -> feed -> breed', async ({ page }) => {
    await page.goto('/?player=p1');

    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i });
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check();
    }

    await page.getByRole('button', { name: /reset|重开/i }).click();
    await page.waitForTimeout(500);

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton');
    await roundInput.fill('4');
    await page.getByRole('button', { name: /jump|快进/i }).click();
    await page.waitForTimeout(300);

    const logPanel = page.locator('.log');
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 });

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i });
    await endRoundBtn.click();
    await page.waitForTimeout(500);

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 });
  });

  test('field phase processes all players before feeding phase', async ({ page, context }) => {
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
    ]);

    for (let i = 0; i < 2; i++) {
      await pages[i].goto(`/?player=p${i + 1}`);
      const devModeCheckbox = pages[i].getByRole('checkbox', { name: /developer|开发者/i });
      if (!(await devModeCheckbox.isChecked())) {
        await devModeCheckbox.check();
      }
    }

    const p1 = pages[0];

    const roundInput = p1.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton');
    await roundInput.fill('4');
    await p1.getByRole('button', { name: /jump|快进/i }).click();
    await p1.waitForTimeout(500);

    const logPanel = p1.locator('.log');
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 });

    await p1.getByRole('button', { name: /end round|结束回合/i }).click();
    await p1.waitForTimeout(1000);

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 });

    for (const p of pages) {
      await p.close();
    }
  });

  test('feeding phase handles multiple players needing conversion', async ({ page }) => {
    await page.goto('/?player=p1');

    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i });
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check();
    }

    await page.getByRole('button', { name: /reset|重开/i }).click();
    await page.waitForTimeout(500);

    const resourceSelect = page.locator('.dev-row select').first();
    const amountInput = page.locator('.dev-row input[type="number"]').first();
    const applyBtn = page.locator('.dev-row .dev-apply').first();

    await resourceSelect.selectOption('food');
    await amountInput.fill('10');
    await applyBtn.click();
    await page.waitForTimeout(300);

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton');
    await roundInput.fill('4');
    await page.getByRole('button', { name: /jump|快进/i }).click();
    await page.waitForTimeout(300);

    const logPanel = page.locator('.log');
    await expect(logPanel).toContainText(/round 4|第 4 回合/i, { timeout: 5000 });

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i });
    await endRoundBtn.click();
    await page.waitForTimeout(500);

    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 });
  });

  test('breeding phase only starts after all players fed', async ({ page }) => {
    await page.goto('/?player=p1');

    const devModeCheckbox = page.getByRole('checkbox', { name: /developer|开发者/i });
    if (!(await devModeCheckbox.isChecked())) {
      await devModeCheckbox.check();
    }

    await page.getByRole('button', { name: /reset|重开/i }).click();
    await page.waitForTimeout(500);

    const resourceSelect = page.locator('.dev-row select').first();
    const amountInput = page.locator('.dev-row input[type="number"]').first();
    const applyBtn = page.locator('.dev-row .dev-apply').first();

    await resourceSelect.selectOption('sheep');
    await amountInput.fill('2');
    await applyBtn.click();
    await page.waitForTimeout(300);

    await resourceSelect.selectOption('food');
    await amountInput.fill('10');
    await applyBtn.click();
    await page.waitForTimeout(300);

    const roundInput = page.getByText(/target round|目标回合/i).locator('xpath=..').getByRole('spinbutton');
    await roundInput.fill('4');
    await page.getByRole('button', { name: /jump|快进/i }).click();
    await page.waitForTimeout(300);

    const endRoundBtn = page.getByRole('button', { name: /end round|结束回合/i });
    await endRoundBtn.click();
    await page.waitForTimeout(500);

    const logPanel = page.locator('.log');
    await expect(logPanel).toContainText(/harvest|收获/i, { timeout: 5000 });
  });

});
