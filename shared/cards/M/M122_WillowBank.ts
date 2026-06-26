import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M122_WillowBank'

const listener: CardListenerRegistration = {
  id: 'M122-willow-bank-after-fell-trees',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fell-trees'],
  handler: (_context: CardListenerContext): ActionHookResult | void => ({
    flow: gainLeaf(CARD_ID, { reed: 1 }),
    sourceCard: CARD_ID,
  }),
}

const cardImpl = {
  prerequisiteCheck: (player) => majorImprovementCount(player) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M122_WillowBank = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Willow Bank",
    deck: "M",
    number: 122,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" special action, you also get 1 reed."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M122_WillowBank_impl = M122_WillowBank.impl
