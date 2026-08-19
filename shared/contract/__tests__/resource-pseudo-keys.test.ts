import { describe, it, expect } from 'vitest'
import { REAL_RESOURCE_KEYS, PSEUDO_RESOURCE_KEYS, isPseudoResourceKey } from '../resource-keys'

describe('Resource pseudo keys', () => {
  it('exposes the reference pseudo set', () => {
    expect(PSEUDO_RESOURCE_KEYS).toEqual(
      expect.arrayContaining(['occupation', 'field', 'roomWood', 'roomClay', 'roomStone', 'stable']),
    )
    expect(PSEUDO_RESOURCE_KEYS).toHaveLength(6)
  })

  it('isPseudoResourceKey discriminates real vs pseudo', () => {
    expect(isPseudoResourceKey('wood')).toBe(false)
    expect(isPseudoResourceKey('food')).toBe(false)
    expect(isPseudoResourceKey('field')).toBe(true)
    expect(isPseudoResourceKey('occupation')).toBe(true)
  })

  it('REAL_RESOURCE_KEYS matches the Resource type without pseudo keys', () => {
    REAL_RESOURCE_KEYS.forEach((key) => {
      expect(isPseudoResourceKey(key)).toBe(false)
    })
  })
})
