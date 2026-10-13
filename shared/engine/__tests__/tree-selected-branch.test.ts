import { describe, expect, it } from 'vitest'
import { EngineTree } from '../tree'
import { ActionNode, OrNode, XorNode } from '../nodes'

// Confirmed tree seam: inserting continuation around the selected branch must
// drain that branch, then return to OR choice or finish XOR without a sibling.
describe('selected branch continuation insertion', () => {
  it.each(['or', 'xor'] as const)('runs an inserted before step inside the selected %s branch', (kind) => {
    const selected = new ActionNode('selected', 'gain')
    const sibling = new ActionNode('sibling', 'gain')
    const root = kind === 'or' ? new OrNode('root', [selected, sibling]) : new XorNode('root', [selected, sibling])
    root.selectedChildId = selected.id
    const tree = new EngineTree(root)
    const before = new ActionNode('before', 'gain')
    expect(tree.insertBefore(selected.id, [before])).toBe(true)
    expect(tree.nextUnresolved()?.id).toBe('before')
    before.resolve({ type: 'ok' })
    expect(tree.nextUnresolved()?.id).toBe('selected')
    selected.resolve({ type: 'ok' })
    expect(tree.nextUnresolved()?.id ?? null).toBe(kind === 'or' ? 'root' : null)
    expect(sibling.getState()).toBe('ready')
  })

  it.each(['or', 'xor'] as const)('finishes an inserted after step inside the selected %s branch', (kind) => {
    const selected = new ActionNode('selected', 'gain')
    const sibling = new ActionNode('sibling', 'gain')
    const root = kind === 'or' ? new OrNode('root', [selected, sibling]) : new XorNode('root', [selected, sibling])
    root.selectedChildId = selected.id
    const tree = new EngineTree(root)
    const after = new ActionNode('after', 'gain')
    expect(tree.insertAfter(selected.id, [after])).toBe(true)
    expect(tree.nextUnresolved()?.id).toBe('selected')
    selected.resolve({ type: 'ok' })
    expect(tree.nextUnresolved()?.id).toBe('after')
    after.resolve({ type: 'ok' })
    expect(tree.nextUnresolved()?.id ?? null).toBe(kind === 'or' ? 'root' : null)
    expect(sibling.getState()).toBe('ready')
  })
})
