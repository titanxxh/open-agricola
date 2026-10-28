import { describe, expect, it } from 'vitest'
import { RESOURCE_MARKET_SPACE_IDS, isResourceMarketSpaceId, isFoodAccumulationSpace } from '../action-space-categories'

describe('action-space category helpers', () => {
  it('recognizes all Resource Market variants', () => {
    expect(RESOURCE_MARKET_SPACE_IDS).toEqual(['resource-market', 'resource-market-4', 'resource-market-56'])
    expect(isResourceMarketSpaceId('resource-market')).toBe(true)
    expect(isResourceMarketSpaceId('resource-market-4')).toBe(true)
    expect(isResourceMarketSpaceId('resource-market-56')).toBe(true)
    expect(isResourceMarketSpaceId('day-laborer')).toBe(false)
    expect(isResourceMarketSpaceId(null)).toBe(false)
    expect(isResourceMarketSpaceId(undefined)).toBe(false)
  })

  it('classifies food accumulation by its replenishment rather than a space id or fixed gain', () => {
    const renamed = { id: 'different-food-space', gainPerRound: { food: 1 } }
    const empty = { id: 'fishing', gainPerRound: { food: 0 } }
    const fixedFood = { id: 'day-laborer', gain: { food: 2 }, gainPerRound: {} }
    expect(isFoodAccumulationSpace(renamed)).toBe(true)
    expect(isFoodAccumulationSpace(empty)).toBe(false)
    expect(isFoodAccumulationSpace(fixedFood)).toBe(false)
    expect(isFoodAccumulationSpace(undefined)).toBe(false)
  })
})
