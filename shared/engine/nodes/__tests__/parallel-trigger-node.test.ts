import { describe, it, expect } from 'vitest'
import { ParallelTriggerNode } from '../parallel-trigger-node'
import { ActivateCardNode } from '../activate-card-node'

const makeActivate = (id: string, cardId: string, mandatory = true) =>
  new ActivateCardNode(id, `listener-${id}`, cardId, 'after', 'place-farmer', { mandatory })

describe('ParallelTriggerNode', () => {
  it('starts ready with unresolved children', () => {
    const a = makeActivate('a', 'C1')
    const b = makeActivate('b', 'C2')
    const node = new ParallelTriggerNode('ptn1', [a, b], 'p1')
    expect(node.getState()).toBe('ready')
    expect(node.getRemainingCardIds()).toEqual(['C1', 'C2'])
    expect(node.ownerPlayerId).toBe('p1')
  })

  it('chooseCard returns matching unresolved child', () => {
    const a = makeActivate('a', 'C1')
    const b = makeActivate('b', 'C2')
    const node = new ParallelTriggerNode('ptn1', [a, b], 'p1')
    const child = node.chooseCard('C1')
    expect(child).toBe(a)
  })

  it('pass resolves all remaining children + self', () => {
    const a = makeActivate('a', 'C1')
    const b = makeActivate('b', 'C2')
    const node = new ParallelTriggerNode('ptn1', [a, b], 'p1')
    node.passAll()
    expect(node.getState()).toBe('resolved')
    expect(a.getState()).toBe('resolved')
    expect(b.getState()).toBe('resolved')
  })

  it('resolves itself when last child resolves', () => {
    const a = makeActivate('a', 'C1')
    const node = new ParallelTriggerNode('ptn1', [a], 'p1')
    a.resolve()
    node.checkResolved()
    expect(node.getState()).toBe('resolved')
  })

  it('exposes select-trigger options without pass when any child is mandatory', () => {
    const a = makeActivate('a', 'C1', true)
    const b = makeActivate('b', 'C2', false)
    const node = new ParallelTriggerNode('ptn1', [a, b], 'p1')
    const opts = node.buildSelectOptions()
    expect(opts).toEqual([
      { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
      { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
    ])
  })

  it('exposes __pass__ option when every child is optional', () => {
    const a = makeActivate('a', 'C1', false)
    const b = makeActivate('b', 'C2', false)
    const node = new ParallelTriggerNode('ptn1', [a, b], 'p1')
    const opts = node.buildSelectOptions()
    expect(opts).toEqual([
      { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
      { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
      { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
    ])
  })
})
