import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B60_BrewingWater } from '../../cards-display/B/B60_BrewingWater'

const CARD_ID = B60_BrewingWater.id

const listener: CardListenerRegistration = {
  id: 'B60-brewing-water-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    // Queue eagerly; futureMeeplesNode only resolves if the player accepts the optional payment.
    // If declined, pending entry stays until next futureMeeplesNode execution (known limitation).
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    })
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          futureMeeplesNode(),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B60_BrewingWater_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
