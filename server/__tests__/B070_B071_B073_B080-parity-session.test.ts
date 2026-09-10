import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B070_NewPurchase'
import '../../shared/cards/B/B071_HarvestHouse'
import '../../shared/cards/B/B073_GiftBasket'
import '../../shared/cards/B/B080_HardPorcelain'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setup = ({ cardId, played = true, round = 5, occupations = 0, resources = {} }: {
  cardId: string; played?: boolean; round?: number; occupations?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7400 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait' && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(0, branch.value)
  }
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  return card ? session.resolveChoice(0, card.value) : response
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const chooseByResource = (session: GameSession, response: SessionResponse, resource: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find((candidate) => candidate.value !== '__skip__'
    && JSON.stringify(candidate).includes(resource))
    ?? options(response).find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B070 New Purchase parity', () => {
  it('B070 S1: New Purchase can be played for free', () => {
    expect(playMinor(setup({ cardId: 'B070_NewPurchase', played: false }), 'B070_NewPurchase')
      .state.players[0]!.minorPlayed).toContain('B070_NewPurchase')
  })

  it('B070 S2: before a harvest round two food may buy one grain', () => {
    const session = setup({ cardId: 'B070_NewPurchase', round: 3, resources: { food: 2 } })
    const response = chooseByResource(session, endRound(session), 'grain')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 0 })
  })

  it('B070 S3: before a harvest round both purchases can yield grain and vegetable', () => {
    const session = setup({ cardId: 'B070_NewPurchase', round: 3, resources: { food: 6 } })
    let response = endRound(session)
    response = chooseByResource(session, response, 'grain')
    response = chooseByResource(session, response, 'vegetable')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 1 })
  })

  it('B070 S4: both crop purchases may be declined and non-harvest rounds offer neither', () => {
    const session = setup({ cardId: 'B070_NewPurchase', round: 3, resources: { food: 6 } })
    let response = endRound(session)
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(6)
    const nonHarvest = endRound(setup({ cardId: 'B070_NewPurchase', round: 5, resources: { food: 6 } }))
    expect(nonHarvest.interaction.stateId !== 'wait' || nonHarvest.interaction.sourceCard !== 'B070_NewPurchase').toBe(true)
  })
})

describe('B071 Harvest House parity', () => {
  it.each([
    ['S1', 3, 0, true], ['S2', 5, 1, true], ['S3', 8, 1, false],
  ] as const)('B071 %s: Harvest House reward follows completed-harvest and occupation equality', (_scenario, round, occupations, reward) => {
    const response = playMinor(setup({ cardId: 'B071_HarvestHouse', played: false, round, occupations,
      resources: { wood: 1, clay: 1, reed: 1 } }), 'B071_HarvestHouse')
    expect(response.state.players[0]!.minorPlayed).toContain('B071_HarvestHouse')
    expect(response.state.players[0]!.resources).toMatchObject({
      food: reward ? 1 : 0, grain: reward ? 1 : 0, vegetable: reward ? 1 : 0,
    })
  })
})

describe('B073 Gift Basket parity', () => {
  it.each([
    ['S1', 2, 'vegetable'], ['S2', 3, 'food'], ['S3', 4, 'grain'], ['S4', 5, 'vegetable'],
  ] as const)('B073 %s: exactly %i rooms gain one %s', (_scenario, rooms, resource) => {
    const session = setup({ cardId: 'B073_GiftBasket', played: false, occupations: 3, resources: { reed: 1 } })
    session.state.players[0]!.rooms = rooms
    session.state.players[0]!.roomTiles = Array.from({ length: rooms }, (_, col) => ({ row: 2, col }))
    session.loadState(session.state)
    const response = playMinor(session, 'B073_GiftBasket')
    expect(response.state.players[0]!.minorPlayed).toContain('B073_GiftBasket')
    expect(response.state.players[0]!.resources[resource]).toBe(1)
  })

  it('B073 S5: fewer than three occupations keep Gift Basket unavailable', () => {
    const response = playMinor(setup({ cardId: 'B073_GiftBasket', played: false, occupations: 2, resources: { reed: 1 } }), 'B073_GiftBasket')
    expect(response.state.players[0]!.minorHand).toContain('B073_GiftBasket')
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })
})

describe('B080 Hard Porcelain parity', () => {
  it('B080 S1: paying one clay plays Hard Porcelain', () => {
    expect(playMinor(setup({ cardId: 'B080_HardPorcelain', played: false, resources: { clay: 1 } }), 'B080_HardPorcelain')
      .state.players[0]!.minorPlayed).toContain('B080_HardPorcelain')
  })

  it.each([
    ['S2', 2, 1], ['S3', 3, 2], ['S4', 4, 3],
  ] as const)('B080 %s: %i clay exchange for %i stone', (_scenario, clay, stone) => {
    const session = setup({ cardId: 'B080_HardPorcelain', resources: { clay } })
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('expected Hard Porcelain choice')
    const option = options(response).find((candidate) => {
      return candidate.effectPreview?.kind === 'resourceExchange'
        && candidate.effectPreview.resourcesPaid?.clay === clay
        && candidate.effectPreview.resourcesGained?.stone === stone
    })
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone })
  })

  it('B080 S5: an unaffordable Hard Porcelain tier is rejected atomically', () => {
    const session = setup({ cardId: 'B080_HardPorcelain', resources: { clay: 1 } })
    const response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, stone: 0 })
  })
})
