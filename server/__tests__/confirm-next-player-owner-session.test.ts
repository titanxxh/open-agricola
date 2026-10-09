import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

describe('confirm-next-player owner', () => {
  it('is confirmed by the player who just completed the action', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.nextPlayerIndex).toBe(1)

    const confirmed = session.resolveChoice(0, 'confirm')
    expect(confirmed.ok).toBe(true)
    expect(confirmed.state.currentPlayerIndex).toBe(1)
  })
})
