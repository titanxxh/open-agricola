import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B102_Consultant'

const CARD_ID = 'B102_Consultant'

const play = (playerCount: number) => {
  const session = new GameSession(102, undefined, { playerCount })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = []
  player.resources = {
    ...player.resources,
    grain: 0,
    clay: 0,
    reed: 0,
    sheep: 0,
  }
  session.loadState(state)
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B102 Consultant parity', () => {
  it('B102 S1: a one-player game has no Lessons space and cannot play Consultant', () => {
    const response = play(1)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it.each([
    { playerCount: 2, resource: 'clay' as const, amount: 3 },
    { playerCount: 3, resource: 'reed' as const, amount: 2 },
    { playerCount: 4, resource: 'sheep' as const, amount: 2 },
  ])('B102 S$playerCount: a $playerCount-player game grants $amount $resource', ({ playerCount, resource, amount }) => {
    const response = play(playerCount)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources[resource]).toBe(amount)
  })
})
