import { MinorImprovement } from '../types'

const CARD_ID = 'E75_StoneAxe'

export const E75_StoneAxe = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Axe",
  deck: "E",
  number: 75,
  desc: ["Each time you use a wood accumulation space, you can return 1 <STONE> to the general supply to get an additional 3 <WOOD>."],
  cost: { wood: 1, clay: 1 },
  vp: 1,
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
