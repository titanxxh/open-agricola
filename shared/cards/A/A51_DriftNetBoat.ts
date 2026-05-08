import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A51_DriftNetBoat } from '../../cards-display/A/A51_DriftNetBoat'
export { A51_DriftNetBoat }

const CARD_ID = A51_DriftNetBoat.id

const listener: CardListenerRegistration = {
  id: 'A51-drift-net-boat-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const A51_DriftNetBoat_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
