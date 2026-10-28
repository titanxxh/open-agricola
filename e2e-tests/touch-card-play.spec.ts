import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import { GameSession } from '../server/game/authoritative-session'
import { BACKEND_URL } from './fixtures'

test.use({ hasTouch: true, viewport: { width: 375, height: 667 } })

const openGame = async (page: Page, request: APIRequestContext, configure: (state: GameState) => void) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1370, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const state = createInitialState(1370, { playerCount: 2 })
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  configure(state)
  const session = new GameSession(state)
  try {
    session.loadState(state)
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks })) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { session.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

const expectDialogFits = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: 'Card details' })
  await expect(dialog).toBeVisible()
  for (const control of [dialog.getByRole('button', { name: 'Close', exact: true }), dialog.getByRole('button', { name: 'Play this card' })]) {
    await expect(control).toBeInViewport({ ratio: 1 })
  }
  const size = await dialog.boundingBox()
  expect(size).not.toBeNull()
  expect(size!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 24)
  return dialog
}

test('touch occupation details preserve the hand position until explicit play', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.players[0]!.occupationHand = ['A116_WoodCutter', 'A124_Knapper']
  })
  await page.locator('[data-action-id="lessons"] button').first().tap()
  await expect(page.locator('[data-interaction-focus="occupation-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  const card = page.locator('.hand-cards [data-card-anchor="A116_WoodCutter"]')
  await card.scrollIntoViewIfNeeded()
  const scrollBefore = await page.evaluate(() => window.scrollY)
  let choiceCommands = 0
  page.on('request', req => { if (req.url().endsWith('/api/game/choice') && req.method() === 'POST') choiceCommands += 1 })
  await card.tap()
  const dialog = await expectDialogFits(page)
  await page.screenshot({ path: 'output/playwright/touch-card-details-occupation-375x667.png' })
  expect(choiceCommands).toBe(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  await card.tap()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.getByRole('dialog').getByRole('button', { name: 'Play this card' }).tap()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].occupationPlayed).toContain('A116_WoodCutter')
  expect(choiceCommands).toBe(1)
})

test('short landscape reads unavailable minor details and confirms a legal minor', async ({ page, request }) => {
  await page.setViewportSize({ width: 667, height: 320 })
  await openGame(page, request, state => {
    state.players[0]!.minorHand = ['A076_Cob', 'A007_GardenersKnife', 'D060_LargePottery']
    state.players[0]!.resources.food = 3
    state.players[0]!.resources.wood = 3
  })
  await page.locator('[data-action-id="meeting-place"] button').first().tap()
  await page.locator('.interaction-bar').getByRole('button', { name: /^Optional:/ }).tap()
  await expect(page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  await page.locator('.hand-cards [data-card-anchor="D060_LargePottery"]').tap()
  const unavailable = await expectDialogFits(page)
  await expect(unavailable.getByRole('button', { name: 'Play this card' })).toBeDisabled()
  await unavailable.getByRole('button', { name: 'Close', exact: true }).tap()
  await page.locator('.hand-cards [data-card-anchor="A076_Cob"]').tap()
  const dialog = await expectDialogFits(page)
  expect(await dialog.locator('.card-details__body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.screenshot({ path: 'output/playwright/touch-card-details-minor-667x320.png' })
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await dialog.getByRole('button', { name: 'Play this card' }).tap()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].minorPlayed).toContain('A076_Cob')
})

test('details opened before a delayed choice stay read-only until the card is reopened', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.players[0]!.minorHand = ['A076_Cob', 'A007_GardenersKnife', 'D060_LargePottery']
    state.players[0]!.resources.food = 3
    state.players[0]!.resources.wood = 3
  })
  await page.locator('[data-action-id="meeting-place"] button').first().tap()
  await page.route('**/api/game/choice', async route => {
    const response = await route.fetch()
    await page.getByRole('dialog', { name: 'Card details' }).waitFor({ state: 'visible' })
    await route.fulfill({ response })
  }, { times: 1 })
  await page.locator('.interaction-bar').getByRole('button', { name: /^Optional:/ }).tap()
  const card = page.locator('.hand-cards [data-card-anchor="D060_LargePottery"]')
  await card.tap()
  const dialog = page.getByRole('dialog', { name: 'Card details' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Play this card' })).toHaveCount(0)
  await expect(page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  await expect(dialog.getByRole('button', { name: 'Play this card' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
  await card.tap()
  await expect(dialog.getByRole('button', { name: 'Play this card' })).toBeDisabled()
})

test('touch major supply reads an unavailable card and plays only after confirmation', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.round = 4
    const prior = state.roundActionOrder.indexOf('major-improvement')
    ;[state.roundActionOrder[3], state.roundActionOrder[prior]] = [state.roundActionOrder[prior]!, state.roundActionOrder[3]!]
    state.players[0]!.resources.clay = 3
    state.players[0]!.resources.stone = 0
  })
  await page.locator('[data-action-id="major-improvement"] button').first().tap()
  const supply = page.locator('.major-improvements')
  await expect(supply).toHaveAttribute('data-interaction-focused', 'true')
  const expand = supply.getByRole('button', { name: /^Show major improvements/ })
  if (await expand.isVisible()) await expand.tap()
  await supply.locator('[data-card-anchor="Major_Well"]').tap()
  const unavailable = await expectDialogFits(page)
  await expect(unavailable.getByRole('button', { name: 'Play this card' })).toBeDisabled()
  await unavailable.getByRole('button', { name: 'Close', exact: true }).tap()
  await supply.locator('[data-card-anchor="Major_Fireplace1"]').tap()
  const dialog = await expectDialogFits(page)
  await page.screenshot({ path: 'output/playwright/touch-card-details-major-375x667.png' })
  const before = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expect(before.state.players[0].improvements).not.toContain('Major_Fireplace1')
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await dialog.getByRole('button', { name: 'Play this card' }).tap()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].improvements).toContain('Major_Fireplace1')
})

test('a failed transport submission can retry the same live card request', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.players[0]!.occupationHand = ['A116_WoodCutter', 'A124_Knapper']
  })
  await page.locator('[data-action-id="lessons"] button').first().tap()
  await expect(page.locator('[data-interaction-focus="occupation-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  await page.locator('.hand-cards [data-card-anchor="A116_WoodCutter"]').tap()
  const play = page.getByRole('dialog', { name: 'Card details' }).getByRole('button', { name: 'Play this card' })
  await page.route('**/api/game/choice', route => route.abort('failed'), { times: 1 })
  const failed = page.waitForEvent('requestfailed', req => req.url().endsWith('/api/game/choice'))
  await play.tap()
  await failed
  await expect(play).toBeEnabled()
  const before = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expect(before.state.players[0].occupationPlayed).not.toContain('A116_WoodCutter')
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await play.tap()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].occupationPlayed).toContain('A116_WoodCutter')
})

test.describe('iPad without container units or CSS length division', () => {
  test.beforeEach(async ({ page }) => {
    // Reproduce Safari 15's rejected declarations, rather than changing its user agent.
    await page.route(/\/client\/.*\.css(?:\?|$)/, async route => {
      const response = await route.fetch()
      const source = await response.text()
      await route.fulfill({ response, body: source
        .replace(/(\d+(?:\.\d+)?)cq([iw])\b/g, '$1unsupportedcq$2')
        .replace(/container-type:\s*inline-size/g, 'container-type: normal') })
    })
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS)
      CSS.supports = (property: string, value?: string) => {
        if (/container-type|cq[wi]\b/.test(`${property} ${value ?? ''}`)) return false
        return value === undefined ? supports(property) : supports(property, value)
      }
    })
  })

  for (const portrait of [{ width: 744, height: 1133 }, { width: 768, height: 1024 }]) {
    test(`cards fit their slots through rotation at ${portrait.width}px`, async ({ page, request }) => {
      await page.setViewportSize(portrait)
      await openGame(page, request, state => {
        state.players[0]!.occupationHand = ['A116_WoodCutter', 'A124_Knapper', 'A126_MasterWorkman']
        state.players[0]!.minorHand = ['A076_Cob', 'A007_GardenersKnife']
        state.players[0]!.occupationPlayed = ['A119_FirewoodCollector', 'C105_BasketCarrier']
      })
      for (const viewport of [portrait, { width: portrait.height, height: portrait.width }, portrait]) {
        await page.setViewportSize(viewport)
        const cards = page.locator('.hand-cards .player-card, .played-cards .player-card')
        await expect(cards).toHaveCount(7)
        await expect.poll(() => cards.evaluateAll(elements => elements.every(element => {
          const inner = element.querySelector('.player-card-inner')
          if (!inner) return false
          const slot = element.getBoundingClientRect()
          const face = inner.getBoundingClientRect()
          return Math.abs(face.width - element.clientWidth) <= 1 &&
            face.right <= slot.right + 1 && face.bottom <= slot.bottom + 1
        }))).toBe(true)
        const hand = page.locator('.hand-cards [data-card-anchor="A116_WoodCutter"]')
        await hand.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `output/playwright/legacy-ipad-cards-${viewport.width}.png` })
        await hand.tap()
        const details = page.getByRole('dialog', { name: 'Card details' })
        await expect(details).toBeVisible()
        await expect(details.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 })
        await details.getByRole('button', { name: 'Close', exact: true }).tap()
        const action = page.locator('[data-action-id="farmland"] button').first()
        await action.scrollIntoViewIfNeeded()
        await expect(action).toBeInViewport({ ratio: 0.99 })
        await expect(action).toBeEnabled()
      }
      await page.locator('[data-action-id="lessons"] button').first().tap()
      await page.locator('.hand-cards [data-card-anchor="A116_WoodCutter"]').tap()
      const dialog = await expectDialogFits(page)
      const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
      await dialog.getByRole('button', { name: 'Play this card' }).tap()
      const result = await (await committed).json()
      expect(result.ok, JSON.stringify(result)).toBe(true)
      expect(result.state.players[0].occupationPlayed).toContain('A116_WoodCutter')
    })
  }

  test('the action board opens a usable farm selection without container units', async ({ page, request }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await openGame(page, request, () => {})
    const action = page.locator('[data-action-id="farmland"] button').first()
    await action.scrollIntoViewIfNeeded()
    await action.tap()
    await expect(page.locator('.interaction-bar__body')).toContainText('Select a tile to plow')
    const farm = page.locator('.game-layout__center .farm-grid')
    await expect.poll(() => farm.locator('.farm-tile').first().evaluate(element => element.getBoundingClientRect().width))
      .toBeGreaterThanOrEqual(36)
    await farm.locator('.farm-tile.selectable').first().tap()
    await page.getByRole('button', { name: 'Confirm plow', exact: true }).last().tap()
    await expect(farm.locator('.farm-tile.field')).toHaveCount(1)
    const result = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(result.state.players[0].fields).toHaveLength(1)
    await page.screenshot({ path: 'output/playwright/legacy-ipad-plow-768.png' })
  })
})
