import { MinorImprovement } from '../types'

const CARD_ID = 'C78_ReedHattedToad'

export const C78_ReedHattedToad = new MinorImprovement({
  id: CARD_ID,
  name: "Reed-Hatted Toad",
  deck: "C",
  number: 78,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Add 5, 7, 9, 11, and 13 to the current round and place 1 <REED> on each corresponding round space. At the start of these rounds, you get the <REED>."],
  cost: { food: 1 },
})
