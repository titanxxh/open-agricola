import { MinorImprovement } from '../types'
export const D8_FernSeeds = new MinorImprovement({
  id: "D8_FernSeeds",
  name: "Fern Seeds",
  deck: "D",
  number: 8,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <GRAIN> for each empty field you have."],
  cost: { food: 1 },
  passing: true,
})
