import { MinorImprovement } from '../types'

export const E36_HerbalGarden = new MinorImprovement({
  id: "E36_HerbalGarden",
  name: "Herbal Garden",
  deck: "E",
  number: 36,
  desc: ["From now on, at least one of your pastures must contain no animals."],
  cost: {"wood":1},
  prerequisite: "1 Pasture",
})
