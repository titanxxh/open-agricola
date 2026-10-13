import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import { GameSession } from '../server/game/authoritative-session'
import { BACKEND_URL } from './fixtures'

const openScenario = async (page: Page, request: APIRequestContext, configure: (state: GameState) => void) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 9707, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const state = createInitialState(9707, { playerCount: 2 })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  configure(state)
  const session = new GameSession(state)
  try {
    session.loadState(state)
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: session.withCtx(() => serializeState(session.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { session.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

for (const card of [
  { id: 'B100_Clutterer', name: 'Clutterer', paid: false, food: 3 },
  { id: 'E116_FirCutter', name: 'Fir Cutter', paid: true, food: 1 },
]) {
  test(`${card.id} plays without a self after menu and restores the immediate outcome`, async ({ page, request }) => {
    await openScenario(page, request, (state) => {
      const player = state.players[0]!
      player.occupationHand = [card.id, 'A124_Knapper']
      player.occupationPlayed = card.paid ? ['A125_Priest'] : []
      player.resources.food = card.food
    })
    await page.locator('[data-action-id="lessons"] button').first().click()
    const played = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
    const occupation = page.locator(`.interaction-bar [data-choice-value="${card.id}"]`)
    await expect(occupation).toContainText(card.name)
    await occupation.click()
    const result = await (await played).json()
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(result.state.players[0].occupationPlayed).toContain(card.id)
    expect(result.state.players[0].resources.food).toBe(card.food)
    expect(result.interaction.request.kind).toBe('confirm-next-player')
    expect(result.state.players[0].cardStates[card.id]?.counters?.bonusVp ?? 0).toBe(0)
    expect(result.state.events.filter((event: { type: string; cardId?: string; triggerActionId?: string }) =>
      event.type === 'card.triggered' && event.cardId === card.id && event.triggerActionId === 'occupation')).toEqual([])
    await page.reload()
    await expect(page.locator('.played-card-slot').filter({ has: page.locator(`[data-card-anchor="${card.id}"]`) })).toBeVisible()
    await expect(page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch' })).toBeVisible()
    const restored = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(restored.state.players[0].resources.food).toBe(card.food)
    await page.screenshot({ path: `output/playwright/card-play-${card.id}.png` })
  })
}

test('Pioneer before resources unlock a purchase and survive reloading the pending choice', async ({ page, request }) => {
  await openScenario(page, request, (state) => {
    state.round = 4
    const prior = state.roundActionOrder.indexOf('major-improvement')
    ;[state.roundActionOrder[3], state.roundActionOrder[prior]] = [state.roundActionOrder[prior]!, state.roundActionOrder[3]!]
    state.availableMajorImprovements = ['Major_Fireplace1']
    state.players[0]!.occupationPlayed = ['E105_Pioneer']
    Object.assign(state.players[0]!.resources, { clay: 1, food: 2, wood: 0, reed: 0, stone: 0 })
  })
  const major = page.locator('[data-action-id="major-improvement"] button').first()
  await expect(major).toBeEnabled()
  await major.click()
  const before = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expect(before.state.players[0].resources.clay).toBe(1)
  expect(before.state.players[0].improvements).toEqual([])
  await page.reload()
  const clay = page.locator('.interaction-bar .interaction-actions button').filter({ has: page.locator('.res-icon-clay') }).first()
  await expect(clay).toBeVisible()
  const committed = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
  await clay.click()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].improvements).toContain('Major_Fireplace1')
  expect(result.state.players[0].resources).toMatchObject({ clay: 0, food: 3 })
  expect(result.state.events.filter((event: { type: string; sourceCardId?: string }) =>
    event.type === 'resource.moved' && event.sourceCardId === 'E105_Pioneer')).toHaveLength(1)
  await page.screenshot({ path: 'output/playwright/card-play-pioneer-before.png' })
})
