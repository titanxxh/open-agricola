import { MinorImprovement } from '../types'

const CARD_ID = 'E48_TownHall'

export const E48_TownHall = new MinorImprovement({
  id: CARD_ID,
  name: "Town Hall",
  deck: "E",
  number: 48,
  category: "FOOD",
  desc: ["In the feeding phase of each harvest, if you live in a clay or stone house, you get 1 or 2 <FOOD>, respectively."],
  vp: 2,
  cost: { wood: 2, clay: 2 },
})
