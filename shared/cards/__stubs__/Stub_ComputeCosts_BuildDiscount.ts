import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_ComputeCosts_BuildDiscount'

export const listener: CardListenerRegistration = {
  id: 'stub-computecosts-build-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['construct'],
  handler: (context) => {
    observe(context.player, CARD_ID)
    return { costs: { wood: -1 } }
  },
}
