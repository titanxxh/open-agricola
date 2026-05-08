import { MinorImprovement } from '../types'

const CARD_ID = 'C76_WoodCart'

export const C76_WoodCart = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Cart',
  deck: 'C',
  number: 76,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use a wood accumulation space, you get 2 additional <WOOD>.'],
  cost: { wood: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
