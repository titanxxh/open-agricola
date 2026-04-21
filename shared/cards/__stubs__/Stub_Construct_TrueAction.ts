import type { CardListenerRegistration } from '../card-listeners'
import { registerCardListener } from '../registry-ops'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_Construct_TrueAction'

export const listener: CardListenerRegistration = {
  id: 'stub-construct-true-action',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['construct'],
  handler: (context) => {
    if (context.trueAction === false) return
    incCounter(context.player, CARD_ID, 'observedCount')
  },
}

registerCardListener(listener)
