import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A156_Buyer } from '../../cards-display/A/A156_Buyer'
export { A156_Buyer }

const CARD_ID = A156_Buyer.id

const SPACE_RESOURCE_MAP: Record<string, string> = {
  'reed-bank': 'reed',
  'eastern-quarry': 'stone',
  'western-quarry': 'stone',
  'sheep-market': 'sheep',
  'pig-market': 'boar',
}

const listener: CardListenerRegistration = {
  id: 'A156-buyer-opponent-accumulation',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const resource = SPACE_RESOURCE_MAP[context.space?.id ?? '']
    if (!resource) return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 1, recipientPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          gainLeaf(CARD_ID, { [resource]: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A156_Buyer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
