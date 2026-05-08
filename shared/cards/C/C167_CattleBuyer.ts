import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C167_CattleBuyer } from '../../cards-display/C/C167_CattleBuyer'

const CARD_ID = C167_CattleBuyer.id

/**
 * C167 Cattle Buyer:
 * Each time another player uses the Fencing action space,
 * you can buy 1 sheep (1 food), 1 pig (2 food), or 1 cattle (2 food).
 * XOR optional choice.
 * Players 4+.
 */
const listener: CardListenerRegistration = {
  id: 'C167-cattle-buyer-opponent-fencing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fencing') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
              gainLeaf(CARD_ID, { sheep: 1 }),
            ],
          },
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
              gainLeaf(CARD_ID, { boar: 1 }),
            ],
          },
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
              gainLeaf(CARD_ID, { cattle: 1 }),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C167_CattleBuyer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
