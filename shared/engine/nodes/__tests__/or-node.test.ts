import { describe, it, expect } from 'vitest'
import { OrNode } from '../or-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('OrNode.step', () => {
  it('continues when all children unresolved', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const or = new OrNode('o', [c1, c2])
    expect(or.step(stubCtx).kind).toBe('continue')
  })

  it('done when any child resolved', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    c1.setState('resolved')
    const or = new OrNode('o', [c1, c2])
    expect(or.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes emit metadata + children + promptKey', () => {
    const c1 = new ActionNode('a', 'gain-wood')
    const c2 = new ActionNode('b', 'gain-clay')
    const or = new OrNode('o', [c1, c2], 'ui.interactionFlowSelect')
    or.emittedChoices = [{ value: 'a', labelKey: 'k' }]
    or.emittedPromptKey = 'ui.interactionFlowSelect'
    const cursor = or.toCursor()
    expect(cursor.type).toBe('or')
    expect(cursor.data.childrenIds).toEqual(['a', 'b'])
    expect(cursor.data.promptKey).toBe('ui.interactionFlowSelect')
    expect(cursor.data.emittedChoices).toEqual([{ value: 'a', labelKey: 'k' }])
    expect(cursor.data.emittedPromptKey).toBe('ui.interactionFlowSelect')
  })
})
