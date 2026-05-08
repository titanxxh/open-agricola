import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C45_Stew } from '../../cards-display/C/C45_Stew'
export { C45_Stew }

const CARD_ID = C45_Stew.id

const listener: CardListenerRegistration = {
  id: 'C45-stew-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 4,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const C45_Stew_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
