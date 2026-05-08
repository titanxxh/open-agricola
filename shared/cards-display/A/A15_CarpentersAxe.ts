import { MinorImprovement } from '../types'

const CARD_ID = 'A15_CarpentersAxe'

export const A15_CarpentersAxe = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Axe",
  deck: 'A',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ["Each time after you use a wood accumulation space, if you then have at least 7 <WOOD> in your supply, you can build exactly 1 stable for 1 <WOOD>."],
  cost: { wood: 1 },
  newSet: true,
})
