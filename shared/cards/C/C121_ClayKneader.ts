import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C121_ClayKneader } from '../../cards-display/C/C121_ClayKneader'
export { C121_ClayKneader }

const CARD_ID = C121_ClayKneader.id

const listener: CardListenerRegistration = {
  id: 'C121-clay-kneader-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds' && context.space?.id !== 'vegetable-seeds') return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

export const C121_ClayKneader_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
