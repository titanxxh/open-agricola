import { describe, it, expect } from 'vitest'
import { PlayerSwitchNode } from '../player-switch-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('PlayerSwitchNode.step', () => {
  it('returns playerSwitch with targetPlayerId when not resolved', () => {
    const node = new PlayerSwitchNode('ps1', 'p2')
    const r = node.step(stubCtx)
    expect(r.kind).toBe('playerSwitch')
    if (r.kind === 'playerSwitch') {
      expect(r.targetPlayerId).toBe('p2')
    }
  })

  it('returns done after setState(resolved)', () => {
    const node = new PlayerSwitchNode('ps1', 'p2')
    node.setState('resolved')
    expect(node.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes targetPlayerId', () => {
    const node = new PlayerSwitchNode('ps1', 'p2')
    const cursor = node.toCursor()
    expect(cursor.type).toBe('playerSwitch')
    expect(cursor.id).toBe('ps1')
    expect(cursor.data.targetPlayerId).toBe('p2')
  })
})
