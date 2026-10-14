import { expect, test } from '@playwright/test'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test('Pure Breeder newborn is housed before the next work round resumes', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 4258, maxPlayers: 4 })
  const initial = await getJson(request, `${BACKEND_URL}/api/game/state`)
  const state = initial.state
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    Object.assign(player.resources, { sheep: 0, boar: 0, cattle: 0, food: 100 })
  }
  const owner = state.players[0]
  owner.occupationPlayed = ['D167_PureBreeder']
  owner.resources.sheep = 2
  owner.pastures = [{ id: 'breeder', tiles: [{ row: 0, col: 1 }], animalType: 'sheep', animalCount: 2 }]
  owner.stableTiles = [{ row: 0, col: 1 }]
  owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
  }))
  let response = await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
  expect(response.ok).toBe(true)
  for (const spaceId of ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4']) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
        playerIndex: response.interaction.playerIndex, value: 'confirm',
      })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction.stateId).toBe('idle')
    response = await postJson(request, `${BACKEND_URL}/api/game/action`, {
      playerIndex: response.state.currentPlayerIndex, spaceId,
    })
    expect(response.ok, response.error).toBe(true)
  }
  for (let step = 0; step < 12 && response.interaction.request?.kind !== 'animal-reorg'; step++) {
    const interaction = response.interaction
    expect(interaction.stateId).toBe('wait')
    const kind = interaction.request.kind
    const value = kind === 'confirm-next-player' || kind === 'confirm-player-switch' ? 'confirm'
      : interaction.request.options.find((option: { value: string; disabled?: boolean }) =>
        !option.disabled && !['__skip__', '__pass__', '__done__'].includes(option.value))?.value
    expect(value).toBeDefined()
    response = await postJson(request, `${BACKEND_URL}/api/game/choice`, { playerIndex: interaction.playerIndex, value })
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction.request.kind).toBe('animal-reorg')
  expect(response.state.round).toBe(5)
  expect(response.state.players[0].resources.sheep).toBe(3)
  expect(response.state.players[0].pastures[0].animalCount).toBe(2)

  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const panel = page.locator('.interaction-reorg-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(panel).toBeHidden()
  const completed = await getJson(request, `${BACKEND_URL}/api/game/state`)
  expect(completed.state.round).toBe(6)
  expect(completed.interaction.stateId).toBe('idle')
  expect(completed.state.players[0].resources.sheep).toBe(3)
  expect(completed.state.players[0].pastures[0].animalCount).toBe(3)
})
