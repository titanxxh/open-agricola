import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C142_MarketCrier'

const CARD_ID = 'C142_MarketCrier'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ played = true, actor = 0 } = {}) => {
  const session = new GameSession(6142, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  return response
}

const chooseMarketCrier = (session: GameSession, response: SessionResponse, accept: boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const choice = options(response).find((option) => accept
    ? option.value !== '__skip__' && option.sourceCard === CARD_ID
    : option.value === '__skip__')
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

describe('C142 Market Crier parity', () => {
  it('C142 S1: Market Crier is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C142 S2: accepting after Grain Seeds gives the owner grain and vegetable and every opponent grain', () => {
    const session = setup()
    const response = chooseMarketCrier(session, session.takeAction(0, 'grain-seeds'), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[2]!.resources.grain).toBe(1)
  })

  it('C142 S3: declining after Grain Seeds keeps only its normal grain', () => {
    const session = setup()
    const response = chooseMarketCrier(session, session.takeAction(0, 'grain-seeds'), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 0 })
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[2]!.resources.grain).toBe(0)
  })

  it('C142 S4: a non-Grain-Seeds action does not offer Market Crier', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('C142 S5: an opponent using Grain Seeds does not trigger the owners Market Crier', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[2]!.resources.grain).toBe(0)
  })
})
