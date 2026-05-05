import { describe, it, expect } from 'vitest'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('ActionNode.step', () => {
  it('returns continue when not resolved', () => {
    const node = new ActionNode('a1', 'gain-wood')
    expect(node.step(stubCtx).kind).toBe('continue')
  })

  it('returns done after setState(resolved)', () => {
    const node = new ActionNode('a1', 'gain-wood')
    node.setState('resolved')
    expect(node.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes all action metadata', () => {
    const node = new ActionNode(
      'a1',
      'gain-wood',
      'D123_FooCard',
      { wood: 2 },
      'ui.choice.foo',
      { x: 1 },
      { trigger: 'anytime' },
      { kind: 'gain', resources: { wood: 2 } } as never,
    )
    node.beforePhaseResolved = true
    const cursor = node.toCursor()
    expect(cursor.type).toBe('action')
    expect(cursor.id).toBe('a1')
    expect(cursor.data.actionId).toBe('gain-wood')
    expect(cursor.data.sourceCard).toBe('D123_FooCard')
    expect(cursor.data.params).toEqual({ wood: 2 })
    expect(cursor.data.actionContext).toEqual({ trigger: 'anytime' })
    expect(cursor.data.effectPreview).toEqual({ kind: 'gain', resources: { wood: 2 } })
    expect(cursor.data.choiceLabelKey).toBe('ui.choice.foo')
    expect(cursor.data.choiceLabelParams).toEqual({ x: 1 })
    expect(cursor.data.beforePhaseResolved).toBe(true)
  })
})
