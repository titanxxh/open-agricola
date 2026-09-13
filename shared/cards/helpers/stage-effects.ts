import type { ActionFlow, GameState, PlayerState, Resource } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'
import type { CardGain } from './card-gain'

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

export const createSingleHarvestExchange = (
  resource: keyof Resource,
  gain: CardGain,
  options: { sourceId: string },
) => (_state: GameState, player: PlayerState): ActionFlow | undefined => {
  if ((player.resources[resource] ?? 0) <= 0) return
  return {
    type: 'leaf',
    actionId: 'exchange',
    sourceCard: options.sourceId,
    optional: true,
    actionContext: {
      directTrade: { from: { [resource]: 1 }, to: gain, max: 1, sourceId: options.sourceId },
    },
    effectPreview: {
      kind: 'resourceExchange',
      resourcesPaid: { [resource]: 1 },
      resourcesGained: gain,
    },
  }
}
