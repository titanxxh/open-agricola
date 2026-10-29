import { expect, test } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`seasonal placement uses the board worker icon at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 1373, playerCount: 2, customCardIds: [], enableThroughTheSeasons: true },
    })).ok()).toBe(true)
    const fixture = createWorkSession({ seed: 1373, options: { enableThroughTheSeasons: true }, configure: state => {
      state.throughTheSeasons = { startSeason: 'autumn', currentSeason: 'autumn' }
      state.players[0]!.name = '许欣昊'
      state.players[0]!.nameIsDefault = false
      state.players[0]!.color = 'blue'
      state.players[1]!.color = 'red'
    } })
    try {
      const state = fixture.withCtx(() => serializeState(fixture.state, {}))
      expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
    } finally { fixture.dispose() }

    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const autumn = page.locator('.seasons-board__space-button--autumn')
    await expect(autumn).toBeEnabled()
    await expect(autumn.locator('.seasons-board__worker')).toHaveCount(0)
    await autumn.click()
    await expect(autumn).toHaveAttribute('data-season-status', 'occupied')
    await expect(autumn).toBeDisabled()
    const worker = autumn.getByRole('img', { name: '许欣昊', exact: true })
    await expect(worker).toBeVisible()
    await expect(worker).toHaveAttribute('title', '许欣昊')
    await expect(worker).toHaveText('')
    const icon = worker.locator('.action-farmer-blue')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveCSS('mask-image', /farmers\.png/)
    await icon.evaluate(async element => {
      const source = getComputedStyle(element).maskImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]
      if (!source) throw new Error('Worker icon is missing its sprite URL')
      const sprite = new Image()
      sprite.crossOrigin = 'anonymous'
      sprite.src = source
      await sprite.decode()
    })
    const bounds = await worker.boundingBox()
    const cardBounds = await autumn.boundingBox()
    const titleBounds = await autumn.locator('.seasons-board__action-header').boundingBox()
    if (!bounds || !cardBounds || !titleBounds) throw new Error('Missing worker icon or seasonal action bounds')
    expect(bounds.x).toBeGreaterThanOrEqual(cardBounds.x)
    expect(bounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height)
    await page.locator('.seasons-board').screenshot({ path: `output/playwright/seasons-workers-${viewport.width}.png` })
  })
}
