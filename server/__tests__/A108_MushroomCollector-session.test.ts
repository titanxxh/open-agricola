import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A108_MushroomCollector'

const CARD_ID = 'A108_MushroomCollector'
const FILLER = '__test_placeholder__'

const setup = ({ woodOnSpace = 3, woodInSupply = 0, played = true } = {}) => {
  const session = new GameSession(5108, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = woodInSupply
  owner.resources.food = 0
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = woodOnSpace
  forest.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const cardOption = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return response.interaction.request.options?.find((option) =>
    option.sourceCard === CARD_ID && option.value !== '__skip__')
}

const accept = (session: GameSession, response: SessionResponse) => {
  const option = cardOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex : 0, option!.value)
}

describe('A108 Mushroom Collector parity', () => {
  it('A108 S1: Mushroom Collector is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A108 S2: after using Forest the player may return one wood there for two food', () => {
    const session = setup()

    const response = accept(session, session.takeAction(0, 'forest'))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 2 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A108 S3: the exchange after using Forest may be declined', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')
    expect(cardOption(response)).toBeDefined()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A108 S4: an empty wood accumulation space can still trigger using wood already in supply', () => {
    const session = setup({ woodOnSpace: 0, woodInSupply: 1 })

    const response = accept(session, session.takeAction(0, 'forest'))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A108 S5: a non-wood accumulation space does not trigger Mushroom Collector', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
    clayPit.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})
