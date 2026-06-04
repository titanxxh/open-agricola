import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B28_ForestryStudies'
const listener: CardListenerRegistration = {
  id: 'B28-forestry-studies-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { wood: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            params: { exactCost: {} },
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

export const B28_ForestryStudies = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Forestry Studies',
    deck: 'B',
    number: 28,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time after you use the __Forest__ accumulation space, you can return 2 <WOOD> to that space to play 1 occupation without paying an occupation costs.'],
    cost: { food: 2 },
  },
  impl: cardImpl,
})

export const B28_ForestryStudies_impl = B28_ForestryStudies.impl
