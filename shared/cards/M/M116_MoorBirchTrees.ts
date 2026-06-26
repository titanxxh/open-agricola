import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M116_MoorBirchTrees'

const listener: CardListenerRegistration = {
  id: 'M116-moor-birch-trees-after-cut-peat',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (_context: CardListenerContext): ActionHookResult | void => ({
    flow: gainLeaf(CARD_ID, { wood: 2 }),
    sourceCard: CARD_ID,
  }),
}

const cardImpl = {
  prerequisiteCheck: (player) => player.rooms >= 3,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M116_MoorBirchTrees = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Birch Trees",
    deck: "M",
    number: 116,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you also get 2 wood."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    prerequisite: "3 Rooms",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M116_MoorBirchTrees_impl = M116_MoorBirchTrees.impl
