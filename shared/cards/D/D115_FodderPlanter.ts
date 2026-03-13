import { Occupation } from '../types'

export const D115_FodderPlanter = new Occupation({
  id: "D115_FodderPlanter",
  name: "Fodder Planter",
  deck: "D",
  number: 115,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, for each newborn animal you get, you can sow crops in exactly 1 field."],
  cost: {},
  players: "1+",
})
