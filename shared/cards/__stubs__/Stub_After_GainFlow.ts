import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_After_GainFlow'

export const listener: CardListenerRegistration = {
  id: 'stub-after-gain-flow',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect'],
  handler: (context) => {
    if (context.space.id !== 'round-sheep-market') return
    observe(context.player, CARD_ID)
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      sourceCard: CARD_ID,
    }
  },
}
