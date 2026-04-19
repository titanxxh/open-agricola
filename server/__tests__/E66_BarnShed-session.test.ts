import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/E/E66_BarnShed'

describe('E66_BarnShed session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorPlayed.push('E66_BarnShed')
    setWorkersAtHome(state, owner, 2)
    owner.resources.grain = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2) // Ensure forest has accumulated resources
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3

    session.loadState(state)
    return session
  }

  it('owner gains 1 grain when opponent uses forest', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    // Walk through player switches for card effect
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Owner gets 1 grain from BarnShed
    expect(after.players[0]!.resources.grain).toBe(1)
  })

  it('does not trigger when owner uses forest', () => {
    const session = setup(0)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should NOT get grain — scope is 'opponent', so owner using forest does not trigger
    expect(after.players[0]!.resources.grain).toBe(0)
  })

  it('does not trigger on non-forest spaces', () => {
    const session = setup(1)

    // Opponent uses copse (another wood space, but not forest)
    const copse = session.getState().state.actionSpaces.find((s) => s.id === 'copse')
    if (copse) copse.resources.wood = 2
    session.loadState(session.getState().state)

    const resp = session.takeAction(1, 'copse')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // No grain from BarnShed — only triggers on 'forest'
    expect(after.players[0]!.resources.grain).toBe(0)
  })

  it('does not trigger on completely unrelated spaces', () => {
    const session = setup(1)

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.grain).toBe(0)
  })
})
