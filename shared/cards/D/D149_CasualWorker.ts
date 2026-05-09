import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D149_CasualWorker } from '../../cards-display/D/D149_CasualWorker'

const CARD_ID = D149_CasualWorker.id

/**
 * D149 Casual Worker:
 * Each time another player uses the Eastern Quarry or Western Quarry,
 * the card owner can choose: get 1 food OR build 1 free stable.
 *
 * BGA: isListeningTo → PlaceFarmer on EasternQuarry/WesternQuarry.
 *      onOpponentAfterPlaceFarmer → xor: gain 1 food OR stables(max:1, free).
 */
const QUARRY_SPACES = new Set(['eastern-quarry', 'western-quarry'])

const listener: CardListenerRegistration = {
  id: 'D149-casual-worker-opponent-quarry',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !QUARRY_SPACES.has(spaceId)) return

    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { food: 1 }),
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: { max: 1, costOverride: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D149_CasualWorker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
