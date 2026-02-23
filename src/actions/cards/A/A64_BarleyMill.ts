import { MinorImprovement } from '../types'

export const A64_BarleyMill = new MinorImprovement({
  id: "A64_BarleyMill",
  name: "Barley Mill",
  deck: "A",
  number: 64,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for each grain field that you harvest."],
  cost: {},
})
