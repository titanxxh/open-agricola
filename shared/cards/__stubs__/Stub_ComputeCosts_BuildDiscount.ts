import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_ComputeCosts_BuildDiscount'

export const listener: CardListenerRegistration = {
  id: 'stub-computecosts-build-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['construct'],
  handler: (context) => {
    incCounter(context.player, CARD_ID, 'observedCount')
    return { costs: { wood: -1 } }
  },
}
