import { expect, test, type FrameLocator, type Page } from '@playwright/test'

const openEnglishPage = async (page: Page, url: string) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.goto(url)
}

const expectContinuousGame = async (surface: Page | FrameLocator) => {
  await expect(surface.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
  await expect(surface.getByRole('navigation', { name: 'Game presentation' })).toHaveCount(0)
  await expect(surface.locator('.mobile-actions-panel')).toHaveCount(0)
  await expect(surface.locator('.action-board')).toBeVisible()
  await expect(surface.locator('.major-improvements')).toBeVisible()
  await expect(surface.locator('.farm-grid')).toBeVisible()
  await expect(surface.locator('.played-cards')).toBeVisible()
  await expect(surface.locator('.hand-cards')).toBeVisible()
  await expect(surface.locator('.game-layout__left')).not.toHaveAttribute('hidden', '')
  await expect(surface.locator('.game-layout__center')).not.toHaveAttribute('hidden', '')
  await expect(surface.locator('.game-layout__right')).not.toHaveAttribute('hidden', '')

  const information = surface.locator('.game-layout__right')
  const scoreSection = information.locator('.section').filter({ hasText: 'Scoring Pad' })
  const logSection = information.locator('.section').filter({ hasText: 'Action Log' })
  await expect(scoreSection.locator('.score-panel')).toHaveCount(0)
  await expect(logSection.locator('.action-log')).toHaveCount(0)
  await scoreSection.getByRole('button', { name: 'expand' }).click()
  await logSection.getByRole('button', { name: 'expand' }).click()
  await expect(scoreSection.locator('.score-panel')).toBeVisible()
  await expect(logSection.locator('.action-log')).toBeVisible()
  await expect(surface.locator('.interaction-bar')).toBeVisible()
}

for (const width of [375, 768, 900]) {
  test(`real room keeps the complete game on one page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 })
    await openEnglishPage(page, '/?player=p1&transport=ws&room=dev5&devMode=1')

    await expectContinuousGame(page)
    await expect(page.locator('.res-compact-item.is-zero').first()).toBeVisible()
    await expect(page.locator('.res-compact-item.is-nonzero').first()).toBeVisible()
    expect(await page.locator('.farm-grid').evaluate((element) => getComputedStyle(element).touchAction))
      .toMatch(/pinch-zoom|manipulation/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1)
  })
}

test('workshop sandbox uses the same continuous mobile game layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1024 })
  await openEnglishPage(page, '/?page=workshop&player=p1&devMode=1')
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()

  await expectContinuousGame(page.frameLocator('iframe[title="Sandbox"]'))
})
