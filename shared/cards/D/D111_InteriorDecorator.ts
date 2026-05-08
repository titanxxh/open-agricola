import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D111_InteriorDecorator } from '../../cards-display/D/D111_InteriorDecorator'
export { D111_InteriorDecorator }

const CARD_ID = D111_InteriorDecorator.id

const listener: CardListenerRegistration = {
  id: 'D111-interior-decorator-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      sourceCard: CARD_ID,
    }
  },
}

export const D111_InteriorDecorator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
