import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A159_JoineroftheSea } from '../../cards-display/A/A159_JoineroftheSea'

const CARD_ID = A159_JoineroftheSea.id

/**
 * A159 Joiner of the Sea:
 * Each time another player uses Fishing or Reed Bank,
 * you can optionally give them 1 wood to get 2 food (Fishing) or 3 food (Reed Bank).
 * Players 4+.
 */
const listener: CardListenerRegistration = {
  id: 'A159-joiner-of-the-sea-opponent-fishing-reed',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'fishing' && spaceId !== 'reed-bank') return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    const foodGain = spaceId === 'fishing' ? 2 : 3
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            params: { wood: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'gain',
            params: { wood: 1, recipientPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          gainLeaf(CARD_ID, { food: foodGain }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A159_JoineroftheSea_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
