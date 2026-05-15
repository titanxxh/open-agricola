import type { CardExchange } from '../../shared/contract/cards'

export type BakeExchangeInfo = { food: number; max: number }

export type BakeExchangeMeta = {
  exchanges?: CardExchange[]
}

export const majorBakeExchangeInfo: Record<string, BakeExchangeInfo> = {
  Major_Fireplace1: { food: 2, max: Number.POSITIVE_INFINITY },
  Major_Fireplace2: { food: 2, max: Number.POSITIVE_INFINITY },
  Major_CookingHearth1: { food: 3, max: Number.POSITIVE_INFINITY },
  Major_CookingHearth2: { food: 3, max: Number.POSITIVE_INFINITY },
  Major_ClayOven: { food: 5, max: 1 },
  Major_StoneOven: { food: 4, max: 2 },
}

export const getBakeExchangeInfo = (
  cardId: string,
  meta?: BakeExchangeMeta,
): BakeExchangeInfo | undefined => {
  const major = majorBakeExchangeInfo[cardId]
  if (major) return major

  const exchange = meta?.exchanges?.find((entry) => {
    const grainCost = entry.from.grain ?? 0
    const foodGain = entry.to.food ?? 0
    return (
      (entry.triggers ?? []).includes('bake-bread') &&
      grainCost > 0 &&
      foodGain > 0
    )
  })
  if (!exchange) return undefined

  const grainCost = exchange.from.grain ?? 0
  const foodGain = exchange.to.food ?? 0
  return {
    food: foodGain / grainCost,
    max: exchange.max ?? Number.POSITIVE_INFINITY,
  }
}

export const buildBakeExchangeInfo = (
  cardIds: readonly string[],
  getMeta: (cardId: string) => BakeExchangeMeta | undefined,
): Record<string, BakeExchangeInfo> => {
  const out: Record<string, BakeExchangeInfo> = {}
  for (const cardId of cardIds) {
    const info = getBakeExchangeInfo(cardId, getMeta(cardId))
    if (info) out[cardId] = info
  }
  return out
}

export const hasSelectedBakeGrain = (counts: Record<string, number>) =>
  Object.values(counts).some((count) => count > 0)

export const buildBakeBulkChoice = (counts: Record<string, number>) => {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${id}=${count}`)

  return entries.length > 0 ? `bulk:${entries.join(',')}` : null
}
