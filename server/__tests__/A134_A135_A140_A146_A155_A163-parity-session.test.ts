import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A134_FullFarmer'
import '../../shared/cards/A/A135_AnimalReeve'
import '../../shared/cards/A/A140_ShovelBearer'
import '../../shared/cards/A/A146_StorehouseSteward'
import '../../shared/cards/A/A155_Conjurer'
import '../../shared/cards/A/A163_BuildingExpert'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 3, round = 5, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7134 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.pastures = []
    player.stableTiles = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait' && response.state.players[0]!.occupationHand.includes(cardId)) {
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const bonusScore = (response: SessionResponse, cardId: string, playerIndex = 0) => response.scores[playerIndex]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('A134 Full Farmer parity', () => {
  const CARD_ID = 'A134_FullFarmer'

  it('A134 S1: playing Full Farmer immediately gains one wood and one clay', () => {
    const response = playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  const scorePasture = (animalCount: number) => {
    const session = setup({ cardId: CARD_ID, round: 14, resources: { sheep: animalCount } })
    const state = session.getState().state
    state.players[0]!.pastures = [{
      id: 'full', size: 1, tiles: [{ row: 0, col: 2 }], stables: 1,
      animalType: 'sheep', animalCount,
    }]
    state.players[0]!.stableTiles = [{ row: 0, col: 2 }]
    session.loadState(state)
    return bonusScore(session.getState(), CARD_ID)
  }

  it('A134 S2: each pasture filled to capacity scores one Full Farmer point', () => {
    expect(scorePasture(4)).toBe(1)
  })

  it('A134 S3: a pasture below capacity scores no Full Farmer point', () => {
    expect(scorePasture(3)).toBe(0)
  })
})

describe('A135 Animal Reeve parity', () => {
  const CARD_ID = 'A135_AnimalReeve'

  for (const { scenario, round, wood } of [
    { scenario: 'S1', round: 5, wood: 4 },
    { scenario: 'S2', round: 8, wood: 3 },
    { scenario: 'S3', round: 11, wood: 2 },
    { scenario: 'S4', round: 13, wood: 1 },
    { scenario: 'S5', round: 14, wood: 0 },
  ]) {
    it(`A135 ${scenario}: playing Animal Reeve in round ${round} gains ${wood} wood`, () => {
      const response = playOccupation(setup({ cardId: CARD_ID, played: false, round }), CARD_ID)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(wood)
    })
  }

  it('A135 S6: Animal Reeve scores every player at the two three and four animal-set thresholds', () => {
    const session = setup({ cardId: CARD_ID, round: 14 })
    const state = session.getState().state
    ;[4, 3, 2].forEach((count, index) => {
      Object.assign(state.players[index]!.resources, { sheep: count, boar: count, cattle: count })
    })
    session.loadState(state)
    const response = session.getState()
    expect(bonusScore(response, CARD_ID, 0)).toBe(5)
    expect(bonusScore(response, CARD_ID, 1)).toBe(3)
    expect(bonusScore(response, CARD_ID, 2)).toBe(1)
  })
})

describe('A140 Shovel Bearer parity', () => {
  const CARD_ID = 'A140_ShovelBearer'

  it('A140 S1: Shovel Bearer is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  const collect = (action: 'clay-pit' | 'hollow', taken: number, other: number) => {
    const session = setup({ cardId: CARD_ID })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = action === 'clay-pit' ? taken : other
    state.actionSpaces.find((space) => space.id === 'hollow')!.resources.clay = action === 'hollow' ? taken : other
    session.loadState(state)
    return session.takeAction(0, action)
  }

  it('A140 S2: using Clay Pit gains food equal to clay on Hollow', () => {
    const response = collect('clay-pit', 2, 4)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 4 })
  })

  it('A140 S3: using Hollow gains food equal to clay on Clay Pit', () => {
    const response = collect('hollow', 3, 5)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 5 })
  })

  it('A140 S4: a non-target action or empty other clay space grants no Shovel Bearer food', () => {
    expect(collect('clay-pit', 2, 0).state.players[0]!.resources.food).toBe(0)
    expect(setup({ cardId: CARD_ID }).takeAction(0, 'day-laborer').state.players[0]!.resources.food).toBe(2)
  })
})

describe('A146 Storehouse Steward parity', () => {
  const CARD_ID = 'A146_StorehouseSteward'

  it('A146 S1: Storehouse Steward is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const { scenario, food, resource } of [
    { scenario: 'S2', food: 2, resource: 'stone' },
    { scenario: 'S3', food: 3, resource: 'reed' },
    { scenario: 'S4', food: 4, resource: 'clay' },
    { scenario: 'S5', food: 5, resource: 'wood' },
  ] as const) {
    it(`A146 ${scenario}: taking exactly ${food} food gains one ${resource}`, () => {
      const session = setup({ cardId: CARD_ID })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = food
      session.loadState(state)
      const response = session.takeAction(0, 'fishing')
      expect(response.state.players[0]!.resources.food).toBe(food)
      expect(response.state.players[0]!.resources[resource]).toBe(1)
    })
  }

  it('A146 S6: taking one or six food grants no Storehouse Steward resource', () => {
    for (const food of [1, 6]) {
      const session = setup({ cardId: CARD_ID })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = food
      session.loadState(state)
      const response = session.takeAction(0, 'fishing')
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    }
  })
})

describe('A155 Conjurer parity', () => {
  const CARD_ID = 'A155_Conjurer'

  it('A155 S1: Conjurer is played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 4 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A155 S2: Traveling Players gains accumulated food plus one wood and one grain', () => {
    const session = setup({ cardId: CARD_ID, playerCount: 4 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 3
    session.loadState(state)
    const response = session.takeAction(0, 'traveling-players')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, grain: 1 })
  })

  it('A155 S3: non-Traveling-Players actions grant no Conjurer goods', () => {
    const response = setup({ cardId: CARD_ID, playerCount: 4 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
  })
})

describe('A163 Building Expert parity', () => {
  const CARD_ID = 'A163_BuildingExpert'

  it('A163 S1: Building Expert is played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 4 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const { scenario, ordinal, resource } of [
    { scenario: 'S2', ordinal: 1, resource: 'wood' },
    { scenario: 'S3', ordinal: 2, resource: 'clay' },
    { scenario: 'S4', ordinal: 3, resource: 'reed' },
    { scenario: 'S5', ordinal: 4, resource: 'stone' },
    { scenario: 'S6', ordinal: 5, resource: 'stone' },
  ] as const) {
    it(`A163 ${scenario}: the ${ordinal}th person using Resource Market gains one ${resource}`, () => {
      const session = setup({ cardId: CARD_ID, playerCount: 4 })
      const state = session.getState().state
      const owner = state.players[0]!
      setActiveWorkerCount(owner, Math.max(2, ordinal))
      setWorkersAtHome(state, owner, Math.max(2, ordinal))
      const priorSpaces = ['forest', 'clay-pit', 'reed-bank', 'fishing']
      for (let index = 0; index < ordinal - 1; index++) {
        const workerId = String(index + 1)
        state.actionSpaces.find((space) => space.id === priorSpaces[index])!.takenBy = [{ playerId: owner.id, workerId }]
        recordRoundPlacement(owner, priorSpaces[index]!, workerId)
      }
      session.loadState(state)
      const before = session.getState().state.players[0]!.resources[resource]
      const response = session.takeAction(0, 'resource-market-4')
      expect(response.state.players[0]!.resources[resource]).toBe(before + 1 + (resource === 'reed' || resource === 'stone' ? 1 : 0))
    })
  }
})
