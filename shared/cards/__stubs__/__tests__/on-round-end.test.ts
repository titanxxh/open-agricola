import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import { registerStubCards, clearStubCards } from '../index'
import { CARD_ID as ON_ROUND_END_ID } from '../Stub_OnRoundEnd'
import { clearActionHooks } from '../../../actions/hooks'
import { markAllWorkersUsed } from '../../../domain/player'

describe('Stub_OnRoundEnd mechanism', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('onRoundEnd fires when round finalizes', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const p0 = state.players[0]
    p0.minorPlayed.push(ON_ROUND_END_ID)
    state.players.forEach(p => markAllWorkersUsed(state, p))

    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)

    const p0After = resp.state.players[0]
    expect(p0After.cardStates?.[ON_ROUND_END_ID]?.counters?.observedCount).toBe(1)
    expect(resp.state.round).toBe(2)
  })
})
