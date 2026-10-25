import { expect, test, type APIRequestContext } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test.use({ hasTouch: true })

async function prepareExpansions(request: APIRequestContext) {
  expect((await postJson(request, `${BACKEND_URL}/api/game/new`, {
    seed: 931, maxPlayers: 2, enableParentCards: true, enableThroughTheSeasons: true,
    enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })).ok).toBe(true)
  const { state }: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.parentSelection = null
  for (const player of state.players) {
    player.parentCards = { mother: 'PR01', father: 'PS01' }
    player.minorHand = ['B057_Scullery', 'C066_EternalRyeCultivation', 'D073_SupplyBoat', 'A075_LumberMill']
    player.occupationHand = ['E111_Recluse', 'A126_MasterWorkman', 'C105_BasketCarrier', 'A119_FirewoodCollector']
    player.occupationPlayed = ['D106_WhiskyDistiller', 'B100_Clutterer', 'C146_WorkshopAssistant', 'C120_AgriculturalLabourer']
    player.cardStates.PS01 = { extraData: { fatherCompletedTier: 2 }, infobox: 'Completed' }
  }
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
}

for (const width of [320, 390, 768, 1920]) {
  test(`expansion boards and completed parents stay readable at ${width}px`, async ({ page, request }) => {
    await prepareExpansions(request)
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.seasons-board__map')).toBeVisible()
    const moor = page.locator('.board-special-actions')
    await expect(moor.locator('[data-action-id="moor-infirmary"]')).toBeVisible()
    await expect(moor.locator('[data-action-id="moor-resource-market-12"]')).toBeVisible()
    await expect(moor.locator('.special-action-card')).toHaveCount(2)
    const icons = moor.locator('.special-action-card__action-icon')
    await expect(icons).toHaveCount(7)
    for (const icon of await icons.all()) {
      expect(await icon.evaluate(async element => {
        const image = new Image()
        image.src = getComputedStyle(element).backgroundImage.slice(5, -2)
        await image.decode()
        return image.naturalWidth > 0 && element.getBoundingClientRect().width >= 24
      })).toBe(true)
    }
    const father = page.locator('.game-layout__center .parent-card-face--father')
    const completed = father.locator('.parent-card-infobox')
    await expect(completed).toHaveText('已完成')
    expect(await completed.evaluate(element => getComputedStyle(element).position)).toBe('static')
    await expect(father.locator('.is-completed')).toHaveCount(2)
    expect(await father.locator('.is-completed').first().evaluate(element => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700)
    await moor.screenshot({ path: `output/playwright/moor-board-${width}.png` })
    await father.screenshot({ path: `output/playwright/parent-completed-${width}.png` })

    if (width <= 1100) {
      const players = page.locator('.game-layout__players .desktop-player-overview__player')
      await expect(players).toHaveCount(2)
      const boxes = await players.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
      expect(boxes[0]).toBeCloseTo(boxes[1]!, 0)
      await expect(page.locator('.desktop-public-farms .hand-cards')).toHaveCount(0)
      await expect(page.locator('.desktop-public-farm[data-player-id="p2"] .farm-grid')).toBeVisible()
      const played = page.locator('.game-layout__center .played-row .player-card').first()
      const card = await played.boundingBox()
      expect(card!.width).toBeGreaterThanOrEqual(60)
      expect(card!.height).toBeCloseTo(card!.width, 0)
      expect(await played.ariaSnapshot()).toContain('将当前轮次数加2')
      await played.tap()
      await expect(page.locator('.card-hover-preview')).toHaveCount(0)
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(played).toBeFocused()
      await expect(page.locator('.card-hover-preview')).toHaveCount(1)
      await expect(page.locator('.card-hover-preview .card-desc')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.card-hover-preview')).toHaveCount(0)
      await played.evaluate(element => element.blur())
      const hand = page.locator('.game-layout__center .hand-row .player-card').first()
      expect((await hand.boundingBox())!.width).toBeGreaterThanOrEqual(65)
      await expect(page.locator('.action-log')).toBeVisible()
      const log = await page.locator('.game-layout__right').boundingBox()
      const farms = await page.locator('.desktop-public-farms').boundingBox()
      expect(log!.y).toBeGreaterThanOrEqual(farms!.y + farms!.height)
      await expect(page.locator('.scoring-pad')).toHaveCount(0)
      await page.locator('.game-layout__right').getByRole('button', { name: '计分板', exact: true }).click()
      await expect(page.locator('.scoring-pad')).toBeVisible()
      await page.locator('.scoring-pad').getByRole('button', { name: '关闭', exact: true }).click()
      await page.locator('.game-layout').screenshot({ path: `output/playwright/mobile-table-${width}.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await played.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50 })
      await expect(page.locator('.card-hover-preview .card-desc')).toBeVisible()
      await played.dispatchEvent('pointerup', { pointerType: 'touch' })
      await page.mouse.click(1, 1)
      await expect(page.locator('.card-hover-preview')).toHaveCount(0)
    }
    await moor.locator('[data-action-id="moor-infirmary"] button').click()
    await expect.poll(async () => {
      const result: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
      return result.state.actionSpaces.find(space => space.id === 'moor-infirmary')?.takenBy.map(worker => worker.playerId)
    }).toEqual(['p1'])
  })
}
