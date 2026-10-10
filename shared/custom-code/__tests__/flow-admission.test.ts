import { describe, expect, it } from 'vitest'
import { assertCustomFlow } from '../flow-admission'
import { SANDBOX_ALLOWED_ACTION_IDS, SANDBOX_SPECIAL_EFFECT_KINDS } from '../sandbox-action-ids'

const leaf = (actionId: string, params: Record<string, unknown> = {}) => ({ type: 'leaf', actionId, params })

describe('assertCustomFlow', () => {
  it('accepts an absent flow', () => {
    expect(() => assertCustomFlow(undefined)).not.toThrow()
    expect(() => assertCustomFlow(null)).not.toThrow()
  })

  it.each(SANDBOX_ALLOWED_ACTION_IDS.filter(id => id !== 'special-effect'))('accepts the contract leaf %s', (actionId) => {
    expect(() => assertCustomFlow(leaf(actionId))).not.toThrow()
  })

  it.each(SANDBOX_SPECIAL_EFFECT_KINDS)('accepts the contract special-effect kind %s', (kind) => {
    expect(() => assertCustomFlow(leaf('special-effect', { kind }))).not.toThrow()
  })

  it.each(['plow', 'selection', 'card_E112_GrainThief_protect'])('rejects the native leaf %s', (actionId) => {
    expect(() => assertCustomFlow(leaf(actionId)))
      .toThrow(`flow: actionId '${actionId}' is not in the Workshop Capability Contract`)
  })

  it.each(['consume-supply-token', 'return-card-to-board', undefined])('rejects the special-effect kind %s', (kind) => {
    expect(() => assertCustomFlow(leaf('special-effect', { kind })))
      .toThrow(`special-effect kind '${String(kind)}' is not in the Workshop Capability Contract`)
  })

  it('rejects the whole flow and names the nested node', () => {
    const flow = { type: 'seq', children: [leaf('gain', { food: 1 }), { type: 'or', children: [leaf('gain'), leaf('sow')] }] }
    expect(() => assertCustomFlow(flow))
      .toThrow("flow.children[1].children[1]: actionId 'sow' is not in the Workshop Capability Contract")
  })

  it('rejects malformed nodes', () => {
    expect(() => assertCustomFlow({ type: 'loop', children: [] })).toThrow("flow node type 'loop'")
    expect(() => assertCustomFlow({ type: 'seq', items: [] })).toThrow("'seq' requires a children array")
    expect(() => assertCustomFlow({ type: 'seq', children: [null] })).toThrow('flow.children[0]: must be an ActionFlow object')
    expect(() => assertCustomFlow('gain')).toThrow('flow: must be an ActionFlow object')
  })
})
