import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('meeting-place session', () => {
  it('grants start player immediately and starts the next round with that player', () => {
    const session = new GameSession()
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 13
    state.currentPlayerIndex = 1
    state.players[0]!.workersAvailable = 0
    state.players[1]!.workersAvailable = 1
    state.players[0]!.startPlayer = true
    state.players[1]!.startPlayer = false

    session.loadState(state)

    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.startPlayer).toBe(false)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(1, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')

    resp = session.confirmNextPlayer()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(14)
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
  })
})
