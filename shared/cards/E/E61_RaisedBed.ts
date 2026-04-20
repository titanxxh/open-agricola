import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E61_RaisedBed'

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

export const E61_RaisedBed_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 4 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
