import { MinorImprovement } from '../types'

export const A79_GardenHoe = new MinorImprovement({
  id: "A79_GardenHoe",
  name: "Garden Hoe",
  deck: "A",
  number: 79,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you take an unconditional __Sow__ action planting <VEGETABLE> in at least 1 field, you get 1 <CLAY> and 1 <STONE>."],
  cost: {"wood":1},
  newSet: true,
})
