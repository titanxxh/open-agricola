import { MinorImprovement } from '../types'
export const D4_CrossCutWood = new MinorImprovement({
  id: "D4_CrossCutWood",
  name: "Cross-Cut Wood",
  deck: "D",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["If you have a Clay/Stone Oven, Cooking Hearth, Stone Oven, Pottery, or Basketmaker's Workshop, you you you immediately get 1 <WOOD>."],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
