import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

const CARD = 'C127_Lover'
const settlement = (page: Page) => page.locator('.interaction-bar [data-choice-value="confirm"]')

async function openSettlement(page: Page, request: APIRequestContext): Promise<string[]> {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1170, playerCount: 3, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const session = createWorkSession({
    seed: 1170,
    options: { playerCount: 3 },
    configure(state) {
      state.round = 10
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      const player = state.players[0]!
      player.occupationHand = [CARD, 'A123_FrameBuilder']
      player.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter(card => card !== 'Major_Fireplace1')
      Object.assign(player.resources, { food: 3, vegetable: 1, begging: 0 })
    },
  })
  const workerIds = session.state.players[0]!.workers.map(worker => worker.id)
  try {
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: session.withCtx(() => serializeState(session.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally {
    session.dispose()
  }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const lessons = page.locator('[data-action-id="lessons"] button').first()
  await expect(lessons).toBeEnabled()
  await lessons.click()
  const lover = page.locator(`.interaction-bar [data-choice-value="${CARD}"]`)
  await expect(lover).toContainText('Lover')
  const played = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await lover.click()
  const pending: SessionResponse = await (await played).json()
  expect(pending.ok, pending.error).toBe(true)
  expect(pending.state.players[0]!.occupationPlayed).toContain(CARD)
  expect(pending.state.players[0]!.resources).toMatchObject({ food: 3, vegetable: 1, begging: 0 })
  expect(pending.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(2)
  expect(pending.interaction).toMatchObject({
    stateId: 'wait',
    sourceCard: CARD,
    request: { kind: 'choice', requiresExplicitChoice: true, options: [{ value: 'confirm' }] },
  })
  await expect(page.locator('.interaction-bar [data-choice-value]')).toHaveCount(1)
  await expect(page.locator('.interaction-bar [data-choice-value="__skip__"]')).toHaveCount(0)
  await expect(page.locator('.interaction-bar [data-choice-value="__pass__"]')).toHaveCount(0)
  await expect(settlement(page).locator('[data-resource="food"]')).toHaveAttribute('data-amount', '3')
  await expect(settlement(page).locator('[data-resource="begging"]')).toHaveAttribute('data-amount', '1')
  return workerIds
}

function expectGrowth(response: SessionResponse, workerIds: string[], resources: { food: number; vegetable: number; begging: number }) {
  expect(response.ok, response.error).toBe(true)
  const player = response.state.players[0]!
  expect(player.resources).toMatchObject(resources)
  expect(player.occupationPlayed).toContain(CARD)
  expect(player.occupationHand).not.toContain(CARD)
  expect(player.workers.map(worker => worker.id)).toEqual(workerIds)
  expect(player.workers.filter(worker => worker.isActive)).toHaveLength(3)
  expect(player.workers.filter(worker => worker.isActive && worker.isNewborn)).toHaveLength(1)
  expect(player.rooms).toBe(2)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
}

test('Lover shortage settlement survives reload and uses begging when confirmed', async ({ page, request }) => {
  const workerIds = await openSettlement(page, request)
  await page.reload()
  await expect(settlement(page)).toBeVisible()
  await expect(settlement(page).locator('[data-resource="food"]')).toHaveAttribute('data-amount', '3')
  await expect(settlement(page).locator('[data-resource="begging"]')).toHaveAttribute('data-amount', '1')
  const paid = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await settlement(page).click()
  const result: SessionResponse = await (await paid).json()
  expectGrowth(result, workerIds, { food: 0, vegetable: 1, begging: 1 })
  await page.reload()
  await expect(page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch' })).toBeVisible()
  const restored: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expectGrowth(restored, workerIds, { food: 0, vegetable: 1, begging: 1 })
  await page.screenshot({ path: 'output/playwright/issue1201-lover-begging.png' })
})

test('Lover allows Fireplace cooking before mandatory settlement and refreshes its preview', async ({ page, request }) => {
  const workerIds = await openSettlement(page, request)
  await page.locator('.anytime-bar').getByRole('button').filter({ hasText: /Exchange|Convert/i }).first().click()
  const vegetable = page.getByTestId('anytime-exchange-option-Major_Fireplace1-ex3')
  await expect(vegetable).toBeVisible()
  await vegetable.getByRole('button', { name: '+', exact: true }).click()
  const converted = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator('.exchange-confirm').click()
  const afterCooking: SessionResponse = await (await converted).json()
  expect(afterCooking.ok, afterCooking.error).toBe(true)
  expect(afterCooking.state.players[0]!.resources).toMatchObject({ food: 5, vegetable: 0, begging: 0 })
  expect(afterCooking.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(2)
  await expect(settlement(page)).toBeVisible()
  await expect(settlement(page).locator('[data-resource="food"]')).toHaveAttribute('data-amount', '4')
  await expect(settlement(page).locator('[data-resource="begging"]')).toHaveCount(0)
  await page.reload()
  await expect(settlement(page).locator('[data-resource="food"]')).toHaveAttribute('data-amount', '4')
  await expect(settlement(page).locator('[data-resource="begging"]')).toHaveCount(0)
  const paid = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await settlement(page).click()
  const result: SessionResponse = await (await paid).json()
  expectGrowth(result, workerIds, { food: 1, vegetable: 0, begging: 0 })
  await page.screenshot({ path: 'output/playwright/issue1201-lover-cooking.png' })
})
