import { describe, expect, it } from 'vitest'
import { C16_FieldFences_impl } from '../C16_FieldFences'
import type { CardListenerContext } from '../../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../../contract/types'

const dummySpace = { id: 'fence', type: 'fence', position: 0, players: [], available: true } as unknown as ActionSpace

const makeCtx = (
  params: Record<string, unknown>,
  opts: { c16Active?: boolean; fields?: { row: number; col: number }[] } = {},
): CardListenerContext => {
  const fields = (opts.fields ?? []).map((f) => ({ ...f, crop: null, cropCount: 0 }))
  const cardStates: Record<string, { extraData?: Record<string, unknown> }> = {}
  if (opts.c16Active) {
    cardStates['C16_FieldFences'] = { extraData: { c16Active: true } }
  }
  const player = {
    fields,
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

describe('C16 FieldFences fence listener', () => {
  it('returns nothing when c16Active is false', () => {
    const ctx = makeCtx({ newFenceEdges: ['H-0-0'] })
    const result = C16_FieldFences_impl.listeners![0]!.handler(ctx)
    expect(result).toBeUndefined()
  })

  it('Pass #1 (c16 active, no edges): returns potential field-edge count', () => {
    const ctx = makeCtx({}, { c16Active: true, fields: [{ row: 1, col: 1 }] })
    const result = C16_FieldFences_impl.listeners![0]!.handler(ctx)
    expect(result?.costs?.wood).toBe(-4)
  })

  it('Pass #2 (c16 active, 2 selected field-adjacent edges): returns -2 wood', () => {
    const ctx = makeCtx(
      { newFenceEdges: ['H-1-1', 'H-2-1'], newPalisadeEdges: [] },
      { c16Active: true, fields: [{ row: 1, col: 1 }] },
    )
    const result = C16_FieldFences_impl.listeners![0]!.handler(ctx)
    expect(result?.costs?.wood).toBe(-2)
  })
})
