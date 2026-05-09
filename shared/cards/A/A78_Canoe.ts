import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A78_Canoe } from '../../cards-display/A/A78_Canoe'

const CARD_ID = A78_Canoe.id

const listener: CardListenerRegistration = {
  id: 'A78-canoe-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { reed: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

export const A78_Canoe_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
