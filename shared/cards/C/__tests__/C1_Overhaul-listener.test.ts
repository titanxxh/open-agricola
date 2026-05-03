import { describe, expect, it } from 'vitest'
import { C1_Overhaul_impl } from '../C1_Overhaul'
import type { CardListenerContext } from '../../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../../game/types'

const dummySpace = { id: 'fence', type: 'fence', position: 0, players: [], available: true } as unknown as ActionSpace

const makeCtx = (
  params: Record<string, unknown>,
  opts: { c1Active?: boolean; cap?: number } = {},
): CardListenerContext => {
  const cardStates: Record<string, { extraData?: Record<string, unknown> }> = {}
  if (opts.c1Active) {
    cardStates['C1_Overhaul'] = { extraData: { c1Active: true, c1MaxRebuild: opts.cap ?? 3 } }
  }
  const player = {
    fenceSegments: [],
    cardStates,
  } as unknown as PlayerState
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

describe('C1 Overhaul fence listener', () => {
  it('returns nothing when c1Active is false', () => {
    const ctx = makeCtx({ newFenceEdges: ['H-0-0'] })
    const result = C1_Overhaul_impl.listeners![0]!.handler(ctx)
    expect(result).toBeUndefined()
  })

  it('Pass #1 (c1 active, no edges): returns -cap as wood delta', () => {
    const ctx = makeCtx({}, { c1Active: true, cap: 5 })
    const result = C1_Overhaul_impl.listeners![0]!.handler(ctx)
    expect(result?.costs?.wood).toBe(-5)
  })

  it('Pass #2 (c1 active, 3 edges within cap): returns -3', () => {
    const ctx = makeCtx({ newFenceEdges: ['H-0-0', 'H-0-1', 'H-0-2'], newPalisadeEdges: [] }, { c1Active: true, cap: 5 })
    const result = C1_Overhaul_impl.listeners![0]!.handler(ctx)
    expect(result?.costs?.wood).toBe(-3)
  })

  it('Pass #2 (c1 active, 8 edges over cap=5): clamped to -5', () => {
    const edges = Array.from({ length: 8 }, (_, i) => `H-0-${i}`)
    const ctx = makeCtx({ newFenceEdges: edges, newPalisadeEdges: [] }, { c1Active: true, cap: 5 })
    const result = C1_Overhaul_impl.listeners![0]!.handler(ctx)
    expect(result?.costs?.wood).toBe(-5)
  })
})
