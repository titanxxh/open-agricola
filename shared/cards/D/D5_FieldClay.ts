import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D5_FieldClay'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const plantedCount = player.fields.filter((f) => f.crop !== null).length
    if (plantedCount > 0) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { clay: plantedCount })] }
    }
  },
})

export const D5_FieldClay = new MinorImprovement({
  id: CARD_ID,
  name: "Field Clay",
  deck: "D",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each planted field you have."],
  cost: { food: 1 },
  passing: true,
  prerequisite: "1 Planted Field",
})
