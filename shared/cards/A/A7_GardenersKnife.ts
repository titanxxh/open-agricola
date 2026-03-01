import { MinorImprovement } from '../types'

export const A7_GardenersKnife = new MinorImprovement({
  id: "A7_GardenersKnife",
  name: "Gardener's Knife",
  deck: "A",
  number: 7,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <GRAIN> from the general supply."],
  cost: { wood: 1 },
  passing: true,
})
