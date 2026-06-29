import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B025_BreadPaddle'
const listener: CardListenerRegistration = {
  id: 'B25-bread-paddle-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B025_BreadPaddle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bread Paddle',
    deck: 'B',
    number: 25,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, you immediately get 1 <FOOD>. For each occupation you play, you get an additional __Bake Bread__ action.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B025_BreadPaddle_impl = B025_BreadPaddle.impl
