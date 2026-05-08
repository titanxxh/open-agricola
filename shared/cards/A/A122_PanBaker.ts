import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A122_PanBaker } from '../../cards-display/A/A122_PanBaker'
export { A122_PanBaker }

const CARD_ID = A122_PanBaker.id

const listener: CardListenerRegistration = {
  id: 'A122-pan-baker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'grain-utilization') return
    return { flow: gainLeaf(CARD_ID, { clay: 2, wood: 1 }), sourceCard: CARD_ID }
  },
}

export const A122_PanBaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
