import { Occupation } from '../types'

export const B165_GameProvider = new Occupation({
  id: "B165_GameProvider",
  name: "Game Provider",
  deck: "B",
  number: 165,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Immediately before each harvest, you can discard 1/3/4 <GRAIN> from different fields to get 1/2/3 <PIG>."],
  cost: {},
  players: "4+",
})
