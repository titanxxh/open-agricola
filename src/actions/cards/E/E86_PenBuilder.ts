import { Occupation } from '../types'

export const E86_PenBuilder = new Occupation({
  id: "E86_PenBuilder",
  name: "Pen Builder",
  deck: "E",
  number: 86,
  desc: ["At any time, you can discard 1 <WOOD> from your supply. This card can hold two animals of any type for each <WOOD> discarded this way."],
  cost: {},
  players: "1+",
})
