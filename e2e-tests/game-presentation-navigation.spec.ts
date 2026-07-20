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
    const farmGrid = page.locator('.farm-grid')
    await expect(farmGrid).toBeVisible()
    await expect(page.locator('.played-cards')).toBeHidden()
    await expect(page.locator('.res-compact-item.is-zero').first()).toBeVisible()
    await expect(page.locator('.res-compact-item.is-nonzero').first()).toBeVisible()
    expect(await farmGrid.evaluate((element) => getComputedStyle(element).touchAction))
      .toMatch(/pinch-zoom|manipulation/)

    await navigation.getByRole('button', { name: 'Cards' }).click()
    await expect(page.locator('.played-cards')).toBeVisible()
    await expect(page.locator('.hand-cards')).toBeVisible()
    await expect(page.locator('.farm-grid')).toBeHidden()
    const handRow = page.locator('.hand-row').filter({ has: page.locator('.player-card') }).first()
    const firstHandCard = handRow.locator('.player-card').first()
    await expect(firstHandCard).toBeVisible()
    expect((await firstHandCard.boundingBox())!.width).toBeGreaterThanOrEqual(140)
    await expect(handRow).toHaveCSS('overflow-x', 'auto')
    expect(await handRow.evaluate((element) => getComputedStyle(element).touchAction))
      .toMatch(/manipulation|pan-y/)
    await expect(page.locator('[class*="hand-dock"]')).toHaveCount(0)
    await expect(page.locator('.hand-cards')).not.toHaveCSS('position', 'fixed')

    await navigation.getByRole('button', { name: 'Information' }).click()
    const information = page.locator('.game-layout__right')
    await expect(information).toBeVisible()
    const scoreSection = information.locator('.section').filter({ hasText: 'Scoring Pad' })
    const logSection = information.locator('.section').filter({ hasText: 'Action Log' })
    await scoreSection.getByRole('button', { name: 'expand' }).click()
    await logSection.getByRole('button', { name: 'expand' }).click()
    await expect(scoreSection.locator('.score-panel')).toBeVisible()
    await expect(logSection.getByRole('button', { name: 'All' })).toBeVisible()
    await expect(logSection.getByRole('button', { name: 'Previous' })).toBeVisible()
    await expect(logSection.getByRole('button', { name: 'Play' })).toBeVisible()
    await expect(logSection.getByRole('button', { name: 'Latest' })).toBeVisible()
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
