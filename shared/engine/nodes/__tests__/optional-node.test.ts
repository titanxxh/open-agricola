import { describe, it, expect } from 'vitest'
import { OptionalNode } from '../optional-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('OptionalNode.step', () => {
  it('done if not active and explicitly resolved (skipped)', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child)
    opt.setState('resolved')
    expect(opt.step(stubCtx).kind).toBe('done')
  })

  it('continue if not active and not yet resolved', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child)
    expect(opt.step(stubCtx).kind).toBe('continue')
  })

  it('continue if active and child unresolved', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child)
    opt.active = true
    expect(opt.step(stubCtx).kind).toBe('continue')
  })

  it('done if active and child resolved', () => {
    const child = new ActionNode('a', 'gain-wood')
    child.setState('resolved')
    const opt = new OptionalNode('o', child)
    opt.active = true
    expect(opt.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes child id, active flag, and emit metadata', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child, 'ui.interactionOptionalAction')
    opt.active = true
    const cursor = opt.toCursor()
    expect(cursor.type).toBe('optional')
    expect(cursor.data.childId).toBe('a')
    expect(cursor.data.active).toBe(true)
    expect(cursor.data.promptKey).toBe('ui.interactionOptionalAction')
    expect(cursor.data.emittedChoices).toEqual([])
  })
})
