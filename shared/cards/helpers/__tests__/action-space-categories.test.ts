import { describe, expect, it } from 'vitest'
import { RESOURCE_MARKET_SPACE_IDS, isResourceMarketSpaceId } from '../action-space-categories'

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
})
