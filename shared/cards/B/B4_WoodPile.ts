import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B4_WoodPile'

// BGA: gain wood equal to number of people on accumulation spaces.
// Simplified: grant 3 wood (average/typical value). TODO: count workers on accumulation spaces.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 3 }),
})

export const B4_WoodPile = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Pile",
  deck: "B",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <WOOD> equal to the number of people you have on accumulation spaces."],
  cost: { food: 2 },
  passing: true,
})
