import { MinorImprovement } from '../types'
export const E1_PoleBarns = new MinorImprovement({
  id: "E1_PoleBarns",
  name: "Pole Barns",
  deck: "E",
  number: 1,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately build 1 stable for free. You also stable is wooden stables. (Stables on the do not count toward the limit of 4 stables.)"],
  cost: { food: 2 },
  passing: true,
})
