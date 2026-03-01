import { MinorImprovement } from '../types'

export const A4_Baseboards = new MinorImprovement({
  id: "A4_Baseboards",
  name: "Baseboards",
  deck: "A",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>."],
  cost: { food: 2, grain: 1 },
  passing: true,
})
