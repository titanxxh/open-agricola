import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_A = 'Stub_Order_Low'
export const CARD_B = 'Stub_Order_High'

export const listenerA: CardListenerRegistration = {
  id: 'stub-order-low',
  cardIds: [CARD_A],
  phases: ['immediatelyAfter'],
  actions: ['collect'],
  order: 10,
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_A)) return
    incCounter(context.player, CARD_A, 'observedCount')
    return { sourceCard: CARD_A }
  },
}

export const listenerB: CardListenerRegistration = {
  id: 'stub-order-high',
  cardIds: [CARD_B],
  phases: ['immediatelyAfter'],
  actions: ['collect'],
  order: 20,
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_B)) return
    incCounter(context.player, CARD_B, 'observedCount')
    return { sourceCard: CARD_B }
  },
}
