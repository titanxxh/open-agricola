import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, FarmFenceBuiltEvent } from '../../contract/events'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E108_BlackberryFarmer } from '../../cards-display/E/E108_BlackberryFarmer'

const CARD_ID = E108_BlackberryFarmer.id

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
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: fencesBuilt,
      resources: { food: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      sourceCard: CARD_ID,
    }
  },
}

export const E108_BlackberryFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
