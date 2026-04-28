import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'

describe('PlayerStats action tracking', () => {
  it('incPlacedFarmers fires once per place', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    session.loadState(state)

    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(0)

    const resp1 = session.takeAction(0, 'forest')
    expect(resp1.ok).toBe(true)
    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(1)

    // place a second worker on a different action space; force the same player back
    const after1 = session.getState().state
    after1.currentPlayerIndex = 0
    session.loadState(after1)
    const resp2 = session.takeAction(0, 'day-laborer')
    expect(resp2.ok).toBe(true)
    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(2)
  })
})
