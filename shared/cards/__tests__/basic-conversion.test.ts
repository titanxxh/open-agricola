import { describe, expect, it } from 'vitest'
import {
  BASIC_CONVERSION_SOURCE_ID,
  basicConversionExchanges,
  getBasicConversionExchange,
} from '../basic-conversion'

describe('basic conversion exchanges', () => {
  it('exposes the synthetic source id "__basic__"', () => {
    expect(BASIC_CONVERSION_SOURCE_ID).toBe('__basic__')
  })

  it('registers grain->food at index 0 and vegetable->food at index 1', () => {
    expect(basicConversionExchanges).toHaveLength(2)
    expect(basicConversionExchanges[0]).toMatchObject({
      from: { grain: 1 },
      to: { food: 1 },
      triggers: ['anytime'],
      sourceId: '__basic__',
    })
    expect(basicConversionExchanges[1]).toMatchObject({
      from: { vegetable: 1 },
      to: { food: 1 },
      triggers: ['anytime'],
      sourceId: '__basic__',
    })
  })

  it('lookup by index returns the matching exchange', () => {
    expect(getBasicConversionExchange(0)?.from).toEqual({ grain: 1 })
    expect(getBasicConversionExchange(1)?.from).toEqual({ vegetable: 1 })
    expect(getBasicConversionExchange(2)).toBeUndefined()
    expect(getBasicConversionExchange(-1)).toBeUndefined()
  })
})
