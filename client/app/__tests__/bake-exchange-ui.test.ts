import { describe, expect, it } from 'vitest'

import {
  buildBakeExchangeInfo,
  buildBakeBulkChoice,
  getBakeExchangeInfo,
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

  it('derives non-major bake options from card exchange metadata', () => {
    expect(
      getBakeExchangeInfo('E063_IronOven', {
        exchanges: [
          {
            from: { grain: 1 },
            to: { food: 6 },
            max: 1,
            triggers: ['bake-bread'],
          },
        ],
      }),
    ).toEqual({ food: 6, max: 1 })
  })

  it('builds bake info for major and metadata-backed card sources', () => {
    const info = buildBakeExchangeInfo(
      ['Major_Fireplace1', 'E063_IronOven', 'NotABakeSource'],
      (cardId) =>
        cardId === 'E063_IronOven'
          ? {
              exchanges: [
                {
                  from: { grain: 1 },
                  to: { food: 6 },
                  max: 1,
                  triggers: ['bake-bread'],
                },
              ],
            }
          : undefined,
    )

    expect(info.Major_Fireplace1).toEqual({
      food: 2,
      max: Number.POSITIVE_INFINITY,
    })
    expect(info.E063_IronOven).toEqual({ food: 6, max: 1 })
    expect(info.NotABakeSource).toBeUndefined()
  })

  it('builds bake info for duplicate six-player oven ids', () => {
    const info = buildBakeExchangeInfo(
      ['Major_ClayOven2', 'Major_StoneOven2'],
      () => undefined,
    )

    expect(info.Major_ClayOven2).toEqual({ food: 5, max: 1 })
    expect(info.Major_StoneOven2).toEqual({ food: 4, max: 2 })
  })
})
