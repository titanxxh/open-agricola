import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import { GameSession, type SessionResponse } from '../server/game/authoritative-session'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL } from './fixtures'

const openOccupationScenario = async (page: Page, request: APIRequestContext, configure?: (state: GameState) => void) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1367, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok()).toBe(true)
  const state = createInitialState(1367, { playerCount: 2 })
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  state.players[0]!.occupationHand = ['A116_WoodCutter', 'A124_Knapper']
  configure?.(state)
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

test('a card-granted occupation hand selection focuses the hand and retains whole-selection confirmation', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openOccupationScenario(page, request, state => {
    state.players[0]!.occupationHand.push('A125_Priest')
    state.players[0]!.minorHand = ['A003_PaperKnife']
    state.players[0]!.resources.wood = 1
  })
  const placed = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
  await page.locator('[data-action-id="meeting-place"] button').first().click()
  let response: SessionResponse = await (await placed).json()
  for (let step = 0; step < 3; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected a pending card action')
    const pending = response.interaction.request
    if (pending.kind === 'selection' && pending.selection.kind === 'occupation-hand') break
    const option = 'options' in pending && pending.options?.find(option =>
      option.value === 'A003_PaperKnife' || option.value.startsWith('action-improvement-'))
    if (!option) throw new Error(`Expected Paper Knife purchase, received ${JSON.stringify(pending)}`)
    const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    await page.locator('.interaction-bar').locator(`[data-choice-value="${option.value}"]`).click()
    response = await (await committed).json()
  }
  const hand = page.locator('[data-interaction-focus="occupation-hand"][data-focus-player="p1"]')
  await expect(hand).toHaveAttribute('data-interaction-focused', 'true')
  const confirm = hand.getByTestId('occupation-hand-confirm')
  await expect(confirm).toBeDisabled()
  for (const id of ['A116_WoodCutter', 'A124_Knapper', 'A125_Priest']) {
    await hand.locator(`[data-card-anchor="${id}"]`).click()
  }
  await expect(confirm).toBeEnabled()
  const selected = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await confirm.click()
  const continuation: SessionResponse = await (await selected).json()
  expect(continuation.ok, continuation.error).toBe(true)
  expect(continuation.state.players[0]!.occupationPlayed).toHaveLength(0)
  await expect(page.locator('[data-interaction-focus="actions"]')).not.toHaveAttribute('data-interaction-focused', 'true')
  if (continuation.interaction.stateId !== 'wait' || !('options' in continuation.interaction.request)) {
    throw new Error('Expected the revealed occupation confirmation')
  }
  const accept = continuation.interaction.request.options?.find(option => option.value !== '__skip__')
  if (!accept) throw new Error('Expected an occupation to accept')
  await page.locator('.interaction-bar').locator(`[data-choice-value="${accept.value}"]`).click()
  await expect(page.locator('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true')
})

for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`occupation focus reveals the hand above fixed controls and returns after completion at ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await openOccupationScenario(page, request)
    await page.locator('[data-action-id="lessons"] button').first().click()
    const hand = page.locator('[data-interaction-focus="occupation-hand"][data-focus-player="p1"]')
    await expect(hand).toHaveAttribute('data-interaction-focused', 'true')
    const geometry = () => hand.evaluate(element => {
      const title = element.querySelector('.hand-section-title')!.getBoundingClientRect()
      const card = element.querySelector('.player-card.selectable')!.getBoundingClientRect()
      const bar = document.querySelector('.interaction-bar')!.getBoundingClientRect()
      return { title: title.top, cardBottom: card.bottom, barTop: bar.top }
    })
    await expect.poll(async () => {
      const bounds = await geometry()
      return bounds.title >= 0 && bounds.cardBottom <= bounds.barTop
    }).toBe(true)

    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.getByRole('button', { name: 'Return to current action' }).click()
    await expect.poll(async () => {
      const bounds = await geometry()
      return bounds.title >= 0 && bounds.cardBottom <= bounds.barTop
    }).toBe(true)
    await hand.locator('[data-card-anchor="A116_WoodCutter"]').click()
    const play = page.getByRole('button', { name: /Play this card|打出此牌/ })
    if (await play.isVisible()) await play.click()
    await expect(page.locator('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true')
    await expect.poll(() => page.locator('[data-interaction-focus="actions"]').evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0)
    await page.screenshot({ path: `output/playwright/interaction-focus-${viewport.width}x${viewport.height}.png` })
  })
}
