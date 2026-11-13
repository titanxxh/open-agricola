// @covers client/app/ client/components/board/ client/styles/pages/
import { expect, test, type APIRequestContext } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { BACKEND_URL, getJson, postJson } from './fixtures'

async function prepareTable(request: APIRequestContext, playerCount = 2, expansions = true) {
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
    seed: 42, playerCount, customCardIds: [], enableThroughTheSeasons: expansions,
    enableFarmersOfTheMoor: expansions, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })).ok).toBe(true)
  const response: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  const state = playerCount === 1 ? createInitialState(42, { playerCount: 1 }) : response.state
  expect(state.players).toHaveLength(playerCount)
  for (const player of state.players) {
    player.occupationHand = ['A102_Grocer']
    player.minorHand = ['B057_Scullery']
  }
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
}

for (const width of [1920, 390]) {
  test(`section shortcuts keep titles and page content clear of fixed controls at ${width}px`, async ({ page, request }, testInfo) => {
    await prepareTable(request)
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const nav = page.locator('.section-nav')
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button')).toHaveText([
      'Hand Cards', 'Player Farm', 'Public farms', 'Seasons Board', 'Special Actions', 'Major Improvements',
    ])
    const focusedBefore = await page.locator('[data-interaction-focused]').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-interaction-focus')))
    await expect(page.locator('[data-hand-anchor]')).toHaveCount(1)
    await expect(page.locator('[data-hand-anchor="p1"] h3')).toHaveText('Hand Cards')
    await expect(page.locator('.desktop-public-farms [data-hand-anchor]')).toHaveCount(0)

    for (const [name, selector] of [
      ['Hand Cards', '[data-section-target="hand"] h3'],
      ['Player Farm', '[data-section-target="farm"]'],
      ['Seasons Board', '[data-section-target="seasons"]'],
      ['Special Actions', '[data-section-target="moor"]'],
      ['Major Improvements', '[data-section-target="major-supply"] h2'],
      ['Public farms', '[data-section-target="public-farms"] > h2'],
    ]) {
      await nav.getByRole('button', { name, exact: true }).click()
      await expect.poll(() => page.locator(selector).evaluate(node => {
        const bounds = node.getBoundingClientRect()
        const header = document.querySelector('.header-compact')!.getBoundingClientRect()
        const dock = document.querySelector('.section-nav')!.getBoundingClientRect()
        return bounds.top >= Math.max(0, header.bottom) && bounds.top < dock.top
      }), { message: `${name} title must land between the sticky header and shortcut dock` }).toBe(true)
    }
    await expect(page.locator('.game-layout__center [data-interaction-focus="farm"]')).toHaveAttribute('data-focus-player', 'p1')
    expect(await page.locator('[data-interaction-focused]').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-interaction-focus')))).toEqual(focusedBefore)

    const first = nav.getByRole('button', { name: 'Hand Cards', exact: true })
    const last = nav.getByRole('button', { name: 'Major Improvements', exact: true })
    await first.evaluate(node => node.focus({ preventScroll: true }))
    const scrollY = await page.evaluate(() => window.scrollY)
    await first.press('End')
    await expect(last).toBeFocused()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    if (width === 390) expect(await nav.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
    await last.press('Home')
    await expect(first).toBeFocused()

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => {
      const content = document.querySelector('.game-layout')!.getBoundingClientRect()
      const dock = document.querySelector('.section-nav')!.getBoundingClientRect()
      return dock.top - content.bottom
    })).toBeGreaterThanOrEqual(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`section-shortcuts-${width}.png`) })
  })
}

test('solo shortcuts omit public farms and disabled expansion boards', async ({ page, request }) => {
  await prepareTable(request, 1, false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.section-nav').getByRole('button')).toHaveText(['Hand Cards', 'Player Farm', 'Major Improvements'])
  await expect(page.locator('[data-section-target="seasons"], [data-section-target="moor"]')).toHaveCount(0)
})
