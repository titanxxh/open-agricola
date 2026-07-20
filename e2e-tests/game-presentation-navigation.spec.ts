import { expect, test, type Locator, type Page } from '@playwright/test'

const openEnglishPage = async (page: Page, url: string) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.goto(url)
}

const expectPresentationSelector = async (navigation: Locator) => {
  await expect(navigation).toBeVisible({ timeout: 30_000 })
  await expect(navigation).toHaveCSS('position', 'sticky')
  for (const name of ['Action', 'Farm', 'Cards', 'Information']) {
    const button = navigation.getByRole('button', { name })
    const box = await button.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
}

for (const width of [375, 768, 900]) {
  test(`real room exposes all gameplay presentations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 })
    await openEnglishPage(page, '/?player=p1&transport=ws&room=dev2&devMode=1')

    const navigation = page.getByRole('navigation', { name: 'Game presentation' })
    await expectPresentationSelector(navigation)
    await expect(page.locator('.game-presentations')).toHaveAttribute('data-presentation', 'action')

    const farmButton = navigation.getByRole('button', { name: 'Farm' })
    await farmButton.focus()
    await expect(farmButton).toBeFocused()
    expect(await farmButton.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(3)
    await farmButton.click()
    await expect(page.locator('.farm-grid')).toBeVisible()
    await expect(page.locator('.played-cards')).toBeHidden()

    await navigation.getByRole('button', { name: 'Cards' }).click()
    await expect(page.locator('.game-presentation-cards')).toBeVisible()
    await expect(page.locator('.hand-cards')).toBeVisible()
    await expect(page.locator('.farm-grid')).toBeHidden()

    await navigation.getByRole('button', { name: 'Information' }).click()
    await expect(page.locator('.game-layout__right')).toBeVisible()
    await expect(page.locator('.interaction-bar')).toBeVisible()
    await expect(page.locator('.interaction-bar')).toHaveCSS('position', 'fixed')
    await expect(page.locator('.mobile-tab-bar')).toHaveCount(0)
  })
}

test('workshop sandbox exposes the same mobile presentation selector', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1024 })
  await openEnglishPage(page, '/?page=workshop&player=p1&devMode=1')
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()

  const sandbox = page.frameLocator('iframe[title="Sandbox"]')
  const navigation = sandbox.getByRole('navigation', { name: 'Game presentation' })
  await expectPresentationSelector(navigation)
  await navigation.getByRole('button', { name: 'Cards' }).click()
  await expect(sandbox.locator('.hand-cards')).toBeVisible()
  await expect(sandbox.locator('.interaction-bar')).toBeVisible()
})
