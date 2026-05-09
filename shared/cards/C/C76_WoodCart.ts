import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C76_WoodCart } from '../../cards-display/C/C76_WoodCart'

const CARD_ID = C76_WoodCart.id

const isWoodAccumulationSpace = (context: CardListenerContext): boolean =>
  (context.space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'C76-wood-cart-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context)) return
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

export const C76_WoodCart_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
