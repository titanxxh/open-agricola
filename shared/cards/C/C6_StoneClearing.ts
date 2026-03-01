import { MinorImprovement } from '../types'

export const C6_StoneClearing = new MinorImprovement({
  id: "C6_StoneClearing",
  name: "Stone Clearing",
  deck: "C",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <STONE> for every 2 unfenced farmyard spaces you have."],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
