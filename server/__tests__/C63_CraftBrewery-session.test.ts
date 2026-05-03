import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C63_CraftBrewery'

/**
 * C63 Craft Brewery — Sprint 7b2 F2 update.
 *
 * BGA `C63_CraftBrewery::onPlayerHarvestFeedingPhase`:
 *   - 1 grain field on the board: auto SE eatSingleFieldGrain($field) +
 *     payGain GRAIN -> FOOD 4 + SCORE 2.
 *   - 2+ grain fields: SE eatFieldGrain prompts the player to pick which
 *     field, then payGain.
 *
 * Implementation: route the field-grain decrement through the
 * `special-effect` leaf with kind `remove-field-crop` (engine-mediated,
 * preserves undo / replay). The first field with grain is auto-selected.
 * **§2.5 simplification:** multi grain field player-pick is NOT
 * implemented; first matching field is auto-chosen. Implementing the
 * picker requires a new `eat-field-grain` SE kind + UI plumbing.
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

  it('returns optional seq with SE remove-field-crop + pay/gain when supply has grain and one field has grain', () => {
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
      'special-effect',
      'pay-resources',
      'gain',
      'bonus-vp',
      'bonus-vp',
    ])
    const se = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(se.actionId).toBe('special-effect')
    expect(se.sourceCard).toBe('C63_CraftBrewery')
    expect(se.params).toEqual({ kind: 'remove-field-crop', crop: 'grain', minRemaining: 1 })
    const pay = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(pay.params).toEqual({ grain: 1 })
    const gain = seq.children[2] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gain.params).toEqual({ food: 4 })

    // Engine-mediated: hook itself does NOT mutate fields anymore. The SE
    // leaf decrements the field crop when the player accepts the optional seq.
    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
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

  it('returns null when no grain field exists', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    // Only a vegetable field — no grain anywhere.
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
