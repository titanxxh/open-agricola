import type { CardExchange } from '../../contract/cards'
import type { Trade } from '../../contract/types'

export const exchangeToTrade = (ex: CardExchange, fallbackId: string): Trade => ({
  from: ex.from,
  to: ex.to,
  max: ex.max,
  sourceId: ex.sourceId ?? fallbackId,
  sideEffect: ex.sideEffect,
})
