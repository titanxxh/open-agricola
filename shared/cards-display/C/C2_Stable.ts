import { MinorImprovement } from '../types'

const CARD_ID = 'C2_Stable'

export const C2_Stable = new MinorImprovement({
  id: CARD_ID,
  name: "Stable",
  deck: "C",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["Immediately build 1 stable. (The stable costs you nothing, but you must pay the cost shown on this card.)"],
  cost: { wood: 1 },
  passing: true,
})
