import { MinorImprovement } from '../types'

const CARD_ID = 'C48_Farmstead'

export const C48_Farmstead = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmstead',
  deck: 'C',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: [
    'After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.',
  ],
  cost: {},
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
