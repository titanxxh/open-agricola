import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import { D1_ZigzagHarrow } from '../../shared/cards-display/D/D1_ZigzagHarrow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

/**
 * D1 Zigzag Harrow (verify-only, Sprint 7a F1).
 *
 * BGA `D1_ZigzagHarrow::onBuy` returns optional PLOW with `args.location` =
 * the zigzag-completing field tile list. Our `plow` leaf cannot honor an
 * external allowlist without main-path schema changes (board-geometry helper
 * + plow-validation actionContext threading). For this sprint we emit the
 * unrestricted optional PLOW leaf and document the divergence.
 *
 * This test pins the deliberate-divergence onBuy shape so a future implementor
 * has a target to break when wiring the zigzag restriction.
 */
describe('D1_ZigzagHarrow session (verify-only)', () => {
  it('onBuy returns optional plow leaf without location restriction', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('D1_ZigzagHarrow')
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'D1_ZigzagHarrow', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('plow')
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe('D1_ZigzagHarrow')
    // Deliberate divergence: no `actionContext.allowedTiles` threading.
    expect(leaf.actionContext).toBeUndefined()
  })

  describe('prerequisite (simplified)', () => {
    it('blocks when player has fewer than 2 fields', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(meetsCardPrerequisites(player, D1_ZigzagHarrow, state.round, state)).toBe(false)
    })

    it('allows when fields can complete a zigzag pattern', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
        { row: 1, col: 1, stacks: [] },
      ]
      expect(meetsCardPrerequisites(player, D1_ZigzagHarrow, state.round, state)).toBe(true)
    })
  })
})
