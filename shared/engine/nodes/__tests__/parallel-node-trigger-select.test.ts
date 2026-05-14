import { describe, it, expect } from 'vitest'
import { EngineTree } from '../../tree'
import { ActionNode } from '../action-node'
import { ParallelNode } from '../parallel-node'
import {
  ACTIVATE_CARD_ACTION_ID,
  type ActivateCardActionNode,
  type ActivateCardActionParams,
} from '../../activation-action'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

const makeActivate = (id: string, cardId: string, mandatory = true): ActivateCardActionNode => {
  const params: ActivateCardActionParams = {
    listenerId: `listener-${id}`,
    cardId,
    phase: 'after',
    actionId: 'place-farmer',
    event: {},
    mandatory,
  }
  return new ActionNode(id, ACTIVATE_CARD_ACTION_ID, cardId, params) as ActivateCardActionNode
}

const makeTriggerSelect = (
  children: ActivateCardActionNode[],
  ownerPlayerId = 'p1',
): ParallelNode => {
  const node = new ParallelNode('ptn1', children)
  node.mode = 'trigger-select'
  node.triggerOwnerPlayerId = ownerPlayerId
  node.ownerPlayerId = ownerPlayerId
  node.triggerChildren = children.map((child) => ({
    nodeId: child.id,
    cardId: child.params.cardId,
    listenerId: child.params.listenerId,
    mandatory: child.params.mandatory === true,
  }))
  return node
}

describe('ParallelNode trigger-select mode', () => {
  it('emits select-trigger with one option per unresolved trigger child', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', false),
      makeActivate('b', 'C2', false),
    ])

    const result = node.step(stubCtx)

    expect(result).toEqual({
      kind: 'request',
      request: {
        kind: 'select-trigger',
        ownerPlayerId: 'p1',
        options: [
          { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
          { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
          { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
        ],
      },
    })
  })

  it('selecting a child records selectedChildId', () => {
    const a = makeActivate('a', 'C1')
    const node = makeTriggerSelect([a, makeActivate('b', 'C2')])

    expect(node.chooseCard('C1')).toBe(a)
    expect(node.selectedChildId).toBe('a')
  })

  it('follow-up inserted after selected child runs before next trigger prompt', () => {
    const a = makeActivate('a', 'C1')
    const b = makeActivate('b', 'C2')
    const followUp = new ActionNode('follow-up', 'gain-wood')
    const node = makeTriggerSelect([a, b])
    const tree = new EngineTree(node)

    node.chooseCard('C1')
    tree.insertAfter('a', [followUp])
    a.setState('resolved')

    expect(tree.nextUnresolved()).toBe(followUp)
  })

  it('hides pass while an unresolved mandatory child remains', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', true),
      makeActivate('b', 'C2', false),
    ])

    expect(node.buildSelectOptions()).toEqual([
      { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
      { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
    ])
  })

  it('pass resolves optional unresolved children and the host', () => {
    const a = makeActivate('a', 'C1', false)
    const b = makeActivate('b', 'C2', false)
    const node = makeTriggerSelect([a, b])

    node.passAll()

    expect(node.getState()).toBe('resolved')
    expect(a.getState()).toBe('resolved')
    expect(b.getState()).toBe('resolved')
  })

  it('persists trigger-select metadata in cursor data', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', false),
      makeActivate('b', 'C2', true),
    ])

    node.chooseCard('C1')
    const cursor = node.toCursor()

    expect(cursor.type).toBe('parallel')
    expect(cursor.data).toMatchObject({
      childrenIds: ['a', 'b'],
      mode: 'trigger-select',
      selectedChildId: 'a',
      triggerOwnerPlayerId: 'p1',
      triggerChildren: [
        { nodeId: 'a', cardId: 'C1', listenerId: 'listener-a', mandatory: false },
        { nodeId: 'b', cardId: 'C2', listenerId: 'listener-b', mandatory: true },
      ],
    })
  })
})
