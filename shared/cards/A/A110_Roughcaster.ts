import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A110_Roughcaster } from '../../cards-display/A/A110_Roughcaster'
export { A110_Roughcaster }

const CARD_ID = A110_Roughcaster.id

const constructListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const renovateListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

export const A110_Roughcaster_impl = {
  listeners: [constructListener, renovateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
