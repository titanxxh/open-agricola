import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_After_GainFlow'

export const listener: CardListenerRegistration = {
  id: 'stub-after-gain-flow',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect'],
  handler: (context) => {
    if (context.space.id !== 'round-sheep-market') return
    incCounter(context.player, CARD_ID, 'observedCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      sourceCard: CARD_ID,
    }
  },
}
