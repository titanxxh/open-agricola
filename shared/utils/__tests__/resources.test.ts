import { describe, expect, it } from 'vitest'
import { mergeResources } from '../resources'

describe('mergeResources', () => {
  it('sums same-key resources', () => {
    expect(mergeResources({ wood: 1 }, { wood: 2 })).toEqual({ wood: 3 })
  })
  it('keeps disjoint keys', () => {
    expect(mergeResources({ wood: 1 }, { clay: 2 })).toEqual({ wood: 1, clay: 2 })
  })
  it('allows negative sum (no clamping)', () => {
    expect(mergeResources({ wood: 1 }, { wood: -3 })).toEqual({ wood: -2 })
  })
})
