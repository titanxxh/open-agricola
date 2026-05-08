import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B47_HerringPot } from '../../cards-display/B/B47_HerringPot'
export { B47_HerringPot }

const CARD_ID = B47_HerringPot.id

const listener: CardListenerRegistration = {
  id: 'B47-herring-pot-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const B47_HerringPot_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
