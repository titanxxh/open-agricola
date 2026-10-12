import { describe, expect, it } from 'vitest'

import {
  buildBakeExchangeInfo,
  buildBakeBulkChoice,
  hasSelectedBakeGrain,
} from '../bake-exchange-ui'

describe('bake exchange UI helpers', () => {
  it('treats empty and zero-count selections as no selected grain', () => {
    expect(hasSelectedBakeGrain({})).toBe(false)
    expect(
      hasSelectedBakeGrain({
        Major_Fireplace1: 0,
        Major_ClayOven: 0,
      }),
    ).toBe(false)
    expect(
      buildBakeBulkChoice({
        Major_Fireplace1: 0,
        Major_ClayOven: 0,
      }),
    ).toBeNull()
  })

  it('builds a bulk choice from positive grain counts only', () => {
    const counts = {
      Major_Fireplace1: 2,
      Major_Fireplace2: 0,
      Major_ClayOven: 1,
    }

    expect(hasSelectedBakeGrain(counts)).toBe(true)
    expect(buildBakeBulkChoice(counts)).toBe(
      'bulk:Major_Fireplace1=2,Major_ClayOven=1',
    )
  })

  it('displays the offered exchange and quantity limit without card price tables', () => {
    expect(buildBakeExchangeInfo([
      { value: 'Major_ClayOven', labelKey: 'oven', quantityLimit: 1,
        effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 7 } } },
      { value: 'custom', labelKey: 'custom', quantityLimit: 3,
        effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 2 }, resourcesGained: { food: 10 } } },
      { value: 'skip', labelKey: 'skip' },
    ])).toEqual({ Major_ClayOven: { food: 7, max: 1 }, custom: { food: 5, max: 3 } })
  })
})
