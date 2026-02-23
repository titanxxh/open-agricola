import { Occupation } from '../types'

export const E93_Motivator = new Occupation({
  id: "E93_Motivator",
  name: "Motivator",
  deck: "E",
  number: 93,
  desc: ["On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply."],
  cost: {},
  players: "1+",
})
