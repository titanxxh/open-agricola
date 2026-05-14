import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

describe('meeting-place session', () => {
  it('grants start player immediately and starts the next round with that player', () => {
    // Fixed seed: `new GameSession()` defaulted to a `Math.random()` seed
    // which left `players[1].minorHand` non-deterministically empty after
    // `loadState`'s re-deal — when empty, the optional host under
    // meeting-place auto-resolves (no doable minor), and the engine flushes
    // straight to confirm-next-player; when populated, it emits a
    // `__skip__`-bearing choice. The test below assumes the latter, so the
    // seed is pinned to keep the run deterministic.
    const session = new GameSession(1)
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
    // loadState's normalizeState re-deals empty minorHand from the seed.
    // Clear it again on the live state so the optional host under
    // meeting-place sees no playable minor and auto-resolves.
    session.getState().state.players[1]!.minorHand = []

    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.startPlayer).toBe(false)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(14)
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players[1]!.startPlayer).toBe(true)
  })
})
