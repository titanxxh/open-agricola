import { MinorImprovement } from '../types'
export const E3_TeaTime = new MinorImprovement({
  id: "E3_TeaTime",
  name: "Tea Time",
  deck: "E",
  number: 3,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["When you play this, each harvest, you get 1 <GRAIN> and 1 <VEGETABLE>."],
  cost: { food: 3 },
  passing: true,
  implemented: false,
})
