import { MinorImprovement } from '../types'

const CARD_ID = 'B55_MaintenancePremium'

export const B55_MaintenancePremium = new MinorImprovement({
  id: CARD_ID,
  name: 'Maintenance Premium',
  deck: 'B',
  number: 55,
  category: 'FOOD_PROVIDER',
  desc: ['Place 3 <FOOD> on this card. Each time you use a wood accumulation space, you get 1 <FOOD> from this card. Each time you renovate restock this card to 3 <FOOD>.'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
