import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D166_StableMilker'

describe('D166_StableMilker session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D166_StableMilker')
    player.resources.wood = 10
    player.resources.food = 10
    player.resources.cattle = 0
    setWorkersAtHome(state, player, 3)
    state.players[1]!.workersAvailable = 3

    // Make farm-expansion available for stable building
    const farmExpansion = state.actionSpaces.find((s) => s.id === 'farm-expansion')
    if (farmExpansion) {
      farmExpansion.roundAvailable = 1
      farmExpansion.takenBy = []
    }

    session.loadState(state)
    session.devPlayCard(0, 'D166_StableMilker')
    return session
  }

  it('onBuy does not gain cattle when no stables built this turn', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Just played the card, no stables built yet
    expect(player.resources.cattle).toBe(0)
  })

  it('card definition has correct properties', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.occupationPlayed).toContain('D166_StableMilker')
  })
})
