import { describe, expect, it } from 'vitest'
import { E016_BriarHedge_impl } from '../E016_BriarHedge'
import type { CardListenerContext } from '../../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../../contract/types'

const dummySpace = { id: 'fence', type: 'fence', position: 0, players: [], available: true } as unknown as ActionSpace

const makeCtx = (params: Record<string, unknown>): CardListenerContext => {
  const player = { fenceSegments: [] } as unknown as PlayerState
  const state = { players: [player] } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    params,
    actionId: 'fence',
    phase: 'computeCosts',
  } as unknown as CardListenerContext
}

describe('E16 BriarHedge fence listener', () => {
  it('Pass #1 (no newFenceEdges): returns potential max border edges as wood delta', () => {
    const ctx = makeCtx({})
    const listener = E016_BriarHedge_impl.listeners![0]!
    const result = listener.handler(ctx)
    expect(result?.costs?.wood).toBeLessThan(0)
    expect(Math.abs(result!.costs!.wood!)).toBe(16)
  })

  it('Pass #2 (newFenceEdges = empty): returns 0 wood delta', () => {
    const ctx = makeCtx({ newFenceEdges: [], newPalisadeEdges: [] })
    const listener = E016_BriarHedge_impl.listeners![0]!
    const result = listener.handler(ctx)
    expect(result?.costs?.wood ?? 0).toBe(0)
  })

  it('Pass #2 (newFenceEdges with 2 border edges): returns -2 wood', () => {
    const ctx = makeCtx({
      newFenceEdges: ['H-0-0', 'H-0-1'],
      newPalisadeEdges: [],
    })
    const listener = E016_BriarHedge_impl.listeners![0]!
    const result = listener.handler(ctx)
    expect(result?.costs?.wood).toBe(-2)
  })
})
