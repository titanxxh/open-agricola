import { MinorImprovement } from '../types'

const CARD_ID = 'E19_OxGoad'

export const E19_OxGoad = new MinorImprovement({
  id: CARD_ID,
  name: 'Ox Goad',
  deck: 'E',
  number: 19,
  category: 'FARMYARD_-_PLOWING',
  desc: ['Each time after you use the __Cattle Market__ accumulation space, you can pay 2 <FOOD> to plow 1 field.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
