import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

export const CARD_ID = 'Stub_ImmediatelyAfter_GainFlow'

export const listener: CardListenerRegistration = {
  id: 'stub-immediately-after-gain-flow',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter'],
  actions: ['collect'],
  handler: (context) => {
    if (context.space.id !== 'common-forest') return
    incCounter(context.player, CARD_ID, 'observedCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'gain' },
      sourceCard: CARD_ID,
    }
  },
}
