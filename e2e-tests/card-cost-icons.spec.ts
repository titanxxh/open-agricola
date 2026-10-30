import { expect, test } from '@playwright/test'
import { BACKEND_URL, getJson, postJson } from './fixtures'

const costs = [
  ['A009_YoungAnimalMarket', [['sheep', 1]]],
  ['D009_GameTrade', [['sheep', 2]]],
  ['E021_SheepRug', [['sheep', 1]]],
  ['M032_PeatHut', [['reed', 2], ['fuel', 5]]],
  ['M059_NaturesFertilizer', [['vegetable', 2], ['boar', 1]]],
  ['M073_StockBreedingPrize', [['sheep', 1]]],
  ['M108_GrainDistillery', [['stone', 2], ['sheep', 1]]],
] as const

for (const locale of ['en', 'zh'] as const) {
  for (const width of [1280, 390]) {
    test(`${locale} printed animal and fuel costs at ${width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
      expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
        seed: 1370, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true,
        allowIncompleteFarmersOfTheMoorMinorDeal: true,
      })).ok).toBe(true)
      const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
      for (const player of state.players) {
        player.occupationHand = ['__test_placeholder__']
        player.minorHand = ['__test_placeholder__']
      }
      state.players[0].minorHand = [...costs.map(([id]) => id), 'D080_BrickHammer']
      expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      await expect(page.locator('.game-layout')).toBeVisible()
      for (const [id, expected] of costs) {
        const cost = page.locator(`.hand-cards [data-id="${id}"] .card-cost`)
        await cost.scrollIntoViewIfNeeded()
        await expect(cost.locator('.card-cost-item')).toHaveCount(expected.length)
        for (const [resource, amount] of expected) {
          const icon = cost.locator(`.res-icon-${resource}`)
          await expect(icon).toBeVisible()
          await expect(icon.locator('..')).toHaveText(String(amount))
          const rendered = await icon.evaluate(async element => {
            const style = getComputedStyle(element)
            const image = new Image()
            image.src = style.backgroundImage.slice(5, -2)
            await image.decode()
            const box = element.getBoundingClientRect()
            return { width: box.width, height: box.height, imageWidth: image.naturalWidth }
          })
          expect(rendered.width).toBeGreaterThan(0)
          expect(rendered.height).toBeGreaterThan(0)
          expect(rendered.imageWidth).toBeGreaterThan(0)
        }
      }
      const alternatives = page.locator('.hand-cards [data-id="D080_BrickHammer"] .card-cost-alt')
      await expect(alternatives.locator('.card-cost-separator')).toHaveCount(1)
      await expect(alternatives.locator('.res-icon')).toHaveCount(2)
      await page.locator('.hand-cards [data-card-anchor="M032_PeatHut"]').screenshot({
        path: `output/playwright/card-cost-M032-${locale}-${width}.png`,
      })
    })
  }
}
