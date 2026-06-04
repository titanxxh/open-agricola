import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumResourcePaid } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C116_FurnitureMaker'
const afterPayListener: CardListenerRegistration = {
  id: 'C116-furniture-maker-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const foodPaid = sumResourcePaid(events, 'food', (event) =>
      event.paymentFor === 'occupation' && event.sourceCardId !== CARD_ID,
    )
    if (foodPaid <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: foodPaid }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterPayListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C116_FurnitureMaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Furniture Maker',
    deck: 'C',
    number: 116,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <WOOD>. Each time you play an occupation after this one, you get 1 <WOOD> for each <FOOD> paid as occupation cost.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C116_FurnitureMaker_impl = C116_FurnitureMaker.impl
