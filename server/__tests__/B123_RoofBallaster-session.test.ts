import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B123_RoofBallaster'

const CARD_ID = 'B123_RoofBallaster'
const FILLER = '__test_placeholder__'

const setup = ({ rooms = 2, food = 1 }: { rooms?: number; food?: number } = {}) => {
  const session = new GameSession(5423 + rooms, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.rooms = rooms
  state.players[0]!.resources.food = food
  state.players[0]!.resources.stone = 0
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const acceptExchange = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B123 Roof Ballaster parity', () => {
  for (const [scenario, rooms] of [['S1', 2], ['S2', 4]] as const) {
    it(`B123 ${scenario}: paying one food on play gains one stone for each of ${rooms} rooms`, () => {
      const session = setup({ rooms })

      const response = acceptExchange(session, play(session))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.resources.stone).toBe(rooms)
    })
  }

  it('B123 S3: declining the on-play exchange keeps the food and gains no stone', () => {
    const session = setup({ rooms: 4 })
    const played = play(session)
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(played.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 0 })
  })

  it('B123 S4: without food Roof Ballaster is still played but grants no stone', () => {
    const session = setup({ rooms: 4, food: 0 })
    let response = play(session)
    if (response.interaction.stateId === 'wait' &&
      response.interaction.request.options?.some((option) => option.value === '__skip__')) {
      const options = response.interaction.request.options ?? []
      expect(options.every((option) => option.value === '__skip__')).toBe(true)
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0 })
  })
})
