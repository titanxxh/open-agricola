import { describe, expect, it } from 'vitest'
import type { PaymentResourceMap } from '../../contract/types'
import { compareResourceCosts } from '../resource-cost-comparison'

describe('resource cost comparison', () => {
  it.each<{
    left: PaymentResourceMap; right: PaymentResourceMap
    expected: 'lower' | 'equal' | 'higher' | 'incomparable'
  }>([
    { left: { food: 2 }, right: { food: 4 }, expected: 'lower' },
    { left: { food: 4 }, right: { food: 2 }, expected: 'higher' },
    { left: {}, right: { food: 0, wood: undefined }, expected: 'equal' },
    { left: { wood: 1, stone: 2 }, right: { stone: 2, wood: 1 }, expected: 'equal' },
    { left: { wood: 1, stone: 1 }, right: { wood: 2, stone: 2 }, expected: 'lower' },
    { left: { wood: 2 }, right: { stone: 1 }, expected: 'incomparable' },
    { left: { wood: 1, stone: 3 }, right: { wood: 2, stone: 2 }, expected: 'incomparable' },
    { left: { fence: 1 }, right: { fence: 2 }, expected: 'lower' },
    { left: { food: 1 }, right: { 'TEST_Provider:food': 2 }, expected: 'incomparable' },
    { left: { 'TEST_Provider:food': 1 }, right: { 'TEST_Provider:food': 2 }, expected: 'lower' },
  ])('compares $left with $right as $expected', ({ left, right, expected }) => {
    expect(compareResourceCosts(left, right)).toBe(expected)
  })
})
