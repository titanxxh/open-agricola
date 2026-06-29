import type { CardExchange } from '../../contract/cards'
import type { Resource, ResourceKey, Trade } from '../../contract/types'

export const convertResources = (
  resources: Partial<Resource>,
  trade: Trade,
  times: number = 1,
): Partial<Resource> => {
  const result: Partial<Resource> = { ...resources }

  const fromKeys = Object.keys(trade.from) as ResourceKey[]
  for (const key of fromKeys) {
    const amount = (trade.from[key] ?? 0) * times
    result[key] = (result[key] ?? 0) - amount
  }

  const toKeys = Object.keys(trade.to) as ResourceKey[]
  for (const key of toKeys) {
    const amount = (trade.to[key] ?? 0) * times
    result[key] = (result[key] ?? 0) + amount
  }

  return result
}

export const hasValidResources = (resources: Partial<Resource>): boolean => {
  const keys = Object.keys(resources) as ResourceKey[]
  return keys.every((key) => (resources[key] ?? 0) >= 0)
}

export const exchangeToTrade = (ex: CardExchange, fallbackId: string): Trade => ({
  from: ex.from,
  to: ex.to,
  max: ex.max,
  sourceId: ex.sourceId ?? fallbackId,
  sideEffect: ex.sideEffect,
})
