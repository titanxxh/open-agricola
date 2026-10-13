import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { writeCardExtraData } from '../shared/cards/helpers/card-state'
import { findActionSpaceById } from '../shared/domain/space'
import { BACKEND_URL } from './fixtures'
import '../shared/cards/register-all'

const openScenario = async (page: Page, request: APIRequestContext, target: string | null) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 42, playerCount: 4, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const session = createWorkSession({
    options: { playerCount: 4 },
    configure: state => {
      const owner = state.players[0]!
      owner.occupationPlayed = ['C150_ParrotBreeder']
      owner.resources.grain = 2
      owner.resources.food = 0
      writeCardExtraData(owner, 'C150_ParrotBreeder', 'right', target)
      if (target) findActionSpaceById(state, target)!.takenBy = [{ playerId: 'p4', workerId: '1' }]
    },
  })
  try {
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: session.withCtx(() => serializeState(session.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { session.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

test('Parrot Breeder copies the fixed target with one click and no target picker', async ({ page, request }) => {
  await openScenario(page, request, 'day-laborer')
  const copy = page.locator('.anytime-actions').getByRole('button', { name: /Parrot Breeder/ })
  await expect(copy.locator('[data-resource-mode="payment"] [data-resource="grain"]')).toHaveAttribute('data-amount', '1')
  await expect(copy.getByRole('img', { name: '1 Grain', exact: true })).toBeVisible()
  await expect(copy).toContainText('Day Laborer')
  const activated = page.waitForResponse(response => response.url().endsWith('/api/game/anytime'))
  await copy.click()
  const result = await (await activated).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].resources).toMatchObject({ grain: 1, food: 2 })
  expect(result.state.actionSpaces.find((space: { id: string }) => space.id === 'day-laborer').takenBy)
    .toEqual([{ playerId: 'p4', workerId: '1' }, { playerId: 'p1', workerId: '1' }])
  expect(result.interaction.request.kind).toBe('confirm-next-player')
  await expect(copy).toBeHidden()
  await expect(page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch' })).toBeVisible()
})

for (const target of [null, 'meeting-place']) {
  test(`Parrot Breeder hides the paid entry for ${target ?? 'no target'}`, async ({ page, request }) => {
    await openScenario(page, request, target)
    await expect(page.locator('.anytime-actions').getByRole('button', { name: /Parrot Breeder/ })).toHaveCount(0)
    const rejected = await request.post(`${BACKEND_URL}/api/game/anytime`, {
      data: { playerIndex: 0, actionId: 'C150-parrot-breeder-anytime' },
    })
    const result = await rejected.json()
    expect(result.ok).toBe(false)
    expect(result.state.players[0].resources.grain).toBe(2)
    expect(result.state.events.filter((event: { type: string }) => event.type === 'resource.paid')).toEqual([])
  })
}
