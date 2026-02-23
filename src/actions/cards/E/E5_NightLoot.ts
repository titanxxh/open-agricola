import { MinorImprovement } from '../types'

export const E5_NightLoot = new MinorImprovement({
  id: "E5_NightLoot",
  name: "Night Loot",
  deck: "E",
  number: 5,
  desc: ["Immediately remove 2 different building resources total from accumulation spaces and place them in your supply."],
  cost: {"food":2},
  passing: true,
})
