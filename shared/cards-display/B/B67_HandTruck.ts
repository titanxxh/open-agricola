import { MinorImprovement } from '../types'

const CARD_ID = 'B67_HandTruck'

export const B67_HandTruck = new MinorImprovement({
  id: CARD_ID,
  name: "Hand Truck",
  deck: "B",
  number: 67,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you also get 1 <GRAIN> for each of your people occupying an accumulation space."],
  cost: {"wood":1},
})
