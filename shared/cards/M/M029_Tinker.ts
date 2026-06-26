import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { hasCraftBuilding, majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M029_Tinker'

const cardImpl = {
  prerequisiteCheck: (player) =>
    majorImprovementCount(player) >= 3 && hasCraftBuilding(player),
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1, reed: 1, stone: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M029_Tinker = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tinker",
    deck: "M",
    number: 29,
    category: "ACTIONS_BOOSTER",
    desc: [
        "If you have at least one of the \"Joinery\", \"Pottery\", or \"Basketmaker's Workshop\" major improvements, you immediately get 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE>."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "3 Major Improvements",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M029_Tinker_impl = M029_Tinker.impl
