import { Occupation } from '../types'

export const E103_Wolf = new Occupation({
  id: "E103_Wolf",
  name: "Wolf",
  deck: "E",
  number: 103,
  desc: ["Pile (from bottom to top) 1 <CLAY>, 1 <WOOD>, and 1 <GRAIN> on this card. Each time you get a good matching the top item, you can move that item to your supply and get 1 <PIG>."],
  cost: {},
  players: "1+",
})
