import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import { getFenceCount, maxFences } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { A34_Loppers } from '../../cards-display/A/A34_Loppers'

const CARD_ID = A34_Loppers.id

const listener: CardListenerRegistration = {
  id: 'A34-loppers-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getFenceCount(context.player) >= maxFences) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

export const A34_Loppers_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
