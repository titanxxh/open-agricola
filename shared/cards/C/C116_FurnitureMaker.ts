import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumResourcePaid } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C116_FurnitureMaker } from '../../cards-display/C/C116_FurnitureMaker'

const CARD_ID = C116_FurnitureMaker.id

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

export const C116_FurnitureMaker_impl = {
  listeners: [afterPayListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
