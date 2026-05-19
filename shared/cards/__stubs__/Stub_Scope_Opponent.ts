import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_Scope_Opponent'

export const listener: CardListenerRegistration = {
  id: 'stub-scope-opponent',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect'],
  scope: 'opponent',
  handler: (context) => {
    const effectPlayer = context.effectPlayer ?? context.player
    incCounter(effectPlayer, CARD_ID, 'observedCount')
    effectPlayer.resources.food += 1
    return {
      sourceCard: CARD_ID,
    }
  },
}
