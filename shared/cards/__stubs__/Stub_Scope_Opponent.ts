import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_Scope_Opponent'

export const listener: CardListenerRegistration = {
  id: 'stub-scope-opponent',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect'],
  scope: 'opponent',
  handler: (context) => {
    const effectPlayer = context.effectPlayer ?? context.player
    observe(effectPlayer, CARD_ID)
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 1, recipientPlayerId: effectPlayer.id } },
      sourceCard: CARD_ID,
    }
  },
}
