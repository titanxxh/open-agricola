import { MinorImprovement } from '../types'

const CARD_ID = 'E17_SkimmerPlow'

export const E17_SkimmerPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Skimmer Plow',
  deck: 'E',
  number: 17,
  category: 'FARMYARD_-_PLOWING',
  desc: ['Each time you use the __Farmland__ or __Cultivation__  action space, you can plow 2 fields instead of 1. Each time you sow, you must place 1 fewer good on each field you sow.'],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
