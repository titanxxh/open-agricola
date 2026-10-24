import { expect, test } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test.use({ hasTouch: true })

const playerNames = ['春天的农夫', '夏日麦田', 'AutumnFarmer2026', '冬天四号玩家']

for (const viewport of [
  { width: 393, height: 800 },
  { width: 402, height: 714 },
  { width: 414, height: 800 },
  { width: 440, height: 796 },
  { width: 1920, height: 1080 },
]) {
  test(`four-player scoring keeps every name and score column on screen at ${viewport.width}px`, async ({ page, request }) => {
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
      seed: 1001, playerCount: 4, customCardIds: [],
    })).ok).toBe(true)
    const { state }: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    expect(state.players).toHaveLength(4)
    state.players.forEach((player, index) => {
      player.name = playerNames[index]!
      player.nameIsDefault = false
      player.occupationHand = ['__test_placeholder__']
      player.minorHand = ['__test_placeholder__']
      player.stats.resourcesFromBoard = { wood: 12 + index, clay: 11, reed: 10, stone: 9, food: 88, grain: 7, vegetable: 6 }
    })
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.setViewportSize(viewport)
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await page.locator('.game-layout__right').getByRole('button', { name: '计分板', exact: true }).click()
    const pad = page.locator('.scoring-pad')
    await expect(page.locator('.scoring-overlay')).toHaveCSS('opacity', '1')
    const content = pad.locator('.scoring-content')
    const names = pad.locator('.scoring-header-row .scoring-player-name')
    await expect(names).toHaveText(playerNames)
    await pad.screenshot({ path: `output/playwright/scoring-four-players-${viewport.width}.png` })
    for (const name of await names.all()) {
      await expect(name).toBeInViewport({ ratio: 1 })
      expect(await name.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      expect(await name.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
    }
    expect(await content.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    for (const row of await pad.locator('.scoring-row').all()) {
      await expect(row.locator('.scoring-cell')).toHaveCount(5)
    }
    if (viewport.width <= 1100) {
      await content.evaluate(element => { element.scrollTop = element.scrollHeight })
      expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      for (const name of await names.all()) await expect(name).toBeInViewport({ ratio: 1 })
    }
    await pad.getByRole('button', { name: '统计', exact: true }).click()
    await expect(names).toHaveText(playerNames)
    for (const name of await names.all()) await expect(name).toBeInViewport({ ratio: 1 })
    expect(await content.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    const resourceCells = pad.locator('.scoring-cell-resources')
    await expect(resourceCells).toHaveCount(4)
    for (const [index, cell] of (await resourceCells.all()).entries()) {
      await expect(cell.locator('[data-resource="wood"]')).toHaveAttribute('data-amount', String(12 + index))
      expect(await cell.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    }
    await pad.screenshot({ path: `output/playwright/scoring-stats-four-players-${viewport.width}.png` })
    await pad.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(pad).toHaveCount(0)
  })
}
