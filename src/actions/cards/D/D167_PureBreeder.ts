import { Occupation } from '../types'

export const D167_PureBreeder = new Occupation({
  id: "D167_PureBreeder",
  name: "Pure Breeder",
  deck: "D",
  number: 167,
  category: "LIVESTOCK_PROVIDER",
  desc: ["You immediately get 1 <WOOD>. After each round that does not end with a harvest, you can breed exactly one type of animal. (This is not considered a breeding phase.)"],
  cost: {},
  players: "4+",
  newSet: true,
})
