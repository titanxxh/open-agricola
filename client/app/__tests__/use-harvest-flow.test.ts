import { describe, expect, it } from 'vitest'
import { canFinalizeHarvest } from '../hooks/use-harvest-flow'

describe('use-harvest-flow helpers', () => {
  it('blocks finalize when feed still pending', () => {
    expect(canFinalizeHarvest({ p1: 1, p2: 0 })).toBe(false)
    expect(canFinalizeHarvest({ p1: 0 })).toBe(true)
  })
})
