import { MinorImprovement } from '../types'

export const B9_BeatingRod = new MinorImprovement({
  id: "B9_BeatingRod",
  name: "Beating Rod",
  deck: "B",
  number: 9,
  category: "LIVESTOCK_BREEDER",
  desc: ["You can immediately choose to either get 1 <REED> or exchange 1 <REED> for 1 <CATTLE>."],
  cost: { wood: 1 },
  passing: true,
  implemented: false,
})
