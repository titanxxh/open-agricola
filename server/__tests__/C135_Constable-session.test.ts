import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook, getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C135_Constable'
import type { ActionFlow } from '../../shared/contract/types'

// The reference map (key = 14 - turn = remaining complete rounds left after this one):
//   0→0, 1→1, 2→1, 3→2, 4→2, 5→2, 6→3, 7→3, 8→3,
//   9→4, 10→4, 11→4, 12→4, 13→4, 14→4
// onBuy fires when turn (= state.round) < 14.
const expectedWoodForRound = (round: number): number => {
  if (round >= 14) return 0
  const remaining = 14 - round
  const map: Record<number, number> = {
    0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3,
    9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 4,
  }
  return map[remaining] ?? 0
}

describe('C135_Constable — onBuy gain wood by remaining rounds', () => {
  const setup = (round: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    const player = state.players[0]!
    player.occupationHand.push('C135_Constable')
    player.resources.food = 5
    session.loadState(state)
    return session
  }

  it('round 1 (remaining 13): +4 wood', () => {
    const session = setup(1)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: expectedWoodForRound(1) })
  })

  it('round 11 (remaining 3): +2 wood', () => {
    const session = setup(11)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 2 })
  })

  it('round 13 (remaining 1): +1 wood', () => {
    const session = setup(13)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('round 14 (no rounds left): no flow', () => {
    const session = setup(14)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).toBeNull()
  })

  it('round 6 (remaining 8): +3 wood', () => {
    const session = setup(6)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ wood: 3 })
  })
})

describe('C135_Constable — computeBonusScore unchanged', () => {
  it('player without negative categories: +3 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    const effect = getCardEffect('C135_Constable')
    expect(effect?.computeBonusScore).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = { categories: [{ total: 0 }, { total: 5 }] } as any
    expect(effect!.computeBonusScore!(state, player, ctx)).toBe(3)
  })

  it('player with negative category: 0 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    const effect = getCardEffect('C135_Constable')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = { categories: [{ total: -1 }, { total: 5 }] } as any
    expect(effect!.computeBonusScore!(state, player, ctx)).toBe(0)
  })
})
