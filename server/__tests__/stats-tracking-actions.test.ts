import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import { setStartPlayer } from '../../shared/actions/effects/first-player'

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

  it('starting first player has firstPlayerCount=1, others 0', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    expect(state.players[0]!.stats.firstPlayerCount).toBe(1)
    expect(state.players[1]!.stats.firstPlayerCount).toBe(0)
  })

  it('incFirstPlayer fires when first-player rotates each year', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    // simulate p2 having taken the "set first player" effect during round 1.
    // We move start-player marker over so when round 2 begins, p2 receives +1.
    setStartPlayer(state, state.players[1]!)
    state.round = 2
    session.loadState(state)

    // invoke the round-start path directly (private method on GameCore).
    const core = session as unknown as { continueBeforeStartOfTurn: () => void }
    core.continueBeforeStartOfTurn()

    const after = session.getState().state
    expect(after.players[1]!.stats.firstPlayerCount).toBe(1)
    // p1 should still hold its initial 1 from being starting first player
    expect(after.players[0]!.stats.firstPlayerCount).toBe(1)
  })

  it('incFirstPlayer is not double-counted on round 1 init', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    // p1 was starting first player → starts at 1.
    // Calling continueBeforeStartOfTurn while round===1 must not bump it.
    const core = session as unknown as { continueBeforeStartOfTurn: () => void }
    core.continueBeforeStartOfTurn()
    const after = session.getState().state
    expect(after.players[0]!.stats.firstPlayerCount).toBe(1)
    expect(after.players[1]!.stats.firstPlayerCount).toBe(0)
  })
})
