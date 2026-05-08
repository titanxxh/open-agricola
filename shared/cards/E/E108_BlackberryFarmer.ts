import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E108_BlackberryFarmer } from '../../cards-display/E/E108_BlackberryFarmer'

const CARD_ID = E108_BlackberryFarmer.id

const listener: CardListenerRegistration = {
  id: 'E108-blackberry-farmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Count fences built from the farm-choice `fence` extraData.
    // Palisades are tracked separately under `newPalisadeEdges` and must NOT
    // contribute to future-meeples for this card.
    const fencesBuilt =
      context.result?.type === 'ok'
        ? ((context.result.extraData?.newFenceEdges as string[] | undefined)?.length ?? 0)
        : 0
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
