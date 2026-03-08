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
    incCounter(context.player, CARD_ID, 'triggerCount')
    context.player.resources.food += 1
    return {
      logKey: 'log.cardEffectGain',
      logParams: { cardId: CARD_ID, gain: '1 FOOD' },
      sourceCard: CARD_ID,
    }
  },
}
