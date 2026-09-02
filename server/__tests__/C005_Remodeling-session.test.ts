import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C005_Remodeling'

const CARD_ID = 'C005_Remodeling'

const setup = ({ food = 1, houseType = 'wood', majors = 0 } = {}) => {
  const session = new GameSession(5, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources = { ...player.resources, food, clay: 0 }
  player.houseType = houseType as typeof player.houseType
  player.rooms = 2
  player.improvements = ['Major_ClayOven', 'Major_Joinery'].slice(0, majors)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('C005 Remodeling parity', () => {
  it('C005 S1: two clay rooms and two major improvements grant four clay after paying one food', () => {
    const response = playMinor(setup({ houseType: 'clay', majors: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 4 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C005 S2: major improvements grant clay when the house is not clay', () => {
    const response = playMinor(setup({ majors: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('C005 S3: no clay rooms or major improvements grants no clay', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C005 S4: no food keeps Remodeling unavailable', () => {
    const response = playMinor(setup({ food: 0, houseType: 'clay', majors: 2 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
  })
})
