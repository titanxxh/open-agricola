import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M122_WillowBank'

const cardImpl = {
  prerequisiteCheck: (player) => majorImprovementCount(player) >= 1,
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
    moorSpecialActionBonuses: [
      { actionId: 'fell-trees', resource: 'reed', amount: 1 },
    ],
  },
  impl: cardImpl,
})

export const M122_WillowBank_impl = M122_WillowBank.impl
