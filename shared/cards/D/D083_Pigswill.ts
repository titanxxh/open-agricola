import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D083_Pigswill'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D083_Pigswill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pigswill',
    deck: 'D',
    number: 83,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use the __Fencing__ action space, you also get 1 <PIG>.'],
    altCosts: [{ food: 2 }, { grain: 1 }],
  },
  impl: cardImpl,
})

export const D083_Pigswill_impl = D083_Pigswill.impl
