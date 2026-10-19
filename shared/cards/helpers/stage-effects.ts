import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'
import { getCardExchanges, getRemainingHarvestExchangeUses } from '../../actions/helpers/exchange-recipes'
import { exchangeToTrade } from '../../actions/helpers/trades'
import { REAL_RESOURCE_KEYS } from '../../contract/resource-keys'

export const markCardCounterIfBoughtByRound = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  key: string,
  maxRound: number,
) => {
  if (state.round > maxRound) return false
  initCardState(player, cardId)[key] = 1
  return true
}

export const hasCardCounter = (
  player: PlayerState,
  cardId: string,
  key: string,
) => (player.cardStates?.[cardId]?.counters?.[key] ?? 0) > 0

export const createSingleHarvestExchange = (sourceId: string) =>
  (state: GameState, player: PlayerState): ActionFlow | undefined => {
  const recipe = getCardExchanges(sourceId, state).find((entry) => entry.triggers?.includes('harvest'))
  if (!recipe) return
  const trade = exchangeToTrade(recipe, sourceId)
  if (getRemainingHarvestExchangeUses(player, trade.sourceId ?? sourceId, trade.max, state.round) <= 0 ||
    !REAL_RESOURCE_KEYS.every((resource) => (player.resources[resource] ?? 0) >= (trade.from[resource] ?? 0))) return
  const entries = [{ trade, count: 1, harvestRound: state.round }]
  return {
    type: 'leaf',
    actionId: 'exchange',
    sourceCard: sourceId,
    optional: true,
    actionContext: {
      submittedExchangeBatch: entries,
    },
  }
}
