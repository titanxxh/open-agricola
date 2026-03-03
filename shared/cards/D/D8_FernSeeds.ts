import { MinorImprovement } from '../types'
export const D8_FernSeeds = new MinorImprovement({
  id: "D8_FernSeeds",
  name: "Fern Seeds",
  deck: "D",
  number: 8,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You get 2 <FOOD> and 1 <GRAIN>, which you must sow immediately."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
