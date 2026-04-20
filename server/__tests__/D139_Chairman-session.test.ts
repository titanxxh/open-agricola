import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D139_Chairman'

describe('D139_Chairman session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('D139_Chairman')

    session.loadState(state)
    return session
  }

  it('both players gain 1 food when opponent uses meeting-place', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food
    const opponentFoodBefore = s.players[1]!.resources.food

    // Opponent (p1) uses meeting-place
    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)

    // Before-hooks with opponent scope create a PlayerSwitch to owner context
    // Walk through any pending player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + 1)
  })

  it('owner gains 1 food when using meeting-place themselves', () => {
    const session = setup(0)
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Owner (p0) uses meeting-place
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    expect(session.getState().state.players[0]!.resources.food).toBe(foodBefore + 1)
  })
})
