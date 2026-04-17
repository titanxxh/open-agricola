import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A80_StoneTongs'

describe('A80_StoneTongs session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('A80_StoneTongs')
    setWorkersAtHome(state, player, 2)
    player.resources.stone = 0

    state.players[1]!.workersAvailable = 2

    // Ensure stone spaces have accumulated resources
    const easternQuarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 2
    const westernQuarry = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (westernQuarry) westernQuarry.resources.stone = 3

    session.loadState(state)
    session.devPlayCard(0, 'A80_StoneTongs')
    return session
  }

  it('gains 1 extra stone when using eastern-quarry', () => {
    const session = setup()

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated stone + 1 bonus from StoneTongs = 3
    expect(after.players[0]!.resources.stone).toBe(2 + 1)
  })

  it('gains 1 extra stone when using western-quarry', () => {
    const session = setup()

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 3 accumulated stone + 1 bonus from StoneTongs = 4
    expect(after.players[0]!.resources.stone).toBe(3 + 1)
  })

  it('does not trigger on non-stone spaces', () => {
    const session = setup()

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // No bonus stone
    expect(after.players[0]!.resources.stone).toBe(0)
  })

  it('does not trigger for opponent using stone space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner (player 0) should not gain any stone — scope is 'player' only
    expect(after.players[0]!.resources.stone).toBe(0)
    // Opponent gains the 2 accumulated stone but no bonus
    expect(after.players[1]!.resources.stone).toBe(2)
  })
})
