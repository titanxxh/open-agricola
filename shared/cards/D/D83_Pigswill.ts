import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D83_Pigswill } from '../../cards-display/D/D83_Pigswill'

const CARD_ID = D83_Pigswill.id

const listener: CardListenerRegistration = {
  id: 'D83-pigswill-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fencing') return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

export const D83_Pigswill_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
