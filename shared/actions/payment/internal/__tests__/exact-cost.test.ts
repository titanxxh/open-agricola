import { describe, expect, it } from 'vitest'
import {
  normalizeExactUnitCost,
  resolveExactUnitCost,
  resolveUnitCostWithDelta,
} from '../exact-cost'

describe('exact cost helpers', () => {
  it('normalizes an empty exact cost as a free unit', () => {
    expect(normalizeExactUnitCost({})).toEqual({ unitCost: {} })
    expect(resolveExactUnitCost({}, 1)).toEqual({})
  })

  it('normalizes zero resources as free while preserving max', () => {
    expect(normalizeExactUnitCost({ wood: 0, max: 1 })).toEqual({
      unitCost: {},
      max: 1,
    })
    expect(resolveExactUnitCost({ wood: 0, max: 1 }, 1)).toEqual({})
    expect(resolveExactUnitCost({ wood: 0, max: 1 }, 2)).toBeNull()
  })

  it('scales positive exact unit costs by count', () => {
    expect(resolveExactUnitCost({ wood: 1 }, 2)).toEqual({ wood: 2 })
  })

  it('rejects counts beyond exact max', () => {
    expect(resolveExactUnitCost({ wood: 1, max: 1 }, 2)).toBeNull()
  })

  it('applies computeCosts delta after exact base and before scaling', () => {
    expect(resolveUnitCostWithDelta({ wood: 2 }, { wood: 1 }, { food: 1 }, 2)).toEqual({
      wood: 2,
      food: 2,
    })
    expect(resolveUnitCostWithDelta({ wood: 2 }, { wood: 1 }, { wood: -1 }, 2)).toEqual({})
  })

  it('uses default unit cost when exactCost is absent', () => {
    expect(resolveUnitCostWithDelta({ wood: 2 }, undefined, undefined, 2)).toEqual({
      wood: 4,
    })
  })

  it('throws on negative exact cost values', () => {
    expect(() => normalizeExactUnitCost({ wood: -1 })).toThrow(/negative exactCost/)
  })
})
