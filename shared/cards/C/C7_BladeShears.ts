import { MinorImprovement } from '../types'

export const C7_BladeShears = new MinorImprovement({
  id: "C7_BladeShears",
  name: "Blade Shears",
  deck: "C",
  number: 7,
  category: "LIVESTOCK_BREEDER",
  desc: ["You immediately get your choice of 3 <FOOD>, or 1 <FOOD> for each sheep you have. (Keep the sheep.)"],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
