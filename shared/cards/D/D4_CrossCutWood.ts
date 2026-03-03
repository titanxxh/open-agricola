import { MinorImprovement } from '../types'
export const D4_CrossCutWood = new MinorImprovement({
  id: "D4_CrossCutWood",
  name: "Cross-Cut Wood",
  deck: "D",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <WOOD> equal to the number of <STONE> in your supply."],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
