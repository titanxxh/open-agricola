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
