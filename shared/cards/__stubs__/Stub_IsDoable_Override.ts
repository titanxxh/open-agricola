import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_IsDoable_Override'

export const listener: CardListenerRegistration = {
  id: 'stub-isdoable-override',
  cardIds: [CARD_ID],
  phases: ['isDoable'],
  actions: ['day-laborer'],
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'observedCount')
    return { doable: true }
  },
}
