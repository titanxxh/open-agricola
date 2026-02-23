import { MinorImprovement } from '../types'

export const B67_HandTruck = new MinorImprovement({
  id: "B67_HandTruck",
  name: "Hand Truck",
  deck: "B",
  number: 67,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you also get 1 <GRAIN> for each of your people occupying an accumulation space."],
  cost: {"wood":1},
  newSet: true,
})
