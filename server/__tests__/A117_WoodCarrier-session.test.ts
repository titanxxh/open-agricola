import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A117_WoodCarrier'

const CARD_ID = 'A117_WoodCarrier'

const setup = ({
  minors = [],
  majors = [],
  occupations = [],
}: {
  minors?: string[]
  majors?: string[]
  occupations?: string[]
} = {}) => {
  const session = new GameSession(117, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = occupations
  player.minorPlayed = minors
  player.improvements = majors
  player.resources.food = 2
  player.resources.wood = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

describe('A117 Wood Carrier parity', () => {
  it('A117 S1: playing Wood Carrier with no improvements grants no wood', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A117 S2: two minor improvements grant two wood when Wood Carrier is played', () => {
    const response = playOccupation(setup({ minors: ['A037_Bucksaw', 'A050_MilkJug'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('A117 S3: one major and two minor improvements grant three wood', () => {
    const response = playOccupation(setup({
      minors: ['A037_Bucksaw', 'A050_MilkJug'],
      majors: ['Major_Fireplace1'],
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('A117 S4: an existing occupation does not increase Wood Carrier wood', () => {
    const response = playOccupation(setup({ occupations: ['A103_Portmonger'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})
