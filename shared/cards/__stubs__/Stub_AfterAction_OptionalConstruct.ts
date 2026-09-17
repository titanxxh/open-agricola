import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

const CARD_ID = 'Stub_AfterAction_OptionalConstruct'

export const listener: CardListenerRegistration = {
  id: 'stub-after-action-optional-construct',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['plow'],
  handler: (context) => {
    observe(context.player, CARD_ID)
    return {
      flow: { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.optionalBuildRoom' },
      sourceCard: CARD_ID,
    }
  },
}
