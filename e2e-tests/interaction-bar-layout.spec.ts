import { expect, test, type Page } from '@playwright/test'

const actionCard = (page: Page, name: string) =>
  page.locator('.action-card', { hasText: name })

const bottomGap = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  return page.evaluate(() => {
    const content = document.querySelector('.game-layout')
    const interactionBar = document.querySelector('.interaction-bar')
    if (!content || !interactionBar) throw new Error('Game layout is not ready')
    return interactionBar.getBoundingClientRect().top - content.getBoundingClientRect().bottom
  })
}

const expectPageMarginAboveInteractionBar = async (page: Page) => {
  await expect.poll(() => bottomGap(page)).toBeGreaterThanOrEqual(5)
  await expect.poll(() => bottomGap(page)).toBeLessThanOrEqual(8)
}

const interactionContentBottomGap = (page: Page) => page.evaluate(() => {
  const content = document.querySelector('.interaction-bar__top')
  if (!content) throw new Error('Interaction bar content is not ready')
  return window.innerHeight - content.getBoundingClientRect().bottom
})

test.describe('Interaction bar layout', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('open-agricola-locale-v2', 'en')
      const applySafeArea = () => {
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
      }
      if (document.documentElement) applySafeArea()
      else document.addEventListener('readystatechange', applySafeArea, { once: true })
    })
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(actionCard(page, 'Farmland')).toBeEnabled()
  })

  test('keeps the last game content above a compact interaction bar at 768px', async ({ page }) => {
    await expectPageMarginAboveInteractionBar(page)
  })

  test('updates the reserved space when the interaction bar expands and shrinks', async ({ page }) => {
    await actionCard(page, 'Farmland').click()
    await expect(page.locator('.interaction-bar__body')).toContainText('Select a tile to plow')

    await expectPageMarginAboveInteractionBar(page)

    await page.locator('.farm-tile.selectable').first().click()
    await page.getByRole('button', { name: 'Confirm plow' }).last().click()
    await expect(page.locator('.farm-tile.field').first()).toBeVisible()
    await expect(page.locator('.interaction-bar__body')).not.toContainText('Select a tile to plow')
    await page.getByRole('button', { name: 'Confirm switch' }).click()
    await expect(page.locator('.interaction-bar__body')).toBeHidden()

    await expectPageMarginAboveInteractionBar(page)
  })

  test('keeps controls above the bottom safe area without adding a gap above the bar', async ({ page }) => {
    await expect.poll(() => interactionContentBottomGap(page)).toBeGreaterThanOrEqual(34)
    await expectPageMarginAboveInteractionBar(page)
  })
})
