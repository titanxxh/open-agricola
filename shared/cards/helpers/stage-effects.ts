import type { GameState, PlayerState, Resource } from '../../game/types'
import { canPayResources, payResources } from '../../actions/effects/pay'
import { incCounter, initCardState } from '../__stubs__/helpers'
import { applyCardGain, type CardGain } from './card-gain'

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

export const applyStagePayGain = (
  player: PlayerState,
  cost: Partial<Resource>,
  gain: CardGain,
  cardId?: string,
) => {
  if (!canPayResources(player, cost)) return false
  payResources(player, cost)
  applyCardGain(player, gain, cardId)
  return true
}

export const payForCardBonusVp = (
  player: PlayerState,
  cardId: string,
  resource: keyof Resource,
  count: number,
) => {
  const amount = Math.min(player.resources[resource] ?? 0, count)
  if (amount <= 0) return 0
  player.resources[resource] -= amount
  incCounter(player, cardId, 'bonusVp', amount)
  incCounter(player, cardId, 'triggerCount')
  return amount
}

export const createSingleHarvestExchange = (
  resource: keyof Resource,
  gain: CardGain,
) => (_state: GameState, player: PlayerState) => {
  if ((player.resources[resource] ?? 0) <= 0) return
  player.resources[resource] -= 1
  applyCardGain(player, gain)
}
