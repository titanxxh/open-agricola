import { describe, it, expect } from 'vitest'
import { SequenceNode } from '../sequence-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = {
  resolveSubtree: () => {},
  emitChoice: () => {},
}

describe('SequenceNode.step', () => {
  it('returns continue when first child unresolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const child2 = new ActionNode('a2', 'gain-clay')
    const seq = new SequenceNode('s', [child1, child2])
    expect(seq.step(stubCtx).kind).toBe('continue')
  })

  it('returns done when all children resolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const child2 = new ActionNode('a2', 'gain-clay')
    child1.setState('resolved')
    child2.setState('resolved')
    const seq = new SequenceNode('s', [child1, child2])
    expect(seq.step(stubCtx).kind).toBe('done')
  })

  it('getState() reflects all children resolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const seq = new SequenceNode('s', [child1])
    expect(seq.getState()).toBe('ready')
    child1.setState('resolved')
    expect(seq.getState()).toBe('resolved')
  })

  it('cursorData carries children ids', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const child2 = new ActionNode('a2', 'gain-clay')
    const seq = new SequenceNode('s', [child1, child2])
    const cursor = seq.toCursor()
    expect(cursor.type).toBe('sequence')
    expect(cursor.id).toBe('s')
    expect(cursor.data.childrenIds).toEqual(['a1', 'a2'])
  })
})
