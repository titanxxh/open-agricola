import { MinorImprovement } from '../types'

export const C9_AutomaticWaterTrough = new MinorImprovement({
  id: "C9_AutomaticWaterTrough",
  name: "Automatic Water Trough",
  deck: "C",
  number: 9,
  category: "LIVESTOCK_BREEDER",
  desc: ["Your animals can be kept in the stable and farmyard. (The stable has space for 3 animals of 1 type.)"],
  cost: { wood: 2, clay: 1 },
  passing: true,
})
