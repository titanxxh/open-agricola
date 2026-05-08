import { MinorImprovement } from '../types'

const CARD_ID = 'E61_RaisedBed'

export const E61_RaisedBed = new MinorImprovement({
  id: CARD_ID,
  name: "Raised Bed",
  deck: "E",
  number: 61,
  category: "FOOD_-_GRAIN",
  desc: ["At the start of each harvest, you get 4 <FOOD>."],
  vp: 1,
  cost: { clay: 2, stone: 2 },
  prerequisite: "2 Grain Fields",
})
