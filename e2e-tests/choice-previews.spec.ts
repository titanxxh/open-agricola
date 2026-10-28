import { expect, test } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { ActionChoiceOption, SessionResponse } from '../shared/contract/types'
import { serializeState } from '../shared/session/serialization'
import type { SerializedGameState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

test('Rod Collection previews points for wood beyond the four printed exceptions', async ({ page, request }) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 38052, playerCount: 2, customCardIds: [] } })
  expect(fresh.ok()).toBe(true)
  const { state }: { state: SerializedGameState } = await fresh.json()
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const owner = state.players[0]!
  owner.minorPlayed = ['E038_RodCollection']
  owner.occupationPlayed = ['A110_Roughcaster', 'A125_Priest', 'C123_Freemason']
  owner.resources.wood = 2
  owner.cardStates.E038_RodCollection = { extraData: { woodCount: 12 } }
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  const action: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'fishing' } })).json()
  expect(action.ok, action.error).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const scores = page.locator('.interaction-bar [data-card-score]')
  await expect(scores).toHaveCount(2)
  await expect(scores.nth(0)).toHaveAttribute('data-card-score', '1')
  await expect(scores.nth(1)).toHaveAttribute('data-card-score', '2')
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar button').filter({ has: page.locator('[data-card-score="1"]') }).click()
  const result: SessionResponse = await (await committed).json()
  expect(result.ok, result.error).toBe(true)
  expect(result.state.players[0]!.resources.wood).toBe(1)
})

test('Cubbyhole payment choices show the shared reed cost', async ({ page, request }) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 52052, playerCount: 2, customCardIds: [] } })
  expect(fresh.ok()).toBe(true)
  const { state }: { state: SerializedGameState } = await fresh.json()
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0]!.minorHand = ['E052_Cubbyhole']
  Object.assign(state.players[0]!.resources, { wood: 1, clay: 1, reed: 1 })
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  const started: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'meeting-place' } })).json()
  if (started.interaction.stateId !== 'wait') throw new Error('Expected improvement choice')
  const branch = started.interaction.request.options?.find(option => option.value.startsWith('action-improvement-'))
  if (!branch) throw new Error('Expected minor improvement branch')
  const offered: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/choice`, { data: { playerIndex: 0, value: branch.value } })).json()
  expect(offered.interaction).toMatchObject({ stateId: 'wait', promptKey: 'prompt.selectPayment' })
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const payments = page.locator('.interaction-bar button').filter({ has: page.locator('[data-resource="reed"][data-amount="1"]') })
  await expect(payments).toHaveCount(2)
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await payments.filter({ has: page.locator('[data-resource="wood"][data-amount="1"]') }).click()
  const result: SessionResponse = await (await committed).json()
  expect(result.ok, result.error).toBe(true)
  expect(result.state.players[0]!.minorPlayed).toContain('E052_Cubbyhole')
  expect(result.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, reed: 0 })
})

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  for (const target of ['farm', 'card'] as const) {
    test(`whole-field ${target} choices click farm and Card Fields in ${scenario.locale} at ${scenario.width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width: scenario.width, height: 1000 })
      await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
      const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1073, playerCount: 2, customCardIds: [] } })
      expect(fresh.ok()).toBe(true)
      const { state } = await fresh.json() as { state: SerializedGameState }
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources.food = 20
        for (const worker of player.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
      const owner = state.players[0]!
      owner.minorPlayed = ['E073_Scythe', 'D025_WitchesDanceFloor', 'D075_WoodField']
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
      owner.cardStates.D025_WitchesDanceFloor = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 4 }] } }
      owner.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 2 }] } }
      expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
      expect((await request.post(`${BACKEND_URL}/api/game/round-end`)).ok()).toBe(true)
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      const farm = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]')
      await expect(farm).toHaveClass(/position-selectable/)
      // The crop strip is a visible sibling of the card anchor, independent of hover.
      const cardSlots = page.locator('.played-card-slot').filter({ has: page.locator('[data-card-anchor="D025_WitchesDanceFloor"]') }).locator('.card-field-selection')
      const woodSlots = page.locator('.played-card-slot').filter({ has: page.locator('[data-card-anchor="D075_WoodField"]') }).locator('.card-field-selection')
      await expect(cardSlots).toHaveCount(1)
      await expect(woodSlots).toHaveCount(0)
      await page.reload()
      await expect(cardSlots).toHaveCount(1)
      await expect(woodSlots).toHaveCount(0)
      await page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="1-1"]').click()
      await expect(cardSlots).toHaveCount(1)
      const unchanged = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
      expect(unchanged.state.players[0].fields[0].stacks[0].remaining).toBe(3)
      const selected = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
      if (target === 'card') await cardSlots.last().click()
      else await farm.click()
      const result = await (await selected).json()
      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (target === 'card') {
        expect(result.state.players[0].cardStatePresentation.D025_WitchesDanceFloor.cropLayers).toEqual([])
        expect(result.state.players[0].fields[0].stacks[0].remaining).toBe(2)
      } else {
        expect(result.state.players[0].fields[0].stacks).toEqual([])
        expect(result.state.players[0].cardStatePresentation.D025_WitchesDanceFloor.cropLayers.map((layer: { stack: { remaining: number } }) => layer.stack.remaining)).toEqual([3])
      }
      expect(result.state.players[0].cardStatePresentation.D075_WoodField.cropLayers.map((layer: { stack: { remaining: number } }) => layer.stack.remaining)).toEqual([2, 1])
      await expect(cardSlots).toHaveCount(0)
      await page.screenshot({ path: `output/playwright/choice-${target}-field-${scenario.locale}.png` })
    })
  }
}

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  test(`Peat Sled displays four distinct executable schedules in ${scenario.locale}`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1079, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
    const { state } = await fresh.json() as { state: SerializedGameState }
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.farmTerrain = []
      player.resources.wood = 20
      player.resources.fuel = 20
    }
    state.players[0]!.minorHand = ['M079_PeatSled']
    expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
    let response = await (await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'meeting-place' } })).json()
    for (let i = 0; i < 8 && !response.state.players[0].minorPlayed.includes('M079_PeatSled'); i += 1) {
      const choice = response.interaction.request.options.find((option: { value: string }) => option.value === 'M079_PeatSled' || option.value.startsWith('action-improvement-'))
      expect(choice).toBeDefined()
      response = await (await request.post(`${BACKEND_URL}/api/game/choice`, { data: { playerIndex: 0, value: choice.value } })).json()
      expect(response.ok).toBe(true)
    }
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const plans = page.locator('.interaction-future-schedule')
    await expect(plans).toHaveCount(4)
    await expect(plans.first()).toContainText(scenario.locale === 'en' ? 'Round 3:' : '第 3 回合：')
    await expect(plans.last()).toContainText(scenario.locale === 'en' ? 'Round 11:' : '第 11 回合：')
    await expect(plans.first().locator('[data-resource="fuel"]')).toHaveAttribute('data-amount', '3')
    await expect(plans.last().locator('[data-resource="fuel"]')).toHaveAttribute('data-amount', '6')
    await page.screenshot({ path: `output/playwright/choice-peat-sled-${scenario.locale}.png` })
    const committed = page.waitForResponse((result) => result.url().endsWith('/api/game/choice'))
    await plans.last().click()
    const result = await (await committed).json()
    expect(result.ok).toBe(true)
    expect(result.state.futureMeeples).toEqual([expect.objectContaining({ round: 11, resources: { fuel: 6 } })])
  })
}

test('skipping a spatial Scythe choice retains normal field harvesting', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 2073, playerCount: 2, customCardIds: [] } })
  const { state } = await fresh.json() as { state: SerializedGameState }
  state.round = 4
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    for (const worker of player.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
  }
  state.players[0]!.minorPlayed = ['E073_Scythe']
  state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  expect((await request.post(`${BACKEND_URL}/api/game/round-end`)).ok()).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]')).toHaveClass(/position-selectable/)
  const submitted = page.waitForResponse((result) => result.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar').getByRole('button', { name: 'Skip', exact: true }).click()
  const result = await (await submitted).json()
  expect(result.ok).toBe(true)
  expect(result.state.players[0].fields[0].stacks[0].remaining).toBe(2)
  expect(result.state.players[0].resources.grain).toBe(1)
})

test('a scheduled Cut Peat offer commits its single physical card from the farm', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1056, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
  expect(fresh.ok()).toBe(true)
  const session = createWorkSession({ seed: 1056, options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
  const state = session.withCtx(() => serializeState(session.state, {}))
  session.dispose()
  state.round = 5
  const owner = state.players[0]!
  owner.minorHand = ['__test_placeholder__']
  owner.occupationHand = ['__test_placeholder__']
  owner.minorPlayed = ['M056_PeatCuttingRights']
  owner.resources.food = 20
  owner.resources.fuel = 20
  owner.farmTerrain = [{ row: 2, col: 1, kind: 'moor' }]
  for (const player of state.players) {
    player.resources.food = 20
    player.resources.fuel = 20
    for (const worker of player.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
  }
  owner.cardStates.M056_PeatCuttingRights = { extraData: { scheduledOffers: [{ id: 'browser-cut-peat', kind: 'moor-special-action', dueRound: 6, actionId: 'cut-peat', consumed: false }] } }
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  const roundEndResponse = await request.post(`${BACKEND_URL}/api/game/round-end`)
  expect(roundEndResponse.ok()).toBe(true)
  const roundEnd = await roundEndResponse.json()
  expect(roundEnd.ok, JSON.stringify(roundEnd)).toBe(true)
  expect(roundEnd.state).toMatchObject({ round: 6, roundPhase: 'preparation' })
  expect(roundEnd.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, spaceId: '__stage:onRoundStart', sourceCard: 'M056_PeatCuttingRights',
    request: { kind: 'choice' },
  })
  expect(roundEnd.state.players[0].farmTerrain).toEqual([{ row: 2, col: 1, kind: 'moor' }])
  const activation = roundEnd.interaction.request.options.find((option: ActionChoiceOption) =>
    option.sourceCard === 'M056_PeatCuttingRights' && option.value !== '__skip__')
  expect(activation).toBeDefined()
  expect(activation?.disabled).not.toBe(true)
  if (!activation) throw new Error('Expected the Peat-Cutting Rights round-start activation')
  const activatedResponse = await request.post(`${BACKEND_URL}/api/game/choice`, { data: { playerIndex: 0, value: activation.value } })
  expect(activatedResponse.ok()).toBe(true)
  const activated = await activatedResponse.json()
  expect(activated.ok, JSON.stringify(activated)).toBe(true)
  expect(activated.state).toMatchObject({ round: 6, roundPhase: 'preparation' })
  expect(activated.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, sourceCard: 'M056_PeatCuttingRights', request: { kind: 'choice' },
  })
  expect(activated.state.players[0].farmTerrain).toEqual([{ row: 2, col: 1, kind: 'moor' }])
  expect(activated.state.players[0].cardStates.M056_PeatCuttingRights.extraData.scheduledOffers)
    .toEqual([expect.objectContaining({ id: 'browser-cut-peat', consumed: false })])
  const targets = activated.interaction.request.options.filter((option: ActionChoiceOption) => option.targetCard && !option.disabled)
  expect(targets).toMatchObject([{
    targetCard: { cardId: 'moor-special-1-2-terrain' },
    target: { kind: 'farm-cell', playerId: owner.id, positions: [{ row: 2, col: 1 }] },
  }])
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const tile = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="2-1"]')
  await expect(tile).toHaveClass(/position-selectable/)
  const committed = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
  await tile.click()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].farmTerrain).toEqual([])
  expect(result.state.players[0].resources.fuel).toBe(23)
  expect(result.state.players[0].cardStates.M056_PeatCuttingRights.extraData.scheduledOffers)
    .toEqual([expect.objectContaining({ id: 'browser-cut-peat', consumed: true, consumedRound: 6 })])
})

for (const first of ['C048_Farmstead', 'B027_Toolbox']) {
  test(`Turn-end sources keep their order and one Farmstead reward across reload, first=${first}`, async ({ page, request }) => {
    const farmstead = 'C048_Farmstead'
    const toolbox = 'B027_Toolbox'
    expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 42, playerCount: 2, customCardIds: [] },
    })).ok()).toBe(true)
    const fixture = createWorkSession({ configure: state => {
      state.round = 10
      const owner = state.players[0]!
      owner.minorPlayed = [farmstead, toolbox]
      owner.occupationPlayed = ['A116_WoodCutter']
      Object.assign(owner.resources, { wood: 8, stone: 2, reed: 0, food: 2 })
    } })
    try {
      expect((await request.post(`${BACKEND_URL}/api/game/load`, {
        data: { state: fixture.withCtx(() => serializeState(fixture.state, {})) },
      })).ok()).toBe(true)
    } finally { fixture.dispose() }
    const chooseApi = async (value: string): Promise<SessionResponse> =>
      (await request.post(`${BACKEND_URL}/api/game/choice`, { data: { playerIndex: 0, value } })).json()
    const started: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/action`, {
      data: { playerIndex: 0, spaceId: 'farm-expansion' },
    })).json()
    expect(started.ok, started.error).toBe(true)
    let response: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/commit-selection`, {
      data: { playerIndex: 0, payload: { stables: [{ row: 0, col: 0 }] } },
    })).json()
    for (let guard = 0; guard < 4; guard++) {
      if (response.state.players[0]!.cardStates[farmstead]?.extraData?.qualifiedTurnToken !== undefined
        && response.state.players[0]!.cardStates[toolbox]?.flagged) break
      const offered = response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
      const activation = offered.find(option => option.value === farmstead || option.value === toolbox)
      if (!activation) throw new Error(`Expected construction reaction: ${JSON.stringify(response.interaction)}`)
      response = await chooseApi(activation.value)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const choice = (value: string) => page.locator(`.interaction-bar [data-choice-value="${value}"]`)
    const chooseUi = async (value: string): Promise<SessionResponse> => {
      const received = page.waitForResponse(result => result.url().endsWith('/api/game/choice'))
      await expect(choice(value)).toBeEnabled()
      await choice(value).click()
      const next: SessionResponse = await (await received).json()
      expect(next.ok, next.error).toBe(true)
      return next
    }
    await expect(choice(farmstead)).toBeVisible()
    await expect(choice(toolbox)).toBeVisible()
    response = await chooseUi(first)
    if (first === toolbox) response = await chooseUi('__skip__')
    const second = first === farmstead ? toolbox : farmstead
    await page.reload()
    await expect(choice(first)).toHaveCount(0)
    await expect(choice(second)).toBeEnabled()
    response = await chooseUi(second)
    if (second === toolbox) response = await chooseUi('__skip__')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === farmstead && event.resources.food === 1)).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    await page.reload()
    await expect(page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch' })).toBeVisible()
    const restored: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(restored.state.players[0]!.resources.food).toBe(3)
  })
}
