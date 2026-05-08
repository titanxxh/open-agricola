import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D109_SowingMaster } from '../../cards-display/D/D109_SowingMaster'

const CARD_ID = D109_SowingMaster.id

const listener: CardListenerRegistration = {
  id: 'D109-sowing-master-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization' && context.space?.id !== 'cultivation') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const D109_SowingMaster_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
