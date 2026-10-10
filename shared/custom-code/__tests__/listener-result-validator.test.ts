import { describe, expect, it } from 'vitest'
import { validateCustomListenerResult } from '../listener-result-validator'

describe('validateCustomListenerResult', () => {
  it('matches sandbox JSON semantics for undefined resource entries', () => {
    const result = validateCustomListenerResult({
      costs: { wood: undefined, clay: -1 },
      costAttribution: [{ sourceCard: 'CUSTOM_Test', costs: { clay: -1 } }],
    }, 'CUSTOM_Test')

    expect(result).not.toBeNull()
  })

  it('accepts results that stay inside the contract', () => {
    const result = {
      flow: { type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { food: 1 } }] },
      followUpActions: ['bake-bread', { actionId: 'gain', sourceCard: 'CUSTOM_Test' }],
    }
    expect(validateCustomListenerResult(result, 'CUSTOM_Test')).toBe(result)
  })

  it.each([
    [{ flow: { type: 'leaf', actionId: 'plow' } }, "flow: actionId 'plow'"],
    [{ decline: true, alternativeFlow: { type: 'leaf', actionId: 'sow' } }, "alternativeFlow: actionId 'sow'"],
    [{ actionId: 'fence' }, "actionId: actionId 'fence'"],
    [{ followUpActions: ['gain', { actionId: 'construct' }] }, "followUpActions[1]: actionId 'construct'"],
  ])('rejects a result that dispatches outside the contract', (result, detail) => {
    expect(() => validateCustomListenerResult(result, 'CUSTOM_Test'))
      .toThrow(`${detail} is not in the Workshop Capability Contract`)
  })
})
