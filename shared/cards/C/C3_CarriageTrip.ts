import { MinorImprovement } from '../types'

export const C3_CarriageTrip = new MinorImprovement({
  id: "C3_CarriageTrip",
  name: "Carriage Trip",
  deck: "C",
  number: 3,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["If you play this card in the work phase, you can immediately place another person."],
  cost: { food: 3 },
  passing: true,
  implemented: false,
})
