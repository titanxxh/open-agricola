import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode, removeFutureMeeples } from '../../actions/effects/internal/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B76_Ceilings } from '../../cards-display/B/B76_Ceilings'

const CARD_ID = B76_Ceilings.id

const listener: CardListenerRegistration = {
  id: 'B76-ceilings-after-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    removeFutureMeeples(context.state, {
      playerId: context.player.id,
      cardId: CARD_ID,
    })
    setCardFlag(context.player, CARD_ID, true)
  },
}

export const B76_Ceilings_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { wood: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
