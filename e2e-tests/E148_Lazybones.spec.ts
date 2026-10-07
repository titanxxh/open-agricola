import { expect, test } from '@playwright/test'
import type { SerializedGameState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD_ID = 'E148_Lazybones'

for (const scenario of [
  { locale: 'en', width: 1440, confirm: 'Confirm (2/2)', grain: 'Grain Seeds', farmland: 'Farmland' },
  { locale: 'zh', width: 390, confirm: '确认 (2/2)', grain: '谷物种子', farmland: '农田' },
] as const) {
  test(`Lazybones shows four selectable tiles at ${scenario.width}px in ${scenario.locale}`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 8148, playerCount: 2, customCardIds: [], deckIds: ['A', 'B', 'C', 'D', 'E'] },
    })
    expect(fresh.ok()).toBe(true)
    const { state } = await fresh.json() as { state: SerializedGameState }
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.players[0]!.occupationHand = [CARD_ID]
    state.players[0]!.resources.food = 5
    state.players[0]!.supplyTokensConsumed = { stable: 2 }
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })
    expect(loaded.ok()).toBe(true)

    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    await page.locator('[data-action-id="lessons"] button').first().click()
    const panel = page.locator('.choice-multi-select')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('checkbox')).toHaveCount(4)
    const grain = panel.getByRole('checkbox', { name: scenario.grain, exact: true })
    const farmland = panel.getByRole('checkbox', { name: scenario.farmland, exact: true })
    await grain.check()
    await farmland.check()
    await expect(panel.getByRole('checkbox', { checked: false }).first()).toBeDisabled()
    await grain.uncheck()
    await expect(panel.getByRole('checkbox', { checked: false }).first()).toBeEnabled()
    await grain.check()
    await expect(panel.getByRole('button', { name: scenario.confirm, exact: true })).toBeEnabled()
    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(scenario.width)
    await page.screenshot({ path: `output/playwright/lazybones-${scenario.locale}-${scenario.width}.png` })
    const committed = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
    await panel.getByRole('button', { name: scenario.confirm, exact: true }).click()
    expect((await committed).ok()).toBe(true)
    await expect(panel).toBeHidden()
  })
}
