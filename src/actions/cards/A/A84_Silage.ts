import { MinorImprovement } from '../types'

export const A84_Silage = new MinorImprovement({
  id: "A84_Silage",
  name: "Silage",
  deck: "A",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ["In each returning home phase after which there is no harvest, you can pay exactly 1 <GRAIN> - even from a field - to breed exactly one type of animal."],
  cost: {},
  prerequisite: "2 Fields",
})
