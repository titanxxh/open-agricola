import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_IsDoable_Override'

export const listener: CardListenerRegistration = {
  id: 'stub-isdoable-override',
  cardIds: [CARD_ID],
  phases: ['isDoable'],
  actions: ['day-laborer'],
  handler: (context) => {
    incCounter(context.player, CARD_ID, 'observedCount')
    return { doable: true }
  },
}
