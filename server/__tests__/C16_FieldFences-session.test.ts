import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C16_FieldFences'

/**
 * C16 Field Fences (verify-only, Sprint 7a F1).
 *
 * BGA `C16_FieldFences::onBuy` returns optional FENCING with
 * `args.fieldFences = true` so fence segments next to a field cost 0 wood.
 * Our `fencing` leaf cannot honor field-adjacency cost overrides without
 * main-path schema changes (per-edge cost helper + fence-validation
 * extension). For this sprint we emit the unrestricted optional fencing leaf.
 *
 * This test pins the deliberate-divergence onBuy shape.
 */
describe('C16_FieldFences session (verify-only)', () => {
  it('onBuy returns optional fencing seq without fieldFences context', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C16_FieldFences')
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C16_FieldFences', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(1)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('fencing')
    expect(leaf.sourceCard).toBe('C16_FieldFences')
    // Deliberate divergence: no `actionContext.fieldFences` threading.
    expect(leaf.actionContext).toBeUndefined()
  })
})
