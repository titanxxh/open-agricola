import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, FarmFenceBuiltEvent } from '../../contract/events'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E108_BlackberryFarmer'
type QueryableFarmFenceBuiltEvent = FarmFenceBuiltEvent | DraftGameEvent<'farm.fenceBuilt'>

const isFarmFenceBuiltEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmFenceBuiltEvent =>
  event.type === 'farm.fenceBuilt'

const countNewFenceEdges = (context: CardListenerContext): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).reduce((total, event) =>
    isFarmFenceBuiltEvent(event) ? total + (event.newFenceEdges?.length ?? 0) : total,
  0)
}

const listener: CardListenerRegistration = {
  id: 'E108-blackberry-farmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fencesBuilt = countNewFenceEdges(context)
    if (fencesBuilt <= 0) return
    const request = {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: fencesBuilt,
      resources: { food: 1 },
    }
    return {
      flow: futureMeeplesNode(request),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E108_BlackberryFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Blackberry Farmer',
    deck: 'E',
    number: 108,
    category: 'FOOD',
    desc: [
        'Each time you build <FENCE>, place 1 <FOOD> on each remaining round space, up to the number of <FENCE> just built. At the start of these rounds, you get the <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E108_BlackberryFarmer_impl = E108_BlackberryFarmer.impl
