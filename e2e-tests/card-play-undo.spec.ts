import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { GameState, Resource } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import { takeMajorImprovementFromSupply } from '../shared/cards/major/supply'
import { GameSession, type SessionResponse } from '../server/game/authoritative-session'
import { BACKEND_URL } from './fixtures'

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

const openGame = async (page: Page, request: APIRequestContext, configure: (state: GameState) => void) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1382, playerCount: 2, customCardIds: [] } })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const state = createInitialState(1382, { playerCount: 2 })
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  state.round = 4
  const index = state.roundActionOrder.indexOf('major-improvement')
  ;[state.roundActionOrder[3], state.roundActionOrder[index]] = [state.roundActionOrder[index]!, state.roundActionOrder[3]!]
  configure(state)
  const session = new GameSession(state)
  try {
    session.loadState(state)
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, { data: {
      state: session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks })),
    } })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { session.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

const enterChoice = async (page: Page): Promise<SessionResponse> => {
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
  await page.locator('[data-action-id="major-improvement"] button').first().tap()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

const selectCard = async (page: Page, cardId: string): Promise<SessionResponse> => {
  const card = page.locator(`.hand-cards [data-card-anchor="${cardId}"]`)
  await card.tap()
  const play = page.getByRole('dialog', { name: 'Card details' }).getByRole('button', { name: 'Play this card' })
  await expect(play).toBeEnabled()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await play.tap()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

const undoToChoice = async (page: Page, original: SessionResponse): Promise<SessionResponse> => {
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/undo'))
  await page.locator('.interaction-bar').getByRole('button', { name: 'Undo Step', exact: true }).tap()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || original.interaction.stateId !== 'wait') throw new Error('Expected original and restored choices')
  expect(response.interaction.requestKey).toBe(original.interaction.requestKey)
  expect(response.interaction.promptKey).toBe('ui.interactionChooseImprovement')
  return response
}

const pay = async (page: Page, pending: SessionResponse, resource: keyof Resource, amount: number): Promise<SessionResponse> => {
  if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected payment choices')
  const option = pending.interaction.request.options.find(option =>
    option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid[resource] === amount)
  expect(option, 'Expected the chosen resource payment').toBeDefined()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator(`.interaction-bar [data-choice-value="${option!.value}"]`).tap()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

test('Undo Step restores a minor payment choice and allows the same mounted card to be played again', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.players[0]!.minorHand = ['D080_BrickHammer', 'A076_Cob']
    Object.assign(state.players[0]!.resources, { wood: 1, food: 3 })
  })
  const original = await enterChoice(page)
  await expect(page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  const first = await selectCard(page, 'D080_BrickHammer')
  expect(first.state.players[0]!.minorHand).toContain('D080_BrickHammer')
  expect(first.interaction.stateId === 'wait' && first.interaction.promptKey).toBe('prompt.selectPayment')
  await undoToChoice(page, original)
  await expect(page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]'))
    .toHaveAttribute('data-interaction-focused', 'true')
  const retried = await selectCard(page, 'D080_BrickHammer')
  const played = await pay(page, retried, 'wood', 1)
  expect(played.state.players[0]!.minorPlayed).toContain('D080_BrickHammer')
  expect(played.state.players[0]!.resources.wood).toBe(0)
  expect(played.state.players[0]!.resources.food).toBe(3)
})

test('Undo Step restores the major-supply request and permits the same purchase and payment again', async ({ page, request }) => {
  await openGame(page, request, state => {
    state.players[0]!.improvements = ['Major_Fireplace1']
    takeMajorImprovementFromSupply(state, 'Major_Fireplace1')
    state.players[0]!.resources.clay = 4
  })
  const original = await enterChoice(page)
  await expect(page.locator('[data-interaction-focus="major-supply"]')).toHaveAttribute('data-interaction-focused', 'true')
  const first = await selectCard(page, 'Major_CookingHearth1')
  expect(first.state.availableMajorImprovements).toContain('Major_CookingHearth1')
  expect(first.interaction.stateId === 'wait' && first.interaction.promptKey).toBe('prompt.selectPayment')
  await undoToChoice(page, original)
  await expect(page.locator('[data-interaction-focus="major-supply"]')).toHaveAttribute('data-interaction-focused', 'true')
  const retried = await selectCard(page, 'Major_CookingHearth1')
  const played = await pay(page, retried, 'clay', 4)
  expect(played.state.players[0]!.improvements).toEqual(['Major_Fireplace1', 'Major_CookingHearth1'])
  expect(played.state.players[0]!.resources.clay).toBe(0)
})
