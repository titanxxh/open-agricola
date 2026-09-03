import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C158_ForestCampaigner'
import '../../shared/cards/D/D170_FoldBuilder'

describe('C158 Forest Campaigner session', () => {
  it('opens a strict non-Farmland space when its food makes the action payable', () => {
    const session = new GameSession(42, undefined, { playerCount: 5 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    const user = state.players[1]!
    owner.occupationPlayed.push('D170_FoldBuilder')
    user.occupationPlayed.push('C158_ForestCampaigner')
    owner.resources.food = 0
    user.resources.food = 0
    user.resources.wood = 4
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.resources = { ...space.resources, wood: 0 }
      }
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 8
    session.loadState(state)

    expect(session.getState().actionAvailability?.D170_FoldBuilder).toBe(true)
    const response = session.takeAction(1, 'D170_FoldBuilder')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
  })
})
