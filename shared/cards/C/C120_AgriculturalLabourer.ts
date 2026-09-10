import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { DraftGameEvent, ResourceExchangedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'

const CARD_ID = 'C120_AgriculturalLabourer'
type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>

const isResourceExchangedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const grainRewardFlow = (
  context: CardListenerContext,
  grainCount: number,
): ActionHookResult | void => {
  const availableClay = getStoredResource(context.player, CARD_ID, 'clay')
  const clayToGain = Math.min(availableClay, grainCount)
  if (clayToGain <= 0) return
  return {
    flow: {
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: clayToGain },
      sourceCard: CARD_ID,
    },
    sourceCard: CARD_ID,
  }
}

const gainListener: CardListenerRegistration = {
  id: 'C120-agricultural-labourer-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain', 'receive', 'exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const movedGrain = sumResourceMovedToPlayer(events, 'grain', context.player.id)
    const exchangedGrain = events.reduce((sum, event) => {
      if (!isResourceExchangedEvent(event)) return sum
      if (event.gainedTo.kind !== 'player' || event.gainedTo.playerId !== context.player.id) return sum
      return sum + (event.gained.grain ?? 0)
    }, 0)
    return grainRewardFlow(context, movedGrain + exchangedGrain)
  },
}

const cardImpl = {
  listeners: [gainListener],
  effect: {
  id: CARD_ID,
  onBuy: () => ({ type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { clay: 8 } }),
  onAfterReap: (_state, player) => {
    const grainHarvested = _state.harvestReapSummary?.[player.id]?.resources.grain ?? 0
    if (grainHarvested <= 0) return
    const availableClay = getStoredResource(player, CARD_ID, 'clay')
    const clayToGain = Math.min(availableClay, grainHarvested)
    if (clayToGain <= 0) return
    return {
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { clay: clayToGain },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C120_AgriculturalLabourer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Agricultural Labourer",
    deck: "C",
    number: 120,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Place 8 <CLAY> on this card. For each <GRAIN> you obtain, you also get 1 <CLAY> from this card."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C120_AgriculturalLabourer_impl = C120_AgriculturalLabourer.impl
