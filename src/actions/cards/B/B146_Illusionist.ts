import { Occupation } from '../types'

export const B146_Illusionist = new Occupation({
  id: "B146_Illusionist",
  name: "Illusionist",
  deck: "B",
  number: 146,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you use a building resource accumulation space, you can discard exactly 1 card from your hand to get 1 additional building resource of the accumulating type."],
  cost: {},
  players: "3+",
})
