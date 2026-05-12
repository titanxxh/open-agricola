import { MinorImprovement } from '../types'

const CARD_ID = 'C58_Woodcraft'

export const C58_Woodcraft = new MinorImprovement({
  id: CARD_ID,
  name: 'Woodcraft',
  deck: 'C',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a wood accumulation space, if immediately afterward you have at most 5 <WOOD> in your supply, you get 1 <FOOD>.',
  ],
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
