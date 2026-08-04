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
})
