import type { CardListenerRegistration } from '../card-listeners'
import { incCounter } from './helpers'

const CARD_ID = 'Stub_AfterAction_OptionalConstruct'

export const listener: CardListenerRegistration = {
  id: 'stub-after-action-optional-construct',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['plow'],
  handler: (context) => {
    incCounter(context.player, CARD_ID, 'observedCount')
    return {
      flow: { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.optionalBuildRoom' },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'construct' },
      sourceCard: CARD_ID,
    }
  },
}
