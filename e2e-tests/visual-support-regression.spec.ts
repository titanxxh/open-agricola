import { expect, test } from '@playwright/test'

const sandboxSettings = {
  player_count: 2,
  deck_ids: ['A', 'B', 'C', 'D', 'E'],
  enable_through_the_seasons: false,
  enable_farmers_of_the_moor: false,
  allow_incomplete_farmers_of_the_moor_minor_deal: false,
}

test.use({ viewport: { width: 390, height: 844 } })

test('keeps the controlled mobile lobby header visually stable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-20T12:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = pathname === '/api/auth/me'
      ? { ok: true, user: { id: 'u1', username: 'testuser', displayName: 'Test User' } }
      : { ok: true, cards: [], rooms: [], identities: [], hasMore: false, settings: sandboxSettings }
    await route.fulfill({ json })
  })

  await page.goto('/?page=lobby&bg=none')
  const header = page.locator('.lobby-header')
  await expect(header).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) await image.decode()
    }))
  })

  await expect(header).toHaveScreenshot('mobile-lobby-header.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.005,
  })
})
