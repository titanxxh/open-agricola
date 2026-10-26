import { expect, test } from '@playwright/test'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const destination of ['stone', 'boar']) {
  test(`Sheep Walker exchanges placed sheep for ${destination} during animal reorganization`, async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await postJson(request, BACKEND_URL + '/api/game/new', { seed: 1118, maxPlayers: 2 })
    const { state } = await getJson(request, BACKEND_URL + '/api/game/state')
    state.round = 5
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 20
    }
    const player = state.players[0]
    player.occupationPlayed = ['B104_SheepWalker']
    Object.assign(player.resources, { sheep: 1, boar: 0, cattle: 0, stone: 0 })
    player.pastures = [{ id: 'sheep-pasture', size: 1, tiles: [{ row: 0, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }]
    state.actionSpaces.find((space: { id: string }) => space.id === 'sheep-market').resources.sheep = 1
    expect((await postJson(request, BACKEND_URL + '/api/game/load', { state })).ok).toBe(true)

    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await page.locator('.action-card').filter({ hasText: 'Sheep Market' }).click()
    await expect(page.locator('.interaction-reorg-panel')).toBeVisible()
    await page.locator('[data-anytime-action-id="exchange"]').click()
    const recipe = page.getByTestId(`anytime-exchange-option-B104_SheepWalker-ex${destination === 'boar' ? 0 : 2}`)
    await expect(recipe).toBeVisible()
    const add = recipe.getByRole('button', { name: '+', exact: true })
    await add.click()
    await expect(add).toBeDisabled()
    await page.locator('.exchange-confirm').click()
    await expect(page.locator('.exchange-overlay')).toHaveCount(0)
    await expect(page.locator('.interaction-reorg-panel')).toBeVisible()
    await page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.locator('.interaction-reorg-panel')).toHaveCount(0)
    const completed = await getJson(request, BACKEND_URL + '/api/game/state')
    expect(completed.state.players[0].resources).toMatchObject({ sheep: 1, [destination]: 1 })
    expect(completed.interaction.request.kind).toBe('confirm-next-player')
  })
}

test('collecting animals presents a full draft that can be confirmed without adjustments', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await postJson(request, BACKEND_URL + '/api/game/new', { seed: 960, maxPlayers: 2 })
  const { state } = await getJson(request, BACKEND_URL + '/api/game/state')
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
  }
  const player = state.players[0]
  Object.assign(player.resources, { sheep: 2, boar: 0, cattle: 1 })
  player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'cattle']));
  player.pastures = [{ id: 'prefill', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: 'sheep', animalCount: 2 }]
  state.actionSpaces.find((space: { id: string }) => space.id === 'sheep-market').resources.sheep = 2
  expect((await postJson(request, BACKEND_URL + '/api/game/load', { state })).ok).toBe(true)

  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await page.locator('.action-card').filter({ hasText: 'Sheep Market' }).click()
  await expect(page.locator('.interaction-reorg-panel')).toBeVisible()
  const before = await getJson(request, BACKEND_URL + '/api/game/state')
  expect(before.state.players[0].pastures[0].animalCount).toBe(2)
  expect(before.interaction.request.zones.find((z: { id: string }) => z.id === 'prefill').animalCount).toBe(4)
  await expect(page.locator('.interaction-reorg-warning')).toHaveCount(0)
  await page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.locator('.interaction-reorg-panel')).toHaveCount(0)
  const after = await getJson(request, BACKEND_URL + '/api/game/state')
  expect(after.state.players[0].pastures[0].animalCount).toBe(4)
  expect(after.state.players[0].resources.sheep).toBe(4)
  expect(after.state.log.some((entry: { key: string }) => entry.key === 'log.reorganizeDiscard')).toBe(false)
})

test('partial prefill leaves the remainder for an explicit discard confirmation', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await postJson(request, BACKEND_URL + '/api/game/new', { seed: 962, maxPlayers: 2 })
  const { state } = await getJson(request, BACKEND_URL + '/api/game/state')
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]
  Object.assign(player.resources, { sheep: 4, boar: 2, cattle: 1 })
  player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'cattle']));
  player.pastures = [{ id: 'prefill', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: null, animalCount: 0 }]
  expect((await postJson(request, BACKEND_URL + '/api/game/load', { state })).ok).toBe(true)
  expect((await postJson(request, BACKEND_URL + '/api/game/dev/set-resources', { playerIndex: 0, resources: { sheep: 5 } })).ok).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const panel = page.locator('.interaction-reorg-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.locator('.interaction-reorg-warning')).toBeVisible()
  const pending = await getJson(request, BACKEND_URL + '/api/game/state')
  expect(pending.state.players[0].resources).toMatchObject({ sheep: 5, boar: 2 })
  expect(pending.state.players[0].pastures[0].animalCount).toBe(0)
  await panel.getByRole('button', { name: 'Confirm discard', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const confirmed = await getJson(request, BACKEND_URL + '/api/game/state')
  expect(confirmed.state.players[0].resources).toMatchObject({ sheep: 4, boar: 0, cattle: 1 })
})
