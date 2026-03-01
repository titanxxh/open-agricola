import { MinorImprovement } from '../types'

export const B9_BeatingRod = new MinorImprovement({
  id: "B9_BeatingRod",
  name: "Beating Rod",
  deck: "B",
  number: 9,
  category: "LIVESTOCK_BREEDER",
  desc: ["Immediately take 1 <CATTLE> or 1 <BOAR> from the animal track. (You may take an animal that has run out.)"],
  cost: { wood: 1 },
  passing: true,
  implemented: false,
})
