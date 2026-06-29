import { describe, expect, it } from 'vitest'
import { registerCustomCard } from '../../../cards/custom-registry'
import { getPrintedImprovementResourceCost } from '../improvement-helpers'

registerCustomCard({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_PrintedCostBothClay',
    name: 'Printed Cost Both Clay',
    deck: 'community',
    number: 1,
    desc: [],
    cost: { clay: 1 },
    altCosts: [{ clay: 2 }, { wood: 3 }],
  },
}, { allowGlobal: true })

describe('getPrintedImprovementResourceCost', () => {
  it('reads simple major costs', () => {
    expect(getPrintedImprovementResourceCost('Major_Joinery', 'wood')).toBe(2)
  })

  it('reads complex major fee costs', () => {
    expect(getPrintedImprovementResourceCost('Major_CookingHearth1', 'clay')).toBe(4)
  })

  it('reads minor costs', () => {
    expect(getPrintedImprovementResourceCost('C082_HardwareStore', 'clay')).toBe(1)
  })

  it('reads minor altCosts', () => {
    expect(getPrintedImprovementResourceCost('C065_Granary', 'clay')).toBe(3)
  })

  it('uses the maximum matching base cost candidate instead of summing cost and altCosts', () => {
    expect(getPrintedImprovementResourceCost('CUSTOM_PrintedCostBothClay', 'clay')).toBe(2)
  })

  it('returns zero when the resource is missing from all base cost candidates', () => {
    expect(getPrintedImprovementResourceCost('Major_Joinery', 'clay')).toBe(0)
  })
})
