import { Occupation } from '../types'

export const E112_GrainThief = new Occupation({
  id: "E112_GrainThief",
  name: "Grain Thief",
  deck: "E",
  number: 112,
  desc: ["Each time you would harvest a grain field, you can leave the grain on the field and take 1 <GRAIN> from the general supply instead."],
  cost: {},
  players: "1+",
})
