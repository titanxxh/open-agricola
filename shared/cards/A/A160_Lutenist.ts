import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A160_Lutenist'

/**
 * A160 Lutenist:
 * Each time another player uses the Traveling Players accumulation space,
 * you automatically get 1 food + 1 wood.
 * Then you can optionally pay 2 food to get 1 vegetable.
 * Players 3+.
 */
const listener: CardListenerRegistration = {
  id: 'A160-lutenist-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: 1, wood: 1 }),
          {
            type: 'seq',
            optional: true,
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
              gainLeaf(CARD_ID, { vegetable: 1 }),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A160_Lutenist = new Occupation({
  id: CARD_ID,
  name: 'Lutenist',
  deck: 'A',
  number: 160,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time another player uses the __Traveling Players__ accumulation space, you get 1 <FOOD> and 1 <WOOD>. Immediately after, you can buy exactly 1 <VEGETABLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const A160_Lutenist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
