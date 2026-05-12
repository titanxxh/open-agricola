import { Occupation } from '../types'

export const A126_MasterWorkman = new Occupation({
  id: "A126_MasterWorkman",
  name: "Master Workman",
  deck: "A",
  number: 126,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you use an action space card on round spaces 1/2/3/4, you get 1 <WOOD>/<CLAY>/<REED>/<STONE>."],
  cost: {},
  players: "1+",
})
