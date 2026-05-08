import { MinorImprovement } from '../types'

const CARD_ID = 'C79_StoneCart'

export const C79_StoneCart = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Cart",
  deck: "C",
  number: 79,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <STONE> on each remaining even-numbered round space. At the start of these rounds, you get the <STONE>."],
  cost: { wood: 2 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
