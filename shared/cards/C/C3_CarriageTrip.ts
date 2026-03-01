import { MinorImprovement } from '../types'

export const C3_CarriageTrip = new MinorImprovement({
  id: "C3_CarriageTrip",
  name: "Carriage Trip",
  deck: "C",
  number: 3,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 2 <WOOD>, 2 <CLAY>, 2 <REED>, 2 <STONE>, and 2 <FOOD>."],
  cost: { food: 3 },
  passing: true,
  implemented: false,
})
