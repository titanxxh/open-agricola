import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A116_WoodCutter'

describe('A116_WoodCutter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    state.players[1]!.workersAvailable = 2

    // Ensure wood spaces have accumulated resources
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const copse = state.actionSpaces.find((s) => s.id === 'copse')
    if (copse) copse.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')
    return session
  }

  it('gains 1 extra wood when using forest', () => {
    const session = setup()

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 3 accumulated wood + 1 bonus from WoodCutter = 4
    expect(after.players[0]!.resources.wood).toBe(3 + 1)
  })

  it('gains 1 extra wood when using copse', () => {
    const session = setup()

    const resp = session.takeAction(0, 'copse')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated wood + 1 bonus from WoodCutter = 3
    expect(after.players[0]!.resources.wood).toBe(2 + 1)
  })

  it('does not trigger on non-wood spaces', () => {
    const session = setup()

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(0)
  })

  it('does not trigger for opponent using wood space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should not get bonus wood — scope is 'player' only
    expect(after.players[0]!.resources.wood).toBe(0)
    // Opponent gets 3 accumulated wood but no bonus
    expect(after.players[1]!.resources.wood).toBe(3)
  })
})
