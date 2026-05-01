import type { GameState, PlayerState, Resource } from '../../game/types'
import { initCardState } from '../__stubs__/helpers'
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

export const createSingleHarvestExchange = (
  resource: keyof Resource,
  gain: CardGain,
) => (_state: GameState, player: PlayerState) => {
  if ((player.resources[resource] ?? 0) <= 0) return
  player.resources[resource] -= 1
  applyCardGain(player, gain)
}
