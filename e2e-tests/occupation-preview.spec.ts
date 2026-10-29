import { expect, test } from '@playwright/test'
import type { SerializedGameState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'en', width: 375 }]) {
  for (const count of [2, 3]) {
    test(`occupation offer uses ${count === 3 ? 'a summary' : 'the shared payment'} for ${count} cards in ${scenario.locale} at ${scenario.width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width: scenario.width, height: 900 })
      await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
      const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1373, playerCount: 2, customCardIds: [] } })
      expect(fresh.ok()).toBe(true)
      const { state }: { state: SerializedGameState } = await fresh.json()
      for (const player of state.players) {
        player.occupationHand = ['__test_placeholder__']
        player.minorHand = ['__test_placeholder__']
      }
      const cards = ['A123_FrameBuilder', 'B121_Geologist', 'A124_Knapper'].slice(0, count)
      state.players[0]!.occupationHand = cards
      state.players[0]!.minorPlayed = ['B028_ForestryStudies']
      state.players[0]!.resources.wood = 0
      state.players[0]!.resources.food = 5
      const loaded = await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })
      expect(loaded.ok(), await loaded.text()).toBe(true)
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      await page.locator('[data-action-id="forest"] button').first().click()
      const bar = page.locator('.interaction-bar')
      const offer = bar.locator('[data-choice-value]:not([data-choice-value="__skip__"])')
      await expect(offer).toHaveCount(1)
      const free = 'Free'
      if (count === 3) {
        await expect(offer).toContainText('Play occupation')
        await expect(offer).not.toContainText(free)
      } else {
        await expect(offer).toContainText(free)
      }
      await page.screenshot({ path: `output/playwright/occupation-offer-${count}-${scenario.locale}.png`, fullPage: true })
      await offer.click()
      for (const id of cards) await expect(bar.locator(`[data-choice-value="${id}"]`)).toBeEnabled()
      await bar.locator(`[data-choice-value="${cards[count - 1]}"]`).click()
      await expect(page.locator(`.played-cards [data-card-anchor="${cards[count - 1]}"]`)).toBeVisible()
    })
  }
}
