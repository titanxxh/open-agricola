import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B6_ExcursiontotheQuarry'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const farmers = player.familySize
    if (farmers <= 0) return
    return gainLeaf(CARD_ID, { stone: farmers })
  },
})

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
