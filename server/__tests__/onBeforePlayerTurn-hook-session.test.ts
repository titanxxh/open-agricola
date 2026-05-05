import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

const TEST_CARD = '__TEST_skipTurn__'

describe('onBeforePlayerTurn hook (game-core skip-turn dispatch)', () => {
  let removedAfter = false

  beforeEach(() => {
    removedAfter = false
  })

  afterEach(() => {
    if (!removedAfter) {
      const reg = getActiveCardRegistry()
      reg?.removeEffectsWhere((id) => id === TEST_CARD)
    }
  })

  const installSkipOnceCard = (effect: Partial<CardEffect>) => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({ id: TEST_CARD, ...effect })
  }

  it('skips a player whose card returns { skipTurn: true } and advances to next eligible player', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const p1 = state.players[1]!
    p1.occupationPlayed.push(TEST_CARD)
    let calls = 0
    installSkipOnceCard({
      onBeforePlayerTurn: (_s, _p) => {
        calls += 1
        if (calls === 1) return { skipTurn: true }
        return
      },
    })

    session.loadState(state)

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    // p1 was skipped, so currentPlayerIndex should be back to p0 (the only
    // other player with an available worker).
    expect(resp.state.currentPlayerIndex).toBe(0)
    expect(calls).toBe(1)
  })

  it('does not skip a player when handler returns void', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const p1 = state.players[1]!
    p1.occupationPlayed.push(TEST_CARD)
    installSkipOnceCard({
      onBeforePlayerTurn: () => undefined,
    })

    session.loadState(state)

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(1)
  })

  it('caps consecutive skips at players.length to avoid infinite loop', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    state.players[0]!.occupationPlayed.push(TEST_CARD)
    state.players[1]!.occupationPlayed.push(TEST_CARD)
    let calls = 0
    installSkipOnceCard({
      onBeforePlayerTurn: () => {
        calls += 1
        return { skipTurn: true }
      },
    })

    session.loadState(state)

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    // After at most players.length skip checks, the loop must terminate.
    // The exact landing player is implementation-defined; the key invariant
    // is that we did not infinite-loop. Bound calls by 2 * players.length to
    // give room for the cap implementation, then assert finite.
    expect(calls).toBeLessThanOrEqual(state.players.length)
  })
})
