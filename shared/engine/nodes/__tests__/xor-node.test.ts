import { describe, it, expect } from 'vitest'
import { XorNode } from '../xor-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('XorNode.step', () => {
  it('done when exactly one child resolved', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    c1.setState('resolved')
    const xor = new XorNode('x', [c1, c2])
    expect(xor.step(stubCtx).kind).toBe('done')
  })

  it('continue when all unresolved', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const xor = new XorNode('x', [c1, c2])
    expect(xor.step(stubCtx).kind).toBe('continue')
  })

  it('cursorData includes emit metadata + children + promptKey', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const xor = new XorNode('x', [c1, c2], 'ui.interactionFlowSelect')
    const cursor = xor.toCursor()
    expect(cursor.type).toBe('xor')
    expect(cursor.data.childrenIds).toEqual(['a', 'b'])
    expect(cursor.data.promptKey).toBe('ui.interactionFlowSelect')
    expect(cursor.data.emittedChoices).toEqual([])
  })
})
