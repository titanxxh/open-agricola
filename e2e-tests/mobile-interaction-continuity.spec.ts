// @covers client/components/interaction/
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { relaunchBrowserSandbox } from './fixtures'

const openEnglishPage = async (page: Page, url: string) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.goto(url)
}

const expectFarmRequestWithoutNavigation = async (surface: Page | FrameLocator) => {
  const actionBoard = surface.locator('.action-board')
  const farmland = surface.locator('[data-action-id="farmland"] button').first()
  await expect(actionBoard).toBeVisible({ timeout: 30_000 })
  await expect(farmland).toBeEnabled()
  await farmland.click()

  await expect(surface.locator('.farm-tile.selectable').first()).toBeVisible()
  await expect(actionBoard).toBeVisible()
  await expect(surface.locator('.game-layout__center .farm-grid')).toBeVisible()
  await expect(surface.getByRole('navigation', { name: 'Game presentation' })).toHaveCount(0)
  await expect(surface.locator('.game-presentation-status')).toHaveCount(0)
}

test.use({ viewport: { width: 375, height: 1024 } })

test('workshop sandbox keeps a farm request on the continuous page', async ({ page }) => {
  await openEnglishPage(page, '/?page=workshop&player=p1&devMode=1')
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()
  const iframe = page.locator('iframe[title="Sandbox"]')
  await expect(iframe).toBeVisible({ timeout: 30_000 })
  // This work-phase test needs a real deal without an Elder opening offer;
  // keep the seed and sandbox settings independent of other tests.
  await relaunchBrowserSandbox(iframe, {
    seed: 4242, cards: [], playerCount: 2, deckIds: ['A', 'B', 'C', 'D', 'E'],
    enableThroughTheSeasons: false, enableFarmersOfTheMoor: false, enableSnakeOpening: false,
  })
  await expect(page.frameLocator('iframe[title="Sandbox"]').locator('.game-layout')).toBeVisible({ timeout: 30_000 })

  await expectFarmRequestWithoutNavigation(page.frameLocator('iframe[title="Sandbox"]'))
})
