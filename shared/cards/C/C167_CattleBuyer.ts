import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C167_CattleBuyer'

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

registerCardListener(listener)

export const C167_CattleBuyer = new Occupation({
  id: CARD_ID,
  name: 'Cattle Buyer',
  deck: 'C',
  number: 167,
  category: 'ANIMAL_FARMER',
  desc: [
    'Each time another player uses the __Fencing__ action space, you can buy 1 <SHEEP> for 1 <FOOD>, 1 <PIG> for 2 <FOOD>, or 1 <CATTLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
