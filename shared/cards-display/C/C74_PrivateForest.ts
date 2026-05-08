import { MinorImprovement } from '../types'

const CARD_ID = 'C74_PrivateForest'

export const C74_PrivateForest = new MinorImprovement({
  id: CARD_ID,
  name: "Private Forest",
  deck: "C",
  number: 74,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>."],
  cost: { food: 2 },
  prerequisite: "1 Occupation",
  occupationPrerequisites: { min: 1 },
})
