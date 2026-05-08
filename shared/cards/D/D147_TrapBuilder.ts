import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D147_TrapBuilder } from '../../cards-display/D/D147_TrapBuilder'
export { D147_TrapBuilder }

const CARD_ID = D147_TrapBuilder.id

const listener: CardListenerRegistration = {
  id: 'D147-trap-builder-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const round = context.state.round
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      entries: [
        { round: round + 1, resources: { food: 1 } },
        { round: round + 2, resources: { food: 1 } },
        { round: round + 3, resources: { boar: 1 } },
      ],
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const D147_TrapBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
