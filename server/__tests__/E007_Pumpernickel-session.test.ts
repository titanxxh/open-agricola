import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E007_Pumpernickel'

const CARD_ID = 'E007_Pumpernickel'

const setup = () => {
  const session = new GameSession(407)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources.grain = 1
  player.resources.food = 0
  session.loadState(state)
  return session
}

const buyPumpernickel = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6; step += 1) {
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find(
      (entry) => entry.value === CARD_ID
        || entry.value.startsWith('action-improvement-')
        || entry.value.startsWith('flow-'),
    )
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
  }
  return response
}

describe('E007 Pumpernickel native session', () => {
  it('pays 1 grain, gains 4 food, and passes to the next player', () => {
    const session = setup()

    const response = buyPumpernickel(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid',
      resources: { grain: 1 },
      paymentFor: 'minor-improvement',
    }))
  })
})
