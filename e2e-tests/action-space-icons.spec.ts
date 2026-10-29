import { expect, test } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const scenario of [
  { locale: 'en', width: 1440, playerCount: 2 },
  { locale: 'en', width: 1440, playerCount: 3 },
  { locale: 'en', width: 1440, playerCount: 4 },
  { locale: 'en', width: 1440, playerCount: 5 },
  // Six players also exercises the extra action frames at phone width.
  { locale: 'en', width: 390, playerCount: 6 },
] as const) {
  test(`${scenario.playerCount}p action symbols and rule-derived costs in ${scenario.locale} at ${scenario.width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
      seed: 6069, playerCount: scenario.playerCount, customCardIds: [],
    })).ok).toBe(true)
    const { state }: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const board = page.locator('.action-board')
    await expect(board).toBeVisible()
    for (const [id, icons] of [
      ['farmland', ['field']],
      ['meeting-place', ['first', 'minor']],
      ['lessons', ['occupation']],
      ['farm-expansion', ['room-wood', 'room-clay', 'room-stone', 'barn']],
      ['fencing', ['fence-icon']],
      ['grain-utilization', ['sow', 'bread']],
      ['major-improvement', ['major', 'minor']],
      ['cultivation', ['field', 'sow']],
      ['wish-children', ['child', 'minor']],
      ['urgent-wish-children', ['child-free']],
      ['house-redevelopment', ['upgrade', 'major', 'minor']],
      ['farm-redevelopment', ['upgrade', 'fence-icon']],
    ] as const) {
      const description = board.locator(`[data-action-id="${id}"] .action-desc`)
      for (const icon of icons) await expect(description.locator(`.res-icon-${icon}`)).toHaveCount(1)
      expect(await description.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1), id).toBe(true)
    }
    const construction = board.locator('[data-action-id="farm-expansion"] .action-desc')
    await expect(construction.locator('[data-resource="wood"][data-amount="5"]')).toHaveCount(1)
    await expect(construction.locator('[data-resource="reed"][data-amount="2"]')).toHaveCount(3)
    await expect(construction.locator('[data-resource="wood"][data-amount="2"]')).toHaveCount(1)
    if (scenario.playerCount === 6) {
      await expect(board.locator('[data-action-id="side-job-6"] .res-icon-barn')).toHaveCount(1)
      await expect(board.locator('[data-action-id="side-job-6"] .res-icon-bread')).toHaveCount(1)
      await expect(board.locator('[data-action-id="improvement-6"] .res-icon-minor')).toHaveCount(2)
    }
    const overflowingCards = await board.locator('.action-card:has(.action-icon-description)').evaluateAll(cards => cards
      .filter(card => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1)
      .map(card => ({ id: card.closest('[data-action-id]')?.getAttribute('data-action-id'),
        width: card.clientWidth, scrollWidth: card.scrollWidth, height: card.clientHeight, scrollHeight: card.scrollHeight,
        description: card.querySelector('.action-desc')?.clientHeight, content: card.querySelector('.action-icon-description')?.clientHeight,
      })))
    await page.locator('.actions').screenshot({ path: `output/playwright/action-space-icons-${scenario.playerCount}p-${scenario.locale}.png` })
    expect(overflowingCards).toEqual([])
    const artworkLoaded = await board.locator('.res-icon-field').first().evaluate(async element => {
      const image = new Image()
      image.src = getComputedStyle(element).backgroundImage.slice(5, -2)
      await image.decode()
      return image.naturalWidth > 0
    })
    expect(artworkLoaded).toBe(true)
    if (scenario.width > 1000) {
      await board.locator('[data-action-id="fencing"]').hover()
      await expect(page.locator('.tooltip-action-card .res-icon-fence-icon')).toBeVisible()
      await expect(page.locator('.round-action-tooltip .tooltip-text')).toContainText('Choose fence layout')
    }
  })
}
