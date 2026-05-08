import { MinorImprovement } from '../types'

const CARD_ID = 'D79_CarrotMuseum'

export const D79_CarrotMuseum = new MinorImprovement({
  id: CARD_ID,
  name: "Carrot Museum",
  deck: "D",
  number: 79,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["At the end of rounds 8, 10, and 12, you get 1 <STONE> for each vegetable field you have and a number of <WOOD> equal to the number of <VEGETABLE> in your supply."],
  vp: 2,
  cost: { wood: 1, clay: 2 },
  prerequisite: "Play in Round 8 or Before",
})
