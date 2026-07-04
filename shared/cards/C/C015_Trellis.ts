import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C015_Trellis'
const listener: CardListenerRegistration = {
  id: 'C15-trellis-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
          },
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

export const C015_Trellis = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Trellis',
    deck: 'C',
    number: 15,
    category: 'FARM_PLANNER',
    desc: ['Each time before you use the __Pig Market__ accumulation space, you can take a __Build Fences__ action. (You must pay <WOOD> for the <FENCE> as usual.)'],
    cost: {},
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const C015_Trellis_impl = C015_Trellis.impl
