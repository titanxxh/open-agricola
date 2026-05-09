import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D73_SupplyBoat } from '../../cards-display/D/D73_SupplyBoat'

const CARD_ID = D73_SupplyBoat.id

const listener: CardListenerRegistration = {
  id: 'D73-supply-boat-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { grain: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 3 }, gain: { vegetable: 1 } }).flow!,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D73_SupplyBoat_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
