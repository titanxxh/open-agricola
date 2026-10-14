import { expect, test } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test('Apiary offers crops only and the browser submits one seed on one field', async ({ page, request }) => {
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 42, playerCount: 2, customCardIds: [] })).ok).toBe(true)
  const fixture = createWorkSession({ configure(state) {
    state.round = 5
    state.players.forEach(player => { player.resources.food = 20 })
    const owner = state.players[0]!
    owner.minorPlayed = ['E023_Apiary', 'D075_WoodField']
    owner.occupationPlayed = ['A100_Curator', 'A110_Roughcaster', 'A116_WoodCutter', 'A125_Priest']
    Object.assign(owner.resources, { grain: 2, vegetable: 1, wood: 2 })
    owner.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }]
  } })
  try {
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state: fixture.withCtx(() => serializeState(fixture.state, {})) })).ok).toBe(true)
  } finally { fixture.dispose() }
  let response: SessionResponse = await getJson(request, `${BACKEND_URL}/api/game/state`)
  for (const spaceId of ['day-laborer', 'clay-pit', 'reed-bank', 'forest']) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = await postJson(request, `${BACKEND_URL}/api/game/choice`, { playerIndex: response.interaction.request.nextPlayerIndex, value: 'confirm' })
      expect(response.ok, response.error).toBe(true)
    }
    response = await postJson(request, `${BACKEND_URL}/api/game/action`, { playerIndex: response.state.currentPlayerIndex, spaceId })
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error('Expected final work handoff')
  response = await postJson(request, `${BACKEND_URL}/api/game/choice`, { playerIndex: response.interaction.request.nextPlayerIndex, value: 'confirm' })
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'farm-select') break
    if (interaction.request.kind !== 'choice' && interaction.request.kind !== 'select-trigger') throw new Error(`Unexpected Apiary interaction: ${JSON.stringify(interaction)}`)
    const option = interaction.request.options.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value))
    expect(option).toBeDefined()
    response = await postJson(request, `${BACKEND_URL}/api/game/choice`, { playerIndex: interaction.playerIndex, value: option!.value })
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'E023_Apiary', request: { kind: 'farm-select', farm: { farmType: 'sow', maxSelections: 1, maxSeedSelections: 1 } } })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const first = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-0"] .sow-choice-button[title="Grain"]')
  const second = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-1"] .sow-choice-button[title="Grain"]')
  await expect(first).toBeVisible()
  await expect(page.locator('.sow-choice-button[title="Wood"]')).toHaveCount(0)
  await first.click()
  await second.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'false')
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await page.getByRole('button', { name: 'Confirm sowing', exact: true }).click()
  const result: SessionResponse = await (await committed).json()
  expect(result.ok, result.error).toBe(true)
  expect(result.state.round).toBe(6)
  expect(result.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, wood: 2 })
  expect(result.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 3 }], []])
})
