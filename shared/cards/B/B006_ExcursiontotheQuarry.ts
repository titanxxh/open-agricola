import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B006_ExcursiontotheQuarry'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const farmers = familySize(player)
    if (farmers <= 0) return
    return gainLeaf(CARD_ID, { stone: farmers })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B006_ExcursiontotheQuarry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Excursion to the Quarry",
    deck: "B",
    number: 6,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["You immediately get a number of <STONE> equal to the number of people you have."],
    cost: { food: 2 },
    passing: true,
    prerequisite: "1 Occupation",
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const B006_ExcursiontotheQuarry_impl = B006_ExcursiontotheQuarry.impl
