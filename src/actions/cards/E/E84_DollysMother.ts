import { MinorImprovement } from '../types'

export const E84_DollysMother = new MinorImprovement({
  id: "E84_DollysMother",
  name: "Dolly's Mother",
  deck: "E",
  number: 84,
  desc: ["You only require 1 <SHEEP> to breed sheep during the breeding phase of a harvest. This card can hold 1 <SHEEP>."],
  cost: {},
  prerequisite: "1 Sheep",
})
