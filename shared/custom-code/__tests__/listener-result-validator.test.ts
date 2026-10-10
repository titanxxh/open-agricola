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

  it('accepts results that stay inside the contract and attributes their flow to the card', () => {
    const result = {
      flow: { type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { food: 1 } }] },
      followUpActions: ['bake-bread', { actionId: 'gain', sourceCard: 'CUSTOM_Test' }],
    }
    expect(validateCustomListenerResult(result, 'CUSTOM_Test')).toBe(result)
    expect(result).toMatchObject({ sourceCard: 'CUSTOM_Test', flow: { children: [{ sourceCard: 'CUSTOM_Test' }] } })
  })

  it('attributes a result that only dispatches follow-up actions', () => {
    expect(validateCustomListenerResult({ followUpActions: ['bonus-vp'] }, 'CUSTOM_Test'))
      .toEqual({ followUpActions: ['bonus-vp'], sourceCard: 'CUSTOM_Test' })
    expect(validateCustomListenerResult({ followUpActions: [] }, 'CUSTOM_Test')).toEqual({ followUpActions: [] })
  })

  it('attributes a result that only replaces the action', () => {
    expect(validateCustomListenerResult({ actionId: 'gain' }, 'CUSTOM_Test')).toEqual({ actionId: 'gain', sourceCard: 'CUSTOM_Test' })
  })

  it('leaves a query result without a flow unattributed', () => {
    expect(validateCustomListenerResult({ doable: true }, 'CUSTOM_Test')).toEqual({ doable: true })
  })

  it.each([
    [{ flow: { type: 'leaf', actionId: 'place-farmer' } }, "flow: actionId 'place-farmer'"],
    [{ decline: true, alternativeFlow: { type: 'leaf', actionId: 'collect' } }, "alternativeFlow: actionId 'collect'"],
    [{ actionId: 'receive' }, "actionId: actionId 'receive'"],
    [{ followUpActions: ['gain', { actionId: 'wish-children' }] }, "followUpActions[1]: actionId 'wish-children'"],
  ])('rejects a result that dispatches outside the contract', (result, detail) => {
    expect(() => validateCustomListenerResult(result, 'CUSTOM_Test'))
      .toThrow(`${detail} is not in the Workshop Capability Contract`)
  })

  it.each([
    [{ sourceCard: 'E033_BeaverColony' }, 'result'],
    [{ flow: { type: 'leaf', actionId: 'gain', sourceCard: 'E033_BeaverColony' } }, 'flow'],
    [{ followUpActions: [{ actionId: 'gain', sourceCard: 'E033_BeaverColony' }] }, 'followUpActions[0]'],
  ])('rejects a result attributed to another card', (result, path) => {
    expect(() => validateCustomListenerResult(result, 'CUSTOM_Test')).toThrow(`${path}: sourceCard must be this card's id`)
  })
})
