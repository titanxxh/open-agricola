import { MinorImprovement } from '../types'

const CARD_ID = 'A13_RenovationCompany'

export const A13_RenovationCompany = new MinorImprovement({
  id: CARD_ID,
  name: 'Renovation Company',
  deck: 'A',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you immediately get 3 <CLAY>. Immediately after, you can renovate without paying any building resources.'],
  cost: { wood: 4 },
  prerequisite: 'In Wooden House with Exactly 2 Rooms',
})
