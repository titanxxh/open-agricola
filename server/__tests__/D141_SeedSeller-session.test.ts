import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D141_SeedSeller'
import type { ActionFlow } from '../../shared/contract/types'

describe('D141_SeedSeller session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D141_SeedSeller')
    setWorkersAtHome(state, player, 2)
    player.resources.grain = 0

    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    session.devPlayCard(0, 'D141_SeedSeller')
    return session
  }

  it('onBuy grants 1 grain', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'D141_SeedSeller', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ grain: 1 })
  })

  it('gains 1 extra grain when using grain-seeds', () => {
    const session = setup()
    const state = session.getState().state
    const grainBefore = state.players[0]!.resources.grain
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // grain-seeds gives 1 grain base + 1 bonus from SeedSeller = 2
    expect(after.players[0]!.resources.grain).toBe(grainBefore + 1 + 1)
  })

  it('does not trigger on non-grain-seeds spaces', () => {
    const session = setup()
    const state = session.getState().state
    const grainBefore = state.players[0]!.resources.grain
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.grain).toBe(grainBefore)
  })

  it('does not trigger for opponent using grain-seeds', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should not get bonus grain — scope is 'player' only
    expect(after.players[0]!.resources.grain).toBe(0)
  })
})
