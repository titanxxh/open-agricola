import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_IsDoable_Override'

export const listener: CardListenerRegistration = {
  id: 'stub-isdoable-override',
  cardIds: [CARD_ID],
  phases: ['isDoable'],
  actions: ['gain'],
  handler: (context) => {
    observe(context.player, CARD_ID)
    return { doable: true }
  },
}
