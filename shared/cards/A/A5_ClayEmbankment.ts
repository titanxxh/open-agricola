import { MinorImprovement } from '../types'

export const A5_ClayEmbankment = new MinorImprovement({
  id: "A5_ClayEmbankment",
  name: "Clay Embankment",
  deck: "A",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for every 2 <CLAY> you already have in your supply."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
