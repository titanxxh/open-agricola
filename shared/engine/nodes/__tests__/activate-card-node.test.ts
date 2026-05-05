import { describe, it, expect } from 'vitest'
import { ActivateCardNode } from '../activate-card-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('ActivateCardNode.step', () => {
  it('returns activateListener (with nodeId) when not resolved', () => {
    const node = new ActivateCardNode('ac1', 'L1', 'D123', 'before', 'gain-wood', { foo: 1 })
    const result = node.step(stubCtx)
    expect(result.kind).toBe('activateListener')
    if (result.kind === 'activateListener') {
      expect(result.nodeId).toBe('ac1')
    }
  })

  it('returns done after setState(resolved)', () => {
    const node = new ActivateCardNode('ac1', 'L1', 'D123', 'before', 'gain-wood')
    node.setState('resolved')
    expect(node.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes listener metadata', () => {
    const node = new ActivateCardNode('ac1', 'L1', 'D123', 'after', 'gain-wood', { ownerPlayerId: 'p2' })
    const cursor = node.toCursor()
    expect(cursor.type).toBe('activateCard')
    expect(cursor.id).toBe('ac1')
    expect(cursor.data.listenerId).toBe('L1')
    expect(cursor.data.cardId).toBe('D123')
    expect(cursor.data.phase).toBe('after')
    expect(cursor.data.actionId).toBe('gain-wood')
    expect(cursor.data.event).toEqual({ ownerPlayerId: 'p2' })
  })
})
