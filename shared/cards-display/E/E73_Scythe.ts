import { MinorImprovement } from '../types'

export const E73_Scythe = new MinorImprovement({
  id: "E73_Scythe",
  name: "Scythe",
  deck: "E",
  number: 73,
  desc: ["During the field phase of each harvest, you can select exactly one of your fields and harvest all the crops planted in it."],
  cost: {"wood":1},
  category: 'CROPS_-_GRAIN_AND_VEGETABLE',
})
