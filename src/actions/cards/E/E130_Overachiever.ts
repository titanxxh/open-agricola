import { Occupation } from '../types'

export const E130_Overachiever = new Occupation({
  id: "E130_Overachiever",
  name: "Overachiever",
  deck: "E",
  number: 130,
  desc: ["Each time you use a __Wish for Children__ action space, you can play 1 additional improvement by paying its cost minus 1 resource of your choice."],
  cost: {},
  players: "3+",
})
