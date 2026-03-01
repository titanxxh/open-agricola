import { MinorImprovement } from '../types'

export const A9_YoungAnimalMarket = new MinorImprovement({
  id: "A9_YoungAnimalMarket",
  name: "Young Animal Market",
  deck: "A",
  number: 9,
  category: "LIVESTOCK_BREEDER",
  desc: ["Immediately take 1 <SHEEP> or 1 <BOAR> from the animal track. (You may take an animal that has run out.)"],
  cost: {},
  passing: true,
})
