import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_ComputeCosts_BuildDiscount'

export const listener: CardListenerRegistration = {
  id: 'stub-computecosts-build-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['construct'],
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return { costs: { wood: -1 } }
  },
}
