import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

export const CARD_ID = 'Stub_ImmediatelyAfter_GainFlow'

export const listener: CardListenerRegistration = {
  id: 'stub-immediately-after-gain-flow',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter'],
  actions: ['collect'],
  handler: (context) => {
    if (context.space.id !== 'common-forest') return
    observe(context.player, CARD_ID)
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      sourceCard: CARD_ID,
    }
  },
}
