import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E19_OxGoad'
const listener: CardListenerRegistration = {
  id: 'E19-ox-goad-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          { type: 'leaf', actionId: 'plow' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E19_OxGoad = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Ox Goad',
    deck: 'E',
    number: 19,
    category: 'FARMYARD_-_PLOWING',
    desc: ['Each time after you use the __Cattle Market__ accumulation space, you can pay 2 <FOOD> to plow 1 field.'],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const E19_OxGoad_impl = E19_OxGoad.impl
