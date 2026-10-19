import type { CardExchange } from '../../contract/cards'
import type { GameState, PlayerState } from '../../contract/types'
import { majorCardDefinitionsList } from '../../cards/major/generated'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../../cards/registry-display'
import { readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

export const getCardExchanges = (cardId: string, state?: GameState): readonly CardExchange[] => {
  const card = majorCardDefinitionsList.find((candidate) => candidate.id === cardId)
    ?? getRegisteredMinorImprovement(cardId)
    ?? getRegisteredOccupation(cardId)
  if (card?.requiresFarmersOfTheMoor && state !== undefined && state.enableFarmersOfTheMoor !== true) return []
  return card?.exchanges ?? []
}

type HarvestExchangeUsage = { round: number; count: number }
const HARVEST_EXCHANGE_USAGE_KEY = 'harvestExchangeUsage'

export const getRemainingHarvestExchangeUses = (
  player: PlayerState,
  sourceId: string,
  max: number | undefined,
  round: number,
): number => {
  if (max === undefined) return Number.POSITIVE_INFINITY
  const usage = readCardExtraData<HarvestExchangeUsage>(player, sourceId, HARVEST_EXCHANGE_USAGE_KEY)
  return Math.max(0, max - (usage?.round === round ? usage.count : 0))
}

export const recordHarvestExchangeUses = (
  player: PlayerState,
  sourceId: string,
  round: number,
  count: number,
): void => {
  if (count <= 0) return
  const usage = readCardExtraData<HarvestExchangeUsage>(player, sourceId, HARVEST_EXCHANGE_USAGE_KEY)
  writeCardExtraData(player, sourceId, HARVEST_EXCHANGE_USAGE_KEY, {
    round, count: (usage?.round === round ? usage.count : 0) + count,
  } satisfies HarvestExchangeUsage)
}
