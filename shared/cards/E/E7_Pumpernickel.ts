import { MinorImprovement } from '../types'
export const E7_Pumpernickel = new MinorImprovement({
  id: "E7_Pumpernickel",
  name: "Pumpernickel",
  deck: "E",
  number: 7,
  category: "COOKING",
  desc: ["When you take this, immediately bake 3 <GRAIN> into 10 <FOOD>."],
  cost: { clay: 1 },
  passing: true,
  implemented: false,
})
