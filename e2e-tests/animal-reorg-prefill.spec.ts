// @covers client/components/interaction/
import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'
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

test('players can cook unassigned sheep and return to their edited placement', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const fixture = createWorkSession({ seed: 960, configure: state => {
      state.round = 5
      state.currentPlayerIndex = 0
      for (const player of state.players) player.resources.food = 3
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1']
      Object.assign(player.resources, { sheep: 0, boar: 0, cattle: 1 })
      player.houseAnimals = { '2-0': 'cattle' }
      player.pastures = [
        { id: 'first-pen', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'alternate-pen', size: 1, tiles: [{ row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      ]
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
    } })
    const initial = fixture.withCtx(() => serializeState(fixture.state, {}))
    fixture.dispose()
    const driver = roomDriver(pages)
    const [page] = pages
    await driver.command(0, { type: 'loadGame', state: initial })
    await driver.ui(0, () => page.locator('.action-card').filter({ hasText: 'Sheep Market' }).click())
    const panel = page.locator('.interaction-reorg-panel')
    await expect(panel).toBeVisible()
    expect((await roomSnapshot(page)).interaction).toMatchObject({
      stateId: 'wait',
      requestKey: expect.any(String),
      allowedCommands: expect.arrayContaining(['resolveChoice']),
      request: {
        kind: 'animal-reorg',
        reserveCooking: {
          available: { sheep: 2 },
          catalog: expect.arrayContaining([expect.objectContaining({
            sourceId: 'Major_Fireplace1',
            from: { sheep: 1 },
            to: { food: 2 },
          })]),
        },
      },
    })
    const convert = panel.getByRole('button', { name: 'Convert to food', exact: true })
    await expect(convert).toHaveCount(0)

    const sheepControls = (tile: string) => page.locator(`[data-farm-tile-player="p1"][data-farm-tile-key="${tile}"] .pasture-control-row`)
      .filter({ has: page.getByText('Sheep', { exact: true }) })
    const firstPen = sheepControls('0-2')
    const sheep = sheepControls('1-2')
    await expect(firstPen.locator('.pasture-control-value')).toHaveText('2')
    await firstPen.getByRole('button', { name: '-', exact: true }).click()
    await firstPen.getByRole('button', { name: '-', exact: true }).click()
    await sheep.getByRole('button', { name: '+', exact: true }).click()
    await expect(sheep.locator('.pasture-control-value')).toHaveText('1')
    await expect(convert).toBeVisible()
    await expect(pages[1].getByRole('button', { name: 'Convert to food', exact: true })).toHaveCount(0)
    await convert.click()

    const exchange = page.locator('.exchange-overlay')
    const recipe = exchange.getByText('Fireplace', { exact: true })
    await expect(recipe).toBeVisible()
    await exchange.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(exchange).toHaveCount(0)
    await expect(sheep.locator('.pasture-control-value')).toHaveText('1')
    expect((await roomSnapshot(page)).state.players[0]!.resources).toMatchObject({ sheep: 2, food: 3 })

    const snapshotCount = await page.evaluate(() => {
      window.lifecycleSocket.close(4100, 'Test reconnect during animal reorganization')
      return window.lifecycleMessages.filter(message => message.type === 'stateUpdate').length
    })
    await expect.poll(() => page.evaluate(() => window.lifecycleMessages.filter(message => message.type === 'stateUpdate').length), {
      timeout: 30_000,
    }).toBeGreaterThan(snapshotCount)
    await expect(convert).toBeVisible()
    await expect(sheep.locator('.pasture-control-value')).toHaveText('1')

    await page.setViewportSize({ width: 390, height: 844 })
    await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
    const warning = panel.locator('.interaction-reorg-warning')
    await warning.getByRole('button', { name: 'Convert to food', exact: true }).click()
    const add = exchange.getByRole('button', { name: '+', exact: true })
    const confirmExchange = exchange.getByRole('button', { name: 'Confirm', exact: true })
    await expect(add).toBeInViewport()
    await add.click()
    await expect(add).toBeDisabled()
    await expect(confirmExchange).toBeInViewport()
    await driver.ui(0, () => confirmExchange.click())
    await expect(exchange).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(warning).toHaveCount(0)
    await expect(sheep.locator('.pasture-control-value')).toHaveText('1')
    await driver.ui(0, () => panel.getByRole('button', { name: 'Confirm', exact: true }).click())
    await expect(panel).toHaveCount(0)

    const confirmed = await roomSnapshot(page)
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 1, cattle: 1, food: 5 })
    expect(confirmed.state.players[0]!.pastures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'first-pen', animalCount: 0 }),
      expect.objectContaining({ id: 'alternate-pen', animalType: 'sheep', animalCount: 1 }),
    ]))
    expect(confirmed.state.players[0]!.houseAnimals).toEqual({ '2-0': 'cattle' })
    expect(confirmed.state.log.some(entry => entry.key === 'log.reorganizeDiscard')).toBe(false)
  } finally {
    await Promise.all(pages.map(page => page.close()))
  }
})
