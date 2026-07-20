import { expect, test, type FrameLocator, type Page } from '@playwright/test'

const openEnglishPage = async (page: Page, url: string) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.goto(url)
}

const expectFarmRequestToRoute = async (surface: Page | FrameLocator) => {
  const navigation = surface.getByRole('navigation', { name: 'Game presentation' })
  const reset = surface.getByRole('button', { name: 'Reset' })
  await expect(reset).toBeVisible({ timeout: 30_000 })
  await reset.click()
  const actionPresentation = navigation.getByRole('button', { name: 'Action' })
  await actionPresentation.click()
  await expect(actionPresentation).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const farmland = surface.locator('[data-mobile-action-id="farmland"]')
  await expect(farmland).toBeVisible()
  await expect(farmland).toBeEnabled()
  await farmland.click()

  await expect(surface.locator('.game-presentations')).toHaveAttribute(
    'data-presentation',
    'farm',
  )
  await expect(surface.locator('.farm-tile.selectable').first()).toBeVisible()
  await expect(surface.locator('.game-presentation-status')).toHaveText('Current request: Farm')
  await expect(navigation.getByRole('button', { name: 'Farm' })).not.toBeFocused()

  await reset.click()
}

test.use({ viewport: { width: 375, height: 1024 } })

test('real WebSocket room routes a server farm request to Farm', async ({ page }) => {
  await openEnglishPage(page, '/?player=p1&transport=ws&room=dev3&devMode=1')
  await expectFarmRequestToRoute(page)
})

test('workshop sandbox routes a server farm request to Farm', async ({ page }) => {
  await openEnglishPage(page, '/?page=workshop&player=p2&devMode=1')
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()

  await expectFarmRequestToRoute(page.frameLocator('iframe[title="Sandbox"]'))
})
