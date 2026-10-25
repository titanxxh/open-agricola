import type { GameState } from '../contract/types'
import type { CardExchange } from '../contract/cards'

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

export const WOOD_TO_FUEL_EXCHANGE_INDEX = 2

const woodToFuelExchange: CardExchange = {
  from: { wood: 1 }, to: { fuel: 1 }, triggers: ['anytime'], sourceId: BASIC_CONVERSION_SOURCE_ID,
}

export const getBasicConversionExchanges = (state?: Pick<GameState, 'enableFarmersOfTheMoor'>): readonly CardExchange[] =>
  state?.enableFarmersOfTheMoor === true ? [...basicConversionExchanges, woodToFuelExchange] : basicConversionExchanges
