// @covers client/app/ client/components/board/ client/styles/pages/
import { expect, test, type APIRequestContext } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { BACKEND_URL, FRONTEND_URL, finishHotseatOpening, getJson, postJson } from './fixtures'
import { authenticateSolo } from './helpers/standard-solo-acceptance'

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
    expect(await nav.evaluate(node => {
      const dock = node.getBoundingClientRect()
      return node.scrollWidth <= node.clientWidth && Array.from(node.querySelectorAll('button')).every(button => {
        const bounds = button.getBoundingClientRect()
        return bounds.left >= dock.left && bounds.right <= dock.right
      })
    }), 'every shortcut must be fully visible without scrolling the dock').toBe(true)
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

test('narrow shortcuts wrap beside the report trigger and the major supply shares the hand columns', async ({ browser, request }, testInfo) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  try {
    await authenticateSolo(context, request, `section_nav_${Date.now().toString(36)}`)
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    // Reports are disabled in the test environment; only the trigger's presence matters for this layout.
    await context.route('**/api/v1/issue-submission-connection**', route =>
      route.fulfill({ json: { ok: true, enabled: true, connected: false } }))
    const page = await context.newPage()
    await page.goto(`${FRONTEND_URL}/?transport=ws&hotseat=1&maxPlayers=2&enableThroughTheSeasons=true&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true`)
    await expect(page).toHaveURL(/\?room=[^&]+/)
    await finishHotseatOpening(page)
    const nav = page.locator('.section-nav')
    await expect(nav.getByRole('button')).toHaveText(['手牌', '玩家农场', '公开农场', '四季版图', '特殊行动', '主要改良'])
    await expect(page.getByRole('button', { name: '报告问题', exact: true })).toBeVisible()
    const dock = await nav.evaluate(node => {
      const bounds = node.getBoundingClientRect()
      const trigger = document.querySelector('.bug-report-trigger')!.getBoundingClientRect()
      const buttons = Array.from(node.querySelectorAll('button'), button => button.getBoundingClientRect())
      return {
        gap: trigger.left - bounds.right,
        rows: new Set(buttons.map(button => Math.round(button.top))).size,
        contained: node.scrollWidth <= node.clientWidth
          && buttons.every(button => button.left >= bounds.left && button.right <= bounds.right),
      }
    })
    expect(dock.gap).toBeGreaterThanOrEqual(8)
    expect(dock).toMatchObject({ rows: 2, contained: true })
    await page.screenshot({ path: testInfo.outputPath('section-shortcuts-360-zh.png') })

    await nav.getByRole('button', { name: '主要改良', exact: true }).click()
    const toggle = page.locator('.major-supply-toggle')
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    const majors = page.locator('.major-row > .major-card-wrapper')
    await expect(majors.nth(3)).toBeVisible()
    const layout = await page.locator('.major-row').evaluate(row => {
      const cards = Array.from(row.children, card => card.getBoundingClientRect())
      return {
        firstRow: cards.filter(card => Math.round(card.top) === Math.round(cards[0]!.top)).length,
        overflow: row.scrollWidth - row.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      }
    })
    expect(layout).toEqual({ firstRow: 3, overflow: 0, pageOverflow: 0 })
    await page.locator('.major-improvements').screenshot({ path: testInfo.outputPath('major-supply-360-zh.png') })
  } finally { await context.close() }
})
