import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D101_SugarBaker } from '../../cards-display/D/D101_SugarBaker'
export { D101_SugarBaker }

const CARD_ID = D101_SugarBaker.id

const listener: CardListenerRegistration = {
  id: 'D101-sugar-baker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { score: 1 },
    })
  },
}

export const D101_SugarBaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
