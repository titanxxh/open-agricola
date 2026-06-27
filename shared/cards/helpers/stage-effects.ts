import type { GameState, PlayerState, Resource } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'
import { applyCardGain, type CardGain } from './card-gain'
import { dispatchTradeAppliedListener } from '../../actions/effects/trade-applied-listener'

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
  options?: { sourceId?: string },
) => (state: GameState, player: PlayerState) => {
  if ((player.resources[resource] ?? 0) <= 0) return
  const preResources = { ...player.resources }
  player.resources[resource] -= 1
  applyCardGain(player, gain)
  // BGA semantics: harvest-time conversions emit Exchange events. We mirror
  // this by dispatching the synthetic 'trade-applied' listener so cards like
  // E91 PlowBuilder can react to the source-card identity (e.g. Joinery).
  if (options?.sourceId) {
    const fromKey = resource as keyof Resource
    dispatchTradeAppliedListener(
      state,
      player,
      {
        from: { [fromKey]: 1 } as Partial<Resource>,
        to: gain as Partial<Resource>,
        max: 1,
        sourceId: options.sourceId,
      },
      1,
      undefined,
      [],
      preResources,
    )
  }
}
