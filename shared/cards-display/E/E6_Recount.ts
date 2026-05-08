import { MinorImprovement } from '../types'

const CARD_ID = 'E6_Recount'

export const E6_Recount = new MinorImprovement({
  id: CARD_ID,
  name: 'Recount',
  deck: 'E',
  number: 6,
  category: 'PASSING_-_BUILDING_RESOURCES_',
  desc: ['You immediately get 1 building resource of each type of which you have 4 or more resources in your supply already.'],
  passing: true,
})
