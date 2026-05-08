import { MinorImprovement } from '../types'

const CARD_ID = 'C77_ClaySupply'

export const C77_ClaySupply = new MinorImprovement({
  id: CARD_ID,
  name: "Clay Supply",
  deck: "C",
  number: 77,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <CLAY> on each of the next 3 round spaces. At the start of these rounds, you get the <CLAY>."],
  cost: { food: 1 },
})
