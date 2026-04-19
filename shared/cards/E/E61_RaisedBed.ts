import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E61_RaisedBed'

registerCardEffect({
  id: CARD_ID,
  onStartHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 4 })
  },
})

export const E61_RaisedBed = new MinorImprovement({
  id: CARD_ID,
  name: "Raised Bed",
  deck: "E",
  number: 61,
  category: "FOOD_PROVIDER",
  desc: ["At the start of each harvest, you get 4 <FOOD>."],
  vp: 1,
  cost: { clay: 2, stone: 2 },
  prerequisite: "2 Grain Fields",
})
