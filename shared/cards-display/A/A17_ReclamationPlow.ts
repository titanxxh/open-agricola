import { MinorImprovement } from '../types'

const CARD_ID = 'A17_ReclamationPlow'

export const A17_ReclamationPlow = new MinorImprovement({
  id: CARD_ID,
  name: "Reclamation Plow",
  deck: "A",
  number: 17,
  category: "FARM_PLANNER",
  desc: ["After the next time you take animals from an accumulation space and accommodate all of them on your farm, you can plow 1 field."],
  cost: {"wood":1},
})
