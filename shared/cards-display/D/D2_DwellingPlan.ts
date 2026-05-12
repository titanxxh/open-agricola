import { MinorImprovement } from '../types'

const CARD_ID = 'D2_DwellingPlan'

export const D2_DwellingPlan = new MinorImprovement({
  id: CARD_ID,
  name: 'Dwelling Plan',
  deck: 'D',
  number: 2,
  category: 'FARM_PLANNER',
  desc: ['You can immediately take a __Renovation__ action.'],
  cost: { food: 1 },
  passing: true,
})
