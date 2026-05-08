import { MinorImprovement } from '../types'

const CARD_ID = 'E2_RenovationMaterials'

export const E2_RenovationMaterials = new MinorImprovement({
  id: CARD_ID,
  name: 'Renovation Materials',
  deck: 'E',
  number: 2,
  category: 'PASSING_-_ACTION_-_FARMYARD',
  desc: ['Immediately renovate to clay at no cost. (You must pay the cost of this card though.)'],
  cost: { clay: 3, reed: 1 },
  passing: true,
  prerequisite: 'Wooden House',
})
