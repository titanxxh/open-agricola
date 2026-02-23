import { Occupation } from '../types'

export const D85_Reader = new Occupation({
  id: "D85_Reader",
  name: "Reader",
  deck: "D",
  number: 85,
  category: "FARM_PLANNER",
  desc: ["As soon as you have 6 (__7 in draft mode__) occupations in front of you (including this one), this cards provides room for one person."],
  cost: {},
  players: "1+",
})
