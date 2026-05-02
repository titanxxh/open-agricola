import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C1_Overhaul'

/**
 * C1 Overhaul (verify-only, Sprint 7a F1+F4).
 *
 * BGA `C1_Overhaul::onBuy` returns SEQ:
 *   1. SPECIAL_EFFECT returnFences (raze all wood-fence segments)
 *   2. FENCING args { costs: WOOD => 0, min: n, max: n+3, noWoodPalisades: true }
 *
 * We don't have an SE `raze-fences` kind nor fence-validation cost/min/max
 * overrides — both are main-path schema changes. For this sprint we emit just
 * the unrestricted optional fencing leaf and document the divergence.
 *
 * This test pins the deliberate-divergence onBuy shape.
 */
describe('C1_Overhaul session (verify-only)', () => {
  it('onBuy returns optional fencing seq without raze-fences SE', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C1_Overhaul')
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C1_Overhaul', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(1)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('fencing')
    expect(leaf.sourceCard).toBe('C1_Overhaul')
    // Deliberate divergence: no raze-fences SE, no min/max/cost args.
    expect(leaf.actionContext).toBeUndefined()
  })
})
