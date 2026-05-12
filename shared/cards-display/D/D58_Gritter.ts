import { MinorImprovement } from '../types'

const CARD_ID = 'D58_Gritter'

export const D58_Gritter = new MinorImprovement({
  id: CARD_ID,
  name: 'Gritter',
  deck: 'D',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'At the end of each action in which you sow vegetables in a field, you get 1 <FOOD> for each vegetable field you have (including the new ones).',
  ],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 5 or Later',
})
