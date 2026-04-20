import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D68_SmallBasket'

// After Reed Bank: optional pay 1 reed → get 1 vegetable.
// In 4+ player games, the reed goes back on the accumulation space.
const listener: CardListenerRegistration = {
  id: 'D68-small-basket-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'reed-bank') return
    const playerCount = context.state.players.length
    if (playerCount >= 4) {
      // Place reed back on space instead of paying
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'return-to-space',
              params: { reed: 1 },
              sourceCard: CARD_ID,
            },
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D68_SmallBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Small Basket',
  deck: 'D',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time after you use the __Reed Bank__ accumulation space, you can pay 1 <REED> to get 1 <VEGETABLE>. If you do in a game with 4+ players, place that 1 <REED> on the accumulation space.'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const D68_SmallBasket_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
