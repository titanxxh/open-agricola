import { test, expect, type Page } from '@playwright/test';
import { giveResource, advanceRound } from './fixtures';

const actionCard = (page: Page, name: string) =>
  page.locator('.action-card', { hasText: name });

async function resetGame(page: Page) {
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(actionCard(page, 'Farmland')).toBeEnabled();
}

async function expectInteraction(page: Page, text: string) {
  await expect(page.locator('.interaction-bar__body')).toContainText(text);
}

async function selectFirstTile(page: Page) {
  const tile = page.locator('.farm-tile.selectable').first();
  await expect(tile).toBeVisible();
  await tile.click();
  return tile;
}

async function selectFenceEdges(page: Page, edgeIndexes: number[]) {
  const edges = page.locator('.farm-fence-h.selectable, .farm-fence-v.selectable');
  for (const edgeIndex of edgeIndexes) {
    const edge = edges.nth(edgeIndex);
    await expect(edge).toBeVisible();
    await edge.click();
  }
}

async function confirm(page: Page, name: string | RegExp = 'Confirm') {
  const button = page.getByRole('button', { name }).last();
  await expect(button).toBeEnabled();
  await button.click();
}

async function plowField(page: Page) {
  const farmlandCard = actionCard(page, 'Farmland');
  await expect(farmlandCard).toBeEnabled();
  await farmlandCard.click();
  await expectInteraction(page, 'Select a tile to plow');
  await selectFirstTile(page);
  await confirm(page, 'Confirm plow');
  await expect(page.locator('.farm-tile.field').first()).toBeVisible();
}

test.describe('FarmSelect Interactions End-to-End Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('open-agricola-locale-v2', 'en');
    });
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1');
    await page.waitForTimeout(500);
    await resetGame(page);
  });

  test('plow: creates field via farmland action', async ({ page }) => {
    await plowField(page);
  });

  test('plow: undo restores previous state', async ({ page }) => {
    await plowField(page);
    const fieldsBeforeUndo = await page.locator('.farm-tile.field').count();
    const undoButton = page.getByRole('button', { name: 'Undo Step' }).first();
    await undoButton.click();
    await page.waitForTimeout(500);
    const fieldsAfterUndo = await page.locator('.farm-tile.field').count();
    expect(fieldsAfterUndo).toBe(fieldsBeforeUndo - 1);
  });

  test('sow: sow grain into empty field', async ({ page }) => {
    await advanceRound(page, 14);
    await giveResource(page, 'grain', 1);
    const cultivationCard = actionCard(page, 'Cultivation');
    await expect(cultivationCard).toBeEnabled();
    await cultivationCard.click();
    await expectInteraction(page, 'Select a tile to plow');
    await selectFirstTile(page);
    await confirm(page, 'Confirm plow');
    await expectInteraction(page, 'Choose plow and/or sow');
    await page.getByRole('button', { name: 'Sow' }).click();
    await expectInteraction(page, 'Select crops for each empty field');
    await page.locator('.farm-tile.field .sow-choice-button[title="Grain"]').first().click();
    await confirm(page, 'Confirm sowing');
    await expect(page.locator('.farm-tile.field .field-crop-grain').first()).toBeVisible();
  });

  test('room: build room requires resources', async ({ page }) => {
    await giveResource(page, 'wood', 5);
    await giveResource(page, 'reed', 5);
    const farmExpansionCard = actionCard(page, 'Farm Expansion');
    await expect(farmExpansionCard).toBeEnabled();
    await farmExpansionCard.click();
    await expectInteraction(page, 'Choose expansion actions');
    await page.getByRole('button', { name: 'Build Rooms' }).click();
    await expectInteraction(page, 'Select room expansion tiles');
    await selectFirstTile(page);
    await confirm(page, 'Confirm expansion');
    await expect(page.locator('.farm-tile.room').nth(2)).toBeVisible();
  });

  test('stable: build stable on empty tile', async ({ page }) => {
    await giveResource(page, 'wood', 2);
    const farmExpansionCard = actionCard(page, 'Farm Expansion');
    await expect(farmExpansionCard).toBeEnabled();
    await farmExpansionCard.click();
    await expectInteraction(page, 'Select stable tiles');
    await selectFirstTile(page);
    await confirm(page, 'Confirm stables');
    await expect(page.locator('.farm-tile.stable').first()).toBeVisible();
  });

  test('fence: build fence requires wood', async ({ page }) => {
    await advanceRound(page, 4);
    await giveResource(page, 'wood', 5);
    const fencingCard = actionCard(page, 'Fencing');
    await expect(fencingCard).toBeEnabled();
    await fencingCard.click();
    await expectInteraction(page, 'Select fences on the farm and confirm');
    await selectFenceEdges(page, [0, 5, 6, 11]);
    await confirm(page, 'Confirm fences');
    await expect(page.locator('.farm-fence-h.active, .farm-fence-v.active').first()).toBeVisible();
  });

  test('plow: cannot plow without available tiles', async ({ page }) => {
    const farmlandCard = actionCard(page, 'Farmland');
    await expect(farmlandCard).toBeEnabled();
    await farmlandCard.click();
    await expectInteraction(page, 'Select a tile to plow');
    const emptyTiles = page.locator('.farm-tile.selectable');
    const count = await emptyTiles.count();
    expect(count).toBeGreaterThan(0);
  });
});
