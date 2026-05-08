import { MinorImprovement } from '../types'

const CARD_ID = 'E84_DollysMother'

export const E84_DollysMother = new MinorImprovement({
  id: CARD_ID,
  name: "Dolly's Mother",
  deck: "E",
  number: 84,
  desc: ["You only require 1 <SHEEP> to breed sheep during the breeding phase of a harvest. This card can hold 1 <SHEEP>."],
  cost: {},
  vp: 1,
  prerequisite: "1 Sheep",
})
