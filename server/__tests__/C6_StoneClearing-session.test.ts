import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C6_StoneClearing'

/**
 * C6 Stone Clearing (verify-only, Sprint 7a F1+F7).
 *
 * BGA `C6_StoneClearing::onBuy` places 1 STONE on each empty field, harvested
 * during the next field-phase reap. Our model can't push a `kind: 'stone'`
 * onto `CropStack` without a main-path schema change (see implementation
 * comment), so we **deliberately diverge** by granting the stone immediately
 * to the player's supply at buy time. This test pins the divergence in place.
 */
describe('C6_StoneClearing session (verify-only)', () => {
  const setup = (emptyFieldCount: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C6_StoneClearing')
    // Reset fields then add `emptyFieldCount` empty fields.
    player.fields = []
    for (let i = 0; i < emptyFieldCount; i++) {
      player.fields.push({ stacks: [], row: 1, col: i })
    }
    session.loadState(state)
    return session
  }

  it('grants 1 stone per empty field as the deliberate-divergence onBuy', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ stone: 3 })
    expect(leaf.sourceCard).toBe('C6_StoneClearing')
  })

  it('returns null when player has no empty fields', () => {
    const session = setup(0)
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(flow).toBeNull()
  })

  it('counts empty fields only — fields with crop stacks are ignored', () => {
    const session = setup(0)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { stacks: [], row: 1, col: 0 },
      { stacks: [{ kind: 'grain', remaining: 2 }], row: 1, col: 1 },
      { stacks: [], row: 1, col: 2 },
    ]
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ stone: 2 })
  })
})
