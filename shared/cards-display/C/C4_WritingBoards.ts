import { MinorImprovement } from '../types'

const CARD_ID = 'C4_WritingBoards'

export const C4_WritingBoards = new MinorImprovement({
  id: CARD_ID,
  name: "Writing Boards",
  deck: "C",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <WOOD> for each occupation you have in front of you."],
  cost: { food: 1 },
  passing: true,
})
