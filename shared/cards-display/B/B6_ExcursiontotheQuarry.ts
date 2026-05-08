import { MinorImprovement } from '../types'

const CARD_ID = 'B6_ExcursiontotheQuarry'

export const B6_ExcursiontotheQuarry = new MinorImprovement({
  id: CARD_ID,
  name: "Excursion to the Quarry",
  deck: "B",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <STONE> equal to the number of people you have."],
  cost: { food: 2 },
  passing: true,
  prerequisite: "1 Occupation",
  occupationPrerequisites: { min: 1 },
})
