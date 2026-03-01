import { MinorImprovement } from '../types'

export const C7_BladeShears = new MinorImprovement({
  id: "C7_BladeShears",
  name: "Blade Shears",
  deck: "C",
  number: 7,
  category: "LIVESTOCK_BREEDER",
  desc: ["Immediately shear 1 <SHEEP> for 1 <FOOD> or 1 <CATTLE> for 3 <FOOD>."],
  cost: { food: 1 },
  passing: true,
})
