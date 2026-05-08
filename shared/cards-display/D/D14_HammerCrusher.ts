import { MinorImprovement } from '../types'

const CARD_ID = 'D14_HammerCrusher'

export const D14_HammerCrusher = new MinorImprovement({
  id: CARD_ID,
  name: "Hammer Crusher",
  deck: "D",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Immediately before you renovate to stone, you get 2 <CLAY> and 1 <REED> and you can take a __Build Rooms__ action."],
  cost: {"wood":1},
})
