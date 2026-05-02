import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C63_CraftBrewery'

/**
 * C63 Craft Brewery (verify-only, Sprint 7a F7).
 *
 * BGA `C63_CraftBrewery::onPlayerHarvestFeedingPhase`:
 *   - 1 grain field on the board: auto SE eatSingleFieldGrain($field) +
 *     payGain GRAIN -> FOOD 4 + SCORE 2.
 *   - 2+ grain fields: SE eatFieldGrain prompts the player to pick which
 *     field, then payGain.
 *
 * Our `onHarvestFeedingPhase` always picks the first grain field
 * automatically (using `fieldDecrementTop` directly) and returns the
 * pay-gain SEQ. **Deliberate divergence:** when multiple grain fields are
 * available, the player isn't asked which to use. Implementing the
 * field-picker requires a new `eat-field-grain` SE kind + UI plumbing —
 * deferred to Sprint 7b.
 *
 * This test pins the deliberate-divergence onHarvestFeedingPhase shape and
 * the no-trigger paths (no grain in supply / no grain field).
 */
describe('C63_CraftBrewery session (verify-only)', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C63_CraftBrewery')
    player.fields = []
    return { session, state, player }
  }

  it('returns optional pay/gain seq when supply has grain and one field has grain', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C63_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    expect(seq.children.map((c) => (c as Extract<ActionFlow, { type: 'leaf' }>).actionId)).toEqual([
      'pay-resources',
      'gain',
      'bonus-vp',
      'bonus-vp',
    ])
    const pay = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(pay.params).toEqual({ grain: 1 })
    const gain = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gain.params).toEqual({ food: 4 })

    // Deliberate side-effect: the field's top grain stack is decremented in
    // the hook itself rather than via a player-choice SE.
    expect(player.fields[0]!.stacks).toHaveLength(0)
  })

  it('returns null when player has no grain in supply', () => {
    const { session, state, player } = setup()
    player.resources.grain = 0
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C63_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).toBeNull()
    // Field untouched.
    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
  })

  it('returns null when no grain field exists (top-of-stack must be grain)', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    // Only a vegetable field — top is not grain.
    player.fields.push({
      stacks: [{ kind: 'vegetable', remaining: 2 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C63_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).toBeNull()
  })
})
