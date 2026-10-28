import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isFoodAccumulationSpace } from '../helpers/action-space-categories'

const CARD_ID = 'A154_Paymaster'
const listener: CardListenerRegistration = {
  id: 'A154-paymaster-opponent-food-accumulation',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFoodAccumulationSpace(context.space)) return

    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain',
            params: { grain: 1, recipientPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A154_Paymaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Paymaster',
    deck: 'A',
    number: 154,
    category: 'POINTS_PROVIDER',
    desc: [
        'Each time another player uses a <FOOD> accumulation space, you can give them 1 <GRAIN> from your supply to get 1 bonus <SCORE>.',
      ],
    cost: {},
    players: '4+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const A154_Paymaster_impl = A154_Paymaster.impl
