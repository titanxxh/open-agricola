import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/game/player'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

describe('meeting-place session', () => {
  it('grants start player immediately and starts the next round with that player', () => {
    const session = new GameSession()
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 13
    state.currentPlayerIndex = 1
    markAllWorkersUsed(state, state.players[0]!)
    setWorkersAtHome(state, state.players[1]!, 1)
    state.players[0]!.startPlayer = true
    state.players[1]!.startPlayer = false
    state.players[1]!.minorHand = []

    session.loadState(state)

    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.startPlayer).toBe(false)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      resp = session.resolveChoice(1, '__skip__')
      expect(resp.ok).toBe(true)
    }
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(14)
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
  })
})
