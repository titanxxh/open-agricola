import { Occupation } from '../types'

export const C88_CarpentersApprentice = new Occupation({
  id: "C88_CarpentersApprentice",
  name: "Carpenter's Apprentice",
  deck: "C",
  number: 88,
  category: "FARM_PLANNER",
  desc: ["Wood rooms cost you 2 <WOOD> less. Your 3rd and 4th stable each cost you 1 <WOOD> less. Your 13th to 15th fence each cost you nothing."],
  cost: {},
  players: "1+",
})
