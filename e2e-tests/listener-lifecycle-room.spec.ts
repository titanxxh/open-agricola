import { expect, test, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { serializeState } from '../shared/session/serialization'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

const TOOLBOX = 'B027_Toolbox'
const POTTERS = 'A040_PottersYard'
const CLEANER = 'C094_StableCleaner'

const options = (current: GameSyncPayload) => {
  if (current.interaction.stateId !== 'wait' ||
    (current.interaction.request.kind !== 'choice' && current.interaction.request.kind !== 'select-trigger')) {
    throw new Error(`Expected public choice: ${JSON.stringify(current.interaction)}`)
  }
  return current.interaction.request.options
}
const nonSkip = (current: GameSyncPayload) => {
  const option = options(current).find(option => !option.value.startsWith('__') && !option.disabled)
  if (!option) throw new Error('Expected an enabled card choice')
  return option
}
const assertClientsAgree = async (pages: [Page, Page]) => {
  const current = await roomSnapshot(pages[0])
  expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
  return current
}
const assertReadOnly = async (observer: Page) => {
  await expect(observer.locator('.interaction-bar [data-choice-value]:enabled')).toHaveCount(0)
  await expect(observer.locator('.exchange-confirm:enabled')).toHaveCount(0)
}

test('C094 drains Potter\'s Yard before Toolbox and preserves both room clients across child and purchase reloads', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 1300, configure: state => {
      state.round = 5
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        Object.assign(player.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
      }
      const owner = state.players[0]!
      owner.minorPlayed = [TOOLBOX, POTTERS]
      owner.occupationPlayed = [CLEANER]
      Object.assign(owner.resources, { wood: 6, stone: 4, food: 6 })
      owner.farmyardSpaceStates = [{
        spaceKey: '0-0', sourceCardId: POTTERS, kind: 'farmyard-goods-token',
        resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
      }]
    } })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }
    await driver.command(0, { type: 'action', spaceId: 'grain-seeds' })
    expect((await roomSnapshot(pages[0])).interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'confirm-next-player' },
    })
    await driver.command(0, { type: 'anytime', actionId: 'C94-stable-cleaner-anytime' })
    await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: { stables: [{ row: 0, col: 0 }] } })
    let current = await assertClientsAgree(pages)
    expect(options(current).map(option => option.sourceCard)).toEqual(expect.arrayContaining([POTTERS, TOOLBOX]))
    const claim = options(current).find(option => option.sourceCard === POTTERS)!
    await driver.ui(0, () => pages[0].locator('.interaction-bar').locator(`[data-choice-value="${claim.value}"]`).click())
    current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', sourceCard: POTTERS })
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 5, clay: 1 })
    expect(current.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(current.state.events.filter(event => event.type === 'anytime.completed')).toHaveLength(0)
    await assertReadOnly(pages[1])
    const child = { public: publicRoomState(current), interaction: current.interaction }
    await driver.reload()
    current = await assertClientsAgree(pages)
    expect(publicRoomState(current)).toEqual(child.public)
    expect(current.interaction).toEqual(child.interaction)
    const exchange = nonSkip(current)
    if (exchange.value.startsWith('trade:')) {
      await pages[0].locator('[data-testid^="anytime-exchange-option-A040_PottersYard-"]')
        .getByRole('button', { name: '+', exact: true }).click()
      await driver.ui(0, () => pages[0].locator('.exchange-confirm').click())
    } else {
      await driver.ui(0, () => pages[0].locator(`.interaction-bar [data-choice-value="${exchange.value}"]`).click())
    }
    for (let step = 0; step < 4; step++) {
      current = await roomSnapshot(pages[0])
      if (current.interaction.stateId === 'wait' && current.interaction.promptKey === 'ui.interactionToolboxImprovement') break
      const toolbox = options(current).find(option => option.sourceCard === TOOLBOX && !option.value.startsWith('__'))!
      await driver.command(0, { type: 'choice', value: toolbox.value })
    }
    current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionToolboxImprovement' })
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 7, clay: 0 })
    expect(current.state.players[0]!.farmyardSpaceStates?.filter(token => token.sourceCardId === POTTERS)).toEqual([])
    const purchase = { public: publicRoomState(current), interaction: current.interaction }
    await driver.reload()
    current = await assertClientsAgree(pages)
    expect(publicRoomState(current)).toEqual(purchase.public)
    expect(current.interaction).toEqual(purchase.interaction)
    const accept = nonSkip(current)
    await driver.ui(0, () => pages[0].locator(`.interaction-bar [data-choice-value="${accept.value}"]`).click())
    current = await roomSnapshot(pages[0])
    if (!current.state.players[0]!.improvements.includes('Major_Joinery')) {
      await driver.command(0, { type: 'choice', value: 'Major_Joinery' })
    }
    current = await assertClientsAgree(pages)
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 2, food: 7, clay: 0, grain: 1 })
    expect(current.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(current.scores?.find(score => score.playerId === 'p1')?.total).toBe(-8)
    expect(current.state.log.filter(entry => entry.key === 'log.playImprovement')).toHaveLength(1)
    expect(current.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(current.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([
      expect.objectContaining({ newlyUsedTiles: [{ playerId: 'p1', row: 0, col: 0 }] }),
    ])
    const completions = current.state.events.filter(event => event.type === 'anytime.completed')
    expect(completions).toEqual([expect.objectContaining({
      actorPlayerId: 'p1', anytimeActionId: 'C94-stable-cleaner-anytime', turn: expect.objectContaining({ kind: 'after-turn' }),
    })])
    const joined = current.state.events.find(event => event.type === 'card.played' && event.cardId === 'Major_Joinery')!
    expect(completions[0]!.seq).toBeLessThan(joined.seq)
    expect(current.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const finished = publicRoomState(current)
    await driver.reload()
    expect(publicRoomState(await assertClientsAgree(pages))).toEqual(finished)
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('feeding batch reactions survive a pending room reload without repeating the exchange or food payment', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 42, configure: state => {
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources.food = 0
        player.farmTerrain = []
      }
      const owner = state.players[0]!
      owner.improvements = ['Major_Fireplace1']
      owner.minorPlayed = ['E053_BoarSpear']
      owner.occupationPlayed = ['B104_SheepWalker']
      Object.assign(owner.resources, { sheep: 1, food: 2, boar: 0 })
      const room = owner.roomTiles[0]!
      owner.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      state.players[1]!.resources.food = 4
      const occupied = state.actionSpaces[0]!
      for (const player of state.players) for (const worker of player.workers) {
        if (worker.isActive) occupied.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
    } })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }
    await driver.command(0, { type: 'roundEnd' })
    for (let step = 0; step < 16; step++) {
      const current = await roomSnapshot(pages[0])
      if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'feed') break
      if (current.interaction.stateId !== 'wait') throw new Error('Expected harvest preparation')
      const actor = current.interaction.playerIndex
      const pending = await roomSnapshot(pages[actor]!)
      expect(options(pending).some(option => option.value === '__skip__')).toBe(true)
      await driver.command(actor, { type: 'choice', value: '__skip__' })
    }
    let current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    await pages[0].getByTestId('harvest-feed-option-B104_SheepWalker-ex0').getByRole('button', { name: '+', exact: true }).click()
    await driver.ui(0, () => pages[0].locator('.exchange-confirm').click())
    current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'E053_BoarSpear' })
    expect(current.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 0, begging: 0 })
    expect(current.state.log.filter(entry => entry.key === 'log.harvestFeedDetail')).toHaveLength(0)
    await assertReadOnly(pages[1])
    const pending = { public: publicRoomState(current), interaction: current.interaction }
    await driver.reload()
    current = await assertClientsAgree(pages)
    expect(publicRoomState(current)).toEqual(pending.public)
    expect(current.interaction).toEqual(pending.interaction)
    const spear = nonSkip(current)
    await driver.ui(0, () => pages[0].locator(`.interaction-bar [data-choice-value="${spear.value}"]`).click())
    await pages[0].locator('[data-testid^="anytime-exchange-option-E053_BoarSpear-"]')
      .getByRole('button', { name: '+', exact: true }).click()
    await driver.ui(0, () => pages[0].locator('.exchange-confirm').click())
    current = await assertClientsAgree(pages)
    expect(current.state.round).toBe(5)
    expect(current.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, food: 2, begging: 0 })
    expect(current.state.events.filter(event => event.type === 'harvest.feedConverted')).toHaveLength(1)
    expect(current.state.events.filter(event => event.type === 'resource.paid' &&
      event.actorPlayerId === 'p1' && event.paymentFor === 'feeding')).toHaveLength(1)
    expect(current.state.log.filter(entry => entry.key === 'log.harvestFeedDetail' && entry.playerId === 'p1')).toHaveLength(1)
    const finished = publicRoomState(current)
    await driver.reload()
    expect(publicRoomState(await assertClientsAgree(pages))).toEqual(finished)
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('feeding Joinery leaves Plow Builder available through a room reload before settling hunger once', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 42, configure: state => {
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.farmTerrain = []
        player.houseAnimals = {}
        Object.assign(player.resources, { food: 0, wood: 0, sheep: 0, boar: 0, cattle: 0 })
      }
      const owner = state.players[0]!
      owner.improvements = ['Major_Joinery']
      owner.occupationPlayed = ['E091_PlowBuilder']
      Object.assign(owner.resources, { food: 3, wood: 1 })
      state.players[1]!.resources.food = 4
      const occupied = state.actionSpaces[0]!
      for (const player of state.players) for (const worker of player.workers) {
        if (worker.isActive) occupied.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
    } })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }
    await driver.command(0, { type: 'roundEnd' })
    for (let step = 0; step < 16; step++) {
      const current = await roomSnapshot(pages[0])
      if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'feed') break
      if (current.interaction.stateId !== 'wait') throw new Error('Expected harvest preparation')
      const actor = current.interaction.playerIndex
      expect(options(await roomSnapshot(pages[actor]!)).some(option => option.value === '__skip__')).toBe(true)
      await driver.command(actor, { type: 'choice', value: '__skip__' })
    }
    let current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed', foodUsed: 3, remaining: 1 } })
    expect(current.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, begging: 0 })
    expect(current.interaction.anytimeActions.map(action => action.id)).not.toContain('E91-plow-builder-anytime')
    await pages[0].getByTestId('harvest-feed-option-Major_Joinery-ex0').getByRole('button', { name: '+', exact: true }).click()
    await driver.ui(0, () => pages[0].locator('.exchange-confirm').click())
    current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(current.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, begging: 0 })
    expect(current.interaction).toMatchObject({ request: { maxTradeTimesBySourceId: { Major_Joinery: 0 } } })
    expect(current.interaction.anytimeActions.map(action => action.id)).toContain('E91-plow-builder-anytime')
    expect(current.state.log.filter(entry => entry.key === 'log.harvestFeedDetail' && entry.playerId === 'p1')).toHaveLength(0)
    await driver.ui(0, () => pages[0].locator('[data-anytime-action-id="E91-plow-builder-anytime"]').click())
    current = await assertClientsAgree(pages)
    expect(current.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, sourceCard: 'E091_PlowBuilder', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    expect(current.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, begging: 0 })
    expect(current.state.players[0]!.fields).toEqual([])
    expect(current.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding'))
      .toHaveLength(0)
    expect(current.state.log.filter(entry => entry.key === 'log.harvestFeedDetail' && entry.playerId === 'p1')).toHaveLength(0)
    await assertReadOnly(pages[1])
    await expect(pages[1].locator('.farm-tile.selectable, .farm-tile.selected')).toHaveCount(0)
    const pending = { public: publicRoomState(current), interaction: current.interaction }
    await driver.reload()
    current = await assertClientsAgree(pages)
    expect(publicRoomState(current)).toEqual(pending.public)
    expect(current.interaction).toEqual(pending.interaction)
    await assertReadOnly(pages[1])
    await expect(pages[1].locator('.farm-tile.selectable, .farm-tile.selected')).toHaveCount(0)
    const tile = pages[0].locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-0"]')
    await expect(tile).toHaveClass(/selectable/)
    await tile.click()
    await driver.ui(0, () => pages[0].locator('.interaction-bar').getByRole('button', { name: 'Confirm plow', exact: true }).click())
    current = await assertClientsAgree(pages)
    expect(current.state.players[0]!.fields).toEqual([expect.objectContaining({ row: 0, col: 0 })])
    expect(current.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, begging: 0 })
    expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(current.interaction.anytimeActions.map(action => action.id)).not.toContain('E91-plow-builder-anytime')
    await driver.ui(0, () => pages[0].locator('.exchange-confirm').click())
    current = await assertClientsAgree(pages)
    expect(current.state.round).toBe(5)
    expect(current.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, begging: 0 })
    expect(current.state.players[0]!.fields).toEqual([expect.objectContaining({ row: 0, col: 0 })])
    expect(current.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === 'Major_Joinery'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', paid: { wood: 1 }, gained: { food: 2 }, times: 1 })])
    expect(current.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'E091_PlowBuilder'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', resources: { food: 1 } })])
    expect(current.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding'))
      .toEqual([expect.objectContaining({ resources: { food: 4, wood: 1 } })])
    expect(current.state.events.filter(event => event.type === 'farm.fieldPlowed'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', sourceCardId: 'E091_PlowBuilder', fields: [{ playerId: 'p1', row: 0, col: 0 }] })])
    expect(current.state.log.filter(entry => entry.key === 'log.harvestFeedDetail' && entry.playerId === 'p1')).toHaveLength(1)
    expect(current.scores?.find(score => score.playerId === 'p1')?.total).toBe(-11)
    const finished = publicRoomState(current)
    await driver.reload()
    expect(publicRoomState(await assertClientsAgree(pages))).toEqual(finished)
  } finally { await Promise.all(pages.map(page => page.close())) }
})
