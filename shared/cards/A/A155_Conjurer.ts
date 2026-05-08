import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A155_Conjurer } from '../../cards-display/A/A155_Conjurer'
export { A155_Conjurer }

const CARD_ID = A155_Conjurer.id

const listener: CardListenerRegistration = {
  id: 'A155-conjurer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'traveling-players') return
    return { flow: gainLeaf(CARD_ID, { wood: 1, grain: 1 }), sourceCard: CARD_ID }
  },
}

export const A155_Conjurer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
