import { MinorImprovement } from '../types'

export const E53_BoarSpear = new MinorImprovement({
  id: "E53_BoarSpear",
  name: "Boar Spear",
  deck: "E",
  number: 53,
  category: "FOOD",
  desc: ["Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each."],
  cost: {"wood":1,"stone":1},
})
