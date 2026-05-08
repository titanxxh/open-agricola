import { MinorImprovement } from '../types'

const CARD_ID = 'C34_ElephantgrassPlant'

export const C34_ElephantgrassPlant = new MinorImprovement({
  id: CARD_ID,
  name: "Elephantgrass Plant",
  deck: "C",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: ["Immediately after each harvest, you can use this card to exchange exactly 1 <REED> for 1 bonus <SCORE>."],
  cost: { clay: 2, stone: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
