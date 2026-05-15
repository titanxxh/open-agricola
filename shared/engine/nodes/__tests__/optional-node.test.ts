import { describe, it, expect } from 'vitest'
import { ActionNode } from '../action-node'

describe('optional node metadata', () => {
  it('persists mandatory metadata on the host node cursor', () => {
    const node = new ActionNode('action-mandatory', 'test-action')
    node.mandatory = true
    const cursor = node.toCursor()

    expect(cursor.data.mandatory).toBe(true)
  })

  it('persists inactive optional metadata on the host node cursor', () => {
    const node = new ActionNode('a', 'gain-wood')
    node.optional = true
    node.optionalActive = false
    node.optionalPromptKey = 'ui.interactionOptionalAction'
    const cursor = node.toCursor()

    expect(cursor.type).toBe('action')
    expect(cursor.data.optional).toBe(true)
    expect(cursor.data.optionalActive).toBe(false)
    expect(cursor.data.optionalPromptKey).toBe('ui.interactionOptionalAction')
  })

  it('persists accepted optional metadata on the host node cursor', () => {
    const node = new ActionNode('a', 'gain-wood')
    node.optional = true
    node.optionalActive = true
    const cursor = node.toCursor()

    expect(cursor.type).toBe('action')
    expect(cursor.data.optional).toBe(true)
    expect(cursor.data.optionalActive).toBe(true)
  })
})
