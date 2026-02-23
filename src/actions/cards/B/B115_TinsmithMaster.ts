import { Occupation } from '../types'

export const B115_TinsmithMaster = new Occupation({
  id: "B115_TinsmithMaster",
  name: "Tinsmith Master",
  deck: "B",
  number: 115,
  category: "CROP_PROVIDER",
  desc: ["You can hold 1 additional animal in each pasture without a stable. Each time you sow in a field, you can place 1 additional crop of the respective type in that field."],
  cost: {},
  players: "1+",
})
