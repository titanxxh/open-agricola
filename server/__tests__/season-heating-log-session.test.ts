import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/M/M032_PeatHut'
import '../../shared/cards/M/M082_Firewood'
import '../../shared/cards/M/M085_OvenInstallation'
import '../../shared/cards/M/M086_SpinningMill'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const summerHarvest = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({
    seed: 1378,
    options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true, enableThroughTheSeasons: true },
    configure(state) {
      state.round = 4
      state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
      for (const player of state.players) {
        player.minorHand = player.occupationHand = ['__test_placeholder__']
        player.resources = { ...emptyResources, fuel: 3, wood: 4, food: 50 }
        markAllWorkersUsed(state, player)
      }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const settle = (session: ReturnType<typeof summerHarvest>, stopAtFeed = false) => {
  let response = session.getState()
  for (let step = 0; step < 30 && response.interaction.stateId === 'wait'; step++) {
    const { playerIndex, request } = response.interaction
    expect(request.kind).not.toBe('heating')
    if (stopAtFeed && request.kind === 'feed') break
    if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') response = session.resolveChoice(playerIndex, 'confirm')
    else if (request.kind === 'choice') {
      const stop = request.options.find(option => option.value === '__skip__' || option.value === '__done__')
      if (!stop) throw new Error(JSON.stringify(response.interaction))
      response = session.resolveChoice(playerIndex, stop.value)
    } else throw new Error(JSON.stringify(response.interaction))
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const restore = (session: GameSession) => {
  const saved = serializeSessionSnapshot(session.state, session)
  const restored = new GameSession(rehydrateState(structuredClone(saved)))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.state.events).toEqual(session.state.events)
  expect(restored.state.log).toEqual(session.state.log)
  expect(restored.getState().scores).toEqual(session.getState().scores)
  return restored
}

describe('summer heating settlement logs', () => {
  it('records each actual summer waiver without heating payment or sickness', () => {
    const session = summerHarvest()
    const scores = session.getState().scores
    expect(session.performRoundEnd().ok).toBe(true)
    const response = settle(session)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players.map(player => player.resources)).toEqual([
      { ...emptyResources, fuel: 3, wood: 4, food: 46 },
      { ...emptyResources, fuel: 3, wood: 4, food: 46 },
    ])
    expect(response.state.players.map(player => player.sickWorkerIds)).toEqual([[], []])
    expect(response.state.events.filter(event => event.type === 'harvest.heated')).toEqual(['p1', 'p2'].map(playerId => expect.objectContaining({
      playerId, required: 0, fuelUsed: 0, woodToFuel: 0, sickWorkerIds: [],
      seasonalWaiver: { season: 'summer', normalRequired: 2, waived: 2 },
    })))
    expect(response.state.log.filter(entry => entry.key === 'log.harvestHeatingWaived')).toHaveLength(2)
    expect(response.state.events.filter(event => event.type === 'resource.moved')).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.paid').map(event => event.resources)).toEqual([{ food: 4 }, { food: 4 }])
    expect(response.scores).toEqual(scores)
  })

  it.each([
    { card: 'M032_PeatHut', expected: 3 },
    { card: 'M085_OvenInstallation', expected: 0 },
    { card: 'Major_Moor_TiledOven', expected: 1 },
    { card: 'Major_Moor_HeatingOven', expected: 1 },
    { card: 'M082_Firewood', expected: 2 },
  ])('keeps $card discounts and caps in the actual $expected waiver', ({ card, expected }) => {
    const session = summerHarvest(state => {
      if (card.startsWith('Major_')) state.players[0]!.improvements = [card]
      else state.players[0]!.minorPlayed = [card]
    })
    expect(session.performRoundEnd().ok).toBe(true)
    const response = settle(session)
    const heating = response.state.events.filter(event => event.type === 'harvest.heated' && event.playerId === 'p1')
    expect(heating).toEqual(expected ? [expect.objectContaining({
      required: 0, fuelUsed: 0, woodToFuel: 0, sickWorkerIds: [],
      seasonalWaiver: { season: 'summer', normalRequired: expected, waived: expected },
    })] : [])
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 3, wood: 4 })
    expect(response.scores).toHaveLength(2)
  })

  it.each(['stone', 'no-moor', 'skip', 'non-harvest'] as const)('omits a false summer waiver for %s', scenario => {
    const session = summerHarvest(state => {
      if (scenario === 'stone') state.players[0]!.houseType = 'stone'
      if (scenario === 'no-moor') state.enableFarmersOfTheMoor = false
      if (scenario === 'skip') writeCardExtraData(state.players[0]!, 'TEST_HarvestSkip', 'skipHarvestRound', 4)
      if (scenario === 'non-harvest') state.round = 3
    })
    expect(session.performRoundEnd().ok).toBe(true)
    const response = settle(session)
    expect(response.state.events.filter(event => event.type === 'harvest.heated' && event.playerId === 'p1')).toEqual([])
    expect(response.state.log.filter(entry => entry.playerId === 'p1' && entry.key === 'log.harvestHeatingWaived')).toEqual([])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.state.players[0]!.sickWorkerIds).toEqual([])
    expect(response.scores).toHaveLength(2)
  })

  it('freezes each player at feeding completion and preserves earlier waivers through undo and recovery', () => {
    let session = summerHarvest(state => {
      for (const player of state.players) {
        player.resources.wood = 1
        player.resources.food = 3
        player.resources.grain = 2
        player.minorPlayed = ['M086_SpinningMill']
        player.improvements = ['Major_Joinery']
      }
    })
    expect(session.performRoundEnd().ok).toBe(true)
    settle(session, true)
    const convertGrain = (playerIndex: number) => {
      const response = session.getState()
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'feed') throw new Error(JSON.stringify(response.interaction))
      expect(response.interaction.playerIndex).toBe(playerIndex)
      const recipe = response.interaction.request.exchangeCatalog?.find(entry => entry.sourceId === '__basic__' && entry.from.grain === 1)
      if (!recipe) throw new Error(JSON.stringify(response.interaction.request))
      const fed = session.resolveChoice(playerIndex, 'confirm', { selections: [{ sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 1 }] })
      expect(fed.ok, fed.error).toBe(true)
      expect(fed.interaction).toMatchObject({ stateId: 'wait', playerIndex, request: { kind: 'feed' } })
      return fed
    }
    const opportunity = convertGrain(0)
    session = restore(session)
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(session.resolveChoice(0, 'confirm', { selections: [] }).ok).toBe(true)
      const fed = settle(session, true)
      expect(fed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'feed' } })
      expect(fed.state.events.filter(event => event.type === 'harvest.heated')).toEqual([
        expect.objectContaining({ playerId: 'p1', seasonalWaiver: { season: 'summer', normalRequired: 2, waived: 2 } }),
      ])
      if (attempt === 0) {
        const undone = session.undoStep()
        expect(undone.ok, undone.error).toBe(true)
        expect(undone.interaction).toEqual(opportunity.interaction)
        expect(undone.state.events.filter(event => event.type === 'harvest.heated')).toEqual([])
        expect(undone.state.log.filter(entry => entry.key === 'log.harvestHeatingWaived')).toEqual([])
        expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1, fuel: 3 })
      }
    }
    session.actionHooks.register({
      id: 'TEST_live-heating-card-state', actions: ['exchange'], phases: ['after'],
      handler: ({ state }) => {
        for (const player of state.players) writeCardExtraData(player, 'M086_SpinningMill', 'heatingRoomDiscount', 1)
      },
    })
    convertGrain(1)
    expect(session.state.players.map(player => player.cardStates.M086_SpinningMill?.extraData?.heatingRoomDiscount)).toEqual([1, 1])
    session = restore(session)
    const settled = settle(session)
    expect(settled.state.events.filter(event => event.type === 'harvest.heated')).toEqual([2, 1].map((waived, index) => expect.objectContaining({
      playerId: `p${index + 1}`, seasonalWaiver: { season: 'summer', normalRequired: waived, waived },
    })))
    expect(settled.state.players.map(player => player.resources)).toEqual([
      { ...emptyResources, food: 0, grain: 1, wood: 1, fuel: 3 }, { ...emptyResources, food: 0, grain: 1, wood: 1, fuel: 3 },
    ])
    expect(settled.state.log.filter(entry => entry.key === 'log.harvestHeatingWaived')).toHaveLength(2)
    expect(restore(session).state.log.filter(entry => entry.key === 'log.harvestHeatingWaived')).toHaveLength(2)
  })

  it('records the last harvest waiver once and retains healthy farmer scores', () => {
    const session = summerHarvest(state => { state.round = 14 })
    expect(session.performRoundEnd().ok).toBe(true)
    const response = settle(session)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.events.filter(event => event.type === 'harvest.heated')).toHaveLength(2)
    expect(response.state.log.filter(entry => entry.key === 'log.harvestHeatingWaived')).toHaveLength(2)
    expect(response.state.players.map(player => player.sickWorkerIds)).toEqual([[], []])
    for (const score of response.scores ?? []) expect(score.categories.find(category => category.key === 'farmers')?.total).toBe(6)
    expect(restore(session).getState().scores).toEqual(response.scores)
  })
})
