import { MinorImprovement } from '../types'
export const E9_BarteringHut = new MinorImprovement({
  id: "E9_BarteringHut",
  name: "Bartering Hut",
  deck: "E",
  number: 9,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["When you play this, you can exchange any number of <GRAIN> for <VEGETABLE> and vice versa. (You must not have the resources to do this.)"],
  cost: { wood: 2 },
  passing: true,
})
