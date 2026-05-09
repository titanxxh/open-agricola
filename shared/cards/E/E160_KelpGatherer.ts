import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E160_KelpGatherer } from '../../cards-display/E/E160_KelpGatherer'

const CARD_ID = E160_KelpGatherer.id

/**
 * E160 Kelp Gatherer (Occupation, E, 160)
 * Each time another player uses the Fishing accumulation space,
 * the opponent gets 1 extra food and the card owner gets 1 vegetable.
 *
 * BGA: onPlayerPlaceFarmer — if opponent uses Fishing, opponent gains 1 food
 * and owner gains 1 vegetable.
 *
 * scope 'opponent' — fires when an opponent uses the fishing space.
 * Players 4+.
 */

const listener: CardListenerRegistration = {
  id: 'E160-kelp-gatherer-opponent-fishing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 1, recipientPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E160_KelpGatherer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
