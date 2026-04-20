import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B6_ExcursiontotheQuarry'

export const B6_ExcursiontotheQuarry = new MinorImprovement({
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
})

export const B6_ExcursiontotheQuarry_impl = {
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
