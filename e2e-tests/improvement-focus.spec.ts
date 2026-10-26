import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import { GameSession } from '../server/game/authoritative-session'
import { BACKEND_URL } from './fixtures'

const openGame = async (page: Page, request: APIRequestContext, configure?: (state: GameState) => void) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1369, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const state = createInitialState(1369, { playerCount: 2 })
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  state.round = 4
  const index = state.roundActionOrder.indexOf('major-improvement')
  ;[state.roundActionOrder[3], state.roundActionOrder[index]] = [state.roundActionOrder[index]!, state.roundActionOrder[3]!]
  state.players[0]!.minorHand = ['A076_Cob', 'A007_GardenersKnife']
  Object.assign(state.players[0]!.resources, { clay: 3, wood: 3, food: 3 })
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

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`mixed improvement selection keeps one supply beside the minor hand at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await openGame(page, request)
    await page.locator('[data-action-id="major-improvement"] button').first().click()
    const hand = page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]')
    await expect(hand).toHaveAttribute('data-interaction-focused', 'true')
    await expect(page.locator('.major-improvements')).toHaveCount(1)
    const expand = hand.getByRole('button', { name: 'Show major improvements (2)' })
    await expect(expand).toBeVisible()
    await expect(page.locator('.major-row')).toHaveCount(0)
    const geometry = await hand.evaluate(element => {
      const title = element.querySelector('.hand-section-title')!.getBoundingClientRect()
      const first = element.querySelector('.hand-row .player-card.selectable')!.getBoundingClientRect()
      const bar = document.querySelector('.interaction-bar')!.getBoundingClientRect()
      return { top: title.top, bottom: first.bottom, limit: bar.top }
    })
    expect(geometry.top).toBeGreaterThanOrEqual(0)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.limit)
    await expand.click()
    await expect(hand.locator('.major-row')).toBeVisible()
    await page.screenshot({ path: `output/playwright/improvement-selection-mixed-open-${viewport.width}x${viewport.height}.png`, fullPage: true })
    await hand.getByRole('button', { name: 'Hide major improvements' }).click()
    await expect(page.locator('.major-row')).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Return to current action' }).click()
    await expect(hand).toHaveAttribute('data-interaction-focused', 'true')
    await hand.locator('[data-card-anchor="A076_Cob"]').click()
    await expect(page.locator('.played-cards [data-card-anchor="A076_Cob"]')).toBeVisible()
    await expect(page.locator('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true')
  })

  test(`only legal majors open and focus the supply at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await openGame(page, request, state => { state.players[0]!.minorHand = ['__test_placeholder__'] })
    await page.locator('[data-action-id="major-improvement"] button').first().click()
    const supply = page.locator('.hand-section.minor [data-interaction-focus="major-supply"]')
    await expect(supply).toHaveAttribute('data-interaction-focused', 'true')
    await expect(supply.locator('.major-row')).toBeVisible()
    await supply.getByRole('button', { name: 'Hide major improvements' }).click()
    await expect(supply.locator('.major-row')).toHaveCount(0)
    await supply.getByRole('button', { name: 'Show major improvements (2)' }).click()
    await supply.locator('[data-card-anchor="Major_Fireplace1"]').click()
    await expect(page.locator('.played-cards [data-card-anchor="Major_Fireplace1"]')).toBeVisible()
  })

  test(`a minor-only request has no major purchase entry at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await openGame(page, request)
    await page.locator('[data-action-id="meeting-place"] button').first().click()
    await page.locator('.interaction-bar').getByRole('button', { name: /^Optional:/ }).click()
    const hand = page.locator('[data-interaction-focus="minor-hand"][data-focus-player="p1"]')
    await expect(hand).toHaveAttribute('data-interaction-focused', 'true')
    await expect(hand.locator('.major-improvements')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Show major improvements/ })).toHaveCount(0)
    await hand.locator('[data-card-anchor="A076_Cob"]').click()
    await expect(page.locator('.played-cards [data-card-anchor="A076_Cob"]')).toBeVisible()
  })

  for (const count of [2, 3]) {
    test(`an improvement offer shows ${count === 3 ? 'a summary' : 'details'} for ${count} cards at ${viewport.width}px`, async ({ page, request }) => {
      await page.setViewportSize(viewport)
      const cards = ['A053_Claypipe', 'A076_Cob', 'B065_GrainDepot'].slice(0, count)
      await openGame(page, request, state => {
        state.players[0]!.minorHand = cards
        Object.assign(state.players[0]!.resources, { wood: 4, clay: 4, stone: 4, food: 4 })
      })
      await page.locator('[data-action-id="meeting-place"] button').first().click()
      const bar = page.locator('.interaction-bar')
      const offer = bar.locator('[data-choice-value^="action-improvement-"]')
      if (count === 3) {
        await expect(offer).toContainText('Choose a minor improvement')
        await expect(offer.locator('[data-resource]')).toHaveCount(0)
        await expect(offer).not.toContainText('Grain Depot')
      } else {
        await expect(offer).toContainText('Claypipe')
        await expect(offer).toContainText('Cob')
        await expect(offer.locator('[data-resource="clay"][data-amount="1"]')).toBeVisible()
      }
      await page.screenshot({ path: `output/playwright/improvement-offer-${count}-cards-${viewport.width}.png`, fullPage: true })
      await offer.click()
      for (const id of cards) await expect(bar.locator(`[data-choice-value="${id}"]`)).toBeVisible()
      if (count === 3) {
        const depot = bar.locator('[data-choice-value="B065_GrainDepot"]')
        for (const resource of ['wood', 'clay', 'stone']) {
          await expect(depot.locator(`[data-resource="${resource}"][data-amount="2"]`)).toBeVisible()
        }
        await depot.click()
        const payments = bar.locator('[data-choice-value^="pay:improvement:minor:B065_GrainDepot:"]')
        await expect(payments).toHaveCount(3)
        await page.screenshot({ path: `output/playwright/improvement-payment-after-summary-${viewport.width}.png`, fullPage: true })
        await payments.filter({ has: page.locator('[data-resource="clay"][data-amount="2"]') }).click()
        await expect(page.locator('.played-cards [data-card-anchor="B065_GrainDepot"]')).toBeVisible()
      }
    })
  }
}

test('a two-player supply keeps covered cards unavailable and empty choices out of the purchase flow', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openGame(page, request, state => {
    state.players[0]!.minorHand = ['__test_placeholder__']
    Object.assign(state.players[0]!.resources, { wood: 1, stone: 3 })
    state.majorImprovementSupply = [
      { familyId: 'well', visibleId: 'Major_Well', cardIds: ['Major_Well', 'Major_Well2'] },
      { familyId: 'fireplace', visibleId: 'Major_Fireplace1', cardIds: ['Major_Fireplace1'] },
    ]
    state.availableMajorImprovements = ['Major_Well', 'Major_Fireplace1']
  })
  await page.locator('[data-action-id="major-improvement"] button').first().click()
  const supply = page.locator('.hand-section.minor .major-improvements')
  await expect(supply.getByTestId('major-stack-count-well')).toHaveText('2')
  await expect(supply.locator('[data-card-anchor="Major_Well"]')).toHaveClass(/selectable/)
  await expect(supply.locator('[data-card-anchor="Major_Well2"]')).not.toHaveClass(/selectable/)
  await supply.locator('[data-card-anchor="Major_Well"]').click()
  await expect(page.locator('.played-cards [data-card-anchor="Major_Well"]')).toBeVisible()

  await openGame(page, request, state => {
    state.players[0]!.minorHand = ['__test_placeholder__']
    Object.assign(state.players[0]!.resources, { clay: 0, wood: 0, food: 0, stone: 0, reed: 0 })
  })
  await expect(page.locator('[data-action-id="major-improvement"] button').first()).toBeDisabled()
  await expect(page.locator('.hand-section.minor .major-improvements')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Show major improvements/ })).toHaveCount(0)
})
