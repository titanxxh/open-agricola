import { MinorImprovement } from '../types'

const CARD_ID = 'C7_BladeShears'

export const C7_BladeShears = new MinorImprovement({
  id: CARD_ID,
  name: "Blade Shears",
  deck: "C",
  number: 7,
  category: "FOOD_PROVIDER",
  desc: ["You immediately get your choice of 3 <FOOD>, or 1 <FOOD> for each sheep you have. (Keep the sheep.)"],
  cost: { wood: 1 },
  passing: true,
  prerequisite: "1 Pasture",
})
