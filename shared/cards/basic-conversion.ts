import type { CardExchange } from './types'

export const BASIC_CONVERSION_SOURCE_ID = '__basic__'

export const basicConversionExchanges: readonly CardExchange[] = [
  {
    from: { grain: 1 },
    to: { food: 1 },
    triggers: ['anytime'],
    sourceId: BASIC_CONVERSION_SOURCE_ID,
  },
  {
    from: { vegetable: 1 },
    to: { food: 1 },
    triggers: ['anytime'],
    sourceId: BASIC_CONVERSION_SOURCE_ID,
  },
]

export const getBasicConversionExchange = (idx: number): CardExchange | undefined => {
  if (!Number.isInteger(idx) || idx < 0) return undefined
  return basicConversionExchanges[idx]
}
