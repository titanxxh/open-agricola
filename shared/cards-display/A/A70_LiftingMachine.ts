import { MinorImprovement } from '../types'

export const A70_LiftingMachine = new MinorImprovement({
  id: "A70_LiftingMachine",
  name: "Lifting Machine",
  deck: "A",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ["At the end of each round that does not end with a harvest, you can move 1 <VEGETABLE> from one of your fields to your supply. (This is not considered a field phase.)"],
  cost: {"wood":1},
  prerequisite: "3 Fields",
})
