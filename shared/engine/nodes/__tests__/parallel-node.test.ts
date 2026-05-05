import { describe, it, expect } from 'vitest'
import { ParallelNode } from '../parallel-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('ParallelNode.step', () => {
  it('continues when any child unresolved (default policy=all)', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const p = new ParallelNode('p', [c1, c2])
    expect(p.step(stubCtx).kind).toBe('continue')
    c1.setState('resolved')
    expect(p.step(stubCtx).kind).toBe('continue')
    c2.setState('resolved')
    expect(p.step(stubCtx).kind).toBe('done')
  })

  it('cursorData carries children ids', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const p = new ParallelNode('p', [c1, c2])
    const cursor = p.toCursor()
    expect(cursor.type).toBe('parallel')
    expect(cursor.data.childrenIds).toEqual(['a', 'b'])
  })
})
