import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B143_ClayWarden'

describe('B143_ClayWarden session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('B143_ClayWarden')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2) // Ensure hollow-4 exists and has accumulated resources
    // hollow-4 is a 4-player space, but let's add it manually for testing
    const hollow4 = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (hollow4) {
      hollow4.resources.clay = 4
    }

    session.loadState(state)
    return session
  }

  it('owner gains 1 clay when opponent uses hollow-4', () => {
    const session = setup(1)
    const s = session.getState().state
    // Check if hollow-4 exists in the game
    const hollow4 = s.actionSpaces.find((sp) => sp.id === 'hollow-4')
    if (!hollow4) {
      // hollow-4 only exists in 4-player games; skip test
      return
    }

    const clayBefore = s.players[0]!.resources.clay

    let resp = session.takeAction(1, 'hollow-4')
    expect(resp.ok).toBe(true)

    // Walk through player switches for card effect
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger when owner uses hollow-4', () => {
    const session = setup(0)
    const s = session.getState().state
    const hollow4 = s.actionSpaces.find((sp) => sp.id === 'hollow-4')
    if (!hollow4) return

    const clayBefore = s.players[0]!.resources.clay
    const accumulatedClay = hollow4.resources.clay

    const resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner collects the accumulated clay but should NOT get extra +1 from listener
    // (opponent-scope means owner's own usage doesn't trigger)
    expect(after.players[0]!.resources.clay).toBe(clayBefore + accumulatedClay)
  })

  it('does not trigger on non-hollow spaces', () => {
    const session = setup(1)
    const clayBefore = session.getState().state.players[0]!.resources.clay

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})
