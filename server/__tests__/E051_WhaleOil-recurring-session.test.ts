import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E051_WhaleOil'
import '../../shared/cards/A/A116_WoodCutter'

const CARD_ID = 'E051_WhaleOil'
const OCCUPATION_ID = 'A116_WoodCutter'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, cardFood = 0, food = 0, resources = {},
}: {
  played?: boolean
  cardFood?: number
  food?: number
  resources?: Partial<{ wood: number }>
} = {}) => {
  const session = new GameSession(6051, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationHand = [OCCUPATION_ID]
  owner.resources.food = food
  Object.assign(owner.resources, resources)
  if (played) {
    owner.cardStates = {
      [CARD_ID]: { extraData: { foodCount: cardFood }, infobox: `${cardFood} Food` },
    }
  }
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('missing fishing')
  fishing.resources.food = 3
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) {
      response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
  }
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationPlayed.includes(OCCUPATION_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === OCCUPATION_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  return response
}

const cardFood = (response: SessionResponse) =>
  readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'foodCount') ?? 0

describe('E051 Whale Oil parity', () => {
  it('E051 S1: paying one wood plays Whale Oil with no food on it', () => {
    const response = playMinor(setup({ played: false, resources: { wood: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardFood(response)).toBe(0)
  })

  it('E051 S2: using Fishing places one food on Whale Oil', () => {
    const response = setup().takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(cardFood(response)).toBe(1)
  })

  it('E051 S3: a non-Fishing action places no food on Whale Oil', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(cardFood(response)).toBe(0)
  })

  it('E051 S4: before an occupation Whale Oil grants food equal to its stored food', () => {
    const response = playOccupation(setup({ cardFood: 3, food: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(8)
    expect(cardFood(response)).toBe(3)
  })

  it('E051 S5: zero stored food gives no food before an occupation', () => {
    const response = playOccupation(setup({ food: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(cardFood(response)).toBe(0)
  })
  it('retains stored food through two independent occupations and funds the second payment', () => {
    const session = setup({ cardFood: 3 })
    let response = playOccupation(session)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(cardFood(response)).toBe(3)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players[0]!.resources.food = 0
    state.players[0]!.occupationHand = ['A125_Priest']
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    response = session.takeAction(0, 'lessons')
    const priest = options(response).find((option) => option.value === 'A125_Priest')
    if (priest) response = session.resolveChoice(0, priest.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A125_Priest')
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(cardFood(response)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.infobox).toBe('3 Food')
  })

})
