import { MinorImprovement } from '../types'
export const E7_Pumpernickel = new MinorImprovement({
  id: "E7_Pumpernickel",
  name: "Pumpernickel",
  deck: "E",
  number: 7,
  category: "COOKING",
  desc: ["You immediately get 4 <FOOD>. (Effectively, you are turning 1 <GRAIN> into 4 <FOOD>.)"],
  cost: { clay: 1 },
  passing: true,
  implemented: false,
})
