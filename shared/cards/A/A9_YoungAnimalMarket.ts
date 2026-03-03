import { MinorImprovement } from '../types'

export const A9_YoungAnimalMarket = new MinorImprovement({
  id: "A9_YoungAnimalMarket",
  name: "Young Animal Market",
  deck: "A",
  number: 9,
  category: "LIVESTOCK_BREEDER",
  desc: ["You immediately get 1 <CATTLE>. (Effectively, you are exchanging 1 <SHEEP> for 1 <CATTLE>.)"],
  cost: {},
  passing: true,
  implemented: false,
})
