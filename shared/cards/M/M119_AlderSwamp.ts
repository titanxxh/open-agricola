import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { allImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M119_AlderSwamp'

const listener: CardListenerRegistration = {
  id: 'M119-alder-swamp-after-fell-trees',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fell-trees'],
  handler: (_context: CardListenerContext): ActionHookResult | void => ({
    flow: {
      type: 'xor',
      children: [
        gainLeaf(CARD_ID, { wood: 1 }),
        gainLeaf(CARD_ID, { reed: 1 }),
      ],
    },
    sourceCard: CARD_ID,
  }),
}

const cardImpl = {
  prerequisiteCheck: (player) => allImprovementCount(player) >= 2,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M119_AlderSwamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Alder Swamp",
    deck: "M",
    number: 119,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" special action, you also get your choice of 1 wood or 1 reed."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M119_AlderSwamp_impl = M119_AlderSwamp.impl
