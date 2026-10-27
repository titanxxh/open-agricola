import { expect, test } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const device of [
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, locale: 'zh' },
  { name: 'mobile', viewport: { width: 393, height: 800 }, locale: 'en' },
]) {
  test.describe(device.name, () => {
    test.use({ viewport: device.viewport, hasTouch: device.name === 'mobile' })

    test('scoring includes every crop in supply, farmyard fields and card fields', async ({ page, request }) => {
      expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
        seed: 1001, playerCount: 2, customCardIds: [],
      })).ok).toBe(true)
      const { state }: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.resources.grain = 0
        player.resources.vegetable = 0
      }
      const owner = state.players[0]!
      owner.resources.grain = 3
      owner.resources.vegetable = 1
      owner.fields = [
        { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
        { row: 1, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ]
      owner.minorPlayed = ['B068_Beanfield']
      owner.occupationPlayed = ['B113_PatchCaregiver']
      owner.cardStates = {
        B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } },
        B113_PatchCaregiver: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] } },
      }
      const opponent = state.players[1]!
      opponent.resources.grain = 1
      opponent.fields = [2, 3, 1, 1].map((remaining, col) => ({
        row: 1, col, stacks: [{ kind: 'grain', remaining }],
      }))
      expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)

      await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), device.locale)
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      await page.locator('.game-layout__right').getByRole('button', {
        name: device.locale === 'zh' ? '计分板' : 'Scoring Pad', exact: true,
      }).click()

      const pad = page.locator('.scoring-pad')
      await expect(page.locator('.scoring-overlay')).toHaveCSS('opacity', '1')
      const grainLabel = device.locale === 'zh' ? '谷物' : 'Grain'
      const vegetableLabel = device.locale === 'zh' ? '蔬菜' : 'Vegetables'
      const grainRow = pad.locator('.scoring-row').filter({
        has: page.locator('.scoring-label').getByText(grainLabel, { exact: true }),
      })
      const vegetableRow = pad.locator('.scoring-row').filter({
        has: page.locator('.scoring-label').getByText(vegetableLabel, { exact: true }),
      })
      await expect(grainRow.locator('.scoring-cell-detail')).toHaveText(['8', '8'])
      await expect(grainRow.locator('.scoring-cell-value')).toHaveText(['+4', '+4'])
      await expect(vegetableRow.locator('.scoring-cell-detail')).toHaveText(['4', '0'])
      await expect(vegetableRow.locator('.scoring-cell-value')).toHaveText(['+4', '-1'])
      await pad.screenshot({ path: `output/playwright/crop-scoring-${device.name}.png` })
    })
  })
}
